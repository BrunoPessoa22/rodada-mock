import { describe, expect, it } from "vitest";
import {
  isBase58Pubkey,
  isEvmAddress,
  normalizeAccount,
  readFrozenMark,
  tokenUsdFromRatio,
  type FrozenMarks,
} from "./types";

describe("normalizeAccount — EVM lowercased, Solana verbatim", () => {
  it("lowercases EVM addresses so a reused EOA nets across chains", () => {
    expect(normalizeAccount("evm", "0xAbCdEF0000000000000000000000000000000001")).toBe(
      "0xabcdef0000000000000000000000000000000001"
    );
  });
  it("never lowercases a base58 Solana pubkey (case-sensitive)", () => {
    const mixed = "BX8VbHBf8DUHeGJjJsSW2HCviGyQSF5SVCEnN7vXUkwM";
    expect(normalizeAccount("solana", mixed)).toBe(mixed);
  });
});

describe("address format discriminators are disjoint", () => {
  it("classifies EVM vs base58 without overlap", () => {
    const evm = "0xabcdef0000000000000000000000000000000001";
    const sol = "BX8VbHBf8DUHeGJjJsSW2HCviGyQSF5SVCEnN7vXUkwM";
    expect(isEvmAddress(evm)).toBe(true);
    expect(isBase58Pubkey(evm)).toBe(false);
    expect(isBase58Pubkey(sol)).toBe(true);
    expect(isEvmAddress(sol)).toBe(false);
  });
});

describe("tokenUsdFromRatio — the pinned base-unit→USD formula (§1.5)", () => {
  // ratio = quote-base per 1 token-base. Reproduce today's Chiliz case and the
  // multichain decimal combos that the hardcoded /1e18 would silently break.
  it("18/18 (Chiliz WCHZ) matches the legacy /1e18 path", () => {
    // Legacy: (wei/1e18)*chzUsd for 1 token = ratio(=price in quote-wei per token-wei)
    // Here a token priced at 2 WCHZ: ratio 2 (18/18 → 10^0), chzUsd 0.08 → $0.16.
    expect(tokenUsdFromRatio(2, 18, 18, 0.08)).toBeCloseTo(0.16, 12);
  });
  it("18/6 (token 18-dec, USDC 6-dec quote) folds the 10^12 gap", () => {
    // A token worth 1 USDC: 1 USDC-base(1e6) per 1 token-base(1e18) = ratio 1e-12.
    // 1e-12 × 10^(18−6) × 1 = 1.00 USD.
    expect(tokenUsdFromRatio(1e-12, 18, 6, 1)).toBeCloseTo(1, 9);
  });
  it("9/6 (Solana 9-dec mint, USDC 6-dec) folds 10^3", () => {
    // Token worth 1 USDC: 1e6 USDC-base per 1e9 token-base = ratio 1e-3.
    // 1e-3 × 10^(9−6) × 1 = 1.00 USD. A hardcoded /1e18 would be off by 1e9.
    expect(tokenUsdFromRatio(1e-3, 9, 6, 1)).toBeCloseTo(1, 9);
  });
  it("9/9 (Solana mint quoted in wSOL 9-dec) applies the SOL/USD leg", () => {
    // Token worth 0.01 SOL: ratio 0.01 (9/9 → 10^0), SOL/USD 150 → $1.50.
    expect(tokenUsdFromRatio(0.01, 9, 9, 150)).toBeCloseTo(1.5, 9);
  });
});

describe("readFrozenMark — legacy blob shim keeps finalized boards reproducible (§7.3)", () => {
  const CHILIZ = "chiliz:univ2";
  const POOL = "0x142a7c3019314f607889611f4ff1bf52f2706ba1";

  it("reads the new namespaced object shape", () => {
    const blob: FrozenMarks = { [`${CHILIZ}:${POOL}`]: { ratioQuotePerTokenBase: 2, quoteUsd: 0.08 } };
    expect(readFrozenMark(blob, CHILIZ, POOL, null)).toEqual({ ratioQuotePerTokenBase: 2, quoteUsd: 0.08 });
  });

  it("reads a legacy bare-key scalar as WCHZ-per-token-wei with the match chz_usd", () => {
    const legacy = { [POOL]: 4.2e-9 }; // pre-migration shape: bare pool key → number
    expect(readFrozenMark(legacy, CHILIZ, POOL, 0.08)).toEqual({
      ratioQuotePerTokenBase: 4.2e-9,
      quoteUsd: 0.08,
    });
  });

  it("refuses a legacy scalar when the match chz_usd is missing (can't fabricate FX)", () => {
    expect(readFrozenMark({ [POOL]: 4.2e-9 }, CHILIZ, POOL, null)).toBeNull();
  });

  it("only applies the bare-key fallback for the Chiliz UniV2 source", () => {
    const legacy = { [POOL]: 4.2e-9 };
    expect(readFrozenMark(legacy, "base:aerodrome", POOL, 0.08)).toBeNull();
  });

  it("returns null for a missing pool or null blob", () => {
    expect(readFrozenMark(null, CHILIZ, POOL, 0.08)).toBeNull();
    expect(readFrozenMark({}, CHILIZ, POOL, 0.08)).toBeNull();
  });
});
