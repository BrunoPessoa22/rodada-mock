/**
 * CEX venue-volume tracking — public market data from eight exchanges.
 *
 * The league's on-chain layer attributes flow wallet-by-wallet; centralized
 * exchanges expose no per-account data publicly, so the CEX layer counts
 * VENUE-level volume: spot candles for each listed pair of a match's featured
 * tokens, summed over the matchday window and converted to USD. Rows land in
 * venue_volume with source "cex:<venue>" and are DISPLAY ONLY — they never
 * score points. Per-trader CEX attribution (read-only API keys → myTrades
 * through the same formula) is the next layer and is documented in /regras.
 *
 * Only a subset of the 64-token registry is CEX-listed; absence here just
 * means that token's volume is counted on-chain only.
 *
 * Listings verified live 2026-08-18 against every venue's public instrument
 * endpoint AND price-sanity-checked against a canonical venue (each candidate's
 * last price within a few percent of Binance/OKX's quote for the same token).
 * That double check matters — tickers collide across exchanges:
 *   - Binance GAL was Galxe, not Galatasaray (now delisted either way).
 *   - Mercado Bitcoin "GAL-BRL" is a dead namesake; the real fan tokens there
 *     use FT-suffixed symbols (MENGOFT-BRL, GALOFT-BRL, GALFT-BRL, …).
 *   - OKX TRB is Tellor, not Trabzonspor.
 * Re-run both checks before adding any entry.
 */
import { getDb, logIndex } from "./db";
import { TOKENS } from "./tokens";
import type { MatchRow } from "./queries";

export type CexVenue =
  | "binance"
  | "okx"
  | "gate"
  | "mexc"
  | "bitget"
  | "htx"
  | "upbit"
  | "mercadobitcoin";

/** One listed spot pair. `quote` is EXPLICIT — never regex-parsed from inst. */
export interface CexListing {
  inst: string;
  quote: string;
}

const l = (inst: string, quote: string): CexListing => ({ inst, quote });

export const CEX_LISTINGS: Record<string, Partial<Record<CexVenue, CexListing[]>>> = {
  // SPAIN trades on no tracked CEX (Chiliz Chain + Solana only).
  ARG: {
    okx: [l("ARG-USDT", "USDT"), l("ARG-USDC", "USDC"), l("ARG-USD", "USD"), l("ARG-EUR", "EUR")],
    gate: [l("ARG_USDT", "USDT")],
    mexc: [l("ARGUSDT", "USDT")],
    htx: [l("argusdt", "USDT")],
  },
  BAR: {
    binance: [l("BARUSDT", "USDT"), l("BARTRY", "TRY")],
    mexc: [l("BARUSDT", "USDT")],
    upbit: [l("BTC-BAR", "BTC")],
    mercadobitcoin: [l("BARFT-BRL", "BRL")],
  },
  PSG: {
    binance: [l("PSGUSDT", "USDT"), l("PSGTRY", "TRY")],
    gate: [l("PSG_USDT", "USDT")],
    mexc: [l("PSGUSDT", "USDT")],
    bitget: [l("PSGUSDT", "USDT")],
    htx: [l("psgusdt", "USDT")],
    upbit: [l("BTC-PSG", "BTC")],
    mercadobitcoin: [l("PSGFT-BRL", "BRL")],
  },
  GALO: {
    gate: [l("GALO_USDT", "USDT")],
    mercadobitcoin: [l("GALOFT-BRL", "BRL")],
  },
  MENGO: {
    okx: [
      l("MENGO-USDT", "USDT"),
      l("MENGO-USDC", "USDC"),
      l("MENGO-USD", "USD"),
      l("MENGO-EUR", "EUR"),
    ],
    gate: [l("MENGO_USDT", "USDT")],
    mexc: [l("MENGOUSDT", "USDT")],
    mercadobitcoin: [l("MENGOFT-BRL", "BRL")],
  },
  GAL: {
    mercadobitcoin: [l("GALFT-BRL", "BRL")],
  },
  TRA: {
    okx: [l("TRA-USDT", "USDT"), l("TRA-USDC", "USDC"), l("TRA-USD", "USD"), l("TRA-EUR", "EUR")],
    gate: [l("TRA_USDT", "USDT")],
  },
  POR: {
    okx: [l("POR-USDT", "USDT"), l("POR-USDC", "USDC"), l("POR-USD", "USD"), l("POR-EUR", "EUR")],
    gate: [l("POR_USDT", "USDT")],
    mexc: [l("PORUSDT", "USDT")],
  },
};

