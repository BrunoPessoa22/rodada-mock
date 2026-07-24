import Link from "next/link";
import { Countdown } from "@/components/Countdown";
import { Icon } from "@/components/Icons";
import { PotCounter } from "@/components/PotCounter";
import { enName } from "@/lib/i18n";
import { getPot } from "@/lib/pot";
import { getChzPrice } from "@/lib/prices";
import { venueInstruments, VENUE_TRADE_URL } from "@/lib/cex";
import {
  getCexVolume,
  getCurrentMatch,
  getLeaderboard,
  getOnchainVolume,
  type CexVenueVolume,
  type LeaderboardEntry,
  type MatchRow,
} from "@/lib/queries";

export const dynamic = "force-dynamic";

function Num({ value, digits = 0 }: { value: number; digits?: number }) {
  return (
    <>
      {value.toLocaleString("en-US", {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      })}
    </>
  );
}

const CLUB_COLORS: Record<string, [string, string]> = {
  ARG: ["#75AADB", "#FFFFFF"],
  SPAIN: ["#AA151B", "#F1BF00"],
  MENGO: ["#C52613", "#0a0a0a"],
  FLU: ["#7A1F3D", "#009E60"],
  BAR: ["#A50044", "#004D98"],
  PSG: ["#004170", "#DA291C"],
};

const CLUB_NAME_COLORS: Record<string, [string, string]> = {
  Flamengo: ["#C52613", "#0a0a0a"],
  Chapecoense: ["#009846", "#FFFFFF"],
  "São Paulo": ["#FE0000", "#FFFFFF"],
  Fluminense: ["#7A1F3D", "#009E60"],
  Argentina: ["#75AADB", "#FFFFFF"],
  Espanha: ["#AA151B", "#F1BF00"],
  Spain: ["#AA151B", "#F1BF00"],
};

