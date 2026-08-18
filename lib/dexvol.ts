/**
 * On-chain DEX venue-volume tracking — Solana (Meteora) + Base (Aerodrome).
 *
 * League fan tokens are multichain via LayerZero OFT: the same symbol lives on
 * Chiliz Chain (scored wallet-by-wallet by the indexer), Solana (SPL mint,
 * Meteora DLMM pools) and Base (ERC20, Aerodrome CL). Per-trader attribution
 * off Chiliz is NOT safe yet (Base's dominant wallet is ERC-4337 so tx.from is
 * a bundler; Solana pool-signature enumeration can silently miss traders — see
 * docs/multichain-venues.md), so these chains are tracked as VENUE-level
 * window volume, display-only, exactly like the CEX layer. Rows land in
 * venue_volume with source "<chain>:<dex>".
 *
 * Volume source: GeckoTerminal's public OHLCV API (5-minute candles, USD
 * volume). One aggregator, both chains, no per-chain RPC parsing — the right
 * fidelity for a display total. Free tier is ~30 calls/min, so pools are
 * fetched sequentially with a courtesy delay.
 *
 * Pools verified live 2026-08-18 by walking each token's canonical deployment
 * (docs.chiliz.com token registry) through GeckoTerminal's per-token pool
 * lookup. Mint-exists ≠ tradable: BAR/GAL/TRA have Solana mints but no pools,
 * and only PSG has a Base pool today. Re-verify before adding entries.
 */
import { getDb, logIndex } from "./db";
import { TOKENS } from "./tokens";
import type { MatchRow } from "./queries";

export type DexNetwork = "solana" | "base";

export interface DexPool {
  token: string; // league symbol
  network: DexNetwork;
  dex: string; // "meteora" | "aerodrome"
  pool: string; // pool address (base58 on Solana, 0x on Base)
  quote: string; // pool quote asset, for display only (volume arrives in USD)
  tokenRef: string; // mint / ERC20 of the league token on that chain (trade links)
}

const p = (
  token: string,
  network: DexNetwork,
  dex: string,
  pool: string,
  quote: string,
  tokenRef: string
): DexPool => ({ token, network, dex, pool, quote, tokenRef });

/** Canonical OFT deployments per docs.chiliz.com (2026-08-18). */
export const CHAIN_TOKEN_REFS: Record<DexNetwork, Record<string, string>> = {
  solana: {
    SPAIN: "5J66Ept1vhnkdWy96SFGRFkABJLu6372NoGQ4Jvnm1QF",
    ARG: "BX8VbHBf8DUHeGJjJsSW2HCviGyQSF5SVCEnN7vXUkwM",
    PSG: "5eyib4qghYGHNh7VvxSFGYLFJSanjq9hug9fR52kksnm",
    GALO: "HJDTyM8uTpdVfW4KSjXJnFXKDVg7czRxDm3d7PJD9PTd",
    MENGO: "Hf5terE5YuL2e8um8398r6vbsiNcfvwggwUAssgAxeF3",
    POR: "AiYi7HyVVXnDSuj8BoPirDsuuWgddeKkD5MQN35VpwNz",
  },
  base: {
    PSG: "0xDD15623d107c639aF0C5127AFFA26d3f20327EC8",
  },
};