export const CEX_VENUE_LABEL: Record<CexVenue, string> = {
  binance: "Binance",
  okx: "OKX",
  gate: "Gate",
  mexc: "MEXC",
  bitget: "Bitget",
  htx: "HTX",
  upbit: "Upbit",
  mercadobitcoin: "Mercado Bitcoin",
};

export const VENUE_TRADE_URL: Record<CexVenue, (inst: string) => string> = {
  binance: (inst) => `https://www.binance.com/en/trade/${inst.replace(/(USDT|USDC|TRY)$/, "_$1")}`,
  okx: (inst) => `https://www.okx.com/trade-spot/${inst.toLowerCase()}`,
  gate: (inst) => `https://www.gate.io/trade/${inst}`,
  mexc: (inst) => `https://www.mexc.com/exchange/${inst.replace(/(USDT)$/, "_$1")}`,
  bitget: (inst) => `https://www.bitget.com/spot/${inst}`,
  htx: (inst) => `https://www.htx.com/trade/${inst.replace(/(usdt)$/, "_$1")}`,
  upbit: (inst) => `https://upbit.com/exchange?code=CRIX.UPBIT.${inst}`,
  // MB's canonical per-symbol URL — they 301 it to the token's current page
  // (criptomoedas/PSGFT-BRL → fan-tokens/paris-saint-germain), so the mapping
  // to marketing slugs stays THEIR problem. Never link the bare homepage.
  mercadobitcoin: (inst) => `https://www.mercadobitcoin.com.br/criptomoedas/${inst}`,
};

// Fresh options per request — AbortSignal.timeout starts its clock at CREATION,
// so a shared module-level signal fires 10s after boot and instantly aborts
// every fetch for the rest of the process's life.
const fetchOpts = () => ({ signal: AbortSignal.timeout(10_000), cache: "no-store" as const });

/**
 * Quote-currency → USD. Stablecoin/USD quotes pass through at 1; TRY, EUR, BRL
 * and BTC convert via Binance's own pairs, cached 30 minutes. Unknown quotes
 * return null and the pair is skipped with a warn — never silently counted at
 * a wrong rate.
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

export async function quoteUsdRate(quote: string): Promise<number | null> {
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
    } else if (quote === "BRL") {
      const usdtBrl = await binanceLastPrice("USDTBRL");
      rate = usdtBrl ? 1 / usdtBrl : null;
    } else if (quote === "BTC") {
      rate = await binanceLastPrice("BTCUSDT");
    }
  } catch {
    rate = null;
  }
  if (rate == null) return cached?.rate ?? null; // stale beats wrong-or-nothing for display volume
  fxCache.set(quote, { rate, fetchedAt: Date.now() });
  return rate;
}

export interface WindowVolume {
  quoteVol: number; // in the pair's quote currency
  trades: number; // 0 where the venue's candles don't expose a count
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

/**
 * Gate: 5m candlesticks, ascending, row = [tsSec, quoteVol, close, high, low,
 * open, baseVol, closed]. from/to are seconds; one call serves ≤1000 points
 * (≈3.5 days at 5m) which covers any matchday window.
 */
async function gateWindowVolume(inst: string, startMs: number, endMs: number): Promise<WindowVolume> {
  const from = Math.floor(startMs / 1000);
  const to = Math.floor(endMs / 1000);
  const url = `https://api.gateio.ws/api/v4/spot/candlesticks?currency_pair=${inst}&interval=5m&from=${from}&to=${to}`;
  const res = await fetch(url, fetchOpts());
  if (!res.ok) throw new Error(`gate ${inst} HTTP ${res.status}`);
  const rows = (await res.json()) as string[][];
  let quoteVol = 0;
  for (const c of rows) {
    const ts = Number(c[0]);
    if (ts >= from && ts <= to) quoteVol += Number(c[1]);
  }
  return { quoteVol, trades: 0 };
}

/**
 * MEXC: Binance-style /api/v3/klines but with 8 fields — [openTime, o, h, l,
 * c, baseVol, closeTime, quoteVol]. No trade count. Paged forward by closeTime
 * like Binance.
 */
async function mexcWindowVolume(symbol: string, startMs: number, endMs: number): Promise<WindowVolume> {
  let cursor = startMs;
  let quoteVol = 0;
  while (cursor < endMs) {
    const url = `https://api.mexc.com/api/v3/klines?symbol=${symbol}&interval=5m&startTime=${cursor}&endTime=${endMs}&limit=1000`;
    const res = await fetch(url, fetchOpts());
    if (!res.ok) throw new Error(`mexc ${symbol} HTTP ${res.status}`);
    const rows = (await res.json()) as (string | number)[][];
    if (rows.length === 0) break;
    for (const k of rows) quoteVol += Number(k[7]);
    if (rows.length < 1000) break;
    cursor = Number(rows[rows.length - 1][6]) + 1;
  }
  return { quoteVol, trades: 0 };
}