function fmtUsd(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function LeaderboardPanel({
  entries,
  totalPoints,
  wallets,
  match,
}: {
  entries: LeaderboardEntry[];
  totalPoints: number;
  wallets: number;
  match: MatchRow | null;
}) {
  const top = entries.slice(0, 8);
  const cutoff = top.length > 0 ? Math.floor(top[top.length - 1].points) : 0;
  const windowOpen = match
    ? new Date(match.window_start_utc).getTime() <= Date.now() &&
      Date.now() < new Date(match.window_end_utc).getTime()
    : false;

  return (
    <div className="panel" id="board">
      <div className="ph">
        <Icon id="i-trophy" lg />
        <h3>Every point increases your share</h3>
      </div>
      <p className="secsub" style={{ marginBottom: 0, marginTop: 4 }}>
        Rank by skill × volume on match day. Projection is your current share of this matchday
        pool.
      </p>
      {top.length === 0 ? (
        <p className="gapline">
          {windowOpen
            ? "Window open — Rodada counts real Kayen trades and the first entries appear within minutes. Be the first name on this board."
            : "The window hasn't opened yet — Rodada counts real Kayen trades inside the matchday window. Be the first name on this board."}
        </p>
      ) : (
        <table className="lb">
          <tbody>
            {top.map((entry) => (
              <tr key={entry.address}>
                <td className="pos">{entry.rank}</td>
                <td className="handle" title={entry.address}>
                  {entry.display}
                </td>
                <td className="role">
                  {entry.makerNetAddUsd > Math.abs(entry.netTakerUsd) ? (
                    <span className="badge mid">Maker</span>
                  ) : (
                    <span className="badge low">Taker</span>
                  )}
                </td>
                <td className="earn">
                  {entry.projectedChz >= 1
                    ? `~${Math.floor(entry.projectedChz).toLocaleString("en-US")} CHZ`
                    : null}
                </td>
                <td className="pts">
                  <Num value={Math.floor(entry.points)} />
                  {" pts"}
                </td>
              </tr>
            ))}
            <tr className="you">
              <td className="pos">—</td>
              <td className="handle">you</td>
              <td className="role"></td>
              <td className="earn">
                <Link href="/entrar">claim wallet</Link>
              </td>
              <td className="pts">0 pts</td>
            </tr>
          </tbody>
        </table>
      )}
      {top.length > 0 ? (
        <p className="gapline">
          <b>To get in the race:</b> top {top.length} closes at {cutoff.toLocaleString("en-US")} pts.
          Skill (PnL% from a total-loss floor) × volume unlock on Kayen puts you on this board.
        </p>
      ) : null}
      {totalPoints > 0 && match ? (
        <p className="gapline" style={{ marginTop: 4 }}>
          {wallets.toLocaleString("en-US")} wallets scoring ·{" "}
          {match.pool_chz.toLocaleString("en-US")} CHZ this matchday · projection = your current
          share of the pool by points.
        </p>
      ) : null}
    </div>
  );
}

function FixtureCard({
  match,
  cexVenues,
  onchainUsd,
}: {
  match: MatchRow | null;
  cexVenues: CexVenueVolume[];
  onchainUsd: number;
}) {
  if (!match) {
    return (
      <div className="fixture-card" id="match">
        <span className="eyebrow">Next match</span>
        <h3>Calendar being prepared</h3>
        <p className="fixture-note" style={{ marginTop: 12 }}>
          Featured fixtures land here as soon as the next matchday window is set.
        </p>
      </div>
    );
  }

  const tokens = JSON.parse(match.tokens) as string[];
  const homeColors =
    CLUB_NAME_COLORS[match.home] ?? CLUB_COLORS[tokens[0]] ?? ["#3B5BFF", "#E4E8F1"];
  const awayColors =
    CLUB_NAME_COLORS[match.away] ?? CLUB_COLORS[tokens[1] ?? tokens[0]] ?? ["#0B1220", "#E4E8F1"];
  const okxInsts = venueInstruments(tokens, "okx");
  const binanceInsts = venueInstruments(tokens, "binance");
  const venueUsd = Object.fromEntries(cexVenues.map((v) => [v.venue, v.quoteUsd])) as Record<
    string,
    number
  >;
  const hasVolume = onchainUsd > 0 || cexVenues.some((v) => v.quoteUsd > 0);
  const windowOpen =
    new Date(match.window_start_utc).getTime() <= Date.now() &&
    Date.now() < new Date(match.window_end_utc).getTime();
  const kayenUrl = "https://app.kayen.org/";

  return (
    <div className="fixture-card" id="match">
      <span className="eyebrow">
        {windowOpen ? "Window open — scoring live" : "Next fixture — your way in"}
      </span>
      <h3>
        <span className="clubdots" aria-hidden="true">
          <i style={{ background: homeColors[0] }}></i>
          <i style={{ background: homeColors[1] }}></i>
        </span>
        {enName(match.home)} <span className="vs">×</span> {enName(match.away)}{" "}
        <span className="clubdots" aria-hidden="true">
          <i style={{ background: awayColors[0] }}></i>
          <i style={{ background: awayColors[1] }}></i>
        </span>
      </h3>
      <div className="fixture-kick">
        <span className="countchip">
          <Icon id="i-zap" />
          {windowOpen ? (
            <>
              window closes <Countdown target={match.window_end_utc} />
            </>
          ) : (
            <>
              kickoff <Countdown target={match.kickoff_utc} /> — points close at the whistle
            </>
          )}
        </span>
        <span className="achip">{enName(match.competition)}</span>
      </div>
      <div className="fixture-pool">
        <b>Points live</b> on this match · matchday pays{" "}
        <b>{match.pool_chz.toLocaleString("en-US")} CHZ</b> from the pot
      </div>
      <p className="fixture-tokens">
        Tokens counted: <b>{tokens.join(" · ")}</b> — automatic on-chain attribution on Kayen.
      </p>
      <div className="fixture-venues">
        <a className="btn primary sm" href={kayenUrl} target="_blank" rel="noopener noreferrer">
          Trade on Kayen
        </a>
        {okxInsts.length > 0 ? (
          <a
            className="btn secondary sm"
            href={VENUE_TRADE_URL.okx(okxInsts[0])}
            target="_blank"
            rel="noopener noreferrer"
          >
            OKX
          </a>
        ) : (
          <span className="btn secondary sm" aria-disabled="true" style={{ opacity: 0.55, cursor: "default" }}>
            OKX
          </span>
        )}
        {binanceInsts.length > 0 ? (
          <a
            className="btn secondary sm"
            href={VENUE_TRADE_URL.binance(binanceInsts[0])}
            target="_blank"
            rel="noopener noreferrer"
          >
            Binance
          </a>
        ) : (
          <span className="btn secondary sm" aria-disabled="true" style={{ opacity: 0.55, cursor: "default" }}>
            Binance
          </span>
        )}
        {hasVolume ? (
          <span className="fixture-note">
            Window volume — Kayen {fmtUsd(onchainUsd)}
            {venueUsd.okx !== undefined ? ` · OKX ${fmtUsd(venueUsd.okx)}` : ""}
            {venueUsd.binance !== undefined ? ` · Binance ${fmtUsd(venueUsd.binance)}` : ""}.
            Kayen counts wallet by wallet; exchanges count by venue.
          </span>
        ) : (
          <span className="fixture-note">
            Keep trading where you trade — Rodada counts Kayen wallet by wallet and tracks OKX /
            Binance volume live.
          </span>
        )}
      </div>
    </div>
  );
}

export default async function Home() {
  const pot = getPot();
  const match = getCurrentMatch() ?? null;
  const board = match
    ? getLeaderboard({ matchId: match.id, poolChz: match.pool_chz })
    : { entries: [], totalPoints: 0, payablePoints: 0, wallets: 0 };
  const cexVenues = match ? getCexVolume(match.id) : [];
  const onchainUsd = match ? getOnchainVolume(match.id) : 0;
  const chz = await getChzPrice();
  const venueUsd = Object.fromEntries(cexVenues.map((v) => [v.venue, v.quoteUsd])) as Record<
    string,
    number
  >;

  return (
    <>
      <div className="ticker" aria-label="Matchday now">
        <div className="lane">
          {[0, 1].map((i) => (
            <span key={i} style={{ display: "contents" }}>
              <span className="item">
                <span className="live-dot"></span>
                <b>Rodada live — on-chain counting on Kayen.</b>
              </span>
              {match ? (
                <span className="item">
                  {enName(match.home)} × {enName(match.away)}{" "}
                  <b>
                    <Countdown target={match.kickoff_utc} />
                  </b>
                </span>
              ) : null}
              <span className="item">
                season pot{" "}
                <b>
                  <Num value={Math.floor(pot.potChzNow)} /> CHZ
                </b>
              </span>
              <span className="item">
                pace{" "}
                <b>
                  +<Num value={pot.dailyChz} /> CHZ/day
                </b>
              </span>
              {board.wallets > 0 ? (
                <span className="item">
                  wallets scoring <b>{board.wallets}</b>
                </span>
              ) : null}
              {chz ? (
                <span className="item">
                  CHZ{" "}
                  <b className={chz.change24h >= 0 ? "up" : "down"}>
                    ${chz.usd.toLocaleString("en-US", { maximumFractionDigits: 4 })} (
                    {chz.change24h >= 0 ? "+" : ""}
                    {chz.change24h.toLocaleString("en-US", { maximumFractionDigits: 1 })}%)
                  </b>
                </span>
              ) : null}
            </span>
          ))}
        </div>
      </div>

      <main className="wrap">
        <section className="hero" id="pot">
          <div className="hero-copy">
            <span className="eyebrow">Matchday Markets · 2026 season</span>
            <h1>Trade the match. Share the pot.</h1>
            <p className="lede">
              Score points by trading your club&apos;s fan token on match day — on Kayen, OKX, or
              Binance. Rodada measures skill, ranks the board, and pays from a pot that grows every
              day.
            </p>
            <div className="hero-actions">
              <a className="btn primary" href="#match">
                Join this matchday
                <Icon id="i-arrow" />
              </a>
              <Link className="btn secondary" href="/regras">
                How scoring works
              </Link>
            </div>
          </div>

          <div className="hero-grid">
            <div className="pot-card">
              <span className="eyebrow">Season target pot · pilot beta</span>
              <div className="pot-label">Growing every second</div>
              <PotCounter potChz={pot.potChzNow} dailyChz={pot.dailyChz} asOf={pot.asOf} />
              <div className="pot-meta">
                <div className="pot-stat">
                  <div className="k">Daily pace</div>
                  <div className="v">+{pot.dailyChz.toLocaleString("en-US")} CHZ</div>
                </div>
                {match ? (
                  <div className="pot-stat">
                    <div className="k">This matchday</div>
                    <div className="v">{match.pool_chz.toLocaleString("en-US")} CHZ</div>
                  </div>
                ) : (
                  <div className="pot-stat">
                    <div className="k">Entry</div>
                    <div className="v">Free</div>
                  </div>
                )}
              </div>
              <div className="pot-cta">
                <Link className="btn gold" href="/entrar">
                  Claim your wallet
                </Link>
                <a className="btn ghost" href="#board">
                  View board
                </a>
              </div>
            </div>

            <FixtureCard match={match} cexVenues={cexVenues} onchainUsd={onchainUsd} />
          </div>
        </section>

        <section className="venue-strip">
          <div className="sechead">
            <div>
              <span className="eyebrow">Venues</span>
              <h2>Keep trading where you trade</h2>
            </div>
            <span className="note">Rodada counts · venues execute</span>
          </div>
          <div className="venue-grid">
            <div className="venue-card">
              <div className="vh">
                <span className="logo">K</span>
                <span className="name">Kayen</span>
                <span className="status">
                  <span className="badge ok">Live</span>
                </span>
              </div>
              <p>On-chain swaps &amp; liquidity on Chiliz Chain — wallet-by-wallet scoring.</p>
              <div className="vol">{onchainUsd > 0 ? fmtUsd(onchainUsd) : "—"} window vol</div>
            </div>
            <div className="venue-card">
              <div className="vh">
                <span className="logo okx">OKX</span>
                <span className="name">OKX</span>
                <span className="status">
                  <span className="badge mid">Volume</span>
                </span>
              </div>
              <p>Live venue volume on matchday pairs. Per-trader keys land next.</p>
              <div className="vol">
                {venueUsd.okx !== undefined ? fmtUsd(venueUsd.okx) : "—"} window vol
              </div>
            </div>
            <div className="venue-card">
              <div className="vh">
                <span className="logo bin">BN</span>
                <span className="name">Binance</span>
                <span className="status">
                  <span className="badge mid">Volume</span>
                </span>
              </div>
              <p>Spot volume tracked in the window. Individual scoring via read-only API soon.</p>
              <div className="vol">
                {venueUsd.binance !== undefined ? fmtUsd(venueUsd.binance) : "—"} window vol
              </div>
            </div>
          </div>
        </section>

        <section className="share-band">
          <LeaderboardPanel
            entries={board.entries}
            totalPoints={board.totalPoints}
            wallets={board.wallets}
            match={match}
          />

          <div className="panel dark">
            <div className="ph">
              <Icon id="i-shield" lg />
              <h3>Choose how Rodada verifies your trades</h3>
            </div>
            <p style={{ fontSize: 13.5, marginTop: 6, lineHeight: 1.55 }}>
              No custody. No order execution. Link once — we only measure what you already trade.
            </p>
            <div className="verify-list">
              <div className="verify-item">
                <span className="mark">0x</span>
                <div className="t">
                  <b>Wallet signature</b>
                  <span>Instant · Kayen / Chiliz Chain</span>
                </div>
              </div>
              <div className="verify-item">
                <span className="mark">API</span>
                <div className="t">
                  <b>Read-only exchange key</b>
                  <span>OKX · Binance — coming next</span>
                </div>
              </div>
            </div>
            <div style={{ marginTop: 16, display: "flex", gap: 10, flexWrap: "wrap" }}>
              <Link className="btn gold" href="/entrar">
                Claim &amp; verify
              </Link>
              <Link className="btn secondary" href="/regras">
                Scoring rules
              </Link>
            </div>
          </div>
        </section>

        <section id="scoring">
          <div className="sechead">
            <div>
              <span className="eyebrow">Matchday Ledger</span>
              <h2>Open access. Earned status.</h2>
            </div>
            <span className="note">one formula · everyone</span>
          </div>
          <p className="secsub">
            Points for really trading on match day — never for predictions. This is not betting:
            Rodada doesn&apos;t pay out on match results.
          </p>

          <div className="ladder">
            <div className="ladder-step active">
              <div className="k">Step 01</div>
              <div className="t">Open entry</div>
              <div className="d">Free. No deposit. Claim a wallet or wait for exchange keys.</div>
            </div>
            <div className="ladder-step">
              <div className="k">Step 02</div>
              <div className="t">Trade the fixture</div>
              <div className="d">Buy or sell your club token inside the matchday window.</div>
            </div>
            <div className="ladder-step">
              <div className="k">Step 03</div>
              <div className="t">Skill × volume</div>
              <div className="d">PnL skill score unlocked by real volume. Wipeouts score zero.</div>
            </div>
            <div className="ladder-step">
              <div className="k">Step 04</div>
              <div className="t">Share the pot</div>
              <div className="d">Matchday pool + season pot. Points only — never match results.</div>
            </div>
          </div>

          <div className="rules3" style={{ marginTop: 16 }}>
            <div className="rule">
              <Icon id="i-check" />
              <span>
                <b>Trade on match day.</b> Only what you really move counts — read from the chain,
                nothing to install.
              </span>
            </div>
            <div className="rule">
              <Icon id="i-drop" />
              <span>
                <b>Skill × volume.</b> SkillScore = max(PnL% + 100, 0); points = SkillScore × (1 −
                e<sup>−Volume/V</sup>
                <sub>target</sub>). Volume unlocks how much skill counts.
              </span>
            </div>
            <div className="rule">
              <Icon id="i-lock" />
              <span>
                <b>Total loss scores zero.</b> Skill floors at a wipeout (−100%). Anyone can check
                the math — <Link href="/regras">scoring is open source</Link>.
              </span>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
