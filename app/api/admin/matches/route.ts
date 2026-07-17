import { requireAdmin } from "@/lib/auth";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d+)?Z$/;

export async function POST(request: Request) {
  const denied = requireAdmin(request);
  if (denied) return denied;

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const { slug, home, away, competition, kickoff_utc, window_start_utc, window_end_utc } = body;
  const featured = body.featured ? 1 : 0;
  const pool_chz = Number(body.pool_chz ?? 0);
  const tokens = body.tokens;

  for (const [name, value] of Object.entries({ slug, home, away, competition })) {
    if (typeof value !== "string" || !value.trim()) {
      return Response.json({ error: `${name} is required` }, { status: 400 });
    }
  }
  for (const [name, value] of Object.entries({ kickoff_utc, window_start_utc, window_end_utc })) {
    if (typeof value !== "string" || !ISO_RE.test(value)) {
      return Response.json({ error: `${name} must be ISO-8601 UTC (…Z)` }, { status: 400 });
    }
  }
  if (!Array.isArray(tokens) || tokens.length === 0 || !tokens.every((t) => typeof t === "string")) {
    return Response.json({ error: "tokens must be a non-empty array of symbols" }, { status: 400 });
  }
  if ((window_start_utc as string) >= (window_end_utc as string)) {
    return Response.json({ error: "window_start_utc must precede window_end_utc" }, { status: 400 });
  }

  getDb()
    .prepare(
      `INSERT INTO matches (slug, home, away, competition, kickoff_utc, window_start_utc, window_end_utc, featured, tokens, pool_chz)
       VALUES (@slug, @home, @away, @competition, @kickoff_utc, @window_start_utc, @window_end_utc, @featured, @tokens, @pool_chz)
       ON CONFLICT(slug) DO UPDATE SET
         home = excluded.home, away = excluded.away, competition = excluded.competition,
         kickoff_utc = excluded.kickoff_utc, window_start_utc = excluded.window_start_utc,
         window_end_utc = excluded.window_end_utc, featured = excluded.featured,
         tokens = excluded.tokens, pool_chz = excluded.pool_chz`
    )
    .run({
      slug,
      home,
      away,
      competition,
      kickoff_utc,
      window_start_utc,
      window_end_utc,
      featured,
      tokens: JSON.stringify(tokens),
      pool_chz,
    });

  return Response.json({ ok: true, slug });
}
