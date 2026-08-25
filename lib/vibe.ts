/**
 * vibe.trading (Symmio) perpetual-futures venue tracking — DISPLAY ONLY.
 *
 * vibe is the first venue on the board that is not spot. A perp is a synthetic:
 * a fan buying PSG perp never touches a PSG token, so perp notional is NOT fan
 * token demand and must never be added to the spot volume total. It is tracked
 * on its own line, tagged as a derivative, and excluded from the matchday spot
 * figure — see isPerpSource() and its use in the venue board.
 *
 * WHY IT IS NOT SCORED (yet)
 * --------------------------
 * Per-trader attribution is NOT the blocker — it is fully solved. Symmio's
 * public Goldsky subgraph exposes every position with its owner (`partyA`),
 * symbol, side, leverage, open/close prices, realized profit/loss, funding and
 * fees. `DailySymbolTradesHistory` even pre-aggregates per account × symbol ×
 * day. A scored adapter emitting WalletFlow is a few days' work.
 *
 * The blocker is MARK INTEGRITY. VibeCaps fan perps are priced off Solana
 * Meteora OFT pools, and the depth behind them is tiny — measured 2026-08-24:
 * PSG total notional cap $131, AFC ~$14, SPAIN ~$3.6k, ARG market LOCKED,
 * CHZ/POR/BELG all zero. A league that paid CHZ for PnL on those marks would be
 * paying out on a price a trader can move for pocket change: buy the thin
 * Meteora pool, print league points, collect from the pot. That attacks the
 * prize pool directly, so the scored path stays behind a hard depth gate.
 * See docs/vibe-integration.md for the gate and the full design.
 */
import { getDb, logIndex } from "./db";
import type { MatchRow } from "./queries";

/** Public Symmio analytics subgraph for vibe's HyperEVM deployment (chain 999). */
const SUBGRAPH =
  process.env.VIBE_SUBGRAPH_URL ??
  "https://api.goldsky.com/api/public/project_cm1hfr4527p0f01u85mz499u8/subgraphs/hyperevm_mainnet_analytics/latest/gn";

export const VIBE_SOURCE = "perp:vibe";
export const VIBE_TRADE_URL = (symbolId: number) => `https://app.vibe.trading/vibecaps/${symbolId}`;

export interface VibeMarket {
  /** League token symbol — must exist in lib/tokens.ts to be trackable. */
  token: string;
  /** Symmio market id on the VibeCaps (Enigma / HyperEVM) lane. */
  symbolId: number;
}

/**
 * The VibeCaps lane's Chiliz-ecosystem markets, intersected with the league's
 * own token registry. Verified live 2026-08-24 via `sdk.js markets`.
 *
 * CHZ (symbolId 142) is deliberately absent: it is the chain's gas asset, not a
 * club token, and is not in the league registry either.
 *
 * The league features 64 club tokens; vibe lists 6 of them. Every token the
 * league actually runs matchdays on today — MENGO, GALO, BAR, GAL, TRA — has no
 * vibe market at all. Re-run `node sdk.js markets` before adding entries.
 */
export const VIBE_MARKETS: VibeMarket[] = [
  { token: "PSG", symbolId: 138 },
  { token: "AFC", symbolId: 139 },
  { token: "POR", symbolId: 187 },
  { token: "SPAIN", symbolId: 188 },
  { token: "BELG", symbolId: 191 },
  { token: "ARG", symbolId: 195 },
];

/**
 * True for venue_volume sources whose numbers are DERIVATIVE notional, not spot
 * turnover. Callers summing "matchday volume" must exclude these: a perp fill
 * moves no tokens, so folding it into a token-demand figure overstates it.
 */
export function isPerpSource(source: string): boolean {
  return source.startsWith("perp:");
}

/** Subgraph BigInt strings are 1e18-scaled; missing/null reads as 0. */
function n18(raw: string | null | undefined): number {
  if (raw === null || raw === undefined || raw === "") return 0;
  const v = Number(raw);
  return Number.isFinite(v) ? v / 1e18 : 0;
}

