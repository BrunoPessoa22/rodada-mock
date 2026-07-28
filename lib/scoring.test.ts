import { describe, expect, it } from "vitest";
import {
  computePnl,
  mergeFlowsByIdentity,
  scoreWallet,
  scoreWindow,
  skillScore,
  volumeMultiplier,
  type WalletFlow,
} from "./scoring";

const flow = (partial: Partial<WalletFlow>): WalletFlow => ({
  address: "0xabc",
  grossBuyUsd: 0,
  grossSellUsd: 0,
  makerAddUsd: 0,
  makerRemoveUsd: 0,
  inventoryMarkUsd: 0,
  swaps: 1,
  ...partial,
});

describe("volumeMultiplier", () => {
  it("is zero at zero volume and saturates toward 1", () => {
    expect(volumeMultiplier(0, 1000)).toBe(0);
    expect(volumeMultiplier(1000, 1000)).toBeCloseTo(1 - Math.exp(-1), 12);
    expect(volumeMultiplier(3000, 1000)).toBeGreaterThan(0.94);
    expect(volumeMultiplier(3000, 1000)).toBeLessThan(1);
  });
});

describe("skillScore", () => {
  it("default is profit-only (F=0): break-even and losses score 0", () => {
    expect(skillScore(0)).toBe(0);
    expect(skillScore(-40)).toBe(0);
    expect(skillScore(-100)).toBe(0);
    expect(skillScore(20)).toBe(20);
  });

  it("an explicit positive floor shifts the zero point (legacy Option-B math)", () => {
    expect(skillScore(-100, 100)).toBe(0);
    expect(skillScore(0, 100)).toBe(100);
    expect(skillScore(20, 100)).toBe(120);
  });
});

describe("computePnl", () => {
  it("marks remaining inventory against buy cost", () => {
    const r = computePnl({ grossBuyUsd: 30, grossSellUsd: 0, inventoryMarkUsd: 35 });
    expect(r.pnlUsd).toBe(5);
    expect(r.pnlPct).toBeCloseTo(16.666666, 4);
  });

  it("realized round-trip profit uses the larger leg as capital", () => {
    // Buy 30, sell 40 → capital max(30,40)=40, pnl 10 → 25%.
    const r = computePnl({ grossBuyUsd: 30, grossSellUsd: 40, inventoryMarkUsd: 0 });
    expect(r.pnlUsd).toBe(10);
    expect(r.capitalUsd).toBe(40);
    expect(r.pnlPct).toBeCloseTo(25, 8);
  });

  it("flat wash has ~zero pnl", () => {
    const r = computePnl({ grossBuyUsd: 5000, grossSellUsd: 5000, inventoryMarkUsd: 0 });
    expect(r.pnlUsd).toBe(0);
    expect(r.pnlPct).toBe(0);
  });

  it("liquidating a pre-window position can't shrink the denominator (free-option guard)", () => {
    // Tiny in-window buy, huge sell of pre-held tokens: capital is the sell leg,
    // not the $50 buy, so PnL% is bounded (~99%) not ~9900%.
    const r = computePnl({ grossBuyUsd: 50, grossSellUsd: 5000, inventoryMarkUsd: 0 });
    expect(r.capitalUsd).toBe(5000);
    expect(r.pnlPct).toBeCloseTo(99, 6);
  });
});

describe("scoreWallet — Points = SkillScore × volume unlock (profit-only default)", () => {
  it("scores profitable buy-and-hold with volume unlock", () => {
    const s = scoreWallet(flow({ grossBuyUsd: 100, inventoryMarkUsd: 120 })); // +20%
    const mult = 1 - Math.exp(-100 / 1000);
    expect(s.pnlPct).toBeCloseTo(20, 8);
    expect(s.skillScore).toBeCloseTo(20, 8);
    expect(s.volumeMultiplier).toBeCloseTo(mult, 12);
    expect(s.points).toBeCloseTo(20 * mult, 8);
  });

  it("wash / break-even scores ZERO no matter the volume", () => {
    const s = scoreWallet(flow({ grossBuyUsd: 5000, grossSellUsd: 5000, swaps: 40 }));
    expect(s.pnlPct).toBe(0);
    expect(s.skillScore).toBe(0);
    expect(s.volumeUsd).toBe(10000); // volume is there…
    expect(s.points).toBe(0); // …but zero profit means zero points
  });

  it("a losing book scores zero even with volume", () => {
    const s = scoreWallet(flow({ grossBuyUsd: 100, inventoryMarkUsd: 60 })); // −40%
    expect(s.pnlPct).toBeCloseTo(-40, 8);
    expect(s.skillScore).toBe(0);
    expect(s.points).toBe(0);
  });

  it("net selling without buys uses sell proceeds as capital", () => {
    const s = scoreWallet(flow({ grossSellUsd: 100, inventoryMarkUsd: -80 })); // +20%
    expect(s.pnlPct).toBeCloseTo(20, 8);
    expect(s.skillScore).toBeCloseTo(20, 8);
    expect(s.points).toBeGreaterThan(0);
  });

  it("net LP depth counts toward the volume unlock", () => {
    const takerOnly = scoreWallet(flow({ grossBuyUsd: 100, inventoryMarkUsd: 120 }));
    const withMaker = scoreWallet(flow({ grossBuyUsd: 100, inventoryMarkUsd: 120, makerAddUsd: 900 }));
    expect(withMaker.skillScore).toBeCloseTo(takerOnly.skillScore, 8);
    expect(withMaker.volumeUsd).toBe(1000);
    expect(withMaker.volumeMultiplier).toBeGreaterThan(takerOnly.volumeMultiplier);
    expect(withMaker.points).toBeGreaterThan(takerOnly.points);
  });

  it("add-then-remove liquidity nets to zero maker volume credit", () => {
    const s = scoreWallet(flow({ makerAddUsd: 8000, makerRemoveUsd: 8000 }));
    expect(s.makerNetAddUsd).toBe(0);
    expect(s.volumeUsd).toBe(0);
    expect(s.points).toBe(0);
  });

  it("a profitable small book beats a flat high-volume washer (washer scores 0)", () => {
    const winner = scoreWallet(flow({ grossBuyUsd: 100, inventoryMarkUsd: 200 })); // +100%
    const washer = scoreWallet(flow({ grossBuyUsd: 5000, grossSellUsd: 5000 })); // flat
    expect(winner.skillScore).toBe(100);
    expect(winner.points).toBeGreaterThan(0);
    expect(washer.points).toBe(0);
    expect(winner.points).toBeGreaterThan(washer.points);
  });
});

