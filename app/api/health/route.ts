import { getDb, getSetting } from "@/lib/db";
import { getCurrentMatch } from "@/lib/queries";
import { RUN_INDEXER, INDEXER_INTERVAL_MS } from "@/lib/config";

export const dynamic = "force-dynamic";

/**
 * Liveness/staleness readout for uptime monitors. 200 with indexer freshness
 * fields; 503 only when the database itself is unreachable. Staleness policy
 * lives in the monitor, not here — but `indexerStale` gives a ready-made flag:
 * true when RUN_INDEXER is armed and the last completed tick is older than
 * five intervals.
 */
export async function GET() {
  try {
    getDb().prepare("SELECT 1").get();
  } catch (error) {
    return Response.json({ ok: false, error: String(error) }, { status: 503 });
  }

  const lastTickAt = getSetting("last_tick_at");
  const tickAgeMs = lastTickAt ? Date.now() - new Date(lastTickAt).getTime() : null;
  const match = getCurrentMatch();
  return Response.json({
    ok: true,
    now: new Date().toISOString(),
    indexerArmed: RUN_INDEXER,
    lastTickAt,
    indexerStale: RUN_INDEXER && (tickAgeMs == null || tickAgeMs > 5 * INDEXER_INTERVAL_MS),
    currentMatch: match?.slug ?? null,
    currentWindowEnd: match?.window_end_utc ?? null,
  });
}
