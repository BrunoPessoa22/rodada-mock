import { randomBytes } from "node:crypto";
import { buildClaimMessage } from "@/lib/claims";
import { getDb } from "@/lib/db";
import { clientIp, rateLimited } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

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
  if (typeof handle !== "string" || handle.trim().length < 2 || handle.length > 40) {
    return Response.json({ error: "handle must be 2-40 characters" }, { status: 400 });
  }

  const lower = address.toLowerCase();
  const db = getDb();
  const taken = db
    .prepare("SELECT 1 FROM wallets WHERE address = ? AND status = 'verified'")
    .get(lower);
  if (taken) {
    return Response.json({ error: "wallet already claimed" }, { status: 409 });
  }

  const nonce = randomBytes(16).toString("hex");
  db.prepare("INSERT INTO claim_nonces (nonce, address, handle) VALUES (?, ?, ?)").run(
    nonce,
    lower,
    handle.trim()
  );
  return Response.json({ nonce, message: buildClaimMessage(handle.trim(), lower, nonce) });
}
