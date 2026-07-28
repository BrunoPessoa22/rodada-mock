import { getCurrentMatch, getLeaderboard, getMatchBySlug, shortAddress } from "@/lib/queries";

export const dynamic = "force-dynamic";

type Board = ReturnType<typeof getLeaderboard>;

/**
 * Public projection of a board. The stated privacy model is "the leaderboard
 * shows only your chosen name; unclaimed addresses appear truncated" — so the
 * API never emits full wallet addresses (which would re-link a handle to its
 * entire on-chain history) or the self-declared venue.
 */
function publicBoard(board: Board) {
  return {
    ...board,
    entries: board.entries.map(({ address, venue: _venue, ...rest }) => ({
      ...rest,
      address: shortAddress(address),
    })),
  };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const slug = url.searchParams.get("match");
  const scope = url.searchParams.get("scope") ?? (slug ? "match" : "season");

  if (scope === "season") {
    const board = getLeaderboard({ poolChz: 0 });
    return Response.json({ scope: "season", match: null, ...publicBoard(board) });
  }

  const match = slug ? getMatchBySlug(slug) : getCurrentMatch();
  if (!match) {
    return Response.json({ scope: "match", match: null, entries: [], totalPoints: 0, payablePoints: 0, wallets: 0 });
  }
  const board = getLeaderboard({ matchId: match.id, poolChz: match.pool_chz });
  return Response.json({
    scope: "match",
    match: { ...match, tokens: JSON.parse(match.tokens) as string[] },
    ...publicBoard(board),
  });
}
