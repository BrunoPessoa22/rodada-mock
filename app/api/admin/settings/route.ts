import { requireAdmin } from "@/lib/auth";
import { setSetting } from "@/lib/db";

export const dynamic = "force-dynamic";

const ALLOWED_KEYS = new Set(["pot_base_chz", "pot_base_date", "pot_daily_chz"]);

export async function POST(request: Request) {
  const denied = requireAdmin(request);
  if (denied) return denied;

  const { key, value } = (await request.json().catch(() => ({}))) as {
    key?: string;
    value?: string;
  };
  if (!key || !ALLOWED_KEYS.has(key) || typeof value !== "string") {
    return Response.json(
      { error: `key must be one of ${[...ALLOWED_KEYS].join(", ")}` },
      { status: 400 }
    );
  }
  setSetting(key, value);
  return Response.json({ ok: true, key, value });
}
