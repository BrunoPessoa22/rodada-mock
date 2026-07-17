/**
 * Next.js instrumentation hook — starts the in-process indexer loop in the
 * deployed container (RUN_INDEXER=1). Scores every open match window on an
 * interval and finalizes windows after they close.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { RUN_INDEXER, INDEXER_INTERVAL_MS } = await import("./lib/config");
  console.log(
    JSON.stringify({ level: "info", msg: `indexer loop ${RUN_INDEXER ? "armed" : "disabled (RUN_INDEXER!=1)"}` })
  );
  if (!RUN_INDEXER) return;

  const { scoreDueMatches } = await import("./lib/indexer");
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await scoreDueMatches();
    } catch (error) {
      console.error(JSON.stringify({ level: "error", msg: `indexer tick failed: ${String(error)}` }));
    } finally {
      running = false;
    }
  };
  setTimeout(tick, 10_000);
  setInterval(tick, INDEXER_INTERVAL_MS);
}
