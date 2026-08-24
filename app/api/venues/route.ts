import {
  getCurrentMatch,
  getKeyedVenueVolume,
  getMatchBySlug,
  getOnchainVolume,
  getVenueVolume,
} from "@/lib/queries";

export const dynamic = "force-dynamic";

/**
 * Venue-volume readout for a match window: on-chain Chiliz (Kayen/FanX) gross
 * taker volume — the scored layer — plus per-venue totals for every tracked
 * venue (CEX candles, Solana/Base pool volume). `?slug=` targets a match;
 * default is the current one.
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
    venues: getVenueVolume(match.id),
    // Players' own fills via read-only key connections — the verified sliver
    // of each CEX's market-wide tracked total above.
    keyed: getKeyedVenueVolume(match.id),
  });
}
