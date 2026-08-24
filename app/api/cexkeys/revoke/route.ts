import { verifyClaimSignature } from "@/lib/claims";
import { buildCexKeyMessage, cexConnectEnabled, deleteKey, type KeyedVenue } from "@/lib/cexkeys";
import { getDb, logIndex } from "@/lib/db";
import { clientIp, rateLimited } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

const NONCE_TTL_MS = 10 * 60 * 1000;

/**
 * Complete a revoke: the signed challenge names the venue + key, and success
 * DELETES the encrypted credentials — not a soft flag. Aggregated match-window
 * volume already on the board stays (it holds no credentials), as /privacy says.
 */
export async function POST(request: Request) {
  if (rateLimited(`cexkey-revoke:${clientIp(request)}`, 10, 10 * 60 * 1000)) {
    return Response.json({ error: "too many attempts — try again later" }, { status: 429 });
  }
  if (!cexConnectEnabled()) {
    return Response.json(
      { error: "exchange connections are being enabled — check back soon" },
      { status: 503 }
    );
  }

  const { nonce, signature } = (await request.json().catch(() => ({}))) as {
    nonce?: string;
    signature?: string;
  };
  if (typeof nonce !== "string" || typeof signature !== "string" || !signature.startsWith("0x")) {
    return Response.json({ error: "need { nonce, signature }" }, { status: 400 });
  }

  const db = getDb();
  const row = db
    .prepare("SELECT * FROM cexkey_nonces WHERE nonce = ? AND used = 0 AND action = 'revoke'")
    .get(nonce) as
    | { nonce: string; address: string; venue: KeyedVenue; key_last4: string; created_at: string }
    | undefined;
  if (!row) return Response.json({ error: "unknown or used nonce" }, { status: 400 });
  if (Date.now() - new Date(row.created_at).getTime() > NONCE_TTL_MS) {
    return Response.json({ error: "challenge expired — request a new one" }, { status: 400 });
  }

  const message = buildCexKeyMessage("revoke", row.venue, row.address, row.key_last4, row.nonce);
  const valid = await verifyClaimSignature(
    row.address as `0x${string}`,
    message,
    signature as `0x${string}`
  );
  if (!valid) {
    return Response.json({ error: "signature does not match the wallet" }, { status: 401 });
  }

  let alreadyUsed = false;
  let removed = false;
  const apply = db.transaction(() => {
    const consumed = db
      .prepare("UPDATE cexkey_nonces SET used = 1 WHERE nonce = ? AND used = 0")
      .run(row.nonce);
    if (consumed.changes !== 1) {
      alreadyUsed = true;
      return;
    }
    removed = deleteKey(row.address, row.venue);
  });
  apply();
  if (alreadyUsed) {
    return Response.json({ error: "challenge already used — request a new one" }, { status: 409 });
  }

  logIndex("info", `cexkeys: revoked ${row.venue} key …${row.key_last4} by wallet signature`);
  return Response.json({ ok: true, venue: row.venue, removed });
}
