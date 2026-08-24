import { ACTIVE_SEASON_DEFAULT } from "./config";
import { getDb, getSetting } from "./db";

export interface MatchRow {
  id: number;
  slug: string;
  home: string;
  away: string;
  competition: string;
  kickoff_utc: string;
  window_start_utc: string;
  window_end_utc: string;
  featured: number;
  status: "scheduled" | "live" | "scored";
  tokens: string;
  pool_chz: number;
  chz_usd: number | null;
  scored_at: string | null;
  frozen_prices: string | null;
  season: string | null;
}

export interface LeaderboardEntry {
  rank: number;
  address: string;
  display: string;
  verified: boolean;
  venue: string | null;
  points: number;
  netTakerUsd: number;
  makerNetAddUsd: number;
  swaps: number;
  projectedChz: number;
}

export function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

/** The season the public board reads. Everything else is archive. */
export function activeSeason(): string {
  return getSetting("active_season") ?? ACTIVE_SEASON_DEFAULT;
}

export function listMatches(season?: string): MatchRow[] {
  const db = getDb();
  if (season === undefined) {
    return db.prepare("SELECT * FROM matches ORDER BY kickoff_utc ASC").all() as MatchRow[];
  }
  return db
    .prepare("SELECT * FROM matches WHERE season = ? ORDER BY kickoff_utc ASC")
    .all(season) as MatchRow[];
}

/** Seasons that have at least one match, newest activity first. */
export function listSeasons(): { season: string; matches: number; lastKickoff: string }[] {
  return getDb()
    .prepare(
      `SELECT season, COUNT(*) AS matches, MAX(kickoff_utc) AS lastKickoff
         FROM matches WHERE season IS NOT NULL
        GROUP BY season ORDER BY lastKickoff DESC`
    )
    .all() as { season: string; matches: number; lastKickoff: string }[];
}

export function getMatchBySlug(slug: string): MatchRow | undefined {
  return getDb().prepare("SELECT * FROM matches WHERE slug = ?").get(slug) as
    | MatchRow
    | undefined;
}

/**
 * The active season's match whose window is open now, else its next scheduled
 * one. Scoped to the active season so an archived board can never resurface as
 * "this week's match".
 */
export function getCurrentMatch(now = new Date()): MatchRow | undefined {
  const iso = now.toISOString();
  const season = activeSeason();
  const db = getDb();
  const open = db
    .prepare(
      `SELECT * FROM matches WHERE season = ? AND window_start_utc <= ? AND window_end_utc > ?
        ORDER BY featured DESC, kickoff_utc ASC LIMIT 1`
    )
    .get(season, iso, iso) as MatchRow | undefined;
  if (open) return open;
  return db
    .prepare(
      "SELECT * FROM matches WHERE season = ? AND window_end_utc > ? ORDER BY kickoff_utc ASC LIMIT 1"
    )
    .get(season, iso) as MatchRow | undefined;
}

export interface VenueVolumeRow {
  source: string; // cex:binance | solana:meteora | base:aerodrome…
  venue: string; // binance | meteora | aerodrome…
  chain: string | null; // NULL for CEX
  quoteUsd: number;
  trades: number;
  pairs: number;
  updatedAt: string | null;
}

/** Window volume per tracked venue for a match, summed across its pairs/pools. */
export function getVenueVolume(matchId: number): VenueVolumeRow[] {
  return getDb()
    .prepare(
      `SELECT source, venue, chain, SUM(quote_usd) AS quoteUsd, SUM(trades) AS trades,
              COUNT(*) AS pairs, MAX(updated_at) AS updatedAt
         FROM venue_volume WHERE match_id = ?
        GROUP BY source ORDER BY quoteUsd DESC`
    )
    .all(matchId) as VenueVolumeRow[];
}

export interface KeyedVenueVolumeRow {
  venue: string; // binance | okx
  usd: number; // buy + sell USD across connected accounts
  traders: number; // distinct connected wallets with fills
}

/**
 * Volume attributed through read-only key connections, per venue. Unlike
 * venue_volume (market-wide candles) this is the players' OWN fills — the
 * "verified" sliver of a venue's tracked total.
 */
export function getKeyedVenueVolume(matchId: number): KeyedVenueVolumeRow[] {
  return getDb()
    .prepare(
      `SELECT venue, SUM(buy_usd + sell_usd) AS usd, COUNT(DISTINCT address) AS traders
         FROM keyed_cex_volume WHERE match_id = ? GROUP BY venue ORDER BY usd DESC`
    )
    .all(matchId) as KeyedVenueVolumeRow[];
}

/** Gross on-chain taker volume (buys + sells, USD) counted for a match. */
export function getOnchainVolume(matchId: number): number {
  const row = getDb()
    .prepare("SELECT SUM(gross_buy_usd + gross_sell_usd) AS vol FROM scores WHERE match_id = ?")
    .get(matchId) as { vol: number | null };
  return row.vol ?? 0;
}

