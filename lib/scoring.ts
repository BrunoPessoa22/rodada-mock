/**
 * Fan Token Trader League scoring — the public formula.
 *
 * This file IS the scoring spec. Anyone can recompute the leaderboard from
 * public Chiliz Chain data plus this function:
 *
 *   SkillScore = max(PnL% + F, 0)     // F = SKILL_FLOOR_PCT, default 0
 *   Points     = SkillScore × (1 − e^(−Volume / V_target))
 *
 * Where:
 *  - PnL%  = cash-flow + mark-to-market inventory, as % of capital deployed.
 *            Capital = max(buy USD, sell USD) so a book that liquidates a large
 *            pre-window position with a tiny in-window buy can't divide its
 *            profit by a near-zero denominator (the "free option").
 *  - F     = skill floor, default 0 → PROFIT-ONLY: break-even and losses score
 *            0, only profit scores. This is the anti-wash guarantee: a
 *            self-round-trip nets ~0 PnL, so gross volume alone earns nothing.
 *  - Volume = gross buy + gross sell USD in the match window, plus net
 *             liquidity added (maker depth counts toward the unlock). Volume
 *             only QUALIFIES (unlocks the multiplier); with zero profit it
 *             multiplies zero.
 *  - V_target = VOLUME_TARGET_USD (default 1000). At V = V_target the
 *               multiplier is ≈ 0.632; at 3×V_target ≈ 0.95.
 *
 * Enforced properties:
 *  - Worst outcome floors at 0 (no negative points); break-even scores 0.
 *  - Wash trading scores 0: a flat round-trip has ~zero PnL → zero points,
 *    regardless of volume. ("Points only for real, net trading.")
 *  - Buy-and-hold earns from price move: remaining inventory is marked at the
 *    frozen close-time pool price (inventoryMarkUsd from the indexer; frozen at
 *    finalization so a rescore reproduces the same board).
 *  - Collateral counts, notional doesn't: on-chain spot flows are unlevered
 *    by nature; venue integrations must report collateral-based flow.
 *
 * Sybil defense: scoring nets per KYC IDENTITY, not per wallet — flows from
 * every wallet linked to an identity (wallets.identity_id, set by an admin via
 * /api/admin/identity) are summed by mergeFlowsByIdentity() BEFORE the formula.
 * Payout is renormalized over verified identities only (see getLeaderboard).
 */

import { SKILL_FLOOR_PCT, VOLUME_TARGET_USD } from "./config";

export interface WalletFlow {
  /** Lowercase 0x address the flow is attributed to (transaction sender). */
  address: string;
  /** USD spent buying the match's tokens inside the window. */
  grossBuyUsd: number;
  /** USD received selling the match's tokens inside the window. */
  grossSellUsd: number;
  /** USD value of liquidity added to the match's pools inside the window. */
  makerAddUsd: number;
  /** USD value of liquidity removed from the match's pools inside the window. */
  makerRemoveUsd: number;
  /**
   * Mark-to-market USD of remaining net fan-token inventory at score-time
   * pool prices. Buy 100 of tokens still held → inventory ≈ 100×mark.
   * Zero when flat. Set by the indexer from Swap token legs + reserves.
   */
  inventoryMarkUsd: number;
  /** Number of swaps observed (display only — never affects points). */
  swaps: number;
}

export interface WalletScore {
  address: string;
  grossBuyUsd: number;
  grossSellUsd: number;
  /** Signed: grossBuyUsd − grossSellUsd. */
  netTakerUsd: number;
  /** max(0, makerAddUsd − makerRemoveUsd). */
  makerNetAddUsd: number;
  /** Cash-flow + inventory MTM, as % of capital deployed. */
  pnlPct: number;
  pnlUsd: number;
  /** max(PnL% + F, 0) — skill component before volume unlock. */
  skillScore: number;
  /** 1 − e^(−Volume / V_target), in [0, 1). */
  volumeMultiplier: number;
  volumeUsd: number;
  swaps: number;
  points: number;
}

/** Volume unlock factor in [0, 1). At V = V_target ≈ 0.632. */
export function volumeMultiplier(volumeUsd: number, volumeTargetUsd: number): number {
  if (volumeUsd <= 0 || volumeTargetUsd <= 0) return 0;
  return 1 - Math.exp(-volumeUsd / volumeTargetUsd);
}

