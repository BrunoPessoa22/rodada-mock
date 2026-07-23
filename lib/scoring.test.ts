import { describe, expect, it } from "vitest";
import {
  computePnl,
  mergeFlowsByIdentity,
  scoreWallet,
  scoreWindow,
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

describe("computePnl", () => {
  it("marks remaining inventory against buy cost", () => {
    // Bought $30, still holds inventory marked $35 → +$5 / 16.67%
    const r = computePnl({ grossBuyUsd: 30, grossSellUsd: 0, inventoryMarkUsd: 35 });
    expect(r.pnlUsd).toBe(5);
    expect(r.pnlPct).toBeCloseTo(16.666666, 4);
  });

  it("realized round-trip profit counts", () => {
    const r = computePnl({ grossBuyUsd: 30, grossSellUsd: 40, inventoryMarkUsd: 0 });
    expect(r.pnlUsd).toBe(10);
    expect(r.pnlPct).toBeCloseTo(33.333333, 4);
  });

  it("flat wash has ~zero pnl", () => {
    const r = computePnl({ grossBuyUsd: 5000, grossSellUsd: 5000, inventoryMarkUsd: 0 });
    expect(r.pnlUsd).toBe(0);
    expect(r.pnlPct).toBe(0);
  });
});

describe("scoreWallet — Points = PnL% × (1 − e^(−V/V_t))", () => {
  it("scores profitable buy-and-hold with volume unlock", () => {
    const s = scoreWallet(
      flow({ grossBuyUsd: 100, inventoryMarkUsd: 120 }), // +20% on $100
      { featured: false, volumeTargetUsd: 1000 }
    );
    const mult = 1 - Math.exp(-100 / 1000);
    expect(s.pnlPct).toBeCloseTo(20, 8);
    expect(s.volumeMultiplier).toBeCloseTo(mult, 12);
    expect(s.points).toBeCloseTo(20 * mult, 8);
  });

  it("flat wash scores zero even with huge volume", () => {
    const s = scoreWallet(
      flow({ grossBuyUsd: 50000, grossSellUsd: 50000, swaps: 40 }),
      { featured: false, volumeTargetUsd: 1000 }
    );
    expect(s.pnlPct).toBe(0);
    expect(s.points).toBe(0);
  });

  it("net selling without buys uses sell proceeds as capital", () => {
    // Short-only: sold $100, inventory short marked −$80 → +$20 / 20%
    const s = scoreWallet(
      flow({ grossSellUsd: 100, inventoryMarkUsd: -80 }),
      { featured: false, volumeTargetUsd: 1000 }
    );
    expect(s.pnlPct).toBeCloseTo(20, 8);
    expect(s.points).toBeGreaterThan(0);
  });

  it("featured matches double points", () => {
    const base = scoreWallet(flow({ grossBuyUsd: 100, inventoryMarkUsd: 120 }), {
      featured: false,
      volumeTargetUsd: 1000,
    });
    const feat = scoreWallet(flow({ grossBuyUsd: 100, inventoryMarkUsd: 120 }), {
      featured: true,
      volumeTargetUsd: 1000,
    });
    expect(feat.points).toBeCloseTo(base.points * 2, 8);
  });

  it("net LP depth counts toward the volume unlock, not as a 2× bonus", () => {
    const takerOnly = scoreWallet(flow({ grossBuyUsd: 100, inventoryMarkUsd: 120 }), {
      featured: false,
      volumeTargetUsd: 1000,
    });
    const withMaker = scoreWallet(
      flow({ grossBuyUsd: 100, inventoryMarkUsd: 120, makerAddUsd: 900 }),
      { featured: false, volumeTargetUsd: 1000 }
    );
    // Same PnL%, larger volume → higher multiplier, not 2× maker points.
    expect(withMaker.pnlPct).toBeCloseTo(takerOnly.pnlPct, 8);
    expect(withMaker.volumeUsd).toBe(1000);
    expect(withMaker.volumeMultiplier).toBeGreaterThan(takerOnly.volumeMultiplier);
    expect(withMaker.points).toBeGreaterThan(takerOnly.points);
  });

  it("add-then-remove liquidity nets to zero maker volume credit", () => {
    const s = scoreWallet(
      flow({ makerAddUsd: 8000, makerRemoveUsd: 8000 }),
      { featured: false, volumeTargetUsd: 1000 }
    );
    expect(s.makerNetAddUsd).toBe(0);
    expect(s.volumeUsd).toBe(0);
    expect(s.points).toBe(0);
  });

  it("the v1 wash exploit is dead: $10k churned flat scores below $100 that made 20%", () => {
    const wash = scoreWallet(flow({ grossBuyUsd: 5000, grossSellUsd: 5000 }), {
      featured: false,
      volumeTargetUsd: 1000,
    });
    const honest = scoreWallet(flow({ grossBuyUsd: 100, inventoryMarkUsd: 120 }), {
      featured: false,
      volumeTargetUsd: 1000,
    });
    expect(wash.points).toBe(0);
    expect(honest.points).toBeGreaterThan(0);
    expect(wash.points).toBeLessThan(honest.points);
  });
});

describe("scoreWindow", () => {
  it("drops zero-point wallets and sorts descending", () => {
    const scores = scoreWindow(
      [
        flow({ address: "0x1", grossBuyUsd: 100, inventoryMarkUsd: 110 }), // +10%
        flow({ address: "0x2", grossBuyUsd: 100, inventoryMarkUsd: 150 }), // +50%
        flow({ address: "0x3", grossBuyUsd: 400, grossSellUsd: 400 }), // flat wash
      ],
      { featured: false, volumeTargetUsd: 1000 }
    );
    expect(scores.map((s) => s.address)).toEqual(["0x2", "0x1"]);
    expect(scores[0].points).toBeGreaterThan(scores[1].points);
  });
});

describe("mergeFlowsByIdentity — sybil collapse", () => {
  it("splitting one flow across N self-owned wallets scores like one wallet", () => {
    // One identity, four wallets each: buy $25, inventory $30 → same as one wallet buy $100 mark $120.
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

    const split = scoreWindow(wallets, { featured: false, volumeTargetUsd: 1000 });
    const splitTotal = split.reduce((s, w) => s + w.points, 0);

    const merged = scoreWindow(
      mergeFlowsByIdentity(wallets, (a) => owner[a] ?? a),
      { featured: false, volumeTargetUsd: 1000 }
    );
    expect(merged).toHaveLength(1);
    expect(merged[0].address).toBe("id:alice");
    // Same as one honest wallet with the full size — no split advantage on PnL% or volume.
    const honest = scoreWallet(flow({ grossBuyUsd: 100, inventoryMarkUsd: 120 }), {
      featured: false,
      volumeTargetUsd: 1000,
    });
    expect(merged[0].points).toBeCloseTo(honest.points, 8);
    // Split sum can differ slightly because each wallet's own volume unlock is concave;
    // identity merge is the correct (and lower-or-equal) total.
    expect(merged[0].points).toBeLessThanOrEqual(splitTotal + 1e-9);
  });

  it("ungrouped wallets pass through unchanged (identity = self)", () => {
    const wallets = [
      flow({ address: "0x1", grossBuyUsd: 100, inventoryMarkUsd: 150 }),
      flow({ address: "0x2", grossBuyUsd: 100, inventoryMarkUsd: 110 }),
    ];
    const merged = scoreWindow(mergeFlowsByIdentity(wallets, (a) => a), {
      featured: false,
      volumeTargetUsd: 1000,
    });
    expect(merged.map((w) => w.address)).toEqual(["0x1", "0x2"]);
  });

  it("buy+sell split across an identity's own wallets nets toward zero once merged", () => {
    const wallets = [
      flow({ address: "0xb1", grossBuyUsd: 5000, inventoryMarkUsd: 5000 }),
      flow({ address: "0xb2", grossSellUsd: 5000, inventoryMarkUsd: -5000 }),
    ];
    // After merge: buy 5000, sell 5000, inventory 0 → flat wash → 0 points
    const merged = scoreWindow(mergeFlowsByIdentity(wallets, () => "id:bob"), {
      featured: false,
      volumeTargetUsd: 1000,
    });
    expect(merged).toHaveLength(0);
  });

  it("maker add in one wallet, remove in another of the same identity → zero maker credit", () => {
    const wallets = [
      flow({ address: "0xc1", makerAddUsd: 10000 }),
      flow({ address: "0xc2", makerRemoveUsd: 10000 }),
    ];
    const merged = scoreWindow(mergeFlowsByIdentity(wallets, () => "id:carol"), {
      featured: false,
      volumeTargetUsd: 1000,
    });
    expect(merged).toHaveLength(0);
  });
});
