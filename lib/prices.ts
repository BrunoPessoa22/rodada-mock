export interface ChzPrice {
  usd: number;
  brl: number;
  change24h: number;
}

let cache: { price: ChzPrice; fetchedAt: number } | null = null;
const TTL_MS = 5 * 60 * 1000;

async function refresh(): Promise<void> {
  try {
    const res = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=chiliz&vs_currencies=usd,brl&include_24hr_change=true",
      { signal: AbortSignal.timeout(8000), cache: "no-store" }
    );
    if (!res.ok) return;
    const body = (await res.json()) as {
      chiliz?: { usd?: number; brl?: number; usd_24h_change?: number };
    };
    const c = body.chiliz;
    if (!c?.usd || !c?.brl) return;
    cache = {
      price: { usd: c.usd, brl: c.brl, change24h: c.usd_24h_change ?? 0 },
      fetchedAt: Date.now(),
    };
  } catch {
    /* keep whatever cache we have */
  }
}

/**
 * CHZ spot price, cached 5 minutes. Lenient: may serve a stale cached price
 * when CoinGecko is unreachable — fine for display and provisional scoring.
 * Returns null only when no price was ever fetched.
 */
export async function getChzPrice(): Promise<ChzPrice | null> {
  if (!cache || Date.now() - cache.fetchedAt >= TTL_MS) await refresh();
  return cache?.price ?? null;
}

/**
 * Strict variant for finalization: returns the price only if it was fetched
 * within maxAgeMs, else null. Finalizing a leaderboard must never bake in an
 * hours-old price from a long outage.
 */
export async function getFreshChzPrice(maxAgeMs: number): Promise<ChzPrice | null> {
  if (!cache || Date.now() - cache.fetchedAt >= Math.min(TTL_MS, maxAgeMs)) await refresh();
  if (cache && Date.now() - cache.fetchedAt < maxAgeMs) return cache.price;
  return null;
}
