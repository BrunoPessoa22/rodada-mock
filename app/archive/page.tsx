import Link from "next/link";
import { Icon } from "@/components/Icons";
import { PRESEASON } from "@/lib/config";
import { getLeaderboard, listMatches, shortAddress } from "@/lib/queries";

export const dynamic = "force-dynamic";
export const metadata = { title: "Preseason archive — Trading League" };

const fmtUsd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

/**
 * The retired Jul-2026 board. It is kept public rather than deleted: three real
 * match windows, 45 real wallets, real on-chain flow — that history is worth
 * something. What it is NOT is a board the current published formula can
 * reproduce, so it never appears on the live page and was never payable.
 */
export default function ArchivePage() {
  const matches = listMatches(PRESEASON);
  const board = getLeaderboard({ season: PRESEASON, poolChz: 0, limit: 100 });

  return (
    <main className="wrap">
      <section style={{ maxWidth: 860, margin: "0 auto", paddingBottom: 72 }}>
        <div className="sechead" style={{ marginTop: 48 }}>
          <div>
            <span className="eyebrow">Archive</span>
            <h2>Preseason — July 2026</h2>
          </div>
        </div>
        <p className="secsub">
          The league&apos;s first three match windows, scored before the current rules existed.
          Kept here as a record. Not a live board, and never paid out.
        </p>

        <div className="panel" style={{ marginTop: 26 }}>
          <div className="ph">
            <Icon id="i-shield" lg />
            <h3>Why this board is archived, not rescored</h3>
          </div>
          <p className="gapline" style={{ marginTop: 12 }}>
            These windows were scored with the league&apos;s first formula,{" "}
            <b>points = 2 × √|net taker USD|</b> — it ranked traders by the size of their net flow,
            in either direction, and never looked at whether the trade made money. In late July the
            rules changed to the profit-only formula on{" "}
            <Link href="/regras">How it works</Link>: losses and break-even now score zero.
          </p>
          <p className="gapline" style={{ marginTop: 10 }}>
            Rescoring these three windows under the new rules would mean marking July&apos;s
            unsold inventory at today&apos;s pool prices — a month of price movement the traders
            never had a chance to act on. Publishing that as a result would be worse than
            publishing nothing. So the preseason keeps its original numbers, clearly labelled, and
            the pilot season starts from zero.
          </p>
        </div>

        <div className="panel" style={{ marginTop: 18 }}>
          <div className="ph">
            <Icon id="i-trend" lg />
            <h3>Windows scored</h3>
          </div>
          <div className="rd-tablewrap">
          <table className="fixture">
            <thead>
              <tr>
                <th style={{ textAlign: "left" }}>Match</th>
                <th style={{ textAlign: "left" }}>Competition</th>
                <th style={{ textAlign: "left" }}>Window (UTC)</th>
                <th style={{ textAlign: "right" }}>Tokens</th>
              </tr>
            </thead>
            <tbody>
              {matches.map((m) => (
                <tr key={m.slug}>
                  <td>
                    {m.home} × {m.away}
                  </td>
                  <td>{m.competition}</td>
                  <td>
                    {m.window_start_utc.slice(0, 10)} → {m.window_end_utc.slice(0, 10)}
                  </td>
                  <td style={{ textAlign: "right" }}>
                    {(JSON.parse(m.tokens) as string[]).join(", ")}
                  </td>
                </tr>
              ))}
              {matches.length === 0 ? (
                <tr>
                  <td colSpan={4}>No archived windows.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
          </div>
          <p className="gapline" style={{ marginTop: 12 }}>
            The pool figures attached to these fixtures were display targets. No CHZ was
            distributed for the preseason.
          </p>
        </div>

        <div className="panel" style={{ marginTop: 18 }}>
          <div className="ph">
            <Icon id="i-scale" lg />
            <h3>Preseason standings (retired formula)</h3>
          </div>
          <p className="gapline" style={{ marginTop: 12 }}>
            {board.wallets} wallets traded the featured tokens inside these windows.{" "}
            <b>Net flow</b> below is the signed figure the retired formula scored on its absolute
            value — which is why a heavy net seller can sit near the top.
          </p>
          <div className="rd-tablewrap">
          <table className="fixture">
            <thead>
              <tr>
                <th style={{ textAlign: "left" }}>#</th>
                <th style={{ textAlign: "left" }}>Wallet</th>
                <th style={{ textAlign: "right" }}>Swaps</th>
                <th style={{ textAlign: "right" }}>Net flow</th>
                <th style={{ textAlign: "right" }}>Points (retired)</th>
              </tr>
            </thead>
            <tbody>
              {board.entries
                .filter((e) => e.points > 0)
                .map((e) => (
                  <tr key={e.address}>
                    <td>{String(e.rank).padStart(2, "0")}</td>
                    <td>{e.verified ? e.display : shortAddress(e.address)}</td>
                    <td style={{ textAlign: "right" }}>{e.swaps.toLocaleString("en-US")}</td>
                    <td style={{ textAlign: "right" }}>{fmtUsd.format(e.netTakerUsd)}</td>
                    <td style={{ textAlign: "right" }}>{e.points.toFixed(1)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
          </div>
        </div>

        <div style={{ marginTop: 28, display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Link className="btn primary" href="/">
            Back to the live season
          </Link>
          <Link className="btn secondary" href="/regras">
            How scoring works now
          </Link>
        </div>
      </section>
    </main>
  );
}
