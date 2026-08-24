import Link from "next/link";
import { Icon } from "@/components/Icons";

export const metadata = { title: "How it works — Trading League" };

export default function RulesPage() {
  return (
    <main className="wrap">
      <section style={{ maxWidth: 760, margin: "0 auto", paddingBottom: 72 }}>
        <div className="sechead" style={{ marginTop: 48 }}>
          <div>
            <span className="eyebrow">How it works</span>
            <h2>One formula, everyone</h2>
          </div>
        </div>
        <p className="secsub">
          Trade your club&apos;s token on match day, wherever you already trade — climb the
          leaderboard and take a share of the matchday pot. The league never executes trades,
          never holds funds, never recommends. It measures, scores, and pays.
        </p>

        <div className="panel" style={{ marginTop: 26 }}>
          <div className="ph">
            <Icon id="i-scale" lg />
            <h3>The formula</h3>
          </div>
          <pre className="codebox" style={{ marginTop: 12 }}>
            {`SkillScore = max(PnL%, 0)         // profit-only: break-even & losses = 0
points     = SkillScore × (1 − e^(−Volume / V_target))`}
          </pre>
          <p className="gapline" style={{ marginTop: 12 }}>
            In code: <b>profit scores</b> — a break-even or losing book scores zero, so a
            self-trade (wash) that ends flat earns nothing no matter its volume;{" "}
            <b>volume only qualifies</b> — no volume, multiplier is zero; at the target,{" "}
            ~63% of your skill score counts; <b>capital is the larger of your buy and sell</b>, so
            dumping a pre-held bag can&apos;t inflate your return; <b>scoring is per identity, not
            per wallet</b> — flow from all of one person&apos;s linked wallets is summed before the
            formula; <b>the code is public</b> —{" "}
            <a href="https://github.com/BrunoPessoa22/rodada-mock/blob/main/lib/scoring.ts">
              lib/scoring.ts
            </a>
            .
          </p>
        </div>

        <div className="panel" style={{ marginTop: 18 }}>
          <div className="ph">
            <Icon id="i-shield" lg />
            <h3>Three rules we never break</h3>
          </div>
          <div className="rules3" style={{ marginTop: 12 }}>
            <div className="rule">
              <Icon id="i-check" />
              <span>
                <b>Points only for real, net trading.</b> No seed money to traders — ever. We fund
                prizes and rebates, not positions.
              </span>
            </div>
            <div className="rule">
              <Icon id="i-drop" />
              <span>
                <b>No featured match on a thin token.</b> Featured matches are hand-picked for depth
                today.
              </span>
            </div>
            <div className="rule">
              <Icon id="i-lock" />
              <span>
                <b>Prizes follow points, never predictions.</b> The league never pays out on sporting
                results.
              </span>
            </div>
          </div>
        </div>

        <div className="panel" style={{ marginTop: 18 }}>
          <div className="ph">
            <Icon id="i-trend" lg />
            <h3>Where the league counts today</h3>
          </div>
          <p className="gapline">
            <b>Kayen / FanX (Chiliz Chain)</b> — automatic, on-chain, and the only venue that
            scores points today: every wallet&apos;s flow is publicly attributable, so anyone can
            re-run the board. <b>Tracked venues</b> — matchday token volume on{" "}
            <b>Binance · OKX · Gate · MEXC · Bitget · HTX · Upbit · Mercado Bitcoin</b> and the
            on-chain pools on <b>Solana (Jupiter/Meteora)</b> and <b>Base (Aerodrome)</b> is
            measured per window and shown next to the scored number, but earns no points yet —
            those venues expose no per-trader data the league can verify. <b>Live now:</b> you can
            connect a <b>read-only API key</b> on OKX or Binance from the join page — your own
            fills in league pairs then show as verified volume on the matchday board. Verified CEX
            volume graduates from shown to <b>scored</b> through the same published formula only at
            a season roll, never mid-season (see the season rule below).
          </p>
        </div>

        <div className="panel" style={{ marginTop: 18 }}>
          <div className="ph">
            <Icon id="i-scale" lg />
            <h3>How the pot is divided</h3>
          </div>
          <pre className="codebox" style={{ marginTop: 12 }}>
            {`your share = (your points ÷ ALL points on the board) × committed pool`}
          </pre>
          <p className="gapline" style={{ marginTop: 12 }}>
            <b>The denominator is the whole board</b>, not the verified part of it. Points on
            wallets that never verify are not paid and are not handed to the traders who did —
            that share stays in the pot and rolls into the next matchday. Dividing only among
            verified wallets would pay the first person to claim a handle almost the entire pot for
            signing up early rather than for trading well. <b>A pool is only payable once it is
            announced as funded</b>; a figure shown as a target is intent, not a promise. Full
            terms: <Link href="/prizes">Prize rules</Link>.
          </p>
        </div>

        <div className="panel" style={{ marginTop: 18 }}>
          <div className="ph">
            <Icon id="i-lock" lg />
            <h3>When the rules change</h3>
          </div>
          <p className="gapline" style={{ marginTop: 12 }}>
            A change to the formula applies from the <b>next season</b>, never retroactively inside
            one. A season already scored keeps the numbers it ran on and moves to the archive — it
            is never quietly rescored under rules its traders never saw. The league&apos;s first
            three windows (July 2026) ran on an earlier formula and live in{" "}
            <Link href="/archive">the preseason archive</Link> for exactly this reason.
          </p>
        </div>

        <div style={{ marginTop: 28, display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Link className="btn primary" href="/entrar">
            Join this week
          </Link>
          <Link className="btn secondary" href="/">
            Back to pot
          </Link>
        </div>
      </section>
    </main>
  );
}
