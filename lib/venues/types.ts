// ============================================================================
// lib/venues/types.ts — the multi-venue / multi-chain core abstraction.
//
// WalletFlow is imported UNCHANGED from lib/scoring.ts; everything downstream of
// it (mergeFlowsByIdentity → scoreWindow → persist → getLeaderboard) is untouched.
//
// STATUS: foundation only. This file defines the abstraction and ships the PURE,
// TESTED helpers used by every future adapter — normalizeAccount, isEvmAddress,
// isBase58Pubkey, tokenUsdFromRatio (the pinned base-unit→USD formula),
// readFrozenMark (the legacy-blob shim), and the collect() orchestrator. The
// `export declare function` entries (chilizDeployment, chilizPair,
// verifyOwnership, buildClaimMessage, persistVenueVolume) are TYPED CONTRACTS for
// the Phase-1 refactor — they are NOT implemented yet and must not be called
// until the adapters land. Nothing in the app imports this module yet, so the
// live scoring path is unaffected. See docs/multichain-venues.md for the plan.
// ============================================================================

import type { WalletFlow } from "../scoring";
import type { Abi, Chain, Log, PublicClient } from "viem";

// ----------------------------------------------------------------------------
// 0. Chain + account primitives
// ----------------------------------------------------------------------------

export type ChainKind = "evm" | "solana";
/** Extensible: add a member + a source file. */
export type ChainId = "chiliz" | "base" | "solana";

/** Stable source slug; also the flow_sources / venue_volume `source` column. */
export type SourceId = string; // "chiliz:univ2" | "base:aerodrome" | "solana:meteora" | "cex:binance"

/**
 * Normalized account key stored in WalletFlow.address / scores.address /
 * wallets.address. EVM → lowercase 0x hex; Solana → base58 VERBATIM (NEVER
 * lowercased — base58 is case-sensitive). The two alphabets can never collide,
 * so the bare string is a globally unique scoring key with NO namespace prefix.
 * A shared EOA across EVM chains yields the same key and auto-nets.
 */
export function normalizeAccount(chainKind: ChainKind, raw: string): string {
  return chainKind === "solana" ? raw : raw.toLowerCase();
}

/** Cheap format discriminator used at every identity/claim boundary. */
export function isEvmAddress(s: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(s);
}
export function isBase58Pubkey(s: string): boolean {
  // Solana pubkeys are 32-byte base58 → 43-44 chars, no 0/O/I/l.
  return /^[1-9A-HJ-NP-Za-km-z]{43,44}$/.test(s);
}

// ----------------------------------------------------------------------------
// 1. The two normalized records the pipeline consumes
// ----------------------------------------------------------------------------

/** Per-trader flow → SCORED. Superset of WalletFlow with dropped-at-merge tags. */
export interface VenueFlow extends WalletFlow {
  source: SourceId; // provenance → flow_sources audit table
  chain?: ChainId; // provenance only; scoring ignores it
}

/** Venue-aggregate volume → DISPLAY ONLY, never scored. Generalizes cex_volume. */
export interface VenueVolume {
  source: SourceId; // "cex:binance" | "solana:meteora" ...
  venue: string; // "binance" | "meteora"
  chain?: ChainId; // set for on-chain aggregate rows
  token: string; // league symbol (MENGO, PSG)
  inst: string; // exchange instrument OR pool address / DLMM ammKey
  quote: string; // EXPLICIT quote asset — never regex-parsed from `inst`
  quoteUsd: number; // window volume converted to USD
  trades: number; // 0 where the venue exposes no count
}

// ----------------------------------------------------------------------------
// 2. Window + frozen valuation
// ----------------------------------------------------------------------------

export interface ScanWindow {
  startMs: number; // window open (taker + maker start)
  endMs: number; // window close (taker cutoff)
  cooldownEndMs: number; // maker-clawback scan end (endMs + MAKER_COOLDOWN_S)
  nowMs: number; // for provisional-vs-final decisions
}

