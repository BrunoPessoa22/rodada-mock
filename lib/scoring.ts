/**
 * Rodada league scoring — the public formula.
 *
 * This file IS the scoring spec. Anyone can recompute the leaderboard from
 * public Chiliz Chain data plus this function (League Proposal v2, "Scoring —
 * one formula, everyone"):
 *
 *   points = √(net buying or selling, in USD, during the match window)
 *            × 2 on featured matches
 *            × 2 if providing liquidity instead of taking it
 *
 * Enforced properties:
 *  - Round-trips cancel: buys and sells NET before the square root, so wash
 *    volume scores zero by construction.
 *  - Collateral counts, notional doesn't: on-chain spot flows are unlevered by
 *    nature; venue integrations must report collateral-based flow.
 *  - A wallet that both trades and provides liquidity earns each component on
 *    its own net amount: √|netTakerUsd| + 2·√(max(0, makerAddUsd − makerRemoveUsd)),
 *    all × 2 when the match is featured.
 *
 * Known limitation (beta): netting is per-wallet, so two colluding wallets
 * wash-trading against each other each show one-sided net flow. Pilot
 * mitigation is manual review before any payout — flow-pattern clustering
 * (shared funding source, mirrored timing) is the planned automated filter
 * before the league opens beyond manually onboarded participants.
 */

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
  swaps: number;
  points: number;
}

const FEATURED_MULTIPLIER = 2;
const MAKER_MULTIPLIER = 2;

export function scoreWallet(flow: WalletFlow, opts: { featured: boolean }): WalletScore {
  const netTakerUsd = flow.grossBuyUsd - flow.grossSellUsd;
  const makerNetAddUsd = Math.max(0, flow.makerAddUsd - flow.makerRemoveUsd);

  const takerPoints = Math.sqrt(Math.abs(netTakerUsd));
  const makerPoints = MAKER_MULTIPLIER * Math.sqrt(makerNetAddUsd);
  const featured = opts.featured ? FEATURED_MULTIPLIER : 1;

  return {
    address: flow.address,
    grossBuyUsd: flow.grossBuyUsd,
    grossSellUsd: flow.grossSellUsd,
    netTakerUsd,
    makerNetAddUsd,
    swaps: flow.swaps,
    points: (takerPoints + makerPoints) * featured,
  };
}

export function scoreWindow(flows: WalletFlow[], opts: { featured: boolean }): WalletScore[] {
  return flows
    .map((flow) => scoreWallet(flow, opts))
    .filter((score) => score.points > 0)
    .sort((a, b) => b.points - a.points);
}
