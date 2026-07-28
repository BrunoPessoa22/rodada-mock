import { getDb, getSetting } from "./db";
import { getLeaderboard, getMatchBySlug } from "./queries";

export interface PayoutRow {
  address: string;
  handle: string;
  points: number;
  chz: number;
}

export interface Settlement {
  scope: string;
  poolChz: number;
  payablePoints: number;
  rows: PayoutRow[];
}

/**
 * Compute the pro-rata CHZ payout per verified identity for a match (by slug) or
 * for the whole season. This is the same math the leaderboard previews
 * (projectedChz = points / payablePoints × pool), materialized as a settlement
 * table. Only verified, payable identities with a positive share are included.
 *
 * NOTE: this computes who is owed what. On-chain disbursement is a separate,
 * human-authorized step (a funded wallet must actually send the CHZ) — see
 * recordSettlement/markPaid.
 */
export function computeSettlement(opts: { slug?: string }): Settlement {
  if (opts.slug) {
    const match = getMatchBySlug(opts.slug);
    if (!match) throw new Error(`match not found: ${opts.slug}`);
    const board = getLeaderboard({ matchId: match.id, poolChz: match.pool_chz, limit: 1_000_000 });
    return toSettlement(match.slug, match.pool_chz, board);
  }
  const poolChz = Number(getSetting("season_pool_chz") ?? 0);
  const board = getLeaderboard({ poolChz, limit: 1_000_000 });
  return toSettlement("season", poolChz, board);
}

function toSettlement(
  scope: string,
  poolChz: number,
  board: ReturnType<typeof getLeaderboard>
): Settlement {
  const rows: PayoutRow[] = board.entries
    .filter((e) => e.verified && e.projectedChz > 0)
    .map((e) => ({ address: e.address, handle: e.display, points: e.points, chz: e.projectedChz }));
  return { scope, poolChz, payablePoints: board.payablePoints, rows };
}

/** Persist a settlement to the payouts table (replacing any prior computation
 * for the same scope). Rows are 'computed' until marked paid with a tx hash. */
export function recordSettlement(settlement: Settlement): number {
  const db = getDb();
  const nowIso = new Date().toISOString();
  const write = db.transaction(() => {
    db.prepare("DELETE FROM payouts WHERE scope = ? AND status = 'computed'").run(settlement.scope);
    const insert = db.prepare(
      `INSERT INTO payouts (scope, address, handle, points, chz, computed_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(scope, address) DO UPDATE SET
         handle = excluded.handle, points = excluded.points, chz = excluded.chz,
         computed_at = excluded.computed_at
       WHERE payouts.status = 'computed'`
    );
    for (const r of settlement.rows) {
      insert.run(settlement.scope, r.address, r.handle, r.points, r.chz, nowIso);
    }
  });
  write();
  return settlement.rows.length;
}

/** CSV of a settlement, for hand-off to whoever executes the CHZ transfers. */
export function settlementCsv(settlement: Settlement): string {
  const header = "scope,address,handle,points,chz";
  const lines = settlement.rows.map(
    (r) => `${settlement.scope},${r.address},${JSON.stringify(r.handle)},${r.points},${r.chz.toFixed(4)}`
  );
  return [header, ...lines].join("\n");
}
