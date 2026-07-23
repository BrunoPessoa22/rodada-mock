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
  const opts = { minimumFractionDigits: digits, maximumFractionDigits: digits };
  return (
    <>
      <span className="pt">{value.toLocaleString("pt-BR", opts)}</span>
      <span className="en">{value.toLocaleString("en-US", opts)}</span>
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
        <h3>
          <span className="pt">Artilharia — quem está mais perto do pote</span>
          <span className="en">Top scorers — closest to the pot</span>
        </h3>
      </div>
      {top.length === 0 ? (
        <p className="gapline">
          <span className="pt">
            {windowOpen
              ? "Janela aberta — a Artilharia conta operações reais na Kayen e as primeiras entradas aparecem em minutos. Seja o primeiro nome desta página."
              : "A janela ainda não abriu — a Artilharia conta operações reais na Kayen dentro da janela da rodada. Seja o primeiro nome desta página."}
          </span>
          <span className="en">
            {windowOpen
              ? "Window open — the leaderboard counts real Kayen trades and the first entries appear within minutes. Be the first name on this page."
              : "The window hasn't opened yet — the leaderboard counts real Kayen trades inside the matchday window. Be the first name on this page."}
          </span>
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
                  {entry.projectedChz >= 1 ? (
                    <>
                      <span className="pt">
                        projeção {Math.floor(entry.projectedChz).toLocaleString("pt-BR")} CHZ
                      </span>
                      <span className="en">
                        projected {Math.floor(entry.projectedChz).toLocaleString("en-US")} CHZ
                      </span>
                    </>
                  ) : null}
                </td>
                <td className="pts">
                  <Num value={Math.floor(entry.points)} />
                  {" pts"}
                </td>
              </tr>
            ))}
            <tr className="you">
              <td className="pos">—</td>
              <td className="handle">
                <span className="pt">você</span>
                <span className="en">you</span>
              </td>
              <td className="role"></td>
              <td className="earn">
                <Link href="/entrar" style={{ color: "var(--accent)" }}>
                  <span className="pt">reivindicar carteira</span>
                  <span className="en">claim your wallet</span>
                </Link>
              </td>
              <td className="pts">0 pts</td>
            </tr>
          </tbody>
        </table>
      )}
      {top.length > 0 ? (
        <p className="gapline">
          <span className="pt">
            <b>Para entrar na briga:</b> o top {top.length} fecha em{" "}
            {cutoff.toLocaleString("pt-BR")} pts
            {match?.featured ? " — e nesta rodada os pontos valem 2×" : ""}. PnL% × unlock de
            volume na Kayen durante a janela coloca você nesta página; ida-e-volta flat vale zero.
          </span>
          <span className="en">
            <b>To get in the race:</b> top {top.length} closes at {cutoff.toLocaleString("en-US")}{" "}
            pts{match?.featured ? " — and this matchday pays 2× points" : ""}. PnL% × volume unlock
            on Kayen during the window puts you on this page; flat round-trips score zero.
          </span>
        </p>
      ) : null}
      {totalPoints > 0 && match ? (
        <p className="gapline" style={{ marginTop: 4 }}>
          <span className="pt">
            {wallets.toLocaleString("pt-BR")} carteiras pontuando ·{" "}
            {match.pool_chz.toLocaleString("pt-BR")} CHZ na rodada · projeção = sua fatia do pool
            pelos pontos de agora.
          </span>
          <span className="en">
            {wallets.toLocaleString("en-US")} wallets scoring ·{" "}
            {match.pool_chz.toLocaleString("en-US")} CHZ this matchday · projection = your current
            share of the pool by points.
          </span>
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

// Colors keyed by the club NAME shown on the card — needed when one side has
// no token (tokens[] then holds only the other club's symbol, and keying dots
// off tokens[0]/tokens[1] would paint both sides with the tokenized club).
const CLUB_NAME_COLORS: Record<string, [string, string]> = {
  Flamengo: ["#C52613", "#0a0a0a"],
  Chapecoense: ["#009846", "#FFFFFF"],
  "São Paulo": ["#FE0000", "#FFFFFF"],
  Fluminense: ["#7A1F3D", "#009E60"],
  Argentina: ["#75AADB", "#FFFFFF"],
  Espanha: ["#AA151B", "#F1BF00"],
};

function fmtUsd(value: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
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
      <div className="panel bigmatch" id="jogao">
        <span className="eyebrow">
          <span className="pt">Próximo jogão</span>
          <span className="en">Next big match</span>
        </span>
        <h4>
          <span className="pt">Calendário em preparação</span>
          <span className="en">Calendar being prepared</span>
        </h4>
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
  const venueUsd = Object.fromEntries(cexVenues.map((v) => [v.venue, v.quoteUsd])) as Record<string, number>;
  const hasVolume = onchainUsd > 0 || cexVenues.some((v) => v.quoteUsd > 0);
  const windowOpen =
    new Date(match.window_start_utc).getTime() <= Date.now() &&
    Date.now() < new Date(match.window_end_utc).getTime();
  const kayenUrl = "https://app.kayen.org/";
  return (
    <div className="panel bigmatch" id="jogao">
      <span className="eyebrow">
        <span className="pt">
          {windowOpen ? "Janela aberta — pontuando agora" : "Próximo jogão — sua porta de entrada"}
        </span>
        <span className="en">
          {windowOpen ? "Window open — scoring live" : "Next big match — your way in"}
        </span>
      </span>
      <h4>
        <span className="clubdots" aria-hidden="true">
          <i style={{ background: homeColors[0] }}></i>
          <i style={{ background: homeColors[1] }}></i>
        </span>
        <span className="pt">{match.home}</span>
        <span className="en">{enName(match.home)}</span>{" "}
        <span style={{ color: "var(--ink3)", fontWeight: 400 }}>×</span>{" "}
        <span className="pt">{match.away}</span>
        <span className="en">{enName(match.away)}</span>{" "}
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
              <span className="pt">janela fecha </span>
              <span className="en">window closes </span>
              <Countdown target={match.window_end_utc} />
            </>
          ) : (
            <>
              <span className="pt">bola rola </span>
              <span className="en">kickoff </span>
              <Countdown target={match.kickoff_utc} />
              <span className="pt"> — pontos fecham no apito</span>
              <span className="en"> — points close at the whistle</span>
            </>
          )}
        </span>
      </div>
      <div className="carrot">
        <span className="pt">
          {match.featured ? <b>2× pontos</b> : <b>pontos valendo</b>} nesta partida · rodada paga{" "}
          <b>{match.pool_chz.toLocaleString("pt-BR")} CHZ</b> do pote
        </span>
        <span className="en">
          {match.featured ? <b>2× points</b> : <b>points live</b>} on this match · matchday pays{" "}
          <b>{match.pool_chz.toLocaleString("en-US")} CHZ</b> from the pot
        </span>
      </div>
      <p className="statline">
        <span className="pt">
          Tokens contados nesta janela: <b>{tokens.join(" · ")}</b> — atribuição on-chain automática
          na Kayen.
        </span>
        <span className="en">
          Tokens counted in this window: <b>{tokens.join(" · ")}</b> — automatic on-chain
          attribution on Kayen.
        </span>
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
            OKX <span className="pt">(volume contando)</span>
            <span className="en">(volume counting)</span>
          </a>
        ) : (
          <span className="btn secondary sm" aria-disabled="true" style={{ opacity: 0.55, cursor: "default" }}>
            OKX <span className="pt">(sem par nesta rodada)</span>
            <span className="en">(no pair this matchday)</span>
          </span>
        )}
        {binanceInsts.length > 0 ? (
          <a
            className="btn secondary sm"
            href={VENUE_TRADE_URL.binance(binanceInsts[0])}
            target="_blank"
            rel="noopener noreferrer"
          >
            Binance <span className="pt">(volume contando)</span>
            <span className="en">(volume counting)</span>
          </a>
        ) : (
          <span className="btn secondary sm" aria-disabled="true" style={{ opacity: 0.55, cursor: "default" }}>
            Binance <span className="pt">(sem par nesta rodada)</span>
            <span className="en">(no pair this matchday)</span>
          </span>
        )}
        <span className="btn secondary sm" aria-disabled="true" style={{ opacity: 0.55, cursor: "default" }}>
          Mercado Bitcoin{" "}
          <span className="pt">(em breve)</span>
          <span className="en">(soon)</span>
        </span>
        {hasVolume ? (
          <span className="note2">
            <span className="pt">
              Volume da janela até agora — Kayen {fmtUsd(onchainUsd, "pt-BR")}
              {venueUsd.okx !== undefined ? ` · OKX ${fmtUsd(venueUsd.okx, "pt-BR")}` : ""}
              {venueUsd.binance !== undefined ? ` · Binance ${fmtUsd(venueUsd.binance, "pt-BR")}` : ""}
              . Na Kayen a contagem é por carteira; nas exchanges, por casa.
            </span>
            <span className="en">
              Window volume so far — Kayen {fmtUsd(onchainUsd, "en-US")}
              {venueUsd.okx !== undefined ? ` · OKX ${fmtUsd(venueUsd.okx, "en-US")}` : ""}
              {venueUsd.binance !== undefined ? ` · Binance ${fmtUsd(venueUsd.binance, "en-US")}` : ""}
              . Kayen counts wallet by wallet; exchanges count by venue.
            </span>
          </span>
        ) : (
          <span className="note2">
            <span className="pt">
              Opere onde você já opera — a Liga conta a Kayen carteira a carteira e acompanha o
              volume de OKX e Binance ao vivo. Pontuação individual nas exchanges chega via chave
              read-only.
            </span>
            <span className="en">
              Trade where you already trade — the League counts Kayen wallet by wallet and tracks
              OKX and Binance volume live. Individual scoring on exchanges arrives via read-only
              keys.
            </span>
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
      <div className="ticker" aria-label="liga agora">
        <div className="lane">
          {[0, 1].map((i) => (
            <span key={i} style={{ display: "contents" }}>
              <span className="item">
                <span className="live-dot"></span>
                <b>
                  <span className="pt">Liga ao vivo — contagem on-chain na Kayen.</span>
                  <span className="en">League live — on-chain counting on Kayen.</span>
                </b>
              </span>
              {match ? (
                <span className="item">
                  <span className="pt">
                    {match.home} × {match.away}
                  </span>
                  <span className="en">
                    {enName(match.home)} × {enName(match.away)}
                  </span>{" "}
                  <b>
                    <Countdown target={match.kickoff_utc} />
                  </b>
                </span>
              ) : null}
              <span className="item">
                <span className="pt">pote da temporada</span>
                <span className="en">season pot</span>{" "}
                <b>
                  <Num value={Math.floor(pot.potChzNow)} /> CHZ
                </b>
              </span>
              <span className="item">
                <span className="pt">ritmo</span>
                <span className="en">pace</span>{" "}
                <b>
                  +<Num value={pot.dailyChz} /> CHZ/
                  <span className="pt">dia</span>
                  <span className="en">day</span>
                </b>
              </span>
              {board.wallets > 0 ? (
                <span className="item">
                  <span className="pt">carteiras pontuando</span>
                  <span className="en">wallets scoring</span> <b>{board.wallets}</b>
                </span>
              ) : null}
              {chz ? (
                <span className="item">
                  CHZ{" "}
                  <b className={chz.change24h >= 0 ? "up" : "down"}>
                    <span className="pt">
                      R$ {chz.brl.toLocaleString("pt-BR", { maximumFractionDigits: 4 })} (
                      {chz.change24h >= 0 ? "+" : ""}
                      {chz.change24h.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%)
                    </span>
                    <span className="en">
                      ${chz.usd.toLocaleString("en-US", { maximumFractionDigits: 4 })} (
                      {chz.change24h >= 0 ? "+" : ""}
                      {chz.change24h.toLocaleString("en-US", { maximumFractionDigits: 1 })}%)
                    </span>
                  </b>
                </span>
              ) : null}
            </span>
          ))}
        </div>
      </div>

      <main className="wrap">
        <div className="jack" id="pote">
          <span className="eyebrow">
            <span className="pt">Liga do Trader de Fan Tokens · Temporada 2026</span>
            <span className="en">Fan Token Trader League · 2026 Season</span>
          </span>
          <div className="potline">
            <PotCounter potChz={pot.potChzNow} dailyChz={pot.dailyChz} asOf={pot.asOf} />
            <span className="potchz">CHZ</span>
          </div>
          <div className="potlab">
            <span className="pt">pote-alvo da temporada — beta piloto</span>
            <span className="en">season target pot — pilot beta</span>
          </div>
          <p className="potsub">
            <span className="pt">
              Cresce <b>+{pot.dailyChz.toLocaleString("pt-BR")} CHZ por dia</b> — fundo comunitário +
              patrocínio dos parceiros de execução.
            </span>
            <span className="en">
              Grows <b>+{pot.dailyChz.toLocaleString("en-US")} CHZ per day</b> — community fund +
              sponsorship from execution partners.
            </span>
          </p>
          <div className="chips">
            {match ? (
              <span className="ptschip">
                <Icon id="i-trophy" />
                <span className="pt">
                  {match.competition} paga {match.pool_chz.toLocaleString("pt-BR")} CHZ
                </span>
                <span className="en">
                  {enName(match.competition)} pays {match.pool_chz.toLocaleString("en-US")} CHZ
                </span>
              </span>
            ) : null}
            {match ? (
              <span className="countchip">
                <Icon id="i-zap" />
                <span className="pt">janela fecha </span>
                <span className="en">window closes </span>
                <Countdown target={match.window_end_utc} />
              </span>
            ) : null}
            <span className="achip">
              <span className="pt">entrada grátis — pontue operando onde você já opera</span>
              <span className="en">free entry — score by trading where you already trade</span>
            </span>
          </div>
          <div className="ctas">
            <a className="btn primary" href="#jogao">
              <span className="pt">Entrar na rodada</span>
              <span className="en">Join the matchday</span>
              <Icon id="i-arrow" />
            </a>
            <Link className="btn secondary" href="/regras">
              <span className="pt">Como pontuar</span>
              <span className="en">How scoring works</span>
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

        <section id="pontuar">
          <div className="sechead">
            <div>
              <span className="eyebrow">
                <span className="pt">Regras</span>
                <span className="en">Rules</span>
              </span>
              <h2>
                <span className="pt">Como pontuar</span>
                <span className="en">How scoring works</span>
              </h2>
            </div>
            <span className="note">
              <span className="pt">scoring código aberto · uma fórmula para todos</span>
              <span className="en">open-source scoring · one formula for everyone</span>
            </span>
          </div>
          <p className="secsub">
            <span className="pt">
              Pontos por operar de verdade no dia do jogo — nunca por palpite. Isto não é aposta: a
              Liga não paga por resultado de partida.
            </span>
            <span className="en">
              Points for really trading on match day — never for predictions. This is not betting:
              the League doesn&apos;t pay out on match results.
            </span>
          </p>
          <div className="rules3">
            <div className="rule">
              <Icon id="i-check" />
              <span>
                <span className="pt">
                  <b>Opere no dia do jogo.</b> Compre ou venda o token do seu clube durante a
                  janela da rodada. Só conta o que você movimenta de verdade — e a contagem vem
                  direto da blockchain, sem instalar nada.
                </span>
                <span className="en">
                  <b>Trade on match day.</b> Buy or sell your club&apos;s token during the matchday
                  window. Only what you really move counts — read straight from the blockchain,
                  nothing to install.
                </span>
              </span>
            </div>
            <div className="rule">
              <Icon id="i-drop" />
              <span>
                <span className="pt">
                  <b>Retorno × volume.</b> Pontos = PnL% × (1 − e<sup>−Volume/V</sup>
                  <sub>alvo</sub>). O retorno manda; o volume destrava quanto desse retorno conta.
                </span>
                <span className="en">
                  <b>Return × volume.</b> Points = PnL% × (1 − e<sup>−Volume/V</sup>
                  <sub>target</sub>). Return leads; volume unlocks how much of that return counts.
                </span>
              </span>
            </div>
            <div className="rule">
              <Icon id="i-lock" />
              <span>
                <span className="pt">
                  <b>Trapaça vale zero.</b> Volume flat sem PnL não sobe na Artilharia, e
                  alavancagem não multiplica ponto. Qualquer pessoa pode conferir a conta — a{" "}
                  <a href="/regras">pontuação é código aberto</a>.
                </span>
                <span className="en">
                  <b>Gaming it scores zero.</b> Flat volume without PnL does not climb the board,
                  and leverage doesn&apos;t multiply points. Anyone can check the math —{" "}
                  <a href="/regras">scoring is open source</a>.
                </span>
              </span>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
