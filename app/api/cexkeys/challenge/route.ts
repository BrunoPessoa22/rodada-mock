import { randomBytes } from "node:crypto";
import {
  buildCexKeyMessage,
  cexConnectEnabled,
  isKeyedVenue,
  listConnections,
  type CexKeyAction,
} from "@/lib/cexkeys";
import { getDb } from "@/lib/db";
import { clientIp, rateLimited } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const LAST4_RE = /^[A-Za-z0-9-]{4}$/;
const NONCE_TTL_MS = 10 * 60 * 1000;

/**
 * Start an attach/revoke of a read-only exchange key. Same ritual as claiming:
 * the caller gets a message to personal_sign with the ALREADY-VERIFIED wallet.
 * The message names the venue and the key's last 4 characters, so what the
 * user signs is exactly what the server will store or delete.
 */
export async function POST(request: Request) {
  if (rateLimited(`cexkey-challenge:${clientIp(request)}`, 10, 10 * 60 * 1000)) {
    return Response.json({ error: "too many attempts — try again later" }, { status: 429 });
  }
  if (!cexConnectEnabled()) {
    return Response.json(
      { error: "exchange connections are being enabled — check back soon" },
      { status: 503 }
    );
  }

  const { address, venue, action, keyLast4 } = (await request.json().catch(() => ({}))) as {
    address?: string;
    venue?: string;
    action?: string;
    keyLast4?: string;
  };
  if (typeof address !== "string" || !ADDRESS_RE.test(address)) {
    return Response.json({ error: "address must be a 0x… wallet address" }, { status: 400 });
  }
  if (!isKeyedVenue(venue)) {
    return Response.json({ error: "venue must be one of: binance, okx" }, { status: 400 });
  }
  if (action !== "attach" && action !== "revoke") {
    return Response.json({ error: "action must be attach or revoke" }, { status: 400 });
  }

  const lower = address.toLowerCase();
  const db = getDb();
  db.prepare("DELETE FROM cexkey_nonces WHERE used = 1 OR created_at < ?").run(
    new Date(Date.now() - NONCE_TTL_MS).toISOString()
  );

  // Only a claimed wallet can bind a key — the connection inherits the
  // identity (and anti-sybil identity_id netting) of the claim system.
  const wallet = db
    .prepare("SELECT 1 FROM wallets WHERE address = ? AND status = 'verified'")
    .get(lower);
  if (!wallet) {
    return Response.json(
      { error: "claim your username with this wallet first — top of this page" },
      { status: 403 }
    );
  }

  let last4: string;
  if (action === "attach") {
    if (typeof keyLast4 !== "string" || !LAST4_RE.test(keyLast4)) {
      return Response.json(
        { error: "keyLast4 must be the last 4 characters of the API key" },
        { status: 400 }
      );
    }
    last4 = keyLast4;
  } else {
    const existing = db
      .prepare("SELECT key_last4 FROM cex_keys WHERE address = ? AND venue = ?")
      .get(lower, venue) as { key_last4: string } | undefined;
    if (!existing) {
      return Response.json({ error: "no connection to revoke on that venue" }, { status: 404 });
    }
    last4 = existing.key_last4;
  }

  const nonce = randomBytes(16).toString("hex");
  db.prepare(
    "INSERT INTO cexkey_nonces (nonce, address, venue, action, key_last4) VALUES (?, ?, ?, ?, ?)"
  ).run(nonce, lower, venue, action, last4);

  return Response.json({
    nonce,
    message: buildCexKeyMessage(action as CexKeyAction, venue, lower, last4, nonce),
    connections: listConnections(lower),
  });
}
