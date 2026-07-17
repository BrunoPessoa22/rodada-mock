import { getDb } from "./db";

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

export function listMatches(): MatchRow[] {
  return getDb()
    .prepare("SELECT * FROM matches ORDER BY kickoff_utc ASC")
    .all() as MatchRow[];
}

export function getMatchBySlug(slug: string): MatchRow | undefined {
  return getDb().prepare("SELECT * FROM matches WHERE slug = ?").get(slug) as
    | MatchRow
    | undefined;
}

/** The match whose window is open now, else the next scheduled one. */
export function getCurrentMatch(now = new Date()): MatchRow | undefined {
  const iso = now.toISOString();
  const db = getDb();
  const open = db
    .prepare(
      "SELECT * FROM matches WHERE window_start_utc <= ? AND window_end_utc > ? ORDER BY featured DESC, kickoff_utc ASC LIMIT 1"
    )
    .get(iso, iso) as MatchRow | undefined;
  if (open) return open;
  return db
    .prepare("SELECT * FROM matches WHERE window_end_utc > ? ORDER BY kickoff_utc ASC LIMIT 1")
    .get(iso) as MatchRow | undefined;
}

interface ScoreAggRow {
  address: string;
  points: number;
  net_taker_usd: number;
  maker_add_usd: number;
  swaps: number;
  handle: string | null;
  wallet_status: string | null;
  venue: string | null;
}

export function getLeaderboard(opts: {
  matchId?: number;
  poolChz: number;
  limit?: number;
}): { entries: LeaderboardEntry[]; totalPoints: number; wallets: number } {
  const db = getDb();
  const where = opts.matchId ? "WHERE s.match_id = ?" : "";
  const params = opts.matchId ? [opts.matchId] : [];
  const rows = db
    .prepare(
      `SELECT s.address,
              SUM(s.points) AS points,
              SUM(s.net_taker_usd) AS net_taker_usd,
              SUM(s.maker_add_usd) AS maker_add_usd,
              SUM(s.swaps) AS swaps,
              w.handle, w.status AS wallet_status, w.venue
         FROM scores s
         LEFT JOIN wallets w ON w.address = s.address
         ${where}
        GROUP BY s.address
       HAVING SUM(s.points) > 0
        ORDER BY points DESC`
    )
    .all(...params) as ScoreAggRow[];

  const totalPoints = rows.reduce((sum, r) => sum + r.points, 0);
  const limit = opts.limit ?? 50;

  const entries = rows.slice(0, limit).map((r, i) => {
    const verified = r.wallet_status === "verified" && !!r.handle;
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
      projectedChz: totalPoints > 0 ? (r.points / totalPoints) * opts.poolChz : 0,
    };
  });

  return { entries, totalPoints, wallets: rows.length };
}
