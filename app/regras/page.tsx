import { Icon } from "@/components/Icons";

export const metadata = { title: "Rules — Fan Token Trader League" };

export default function RulesPage() {
  return (
    <main className="wrap">
      <section style={{ maxWidth: 760, margin: "0 auto" }}>
        <div className="sechead" style={{ marginTop: 40 }}>
          <div>
            <span className="eyebrow">Rules</span>
            <h2>One formula, everyone</h2>
          </div>
        </div>
        <p className="secsub">
          Trade your club&apos;s token on match day, wherever you already trade — climb the
          leaderboard and take a share of a pot that grows every day. The League never executes
          trades, never holds funds, never recommends. It measures, scores, and pays.
        </p>

        <div className="panel" style={{ marginTop: 26 }}>
          <div className="ph">
            <Icon id="i-scale" lg />
            <h3>The formula</h3>
          </div>
          <pre
            className="mono"
            style={{
              background: "var(--bg2)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              padding: "14px 16px",
              fontSize: 13,
              overflowX: "auto",
            }}
          >
            {`points = PnL% × (1 − e^(−Volume / V_target))`}
          </pre>
          <p className="gapline" style={{ marginTop: 12 }}>
            In code: <b>return first</b> — PnL% is window cash-flow plus mark-to-market of what you
            still hold; <b>volume unlocks</b> — no volume, multiplier is zero; at the target, ~63% of
            your return counts; <b>flat round-trips score zero</b> — volume alone cannot buy the
            board; <b>scoring is per identity, not per wallet</b> — flow from all of one
            person&apos;s wallets is summed before the formula, so splitting across your own wallets
            never multiplies points, and only verified identities divide the pot;{" "}
            <b>the code is public</b> — anyone can recompute the leaderboard:{" "}
            <a href="https://github.com/BrunoPessoa22/rodada-mock/blob/main/lib/scoring.ts">
              lib/scoring.ts
            </a>
            . This beta counts <b>on-chain spot flow only</b>, which is unlevered by nature;
            leveraged venues come later, always by collateral, never notional.
          </p>
        </div>

        <div className="panel" style={{ marginTop: 18 }}>
          <div className="ph">
            <Icon id="i-shield" lg />
            <h3>Three rules we never break</h3>
          </div>
          <div className="rules3" style={{ marginTop: 8 }}>
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
                today; the public depth threshold, checked on-chain at match creation, is landing
                next — it protects users from slippage and KOLs from pump accusations.
              </span>
            </div>
            <div className="rule">
              <Icon id="i-lock" />
              <span>
                <b>Prizes follow points, never predictions.</b> The League never pays out on
                sporting results. Skill competition, not betting.
              </span>
            </div>
          </div>
        </div>

        <div className="panel" style={{ marginTop: 18 }}>
          <div className="ph">
            <Icon id="i-trend" lg />
            <h3>Where the League counts today</h3>
          </div>
          <p className="gapline">
            <b>Kayen (Chiliz Chain)</b> — automatic, on-chain, live in this beta. Net swaps and added
            liquidity on the window&apos;s token pools, attributed to the wallet that signed the
            transaction. <b>OKX · Binance</b> — the League already tracks, live, the matchday
            tokens&apos; spot volume on these venues (public candles of every listed pair, summed
            inside the window and converted to USD) and shows the total on the match page.{" "}
            <b>Mercado Bitcoin · Paribu</b> — next. <b>Vibe · Socios</b> — direct integration in
            discussion.
          </p>
          <p className="gapline" style={{ marginTop: 10 }}>
            <b>How an exchange trader joins the leaderboard:</b> exchanges don&apos;t publish who
            traded, so individual attribution uses a <b>read-only API key</b> you link once — no
            withdrawal or order permissions; the League never touches your funds. With the key, the
            League reads only your executions on the matchday pairs inside the window (Binance{" "}
            <span className="mono">myTrades</span>, OKX <span className="mono">fills</span>) and
            applies the same public formula: PnL% × volume unlock. One formula, every venue. The
            parallel path is the venue sponsoring the matchday and reporting server-side — both
            models are in discussion with partners.
          </p>
        </div>
      </section>
    </main>
  );
}
