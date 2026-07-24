import Link from "next/link";
import { Countdown } from "@/components/Countdown";
import { PotCounter } from "@/components/PotCounter";
import { enName } from "@/lib/i18n";
import { getPot } from "@/lib/pot";
import {
  getCexVolume,
  getCurrentMatch,
  getLeaderboard,
  getOnchainVolume,
  type LeaderboardEntry,
  type MatchRow,
} from "@/lib/queries";

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
          background: `linear-gradient(135deg, ${colors[0]}, ${colors[1]})`,
          border: "2px solid var(--border)",
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

function StandingsTable({
  entries,
  wallets,
}: {
  entries: LeaderboardEntry[];
  wallets: number;
}) {
  const top = entries.slice(0, 8);
  const scoring = top.filter((e) => e.points > 0);
  const totalPoints = scoring.reduce((s, e) => s + e.points, 0);
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
        <div style={{ fontWeight: 700, fontSize: 18 }}>Live leaderboard</div>
        <span style={{ fontSize: 12, fontWeight: 500, color: "var(--fg-muted)" }}>
          {scoring.length > 0
            ? `${wallets.toLocaleString("en-US")} scoring · ${Math.floor(totalPoints).toLocaleString("en-US")} eligible points`
            : top.length > 0
              ? `${top.length} verified · waiting for first trades`
              : "Open entry — claim a wallet to appear"}
        </span>
      </div>

      <div
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
        <div style={{ textAlign: "right" }}>Role</div>
        <div style={{ textAlign: "right" }}>Swaps</div>
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
                  title={`${entry.display} · ${entry.address}`}
                >
                  {entry.display}
                </span>
              </div>
              <div
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
        <div />
        <div />
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
          : "Estimated payout updates as the pot and leaderboard change."}
      </div>
    </div>
  );
}

export default async function Home() {
  const pot = getPot();
  const match = getCurrentMatch() ?? null;
  const board = match
    ? getLeaderboard({ matchId: match.id, poolChz: match.pool_chz })
    : getLeaderboard({ poolChz: 0 });
  const cexVenues = match ? getCexVolume(match.id) : [];
  const onchainUsd = match ? getOnchainVolume(match.id) : 0;
  const totalVenueUsd =
    onchainUsd + cexVenues.reduce((s, v) => s + (Number.isFinite(v.quoteUsd) ? v.quoteUsd : 0), 0);

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

  return (
    <main>
      {/* Hero copy */}
      <section style={{ maxWidth: 1200, margin: "0 auto", padding: "64px 40px 36px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            gap: 40,
            flexWrap: "wrap",
          }}
        >
          <div style={{ maxWidth: 680 }}>
            <div
              style={{
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: ".08em",
                textTransform: "uppercase",
                color: "var(--brand)",
                marginBottom: 16,
              }}
            >
              Open weekly league · Free entry
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
                color: "var(--ink-soft)",
                margin: 0,
                maxWidth: 560,
              }}
            >
              Connect once, trade eligible Fan Tokens inside published match windows, and earn a
              share of Sunday&apos;s reward pool.
            </p>
          </div>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              fontSize: 13,
              fontWeight: 600,
              padding: "8px 15px",
              borderRadius: 9999,
              background: "var(--green-50)",
              color: "var(--green-500)",
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: 9999,
                background: "var(--green-500)",
                animation: "rd-pulse 1.6s ease-in-out infinite",
              }}
            />
            {board.wallets > 0
              ? `${board.wallets.toLocaleString("en-US")} traders scoring`
              : "Live on-chain counting"}
          </span>
        </div>
      </section>

      {/* Pot + fixture */}
      <section
        id="pot"
        className="rd-hero-grid"
        style={{
          maxWidth: 1200,
          margin: "0 auto",
          padding: "0 40px 24px",
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
              Weekly reward pool
            </div>
            <div style={{ display: "flex", gap: 8 }}>
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
                Funding verified
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
            The pot keeps growing until the weekly close.
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
                "Season pot · pilot beta"
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
                  : "Season target pot"}
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
                {match ? match.pool_chz.toLocaleString("en-US") : Math.floor(pot.potChzNow).toLocaleString("en-US")}{" "}
                <span style={{ fontSize: 16, fontWeight: 700, color: "rgba(255,255,255,.55)" }}>
                  CHZ
                </span>
              </div>
              <div style={{ fontSize: 12, fontWeight: 500, color: "rgba(255,255,255,.5)" }}>
                {eligiblePoints > 0
                  ? `${eligiblePoints.toLocaleString("en-US")} eligible points on the board`
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

      {/* Standings + verify */}
      <section style={{ maxWidth: 1200, margin: "0 auto", padding: "56px 40px" }}>
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
            Live weekly standings
          </div>
          <h2
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
          <StandingsTable entries={board.entries} wallets={board.wallets} />

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
              Choose how Rodada verifies your trades
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
                    Sign a message. No approval.
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
                    Read-only API access — OKX · Binance next.
                  </span>
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Math strip */}
      <section
        className="rd-math-grid"
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
              <div style={{ fontSize: 30, fontWeight: 800, color: "var(--fg)" }}>
                {match
                  ? match.pool_chz >= 1000
                    ? `${(match.pool_chz / 1000).toFixed(match.pool_chz % 1000 === 0 ? 0 : 1)}k`
                    : match.pool_chz.toLocaleString("en-US")
                  : `${(pot.potChzNow / 1_000_000).toFixed(2)}M`}
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
                Current pot
              </div>
            </div>
          </div>
          <div style={{ marginTop: 20, fontSize: 15, fontWeight: 600, color: "var(--fg)" }}>
            ={" "}
            <span style={{ color: "var(--brand)" }}>
              share of the pool by points
            </span>{" "}
            · skill × volume unlock
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
          <h3 style={{ fontSize: 24, fontWeight: 700, margin: "0 0 12px" }}>Simple by design</h3>
          <p
            style={{
              fontSize: 15,
              lineHeight: 1.6,
              fontWeight: 500,
              color: "rgba(255,255,255,.9)",
              margin: 0,
            }}
          >
            No closed league, no assigned opponent, no lockout. Your verified trades inside the match
            window are your result — that&apos;s the whole game.
          </p>
        </div>
      </section>
    </main>
  );
}