export const DEX_POOLS: DexPool[] = [
  p("SPAIN", "solana", "meteora", "BGazK2wm2WFF1HdPj5UmwZ3gACi8fq1mRtz2zS6mnhCp", "USDC", CHAIN_TOKEN_REFS.solana.SPAIN),
  p("SPAIN", "solana", "meteora", "HD8TZahPt2UyMhpD7GcFTipLGLw5DEKgTDqLbXd64NjB", "SOL", CHAIN_TOKEN_REFS.solana.SPAIN),
  p("ARG", "solana", "meteora", "4ffo5UwoU5SuxWsV6mVDp8pg2nZhBqSwfohqsWwavUbw", "USDC", CHAIN_TOKEN_REFS.solana.ARG),
  p("ARG", "solana", "meteora", "HNPiWesdVByWABLYbJw7KwcBgTU8ty6v9A5XczCks9so", "SOL", CHAIN_TOKEN_REFS.solana.ARG),
  p("PSG", "solana", "meteora", "Dena6Unr1jZ73hmNG2uBhnaKkGNrvD2k1js7ominEvXx", "USDC", CHAIN_TOKEN_REFS.solana.PSG),
  p("PSG", "solana", "meteora", "HtyQYy41nL9YQrRG8cs6R2dqqyWaKTaHh1bFJwuvhigU", "SOL", CHAIN_TOKEN_REFS.solana.PSG),
  p("PSG", "solana", "meteora", "57YuavuPgnbXQKaD9bM2cVs5sSmehNvWwYBADgpepHHc", "USDC", CHAIN_TOKEN_REFS.solana.PSG),
  p("GALO", "solana", "meteora", "6MAb2pBJ581YMRt3n6yW8CT3NXUaKYwPdN94SfZBryPa", "USDC", CHAIN_TOKEN_REFS.solana.GALO),
  p("MENGO", "solana", "meteora", "Em1LzVgc2uKRgH2i6Vnp4jVj8w6GkvRmF5twXwxQqU5n", "USDC", CHAIN_TOKEN_REFS.solana.MENGO),
  p("POR", "solana", "meteora", "3msAL8G7Kq4C9GGASVjp5F5QjpvJuBZyyXNV2nsegQUD", "USDC", CHAIN_TOKEN_REFS.solana.POR),
  p("POR", "solana", "meteora", "8LDrs6k7eZkUEa9jvmBGAJULVgPc78rP9WcFgoXak5Dt", "SOL", CHAIN_TOKEN_REFS.solana.POR),
  p("PSG", "base", "aerodrome", "0x76f9aefa6abcbceb10cc149e071209366f64ce9d", "USDC", CHAIN_TOKEN_REFS.base.PSG),
];

export const DEX_NETWORK_LABEL: Record<DexNetwork, string> = {
  solana: "Solana",
  base: "Base",
};

/** Where a user actually trades the token on that chain. */
export function dexTradeUrl(poolRef: DexPool): string {
  if (poolRef.network === "solana") return `https://jup.ag/swap/USDC-${poolRef.tokenRef}`;
  return `https://aerodrome.finance/swap?from=0x833589fcd6edb6e08f4c7c32d4f71b54bda02913&to=${poolRef.tokenRef}`;
}

/** Pool-registry sanity, exported for tests. */
export function dexPoolProblems(): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const pool of DEX_POOLS) {
    if (!TOKENS[pool.token]) problems.push(`pool for unknown league token ${pool.token}`);
    const key = `${pool.network}:${pool.pool}`;
    if (seen.has(key)) problems.push(`duplicate pool ${key}`);
    seen.add(key);
    if (pool.network === "solana" && !/^[1-9A-HJ-NP-Za-km-z]{43,44}$/.test(pool.pool)) {
      problems.push(`malformed solana pool ${pool.pool}`);
    }
    if (pool.network === "base" && !/^0x[0-9a-f]{40}$/.test(pool.pool)) {
      problems.push(`malformed base pool ${pool.pool} (must be lowercase 0x)`);
    }
    if (CHAIN_TOKEN_REFS[pool.network][pool.token] !== pool.tokenRef) {
      problems.push(`tokenRef mismatch on ${key}`);
    }
  }
  return problems;
}

/** GeckoTerminal OHLCV row: [tsSec, o, h, l, c, volumeUsd], newest-first, sparse. */
export type OhlcvRow = [number, number, number, number, number, number];