/**
 * Bitget: history-candles, ascending within a page, row = [tsMs, o, h, l, c,
 * baseVol, usdtVol, quoteVol]. Pages backwards via endTime; 200 rows/page.
 */
async function bitgetWindowVolume(symbol: string, startMs: number, endMs: number): Promise<WindowVolume> {
  let quoteVol = 0;
  let end = endMs;
  for (let page = 0; page < 40; page++) {
    const url = `https://api.bitget.com/api/v2/spot/market/history-candles?symbol=${symbol}&granularity=5min&endTime=${end}&limit=200`;
    const res = await fetch(url, fetchOpts());
    if (!res.ok) throw new Error(`bitget ${symbol} HTTP ${res.status}`);
    const body = (await res.json()) as { code: string; msg: string; data: string[][] };
    if (body.code !== "00000") throw new Error(`bitget ${symbol} ${body.code} ${body.msg}`);
    if (!body.data || body.data.length === 0) break;
    let oldest = Infinity;
    for (const c of body.data) {
      const ts = Number(c[0]);
      oldest = Math.min(oldest, ts);
      if (ts >= startMs && ts <= endMs) quoteVol += Number(c[7]);
    }
    if (oldest <= startMs) break;
    end = oldest - 1;
  }
  return { quoteVol, trades: 0 };
}

/** HTX kline row (newest-first): id = candle open in SECONDS, vol = quote volume. */
export interface HtxKline {
  id: number;
  vol: number;
  count: number;
}

/** Pure summer, exported for tests: counts candles whose open falls in-window. */
export function sumHtxKlines(rows: HtxKline[], startMs: number, endMs: number): WindowVolume {
  let quoteVol = 0;
  let trades = 0;
  for (const k of rows) {
    const ts = k.id * 1000;
    if (ts >= startMs && ts <= endMs) {
      quoteVol += k.vol;
      trades += k.count;
    }
  }
  return { quoteVol, trades };
}

/**
 * HTX: /market/history/kline serves the newest N candles with NO time-range
 * params — size=2000 at 5min reaches ~7 days back, then we filter in-window.
 * A window older than that returns 0; acceptable for display volume, which is
 * refreshed while the window is live.
 */
async function htxWindowVolume(symbol: string, startMs: number, endMs: number): Promise<WindowVolume> {
  const url = `https://api.huobi.pro/market/history/kline?symbol=${symbol}&period=5min&size=2000`;
  const res = await fetch(url, fetchOpts());
  if (!res.ok) throw new Error(`htx ${symbol} HTTP ${res.status}`);
  const body = (await res.json()) as { status: string; data?: HtxKline[] };
  if (body.status !== "ok" || !body.data) throw new Error(`htx ${symbol} status ${body.status}`);
  return sumHtxKlines(body.data, startMs, endMs);
}

/**
 * Upbit: 5m candles newest-first, paged backwards via `to` (exclusive).
 * candle_acc_trade_price = quote-currency volume (BTC for our markets). Only
 * candles with trades exist, so sparse pairs page out quickly.
 */
async function upbitWindowVolume(market: string, startMs: number, endMs: number): Promise<WindowVolume> {
  let quoteVol = 0;
  let to = new Date(endMs).toISOString();
  for (let page = 0; page < 40; page++) {
    const url = `https://api.upbit.com/v1/candles/minutes/5?market=${market}&count=200&to=${encodeURIComponent(to)}`;
    const res = await fetch(url, fetchOpts());
    if (!res.ok) throw new Error(`upbit ${market} HTTP ${res.status}`);
    const rows = (await res.json()) as { candle_date_time_utc: string; candle_acc_trade_price: number }[];
    if (rows.length === 0) break;
    let oldest = Infinity;
    for (const c of rows) {
      const ts = Date.parse(`${c.candle_date_time_utc}Z`);
      oldest = Math.min(oldest, ts);
      if (ts >= startMs && ts <= endMs) quoteVol += c.candle_acc_trade_price;
    }
    if (oldest <= startMs || rows.length < 200) break;
    to = new Date(oldest).toISOString();
  }
  return { quoteVol, trades: 0 };
}

