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

describe("skillScore — Option B floor", () => {
  it("maps total loss (−100%) to 0 with F=100", () => {
    expect(skillScore(-100, 100)).toBe(0);
    expect(skillScore(-150, 100)).toBe(0);
  });

  it("maps break-even to F and profits above F", () => {
    expect(skillScore(0, 100)).toBe(100);
    expect(skillScore(20, 100)).toBe(120);
    expect(skillScore(-40, 100)).toBe(60);
  });
});

describe("computePnl", () => {
  it("marks remaining inventory against buy cost", () => {
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

describe("scoreWallet — Points = SkillScore × volume unlock", () => {
  it("scores profitable buy-and-hold with volume unlock", () => {
    const s = scoreWallet(
      flow({ grossBuyUsd: 100, inventoryMarkUsd: 120 }), // +20% → skill 120
      { volumeTargetUsd: 1000, skillFloorPct: 100 }
    );
    const mult = 1 - Math.exp(-100 / 1000);
    expect(s.pnlPct).toBeCloseTo(20, 8);
    expect(s.skillScore).toBeCloseTo(120, 8);
    expect(s.volumeMultiplier).toBeCloseTo(mult, 12);
    expect(s.points).toBeCloseTo(120 * mult, 8);
  });

  it("break-even with volume scores positive (SkillScore = F)", () => {
    const s = scoreWallet(
      flow({ grossBuyUsd: 5000, grossSellUsd: 5000, swaps: 40 }),
      { volumeTargetUsd: 1000, skillFloorPct: 100 }
    );
    expect(s.pnlPct).toBe(0);
    expect(s.skillScore).toBe(100);
    expect(s.points).toBeCloseTo(100 * (1 - Math.exp(-10000 / 1000)), 8);
    expect(s.points).toBeGreaterThan(0);
  });

  it("total loss scores zero even with volume", () => {
    // Bought $100, inventory worthless → PnL −100%
    const s = scoreWallet(
      flow({ grossBuyUsd: 100, inventoryMarkUsd: 0 }),
      { volumeTargetUsd: 1000, skillFloorPct: 100 }
    );
    expect(s.pnlPct).toBeCloseTo(-100, 8);
    expect(s.skillScore).toBe(0);
    expect(s.points).toBe(0);
  });

  it("partial loss still scores between 0 and F", () => {
    // Buy $100, mark $60 → −40% → skill 60
    const s = scoreWallet(
      flow({ grossBuyUsd: 100, inventoryMarkUsd: 60 }),
      { volumeTargetUsd: 1000, skillFloorPct: 100 }
    );
    expect(s.pnlPct).toBeCloseTo(-40, 8);
    expect(s.skillScore).toBeCloseTo(60, 8);
    expect(s.points).toBeGreaterThan(0);
  });

  it("net selling without buys uses sell proceeds as capital", () => {
    const s = scoreWallet(
      flow({ grossSellUsd: 100, inventoryMarkUsd: -80 }),
      { volumeTargetUsd: 1000, skillFloorPct: 100 }
    );
    expect(s.pnlPct).toBeCloseTo(20, 8);
    expect(s.skillScore).toBeCloseTo(120, 8);
    expect(s.points).toBeGreaterThan(0);
  });

  it("net LP depth counts toward the volume unlock", () => {
    const takerOnly = scoreWallet(flow({ grossBuyUsd: 100, inventoryMarkUsd: 120 }), {
      volumeTargetUsd: 1000,
      skillFloorPct: 100,
    });
    const withMaker = scoreWallet(
      flow({ grossBuyUsd: 100, inventoryMarkUsd: 120, makerAddUsd: 900 }),
      { volumeTargetUsd: 1000, skillFloorPct: 100 }
    );
    expect(withMaker.skillScore).toBeCloseTo(takerOnly.skillScore, 8);
    expect(withMaker.volumeUsd).toBe(1000);
    expect(withMaker.volumeMultiplier).toBeGreaterThan(takerOnly.volumeMultiplier);
    expect(withMaker.points).toBeGreaterThan(takerOnly.points);
  });

  it("add-then-remove liquidity nets to zero maker volume credit", () => {
    const s = scoreWallet(
      flow({ makerAddUsd: 8000, makerRemoveUsd: 8000 }),
      { volumeTargetUsd: 1000, skillFloorPct: 100 }
    );
    expect(s.makerNetAddUsd).toBe(0);
    expect(s.volumeUsd).toBe(0);
    expect(s.points).toBe(0);
  });

  it("profitable small book beats flat high-volume when skill gap is large enough", () => {
    // +100% on $100 vs flat $10k volume — skill 200 vs 100; volume mult differs
    const winner = scoreWallet(flow({ grossBuyUsd: 100, inventoryMarkUsd: 200 }), {
      volumeTargetUsd: 1000,
      skillFloorPct: 100,
    });
    const flat = scoreWallet(flow({ grossBuyUsd: 5000, grossSellUsd: 5000 }), {
      volumeTargetUsd: 1000,
      skillFloorPct: 100,
    });
    // Flat has more volume unlock; winner has 2× skill. At these sizes winner should lead.
    expect(winner.skillScore).toBe(200);
    expect(flat.skillScore).toBe(100);
    expect(winner.points).toBeGreaterThan(0);
    expect(flat.points).toBeGreaterThan(0);
  });
});

describe("scoreWindow", () => {
  it("drops zero-point wallets and sorts descending", () => {
    const scores = scoreWindow(
      [
        flow({ address: "0x1", grossBuyUsd: 100, inventoryMarkUsd: 110 }), // +10% → skill 110
        flow({ address: "0x2", grossBuyUsd: 100, inventoryMarkUsd: 150 }), // +50% → skill 150
        flow({ address: "0x3", grossBuyUsd: 100, inventoryMarkUsd: 0 }), // −100% → skill 0
      ],
      { volumeTargetUsd: 1000, skillFloorPct: 100 }
    );
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

    const split = scoreWindow(wallets, { volumeTargetUsd: 1000, skillFloorPct: 100 });
    const splitTotal = split.reduce((s, w) => s + w.points, 0);

    const merged = scoreWindow(mergeFlowsByIdentity(wallets, (a) => owner[a] ?? a), {
      volumeTargetUsd: 1000,
      skillFloorPct: 100,
    });
    expect(merged).toHaveLength(1);
    expect(merged[0].address).toBe("id:alice");
    const honest = scoreWallet(flow({ grossBuyUsd: 100, inventoryMarkUsd: 120 }), {
      volumeTargetUsd: 1000,
      skillFloorPct: 100,
    });
    expect(merged[0].points).toBeCloseTo(honest.points, 8);
    expect(merged[0].points).toBeLessThanOrEqual(splitTotal + 1e-9);
  });

  it("ungrouped wallets pass through unchanged (identity = self)", () => {
    const wallets = [
      flow({ address: "0x1", grossBuyUsd: 100, inventoryMarkUsd: 150 }),
      flow({ address: "0x2", grossBuyUsd: 100, inventoryMarkUsd: 110 }),
    ];
    const merged = scoreWindow(mergeFlowsByIdentity(wallets, (a) => a), {
      volumeTargetUsd: 1000,
      skillFloorPct: 100,
    });
    expect(merged.map((w) => w.address)).toEqual(["0x1", "0x2"]);
  });

  it("buy+sell split across an identity's own wallets nets once merged", () => {
    const wallets = [
      flow({ address: "0xb1", grossBuyUsd: 5000, inventoryMarkUsd: 5000 }),
      flow({ address: "0xb2", grossSellUsd: 5000, inventoryMarkUsd: -5000 }),
    ];
    // After merge: flat PnL, high volume → break-even skill F with volume unlock
    const merged = scoreWindow(mergeFlowsByIdentity(wallets, () => "id:bob"), {
      volumeTargetUsd: 1000,
      skillFloorPct: 100,
    });
    expect(merged).toHaveLength(1);
    expect(merged[0].skillScore).toBe(100);
    expect(merged[0].points).toBeGreaterThan(0);
  });

  it("maker add in one wallet, remove in another of the same identity → zero maker credit", () => {
    const wallets = [
      flow({ address: "0xc1", makerAddUsd: 10000 }),
      flow({ address: "0xc2", makerRemoveUsd: 10000 }),
    ];
    const merged = scoreWindow(mergeFlowsByIdentity(wallets, () => "id:carol"), {
      volumeTargetUsd: 1000,
      skillFloorPct: 100,
    });
    // No taker flow, no net maker → zero volume → zero points
    expect(merged).toHaveLength(0);
  });
});
