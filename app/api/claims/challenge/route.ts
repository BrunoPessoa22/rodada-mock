import { randomBytes } from "node:crypto";
import { buildClaimMessage, validateHandle } from "@/lib/claims";
import { getDb } from "@/lib/db";
import { clientIp, rateLimited } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const NONCE_TTL_MS = 10 * 60 * 1000;

export async function POST(request: Request) {
  if (rateLimited(`challenge:${clientIp(request)}`, 10, 10 * 60 * 1000)) {
    return Response.json({ error: "too many attempts — try again later" }, { status: 429 });
  }

  const { address, handle } = (await request.json().catch(() => ({}))) as {
    address?: string;
    handle?: string;
  };
  if (typeof address !== "string" || !ADDRESS_RE.test(address)) {
    return Response.json({ error: "address must be a 0x… wallet address" }, { status: 400 });
  }
  const checked = validateHandle(handle);
  if (!checked.ok) {
    return Response.json({ error: checked.error }, { status: 400 });
  }

  const lower = address.toLowerCase();
  const db = getDb();
  // Opportunistic housekeeping: used and expired nonces are dead weight.
  db.prepare("DELETE FROM claim_nonces WHERE used = 1 OR created_at < ?").run(
    new Date(Date.now() - NONCE_TTL_MS).toISOString()
  );
  const taken = db
    .prepare("SELECT 1 FROM wallets WHERE address = ? AND status = 'verified'")
    .get(lower);
  if (taken) {
    return Response.json({ error: "wallet already claimed" }, { status: 409 });
  }
  // Case-insensitive handle uniqueness against other verified players.
  const handleTaken = db
    .prepare(
      "SELECT 1 FROM wallets WHERE status = 'verified' AND LOWER(handle) = LOWER(?) AND address <> ?"
    )
    .get(checked.handle, lower);
  if (handleTaken) {
    return Response.json({ error: "that handle is already taken" }, { status: 409 });
  }

  const nonce = randomBytes(16).toString("hex");
  db.prepare("INSERT INTO claim_nonces (nonce, address, handle) VALUES (?, ?, ?)").run(
    nonce,
    lower,
    checked.handle
  );
  return Response.json({ nonce, message: buildClaimMessage(checked.handle, lower, nonce) });
}
