import { requireAdmin } from "@/lib/auth";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const denied = requireAdmin(request);
  if (denied) return denied;

  const db = getDb();
  const log = db.prepare("SELECT * FROM index_log ORDER BY id DESC LIMIT 50").all();
  const counts = {
    wallets: (db.prepare("SELECT COUNT(*) AS n FROM wallets").get() as { n: number }).n,
    scores: (db.prepare("SELECT COUNT(*) AS n FROM scores").get() as { n: number }).n,
    claims_pending: (
      db.prepare("SELECT COUNT(*) AS n FROM claims WHERE status = 'pending'").get() as { n: number }
    ).n,
  };
  return Response.json({ counts, log });
}