interface ScoreAggRow {
  address: string;
  points: number;
  net_taker_usd: number;
  maker_add_usd: number;
  swaps: number;
  updated_at: string | null;
  handle: string | null;
  wallet_status: string | null;
  venue: string | null;
  created_at: string | null;
}

export function getLeaderboard(opts: {
  matchId?: number;
  /** Season to aggregate when no single match is targeted. Defaults to the
   * active season; pass an explicit season to render an archived board. */
  season?: string;
  poolChz: number;
  limit?: number;
}): {
  entries: LeaderboardEntry[];
  totalPoints: number;
  payablePoints: number;
  /** Points held by wallets that have not verified — visible on the board,
   * but their share is never paid out (it stays in the pot). */
  unclaimedPoints: number;
  wallets: number;
  /** Newest score write in this scope — the board's real "as of". */
  updatedAt: string | null;
} {
  const db = getDb();
  const where = opts.matchId
    ? "WHERE s.match_id = ?"
    : "JOIN matches m ON m.id = s.match_id WHERE m.season = ?";
  const params = opts.matchId ? [opts.matchId] : [opts.season ?? activeSeason()];
  const scoreRows = db
    .prepare(
      `SELECT s.address,
              SUM(s.points) AS points,
              SUM(s.net_taker_usd) AS net_taker_usd,
              SUM(s.maker_add_usd) AS maker_add_usd,
              SUM(s.swaps) AS swaps,
              MAX(s.updated_at) AS updated_at,
              w.handle, w.status AS wallet_status, w.venue, w.created_at
         FROM scores s
         LEFT JOIN wallets w ON w.address = s.address
         ${where}
        GROUP BY s.address
       HAVING SUM(s.points) > 0
        ORDER BY points DESC`
    )
    .all(...params) as ScoreAggRow[];

  const isVerified = (r: ScoreAggRow) => r.wallet_status === "verified" && !!r.handle;
  const scoredAddresses = new Set(scoreRows.map((row) => row.address));
  const verifiedWallets = db
    .prepare(
      `SELECT w.address,
              0 AS points,
              0 AS net_taker_usd,
              0 AS maker_add_usd,
              0 AS swaps,
              NULL AS updated_at,
              w.handle, w.status AS wallet_status, w.venue, w.created_at
         FROM wallets w
        WHERE w.status = 'verified'
          AND w.handle IS NOT NULL
          AND TRIM(w.handle) <> ''`
    )
    .all() as ScoreAggRow[];

  // Scorers first; verified signups with zero points appear next (newest first)
  // so claiming a wallet shows you on the board before the first trade.
  const rows = [
    ...scoreRows,
    ...verifiedWallets.filter((row) => !scoredAddresses.has(row.address)),
  ].sort(
    (a, b) =>
      b.points - a.points ||
      Number(isVerified(b)) - Number(isVerified(a)) ||
      (b.created_at ?? "").localeCompare(a.created_at ?? "") ||
      a.address.localeCompare(b.address)
  );

  const totalPoints = rows.reduce((sum, r) => sum + r.points, 0);
  // Points held by verified identities — the only points that are ever paid.
  const payablePoints = rows.reduce((sum, r) => (isVerified(r) ? sum + r.points : sum), 0);
  const unclaimedPoints = Math.max(0, totalPoints - payablePoints);
  const limit = opts.limit ?? 50;
  const updatedAt = rows.reduce<string | null>(
    (latest, r) => (r.updated_at && (!latest || r.updated_at > latest) ? r.updated_at : latest),
    null
  );

  const entries = rows.slice(0, limit).map((r, i) => {
    const verified = isVerified(r);
    return {
      rank: i + 1,
      address: r.address,
      display: verified ? (r.handle as string) : shortAddress(r.address),
      verified,
      venue: r.venue,
      points: r.points,
      netTakerUsd: r.net_taker_usd,
      makerNetAddUsd: r.maker_add_usd,
      swaps: r.swaps,
      // Share = your points ÷ ALL points on the board. Dividing by the VERIFIED
      // subset instead (the old behaviour) hands the entire pool to whoever
      // verifies first: one verified wallet with 1 point out of 4,000 on the
      // board would be projected 100% of the pot. The share belonging to wallets
      // that never verify is simply not paid — it stays in the pot for the next
      // matchday — which is also the rule a trader can check for themselves.
      projectedChz: verified && totalPoints > 0 ? (r.points / totalPoints) * opts.poolChz : 0,
    };
  });

  return {
    entries,
    totalPoints,
    payablePoints,
    unclaimedPoints,
    wallets: scoreRows.length,
    updatedAt,
  };
}
