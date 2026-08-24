/**
 * Next.js instrumentation hook — starts the in-process indexer loop in the
 * deployed container (RUN_INDEXER=1). Scores every open match window on an
 * interval, refreshes tracked-venue volume (CEX + Solana/Base pools), writes a
 * liveness heartbeat for /api/health, and takes a daily SQLite backup.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { RUN_INDEXER, INDEXER_INTERVAL_MS } = await import("./lib/config");
  console.log(
    JSON.stringify({ level: "info", msg: `indexer loop ${RUN_INDEXER ? "armed" : "disabled (RUN_INDEXER!=1)"}` })
  );
  if (!RUN_INDEXER) return;

  const { scoreDueMatches } = await import("./lib/indexer");
  const { refreshDueCexVolume } = await import("./lib/cex");
  const { refreshDueDexVolume } = await import("./lib/dexvol");
  const { refreshDueVibeVolume } = await import("./lib/vibe");
  const { backupDb, setSetting } = await import("./lib/db");
  const { CEX_REFRESH_MS } = await import("./lib/config");
  let running = false;
  let lastVenueRefresh = 0;
  let lastBackup = 0;
  const BACKUP_INTERVAL_MS = 24 * 60 * 60 * 1000;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await scoreDueMatches();
      if (Date.now() - lastVenueRefresh >= CEX_REFRESH_MS) {
        lastVenueRefresh = Date.now();
        await refreshDueCexVolume();
        await refreshDueDexVolume();
        await refreshDueVibeVolume();
      }
      if (Date.now() - lastBackup >= BACKUP_INTERVAL_MS) {
        lastBackup = Date.now();
        try {
          const file = await backupDb();
          console.log(JSON.stringify({ level: "info", msg: `db backup written: ${file}` }));
        } catch (error) {
          console.error(JSON.stringify({ level: "error", msg: `db backup failed: ${String(error)}` }));
        }
      }
      // Heartbeat LAST — it only moves when a full tick actually completed, so
      // /api/health staleness catches a wedged loop, not just a dead process.
      setSetting("last_tick_at", new Date().toISOString());
    } catch (error) {
      console.error(JSON.stringify({ level: "error", msg: `indexer tick failed: ${String(error)}` }));
    } finally {
      running = false;
    }
  };
  setTimeout(tick, 10_000);
  setInterval(tick, INDEXER_INTERVAL_MS);
}
