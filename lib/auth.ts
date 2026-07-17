import { timingSafeEqual } from "node:crypto";
import { ADMIN_TOKEN } from "./config";

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
  return Response.json({ error: "unauthorized" }, { status: 401 });
}
