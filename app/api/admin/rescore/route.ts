import { requireAdmin } from "@/lib/auth";
import { scoreMatch } from "@/lib/indexer";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: Request) {
  const denied = requireAdmin(request);
  if (denied) return denied;

  const { slug } = (await request.json().catch(() => ({}))) as { slug?: string };
  if (!slug) return Response.json({ error: "need { slug }" }, { status: 400 });

  try {
    const result = await scoreMatch(slug);
    return Response.json(result, { status: result.ok ? 200 : 422 });
  } catch (error) {
    return Response.json({ ok: false, reason: String(error) }, { status: 500 });
  }
}