/**
 * Shift PnL% by the skill floor F. Default F = 0 → SkillScore = max(PnL%, 0):
 * profit scores, break-even and losses score 0. (A positive F would make a
 * flat book score ~F — see the SKILL_FLOOR_PCT warning in config.ts.)
 */
export function skillScore(pnlPct: number, floorPct: number = SKILL_FLOOR_PCT): number {
  return Math.max(pnlPct + floorPct, 0);
}

/**
 * Cash-flow + MTM inventory, as percent of capital deployed. Capital is the
 * larger of buy and sell USD, so liquidating a large pre-window position with a
 * tiny in-window buy can't shrink the denominator toward zero and inflate PnL%.
 */
export function computePnl(flow: {
  grossBuyUsd: number;
  grossSellUsd: number;
  inventoryMarkUsd: number;
}): { pnlUsd: number; pnlPct: number; capitalUsd: number } {
  const pnlUsd = flow.grossSellUsd - flow.grossBuyUsd + flow.inventoryMarkUsd;
  const capitalUsd = Math.max(flow.grossBuyUsd, flow.grossSellUsd);
  const pnlPct = capitalUsd > 0 ? (pnlUsd / capitalUsd) * 100 : 0;
  return { pnlUsd, pnlPct, capitalUsd };
}

export function scoreWallet(
  flow: WalletFlow,
  opts: { volumeTargetUsd?: number; skillFloorPct?: number } = {}
): WalletScore {
  const volumeTargetUsd = opts.volumeTargetUsd ?? VOLUME_TARGET_USD;
  const floorPct = opts.skillFloorPct ?? SKILL_FLOOR_PCT;
  const netTakerUsd = flow.grossBuyUsd - flow.grossSellUsd;
  const makerNetAddUsd = Math.max(0, flow.makerAddUsd - flow.makerRemoveUsd);

  // Taker volume + net LP depth (maker counts toward unlock only).
  const volumeUsd = flow.grossBuyUsd + flow.grossSellUsd + makerNetAddUsd;
  const { pnlUsd, pnlPct } = computePnl(flow);
  const skill = skillScore(pnlPct, floorPct);
  const mult = volumeMultiplier(volumeUsd, volumeTargetUsd);
  const points = skill * mult;

  return {
    address: flow.address,
    grossBuyUsd: flow.grossBuyUsd,
    grossSellUsd: flow.grossSellUsd,
    netTakerUsd,
    makerNetAddUsd,
    pnlPct,
    pnlUsd,
    skillScore: skill,
    volumeMultiplier: mult,
    volumeUsd,
    swaps: flow.swaps,
    points,
  };
}

export function scoreWindow(
  flows: WalletFlow[],
  opts: { volumeTargetUsd?: number; skillFloorPct?: number } = {}
): WalletScore[] {
  return flows
    .map((flow) => scoreWallet(flow, opts))
    .filter((score) => score.points > 0)
    .sort(
      (a, b) =>
        b.points - a.points || b.skillScore - a.skillScore || b.volumeUsd - a.volumeUsd
    );
}

/**
 * Collapse per-wallet flows into per-identity flows before scoring. `identityOf`
 * maps a wallet address to its scoring key (the identity's primary address, or
 * the address itself when it belongs to no group). Raw USD components are summed,
 * so netting and the formula then apply to the identity's TOTAL flow.
 */
export function mergeFlowsByIdentity(
  flows: WalletFlow[],
  identityOf: (address: string) => string
): WalletFlow[] {
  const merged = new Map<string, WalletFlow>();
  for (const f of flows) {
    const key = identityOf(f.address);
    const m = merged.get(key);
    if (!m) {
      merged.set(key, { ...f, address: key });
    } else {
      m.grossBuyUsd += f.grossBuyUsd;
      m.grossSellUsd += f.grossSellUsd;
      m.makerAddUsd += f.makerAddUsd;
      m.makerRemoveUsd += f.makerRemoveUsd;
      m.inventoryMarkUsd += f.inventoryMarkUsd;
      m.swaps += f.swaps;
    }
  }
  return [...merged.values()];
}
