import Link from "next/link";
import { Icon } from "@/components/Icons";

export const metadata = { title: "How it works — Rodada" };

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
          leaderboard and take a share of a pot that grows every day. Rodada never executes trades,
          never holds funds, never recommends. It measures, scores, and pays.
        </p>

        <div className="panel" style={{ marginTop: 26 }}>
          <div className="ph">
            <Icon id="i-scale" lg />
            <h3>The formula</h3>
          </div>
          <pre className="codebox" style={{ marginTop: 12 }}>
            {`SkillScore = max(PnL% + F, 0)     // F = 100 (total loss is zero)
points     = SkillScore × (1 − e^(−Volume / V_target))`}
          </pre>
          <p className="gapline" style={{ marginTop: 12 }}>
            In code: <b>skill is shifted</b> — a total loss (−100%) is the floor at zero;
            break-even scores F (100); profits score above that; <b>volume unlocks</b> — no volume,
            multiplier is zero; at the target, ~63% of your skill score counts;{" "}
            <b>scoring is per identity, not per wallet</b> — flow from all of one person&apos;s
            wallets is summed before the formula; <b>the code is public</b> —{" "}
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
                <b>Prizes follow points, never predictions.</b> Rodada never pays out on sporting
                results.
              </span>
            </div>
          </div>
        </div>

        <div className="panel" style={{ marginTop: 18 }}>
          <div className="ph">
            <Icon id="i-trend" lg />
            <h3>Where Rodada counts today</h3>
          </div>
          <p className="gapline">
            <b>Kayen (Chiliz Chain)</b> — automatic, on-chain, live. <b>OKX · Binance</b> — live
            matchday token spot volume on these venues. <b>Mercado Bitcoin · Paribu · Socios</b> —
            next.
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