export interface QuoteRow {
  quoteId: string;
  symbolId: string;
  /** Sub-account that holds the position; maps to an owner EOA via subAccounts. */
  partyA?: string | null;
  quantity: string | null;
  openedPrice: string | null;
  averageClosedPrice: string | null;
  closedAmount: string | null;
  timestampOpenPosition: string | null;
  timestampFullyClose: string | null;
}

async function gql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const res = await fetch(SUBGRAPH, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`subgraph ${res.status}`);
  const body = (await res.json()) as { data?: T; errors?: { message: string }[] };
  if (body.errors?.length) throw new Error(body.errors.map((e) => e.message).join("; "));
  if (!body.data) throw new Error("subgraph returned no data");
  return body.data;
}

const PAGE = 1000;

/**
 * Every position on the tracked markets that opened OR closed anywhere near the
 * window. Paginated on quoteId so a busy window can't silently truncate at the
 * subgraph's 1000-row page cap.
 */
async function fetchQuotes(symbolIds: number[], toSec: number): Promise<QuoteRow[]> {
  const out: QuoteRow[] = [];
  let cursor = "0";
  for (let page = 0; page < 25; page++) {
    // Upper bound only: a position that CLOSES inside the window may have been
    // opened long before it, so there is no safe lower bound on creation time.
    // These markets carry ~3k quotes in total, so the full scan is cheap.
    const data = await gql<{ quotes: QuoteRow[] }>(
      `query($ids:[BigInt!], $to:BigInt!, $cursor:BigInt!, $first:Int!) {
         quotes(first: $first, orderBy: quoteId, orderDirection: asc,
                where: { symbolId_in: $ids, quoteId_gt: $cursor,
                         timestamp_lte: $to, timestampOpenPosition_not: null }) {
           quoteId symbolId partyA quantity openedPrice averageClosedPrice closedAmount
           timestampOpenPosition timestampFullyClose
         }
       }`,
      { ids: symbolIds.map(String), to: String(toSec), cursor, first: PAGE }
    );
    const rows = data.quotes;
    out.push(...rows);
    if (rows.length < PAGE) break;
    cursor = rows[rows.length - 1].quoteId;
  }
  return out;
}

export interface VibeWindowVolume {
  token: string;
  symbolId: number;
  /** Notional opened + notional closed inside the window, in USD. */
  notionalUsd: number;
  /** Executions counted (an open and a close are two). */
  trades: number;
}

/**
 * Window notional per tracked market.
 *
 * Counted the same way the Chiliz spot indexer counts gross taker volume: each
 * execution once, at the moment it happens. A position opened inside the window
 * contributes its open notional; a position closed inside the window
 * contributes its close notional. A position that spans the window contributes
 * neither leg, exactly as a spot trade outside the window would not count.
 */
export async function vibeWindowVolume(
  tokens: string[],
  startMs: number,
  endMs: number
): Promise<VibeWindowVolume[]> {
  const markets = VIBE_MARKETS.filter((m) => tokens.includes(m.token));
  if (markets.length === 0 || endMs <= startMs) return [];

  const fromSec = Math.floor(startMs / 1000);
  const toSec = Math.floor(endMs / 1000);
  const quotes = await fetchQuotes(
    markets.map((m) => m.symbolId),
    toSec
  );

  return bucketQuotes(quotes, markets, fromSec, toSec);
}

/**
 * Pure window attribution — the part worth testing. Each execution counts once,
 * at the moment it happened, exactly as the Chiliz spot indexer counts a swap.
 */