/**
 * Frozen close marks per match, keyed `${sourceId}:${pool}`. Stores BOTH the raw
 * price ratio (quote-base per token-base — survives reserves→sqrtPrice→DLMM-bin)
 * AND the quote→USD scalar used, so neither the pool nor the FX leg is re-read
 * after finalization.
 */
export interface FrozenMark {
  ratioQuotePerTokenBase: number;
  quoteUsd: number;
}
export type FrozenMarks = Record<string, FrozenMark>;

/** Legacy shape written by the pre-multichain indexer: bare pair key → number. */
export type LegacyFrozenPrices = Record<string, number>;

/**
 * Read-time shim: reproduce a mark for a source+pool from a frozen_prices blob
 * that may be EITHER the new namespaced/object shape OR the legacy
 * bare-key/scalar shape. This is what keeps already-finalized boards
 * byte-identical after the schema change (see architecture §7.3).
 *
 *  - legacy bare key  `${pool}`   → read as `chiliz:univ2:${pool}`
 *  - legacy scalar    `number`    → { ratioQuotePerTokenBase: number,
 *                                     quoteUsd: legacyChzUsd }   (WCHZ-per-token-wei)
 */
export function readFrozenMark(
  blob: FrozenMarks | LegacyFrozenPrices | null,
  sourceId: SourceId,
  pool: string,
  legacyChzUsd: number | null
): FrozenMark | null {
  if (!blob) return null;
  const nsKey = `${sourceId}:${pool}`;
  const anyBlob = blob as Record<string, unknown>;

  const coerce = (v: unknown): FrozenMark | null => {
    if (v == null) return null;
    if (typeof v === "number") {
      // Legacy scalar = WCHZ-per-token-wei; FX leg was the match-level chz_usd.
      if (legacyChzUsd == null) return null;
      return { ratioQuotePerTokenBase: v, quoteUsd: legacyChzUsd };
    }
    const o = v as Partial<FrozenMark>;
    return typeof o.ratioQuotePerTokenBase === "number" && typeof o.quoteUsd === "number"
      ? { ratioQuotePerTokenBase: o.ratioQuotePerTokenBase, quoteUsd: o.quoteUsd }
      : null;
  };

  // Prefer the namespaced key; fall back to the legacy bare pool key, but only
  // for the Chiliz UniV2 source (the only source that ever wrote legacy blobs).
  if (nsKey in anyBlob) return coerce(anyBlob[nsKey]);
  if (sourceId === "chiliz:univ2" && pool in anyBlob) return coerce(anyBlob[pool]);
  return null;
}

/**
 * Base-unit price ratio → token USD. The ONE pinned formula (architecture §1.5),
 * replacing the implicit hardcoded /1e18 in indexer.ts:323. Unit-tested per
 * decimal combo (18/18, 18/6, 9/6, 9/9).
 */
export function tokenUsdFromRatio(
  ratioQuotePerTokenBase: number,
  tokenDecimals: number,
  quoteDecimals: number,
  quoteUsd: number
): number {
  return ratioQuotePerTokenBase * 10 ** (tokenDecimals - quoteDecimals) * quoteUsd;
}

export interface HarvestContext {
  /** Non-null on a finalized rescore → reuse via readFrozenMark, never reprice. */
  frozen: FrozenMarks | LegacyFrozenPrices | null;
  /** Match-level frozen CHZ/USD, needed to interpret legacy scalar marks. */
  legacyChzUsd: number | null;
  /** Window fully closed for THIS source's finality clock → snapshot & freeze. */
  finalizing: boolean;
  /** WCHZ→CHZ/USD, WETH→ETH/USD, USDC/USDT→1, SOL→SOL/USD, TRY/EUR/BRL via FX.
   *  MUST be frozen per frozen-marks key at finalization. */
  quoteUsd(asset: string, window: ScanWindow): Promise<number | null>;
  log(level: "info" | "warn" | "error", msg: string, data?: unknown): void;
}

