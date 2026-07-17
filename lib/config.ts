import path from "node:path";

export const DATA_DIR = process.env.DATA_DIR ?? path.join(process.cwd(), "data");
export const DB_PATH = path.join(DATA_DIR, "rodada.db");

export const ADMIN_TOKEN = process.env.ADMIN_TOKEN ?? "";

export const RPC_URL = process.env.CHILIZ_RPC_URL ?? "https://rpc.chiliz.com";

// In-process indexer: polls open match windows and rescoring. Enabled only in
// the deployed container (RUN_INDEXER=1) so `next dev` never double-counts.
export const RUN_INDEXER = process.env.RUN_INDEXER === "1";
export const INDEXER_INTERVAL_MS = Number(process.env.INDEXER_INTERVAL_MS ?? 3 * 60 * 1000);

// Season pot: base amount at an anchor date + daily accrual. Values live in the
// settings table (admin-editable); these are the seed defaults.
export const POT_DEFAULTS = {
  pot_base_chz: "1247500",
  pot_base_date: "2026-07-16T00:00:00Z",
  pot_daily_chz: "10000",
};