/** Pure summer, exported for tests: candles whose open falls in-window. */
export function sumOhlcvUsd(rows: OhlcvRow[], startMs: number, endMs: number): number {
  const from = Math.floor(startMs / 1000);
  const to = Math.floor(endMs / 1000);
  let usd = 0;
  for (const row of rows) {
    if (row[0] >= from && row[0] <= to) usd += row[5];
  }
  return usd;
}

const fetchOpts = () => ({
  signal: AbortSignal.timeout(15_000),
  cache: "no-store" as const,
  headers: { accept: "application/json" },
});

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Window volume for one pool. 1000 5-minute candles ≈ 3.5 days and the list is
 * sparse (only candles with trades exist), so one call covers any window; a
 * second page via before_timestamp handles the pathological case.
 */
async function poolWindowVolumeUsd(
  network: DexNetwork,
  pool: string,
  startMs: number,
  endMs: number
): Promise<number> {
  let usd = 0;
  let before = Math.floor(endMs / 1000) + 1;
  for (let page = 0; page < 4; page++) {
    const url =
      `https://api.geckoterminal.com/api/v2/networks/${network}/pools/${pool}` +
      `/ohlcv/minute?aggregate=5&limit=1000&currency=usd&before_timestamp=${before}`;
    const res = await fetch(url, fetchOpts());
    if (!res.ok) throw new Error(`geckoterminal ${network}/${pool} HTTP ${res.status}`);
    const body = (await res.json()) as { data?: { attributes?: { ohlcv_list?: OhlcvRow[] } } };
    const rows = body.data?.attributes?.ohlcv_list ?? [];
    if (rows.length === 0) break;
    usd += sumOhlcvUsd(rows, startMs, endMs);
    const oldest = Math.min(...rows.map((row) => row[0]));
    if (oldest * 1000 <= startMs || rows.length < 1000) break;
    before = oldest;
  }
  return usd;
}

/** Courtesy spacing between GeckoTerminal calls (free tier ≈ 30/min). */
const GT_CALL_SPACING_MS = 2_500;

/**
 * Refresh Solana/Base pool volume for one match — same idempotent-upsert
 * contract as refreshCexVolume: full-window refetch, reruns converge.
 */
export async function refreshDexVolume(match: MatchRow): Promise<void> {
  const startMs = new Date(match.window_start_utc).getTime();
  const endMs = Math.min(Date.now(), new Date(match.window_end_utc).getTime());
  if (endMs <= startMs) return;

  const tokens = new Set(JSON.parse(match.tokens) as string[]);
  const pools = DEX_POOLS.filter((pool) => tokens.has(pool.token));
  if (pools.length === 0) return;

  const upsert = getDb().prepare(
    `INSERT INTO venue_volume (match_id, source, venue, chain, token, inst, quote, quote_usd, trades, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
     ON CONFLICT(match_id, source, inst) DO UPDATE SET
       quote_usd = excluded.quote_usd, updated_at = excluded.updated_at`
  );

  for (const pool of pools) {
    try {
      const usd = await poolWindowVolumeUsd(pool.network, pool.pool, startMs, endMs);
      upsert.run(
        match.id,
        `${pool.network}:${pool.dex}`,
        pool.dex,
        pool.network,
        pool.token,
        pool.pool,
        pool.quote,
        usd,
        new Date().toISOString()
      );
    } catch (error) {
      logIndex("warn", `dex volume failed: ${pool.network} ${pool.pool}: ${String(error)}`, match.id);
    }
    await sleep(GT_CALL_SPACING_MS);
  }
}

const REFRESH_TAIL_MS = 60 * 60 * 1000;

export async function refreshDueDexVolume(): Promise<void> {
  const now = Date.now();
  const matches = getDb().prepare("SELECT * FROM matches").all() as MatchRow[];
  for (const match of matches) {
    const startMs = new Date(match.window_start_utc).getTime();
    const endMs = new Date(match.window_end_utc).getTime();
    if (startMs <= now && now < endMs + REFRESH_TAIL_MS) {
      await refreshDexVolume(match);
    }
  }
}
