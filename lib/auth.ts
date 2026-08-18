import { timingSafeEqual } from "node:crypto";
import { ADMIN_TOKEN } from "./config";
import { clientIp, rateLimited } from "./ratelimit";

export function isAdmin(request: Request): boolean {
  if (!ADMIN_TOKEN) return false;
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const a = Buffer.from(token);
  const b = Buffer.from(ADMIN_TOKEN);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function requireAdmin(request: Request): Response | null {
  if (isAdmin(request)) return null;
  // Lockout on FAILED attempts only — a valid token never touches the bucket,
  // so the admin can't be locked out by their own traffic. 10 bad guesses per
  // 15 minutes per IP turns an online brute force of the bearer token from
  // millions of tries into ~1k/day.
  if (rateLimited(`adminfail:${clientIp(request)}`, 10, 15 * 60 * 1000)) {
    return Response.json({ error: "too many attempts" }, { status: 429 });
  }
  return Response.json({ error: "unauthorized" }, { status: 401 });
}
