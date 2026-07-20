import { getCexVolume, getCurrentMatch, getMatchBySlug, getOnchainVolume } from "@/lib/queries";

export const dynamic = "force-dynamic";

/**
 * Venue-volume readout for a match window: on-chain (Kayen) gross taker volume
 * plus per-CEX totals from public candles. `?slug=` targets a match; default
 * is the current one.
 */
export async function GET(request: Request) {
  const slug = new URL(request.url).searchParams.get("slug");
  const match = slug ? getMatchBySlug(slug) : getCurrentMatch();
  if (!match) return Response.json({ error: "no match" }, { status: 404 });
  return Response.json({
    match: match.slug,
    window: { start: match.window_start_utc, end: match.window_end_utc },
    tokens: JSON.parse(match.tokens) as string[],
    onchainUsd: getOnchainVolume(match.id),
    venues: getCexVolume(match.id),
  });
}