export function bucketQuotes(
  quotes: QuoteRow[],
  markets: VibeMarket[],
  fromSec: number,
  toSec: number
): VibeWindowVolume[] {
  const agg = new Map<number, VibeWindowVolume>();
  for (const m of markets) {
    agg.set(m.symbolId, { token: m.token, symbolId: m.symbolId, notionalUsd: 0, trades: 0 });
  }

  for (const q of quotes) {
    const bucket = agg.get(Number(q.symbolId));
    if (!bucket) continue;
    const openTs = Number(q.timestampOpenPosition ?? 0);
    const closeTs = Number(q.timestampFullyClose ?? 0);

    if (openTs >= fromSec && openTs <= toSec) {
      bucket.notionalUsd += n18(q.quantity) * n18(q.openedPrice);
      bucket.trades += 1;
    }
    if (closeTs > 0 && closeTs >= fromSec && closeTs <= toSec) {
      // closedAmount is the quantity actually closed; fall back to full size.
      const qty = n18(q.closedAmount) || n18(q.quantity);
      bucket.notionalUsd += qty * (n18(q.averageClosedPrice) || n18(q.openedPrice));
      bucket.trades += 1;
    }
  }

  return [...agg.values()];
}

/**
 * Sub-account address → owner EOA, restricted to the given owners (the league's
 * verified wallets). The subgraph stores lowercase hex; both sides normalize.
 */
async function fetchSubAccountOwners(owners: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  for (let i = 0; i < owners.length; i += 100) {
    const chunk = owners.slice(i, i + 100).map((o) => o.toLowerCase());
    let cursor = "0x00";
    for (let page = 0; page < 10; page++) {
      const data = await gql<{ subAccounts: { address: string; owner: string }[] }>(
        `query($owners:[Bytes!], $cursor:Bytes!, $first:Int!) {
           subAccounts(first: $first, orderBy: address, orderDirection: asc,
                       where: { owner_in: $owners, address_gt: $cursor }) {
             address owner
           }
         }`,
        { owners: chunk, cursor, first: PAGE }
      );
      for (const s of data.subAccounts) map.set(s.address.toLowerCase(), s.owner.toLowerCase());
      if (data.subAccounts.length < PAGE) break;
      cursor = data.subAccounts[data.subAccounts.length - 1].address;
    }
  }
  return map;
}

export interface VibeOwnerVolume {
  owner: string; // verified wallet (lowercase 0x…)
  token: string;
  symbolId: number;
  openUsd: number; // notional opened inside the window
  closeUsd: number; // notional closed inside the window
  trades: number;
}

/**
 * Per-owner window attribution — same leg semantics as bucketQuotes, keyed by
 * the owner EOA behind each position's sub-account. Positions whose sub-account
 * doesn't belong to a verified wallet are skipped, so nothing about strangers
 * is ever aggregated.
 */
export function bucketQuotesByOwner(
  quotes: QuoteRow[],
  markets: VibeMarket[],
  fromSec: number,
  toSec: number,
  subToOwner: Map<string, string>
): VibeOwnerVolume[] {
  const tokenBySymbol = new Map(markets.map((m) => [m.symbolId, m.token]));
  const agg = new Map<string, VibeOwnerVolume>();

  for (const q of quotes) {
    const token = tokenBySymbol.get(Number(q.symbolId));
    if (!token) continue;
    const owner = q.partyA ? subToOwner.get(q.partyA.toLowerCase()) : undefined;
    if (!owner) continue;

    const key = `${owner}|${q.symbolId}`;
    let bucket = agg.get(key);
    if (!bucket) {
      bucket = { owner, token, symbolId: Number(q.symbolId), openUsd: 0, closeUsd: 0, trades: 0 };
      agg.set(key, bucket);
    }
    const openTs = Number(q.timestampOpenPosition ?? 0);
    const closeTs = Number(q.timestampFullyClose ?? 0);
    if (openTs >= fromSec && openTs <= toSec) {
      bucket.openUsd += n18(q.quantity) * n18(q.openedPrice);
      bucket.trades += 1;
    }
    if (closeTs > 0 && closeTs >= fromSec && closeTs <= toSec) {
      const qty = n18(q.closedAmount) || n18(q.quantity);
      bucket.closeUsd += qty * (n18(q.averageClosedPrice) || n18(q.openedPrice));
      bucket.trades += 1;
    }
  }

  // Drop owners whose activity fell entirely outside the window.
  return [...agg.values()].filter((b) => b.trades > 0);
}