describe("scoreWindow", () => {
  it("drops zero-point wallets and sorts descending", () => {
    const scores = scoreWindow([
      flow({ address: "0x1", grossBuyUsd: 100, inventoryMarkUsd: 110 }), // +10%
      flow({ address: "0x2", grossBuyUsd: 100, inventoryMarkUsd: 150 }), // +50%
      flow({ address: "0x3", grossBuyUsd: 100, inventoryMarkUsd: 0 }), // −100%
      flow({ address: "0x4", grossBuyUsd: 100, inventoryMarkUsd: 100 }), // break-even
    ]);
    expect(scores.map((s) => s.address)).toEqual(["0x2", "0x1"]);
    expect(scores[0].points).toBeGreaterThan(scores[1].points);
  });
});

describe("mergeFlowsByIdentity — sybil collapse", () => {
  it("splitting one flow across N self-owned wallets scores like one wallet", () => {
    const wallets = [
      flow({ address: "0xa1", grossBuyUsd: 25, inventoryMarkUsd: 30 }),
      flow({ address: "0xa2", grossBuyUsd: 25, inventoryMarkUsd: 30 }),
      flow({ address: "0xa3", grossBuyUsd: 25, inventoryMarkUsd: 30 }),
      flow({ address: "0xa4", grossBuyUsd: 25, inventoryMarkUsd: 30 }),
    ];
    const owner: Record<string, string> = {
      "0xa1": "id:alice",
      "0xa2": "id:alice",
      "0xa3": "id:alice",
      "0xa4": "id:alice",
    };

    const split = scoreWindow(wallets);
    const splitTotal = split.reduce((s, w) => s + w.points, 0);

    const merged = scoreWindow(mergeFlowsByIdentity(wallets, (a) => owner[a] ?? a));
    expect(merged).toHaveLength(1);
    expect(merged[0].address).toBe("id:alice");
    const honest = scoreWallet(flow({ grossBuyUsd: 100, inventoryMarkUsd: 120 }));
    expect(merged[0].points).toBeCloseTo(honest.points, 8);
    // Splitting inflates points (4 small unlocks > 1 large unlock); merge removes the edge.
    expect(merged[0].points).toBeLessThanOrEqual(splitTotal + 1e-9);
  });

  it("ungrouped wallets pass through unchanged (identity = self)", () => {
    const wallets = [
      flow({ address: "0x1", grossBuyUsd: 100, inventoryMarkUsd: 150 }),
      flow({ address: "0x2", grossBuyUsd: 100, inventoryMarkUsd: 110 }),
    ];
    const merged = scoreWindow(mergeFlowsByIdentity(wallets, (a) => a));
    expect(merged.map((w) => w.address)).toEqual(["0x1", "0x2"]);
  });

  it("a buy in one wallet and offsetting sell in another of the same identity nets to a wash → 0", () => {
    const wallets = [
      flow({ address: "0xb1", grossBuyUsd: 5000, inventoryMarkUsd: 5000 }),
      flow({ address: "0xb2", grossSellUsd: 5000, inventoryMarkUsd: -5000 }),
    ];
    // Merged: flat PnL, high volume → profit-only means zero points.
    const merged = scoreWindow(mergeFlowsByIdentity(wallets, () => "id:bob"));
    expect(merged).toHaveLength(0);
  });

  it("maker add in one wallet, remove in another of the same identity → zero maker credit", () => {
    const wallets = [
      flow({ address: "0xc1", makerAddUsd: 10000 }),
      flow({ address: "0xc2", makerRemoveUsd: 10000 }),
    ];
    const merged = scoreWindow(mergeFlowsByIdentity(wallets, () => "id:carol"));
    expect(merged).toHaveLength(0);
  });
});
