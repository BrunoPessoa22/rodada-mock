import { requireAdmin } from "@/lib/auth";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

/**
 * Link (or unlink) a wallet to a KYC identity. This is what makes per-identity
 * scoring real: `mergeFlowsByIdentity` sums the flow of every wallet sharing an
 * identity_id BEFORE the formula, so splitting one person's flow across many
 * wallets can't multiply their points. Without a writer here, identity_id stays
 * NULL and every wallet scores solo — so this endpoint is the anti-sybil gate.
 *
 * Body:
 *   { address, identityId }  — link `address` to the identity keyed by
 *                              `identityId` (its primary wallet address).
 *   { address, identityId: null }  — unlink (score solo again).
 *
 * After linking, rescore any affected open match for the change to take effect.
 */
export async function POST(request: Request) {
  const denied = requireAdmin(request);
  if (denied) return denied;

  const body = (await request.json().catch(() => ({}))) as {
    address?: string;
    identityId?: string | null;
  };
  const address = typeof body.address === "string" ? body.address.toLowerCase() : "";
  if (!ADDRESS_RE.test(address)) {
    return Response.json({ error: "address must be a 0x… wallet address" }, { status: 400 });
  }

  let identityId: string | null;
  if (body.identityId === null || body.identityId === undefined || body.identityId === "") {
    identityId = null;
  } else if (typeof body.identityId === "string" && ADDRESS_RE.test(body.identityId.toLowerCase())) {
    identityId = body.identityId.toLowerCase();
  } else {
    return Response.json(
      { error: "identityId must be a 0x… address or null to unlink" },
      { status: 400 }
    );
  }
  if (identityId === address) {
    // Self-link is a no-op (a wallet is already its own identity); NULL it.
    identityId = null;
  }

  const db = getDb();
  db.prepare("INSERT OR IGNORE INTO wallets (address) VALUES (?)").run(address);

  // Resolution is single-hop, so the identity graph MUST stay flat: identities
  // are roots (identity_id NULL) and every other wallet links directly to a
  // root. Reject anything that would build a chain or cycle — otherwise the
  // merge silently fails to collapse a split (sybil survives) and even
  // misattributes flow to the wrong address.
  if (identityId !== null) {
    const target = db
      .prepare("SELECT identity_id FROM wallets WHERE address = ?")
      .get(identityId) as { identity_id: string | null } | undefined;
    if (target?.identity_id) {
      return Response.json(
        { error: "identity target is itself linked — link to its root identity instead" },
        { status: 409 }
      );
    }
    const dependents = db
      .prepare("SELECT 1 FROM wallets WHERE identity_id = ? LIMIT 1")
      .get(address);
    if (dependents) {
      return Response.json(
        { error: "this wallet is already a root for other wallets — unlink those first" },
        { status: 409 }
      );
    }
  }

  const res = db
    .prepare("UPDATE wallets SET identity_id = ? WHERE address = ?")
    .run(identityId, address);

  return Response.json({ ok: true, address, identityId, changed: res.changes });
}