/**
 * Per-source harvest result. `finalizable` preserves indexer.ts's guard: a
 * TRANSIENT price-read failure with held inventory must not freeze a $0 mark
 * (finalizable=false); a DETERMINISTIC drained pool marks at $0 and stays
 * finalizable. This flag is now consumed PER SOURCE (architecture §6), never as
 * a global AND — so a lagging chain can't freeze another chain's payout.
 */
export interface FlowHarvest {
  flows: VenueFlow[];
  finalizable: boolean;
  marks: FrozenMarks; // close prices to persist into matches.frozen_prices (namespaced)
}

// ----------------------------------------------------------------------------
// 3. Collectors — granularity is the primary axis; presence = capability
// ----------------------------------------------------------------------------

export interface FlowCollector {
  id: SourceId;
  chain?: ChainId; // set for on-chain sources; undefined for keyed CEX
  finalityMarginS: number; // per-source head-lag margin (Chiliz 60, Base 30)
  /** Per-source timeout: after this many seconds past window close with no live
   *  data, the orchestrator books zero-contribution + an audit flag rather than
   *  blocking the whole match's finalization (architecture §6). */
  finalizeTimeoutS: number;
  /** Liveness gate (mint-exists ≠ tradable). Returns ONLY symbols attributable
   *  NOW (Jupiter route / reserves-slot0 liquidity / an API key present).
   *  Result is TTL-cached by the orchestrator (architecture §8). */
  supports(symbols: string[], window: ScanWindow): Promise<string[]>;
  harvest(symbols: string[], window: ScanWindow, ctx: HarvestContext): Promise<FlowHarvest>;
}

export interface VolumeCollector {
  id: SourceId;
  supports(symbols: string[], window: ScanWindow): Promise<string[]>;
  aggregate(symbols: string[], window: ScanWindow, ctx: HarvestContext): Promise<VenueVolume[]>;
}

/**
 * A venue may offer EITHER or BOTH. Presence of `.flow` is the capability
 * discriminator (more type-safe than a boolean). A CEX ships `.volume` and gains
 * `.flow` when a user adds a read-only key; Base ships `.volume` and gains
 * `.flow` when the ERC-4337 resolver lands; Solana ships `.volume` and gains
 * `.flow` only after a reconciliation proof — GRADUATION with no orchestrator
 * change.
 */
export interface Venue {
  id: SourceId;
  flow?: FlowCollector;
  volume?: VolumeCollector;
}

/** Flat registry — adding a venue is appending one import. */
export const SOURCES: Venue[] = [
  // Phase 1 — the current system expressed as three adapters, zero behavior change.
  { id: "chiliz:univ2", flow: undefined /* chilizUniV2 */ as unknown as FlowCollector },
  { id: "cex:binance", volume: undefined /* binanceVolume */ as unknown as VolumeCollector },
  { id: "cex:okx", volume: undefined /* okxVolume */ as unknown as VolumeCollector },
  // Phase 2 — { id: "base:aerodrome", volume: baseVolume /* → flow after 4337 resolver */ },
  // Phase 3 — { id: "solana:meteora", volume: meteoraVolume /* → flow after reconciliation */ },
];

// ----------------------------------------------------------------------------
// 4. The orchestrator — replaces the inline body of scoreMatchInner; tail unchanged
// ----------------------------------------------------------------------------

export interface CollectResult {
  flows: VenueFlow[];
  volume: VenueVolume[];
  marks: FrozenMarks;
  /** PER-SOURCE finality — NOT a global boolean. The persist layer freezes and
   *  pays each source when ITS clock says final; a lagging source finalizes
   *  later (rescore is idempotent). Sources that returned no live symbols are
   *  absent from this map and never gate finalization (architecture §6). */
  sourceFinal: Record<SourceId, boolean>;
}

