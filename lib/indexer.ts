import { getAddress, type Log } from "viem";
import { getClient, findBlockByTimestamp, UNIV2_ABI } from "./chain";
import { getDb, getSetting, logIndex, setSetting } from "./db";
import { getChzPrice, getFreshChzPrice } from "./prices";
import { mergeFlowsByIdentity, scoreWindow, type WalletFlow } from "./scoring";
import { FACTORY, WCHZ, TOKENS, PAIR_OVERRIDES, LOG_CHUNK_BLOCKS } from "./tokens";
import { MAKER_COOLDOWN_S } from "./config";
import type { MatchRow } from "./queries";

/**
 * Map each wallet to its scoring key — the identity's primary address if it
 * belongs to a KYC group, else the address itself. Only wallets with a non-null
 * identity_id are remapped; everything else scores solo.
 */
function resolveIdentities(db: ReturnType<typeof getDb>, addresses: string[]): Map<string, string> {
  const map = new Map<string, string>();
  const CHUNK = 400; // stay well under SQLite's bound-variable ceiling
  for (let i = 0; i < addresses.length; i += CHUNK) {
    const batch = addresses.slice(i, i + CHUNK);
    if (batch.length === 0) continue;
    const rows = db
      .prepare(
        `SELECT address, identity_id FROM wallets
          WHERE identity_id IS NOT NULL AND address IN (${batch.map(() => "?").join(",")})`
      )
      .all(...batch) as { address: string; identity_id: string }[];
    for (const r of rows) map.set(r.address, r.identity_id);
  }
  return map;
}

interface PairInfo {
  symbol: string;
  pair: `0x${string}`;
  wchzIsToken0: boolean;
}

const pairCache = new Map<string, PairInfo | null>();

/**
 * txHash → EOA sender, shared across scoring runs. Provisional re-scores hit
 * the same window repeatedly; without this every tick would refetch thousands
 * of transactions.
 */
const txSenderCache = new Map<string, string>();

async function resolvePair(symbol: string): Promise<PairInfo | null> {
  if (pairCache.has(symbol)) return pairCache.get(symbol) ?? null;
  const client = getClient();

  let pair = PAIR_OVERRIDES[symbol];
  if (!pair) {
    const stored = getSetting(`pair_${symbol}`);
    if (stored) pair = stored as `0x${string}`;
  }
  if (!pair) {
    const token = TOKENS[symbol];
    if (!token) {
      pairCache.set(symbol, null);
      return null;
    }
    const found = (await client.readContract({
      address: FACTORY,
      abi: UNIV2_ABI,
      functionName: "getPair",
      args: [token.address, WCHZ],
    })) as `0x${string}`;
    if (found === "0x0000000000000000000000000000000000000000") {
      pairCache.set(symbol, null);
      return null;
    }
    pair = found;
    setSetting(`pair_${symbol}`, pair);
  }

  const token0 = (await client.readContract({
    address: pair,
    abi: UNIV2_ABI,
    functionName: "token0",
  })) as `0x${string}`;
  const info: PairInfo = {
    symbol,
    pair,
    wchzIsToken0: getAddress(token0) === getAddress(WCHZ),
  };
  pairCache.set(symbol, info);
  return info;
}

interface RawFlow {
  buyWei: bigint;
  sellWei: bigint;
  addWei: bigint;
  removeWei: bigint;
  /** Net fan-token wei held from swaps this window (bought − sold), across all match tokens. */
  tokenNetWeiByPair: Map<string, bigint>;
  swaps: number;
}

async function sendersFor(
  logs: Log[],
  cache: Map<string, string>
): Promise<Map<string, string>> {
  const client = getClient();
  const hashes = [...new Set(logs.map((l) => l.transactionHash!))].filter((h) => !cache.has(h));
  const CONCURRENCY = 8;
  for (let i = 0; i < hashes.length; i += CONCURRENCY) {
    const batch = hashes.slice(i, i + CONCURRENCY);
    const txs = await Promise.all(batch.map((hash) => client.getTransaction({ hash: hash as `0x${string}` })));
    txs.forEach((tx, j) => cache.set(batch[j], tx.from.toLowerCase()));
  }
  return cache;
}

