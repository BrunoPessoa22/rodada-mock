import Link from "next/link";
import { Icon } from "@/components/Icons";
import { PRESEASON } from "@/lib/config";
import {
  activeSeason,
  getLeaderboard,
  listMatches,
  listSeasons,
  shortAddress,
} from "@/lib/queries";

export const dynamic = "force-dynamic";
export const metadata = { title: "Archive — Trading League" };

const fmtUsd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

/** Human label for a season id. Only the preseason has a story worth telling. */
function seasonTitle(season: string): string {
  return season === PRESEASON ? "Preseason — July 2026" : season;
}

/**
 * A retired board, kept public rather than deleted: real match windows, real
 * wallets, real on-chain flow — that history is worth something. What an
 * archived board is NOT is one the current published formula can reproduce, so
 * it never appears on the live page and is never payable.
 */
function SeasonArchive({ season }: { season: string }) {
  const matches = listMatches(season);
  const board = getLeaderboard({ season, poolChz: 0, limit: 100 });
  const scorers = board.entries.filter((e) => e.points > 0);

  return (
    <>
      <div className="panel" style={{ marginTop: 18 }}>
        <div className="ph">
          <Icon id="i-trend" lg />
          <h3>{seasonTitle(season)} — windows scored</h3>
        </div>
        <div className="rd-tablewrap">
          <table className="fixture">
            <thead>
              <tr>
                <th>Match</th>
                <th>Competition</th>
                <th>Window (UTC)</th>
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
                  <td colSpan={4}>No windows in this season.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <p className="gapline" style={{ marginTop: 12 }}>
          The pool figures attached to these fixtures were display targets. No CHZ was
          distributed.
        </p>
      </div>

      <div className="panel" style={{ marginTop: 18 }}>
        <div className="ph">
          <Icon id="i-scale" lg />
          <h3>{seasonTitle(season)} — standings</h3>
        </div>
        <p className="gapline" style={{ marginTop: 12 }}>
          {board.wallets} wallets traded the featured tokens inside these windows.{" "}
          {season === PRESEASON ? (
            <>
              <b>Net flow</b> below is the signed figure the retired formula scored on its
              absolute value — which is why a heavy net seller can sit near the top.
            </>
          ) : null}
        </p>
        <div className="rd-tablewrap">
          <table className="fixture">
            <thead>
              <tr>
                <th>#</th>
                <th>Wallet</th>
                <th style={{ textAlign: "right" }}>Swaps</th>
                <th style={{ textAlign: "right" }}>Net flow</th>
                <th style={{ textAlign: "right" }}>Points</th>
              </tr>
            </thead>
            <tbody>
              {scorers.map((e) => (
                <tr key={e.address}>
                  <td>{String(e.rank).padStart(2, "0")}</td>
                  <td>{e.verified ? e.display : shortAddress(e.address)}</td>
                  <td style={{ textAlign: "right" }}>{e.swaps.toLocaleString("en-US")}</td>
                  <td style={{ textAlign: "right" }}>{fmtUsd.format(e.netTakerUsd)}</td>
                  <td style={{ textAlign: "right" }}>{e.points.toFixed(1)}</td>
                </tr>
              ))}
              {scorers.length === 0 ? (
                <tr>
                  <td colSpan={5}>No scores in this season.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

export default function ArchivePage() {
  // Every season except the one the live board reads. Today that is just the
  // preseason, but a future season roll lands here automatically rather than
  // disappearing because this page named one season.
  const active = activeSeason();
  const archived = listSeasons()
    .map((s) => s.season)
    .filter((s) => s !== active);

  return (
    <main className="wrap">
      <section style={{ maxWidth: 860, margin: "0 auto", paddingBottom: 72 }}>
        <div className="sechead" style={{ marginTop: 48 }}>
          <div>
            <span className="eyebrow">Archive</span>
            <h2>Retired boards</h2>
          </div>
        </div>
        <p className="secsub">
          Seasons the league has already scored, kept as a record. Not live boards, and
          never rescored under rules their traders did not play by.
        </p>

        <div className="panel" style={{ marginTop: 26 }}>
          <div className="ph">
            <Icon id="i-shield" lg />
            <h3>Why a board is archived, not rescored</h3>
          </div>
          <p className="gapline" style={{ marginTop: 12 }}>
            The league&apos;s first three windows (July 2026) were scored with its first
            formula, <b>points = 2 × √|net taker USD|</b> — it ranked traders by the size
            of their net flow, in either direction, and never looked at whether the trade
            made money. In late July the rules changed to the profit-only formula on{" "}
            <Link href="/regras">How it works</Link>: losses and break-even now score zero.
          </p>
          <p className="gapline" style={{ marginTop: 10 }}>
            Rescoring those windows under the new rules would mean marking July&apos;s
            unsold inventory at today&apos;s pool prices — a month of price movement the
            traders never had a chance to act on. Publishing that as a result would be
            worse than publishing nothing. So a scored season keeps the numbers it ran on,
            clearly labelled, and the next season starts from zero.
          </p>
        </div>

        {archived.map((season) => (
          <SeasonArchive key={season} season={season} />
        ))}
        {archived.length === 0 ? (
          <div className="panel" style={{ marginTop: 18 }}>
            <p>No archived seasons yet — the current season is the league&apos;s first.</p>
          </div>
        ) : null}

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