/** Mercado Bitcoin candle arrays (parallel, ascending): t seconds, c close, v BASE volume. */
export interface MbCandles {
  t: number[];
  c: string[];
  v: string[];
}

/**
 * Pure summer, exported for tests. MB candles carry BASE volume, so the quote
 * (BRL) leg is approximated as Σ base×close per candle — exact enough for a
 * display total.
 */
export function sumMbCandles(candles: MbCandles, startMs: number, endMs: number): WindowVolume {
  const from = Math.floor(startMs / 1000);
  const to = Math.floor(endMs / 1000);
  let quoteVol = 0;
  for (let i = 0; i < candles.t.length; i++) {
    if (candles.t[i] >= from && candles.t[i] <= to) {
      quoteVol += Number(candles.v[i]) * Number(candles.c[i]);
    }
  }
  return { quoteVol, trades: 0 };
}

/**
 * Mercado Bitcoin: /api/v4/candles with resolution 15m (5m is not served).
 * Boundary candles are counted whole → ≤15min slop at each edge, display-only.
 */
async function mbWindowVolume(symbol: string, startMs: number, endMs: number): Promise<WindowVolume> {
  const from = Math.floor(startMs / 1000);
  const to = Math.floor(endMs / 1000);
  const url = `https://api.mercadobitcoin.net/api/v4/candles?symbol=${symbol}&resolution=15m&from=${from}&to=${to}`;
  const res = await fetch(url, fetchOpts());
  if (!res.ok) throw new Error(`mercadobitcoin ${symbol} HTTP ${res.status}`);
  const body = (await res.json()) as MbCandles;
  if (!Array.isArray(body.t)) throw new Error(`mercadobitcoin ${symbol} malformed candles`);
  return sumMbCandles(body, startMs, endMs);
}

const WINDOW_VOLUME: Record<CexVenue, (inst: string, startMs: number, endMs: number) => Promise<WindowVolume>> = {
  binance: binanceWindowVolume,
  okx: okxWindowVolume,
  gate: gateWindowVolume,
  mexc: mexcWindowVolume,
  bitget: bitgetWindowVolume,
  htx: htxWindowVolume,
  upbit: upbitWindowVolume,
  mercadobitcoin: mbWindowVolume,
};

/** Every venue that lists at least one of the given league tokens. */
export function venuesForTokens(tokens: string[]): CexVenue[] {
  const seen = new Set<CexVenue>();
  for (const token of tokens) {
    for (const venue of Object.keys(CEX_LISTINGS[token] ?? {})) seen.add(venue as CexVenue);
  }
  return [...seen];
}

/** Listings-config sanity, exported for tests. */
export function listingProblems(): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  const knownQuotes = new Set(["USDT", "USDC", "USD", "EUR", "TRY", "BRL", "BTC"]);
  for (const [token, venues] of Object.entries(CEX_LISTINGS)) {
    if (!TOKENS[token]) problems.push(`listing for unknown league token ${token}`);
    for (const [venue, listings] of Object.entries(venues) as [CexVenue, CexListing[]][]) {
      for (const listing of listings) {
        const key = `${venue}:${listing.inst}`;
        if (seen.has(key)) problems.push(`duplicate listing ${key}`);
        seen.add(key);
        if (!knownQuotes.has(listing.quote)) problems.push(`unknown quote ${listing.quote} on ${key}`);
      }
    }
  }
  return problems;
}

/**
 * Refresh CEX venue volume for one match: every listed pair of every featured
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
    `INSERT INTO venue_volume (match_id, source, venue, chain, token, inst, quote, quote_usd, trades, updated_at)
     VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(match_id, source, inst) DO UPDATE SET
       quote_usd = excluded.quote_usd, trades = excluded.trades, updated_at = excluded.updated_at`
  );

  for (const token of tokens) {
    const listings = CEX_LISTINGS[token];
    if (!listings) continue;
    for (const [venue, insts] of Object.entries(listings) as [CexVenue, CexListing[]][]) {
      for (const { inst, quote } of insts) {
        try {
          const rate = await quoteUsdRate(quote);
          if (rate == null) {
            logIndex("warn", `no USD rate for ${quote} — skipping ${venue} ${inst}`, match.id);
            continue;
          }
          const vol = await WINDOW_VOLUME[venue](inst, startMs, endMs);
          upsert.run(
            match.id,
            `cex:${venue}`,
            venue,
            token,
            inst,
            quote,
            vol.quoteVol * rate,
            vol.trades,
            new Date().toISOString()
          );
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