/**
 * Recompute a match window's scores from chain data. Deterministic full
 * recompute: anyone can rerun this against public Chiliz Chain logs plus
 * lib/scoring.ts and get the same leaderboard.
 */
export async function scoreMatch(slug: string): Promise<{ ok: boolean; reason?: string; wallets?: number }> {
  const db = getDb();
  const match = db.prepare("SELECT * FROM matches WHERE slug = ?").get(slug) as MatchRow | undefined;
  if (!match) return { ok: false, reason: "match not found" };

  const now = Date.now();
  const startMs = new Date(match.window_start_utc).getTime();
  const endMs = new Date(match.window_end_utc).getTime();
  if (startMs > now) return { ok: false, reason: "window not open yet" };
  const cooldownEndMs = endMs + MAKER_COOLDOWN_S * 1000;

  const t0 = Date.now();
  const client = getClient();
  const head = await client.getBlock();
  const headMs = Number(head.timestamp) * 1000;
  // Taker flow freezes once the chain head is comfortably past the window end;
  // otherwise an RPC lagging behind wall-clock would freeze a score missing the
  // last blocks of the window.
  const FINALITY_MARGIN_S = 60;
  const takerClosed = headMs >= endMs + FINALITY_MARGIN_S * 1000;
  // The board only FINALIZES (freezes price + status) once the maker anti-JIT
  // cooldown has also elapsed — until then a burn can still claw back an
  // in-window add, so maker volume credit isn't settled.
  const windowClosed = headMs >= cooldownEndMs;

  // Price policy: once finalized, the stored CHZ/USD is FROZEN — re-runs must
  // reproduce the same leaderboard, never reprice it. First finalization wants
  // a fresh quote (≤15 min); a provisional price stored minutes earlier is the
  // fallback; with neither, refuse rather than bake in a stale price.
  const alreadyFinalized = match.status === "scored" && match.chz_usd != null;
  let chzUsd: number | null;
  if (alreadyFinalized) {
    chzUsd = match.chz_usd;
  } else if (windowClosed) {
    const fresh = await getFreshChzPrice(15 * 60 * 1000);
    chzUsd = fresh?.usd ?? match.chz_usd ?? null;
    if (!fresh && chzUsd) {
      logIndex("warn", "finalizing with last provisional CHZ price — live quote unavailable", match.id, { chzUsd });
    }
  } else {
    chzUsd = (await getChzPrice())?.usd ?? match.chz_usd ?? null;
  }
  if (!chzUsd) {
    logIndex("error", "no CHZ price available and none stored — refusing to score", match.id);
    return { ok: false, reason: "no CHZ/USD price" };
  }

  const fromBlock = await findBlockByTimestamp(Math.floor(startMs / 1000));
  // The end boundary is exclusive: findBlockByTimestamp returns the first block
  // at-or-after the close, whose trades are outside the window. Two boundaries:
  //  - takerToBlock: last in-window block. Swaps and Mints only count here.
  //  - scanToBlock:  extends through the maker cooldown so that a post-whistle
  //    burn is observed and clawed back against its in-window add.
  const takerToBlock = takerClosed
    ? (await findBlockByTimestamp(Math.floor(endMs / 1000))) - 1n
    : head.number;
  const scanToBlock = windowClosed
    ? (await findBlockByTimestamp(Math.floor(cooldownEndMs / 1000))) - 1n
    : head.number;
  if (scanToBlock < fromBlock) {
    // Lagging or non-monotonic RPC head — never persist an empty scan that
    // would wipe the provisional leaderboard for a tick.
    logIndex("warn", "scanToBlock < fromBlock — skipping run", match.id, {
      fromBlock: Number(fromBlock),
      scanToBlock: Number(scanToBlock),
    });
    return { ok: false, reason: "rpc head behind window start" };
  }

  const tokens = JSON.parse(match.tokens) as string[];
  const flows = new Map<string, RawFlow>();
  const flow = (addr: string): RawFlow => {
    let f = flows.get(addr);
    if (!f) {
      f = {
        buyWei: 0n,
        sellWei: 0n,
        addWei: 0n,
        removeWei: 0n,
        tokenNetWeiByPair: new Map(),
        swaps: 0,
      };
      flows.set(addr, f);
    }
    return f;
  };

  let pairsScanned = 0;
  let eventsSeen = 0;
  /** Score-time WCHZ-per-token-wei for each pair (from getReserves). */
  const pairPriceWchzPerTokenWei = new Map<string, number>();

  for (const symbol of tokens) {
    const info = await resolvePair(symbol);
    if (!info) {
      logIndex("warn", `no pair for ${symbol} — skipping token`, match.id);
      continue;
    }
    pairsScanned += 1;

    for (let start = fromBlock; start <= scanToBlock; start += BigInt(LOG_CHUNK_BLOCKS)) {
      const end = start + BigInt(LOG_CHUNK_BLOCKS) - 1n > scanToBlock ? scanToBlock : start + BigInt(LOG_CHUNK_BLOCKS) - 1n;
      const logs = await client.getLogs({
        address: info.pair,
        events: UNIV2_ABI.filter((e) => e.type === "event"),
        fromBlock: start,
        toBlock: end,
        strict: true, // drop undecodable logs instead of yielding empty args
      });
      if (logs.length === 0) continue;
      eventsSeen += logs.length;
      await sendersFor(logs, txSenderCache);

      for (const log of logs) {
        const sender = txSenderCache.get(log.transactionHash!);
        if (!sender) continue;
        // Swaps and Mints only earn inside the window; Burns are counted through
        // the cooldown so a post-window unwind claws back its add.
        const inWindow = (log.blockNumber ?? 0n) <= takerToBlock;
        const args = (log as unknown as { eventName: string; args: Record<string, bigint> });
        if (args.eventName === "Swap") {
          if (!inWindow) continue;
          const wchzIn = (info.wchzIsToken0 ? args.args.amount0In : args.args.amount1In) ?? 0n;
          const wchzOut = (info.wchzIsToken0 ? args.args.amount0Out : args.args.amount1Out) ?? 0n;
          const tokenIn = (info.wchzIsToken0 ? args.args.amount1In : args.args.amount0In) ?? 0n;
          const tokenOut = (info.wchzIsToken0 ? args.args.amount1Out : args.args.amount0Out) ?? 0n;
          const f = flow(sender);
          f.swaps += 1;
          if (wchzIn > 0n) f.buyWei += wchzIn; // spent WCHZ → bought the fan token
          if (wchzOut > 0n) f.sellWei += wchzOut; // received WCHZ → sold the fan token
          // Token inventory: received on buy (tokenOut), spent on sell (tokenIn).
          const prev = f.tokenNetWeiByPair.get(info.pair) ?? 0n;
          f.tokenNetWeiByPair.set(info.pair, prev + tokenOut - tokenIn);
        } else if (args.eventName === "Mint") {
          if (!inWindow) continue; // adds after the whistle earn nothing
          const wchz = (info.wchzIsToken0 ? args.args.amount0 : args.args.amount1) ?? 0n;
          flow(sender).addWei += 2n * wchz; // both sides of the add ≈ 2× the WCHZ leg
        } else if (args.eventName === "Burn") {
          const wchz = (info.wchzIsToken0 ? args.args.amount0 : args.args.amount1) ?? 0n;
          flow(sender).removeWei += 2n * wchz; // clawback: nets against makerAddUsd
        }
      }
    }

    // Score-time pool price for inventory MTM (WCHZ per 1 token wei).
    try {
      const reserves = (await client.readContract({
        address: info.pair,
        abi: UNIV2_ABI,
        functionName: "getReserves",
      })) as readonly [bigint, bigint, number];
      const reserveWchz = info.wchzIsToken0 ? reserves[0] : reserves[1];
      const reserveToken = info.wchzIsToken0 ? reserves[1] : reserves[0];
      if (reserveToken > 0n) {
        pairPriceWchzPerTokenWei.set(info.pair, Number(reserveWchz) / Number(reserveToken));
      }
    } catch (error) {
      logIndex("warn", `getReserves failed for ${symbol}`, match.id, { error: String(error) });
    }
  }

  const toUsd = (wei: bigint) => (Number(wei) / 1e18) * chzUsd;
  const inventoryMarkUsd = (f: RawFlow): number => {
    let markWchzWei = 0;
    for (const [pair, tokenNet] of f.tokenNetWeiByPair) {
      const price = pairPriceWchzPerTokenWei.get(pair) ?? 0;
      markWchzWei += Number(tokenNet) * price;
    }
    return (markWchzWei / 1e18) * chzUsd;
  };

  const walletFlows: WalletFlow[] = [...flows.entries()].map(([address, f]) => ({
    address,
    grossBuyUsd: toUsd(f.buyWei),
    grossSellUsd: toUsd(f.sellWei),
    makerAddUsd: toUsd(f.addWei),
    makerRemoveUsd: toUsd(f.removeWei),
    inventoryMarkUsd: inventoryMarkUsd(f),
    swaps: f.swaps,
  }));
  // Net per KYC identity BEFORE the formula — self-owned wallet splits collapse
  // to one flow so splitting cannot farm the volume unlock or PnL% denominator.
  const identityOf = resolveIdentities(db, walletFlows.map((w) => w.address));
  const identityFlows = mergeFlowsByIdentity(walletFlows, (addr) => identityOf.get(addr) ?? addr);
  const scores = scoreWindow(identityFlows);

  const nowIso = new Date().toISOString();
  const provisional = windowClosed ? 0 : 1;
  const persist = db.transaction(() => {
    db.prepare("DELETE FROM scores WHERE match_id = ?").run(match.id);
    const insertScore = db.prepare(
      `INSERT INTO scores (match_id, address, gross_buy_usd, gross_sell_usd, net_taker_usd, maker_add_usd, swaps, points, provisional, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const insertWallet = db.prepare("INSERT OR IGNORE INTO wallets (address) VALUES (?)");
    for (const s of scores) {
      insertWallet.run(s.address);
      insertScore.run(
        match.id, s.address, s.grossBuyUsd, s.grossSellUsd, s.netTakerUsd,
        s.makerNetAddUsd, s.swaps, s.points, provisional, nowIso
      );
    }
    db.prepare(
      "UPDATE matches SET chz_usd = ?, status = ?, scored_at = ? WHERE id = ?"
    ).run(chzUsd, windowClosed ? "scored" : "live", nowIso, match.id);
  });
  persist();

  logIndex("info", `scored ${slug}`, match.id, {
    fromBlock: Number(fromBlock),
    takerToBlock: Number(takerToBlock),
    scanToBlock: Number(scanToBlock),
    pairsScanned,
    eventsSeen,
    wallets: scores.length,
    chzUsd,
    provisional,
    takerClosed,
    makerCooldownDone: windowClosed,
    ms: Date.now() - t0,
  });
  return { ok: true, wallets: scores.length };
}

/** Score every match whose window is open, plus ended-but-unfinalized ones. */
export async function scoreDueMatches(): Promise<void> {
  const db = getDb();
  const nowIso = new Date().toISOString();
  const due = db
    .prepare(
      `SELECT slug FROM matches
        WHERE (window_start_utc <= ? AND window_end_utc > ?)
           OR (window_end_utc <= ? AND status != 'scored')`
    )
    .all(nowIso, nowIso, nowIso) as { slug: string }[];
  for (const { slug } of due) {
    try {
      await scoreMatch(slug);
    } catch (error) {
      logIndex("error", `scoring ${slug} failed: ${String(error)}`);
    }
  }
}
