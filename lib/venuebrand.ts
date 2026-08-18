/**
 * Venue brand assets + the landing-page venue directory.
 *
 * Logos are OFFICIAL marks, self-hosted under public/venues/ (downloaded from
 * CoinGecko's exchange registry 2026-08-18, 250×250 — no runtime hotlinking,
 * no third-party requests from the page). Used nominatively: they state where
 * league tokens factually trade, next to a link to that venue.
 *
 * The directory derives from the SAME registries the collectors use
 * (CEX_LISTINGS / DEX pools), so a venue added to tracking shows up here
 * without a second edit — and a venue we don't track can't appear.
 */
import { CEX_LISTINGS, CEX_VENUE_LABEL, VENUE_TRADE_URL, type CexVenue } from "./cex";
import { CHAIN_TOKEN_REFS } from "./dexvol";

export const VENUE_LOGOS: Record<string, string> = {
  kayen: "/venues/kayen.png",
  binance: "/venues/binance.jpg",
  okx: "/venues/okx.png",
  gate: "/venues/gate.png",
  mexc: "/venues/mexc.jpg",
  bitget: "/venues/bitget.jpg",
  htx: "/venues/htx.png",
  upbit: "/venues/upbit.png",
  mercadobitcoin: "/venues/mercadobitcoin.png",
  jupiter: "/venues/jupiter.png",
  meteora: "/venues/meteora.jpg",
  aerodrome: "/venues/aerodrome.jpg",
};

/** Logo for a venue_volume source id (or the synthetic "chiliz" scored row). */
export function venueLogoForSource(source: string): string | null {
  if (source === "chiliz") return VENUE_LOGOS.kayen;
  if (source.startsWith("cex:")) return VENUE_LOGOS[source.slice(4)] ?? null;
  if (source === "solana:meteora") return VENUE_LOGOS.jupiter;
  if (source === "base:aerodrome") return VENUE_LOGOS.aerodrome;
  return null;
}

export interface VenueBrand {
  key: string;
  label: string;
  logo: string;
  tag: string; // "Chiliz Chain · scored" | "CEX · tracked" | "Solana · tracked" …
  url: string;
  scored: boolean;
}

/** PSG is the flagship listing on most venues; fall back to whatever exists. */
function defaultInstFor(venue: CexVenue): string | null {
  const psg = CEX_LISTINGS.PSG?.[venue]?.[0]?.inst;
  if (psg) return psg;
  for (const listings of Object.values(CEX_LISTINGS)) {
    const inst = listings[venue]?.[0]?.inst;
    if (inst) return inst;
  }
  return null;
}

const CEX_ORDER: CexVenue[] = [
  "binance",
  "okx",
  "gate",
  "mexc",
  "bitget",
  "htx",
  "upbit",
  "mercadobitcoin",
];

/** Every place the league tracks, scored layer first — the landing-page wall. */
export function venueDirectory(): VenueBrand[] {
  const rows: VenueBrand[] = [
    {
      key: "kayen",
      label: "Kayen / FanX",
      logo: VENUE_LOGOS.kayen,
      tag: "Chiliz Chain · scored",
      url: "https://app.kayen.org/",
      scored: true,
    },
  ];
  for (const venue of CEX_ORDER) {
    const inst = defaultInstFor(venue);
    if (!inst) continue;
    rows.push({
      key: venue,
      label: CEX_VENUE_LABEL[venue],
      logo: VENUE_LOGOS[venue],
      tag: "CEX · tracked",
      url: VENUE_TRADE_URL[venue](inst),
      scored: false,
    });
  }
  rows.push({
    key: "jupiter",
    label: "Jupiter",
    logo: VENUE_LOGOS.jupiter,
    tag: "Solana · tracked",
    url: `https://jup.ag/swap/USDC-${CHAIN_TOKEN_REFS.solana.PSG}`,
    scored: false,
  });
  rows.push({
    key: "aerodrome",
    label: "Aerodrome",
    logo: VENUE_LOGOS.aerodrome,
    tag: "Base · tracked",
    url: `https://aerodrome.finance/swap?from=0x833589fcd6edb6e08f4c7c32d4f71b54bda02913&to=${CHAIN_TOKEN_REFS.base.PSG}`,
    scored: false,
  });
  return rows;
}
