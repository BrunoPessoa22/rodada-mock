/**
 * CEX venue-volume tracking — Binance + OKX public market data.
 *
 * The league's on-chain layer attributes flow wallet-by-wallet; centralized
 * exchanges expose no per-account data publicly, so the CEX layer counts
 * VENUE-level volume: spot candles for each listed pair of a match's featured
 * tokens, summed over the matchday window and converted to USD. Per-trader CEX
 * attribution (read-only API keys → myTrades/fills through the same formula)
 * is the next layer and is documented in /regras.
 *
 * Listings verified live against both exchanges' public instrument endpoints
 * on 2026-07-20. Of the nine league tokens: Binance trades BAR and PSG
 * (USDT + TRY quotes); OKX trades ARG, MENGO, POR and TRA (USDT/USDC/USD/EUR).
 * Re-verify before adding entries — tickers collide across exchanges (Binance
 * GAL was Galxe, not Galatasaray; OKX TRB is Tellor, not Trabzonspor).
 */
import { getDb, logIndex } from "./db";
import type { MatchRow } from "./queries";

export type CexVenue = "binance" | "okx";

export const CEX_LISTINGS: Record<string, Partial<Record<CexVenue, string[]>>> = {
  BAR: { binance: ["BARUSDT", "BARTRY"] },
  PSG: { binance: ["PSGUSDT", "PSGTRY"] },
  ARG: { okx: ["ARG-USDT", "ARG-USDC", "ARG-USD", "ARG-EUR"] },
  MENGO: { okx: ["MENGO-USDT", "MENGO-USDC", "MENGO-USD", "MENGO-EUR"] },
  POR: { okx: ["POR-USDT", "POR-USDC", "POR-USD", "POR-EUR"] },
  TRA: { okx: ["TRA-USDT", "TRA-USDC", "TRA-USD", "TRA-EUR"] },
};

export const VENUE_TRADE_URL: Record<CexVenue, (inst: string) => string> = {
  binance: (inst) => `https://www.binance.com/en/trade/${inst.replace(/(USDT|USDC|TRY)$/, "_$1")}`,
  okx: (inst) => `https://www.okx.com/trade-spot/${inst.toLowerCase()}`,
};

/** Instruments listed on `venue` across the given league tokens. */
export function venueInstruments(tokens: string[], venue: CexVenue): string[] {
  return tokens.flatMap((t) => CEX_LISTINGS[t]?.[venue] ?? []);
}

// Fresh options per request — AbortSignal.timeout starts its clock at CREATION,
// so a shared module-level signal fires 10s after boot and instantly aborts
// every fetch for the rest of the process's life.
const fetchOpts = () => ({ signal: AbortSignal.timeout(10_000), cache: "no-store" as const });

/**
 * Quote-currency → USD. Stablecoin/USD quotes pass through at 1; TRY and EUR
 * convert via Binance's own fiat pairs (USDTTRY, EURUSDT), cached 30 minutes.
 * Unknown quotes return null and the pair is skipped with a warn — never
 * silently counted at a wrong rate.
 */
const fxCache = new Map<string, { rate: number; fetchedAt: number }>();
const FX_TTL_MS = 30 * 60 * 1000;

async function binanceLastPrice(symbol: string): Promise<number | null> {
  const res = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`, fetchOpts());
  if (!res.ok) return null;
  const body = (await res.json()) as { price?: string };
  const price = Number(body.price);
  return Number.isFinite(price) && price > 0 ? price : null;
}

async function quoteUsdRate(quote: string): Promise<number | null> {
  if (quote === "USDT" || quote === "USDC" || quote === "USD") return 1;
  const cached = fxCache.get(quote);
  if (cached && Date.now() - cached.fetchedAt < FX_TTL_MS) return cached.rate;
  let rate: number | null = null;
  try {
    if (quote === "TRY") {
      const usdtTry = await binanceLastPrice("USDTTRY");
      rate = usdtTry ? 1 / usdtTry : null;
    } else if (quote === "EUR") {
      rate = await binanceLastPrice("EURUSDT");
    }
  } catch {
    rate = null;
  }
  if (rate == null) return cached?.rate ?? null; // stale beats wrong-or-nothing for display volume
  fxCache.set(quote, { rate, fetchedAt: Date.now() });
  return rate;
}

interface WindowVolume {
  quoteVol: number; // in the pair's quote currency
  trades: number; // 0 where the venue's candles don't expose a count (OKX)
}

/**
 * Binance: 5m klines, k[7] = quote-asset volume, k[8] = trade count.
 * 1000 candles per call ≈ 3.5 days, so one call covers a normal window.
 */
async function binanceWindowVolume(symbol: string, startMs: number, endMs: number): Promise<WindowVolume> {
  let cursor = startMs;
  let quoteVol = 0;
  let trades = 0;
  while (cursor < endMs) {
    const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=5m&startTime=${cursor}&endTime=${endMs}&limit=1000`;
    const res = await fetch(url, fetchOpts());
    if (!res.ok) throw new Error(`binance ${symbol} HTTP ${res.status}`);
    const rows = (await res.json()) as (string | number)[][];
    if (rows.length === 0) break;
    for (const k of rows) {
      quoteVol += Number(k[7]);
      trades += Number(k[8]);
    }
    if (rows.length < 1000) break;
    cursor = Number(rows[rows.length - 1][6]) + 1; // last close time + 1ms
  }
  return { quoteVol, trades };
}

