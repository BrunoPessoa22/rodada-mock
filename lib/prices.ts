export interface ChzPrice {
  usd: number;
  brl: number;
  change24h: number;
}

let cache: { price: ChzPrice; fetchedAt: number } | null = null;
const TTL_MS = 5 * 60 * 1000;

/**
 * CHZ spot price from CoinGecko's free endpoint, cached 5 minutes. Returns null
 * on any failure — callers must degrade gracefully (hide the chip, refuse to
 * finalize scoring) rather than show a stale or invented price.
 */
export async function getChzPrice(): Promise<ChzPrice | null> {
  if (cache && Date.now() - cache.fetchedAt < TTL_MS) return cache.price;
  try {
    const res = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=chiliz&vs_currencies=usd,brl&include_24hr_change=true",
      { signal: AbortSignal.timeout(8000), cache: "no-store" }
    );
    if (!res.ok) return cache?.price ?? null;
    const body = (await res.json()) as {
      chiliz?: { usd?: number; brl?: number; usd_24h_change?: number };
    };
    const c = body.chiliz;
    if (!c?.usd || !c?.brl) return cache?.price ?? null;
    const price = { usd: c.usd, brl: c.brl, change24h: c.usd_24h_change ?? 0 };
    cache = { price, fetchedAt: Date.now() };
    return price;
  } catch {
    return cache?.price ?? null;
  }
}
