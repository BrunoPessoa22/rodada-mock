import { getSetting } from "./db";

export interface PotState {
  potChzNow: number;
  dailyChz: number;
  asOf: string;
}

/**
 * The season pot accrues continuously: base amount anchored at a date plus a
 * per-day drip (Community Reserve + sponsor top-ups). The homepage counter
 * animates the real pace — no fake acceleration.
 */
export function getPot(now = new Date()): PotState {
  const base = Number(getSetting("pot_base_chz") ?? 0);
  const daily = Number(getSetting("pot_daily_chz") ?? 0);
  const baseDate = new Date(getSetting("pot_base_date") ?? now.toISOString());
  const elapsedDays = Math.max(0, (now.getTime() - baseDate.getTime()) / 86_400_000);
  return {
    potChzNow: base + daily * elapsedDays,
    dailyChz: daily,
    asOf: now.toISOString(),
  };
}
