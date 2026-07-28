import { requireAdmin } from "@/lib/auth";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const denied = requireAdmin(request);
  if (denied) return denied;
  const claims = getDb()
    .prepare(
      "SELECT id, address, handle, venue, contact, status, created_at FROM claims ORDER BY created_at DESC LIMIT 200"
    )
    .all();
  return Response.json({ claims });
}

export async function POST(request: Request) {
  const denied = requireAdmin(request);
  if (denied) return denied;

  const { id, action } = (await request.json().catch(() => ({}))) as {
    id?: number;
    action?: string;
  };
  if (typeof id !== "number" || !["approve", "reject"].includes(action ?? "")) {
    return Response.json({ error: "need { id, action: approve|reject }" }, { status: 400 });
  }

  const db = getDb();
  const claim = db.prepare("SELECT * FROM claims WHERE id = ?").get(id) as
    | { id: number; address: string; handle: string; venue: string | null; contact: string | null; status: string }
    | undefined;
  if (!claim) return Response.json({ error: "claim not found" }, { status: 404 });
  if (claim.status !== "pending") {
    return Response.json({ error: `claim already ${claim.status}` }, { status: 409 });
  }

  if (action === "approve") {
    let conflict = false;
    const apply = db.transaction(() => {
      // A manual claim must never overwrite a wallet its real owner already
      // proved by signature. If the address is verified under a different
      // handle, the cryptographic claim wins — reject this stale manual one.
      const existing = db
        .prepare("SELECT handle, status FROM wallets WHERE address = ?")
        .get(claim.address) as { handle: string | null; status: string } | undefined;
      if (existing?.status === "verified" && (existing.handle ?? "") !== claim.handle) {
        conflict = true;
        db.prepare("UPDATE claims SET status = 'rejected', contact = NULL WHERE id = ?").run(id);
        return;
      }
      db.prepare("UPDATE claims SET status = 'approved' WHERE id = ?").run(id);
      db.prepare(
        `INSERT INTO wallets (address, handle, venue, contact, status)
         VALUES (?, ?, ?, ?, 'verified')
         ON CONFLICT(address) DO UPDATE SET
           handle = excluded.handle, venue = excluded.venue,
           contact = excluded.contact, status = 'verified'`
      ).run(claim.address, claim.handle, claim.venue, claim.contact);
    });
    apply();
    if (conflict) {
      return Response.json(
        { error: "address already verified by its owner via signature" },
        { status: 409 }
      );
    }
    return Response.json({ ok: true, address: claim.address, handle: claim.handle });
  }

  // Reject: drop the contact PII along with the claim — no reason to retain a
  // phone/telegram for a rejected applicant.
  db.prepare("UPDATE claims SET status = 'rejected', contact = NULL WHERE id = ?").run(id);
  return Response.json({ ok: true, rejected: id });
}