/**
 * Refresh vibe perp notional for one match — same idempotent-upsert contract as
 * the CEX and DEX collectors: a full-window refetch, so reruns converge.
 *
 * Two layers from ONE quotes fetch: the venue-wide total (venue_volume), and
 * per-verified-wallet attribution (keyed_cex_volume, venue 'vibe') via the
 * public sub-account → owner mapping. No key, no signature, no user action —
 * the wallet claim IS the connection. Perp notional stays excluded from spot
 * totals in both layers (isPerpSource / per-venue keyed rows).
 */
export async function refreshVibeVolume(match: MatchRow): Promise<void> {
  const startMs = new Date(match.window_start_utc).getTime();
  const endMs = Math.min(Date.now(), new Date(match.window_end_utc).getTime());
  if (endMs <= startMs) return;

  const tokens = JSON.parse(match.tokens) as string[];
  const markets = VIBE_MARKETS.filter((m) => tokens.includes(m.token));
  if (markets.length === 0) return;

  const fromSec = Math.floor(startMs / 1000);
  const toSec = Math.floor(endMs / 1000);
  let quotes: QuoteRow[];
  try {
    quotes = await fetchQuotes(
      markets.map((m) => m.symbolId),
      toSec
    );
  } catch (error) {
    logIndex("warn", `vibe volume failed: ${String(error)}`, match.id);
    return;
  }

  const rows = bucketQuotes(quotes, markets, fromSec, toSec);
  const upsert = getDb().prepare(
    `INSERT INTO venue_volume (match_id, source, venue, chain, token, inst, quote, quote_usd, trades, updated_at)
     VALUES (?, ?, 'vibe', 'hyperevm', ?, ?, 'USDC', ?, ?, ?)
     ON CONFLICT(match_id, source, inst) DO UPDATE SET
       quote_usd = excluded.quote_usd, trades = excluded.trades, updated_at = excluded.updated_at`
  );
  const nowIso = new Date().toISOString();
  for (const r of rows) {
    upsert.run(match.id, VIBE_SOURCE, r.token, `vibecaps:${r.symbolId}`, r.notionalUsd, r.trades, nowIso);
  }

  // Wallet attribution rides the same fetch; its failure must never take the
  // venue totals (already written above) down with it.
  try {
    const owners = (
      getDb().prepare("SELECT address FROM wallets WHERE status = 'verified'").all() as {
        address: string;
      }[]
    ).map((w) => w.address);
    if (owners.length === 0) return;
    const subToOwner = await fetchSubAccountOwners(owners);
    if (subToOwner.size === 0) return;

    const ownerRows = bucketQuotesByOwner(quotes, markets, fromSec, toSec, subToOwner);
    const upsertOwner = getDb().prepare(
      `INSERT INTO keyed_cex_volume (match_id, address, venue, token, inst, buy_usd, sell_usd, trades, updated_at)
       VALUES (?, ?, 'vibe', ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ','now'))
       ON CONFLICT(match_id, address, venue, inst) DO UPDATE SET
         buy_usd = excluded.buy_usd, sell_usd = excluded.sell_usd,
         trades = excluded.trades, updated_at = excluded.updated_at`
    );
    for (const r of ownerRows) {
      // buy = open-leg notional, sell = close-leg notional; the display only
      // ever sums them, matching how the venue-wide figure counts legs.
      upsertOwner.run(match.id, r.owner, r.token, `vibecaps:${r.symbolId}`, r.openUsd, r.closeUsd, r.trades);
    }
  } catch (error) {
    logIndex("warn", `vibe wallet attribution failed: ${String(error)}`, match.id);
  }
}

const REFRESH_TAIL_MS = 60 * 60 * 1000;

export async function refreshDueVibeVolume(): Promise<void> {
  const now = Date.now();
  const matches = getDb().prepare("SELECT * FROM matches").all() as MatchRow[];
  for (const match of matches) {
    const startMs = new Date(match.window_start_utc).getTime();
    const endMs = new Date(match.window_end_utc).getTime();
    if (startMs <= now && now < endMs + REFRESH_TAIL_MS) {
      await refreshVibeVolume(match);
    }
  }
}
