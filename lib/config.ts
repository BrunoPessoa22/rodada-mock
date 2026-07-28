import path from "node:path";

export const DATA_DIR = process.env.DATA_DIR ?? path.join(process.cwd(), "data");
export const DB_PATH = path.join(DATA_DIR, "rodada.db");

export const ADMIN_TOKEN = process.env.ADMIN_TOKEN ?? "";

export const RPC_URL = process.env.CHILIZ_RPC_URL ?? "https://rpc.chiliz.com";

// Number of trusted reverse-proxy hops in front of the app (Traefik = 1). The
// real client IP is the Nth entry from the RIGHT of X-Forwarded-For; anything
// further left is client-supplied and must never be trusted for rate limiting.
const rawHops = Number(process.env.TRUSTED_PROXY_HOPS ?? 1);
export const TRUSTED_PROXY_HOPS =
  Number.isFinite(rawHops) && rawHops >= 1 ? Math.floor(rawHops) : 1;

// In-process indexer: polls open match windows and rescoring. Enabled only in
// the deployed container (RUN_INDEXER=1) so `next dev` never double-counts.
export const RUN_INDEXER = process.env.RUN_INDEXER === "1";
// Clamp like the other interval configs: a malformed value must never produce a
// sub-second tick storm against the RPC. Floor at 10s, default 3min.
const rawIndexerMs = Number(process.env.INDEXER_INTERVAL_MS ?? 3 * 60 * 1000);
export const INDEXER_INTERVAL_MS =
  Number.isFinite(rawIndexerMs) && rawIndexerMs >= 10_000 ? Math.floor(rawIndexerMs) : 3 * 60 * 1000;

// CEX venue-volume refresh cadence (piggybacks on the indexer loop). Coarser
// than the 3-min scoring tick — venue volume is display data, and a full-window
// refetch per pair every tick would hammer public candle endpoints for nothing.
const rawCexMs = Number(process.env.CEX_REFRESH_MS ?? 10 * 60 * 1000);
export const CEX_REFRESH_MS =
  Number.isFinite(rawCexMs) && rawCexMs >= 60_000 ? Math.floor(rawCexMs) : 10 * 60 * 1000;

// Maker anti-JIT cooldown: liquidity must stay in the pool this long PAST the
// window close to keep counting toward the volume unlock. Burns observed in
// [window_end, window_end + cooldown] are clawed back against in-window adds,
// so a mint-at-close / burn-after-whistle flash earns nothing. Finalization
// waits for this cooldown to elapse before freezing the board. Default 6h.
const rawCooldown = Number(process.env.MAKER_COOLDOWN_S ?? 6 * 3600);
export const MAKER_COOLDOWN_S =
  Number.isFinite(rawCooldown) && rawCooldown >= 0 ? Math.floor(rawCooldown) : 6 * 3600;

// Volume unlock target for Points = SkillScore × (1 − e^(−Volume / V_target)).
// At V = V_target the multiplier is ≈ 63%; at 3× ≈ 95%. Default $1,000.
const rawVolumeTarget = Number(process.env.VOLUME_TARGET_USD ?? 1000);
export const VOLUME_TARGET_USD =
  Number.isFinite(rawVolumeTarget) && rawVolumeTarget > 0 ? rawVolumeTarget : 1000;

// Skill floor F: SkillScore = max(PnL% + F, 0). DEFAULT 0 → profit-only: a
// break-even or losing book scores 0, only realized/marked profit scores. This
// is what keeps wash trading worthless — a self-round-trip nets ~0 PnL, so no
// amount of gross volume earns points. A positive F re-introduces the "flat
// book with volume scores ~F" behavior (the old Option-B floor) and MUST NOT be
// set above 0 without also switching the volume unlock to net-of-round-trip
// exposure, or wash farming becomes profitable again.
const rawSkillFloor = Number(process.env.SKILL_FLOOR_PCT ?? 0);
export const SKILL_FLOOR_PCT =
  Number.isFinite(rawSkillFloor) && rawSkillFloor >= 0 ? rawSkillFloor : 0;

// Season pot: base amount at an anchor date + daily accrual. Values live in the
// settings table (admin-editable); these are the seed defaults.
export const POT_DEFAULTS = {
  pot_base_chz: "1247500",
  pot_base_date: "2026-07-16T00:00:00Z",
  pot_daily_chz: "10000",
};
