import Link from "next/link";

export const metadata = { title: "Terms — Trading League" };

/**
 * Pilot-stage terms. Deliberately short and specific: the league measures public
 * trading activity, never touches funds, and pays only what it has announced as
 * funded. Anything this page cannot honestly promise, it does not promise.
 */
export default function TermsPage() {
  return (
    <main className="wrap">
      <section className="legal">
        <div className="sechead" style={{ marginTop: 48 }}>
          <div>
            <span className="eyebrow">Terms</span>
            <h2>Terms of participation</h2>
          </div>
        </div>
        <p className="secsub">
          Trading League is a free-entry skill competition scoring public trading activity on Fan
          Tokens. Last updated 24 August 2026.
        </p>

        <h3>1. What the league is</h3>
        <p>
          The league observes trading that already happens on public venues, scores it with a
          published formula, and ranks participants. It is a competition of skill and a measurement
          service. It is not an exchange, a broker, a wallet, a custodian, an investment adviser, or
          a betting operator.
        </p>

        <h3>2. What the league never does</h3>
        <ul>
          <li>It never executes a trade on your behalf.</li>
          <li>It never holds, receives, or controls your funds or your tokens.</li>
          <li>It never asks for a private key, a seed phrase, or a withdrawal permission.</li>
          <li>It never recommends a token, a trade, a direction, or a size.</li>
          <li>It never pays out on the result of a sporting event.</li>
        </ul>

        <h3>3. Entry</h3>
        <p>
          Entry is free. There is no deposit, no ticket, no stake and no entry fee, and nothing you
          pay can increase your score. You join by proving control of a wallet with a signed
          message — a signature, not a transaction: it costs no gas, moves nothing, and grants no
          approval. You may stop participating at any time by not trading in a match window.
        </p>
        <p>
          You must be at least 18 years old, and you must not be in a country where taking part
          would be unlawful for you, or where the operator is prohibited from offering it. It is
          your responsibility to know whether that applies to you.
        </p>

        <h3>4. Scoring</h3>
        <p>
          Scores are computed by the published formula in{" "}
          <Link href="/regras">How it works</Link>, from public blockchain data. The scoring code is
          public, and any participant can recompute the board independently. Where a published
          board and the published formula ever disagree, the formula governs and the board is
          corrected or withdrawn.
        </p>
        <p>
          Scores net per identity, not per wallet. Splitting activity across wallets you control
          does not increase your score. Trading with yourself to create volume scores zero by
          construction.
        </p>

        <h3>5. Prizes</h3>
        <p>
          Prizes are governed by <Link href="/prizes">Prize rules</Link>. A prize pool is only
          payable once it has been announced as funded. Figures shown as a target are a statement of
          intent, not a promise of payment, and are labelled as such.
        </p>

        <h3>6. Fair play</h3>
        <p>
          The operator may exclude a participant, void a score, or withhold a prize where there is
          evidence of wash trading, coordinated trading between accounts, self-dealing across
          controlled wallets, exploitation of a scoring or software defect, impersonation, or any
          attempt to manipulate the price of a token in order to move the board. Excluded scores are
          removed from the board and their share is not redistributed to the excluder&apos;s
          benefit.
        </p>

        <h3>7. Your own risk</h3>
        <p>
          Trading Fan Tokens can lose you money, and the league does nothing to reduce that risk.
          Nothing on this site is financial, investment, legal or tax advice. You decide what to
          trade, when, where, and how much, and you bear the outcome. Taxes on any prize are yours.
        </p>

        <h3>8. Availability</h3>
        <p>
          This is a pilot. Match windows, scoring parameters, venues and prize pools can change, and
          the service can be suspended or ended. Material changes to the scoring formula take effect
          from the next season, never retroactively within one — a season already scored is archived
          rather than rescored.
        </p>

        <h3>9. Liability</h3>
        <p>
          The service is provided as-is. To the extent permitted by law the operator is not liable
          for trading losses, chain or venue outages, indexing gaps, RPC failures, or third-party
          wallet and exchange behaviour. Nothing here limits liability that cannot lawfully be
          limited.
        </p>

        <h3>10. Contact</h3>
        <p>
          Questions, corrections and disputes: the operator contact published alongside the current
          matchday announcement. A scoring dispute should include your wallet address, the match
          window, and what you believe the board got wrong.
        </p>

        <div style={{ marginTop: 28, display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Link className="btn secondary" href="/regras">
            How scoring works
          </Link>
          <Link className="btn secondary" href="/privacy">
            Data policy
          </Link>
          <Link className="btn secondary" href="/prizes">
            Prize rules
          </Link>
        </div>
      </section>
    </main>
  );
}