/**
 * OKX: 5m candles, newest-first, c[0] = open ts, c[7] = quote-ccy volume
 * (volCcyQuote), paged backwards via `after` until the window start. The
 * recent-candles endpoint serves ~1440 bars (5 days at 5m) — plenty. Boundary
 * candles are counted whole, so totals carry ≤5min of slop at each edge; this
 * feeds a venue-volume display, not anyone's score.
 */
async function okxWindowVolume(instId: string, startMs: number, endMs: number): Promise<WindowVolume> {
  let quoteVol = 0;
  let after = endMs + 1;
  for (let page = 0; page < 40; page++) {
    const url = `https://www.okx.com/api/v5/market/candles?instId=${instId}&bar=5m&after=${after}&limit=300`;
    const res = await fetch(url, fetchOpts());
    if (!res.ok) throw new Error(`okx ${instId} HTTP ${res.status}`);
    const body = (await res.json()) as { code: string; msg: string; data: string[][] };
    if (body.code !== "0") throw new Error(`okx ${instId} ${body.code} ${body.msg}`);
    if (body.data.length === 0) break;
    let oldest = Infinity;
    for (const c of body.data) {
      const ts = Number(c[0]);
      oldest = Math.min(oldest, ts);
      if (ts >= startMs && ts <= endMs) quoteVol += Number(c[7]);
    }
    if (oldest <= startMs) break;
    after = oldest;
  }
  return { quoteVol, trades: 0 };
}

const WINDOW_VOLUME: Record<CexVenue, (inst: string, startMs: number, endMs: number) => Promise<WindowVolume>> = {
  binance: binanceWindowVolume,
  okx: okxWindowVolume,
};

/**
 * Refresh venue volume for one match: every listed pair of every featured
 * token, full-window refetch (idempotent upsert — reruns converge, never
 * accumulate). Volume is measured to min(now, window end), so any refresh
 * after the whistle stores the complete final window.
 */
export async function refreshCexVolume(match: MatchRow): Promise<void> {
  const startMs = new Date(match.window_start_utc).getTime();
  const endMs = Math.min(Date.now(), new Date(match.window_end_utc).getTime());
  if (endMs <= startMs) return;

  const tokens = JSON.parse(match.tokens) as string[];
  const db = getDb();
  const upsert = db.prepare(
    `INSERT INTO cex_volume (match_id, venue, token, inst, quote_usd, trades, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(match_id, inst) DO UPDATE SET
       quote_usd = excluded.quote_usd, trades = excluded.trades, updated_at = excluded.updated_at`
  );

  for (const token of tokens) {
    const listings = CEX_LISTINGS[token];
    if (!listings) continue;
    for (const [venue, insts] of Object.entries(listings) as [CexVenue, string[]][]) {
      for (const inst of insts) {
        try {
          const quote = inst.includes("-") ? inst.split("-")[1] : inst.replace(/^[A-Z0-9]+?(USDT|USDC|TRY)$/, "$1");
          const rate = await quoteUsdRate(quote);
          if (rate == null) {
            logIndex("warn", `no USD rate for ${quote} — skipping ${venue} ${inst}`, match.id);
            continue;
          }
          const vol = await WINDOW_VOLUME[venue](inst, startMs, endMs);
          upsert.run(match.id, venue, token, inst, vol.quoteVol * rate, vol.trades, new Date().toISOString());
        } catch (error) {
          logIndex("warn", `cex volume failed: ${venue} ${inst}: ${String(error)}`, match.id);
        }
      }
    }
  }
}

/**
 * Refresh every match whose window is open, plus a one-hour tail past the
 * close so the stored totals settle on the complete window.
 */
const REFRESH_TAIL_MS = 60 * 60 * 1000;

export async function refreshDueCexVolume(): Promise<void> {
  const now = Date.now();
  const matches = getDb().prepare("SELECT * FROM matches").all() as MatchRow[];
  for (const match of matches) {
    const startMs = new Date(match.window_start_utc).getTime();
    const endMs = new Date(match.window_end_utc).getTime();
    if (startMs <= now && now < endMs + REFRESH_TAIL_MS) {
      await refreshCexVolume(match);
    }
  }
}
