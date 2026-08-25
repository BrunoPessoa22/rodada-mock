import { describe, expect, it } from "vitest";
import {
  bucketQuotes,
  bucketQuotesByOwner,
  isPerpSource,
  VIBE_MARKETS,
  type QuoteRow,
} from "./vibe";
import { TOKENS } from "./tokens";

const E18 = (n: number) => String(BigInt(Math.round(n * 1e6)) * 10n ** 12n);

/** quantity 10 @ open 0.5 = $5 notional; closed 10 @ 0.6 = $6 notional. */
function quote(
  symbolId: number,
  openTs: number,
  closeTs: number,
  opts: { qty?: number; open?: number; close?: number; partyA?: string } = {}
): QuoteRow {
  const qty = opts.qty ?? 10;
  return {
    quoteId: `${symbolId}-${openTs}`,
    symbolId: String(symbolId),
    partyA: opts.partyA ?? null,
    quantity: E18(qty),
    openedPrice: E18(opts.open ?? 0.5),
    averageClosedPrice: closeTs > 0 ? E18(opts.close ?? 0.6) : null,
    closedAmount: closeTs > 0 ? E18(qty) : null,
    timestampOpenPosition: String(openTs),
    timestampFullyClose: closeTs > 0 ? String(closeTs) : null,
  };
}

const PSG = VIBE_MARKETS.find((m) => m.token === "PSG")!;
const WINDOW_FROM = 1_000;
const WINDOW_TO = 2_000;
const only = (rows: ReturnType<typeof bucketQuotes>) => rows.find((r) => r.token === "PSG")!;

describe("isPerpSource", () => {
  it("flags derivative sources and nothing else", () => {
    expect(isPerpSource("perp:vibe")).toBe(true);
    // These are all spot and MUST stay in the token-demand total.
    for (const spot of ["cex:binance", "solana:meteora", "base:aerodrome", "chiliz"]) {
      expect(isPerpSource(spot)).toBe(false);
    }
  });
});

describe("VIBE_MARKETS", () => {
  it("only lists tokens the league itself recognises", () => {
    for (const m of VIBE_MARKETS) {
      expect(TOKENS[m.token], `${m.token} is not in the league registry`).toBeDefined();
    }
  });

  it("excludes CHZ — it is the gas asset, not a club token", () => {
    expect(VIBE_MARKETS.some((m) => m.token === "CHZ")).toBe(false);
  });
});

describe("bucketQuotes window attribution", () => {
  it("counts an open inside the window", () => {
    const r = only(bucketQuotes([quote(PSG.symbolId, 1_500, 0)], [PSG], WINDOW_FROM, WINDOW_TO));
    expect(r.notionalUsd).toBeCloseTo(5, 6); // 10 × 0.5
    expect(r.trades).toBe(1);
  });

  it("counts both legs when a position opens and closes inside the window", () => {
    const r = only(bucketQuotes([quote(PSG.symbolId, 1_200, 1_800)], [PSG], WINDOW_FROM, WINDOW_TO));
    expect(r.notionalUsd).toBeCloseTo(11, 6); // 5 open + 6 close
    expect(r.trades).toBe(2);
  });

  it("counts only the close when the position was opened before the window", () => {
    const r = only(bucketQuotes([quote(PSG.symbolId, 500, 1_800)], [PSG], WINDOW_FROM, WINDOW_TO));
    expect(r.notionalUsd).toBeCloseTo(6, 6);
    expect(r.trades).toBe(1);
  });

  it("counts neither leg for a position that straddles the whole window", () => {
    // Opened before, closed after — no execution happened inside the window, so
    // it contributes nothing, exactly like a spot trade outside the window.
    const r = only(bucketQuotes([quote(PSG.symbolId, 500, 5_000)], [PSG], WINDOW_FROM, WINDOW_TO));
    expect(r.notionalUsd).toBe(0);
    expect(r.trades).toBe(0);
  });

  it("ignores markets that are not being tracked", () => {
    const rows = bucketQuotes([quote(9_999, 1_500, 1_800)], [PSG], WINDOW_FROM, WINDOW_TO);
    expect(only(rows).notionalUsd).toBe(0);
  });

  it("returns a zero row for a tracked market with no activity", () => {
    const rows = bucketQuotes([], [PSG], WINDOW_FROM, WINDOW_TO);
    expect(rows).toHaveLength(1);
    expect(only(rows)).toMatchObject({ token: "PSG", notionalUsd: 0, trades: 0 });
  });

  it("falls back to the open price when a close price is missing", () => {
    const q = quote(PSG.symbolId, 1_200, 1_800);
    q.averageClosedPrice = null;
    const r = only(bucketQuotes([q], [PSG], WINDOW_FROM, WINDOW_TO));
    expect(r.notionalUsd).toBeCloseTo(10, 6); // 5 open + 5 close at the open mark
  });
});

describe("bucketQuotesByOwner — verified-wallet attribution", () => {
  const SUB_A1 = "0xAAA0000000000000000000000000000000000001";
  const SUB_A2 = "0xAAA0000000000000000000000000000000000002";
  const SUB_B = "0xBBB0000000000000000000000000000000000001";
  const OWNER_A = "0x1111111111111111111111111111111111111111";
  const OWNER_B = "0x2222222222222222222222222222222222222222";
  // Case-mixed on purpose: mapping and lookups must both normalize.
  const subToOwner = new Map([
    [SUB_A1.toLowerCase(), OWNER_A],
    [SUB_A2.toLowerCase(), OWNER_A],
    [SUB_B.toLowerCase(), OWNER_B],
  ]);

  it("aggregates all of an owner's sub-accounts and splits open vs close legs", () => {
    const rows = bucketQuotesByOwner(
      [
        quote(PSG.symbolId, 1_500, 0, { partyA: SUB_A1 }), // open in window: $5
        quote(PSG.symbolId, 500, 1_800, { partyA: SUB_A2 }), // close in window: $6
      ],
      [PSG],
      WINDOW_FROM,
      WINDOW_TO,
      subToOwner
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ owner: OWNER_A, token: "PSG", trades: 2 });
    expect(rows[0].openUsd).toBeCloseTo(5, 6);
    expect(rows[0].closeUsd).toBeCloseTo(6, 6);
  });

  it("never aggregates positions of unclaimed sub-accounts", () => {
    const rows = bucketQuotesByOwner(
      [
        quote(PSG.symbolId, 1_500, 0, { partyA: "0xdead000000000000000000000000000000000001" }),
        quote(PSG.symbolId, 1_500, 0), // no partyA at all
        quote(PSG.symbolId, 1_600, 0, { partyA: SUB_B }),
      ],
      [PSG],
      WINDOW_FROM,
      WINDOW_TO,
      subToOwner
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].owner).toBe(OWNER_B);
  });

  it("drops owners whose only position straddles the window", () => {
    const rows = bucketQuotesByOwner(
      [quote(PSG.symbolId, 500, 5_000, { partyA: SUB_A1 })],
      [PSG],
      WINDOW_FROM,
      WINDOW_TO,
      subToOwner
    );
    expect(rows).toHaveLength(0);
  });
});
