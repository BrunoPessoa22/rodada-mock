import { describe, expect, it } from "vitest";
import { scoreWallet, scoreWindow, type WalletFlow } from "./scoring";

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
