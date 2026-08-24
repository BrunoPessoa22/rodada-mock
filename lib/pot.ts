import { getSetting } from "./db";

export interface PotState {
  /** CHZ the pot is claimed to hold. A TARGET unless `funded` is true. */
  potChzNow: number;
  /** Daily accrual. Zero while unfunded — an unbacked number must not tick up. */
  dailyChz: number;
  asOf: string;
  /**
   * True only once an operator has confirmed a real, funded prize source
   * (settings.funding_verified = '1'). Nothing in the app can verify CHZ
   * exists on its own, so every surface that shows `potChzNow` MUST read this
   * and label the number a target when it is false.
   */
  funded: boolean;
  /** CHZ actually committed to the season board's payout math. */
  seasonPoolChz: number;
}

/**
 * The season pot. When funded, it accrues continuously: base amount anchored at
 * a date plus a per-day drip (Community Reserve + sponsor top-ups), and the
 * homepage counter animates the real pace — no fake acceleration.
 *
 * When NOT funded, the drip is suppressed: a headline prize number that grows
 * by 10,000 CHZ a day with nothing behind it is the single most damaging thing
 * this page can show. The base still renders, but as a stated target.
 */
export function getPot(now = new Date()): PotState {
  const funded = getSetting("funding_verified") === "1";
  const base = Number(getSetting("pot_base_chz") ?? 0);
  const daily = Number(getSetting("pot_daily_chz") ?? 0);
  const baseDate = new Date(getSetting("pot_base_date") ?? now.toISOString());
  const elapsedDays = Math.max(0, (now.getTime() - baseDate.getTime()) / 86_400_000);
  return {
    potChzNow: funded ? base + daily * elapsedDays : base,
    dailyChz: funded ? daily : 0,
    asOf: now.toISOString(),
    funded,
    seasonPoolChz: Number(getSetting("season_pool_chz") ?? 0),
  };
}