/** TTL cache for supports() so provisional ticks don't storm external APIs. */
export interface SupportsCache {
  get(source: SourceId, symbol: string): boolean | undefined;
  set(source: SourceId, symbol: string, live: boolean): void;
}

export async function collect(
  sources: Venue[],
  symbols: string[],
  window: ScanWindow,
  ctx: HarvestContext,
  cache?: SupportsCache
): Promise<CollectResult> {
  const flows: VenueFlow[] = [];
  const volume: VenueVolume[] = [];
  const marks: FrozenMarks = {};
  const sourceFinal: Record<SourceId, boolean> = {};

  const liveOf = async (
    id: SourceId,
    collector: { supports(s: string[], w: ScanWindow): Promise<string[]> }
  ): Promise<string[]> => {
    if (!cache) return collector.supports(symbols, window);
    const known = symbols.filter((s) => cache.get(id, s) !== undefined);
    const unknown = symbols.filter((s) => cache.get(id, s) === undefined);
    let fresh: string[] = [];
    if (unknown.length) {
      fresh = await collector.supports(unknown, window);
      for (const s of unknown) cache.set(id, s, fresh.includes(s));
    }
    return [...known.filter((s) => cache.get(id, s) === true), ...fresh];
  };

  for (const v of sources) {
    if (v.flow) {
      const live = await liveOf(v.flow.id, v.flow);
      if (live.length) {
        const h = await v.flow.harvest(live, window, ctx);
        flows.push(...h.flows);
        Object.assign(marks, h.marks);
        sourceFinal[v.flow.id] = h.finalizable; // per-source, never a global AND
      }
    }
    if (v.volume) {
      const live = await liveOf(v.volume.id, v.volume);
      if (live.length) volume.push(...(await v.volume.aggregate(live, window, ctx)));
    }
  }
  return { flows, volume, marks, sourceFinal };
}

// scoreMatchInner tail (UNCHANGED scoring path):
//   const { flows, volume, marks, sourceFinal } = await collect(SOURCES, tokens, window, ctx, cache);
//   persistVenueVolume(db, match.id, volume);
//   // Freeze/pay Chiliz when Chiliz is final; late sources finalize on the next tick.
//   const chilizFinal = sourceFinal["chiliz:univ2"] ?? false;
//   if (window.nowMs >= window.cooldownEndMs && !chilizFinal) return { ok:false, reason:"chiliz price unavailable" };
//   const idOf = resolveIdentities(db, flows.map(f => f.address)); // never lowercases base58
//   const scores = scoreWindow(mergeFlowsByIdentity(flows, a => idOf.get(a) ?? a));

// ----------------------------------------------------------------------------
// 5. Per-chain client model + pure DEX protocol adapter (EVM)
// ----------------------------------------------------------------------------

export interface ChainConfig {
  id: ChainId;
  kind: ChainKind;
  chain?: Chain; // viem chain for EVM (chiliz | base); undefined for Solana
  rpcUrl: string;
  logChunkBlocks: number; // Chiliz 10_000; Base <=500 on public RPC (architecture §8)
  finalityMarginS: number; // Chiliz 60, Base 30
  /** Lowercase router / EntryPoint / bundler / aggregator addresses. On Base a
   *  hit here means "cannot attribute by tx.from" → route to display-only volume,
   *  NEVER credit the relayer as a trader (architecture §10 Phase 2b). */
  routerDenylist?: Set<string>;
  /** Paid-RPC requirement flag for docs/ops (Base/Solana flow scoring). */
  requiresPaidRpc?: boolean;
}

/** Pool math + decode, isolated from the collector. */
export interface PoolContext {
  pool: string;
  symbol: string;
  quoteIsToken0: boolean;
  tokenDecimals: number; // per-deployment (chiliz 18, base 18, solana 9)
  quoteDecimals: number; // per-pool (WCHZ/WETH 18, USDC 6, SOL 9)
}

