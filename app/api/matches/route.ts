import { listMatches } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function GET() {
  const matches = listMatches().map((m) => ({ ...m, tokens: JSON.parse(m.tokens) as string[] }));
  return Response.json({ matches });
}
