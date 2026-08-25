import Link from "next/link";
import { Countdown } from "@/components/Countdown";
import { PotCounter } from "@/components/PotCounter";
import { getSetting } from "@/lib/db";
import { enName } from "@/lib/i18n";
import { getPot } from "@/lib/pot";
import {
  getCurrentMatch,
  getKeyedVenueVolume,
  getLeaderboard,
  getOnchainVolume,
  getVenueVolume,
  type LeaderboardEntry,
  type MatchRow,
} from "@/lib/queries";
import { CEX_LISTINGS, CEX_VENUE_LABEL, VENUE_TRADE_URL, venuesForTokens, type CexVenue } from "@/lib/cex";
import { cexConnectEnabled, KEYED_VENUES, KEYED_VENUE_LABEL } from "@/lib/cexkeys";
import { DEX_NETWORK_LABEL, DEX_POOLS, dexTradeUrl } from "@/lib/dexvol";
import { venueDirectory, venueLogoForSource } from "@/lib/venuebrand";
import { isPerpSource, VIBE_MARKETS, VIBE_SOURCE, VIBE_TRADE_URL } from "@/lib/vibe";
import { TOKENS } from "@/lib/tokens";

export const dynamic = "force-dynamic";

const CLUB_NAME_COLORS: Record<string, [string, string]> = {
  Flamengo: ["#C52613", "#0a0a0a"],
  Chapecoense: ["#009846", "#FFFFFF"],
  "São Paulo": ["#FE0000", "#FFFFFF"],
  Fluminense: ["#7A1F3D", "#009E60"],
  Argentina: ["#75AADB", "#FFFFFF"],
  Espanha: ["#AA151B", "#F1BF00"],
  Spain: ["#AA151B", "#F1BF00"],
};

/** Official club-token badges, self-hosted (CoinGecko/GeckoTerminal, 250px). */
const TOKEN_BADGES: Record<string, string> = {
  MENGO: "/tokens/MENGO.png",
  BAR: "/tokens/BAR.png",
  PSG: "/tokens/PSG.png",
  GAL: "/tokens/GAL.png",
  ARG: "/tokens/ARG.png",
  GALO: "/tokens/GALO.png",
  TRA: "/tokens/TRA.png",
  POR: "/tokens/POR.png",
  SPAIN: "/tokens/SPAIN.png",
};
/** Hero lineup order — alternating crest colors so the row reads as a squad. */
const HERO_LINEUP = ["MENGO", "BAR", "ARG", "PSG", "GAL", "GALO", "SPAIN", "TRA", "POR"];

const AVATAR_COLORS = [
  "var(--blue-800)",
  "var(--green-500)",
  "var(--orange-500)",
  "var(--blue-500)",
  "var(--lime-700)",
];

function ClubBadge({ name, colors }: { name: string; colors: [string, string] }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
      <div
        style={{
          width: 54,
          height: 54,
          borderRadius: 9999,
          background: colors[0],
          border: `3px solid ${colors[1]}`,
          boxShadow: "0 0 0 1px var(--border)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#fff",
          fontWeight: 800,
          fontSize: 14,
          letterSpacing: "-.02em",
        }}
        aria-hidden
      >
        {name.slice(0, 2).toUpperCase()}
      </div>
      <div style={{ fontWeight: 600, fontSize: 14 }}>{name}</div>
    </div>
  );
}

