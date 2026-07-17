/**
 * On-chain constants for counting — Chiliz Chain (id 88888), FanX/Kayen
 * UniV2-style AMM (one deployment, two names). Verified live on-chain
 * 2026-07-17 at block 35,844,623 (factory() on live pairs, symbol()/decimals()
 * on every token, reserves + 24h swap counts per pair).
 *
 * CRITICAL context: around 2026-05-12 all DEX liquidity migrated from legacy
 * 0-decimal CAP-20 fan tokens to NEW 18-decimal DEX tokens paired with WCHZ on
 * the same factory. Every legacy pair now has zero reserves. The addresses
 * below are the migrated tokens that actually hold liquidity — most are NOT in
 * the FTI registry and were discovered by enumerating the factory's 440 pairs.
 *
 * Tokens with NO liquid pool as of verification (do not add without a fresh
 * check): SCCP, VERDAO, SPFC, VASCO, FLU, BAHIA, ITA, CITY, JUV.
 */

export const FACTORY = "0xE2918AA38088878546c1A18F2F9b1BC83297fdD3" as const;
export const WCHZ = "0x677F7e16C7Dd57be1D4C8aD1244883214953DC47" as const;

export const TOKENS: Record<string, { address: `0x${string}`; name: string }> = {
  SPAIN: { address: "0x7a224b67aaa360e48402aab4ff12d89eef9b4cf8", name: "Spain National Team" },
  ARG: { address: "0x4394886b1eec08fe88681462914702dc99d97eb7", name: "Argentina National Team" },
  BAR: { address: "0x1589248b4b61Ed472cC21ca1F2114D93aB6910d5", name: "FC Barcelona" },
  PSG: { address: "0xfe1d4a935df7a4a52f835f6104c97af9d72217f2", name: "Paris Saint-Germain" },
  GALO: { address: "0x558cc7ac99793b10c1c142a1c7e5adf6657dea9c", name: "Atlético Mineiro" },
  MENGO: { address: "0xbff8fabb04f6494fe393eb7416a698869569a310", name: "Flamengo" },
  GAL: { address: "0x770da1e5ddb22f3ccc2482493bd9b10a7a8a38ae", name: "Galatasaray" },
  TRA: { address: "0xeff432433dd57adfa37004af00db148f9407e7bd", name: "Trabzonspor" },
  POR: { address: "0x013f2407c6ef765f1199f8818b805121f269f5b8", name: "FC Porto" },
};

/**
 * WCHZ pools verified on-chain (reserves > 750k WCHZ each at verification).
 * Pinning them skips factory.getPair at runtime and guards against ever
 * counting a drained legacy pool by mistake.
 */
export const PAIR_OVERRIDES: Record<string, `0x${string}`> = {
  SPAIN: "0x8572e4364de72134ab1d65260a50052595093075",
  ARG: "0x4e933d29f126f773c5888bc2efd217b840e67288",
  BAR: "0x142a7c3019314f607889611f4ff1bf52f2706ba1",
  PSG: "0x4c2fae616d27aa5d260b32cf23696bcbabda028e",
  GALO: "0x0617fec42702a5a25522dcd7dab4b31e5558f051",
  MENGO: "0x12f489d2ccb96f0f029bdd7a6ff852a4e112a5c5",
  GAL: "0x23cf1094f6404861fe67cea6d381db052f40cab6",
  TRA: "0xebbc1494a40330f1c753eaad17c6d7d7c8ecc692",
  POR: "0x37f334ee472332a52c527412d760abf63bdda3d9",
};

/**
 * eth_getLogs chunk size. rpc.chiliz.com handles 30k-block address-filtered
 * queries; 10k keeps responses comfortably small (~3.3k blocks/hour on 3s
 * blocks). Ankr fallback would need <=1000.
 */
export const LOG_CHUNK_BLOCKS = Number(process.env.LOG_CHUNK_BLOCKS ?? 10_000);
