import { getCurrentMatch, getLeaderboard, getMatchBySlug } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const slug = url.searchParams.get("match");
  const scope = url.searchParams.get("scope") ?? (slug ? "match" : "season");

  if (scope === "season") {
    const board = getLeaderboard({ poolChz: 0 });
    return Response.json({ scope: "season", match: null, ...board });
  }

  const match = slug ? getMatchBySlug(slug) : getCurrentMatch();
  if (!match) {
    return Response.json({ scope: "match", match: null, entries: [], totalPoints: 0, wallets: 0 });
  }
  const board = getLeaderboard({ matchId: match.id, poolChz: match.pool_chz });
  return Response.json({
    scope: "match",
    match: { ...match, tokens: JSON.parse(match.tokens) as string[] },
    ...board,
  });
}
