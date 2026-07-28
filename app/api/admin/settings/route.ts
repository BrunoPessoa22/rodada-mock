import { requireAdmin } from "@/lib/auth";
import { setSetting } from "@/lib/db";

export const dynamic = "force-dynamic";

const ALLOWED_KEYS = new Set([
  "pot_base_chz",
  "pot_base_date",
  "pot_daily_chz",
  "season_pool_chz",
  "funding_verified",
]);

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
  // Guard the shape before it reaches getPot()'s Number()/new Date(), where a bad
  // value would surface as NaN on the public pot counter and /api/pot.
  if (key === "pot_base_date") {
    if (Number.isNaN(Date.parse(value))) {
      return Response.json({ error: "pot_base_date must be an ISO-8601 date" }, { status: 400 });
    }
  } else {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) {
      return Response.json({ error: `${key} must be a non-negative number` }, { status: 400 });
    }
  }
  setSetting(key, value);
  return Response.json({ ok: true, key, value });
}
