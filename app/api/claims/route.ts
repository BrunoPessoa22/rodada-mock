import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const MAX_FIELD = 120;

// Soft anti-spam for the open beta: per-IP token bucket + global pending cap.
// In-memory is fine — single container, and a restart resetting buckets is
// harmless (the pending cap is the real backstop against volume abuse).
const RATE_LIMIT = 5;
const RATE_WINDOW_MS = 10 * 60 * 1000;
const MAX_PENDING_CLAIMS = 500;
const buckets = new Map<string, { count: number; resetAt: number }>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const bucket = buckets.get(ip);
  if (!bucket || bucket.resetAt < now) {
    if (buckets.size > 10_000) buckets.clear();
    buckets.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return false;
  }
  bucket.count += 1;
  return bucket.count > RATE_LIMIT;
}

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (rateLimited(ip)) {
    return Response.json({ error: "too many claims — try again later" }, { status: 429 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const { address, handle, venue, contact } = (body ?? {}) as Record<string, unknown>;

  if (typeof address !== "string" || !ADDRESS_RE.test(address)) {
    return Response.json({ error: "address must be a 0x… wallet address" }, { status: 400 });
  }
  if (typeof handle !== "string" || handle.trim().length < 2 || handle.length > MAX_FIELD) {
    return Response.json({ error: "handle must be 2-120 characters" }, { status: 400 });
  }
  const cleanVenue = typeof venue === "string" ? venue.slice(0, MAX_FIELD) : null;
  const cleanContact = typeof contact === "string" ? contact.slice(0, MAX_FIELD) : null;
  const lower = address.toLowerCase();

  const db = getDb();
  const pendingTotal = (
    db.prepare("SELECT COUNT(*) AS n FROM claims WHERE status = 'pending'").get() as { n: number }
  ).n;
  if (pendingTotal >= MAX_PENDING_CLAIMS) {
    return Response.json({ error: "claim queue is full — try again later" }, { status: 503 });
  }
  const existingWallet = db
    .prepare("SELECT status FROM wallets WHERE address = ? AND status = 'verified'")
    .get(lower);
  if (existingWallet) {
    return Response.json({ error: "wallet already claimed" }, { status: 409 });
  }
  const pending = db
    .prepare("SELECT id FROM claims WHERE address = ? AND status = 'pending'")
    .get(lower);
  if (pending) {
    return Response.json({ ok: true, status: "pending", note: "claim already in review" });
  }

  db.prepare("INSERT INTO claims (address, handle, venue, contact) VALUES (?, ?, ?, ?)").run(
    lower,
    handle.trim(),
    cleanVenue,
    cleanContact
  );
  return Response.json({ ok: true, status: "pending" });
}
