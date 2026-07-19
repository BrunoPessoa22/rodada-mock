import { describe, expect, it } from "vitest";
import { mergeFlowsByIdentity, scoreWallet, scoreWindow, type WalletFlow } from "./scoring";

const flow = (partial: Partial<WalletFlow>): WalletFlow => ({
  address: "0xabc",
  grossBuyUsd: 0,
  grossSellUsd: 0,
  makerAddUsd: 0,
  makerRemoveUsd: 0,
  swaps: 1,
  ...partial,
});

describe("scoreWallet", () => {
  it("scores net buying with a square root", () => {
    const s = scoreWallet(flow({ grossBuyUsd: 10000 }), { featured: false });
    expect(s.points).toBe(100);
    expect(s.netTakerUsd).toBe(10000);
  });

  it("wash volume scores zero — round trips cancel", () => {
    const s = scoreWallet(flow({ grossBuyUsd: 50000, grossSellUsd: 50000, swaps: 40 }), {
      featured: false,
    });
    expect(s.points).toBe(0);
  });

  it("net selling scores the same as net buying of equal size", () => {
    const buy = scoreWallet(flow({ grossBuyUsd: 2500 }), { featured: false });
    const sell = scoreWallet(flow({ grossSellUsd: 2500 }), { featured: false });
    expect(sell.points).toBe(buy.points);
    expect(sell.netTakerUsd).toBe(-2500);
  });

  it("featured matches double points", () => {
    const s = scoreWallet(flow({ grossBuyUsd: 100 }), { featured: true });
    expect(s.points).toBe(20);
  });

  it("liquidity provision earns 2× the taker rate on net adds", () => {
    const maker = scoreWallet(flow({ makerAddUsd: 10000 }), { featured: false });
    expect(maker.points).toBe(200);
  });

  it("add-then-remove liquidity nets to zero maker points", () => {
    const s = scoreWallet(flow({ makerAddUsd: 8000, makerRemoveUsd: 8000 }), { featured: false });
    expect(s.points).toBe(0);
  });

  it("removing more liquidity than added floors at zero, never negative", () => {
    const s = scoreWallet(flow({ makerAddUsd: 100, makerRemoveUsd: 900 }), { featured: false });
    expect(s.makerNetAddUsd).toBe(0);
    expect(s.points).toBe(0);
  });

  it("mixed taker + maker wallets earn both components, featured applies to both", () => {
    const s = scoreWallet(
      flow({ grossBuyUsd: 400, makerAddUsd: 900 }),
      { featured: true }
    );
    // (√400 + 2·√900) × 2 = (20 + 60) × 2
    expect(s.points).toBe(160);
  });

  it("the v1 exploit is dead: $10k churned wash scores below $100 net", () => {
    const wash = scoreWallet(flow({ grossBuyUsd: 5000, grossSellUsd: 5000 }), { featured: false });
    const honest = scoreWallet(flow({ grossBuyUsd: 100 }), { featured: false });
    expect(wash.points).toBeLessThan(honest.points);
  });
});

describe("scoreWindow", () => {
  it("drops zero-point wallets and sorts descending", () => {
    const scores = scoreWindow(
      [
        flow({ address: "0x1", grossBuyUsd: 100 }),
        flow({ address: "0x2", grossBuyUsd: 900 }),
        flow({ address: "0x3", grossBuyUsd: 400, grossSellUsd: 400 }),
      ],
      { featured: false }
    );
    expect(scores.map((s) => s.address)).toEqual(["0x2", "0x1"]);
  });
});

describe("mergeFlowsByIdentity — the √n sybil kill", () => {
  it("splitting one flow across N self-owned wallets scores like one wallet", () => {
    // One identity owns four wallets, each net-buying $2,500.
    const wallets = [
      flow({ address: "0xa1", grossBuyUsd: 2500 }),
      flow({ address: "0xa2", grossBuyUsd: 2500 }),
      flow({ address: "0xa3", grossBuyUsd: 2500 }),
      flow({ address: "0xa4", grossBuyUsd: 2500 }),
    ];
    const owner: Record<string, string> = {
      "0xa1": "id:alice", "0xa2": "id:alice", "0xa3": "id:alice", "0xa4": "id:alice",
    };

    // Per-wallet scoring pays the concavity bonus: 4 × √2500 = 200.
    const split = scoreWindow(wallets, { featured: false });
    expect(split.reduce((s, w) => s + w.points, 0)).toBe(200);

    // Per-identity scoring nets first: √10000 = 100. Bonus gone.
    const merged = scoreWindow(
      mergeFlowsByIdentity(wallets, (a) => owner[a] ?? a),
      { featured: false }
    );
    expect(merged).toHaveLength(1);
    expect(merged[0].address).toBe("id:alice");
    expect(merged[0].points).toBe(100);
    // Identical to one honest wallet trading the full size — no split advantage.
    expect(merged[0].points).toBe(scoreWallet(flow({ grossBuyUsd: 10000 }), { featured: false }).points);
  });

  it("ungrouped wallets pass through unchanged (identity = self)", () => {
    const wallets = [flow({ address: "0x1", grossBuyUsd: 900 }), flow({ address: "0x2", grossBuyUsd: 100 })];
    const merged = scoreWindow(mergeFlowsByIdentity(wallets, (a) => a), { featured: false });
    expect(merged.map((w) => [w.address, w.points])).toEqual([["0x1", 30], ["0x2", 10]]);
  });

  it("buy+sell split across an identity's own wallets nets toward zero once merged", () => {
    const wallets = [
      flow({ address: "0xb1", grossBuyUsd: 5000 }),
      flow({ address: "0xb2", grossSellUsd: 5000 }),
    ];
    const merged = scoreWindow(mergeFlowsByIdentity(wallets, () => "id:bob"), { featured: false });
    expect(merged).toHaveLength(0);
  });

  it("maker add in one wallet, remove in another of the same identity → zero maker credit", () => {
    // Mirrors the anti-JIT clawback at the scoring level: add and later remove
    // net inside the identity before max(0, add − remove).
    const wallets = [
      flow({ address: "0xc1", makerAddUsd: 10000 }),
      flow({ address: "0xc2", makerRemoveUsd: 10000 }),
    ];
    const merged = scoreWindow(mergeFlowsByIdentity(wallets, () => "id:carol"), { featured: false });
    expect(merged).toHaveLength(0);
  });
});
