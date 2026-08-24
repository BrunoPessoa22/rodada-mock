import Link from "next/link";
import { getPot } from "@/lib/pot";

export const dynamic = "force-dynamic";
export const metadata = { title: "Prize rules — Trading League" };

/**
 * The prize rules read the live funding state rather than describing it in
 * prose, so this page can never drift out of sync with what the homepage shows.
 */
export default function PrizesPage() {
  const pot = getPot();

  return (
    <main className="wrap">
      <section className="legal">
        <div className="sechead" style={{ marginTop: 48 }}>
          <div>
            <span className="eyebrow">Prize rules</span>
            <h2>How prizes are decided and paid</h2>
          </div>
        </div>
        <p className="secsub">
          Free entry, no stake, prizes follow points. Last updated 24 August 2026.
        </p>

        <div
          className="panel"
          style={{
            marginTop: 26,
            borderColor: pot.funded ? undefined : "rgba(180,120,0,.35)",
            background: pot.funded ? undefined : "#FFFBEB",
          }}
        >
          <h3 style={{ margin: 0 }}>Current funding status</h3>
          <p style={{ marginTop: 10 }}>
            {pot.funded ? (
              <>
                <b>Funded.</b> {Math.floor(pot.potChzNow).toLocaleString("en-US")} CHZ is confirmed
                for the season, and{" "}
                {pot.seasonPoolChz > 0
                  ? `${pot.seasonPoolChz.toLocaleString("en-US")} CHZ is committed to the season board.`
                  : "matchday pools are announced per fixture."}
              </>
            ) : (
              <>
                <b>Not yet funded.</b> The season figure shown on the homepage is a{" "}
                <b>target</b>, not a balance, and no CHZ is currently committed. Matchdays run and
                points are scored, but nothing is payable until a matchday or season is announced as
                funded. Entry stays free either way.
              </>
            )}
          </p>
        </div>

        <h3>Who can win</h3>
        <p>
          Anyone 18 or over who has verified a wallet by signing the ownership message and chosen a
          display name, in a jurisdiction where taking part is lawful for them. Verification is what
          makes points payable — an unverified address still appears on the board and still scores,
          it just cannot be paid, because there is nobody to pay.
        </p>

        <h3>How a pool is divided</h3>
        <p>
          Your share is <b>your points ÷ all points on the board</b>, multiplied by the committed
          pool for that matchday or season.
        </p>
        <p>
          Points belonging to wallets that never verify are <b>not</b> paid out and are{" "}
          <b>not</b> redistributed to the traders who did verify. That share stays in the pot and
          rolls into the next matchday. This is deliberate: dividing the pool only among verified
          wallets would mean the first person to claim a handle collects almost the whole pot for
          having signed up early rather than for having traded well.
        </p>

        <h3>When it is paid</h3>
        <p>
          A board finalises after the match window closes and the maker cooldown has elapsed. The
          settlement is then computed from the final board and paid in CHZ to the verified wallet
          address on the board. Payment is a manual, human-authorised transfer during the pilot; the
          settlement figures are published so that anyone can check them.
        </p>

        <h3>What voids a prize</h3>
        <ul>
          <li>Wash trading or any self-dealing round trip designed to manufacture volume.</li>
          <li>Coordinated trading between accounts to move one participant up the board.</li>
          <li>Exploiting a defect in the scoring code, the indexer, or a venue integration.</li>
          <li>Attempting to move a token&apos;s price for the purpose of changing the board.</li>
          <li>Impersonating another participant, the league, or an official.</li>
        </ul>
        <p>
          Where a score is voided, it is removed from the board and the settlement is recomputed
          before payment.
        </p>

        <h3>What prizes are not</h3>
        <p>
          Prizes never depend on the result of a match. Which club wins, the score, the goals — none
          of it enters the formula. The league pays for trading performance inside a time window
          that happens to be a match window. There is no stake, no odds, and no wager: you cannot
          lose money to the league because you never give it any.
        </p>

        <h3>Changes</h3>
        <p>
          Pools, parameters and match windows can change for future matchdays and are published in
          advance. A change to the scoring formula applies from the next season; a season already
          scored is archived under the rules it ran on rather than rescored — see{" "}
          <Link href="/archive">the preseason archive</Link> for a worked example.
        </p>

        <div style={{ marginTop: 28, display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Link className="btn secondary" href="/regras">
            The formula
          </Link>
          <Link className="btn secondary" href="/terms">
            Terms
          </Link>
          <Link className="btn secondary" href="/privacy">
            Data policy
          </Link>
        </div>
      </section>
    </main>
  );
}
