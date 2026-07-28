import { buildClaimMessage, verifyClaimSignature } from "@/lib/claims";
import { getDb } from "@/lib/db";
import { clientIp, rateLimited } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

const NONCE_TTL_MS = 10 * 60 * 1000;
const MAX_FIELD = 120;

export async function POST(request: Request) {
  if (rateLimited(`verify:${clientIp(request)}`, 10, 10 * 60 * 1000)) {
    return Response.json({ error: "too many attempts — try again later" }, { status: 429 });
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const { nonce, signature, venue, contact } = body;
  if (typeof nonce !== "string" || typeof signature !== "string" || !signature.startsWith("0x")) {
    return Response.json({ error: "need { nonce, signature }" }, { status: 400 });
  }

  const db = getDb();
  const row = db
    .prepare("SELECT * FROM claim_nonces WHERE nonce = ? AND used = 0")
    .get(nonce) as { nonce: string; address: string; handle: string; created_at: string } | undefined;
  if (!row) return Response.json({ error: "unknown or used nonce" }, { status: 400 });
  if (Date.now() - new Date(row.created_at).getTime() > NONCE_TTL_MS) {
    return Response.json({ error: "challenge expired — request a new one" }, { status: 400 });
  }

  const message = buildClaimMessage(row.handle, row.address, row.nonce);
  const valid = await verifyClaimSignature(
    row.address as `0x${string}`,
    message,
    signature as `0x${string}`
  );
  if (!valid) {
    return Response.json({ error: "signature does not match the wallet" }, { status: 401 });
  }

  const cleanVenue = typeof venue === "string" ? venue.slice(0, MAX_FIELD) : null;
  const cleanContact = typeof contact === "string" ? contact.slice(0, MAX_FIELD) : null;
  // Consume the nonce atomically: the conditional UPDATE is the single-use gate,
  // so two concurrent verifies for the same nonce can't both write a wallet.
  let alreadyUsed = false;
  const apply = db.transaction(() => {
    const consumed = db
      .prepare("UPDATE claim_nonces SET used = 1 WHERE nonce = ? AND used = 0")
      .run(row.nonce);
    if (consumed.changes !== 1) {
      alreadyUsed = true;
      return;
    }
    db.prepare(
      `INSERT INTO claims (address, handle, venue, contact, status)
       VALUES (?, ?, ?, ?, 'approved')`
    ).run(row.address, row.handle, cleanVenue, cleanContact);
    db.prepare(
      `INSERT INTO wallets (address, handle, venue, contact, status)
       VALUES (?, ?, ?, ?, 'verified')
       ON CONFLICT(address) DO UPDATE SET
         handle = excluded.handle, venue = excluded.venue,
         contact = excluded.contact, status = 'verified'`
    ).run(row.address, row.handle, cleanVenue, cleanContact);
  });
  apply();
  if (alreadyUsed) {
    return Response.json({ error: "challenge already used — request a new one" }, { status: 409 });
  }

  return Response.json({ ok: true, verified: true, handle: row.handle, address: row.address });
}