/** "24 Aug 2026, 08:41 UTC" — an explicit stamp beats an implied "now". */
function utcStamp(iso: string): string {
  return `${new Date(iso).toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

function StandingsTable({
  entries,
  wallets,
  totalPoints,
  live,
  asOf,
  poolCommitted,
}: {
  entries: LeaderboardEntry[];
  wallets: number;
  /** Board-wide points — same figure the pot card shows, never a top-8 sum. */
  totalPoints: number;
  /** True only while a match window is open. A board headed "Live" when the
   * last match closed weeks ago is the fastest way to lose a trader's trust. */
  live: boolean;
  /** Newest score write in this board's scope. */
  asOf: string | null;
  /** Whether real CHZ backs this board's payout column. */
  poolCommitted: boolean;
}) {
  const top = entries.slice(0, 8);
  const scoring = top.filter((e) => e.points > 0);
  const newcomers = top.length - scoring.length;

  return (
    <div
      id="board"
      style={{
        background: "#fff",
        border: "1px solid var(--border)",
        borderRadius: 16,
        padding: "24px 28px",
        scrollMarginTop: 18,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 18,
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div style={{ fontWeight: 700, fontSize: 18 }}>
          {live ? "Live leaderboard" : "Season leaderboard"}
        </div>
        <span style={{ fontSize: 12, fontWeight: 500, color: "var(--fg-muted)" }}>
          {scoring.length > 0
            ? `${wallets.toLocaleString("en-US")} scoring · ${Math.floor(totalPoints).toLocaleString("en-US")} points on the board${
                !live && asOf ? ` · as of ${utcStamp(asOf)}` : ""
              }`
            : top.length > 0
              ? `${top.length} verified · waiting for first trades`
              : "Open entry — claim a wallet to appear"}
        </span>
      </div>

      <div
        className="rd-board-row"
        style={{
          display: "grid",
          gridTemplateColumns: "28px 1.4fr 68px 84px 52px 108px",
          gap: 10,
          padding: "0 8px 12px",
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: ".05em",
          textTransform: "uppercase",
          color: "var(--fg-muted)",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div>#</div>
        <div>Trader</div>
        <div className="rd-col-role" style={{ textAlign: "right" }}>Role</div>
        <div className="rd-col-swaps" style={{ textAlign: "right" }}>Swaps</div>
        <div style={{ textAlign: "right" }}>Points</div>
        <div style={{ textAlign: "right" }}>Est. payout</div>
      </div>

      {top.length === 0 ? (
        <div
          style={{
            padding: "28px 8px",
            fontSize: 14,
            fontWeight: 500,
            color: "var(--ink-soft)",
            lineHeight: 1.55,
          }}
        >
          <b style={{ color: "var(--fg)" }}>Open entry:</b> verified names appear here instantly.
          Trade during the match window to move up the table.{" "}
          <Link href="/entrar" style={{ color: "var(--brand)", fontWeight: 600 }}>
            Join this week
          </Link>
        </div>
      ) : (
        top.map((entry, i) => {
          const isNewcomer = entry.points <= 0;
          const isMaker = entry.makerNetAddUsd > Math.abs(entry.netTakerUsd);
          const initial = (entry.display.replace(/^0x/, "")[0] || "?").toUpperCase();
          const avatarBg = isNewcomer ? "var(--brand)" : AVATAR_COLORS[i % AVATAR_COLORS.length];
          return (
            <div
              key={entry.address}
              className="rd-board-row"
              style={{
                display: "grid",
                gridTemplateColumns: "28px 1.4fr 68px 84px 52px 108px",
                gap: 10,
                alignItems: "center",
                padding: "14px 8px",
                borderRadius: 8,
                borderBottom: "1px solid var(--border)",
                background: isNewcomer ? "var(--blue-50)" : "transparent",
              }}
            >
              <div style={{ fontWeight: 700, fontSize: 14, color: "var(--fg-muted)" }}>
                {String(entry.rank).padStart(2, "0")}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                <div
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 9999,
                    background: avatarBg,
                    color: "#fff",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 12,
                    fontWeight: 700,
                    flex: "none",
                  }}
                >
                  {initial}
                </div>
                <span
                  style={{
                    fontWeight: 600,
                    fontSize: 14,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                  title={entry.display}
                >
                  {entry.display}
                </span>
              </div>
              <div
                className="rd-col-role"
                style={{
                  textAlign: "right",
                  fontWeight: 600,
                  fontSize: 12,
                  color: isNewcomer ? "var(--brand)" : "var(--ink-soft)",
                }}
              >
                {isNewcomer ? "Ready" : isMaker ? "Maker" : "Taker"}
              </div>
              <div
                className="rd-col-swaps"
                style={{
                  textAlign: "right",
                  fontWeight: 600,
                  fontSize: 14,
                  color: "var(--ink-soft)",
                }}
              >
                {isNewcomer ? "—" : entry.swaps}
              </div>
              <div style={{ textAlign: "right", fontWeight: 700, fontSize: 14 }}>
                {Math.floor(entry.points).toLocaleString("en-US")}
              </div>
              <div
                style={{
                  textAlign: "right",
                  fontWeight: 600,
                  fontSize: 13,
                  color: isNewcomer ? "var(--fg-muted)" : "var(--fg)",
                }}
              >
                {isNewcomer
                  ? "waiting for first match"
                  : entry.projectedChz >= 1
                    ? `${Math.floor(entry.projectedChz).toLocaleString("en-US")} CHZ`
                    : "—"}
              </div>
            </div>
          );
        })
      )}

      <div
        className="rd-board-row"
        style={{
          display: "grid",
          gridTemplateColumns: "28px 1.4fr 68px 84px 52px 108px",
          gap: 10,
          alignItems: "center",
          padding: "14px 8px",
          borderRadius: 8,
          background: "var(--blue-50)",
          marginTop: top.length > 0 ? 0 : 8,
        }}
      >
        <div style={{ fontWeight: 700, fontSize: 14, color: "var(--brand)" }}>—</div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 30,
              height: 30,
              borderRadius: 9999,
              background: "var(--brand)",
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 12,
              fontWeight: 700,
              flex: "none",
            }}
          >
            Y
          </div>
          <span style={{ fontWeight: 600, fontSize: 14, color: "var(--brand)" }}>You</span>
        </div>
        <div className="rd-col-role" />
        <div className="rd-col-swaps" />
        <div style={{ textAlign: "right", fontWeight: 700, fontSize: 14, color: "var(--brand)" }}>
          0
        </div>
        <div style={{ textAlign: "right" }}>
          <Link href="/entrar" style={{ fontWeight: 600, fontSize: 13, color: "var(--brand)" }}>
            Claim wallet
          </Link>
        </div>
      </div>

      <div
        style={{
          fontSize: 12,
          fontWeight: 500,
          color: "var(--fg-muted)",
          marginTop: 14,
          padding: "0 8px",
        }}
      >
        {newcomers > 0 && scoring.length === 0
          ? "Open entry: verified names appear here instantly. Trade during the match window to move up."
          : poolCommitted
            ? "Estimated payout updates as the pot and leaderboard change."
            : "Estimated payout appears once a matchday pool is committed."}
      </div>
    </div>
  );
}

interface VenueBoardRow {
  key: string;
  label: string;
  tag: string;
  scored: boolean;
  /** Derivative notional, not spot turnover — never folded into the spot total. */
  perp?: boolean;
  usd: number | null; // null = tracked venue with no measured volume this window yet
  /** Slice of `usd` attributed via read-only key connections — players' own fills. */
  keyedUsd?: number;
  keyedTraders?: number;
  url: string;
  logo: string | null;
}

/**
 * One row per place the featured tokens actually trade: the scored Chiliz
 * on-chain layer first, then every tracked venue (CEX + Solana/Base pools)
 * with its measured window volume and a direct trade link.
 */
function buildVenueBoard(
  tokens: string[],
  volume: { source: string; quoteUsd: number }[],
  onchainUsd: number,
  keyed: { venue: string; usd: number; traders: number }[] = []
): VenueBoardRow[] {
  const bySource = new Map(volume.map((v) => [v.source, v.quoteUsd]));
  const keyedByVenue = new Map(keyed.map((k) => [k.venue, k]));
  const rows: VenueBoardRow[] = [
    {
      key: "chiliz",
      label: "Kayen / FanX",
      tag: "Chiliz Chain · earns points",
      scored: true,
      usd: onchainUsd,
      url: "https://app.kayen.org/",
      logo: venueLogoForSource("chiliz"),
    },
  ];
  for (const venue of venuesForTokens(tokens)) {
    const firstListing = tokens.flatMap((t) => CEX_LISTINGS[t]?.[venue as CexVenue] ?? [])[0];
    if (!firstListing) continue;
    const keyedRow = keyedByVenue.get(venue);
    rows.push({
      key: `cex:${venue}`,
      label: CEX_VENUE_LABEL[venue],
      tag: "CEX · tracked",
      scored: false,
      usd: bySource.get(`cex:${venue}`) ?? null,
      keyedUsd: keyedRow?.usd,
      keyedTraders: keyedRow?.traders,
      url: VENUE_TRADE_URL[venue](firstListing.inst),
      logo: venueLogoForSource(`cex:${venue}`),
    });
  }
  const dexSeen = new Set<string>();
  for (const pool of DEX_POOLS) {
    if (!tokens.includes(pool.token)) continue;
    const source = `${pool.network}:${pool.dex}`;
    if (dexSeen.has(source)) continue;
    dexSeen.add(source);
    rows.push({
      key: source,
      label: pool.dex === "meteora" ? "Jupiter / Meteora" : "Aerodrome",
      tag: `${DEX_NETWORK_LABEL[pool.network]} · tracked`,
      scored: false,
      usd: bySource.get(source) ?? null,
      url: dexTradeUrl(pool),
      logo: venueLogoForSource(source),
    });
  }
  if (VIBE_MARKETS.some((m) => tokens.includes(m.token))) {
    const symbolId = VIBE_MARKETS.find((m) => tokens.includes(m.token))!.symbolId;
    rows.push({
      key: VIBE_SOURCE,
      label: "vibe.trading",
      tag: "Perps · tracked · not spot",
      scored: false,
      perp: true,
      usd: bySource.get(VIBE_SOURCE) ?? null,
      url: VIBE_TRADE_URL(symbolId),
      logo: venueLogoForSource(VIBE_SOURCE),
    });
  }
  return rows.sort(
    (a, b) =>
      Number(b.scored) - Number(a.scored) ||
      Number(a.perp ?? false) - Number(b.perp ?? false) ||
      (b.usd ?? 0) - (a.usd ?? 0) ||
      a.label.localeCompare(b.label)
  );
}

function VenueBoard({ rows }: { rows: VenueBoardRow[] }) {
  if (rows.length <= 1) return null;
  const fmt = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 1,
  });
  return (
    <div style={{ marginTop: 14 }}>
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: ".08em",
          textTransform: "uppercase",
          color: "var(--fg-muted)",
          marginBottom: 8,
        }}
      >
        Trade where you already trade — the league tracks it
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))", gap: 6 }}>
        {rows.map((r) => (
          <a
            key={r.key}
            href={r.url}
            target="_blank"
            rel="noopener noreferrer"
            className="rd-elev"
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: 8,
              padding: "9px 12px",
              background: "var(--bg-muted)",
              border: "1px solid var(--border)",
              borderRadius: 10,
              textDecoration: "none",
            }}
          >
            {r.logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={r.logo}
                alt=""
                width={26}
                height={26}
                loading="lazy"
                style={{ borderRadius: 7, flex: "none", alignSelf: "center" }}
              />
            ) : null}
            <span style={{ minWidth: 0 }}>
              <span style={{ display: "block", fontWeight: 600, fontSize: 13, color: "var(--fg)" }}>
                {r.label}
              </span>
              <span
                style={{
                  display: "block",
                  fontSize: 11,
                  fontWeight: 600,
                  color: r.scored ? "var(--green-500)" : "var(--fg-muted)",
                }}
              >
                {r.tag}
              </span>
              {r.keyedUsd != null && r.keyedUsd > 0 ? (
                <span
                  style={{
                    display: "block",
                    fontSize: 11,
                    fontWeight: 600,
                    color: "var(--green-500)",
                  }}
                >
                  incl. {fmt.format(r.keyedUsd)} verified · {r.keyedTraders}{" "}
                  {r.keyedTraders === 1 ? "trader" : "traders"}
                </span>
              ) : null}
            </span>
            <span style={{ marginLeft: "auto", fontWeight: 700, fontSize: 13, color: "var(--fg)" }}>
              {r.usd != null && r.usd > 0 ? fmt.format(r.usd) : "—"}
            </span>
          </a>
        ))}
      </div>
    </div>
  );
}

export default async function Home() {
  const pot = getPot();
  const fundingVerified = getSetting("funding_verified") === "1";
  const seasonPoolChz = Number(getSetting("season_pool_chz") ?? 0);
  const match = getCurrentMatch() ?? null;
  const board = match
    ? getLeaderboard({ matchId: match.id, poolChz: match.pool_chz })
    : getLeaderboard({ poolChz: seasonPoolChz });
  const venueVolume = match ? getVenueVolume(match.id) : [];
  const keyedVolume = match ? getKeyedVenueVolume(match.id) : [];
  const onchainUsd = match ? getOnchainVolume(match.id) : 0;
  // Spot turnover only. Perp notional is a leveraged synthetic — a fan buying a
  // PSG perp never touches a PSG token — so adding it here would inflate a
  // token-demand figure with exposure that creates none.
  const totalVenueUsd =
    onchainUsd +
    venueVolume.reduce(
      (s, v) => s + (!isPerpSource(v.source) && Number.isFinite(v.quoteUsd) ? v.quoteUsd : 0),
      0
    );

  const homeName = match ? enName(match.home) : "—";
  const awayName = match ? enName(match.away) : "—";
  const homeColors = (match && CLUB_NAME_COLORS[match.home]) || ["#0076F4", "#16212E"];
  const awayColors = (match && CLUB_NAME_COLORS[match.away]) || ["#C52613", "#0a0a0a"];
  const tokens = match ? (JSON.parse(match.tokens) as string[]) : [];
  const windowOpen = match
    ? new Date(match.window_start_utc).getTime() <= Date.now() &&
      Date.now() < new Date(match.window_end_utc).getTime()
    : false;

  const eligiblePoints = Math.floor(board.totalPoints);
  // The CHZ a trader's points are actually divided into: the open match's pool,
  // or the committed season pool. Never `pot.potChzNow`, which is a target.
  const payoutPoolChz = match ? match.pool_chz : seasonPoolChz;
  // The board is only "live" while a window is open; otherwise it is a result,
  // and the page has to say when it was last computed rather than implying now.
  const boardIsLive = windowOpen;
  const boardAsOf = board.updatedAt;

  return (
    <main>
      {/* Hero — night match under floodlights, the club crests as the lineup */}
      <section className="rd-stadium">
        <div
          className="rd-section"
          style={{ maxWidth: 1200, margin: "0 auto", padding: "72px 40px 56px" }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 48,
              flexWrap: "wrap",
            }}
          >
            <div style={{ maxWidth: 620, minWidth: 300, flex: "1 1 420px" }}>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  letterSpacing: ".08em",
                  textTransform: "uppercase",
                  color: "var(--lime-500)",
                  marginBottom: 16,
                }}
              >
                Fan Token Trading League · Free entry
              </div>
              <h1
                className="rd-h1"
                style={{
                  fontSize: 52,
                  lineHeight: 1.03,
                  fontWeight: 800,
                  letterSpacing: "-.02em",
                  margin: "0 0 16px",
                  textTransform: "uppercase",
                  color: "#fff",
                }}
              >
                Trade the match.
                <br />
                Share the pot.
              </h1>
              <p
                style={{
                  fontSize: 18,
                  lineHeight: 1.6,
                  fontWeight: 500,
                  color: "rgba(255,255,255,.72)",
                  margin: "0 0 26px",
                  maxWidth: 540,
                }}
              >
                When your club plays, its Fan Token moves. Trade it while the match window is open
                — profit earns points, and points earn your share of the matchday&apos;s CHZ prize
                pool.
              </p>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
                <Link className="btn primary" href="/entrar">
                  Join this week — free
                </Link>
                <Link
                  href="/regras"
                  style={{ color: "rgba(255,255,255,.75)", fontSize: 14, fontWeight: 600 }}
                >
                  How scoring works
                </Link>
              </div>
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  marginTop: 24,
                  fontSize: 13,
                  fontWeight: 600,
                  color: "var(--green-300)",
                }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 9999,
                    background: windowOpen ? "var(--green-300)" : "rgba(255,255,255,.45)",
                    animation: windowOpen ? "rd-pulse 1.6s ease-in-out infinite" : "none",
                  }}
                />
                {windowOpen
                  ? board.wallets > 0
                    ? `${board.wallets.toLocaleString("en-US")} traders on the board · counting live`
                    : "Window open · counting live on-chain"
                  : board.wallets > 0
                    ? `${board.wallets.toLocaleString("en-US")} traders on the season board`
                    : "Next matchday window opens soon"}
              </div>
            </div>

            <div style={{ flex: "0 1 auto" }}>
              <div className="rd-crest-row" aria-hidden>
                {HERO_LINEUP.slice(0, 5).map((sym) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={sym} className="rd-crest" src={TOKEN_BADGES[sym]} alt="" width={66} height={66} />
                ))}
              </div>
              <div className="rd-crest-row" style={{ marginTop: 10, marginLeft: 28 }} aria-hidden>
                {HERO_LINEUP.slice(5).map((sym) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={sym} className="rd-crest" src={TOKEN_BADGES[sym]} alt="" width={66} height={66} />
                ))}
              </div>
              <div
                style={{
                  marginTop: 16,
                  fontSize: 12,
                  fontWeight: 600,
                  letterSpacing: ".06em",
                  textTransform: "uppercase",
                  color: "rgba(255,255,255,.55)",
                }}
              >
                {Object.keys(TOKENS).length} club tokens · {venueDirectory().length} venues · one
                table
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Pot + fixture */}
      <section
        id="pot"
        className="rd-hero-grid rd-section"
        style={{
          maxWidth: 1200,
          margin: "0 auto",
          padding: "36px 40px 24px",
          display: "grid",
          gridTemplateColumns: "1.5fr 1fr",
          gap: 24,
          alignItems: "stretch",
        }}
      >
        {/* Navy pot card */}
        <div
          style={{
            background: "var(--blue-ink)",
            borderRadius: 16,
            padding: 32,
            color: "#fff",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 16,
              marginBottom: 28,
              flexWrap: "wrap",
            }}
          >
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 9,
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: ".08em",
                textTransform: "uppercase",
                color: "rgba(255,255,255,.65)",
              }}
            >
              <span
                style={{
                  width: 9,
                  height: 9,
                  borderRadius: 2,
                  background: "var(--lime-500)",
                  transform: "rotate(45deg)",
                }}
              />
              {fundingVerified ? "Prize pool" : "Prize pool target"}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: ".04em",
                  padding: "5px 11px",
                  borderRadius: 9999,
                  border: fundingVerified
                    ? "1px solid rgba(255,255,255,.16)"
                    : "1px solid rgba(255,193,7,.45)",
                  color: fundingVerified ? "rgba(255,255,255,.75)" : "#FFD24A",
                }}
              >
                {fundingVerified ? "Funding verified" : "Not yet funded"}
              </span>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: ".04em",
                  padding: "5px 11px",
                  borderRadius: 9999,
                  border: "1px solid rgba(255,255,255,.16)",
                  color: "rgba(255,255,255,.75)",
                }}
              >
                Free entry
              </span>
            </div>
          </div>

          <div
            style={{
              fontSize: 14,
              fontWeight: 500,
              color: "rgba(255,255,255,.6)",
              marginBottom: 18,
            }}
          >
            {fundingVerified
              ? "Grows every day. Split by points on the board, week by week."
              : "Target for the pilot season — not yet funded. Prizes are paid only from confirmed funding, and only for matchdays announced as funded."}
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "flex-end",
              gap: 14,
              marginBottom: 20,
              flexWrap: "wrap",
            }}
          >
            <PotCounter potChz={pot.potChzNow} dailyChz={pot.dailyChz} asOf={pot.asOf} />
            <span
              style={{
                fontSize: 22,
                fontWeight: 700,
                color: "var(--lime-500)",
                paddingBottom: 6,
              }}
            >
              CHZ
            </span>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 16,
              paddingBottom: 24,
              marginBottom: 24,
              borderBottom: "1px solid rgba(255,255,255,.12)",
              flexWrap: "wrap",
            }}
          >
            {/* The daily accrual is only shown once funding is confirmed. A
                headline prize number that ticks up 10,000 CHZ a day with
                nothing behind it is the most damaging thing this page can
                show — getPot() already zeroes dailyChz while unfunded. */}
            {fundingVerified ? (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 7,
                  fontSize: 13,
                  fontWeight: 600,
                  color: "var(--green-300)",
                }}
              >
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M12 19V5" />
                  <path d="m5 12 7-7 7 7" />
                </svg>
                +{pot.dailyChz.toLocaleString("en-US")} CHZ today
              </span>
            ) : (
              <span style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,.62)" }}>
                Target — no CHZ committed yet
              </span>
            )}
            <span
              style={{
                fontSize: 12,
                fontWeight: 600,
                letterSpacing: ".06em",
                textTransform: "uppercase",
                color: "rgba(255,255,255,.5)",
              }}
            >
              {match ? (
                <>
                  {windowOpen ? "Window closes · " : "Kickoff · "}
                  <Countdown target={windowOpen ? match.window_end_utc : match.kickoff_utc} />
                </>
              ) : (
                fundingVerified ? "Season pot · pilot beta" : "Season target · pilot beta"
              )}
            </span>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr auto",
              gap: 20,
              alignItems: "center",
              marginTop: "auto",
            }}
          >
            <div>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: ".08em",
                  textTransform: "uppercase",
                  color: "rgba(255,255,255,.5)",
                  marginBottom: 8,
                }}
              >
                {match
                  ? `This matchday pool · ${match.pool_chz.toLocaleString("en-US")} CHZ`
                  : "Season pool committed"}
              </div>
              <div
                style={{
                  fontSize: 32,
                  fontWeight: 800,
                  letterSpacing: "-.01em",
                  lineHeight: 1,
                  marginBottom: 8,
                }}
              >
                {/* The committed pool — `season_pool_chz` / a match's own pool —
                    NOT the headline target. These are different numbers and the
                    page must never imply the target is what gets divided. */}
                {match ? match.pool_chz.toLocaleString("en-US") : seasonPoolChz.toLocaleString("en-US")}{" "}
                <span style={{ fontSize: 16, fontWeight: 700, color: "rgba(255,255,255,.55)" }}>
                  CHZ
                </span>
              </div>
              <div style={{ fontSize: 12, fontWeight: 500, color: "rgba(255,255,255,.5)" }}>
                {(match ? match.pool_chz : seasonPoolChz) <= 0
                  ? "No pool committed yet — free entry, points still count"
                  : eligiblePoints > 0
                    ? `split across ${eligiblePoints.toLocaleString("en-US")} points on the board`
                    : "Free entry — score by trading where you already trade"}
              </div>
            </div>
            <Link
              href="/entrar"
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 6,
                background: "var(--lime-500)",
                color: "var(--lime-ink)",
                borderRadius: 12,
                padding: "16px 20px",
                minWidth: 180,
              }}
            >
              <span style={{ fontSize: 13, fontWeight: 700 }}>Get into this week&apos;s payout</span>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: 12,
                  fontWeight: 600,
                  opacity: 0.8,
                }}
              >
                Join the weekly pot{" "}
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M5 12h14" />
                  <path d="m12 5 7 7-7 7" />
                </svg>
              </span>
            </Link>
          </div>
        </div>

        {/* Fixture card */}
        <div
          id="match"
          style={{
            background: "#fff",
            border: "1px solid var(--border)",
            borderRadius: 16,
            padding: 28,
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 6,
            }}
          >
            <div
              style={{
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: ".08em",
                textTransform: "uppercase",
                color: "var(--fg-muted)",
              }}
            >
              {windowOpen ? "Window open — scoring live" : "Next eligible fixture"}
            </div>
            {match ? (
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: ".08em",
                  textTransform: "uppercase",
                  color: "var(--fg-subtle)",
                  border: "1px solid var(--border)",
                  padding: "3px 8px",
                  borderRadius: 9999,
                }}
              >
                {enName(match.competition)}
              </span>
            ) : null}
          </div>

          {match ? (
            <>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: "var(--ink-soft)",
                  marginBottom: 24,
                }}
              >
                {enName(match.competition)}{" "}
                <span style={{ color: "var(--fg-muted)", fontWeight: 500 }}>
                  · Kickoff <Countdown target={match.kickoff_utc} />
                </span>
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr auto 1fr",
                  alignItems: "center",
                  gap: 10,
                  marginBottom: 24,
                }}
              >
                <ClubBadge name={homeName} colors={homeColors} />
                <div
                  style={{
                    color: "var(--fg-muted)",
                    fontWeight: 700,
                    fontSize: 12,
                    letterSpacing: ".1em",
                  }}
                >
                  VS
                </div>
                <ClubBadge name={awayName} colors={awayColors} />
              </div>
              <div style={{ marginBottom: 20 }}>
                <div
                  style={{
                    height: 6,
                    borderRadius: 9999,
                    background: "var(--neutral-100)",
                    position: "relative",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      position: "absolute",
                      left: 0,
                      top: 0,
                      bottom: 0,
                      width: windowOpen ? "55%" : "22%",
                      borderRadius: 9999,
                      background: "var(--brand)",
                    }}
                  />
                  <div
                    style={{
                      position: "absolute",
                      left: windowOpen ? "55%" : "22%",
                      top: "50%",
                      transform: "translate(-50%,-50%)",
                      width: 12,
                      height: 12,
                      borderRadius: 9999,
                      background: "#fff",
                      boxShadow: "0 0 0 3px var(--brand)",
                    }}
                  />
                </div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginTop: 9,
                    fontSize: 10,
                    fontWeight: 600,
                    letterSpacing: ".08em",
                    textTransform: "uppercase",
                    color: "var(--fg-muted)",
                  }}
                >
                  <span>Pre-match</span>
                  <span style={{ color: "var(--brand)" }}>Trade window</span>
                  <span>Post-match</span>
                </div>
              </div>
              <div
                style={{
                  marginTop: "auto",
                  background: "var(--bg-muted)",
                  border: "1px solid var(--border)",
                  borderRadius: 11,
                  padding: "14px 16px",
                  fontSize: 13,
                  lineHeight: 1.5,
                  fontWeight: 500,
                  color: "var(--ink-soft)",
                }}
              >
                Only trades placed inside the blue window count toward points.
                {tokens.length > 0 ? (
                  <>
                    {" "}
                    Tokens: <b style={{ color: "var(--fg)" }}>{tokens.join(" · ")}</b>.
                  </>
                ) : null}
                {totalVenueUsd > 0 ? (
                  <> Window volume so far: <b style={{ color: "var(--fg)" }}>
                    {new Intl.NumberFormat("en-US", {
                      style: "currency",
                      currency: "USD",
                      notation: "compact",
                      maximumFractionDigits: 1,
                    }).format(totalVenueUsd)}
                  </b>.</>
                ) : null}
              </div>
              <VenueBoard rows={buildVenueBoard(tokens, venueVolume, onchainUsd, keyedVolume)} />
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 14 }}>
                <a
                  className="btn primary sm"
                  href="https://app.kayen.org/"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Trade on Kayen
                </a>
                <Link className="btn secondary sm" href="/entrar">
                  Claim wallet
                </Link>
              </div>
            </>
          ) : (
            <div style={{ marginTop: 24, fontSize: 15, fontWeight: 500, color: "var(--ink-soft)" }}>
              Calendar being prepared. Featured fixtures land here as soon as the next matchday
              window is set.
            </div>
          )}
        </div>
      </section>

      {/* Venue wall — every place the league counts, always visible */}
      <section className="rd-section" style={{ maxWidth: 1200, margin: "0 auto", padding: "56px 40px 8px" }}>
        <div style={{ marginBottom: 28 }}>
          <div
            style={{
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: ".08em",
              textTransform: "uppercase",
              color: "var(--brand)",
              marginBottom: 12,
            }}
          >
            One league · every venue
          </div>
          <h2
            className="rd-h2"
            style={{
              fontSize: 34,
              fontWeight: 700,
              letterSpacing: "-.01em",
              lineHeight: 1.1,
              margin: "0 0 12px",
              textTransform: "uppercase",
            }}
          >
            Trade where you already trade
          </h2>
          <p
            style={{
              fontSize: 15,
              lineHeight: 1.6,
              fontWeight: 500,
              color: "var(--ink-soft)",
              margin: 0,
              maxWidth: 640,
            }}
          >
            Points come from verified Chiliz Chain trades today. Matchday volume on every other
            venue below — exchanges, Solana, Base and perps — is measured automatically from
            public data; nothing to connect. Perp notional is a derivative, so it is shown on
            its own line and never added to the spot total.
            {cexConnectEnabled() ? (
              <>
                {" "}
                On{" "}
                <b>
                  {KEYED_VENUES.map((v) => KEYED_VENUE_LABEL[v])
                    .join(", ")
                    .replace(/, ([^,]+)$/, " and $1")}
                </b>{" "}
                you can additionally{" "}
                <Link href="/entrar#cex" style={{ color: "var(--link)", fontWeight: 600 }}>
                  connect a read-only key
                </Link>{" "}
                so your own trades count as verified volume.
              </>
            ) : null}
          </p>
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(168px, 1fr))",
            gap: 12,
          }}
        >
          {venueDirectory().map((v) => (
            <a
              key={v.key}
              href={v.url}
              target="_blank"
              rel="noopener noreferrer"
              className="rd-elev"
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 12,
                background: "#fff",
                border: v.scored ? "1px solid var(--brand)" : "1px solid var(--border)",
                borderRadius: 14,
                padding: 18,
                textDecoration: "none",
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={v.logo}
                alt={`${v.label} logo`}
                width={44}
                height={44}
                loading="lazy"
                style={{ borderRadius: 11 }}
              />
              <span>
                <span style={{ display: "block", fontWeight: 700, fontSize: 15, color: "var(--fg)" }}>
                  {v.label}
                </span>
                <span
                  style={{
                    display: "block",
                    fontSize: 11,
                    fontWeight: 600,
                    marginTop: 3,
                    color: v.scored ? "var(--brand)" : "var(--fg-muted)",
                  }}
                >
                  {v.tag}
                </span>
                {cexConnectEnabled() && (KEYED_VENUES as readonly string[]).includes(v.key) ? (
                  <span
                    style={{
                      display: "inline-block",
                      marginTop: 8,
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: ".06em",
                      textTransform: "uppercase",
                      color: "var(--brand)",
                      border: "1px solid var(--brand)",
                      borderRadius: 999,
                      padding: "3px 8px",
                    }}
                  >
                    Read-only connect
                  </span>
                ) : null}
              </span>
            </a>
          ))}
        </div>
      </section>

      {/* Standings + verify */}
      <section className="rd-section" style={{ maxWidth: 1200, margin: "0 auto", padding: "56px 40px" }}>
        <div style={{ marginBottom: 32 }}>
          <div
            style={{
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: ".08em",
              textTransform: "uppercase",
              color: "var(--brand)",
              marginBottom: 12,
            }}
          >
            {windowOpen ? "Live weekly standings" : "Season standings"}
          </div>
          <h2
            className="rd-h2"
            style={{
              fontSize: 34,
              fontWeight: 700,
              letterSpacing: "-.01em",
              lineHeight: 1.1,
              margin: 0,
              textTransform: "uppercase",
            }}
          >
            Every point increases your share
          </h2>
        </div>

        <div
          className="rd-standings-grid"
          style={{
            display: "grid",
            gridTemplateColumns: "1.55fr 1fr",
            gap: 24,
            alignItems: "start",
          }}
        >
          <StandingsTable
            entries={board.entries}
            wallets={board.wallets}
            totalPoints={board.totalPoints}
            live={boardIsLive}
            asOf={boardAsOf}
            poolCommitted={payoutPoolChz > 0}
          />

          <div
            style={{
              background: "var(--blue-ink)",
              borderRadius: 16,
              padding: 28,
              color: "#fff",
            }}
          >
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: ".08em",
                textTransform: "uppercase",
                color: "rgba(255,255,255,.55)",
                marginBottom: 14,
              }}
            >
              Open to everyone
            </div>
            <h3 style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.2, margin: "0 0 12px" }}>
              Choose how the league verifies your trades
            </h3>
            <p
              style={{
                fontSize: 14,
                lineHeight: 1.6,
                fontWeight: 500,
                color: "rgba(255,255,255,.6)",
                margin: "0 0 24px",
              }}
            >
              No deposit and no entry fee. Connect once, then keep trading where you already trade.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <Link
                href="/entrar"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  background: "rgba(255,255,255,.06)",
                  border: "1px solid rgba(255,255,255,.1)",
                  borderRadius: 12,
                  padding: 16,
                  color: "#fff",
                }}
              >
                <span
                  style={{
                    width: 40,
                    height: 40,
                    flex: "none",
                    borderRadius: 10,
                    background: "rgba(255,255,255,.08)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M12 3 5 5.9v4.8c0 4.2 2.9 6.9 7 8.3 4.1-1.4 7-4.1 7-8.3V5.9L12 3Z" />
                    <path d="m9 11.6 2.1 2.1L15.2 9" />
                  </svg>
                </span>
                <span style={{ flex: 1 }}>
                  <span style={{ display: "block", fontWeight: 600, fontSize: 15, color: "#fff" }}>
                    Verify a wallet
                  </span>
                  <span
                    style={{
                      display: "block",
                      fontSize: 12,
                      color: "rgba(255,255,255,.55)",
                      marginTop: 2,
                    }}
                  >
                    Browser wallet or the Socios.com app. One signature, no approval.
                  </span>
                </span>
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="rgba(255,255,255,.5)"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="m9 18 6-6-6-6" />
                </svg>
              </Link>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  background: "rgba(255,255,255,.06)",
                  border: "1px solid rgba(255,255,255,.1)",
                  borderRadius: 12,
                  padding: 16,
                  opacity: 0.75,
                }}
              >
                <span
                  style={{
                    width: 40,
                    height: 40,
                    flex: "none",
                    borderRadius: 10,
                    background: "rgba(255,255,255,.08)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#fff",
                  }}
                >
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M2.4 12S5.8 6 12 6s9.6 6 9.6 6-3.4 6-9.6 6S2.4 12 2.4 12Z" />
                    <circle cx="12" cy="12" r="2.4" />
                  </svg>
                </span>
                <span style={{ flex: 1 }}>
                  <span style={{ display: "block", fontWeight: 600, fontSize: 15, color: "#fff" }}>
                    Connect a CEX account
                  </span>
                  <span
                    style={{
                      display: "block",
                      fontSize: 12,
                      color: "rgba(255,255,255,.55)",
                      marginTop: 2,
                    }}
                  >
                    Read-only API keys so your own CEX trades score — next. Venue volume across
                    eight exchanges, Solana, Base and vibe.trading perps is tracked already.
                  </span>
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Math strip */}
      <section
        className="rd-math-grid rd-section"
        style={{
          maxWidth: 1200,
          margin: "0 auto",
          padding: "0 40px 72px",
          display: "grid",
          gridTemplateColumns: "1.55fr 1fr",
          gap: 24,
          alignItems: "stretch",
        }}
      >
        <div
          style={{
            background: "var(--bg-muted)",
            border: "1px solid var(--border)",
            borderRadius: 16,
            padding: 28,
          }}
        >
          <div
            style={{
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: ".08em",
              textTransform: "uppercase",
              color: "var(--fg-muted)",
              marginBottom: 22,
            }}
          >
            How the weekly payout is calculated
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
            <div
              style={{
                flex: 1,
                minWidth: 120,
                background: "#fff",
                border: "1px solid var(--border)",
                borderRadius: 12,
                padding: 18,
              }}
            >
              <div style={{ fontSize: 30, fontWeight: 800, color: "var(--fg)" }}>pts</div>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: ".05em",
                  textTransform: "uppercase",
                  color: "var(--fg-muted)",
                  marginTop: 4,
                }}
              >
                Your points
              </div>
            </div>
            <span style={{ fontSize: 22, fontWeight: 700, color: "var(--fg-muted)" }}>÷</span>
            <div
              style={{
                flex: 1,
                minWidth: 120,
                background: "#fff",
                border: "1px solid var(--border)",
                borderRadius: 12,
                padding: 18,
              }}
            >
              <div style={{ fontSize: 30, fontWeight: 800, color: "var(--fg)" }}>
                {eligiblePoints > 0 ? eligiblePoints.toLocaleString("en-US") : "Σ"}
              </div>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: ".05em",
                  textTransform: "uppercase",
                  color: "var(--fg-muted)",
                  marginTop: 4,
                }}
              >
                All points
              </div>
            </div>
            <span style={{ fontSize: 22, fontWeight: 700, color: "var(--fg-muted)" }}>×</span>
            <div
              style={{
                flex: 1,
                minWidth: 120,
                background: "#fff",
                border: "1px solid var(--border)",
                borderRadius: 12,
                padding: 18,
              }}
            >
              {/* The COMMITTED pool, never the headline target — this box is
                  multiplied by a trader's points, so putting an unfunded
                  aspiration here is a promise the league can't keep. */}
              <div style={{ fontSize: 30, fontWeight: 800, color: "var(--fg)" }}>
                {payoutPoolChz > 0
                  ? payoutPoolChz >= 1000
                    ? `${(payoutPoolChz / 1000).toFixed(payoutPoolChz % 1000 === 0 ? 0 : 1)}k`
                    : payoutPoolChz.toLocaleString("en-US")
                  : "—"}
              </div>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: ".05em",
                  textTransform: "uppercase",
                  color: "var(--fg-muted)",
                  marginTop: 4,
                }}
              >
                {payoutPoolChz > 0 ? "Committed pool" : "Pool to be confirmed"}
              </div>
            </div>
          </div>
          <div style={{ marginTop: 20, fontSize: 15, fontWeight: 600, color: "var(--fg)" }}>
            = <span style={{ color: "var(--brand)" }}>your share of the pot</span>
          </div>
          <div
            style={{
              marginTop: 8,
              fontSize: 13,
              fontWeight: 500,
              lineHeight: 1.55,
              color: "var(--fg-muted)",
            }}
          >
            Points come from verified profit — volume only unlocks them, and wash trades score
            zero. Points on wallets that never verify are not paid; that share stays in the pot.{" "}
            <Link href="/regras">Read the full formula</Link>.
          </div>
        </div>

        <div
          style={{
            background: "var(--brand)",
            borderRadius: 16,
            padding: 28,
            color: "#fff",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
          }}
        >
          <h3 style={{ fontSize: 24, fontWeight: 700, margin: "0 0 12px" }}>One rule</h3>
          <p
            style={{
              fontSize: 15,
              lineHeight: 1.6,
              fontWeight: 500,
              color: "rgba(255,255,255,.9)",
              margin: 0,
            }}
          >
            Trade the featured club tokens while the match window is open. Your verified result is
            your score — profit earns points, points earn CHZ. Play any week, skip any week;
            nothing else counts.
          </p>
        </div>
      </section>

      {/* Connect band */}
      <section
        style={{
          background: "var(--bg-muted)",
          borderTop: "1px solid var(--border)",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div className="rd-section" style={{ maxWidth: 1200, margin: "0 auto", padding: "72px 40px" }}>
          <div style={{ maxWidth: 640, marginBottom: 40 }}>
            <div className="eyebrow" style={{ marginBottom: 14 }}>
              Join once
            </div>
            <h2
              className="rd-h2"
              style={{
                fontSize: 36,
                fontWeight: 700,
                letterSpacing: "-.01em",
                lineHeight: 1.1,
                margin: "0 0 14px",
              }}
            >
              Keep trading where you already trade
            </h2>
            <p
              style={{
                fontSize: 16,
                lineHeight: 1.6,
                fontWeight: 500,
                color: "var(--ink-soft)",
                margin: 0,
              }}
            >
              Connect a wallet or link a read-only exchange — you can disconnect at any time. The
              league reads verified activity; it never executes trades or holds funds.
            </p>
          </div>
          <div
            className="rd-connect-grid"
            style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1.1fr", gap: 16 }}
          >
            <div
              style={{
                background: "#fff",
                border: "1px solid var(--border)",
                borderRadius: 16,
                padding: 24,
              }}
            >
              <div
                style={{
                  width: 46,
                  height: 46,
                  borderRadius: 12,
                  background: "#fff",
                  border: "1px solid var(--border-strong)",
                  color: "var(--fg)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: 18,
                }}
              >
                <svg
                  width="21"
                  height="21"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M12 3 5 5.9v4.8c0 4.2 2.9 6.9 7 8.3 4.1-1.4 7-4.1 7-8.3V5.9L12 3Z" />
                  <path d="m9 11.6 2.1 2.1L15.2 9" />
                </svg>
              </div>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: ".08em",
                  textTransform: "uppercase",
                  color: "var(--fg-muted)",
                  marginBottom: 6,
                }}
              >
                DEX Wallet
              </div>
              <h3 style={{ fontSize: 19, fontWeight: 700, margin: "0 0 8px" }}>Verify a wallet</h3>
              <p
                style={{
                  fontSize: 14,
                  lineHeight: 1.55,
                  fontWeight: 500,
                  color: "var(--ink-soft)",
                  margin: "0 0 18px",
                }}
              >
                Sign a message to prove ownership. No transaction, no gas fee, no token approval.
              </p>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    padding: "5px 11px",
                    borderRadius: 9999,
                    background: "var(--bg-muted)",
                    border: "1px solid var(--border)",
                    color: "var(--ink-soft)",
                  }}
                >
                  Chiliz Chain
                </span>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    padding: "5px 11px",
                    borderRadius: 9999,
                    background: "var(--bg-muted)",
                    border: "1px solid var(--border)",
                    color: "var(--ink-soft)",
                  }}
                >
                  Socios.com app
                </span>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    padding: "5px 11px",
                    borderRadius: 9999,
                    background: "var(--bg-muted)",
                    border: "1px solid var(--border)",
                    color: "var(--ink-soft)",
                  }}
                >
                  Live now
                </span>
              </div>
            </div>

            <div
              style={{
                background: "#fff",
                border: "1px solid var(--border)",
                borderRadius: 16,
                padding: 24,
              }}
            >
              <div
                style={{
                  width: 46,
                  height: 46,
                  borderRadius: 12,
                  background: "#fff",
                  border: "1px solid var(--border-strong)",
                  color: "var(--fg)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: 18,
                }}
              >
                <svg
                  width="21"
                  height="21"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M2.4 12S5.8 6 12 6s9.6 6 9.6 6-3.4 6-9.6 6S2.4 12 2.4 12Z" />
                  <circle cx="12" cy="12" r="2.4" />
                </svg>
              </div>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: ".08em",
                  textTransform: "uppercase",
                  color: "var(--fg-muted)",
                  marginBottom: 6,
                }}
              >
                CEX Account
              </div>
              <h3 style={{ fontSize: 19, fontWeight: 700, margin: "0 0 8px" }}>Link an exchange</h3>
              <p
                style={{
                  fontSize: 14,
                  lineHeight: 1.55,
                  fontWeight: 500,
                  color: "var(--ink-soft)",
                  margin: "0 0 18px",
                }}
              >
                Connect a read-only API key so your own exchange trades show as verified volume
                during match windows. The key can only read — trading or withdrawal rights are
                refused — and venue-wide volume on Binance, OKX, Gate, MEXC, Bitget, HTX, Upbit
                and Mercado Bitcoin is already tracked on the matchday board.
              </p>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <Link className="btn secondary sm" href="/entrar#cex">
                  Connect OKX or Binance
                </Link>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    padding: "5px 11px",
                    borderRadius: 9999,
                    background: "var(--bg-muted)",
                    border: "1px solid var(--border)",
                    color: "var(--ink-soft)",
                  }}
                >
                  Read-only · live now
                </span>
              </div>
            </div>

            <div
              style={{
                background: "var(--blue-ink)",
                borderRadius: 16,
                padding: 24,
                color: "#fff",
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: ".08em",
                  textTransform: "uppercase",
                  color: "rgba(255,255,255,.55)",
                  marginBottom: 18,
                }}
              >
                How the league works
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {[
                  {
                    n: "1",
                    title: "Connect once",
                    desc: "Verify ownership or set safe read-only permissions.",
                  },
                  {
                    n: "2",
                    title: "Trade the window",
                    desc: "Only listed tokens inside published match windows count.",
                  },
                  {
                    n: "3",
                    title: "Score with profit",
                    desc: "Profit earns points; volume only unlocks them. Wash trading scores zero.",
                  },
                ].map((step) => (
                  <div key={step.n} style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
                    <div
                      style={{
                        width: 26,
                        height: 26,
                        flex: "none",
                        borderRadius: 9999,
                        background: "rgba(255,255,255,.1)",
                        color: "#fff",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 12,
                        fontWeight: 700,
                      }}
                    >
                      {step.n}
                    </div>
                    <div>
                      <div
                        style={{
                          fontWeight: 600,
                          fontSize: 15,
                          color: "#fff",
                          marginBottom: 3,
                        }}
                      >
                        {step.title}
                      </div>
                      <div
                        style={{
                          fontSize: 13,
                          lineHeight: 1.5,
                          fontWeight: 500,
                          color: "rgba(255,255,255,.6)",
                        }}
                      >
                        {step.desc}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* League pathway */}
      <section className="rd-section" style={{ maxWidth: 1200, margin: "0 auto", padding: "80px 40px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            gap: 40,
            flexWrap: "wrap",
            marginBottom: 40,
          }}
        >
          <div style={{ maxWidth: 560 }}>
            <div className="eyebrow" style={{ marginBottom: 14 }}>
              Season roadmap
            </div>
            <h2
              className="rd-h2"
              style={{
                fontSize: 36,
                fontWeight: 700,
                letterSpacing: "-.01em",
                lineHeight: 1.1,
                margin: 0,
              }}
            >
              Anyone can enter. Premier status is earned.
            </h2>
          </div>
          <p
            style={{
              maxWidth: 400,
              fontSize: 15,
              lineHeight: 1.6,
              fontWeight: 500,
              color: "var(--ink-soft)",
              margin: 0,
            }}
          >
            The Open Arena is live today — free entry, every match window. The competitive tiers
            arrive as the season grows, and your verified record now is your qualification later.
          </p>
        </div>
        <div
          className="rd-pathway-grid"
          style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 16 }}
        >
          {[
            {
              kicker: "Open now",
              title: "Open Arena",
              desc: "Enter every eligible match window. Free, always on.",
              dark: true,
            },
            {
              kicker: "Coming next",
              title: "Challenger Rank",
              desc: "Your matchday results build a verified record that qualifies you upward.",
              dark: false,
            },
            {
              kicker: "Planned · 18 seats",
              title: "Premier League",
              desc: "Weekly head-to-heads and a live season table.",
              dark: false,
            },
            {
              kicker: "Planned",
              title: "Battle Nights",
              desc: "Rivalries, teams and broadcast-ready moments.",
              dark: false,
            },
          ].map((stage) => (
            <div
              key={stage.title}
              style={{
                borderRadius: 16,
                padding: 22,
                border: stage.dark ? "1px solid var(--blue-ink)" : "1px solid var(--border)",
                background: stage.dark ? "var(--blue-ink)" : "#fff",
                color: stage.dark ? "#fff" : "var(--fg)",
                display: "flex",
                flexDirection: "column",
                gap: 10,
                minHeight: 172,
              }}
            >
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: ".09em",
                  textTransform: "uppercase",
                  color: stage.dark ? "var(--lime-500)" : "var(--fg-muted)",
                }}
              >
                {stage.kicker}
              </div>
              <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-.01em" }}>
                {stage.title}
              </div>
              <div
                style={{
                  fontSize: 13,
                  lineHeight: 1.5,
                  fontWeight: 500,
                  color: stage.dark ? "rgba(255,255,255,.6)" : "var(--ink-soft)",
                  marginTop: "auto",
                }}
              >
                {stage.desc}
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
