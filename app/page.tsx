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
    <div className="panel">
      <div className="ph">
        <Icon id="i-trophy" lg />
        <h3>Leaderboard — closest to the pot</h3>
      </div>
      {top.length === 0 ? (
        <p className="gapline">
          {windowOpen
            ? "Window open — the leaderboard counts real Kayen trades and the first entries appear within minutes. Be the first name on this page."
            : "The window hasn't opened yet — the leaderboard counts real Kayen trades inside the matchday window. Be the first name on this page."}
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
                    ? `projected ${Math.floor(entry.projectedChz).toLocaleString("en-US")} CHZ`
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
                <Link href="/entrar" style={{ color: "var(--accent)" }}>
                  claim your wallet
                </Link>
              </td>
              <td className="pts">0 pts</td>
            </tr>
          </tbody>
        </table>
      )}
      {top.length > 0 ? (
        <p className="gapline">
          <b>To get in the race:</b> top {top.length} closes at {cutoff.toLocaleString("en-US")} pts.
          PnL% × volume unlock on Kayen during the window puts you on this page; flat round-trips
          score zero.
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

function MatchCard({
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
      <div className="panel bigmatch" id="match">
        <span className="eyebrow">Next match</span>
        <h4>Calendar being prepared</h4>
      </div>
    );
  }
  const tokens = JSON.parse(match.tokens) as string[];
  const homeColors =
    CLUB_NAME_COLORS[match.home] ?? CLUB_COLORS[tokens[0]] ?? ["#3f3f46", "#71717a"];
  const awayColors =
    CLUB_NAME_COLORS[match.away] ?? CLUB_COLORS[tokens[1] ?? tokens[0]] ?? ["#3f3f46", "#71717a"];
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
    <div className="panel bigmatch" id="match">
      <span className="eyebrow">
        {windowOpen ? "Window open — scoring live" : "Next match — your way in"}
      </span>
      <h4>
        <span className="clubdots" aria-hidden="true">
          <i style={{ background: homeColors[0] }}></i>
          <i style={{ background: homeColors[1] }}></i>
        </span>
        {enName(match.home)} <span style={{ color: "var(--ink3)", fontWeight: 400 }}>×</span>{" "}
        {enName(match.away)}{" "}
        <span className="clubdots" aria-hidden="true">
          <i style={{ background: awayColors[0] }}></i>
          <i style={{ background: awayColors[1] }}></i>
        </span>
      </h4>
      <div className="kick">
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
      </div>
      <div className="carrot">
        <b>points live</b> on this match · matchday pays{" "}
        <b>{match.pool_chz.toLocaleString("en-US")} CHZ</b> from the pot
      </div>
      <p className="statline">
        Tokens counted in this window: <b>{tokens.join(" · ")}</b> — automatic on-chain attribution
        on Kayen.
      </p>
      <div className="venues">
        <a className="btn primary sm" href={kayenUrl} target="_blank" rel="noopener noreferrer">
          Kayen
        </a>
        {okxInsts.length > 0 ? (
          <a
            className="btn secondary sm"
            href={VENUE_TRADE_URL.okx(okxInsts[0])}
            target="_blank"
            rel="noopener noreferrer"
          >
            OKX (volume counting)
          </a>
        ) : (
          <span className="btn secondary sm" aria-disabled="true" style={{ opacity: 0.55, cursor: "default" }}>
            OKX (no pair this matchday)
          </span>
        )}
        {binanceInsts.length > 0 ? (
          <a
            className="btn secondary sm"
            href={VENUE_TRADE_URL.binance(binanceInsts[0])}
            target="_blank"
            rel="noopener noreferrer"
          >
            Binance (volume counting)
          </a>
        ) : (
          <span className="btn secondary sm" aria-disabled="true" style={{ opacity: 0.55, cursor: "default" }}>
            Binance (no pair this matchday)
          </span>
        )}
        <span className="btn secondary sm" aria-disabled="true" style={{ opacity: 0.55, cursor: "default" }}>
          Mercado Bitcoin (soon)
        </span>
        {hasVolume ? (
          <span className="note2">
            Window volume so far — Kayen {fmtUsd(onchainUsd)}
            {venueUsd.okx !== undefined ? ` · OKX ${fmtUsd(venueUsd.okx)}` : ""}
            {venueUsd.binance !== undefined ? ` · Binance ${fmtUsd(venueUsd.binance)}` : ""}. Kayen
            counts wallet by wallet; exchanges count by venue.
          </span>
        ) : (
          <span className="note2">
            Trade where you already trade — the League counts Kayen wallet by wallet and tracks OKX
            and Binance volume live. Individual scoring on exchanges arrives via read-only keys.
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

  return (
    <>
      <div className="ticker" aria-label="League now">
        <div className="lane">
          {[0, 1].map((i) => (
            <span key={i} style={{ display: "contents" }}>
              <span className="item">
                <span className="live-dot"></span>
                <b>League live — on-chain counting on Kayen.</b>
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
        <div className="jack" id="pot">
          <span className="eyebrow">Fan Token Trader League · 2026 Season</span>
          <div className="potline">
            <PotCounter potChz={pot.potChzNow} dailyChz={pot.dailyChz} asOf={pot.asOf} />
            <span className="potchz">CHZ</span>
          </div>
          <div className="potlab">season target pot — pilot beta</div>
          <p className="potsub">
            Grows <b>+{pot.dailyChz.toLocaleString("en-US")} CHZ per day</b> — community fund +
            sponsorship from execution partners.
          </p>
          <div className="chips">
            {match ? (
              <span className="ptschip">
                <Icon id="i-trophy" />
                {enName(match.competition)} pays {match.pool_chz.toLocaleString("en-US")} CHZ
              </span>
            ) : null}
            {match ? (
              <span className="countchip">
                <Icon id="i-zap" />
                window closes <Countdown target={match.window_end_utc} />
              </span>
            ) : null}
            <span className="achip">free entry — score by trading where you already trade</span>
          </div>
          <div className="ctas">
            <a className="btn primary" href="#match">
              Join the matchday
              <Icon id="i-arrow" />
            </a>
            <Link className="btn secondary" href="/regras">
              How scoring works
            </Link>
          </div>
        </div>

        <div className="compete">
          <LeaderboardPanel
            entries={board.entries}
            totalPoints={board.totalPoints}
            wallets={board.wallets}
            match={match}
          />
          <MatchCard match={match} cexVenues={cexVenues} onchainUsd={onchainUsd} />
        </div>

        <section id="scoring">
          <div className="sechead">
            <div>
              <span className="eyebrow">Rules</span>
              <h2>How scoring works</h2>
            </div>
            <span className="note">open-source scoring · one formula for everyone</span>
          </div>
          <p className="secsub">
            Points for really trading on match day — never for predictions. This is not betting: the
            League doesn&apos;t pay out on match results.
          </p>
          <div className="rules3">
            <div className="rule">
              <Icon id="i-check" />
              <span>
                <b>Trade on match day.</b> Buy or sell your club&apos;s token during the matchday
                window. Only what you really move counts — read straight from the blockchain,
                nothing to install.
              </span>
            </div>
            <div className="rule">
              <Icon id="i-drop" />
              <span>
                <b>Return × volume.</b> Points = PnL% × (1 − e<sup>−Volume/V</sup>
                <sub>target</sub>). Return leads; volume unlocks how much of that return counts.
              </span>
            </div>
            <div className="rule">
              <Icon id="i-lock" />
              <span>
                <b>Gaming it scores zero.</b> Flat volume without PnL does not climb the board, and
                leverage doesn&apos;t multiply points. Anyone can check the math —{" "}
                <a href="/regras">scoring is open source</a>.
              </span>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
