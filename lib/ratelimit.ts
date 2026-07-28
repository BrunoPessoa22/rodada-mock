/**
 * Soft per-IP token bucket for the open beta. In-memory is fine — single
 * container; a restart resetting buckets is harmless.
 */
import { TRUSTED_PROXY_HOPS } from "./config";

const buckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimited(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt < now) {
    if (buckets.size > 10_000) {
      // Evict only EXPIRED buckets. Clearing everything would let one attacker
      // who fills the map reset every honest user's live counter.
      for (const [k, v] of buckets) if (v.resetAt < now) buckets.delete(k);
    }
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return false;
  }
  bucket.count += 1;
  return bucket.count > limit;
}

/**
 * Best-effort client IP. Behind a reverse proxy the client is the Nth entry
 * from the RIGHT of X-Forwarded-For (the closest trusted proxy appends the real
 * peer). Taking the leftmost — as before — trusts a client-supplied value and
 * lets anyone spoof a fresh IP per request to bypass the limiter.
 */
export function clientIp(request: Request): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) {
    const parts = xff.split(",").map((p) => p.trim()).filter(Boolean);
    if (parts.length > 0) {
      const idx = Math.max(0, parts.length - TRUSTED_PROXY_HOPS);
      return parts[idx] ?? parts[parts.length - 1];
    }
  }
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}