/** Normalized decode output, base units. `kind` keeps the pipeline pool-shape-blind. */
export type PoolDelta =
  | { kind: "swap"; quoteInBase: bigint; quoteOutBase: bigint; tokenNetBase: bigint }
  | { kind: "add" | "remove"; quoteEquivBase: bigint } // v2: 2×quoteLeg; v3: quoteLeg+tokenLeg×price
  | null;

export interface DexProtocolAdapter {
  id: "univ2" | "univ3"; // aerodrome-basic aliases univ2; aerodrome-slipstream aliases univ3
  /** viem ABI fragment for this protocol's events. Aerodrome-basic Swap has a
   *  DIFFERENT topic0 than Chiliz UNIV2_ABI — do not reuse it verbatim. */
  events: Abi;
  decode(log: Log, ctx: PoolContext): PoolDelta;
  /**
   * Quote base per 1 token base (raw base-unit ratio; feed into tokenUsdFromRatio).
   * null on a drained/dead pool → mark held inventory $0. For CL/DLMM this MUST
   * be a liquidity-aware / time-weighted mark (TWAP or depth-capped), not raw
   * slot0 (architecture §5).
   */
  readPrice(client: PublicClient, ctx: PoolContext): Promise<number | null>;
  resolveContext(
    client: PublicClient,
    pool: string,
    symbol: string,
    quoteRef: string,
    tokenDecimals: number,
    quoteDecimals: number
  ): Promise<PoolContext>;
}

// ----------------------------------------------------------------------------
// 6. Multichain token model — replaces TOKENS + PAIR_OVERRIDES
// ----------------------------------------------------------------------------

export type Protocol =
  | "univ2" // Chiliz FanX/Kayen (today) + Aerodrome basic vAMM
  | "univ3" // generic Uniswap V3
  | "aerodrome-slipstream" // Base concentrated liquidity (sqrtPriceX96/tick)
  | "meteora-dlmm"; // Solana discrete-bin CL

export interface PoolRef {
  protocol: Protocol;
  pool: string; // 0x pair (EVM) | base58 pool pubkey (Solana)
  quote: string; // quote asset symbol — PER POOL (WCHZ | WETH | USDC | SOL)
  quoteRef: string; // quote token address / mint
  quoteDecimals: number; // 18 WCHZ/WETH, 6 USDC, 9 SOL
  feeTier?: number; // V3 fee tier / DLMM bin step
  verified: boolean; // liveness-checked; only verified pools are scored
  liveCheckedAt?: string;
}

export interface TokenDeployment {
  chain: ChainId;
  chainKind: ChainKind;
  address: string; // ERC20 0x | SPL mint base58
  decimals: number; // PER CHAIN: chiliz 18, base 18, solana 9 — never hardcode 1e18
  tokenProgram?: "spl" | "token-2022"; // Solana; token-2022 = transfer-fee/hook risk
  pools: PoolRef[]; // [] ⇒ mint exists but NOT tradable ⇒ skipped on this chain
}

export interface LeagueToken {
  symbol: string;
  name: string;
  deployments: TokenDeployment[];
}

export type TokenRegistry = Record<string, LeagueToken>;

// Back-compat accessors keep indexer.ts resolvePair() migrating without a rewrite.
// They read each token's `chiliz` deployment (protocol univ2, quote WCHZ, 18 dec).
export declare function chilizDeployment(symbol: string): TokenDeployment | null;
export declare function chilizPair(symbol: string): `0x${string}` | null; // == today's PAIR_OVERRIDES

// ----------------------------------------------------------------------------
// 7. Cross-chain identity + proof
// ----------------------------------------------------------------------------

/** wallets row: gains `chain` for proof provenance + which verifier to use. */
export interface WalletRow {
  address: string; // normalized (EVM lowercase | base58 verbatim)
  chain: ChainId; // NEW column, DEFAULT 'chiliz'
  handle: string | null;
  venue: string | null;
  status: "unclaimed" | "verified";
  identity_id: string | null; // primary address of the KYC identity; NULL = solo
  created_at: string;
}

