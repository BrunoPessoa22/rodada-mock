import { verifyClaimSignature } from "@/lib/claims";
import {
  buildCexKeyMessage,
  cexConnectEnabled,
  checkReadOnly,
  KEYED_VENUE_LABEL,
  saveKey,
  VENUE_API_PAGE,
  venueNeedsPassphrase,
  type KeyedVenue,
} from "@/lib/cexkeys";
import { getDb } from "@/lib/db";
import { clientIp, rateLimited } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

const NONCE_TTL_MS = 10 * 60 * 1000;
// Printable ASCII, no whitespace — covers Binance (64 alnum) and OKX (uuid).
const CRED_RE = /^[\x21-\x7e]{8,256}$/;

/**
 * Complete an attach: signature proves the wallet holder authorized THIS key
 * (venue + last4 are inside the signed message), then the exchange's own
 * permission endpoint must confirm the key is read-only BEFORE anything is
 * stored. A key that can trade or withdraw never touches the database.
 */
export async function POST(request: Request) {
  // Tighter than the other endpoints — each call can hit the exchange API.
  if (rateLimited(`cexkey-attach:${clientIp(request)}`, 6, 10 * 60 * 1000)) {
    return Response.json({ error: "too many attempts — try again later" }, { status: 429 });
  }
  if (!cexConnectEnabled()) {
    return Response.json(
      { error: "exchange connections are being enabled — check back soon" },
      { status: 503 }
    );
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const { nonce, signature, apiKey, apiSecret, passphrase } = body;
  if (typeof nonce !== "string" || typeof signature !== "string" || !signature.startsWith("0x")) {
    return Response.json({ error: "need { nonce, signature }" }, { status: 400 });
  }
  if (typeof apiKey !== "string" || !CRED_RE.test(apiKey.trim())) {
    return Response.json({ error: "apiKey looks malformed" }, { status: 400 });
  }
  if (typeof apiSecret !== "string" || !CRED_RE.test(apiSecret.trim())) {
    return Response.json({ error: "apiSecret looks malformed" }, { status: 400 });
  }

  const db = getDb();
  const row = db
    .prepare("SELECT * FROM cexkey_nonces WHERE nonce = ? AND used = 0 AND action = 'attach'")
    .get(nonce) as
    | { nonce: string; address: string; venue: KeyedVenue; key_last4: string; created_at: string }
    | undefined;
  if (!row) return Response.json({ error: "unknown or used nonce" }, { status: 400 });
  if (Date.now() - new Date(row.created_at).getTime() > NONCE_TTL_MS) {
    return Response.json({ error: "challenge expired — request a new one" }, { status: 400 });
  }

  const key = apiKey.trim();
  const secret = apiSecret.trim();
  const pass = typeof passphrase === "string" ? passphrase.trim() : "";
  if (key.slice(-4) !== row.key_last4) {
    return Response.json(
      { error: "the API key does not match the one you signed for — restart the connect flow" },
      { status: 400 }
    );
  }
  if (venueNeedsPassphrase(row.venue) && !pass) {
    return Response.json(
      { error: `${KEYED_VENUE_LABEL[row.venue]} keys need their passphrase` },
      { status: 400 }
    );
  }

  const message = buildCexKeyMessage("attach", row.venue, row.address, row.key_last4, row.nonce);
  const valid = await verifyClaimSignature(
    row.address as `0x${string}`,
    message,
    signature as `0x${string}`
  );
  if (!valid) {
    return Response.json({ error: "signature does not match the wallet" }, { status: 401 });
  }

  // The gate: the exchange itself must say the key is read-only.
  const check = await checkReadOnly(row.venue, {
    apiKey: key,
    apiSecret: secret,
    passphrase: pass || undefined,
  });
  if (!check.ok) {
    const status = check.transient ? 502 : 422;
    return Response.json(
      { error: check.reason, apiPage: VENUE_API_PAGE[row.venue] },
      { status }
    );
  }

  // Consume the nonce atomically, then store encrypted (see claims/verify).
  let alreadyUsed = false;
  const apply = db.transaction(() => {
    const consumed = db
      .prepare("UPDATE cexkey_nonces SET used = 1 WHERE nonce = ? AND used = 0")
      .run(row.nonce);
    if (consumed.changes !== 1) {
      alreadyUsed = true;
      return;
    }
    saveKey(row.address, row.venue, { apiKey: key, apiSecret: secret, passphrase: pass || undefined }, check.perms);
  });
  apply();
  if (alreadyUsed) {
    return Response.json({ error: "challenge already used — request a new one" }, { status: 409 });
  }

  return Response.json({
    ok: true,
    venue: row.venue,
    keyLast4: row.key_last4,
    perms: check.perms,
  });
}