/**
 * verifyOwnership branches on address FORMAT (see architecture §3.2). Every
 * boundary route (admin/identity, claims, claims/challenge) and buildClaimMessage
 * must branch the same way — the current hardcoded ADDRESS_RE + toLowerCase paths
 * reject/corrupt base58 and MUST be updated.
 *   0x…    → EVM personal_sign (viem verifyMessage / ERC-1271); chain bound in text
 *   base58 → Solana ed25519 (@noble/ed25519 or tweetnacl + bs58), NO lowercasing
 */
export declare function verifyOwnership(
  chain: ChainId,
  address: string,
  message: string,
  signature: string
): Promise<boolean>;

/** buildClaimMessage gains an explicit chain label; skips lowercasing for base58. */
export declare function buildClaimMessage(
  handle: string,
  address: string,
  nonce: string,
  chainLabel: string // "Chiliz (88888)" | "Base (8453)" | "Solana"
): string;

/** Read-only CEX key registered against an identity; fills emit VenueFlow{address:identityId}. */
export interface CexCredential {
  identityId: string;
  venue: string;
  cipher: Uint8Array; // AES-256-GCM ciphertext ONLY; master key OUTSIDE the DB
  scopeOk: boolean; // true only after READING the key-permissions endpoint showed
  //                   withdraw+trade DISABLED — NEVER a live withdraw/order probe
}

/** Per-account fill → the SPOT-only bridge into VenueFlow (Phase 5). */
export interface CexFill {
  venueTradeId: string; // idempotent dedupe key
  inst: string;
  side: "buy" | "sell";
  quoteUsd: number;
  baseQty: number;
  isMaker: boolean;
  ts: number;
}
export interface CexFillsAdapter {
  fetchFills(cred: CexCredential, insts: string[], startMs: number, endMs: number): Promise<CexFill[]>;
}

// ----------------------------------------------------------------------------
// 8. Persistence surface (all additive; scores/matches/payouts untouched)
// ----------------------------------------------------------------------------

export declare function persistVenueVolume(
  db: unknown,
  matchId: number,
  rows: VenueVolume[]
): void; // → venue_volume  PK (match_id, source, inst); `quote` explicit column

export interface FlowSourceRow {
  // NEW flow_sources — provenance/audit + per-source finalization ledger (§6).
  match_id: number;
  identity: string;
  source: SourceId;
  gross_buy_usd: number;
  gross_sell_usd: number;
  inventory_usd: number;
  swaps: number;
  finalized: 0 | 1; // whether THIS source's contribution is frozen
}

// ----------------------------------------------------------------------------
// 9. Solana collector marker (Phase 3b — a SEPARATE non-EVM module, no viem)
// ----------------------------------------------------------------------------
// Implements FlowCollector but harvests via getSignaturesForAddress(pool) +
// getTransaction({maxSupportedTransactionVersion:0, jsonParsed, commitment:'finalized'}),
// resolves Address Lookup Tables, attributes by pre/postTokenBalances OWNER delta
// (never feePayer/signer), filters program-owned vault PDAs + Jupiter intermediary
// legs, handles multiple owners per tx, windows by each tx's own blockTime, marks
// at a liquidity-aware DLMM close price (§5), taker-only (makerAddUsd = 0). Output
// is VenueFlow[] with address = base58 pubkey — slots into collect() unchanged.
//
// HARD GATE (architecture §10 Phase 3b): this collector may NOT be placed in
// SOURCES.flow on a payable board until a reconciliation test proves its summed
// per-owner volume matches an independent aggregate (Jupiter/Bitquery) within
// tolerance for a full window. Until then Solana is volume-only.
export type SolanaFlowCollector = FlowCollector & { chain: "solana" };