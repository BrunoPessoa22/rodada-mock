# Trading League — Multi-Venue / Multi-Chain Scoring Architecture (FINAL)

## 0. The one load-bearing insight

`WalletFlow` (`lib/scoring.ts:43`) is already a **venue-agnostic, USD-denominated
contract**, and *everything downstream of it* — `mergeFlowsByIdentity` →
`scoreWindow` → persist → `getLeaderboard` — is chain-blind and must not change.
The multichain problem therefore reduces to two jobs:

1. Turn every data surface into an **adapter** emitting one of exactly two
   normalized records: a per-trader **`WalletFlow`** (attributable → **scored**),
   or a venue-aggregate **`VenueVolume`** (no per-account data → **display only,
   never scored**).
2. Make the flow-production layer — today the inline Chiliz loop
   (`indexer.ts:206-346`) and the CEX loop (`cex.ts`) — a **registry of adapters**
   behind a thin orchestrator, leaving the identity/scoring/persist tail
   byte-identical.

Chiliz-UniV2 and Binance/OKX-CEX become the **first three adapters** with zero
behavior change. Base, Solana and every new CEX are then *additive*.

**But three facts from the codebase force the design past a naive "just add
adapters" plan, and they are the spine of this revision:**

- **`tx.from` attribution is a Chiliz-specific accident, not a portable
  primitive.** It works today only because Chiliz retail are plain EOAs
  (`indexer.ts:113`). On Base the dominant wallet is the Coinbase Smart Wallet
  (ERC-4337): `tx.from` is a bundler, `Swap.sender`/`to` is a router. So EVM
  flow attribution is **not** parameterizable across chains — Base ships
  volume-only and *graduates* to scored flow only behind a 4337-aware resolver.
- **Partial per-trader coverage on a paid board is worse than none.** A trader
  the parser misses is silently scored 0 and *underpaid*. This makes Solana
  per-trader scoring gated on a **reconciliation proof**, not on effort budget.
- **`finalizable` is currently a single-chain finality gate** (`indexer.ts:155-160`).
  A global `AND` across chains would let the slowest, flakiest RPC freeze
  Chiliz winners' payouts. Finalization must be **per-source**.

This synthesis keeps the **in-memory `WalletFlow[]` production path for v1**
(the event store is an optional later evolution, §11), so step one is boilable
now instead of a multi-phase store migration.

---

## 1. Core abstraction

### 1.1 Two normalized records — the only things the pipeline consumes

- **`WalletFlow`** — unchanged. Its `address` is the **normalized account key**:
  lowercase `0x` for EVM, **base58 verbatim** for Solana (never lowercased), the
  identity-root address for a keyed CEX account.
- **`VenueVolume`** — generalizes today's `cex_volume` row to *any* venue/chain.
  Carries an **explicit `quote` field**, killing the brittle `USDT/USDC/TRY`
  regex in `cex.ts:172`.

`VenueFlow` = `WalletFlow` + `{ source, chain? }` provenance tags dropped at merge.

### 1.2 The collector layer — granularity is the primary axis

```
Venue
 ├─ flow?:   FlowCollector    → VenueFlow[]   → SCORED
 └─ volume?: VolumeCollector  → VenueVolume[] → DISPLAY ONLY
```

A `Venue` holds **optional** `.flow` and `.volume` collectors. Presence of
`.flow` *is* the capability discriminator (compile-time, not a boolean). The
scoring path consumes **only** `VenueFlow[]`; `VenueVolume[]` goes to a different
table and structurally cannot reach the scorer.

**Graduation is first-class:** a CEX ships `.volume` (public candles, today's
behavior) and gains `.flow` when a user registers a read-only API key. Base
ships `.volume` and gains `.flow` when the 4337 resolver lands. Solana ships
`.volume` and gains `.flow` only after a reconciliation proof. No orchestrator
change any time.

### 1.3 Per-chain client model

- A **`ChainConfig` registry** replaces the single `getClient()` singleton in
  `chain.ts`. Each EVM chain memoizes its own viem `PublicClient`, quote asset +
  a `quoteUsd()` source, `logChunkBlocks` (Chiliz 10k; Base **≤500** on public
  RPC — see §8), `finalityMarginS`, and a `routerDenylist`.
- `findBlockByTimestamp` is parametrized to take a `client` (drop the singleton
  on `chain.ts:35`).
- **EVM collectors** share a generic scan loop; only pool math differs, via a
  pure `DexProtocolAdapter`.
- **Solana is a genuinely separate non-EVM module** — no viem, no `tx.from`.

### 1.4 The `DexProtocolAdapter` (pure decode, no I/O)

- `univ2`: decode `Swap(amount0In,…,to)` unsigned, direction by nonzero leg;
  `Mint/Burn` → `2×quoteLeg` (the full-range 50/50 heuristic stays inside the v2
  adapter, exactly `indexer.ts:284-288`); `readPrice` = `getReserves()`
  `reserveQuote/reserveToken`, returns `null` on 0 token reserves (drained pool →
  mark held inventory at $0, don't block finalization — matches
  `indexer.ts:305-312`).
- `univ3`/aerodrome-slipstream: `Swap(int256 amount0, int256 amount1,
  uint160 sqrtPriceX96,…)` — **signed, pool-POV** (positive = into pool = trader
  sold it). `readPrice` from `slot0().sqrtPriceX96`, NOT `getReserves` (reverts on
  a CL pool). Aerodrome-basic `Swap` has a **different topic0** than the Chiliz
  `UNIV2_ABI` — its own ABI entry, do not reuse `chain.ts` UNIV2_ABI verbatim.
- Maker on CL/DLMM is asymmetric (per-tick / per-bin), so **non-Chiliz collectors
  launch taker-only** (`makerAddUsd = 0`) — an honest, documented under-credit.

### 1.5 The base-unit → USD formula (pinned, was implicit and wrong for multichain)

Today `toUsd = (wei) => Number(wei)/1e18 * chzUsd` (`indexer.ts:323`) hardcodes
18 decimals and a single CHZ numeraire. The general rule, pinned in the adapter
with a unit test per decimal combo (18/18, 18/6, 9/6, 9/9):

```
tokenUsd(ratioQuotePerTokenBase, tokenDecimals, quoteDecimals, quoteUsd) =
    ratioQuotePerTokenBase
    × 10^(tokenDecimals − quoteDecimals)   // fold out the base-unit decimal gap
    × quoteUsd(quoteAsset)                 // FX leg, frozen at finalization
```

`readPrice` returns the raw base-unit ratio (quote-base per 1 token-base);
getting the exponent wrong silently mis-marks a 9-dec Solana / 6-dec USDC pool
by 10^3. `quoteUsd(asset)` (WCHZ→CHZ/USD, WETH→ETH/USD, USDC/USDT→1, SOL→SOL/USD,
TRY/EUR/BRL via FX) is **frozen per frozen-marks key at finalization**, exactly
as `chz_usd` is today (`indexer.ts:166-178`), so a rescore never reprices the FX
leg.

### 1.6 The orchestrator (replaces the body of `scoreMatchInner`)

```
collect(SOURCES, symbols, window, ctx):
  flows=[]; volume=[]; sourceMarks={}; sourceFinal={}
  for v in SOURCES:
    if v.flow:
      live = supportsCached(v.flow, symbols, window)      // TTL-cached, §8
      if live.length:
        h = v.flow.harvest(live, window, ctx)
        flows.push(h.flows); Object.assign(sourceMarks, h.marks)
        sourceFinal[v.flow.id] = h.finalizable             // PER-SOURCE, not global
    if v.volume:
      live = supportsCached(v.volume, symbols, window)
      if live.length: volume.push(...v.volume.aggregate(live, window, ctx))
  return { flows, volume, marks: sourceMarks, sourceFinal }
```

`scoreMatchInner`'s tail is otherwise unchanged: `persistVenueVolume(volume)` →
`resolveIdentities(flows.map(f=>f.address))` →
`scoreWindow(mergeFlowsByIdentity(flows, …))` → persist.

**`sourceFinal` is a per-source map, not a global boolean** — see §6.

---

## 2. Multichain token model

`TOKENS` + `PAIR_OVERRIDES` (Chiliz-only, implicit 18-dec, implicit WCHZ quote)
become a per-chain deployment tree:

```
LeagueToken(symbol,name)
 └─ deployments: TokenDeployment[]     // one per chain
     ├─ chain, chainKind, address, decimals   // chiliz 18, base 18, solana 9
     ├─ tokenProgram?                          // Solana: 'spl' | 'token-2022'
     └─ pools: PoolRef[]                        // [] ⇒ mint exists but NOT tradable
          ├─ protocol, pool, feeTier?
          ├─ quote, quoteRef, quoteDecimals     // PER-POOL: WCHZ/WETH 18, USDC 6, SOL 9
          └─ verified, liveCheckedAt            // liveness gate result
```

Two invariants the current code violates and this fixes:

- **Decimals are per-deployment.** The hardcoded `/1e18` overstates a 9-dec
  Solana mark by 1e9. All base-unit→USD math reads `deployment.decimals` /
  `pool.quoteDecimals`.
- **Quote asset + its USD source are per-pool.** PSG/Base is USDC-quoted
  (`/1e6`); other Base pools are WETH-quoted (×ETH/USD); Solana pools quote USDC
  or wSOL. There is no single WCHZ-style numeraire.

**`verified` encodes mint-exists ≠ tradable.** The canonical registry
(`docs.chiliz.com/quick-start/token-contract-addresses.md`) lists ~85 tokens
across all three chains, but a deployment enters `pools[]` only after a **live
check**: a Jupiter `/quote` returning a route (Solana), or `getReserves`/`slot0`
showing liquidity (EVM). At last review Solana depth is thin — only **PSG**
(~$4.5k) and marginally **ARG** (~$180) route; BAR/GAL/GALO/MENGO/TRA have mints
but no pool; BAR/Base is confirmed empty. `FlowCollector.supports()` re-runs the
gate per match (TTL-cached), mirroring the existing `tokens.ts` dead-pool
discipline.

**tokens.ts evolution:** the existing `TOKENS`/`PAIR_OVERRIDES` map straight to
each token's `chiliz` deployment (`protocol:'univ2'`, quote WCHZ, decimals 18)
*verbatim*. Back-compat accessors `chilizDeployment(symbol)` / `chilizPair(symbol)`
read that deployment so `indexer.ts`'s `resolvePair()` migrates mechanically and
the existing `settings.pair_<symbol>` cache still works.

---

## 3. Cross-chain identity

### 3.1 The merge key is the normalized address — scoring is untouched

`mergeFlowsByIdentity` already collapses many→one on an opaque string, and
`resolveIdentities` already runs a format-agnostic `address IN (…)` query. The
scoring key is the normalized account string, **globally self-discriminating**:
EVM lowercase-`0x`-hex and Solana base58 occupy disjoint alphabets, so **no
namespace prefix is needed**.

- A **reused EVM EOA** is the *same* lowercase `0x` on Chiliz *and* Base → it
  auto-nets with zero admin link.
- A **distinct** Base EOA or a **Solana** pubkey is linked to the identity via
  the identity endpoint.
- A **keyed CEX account** carries an `identity_id` directly; its fills emit
  `WalletFlow{ address: identityId, … }` and merge natively.

`resolveIdentities` gains **one guard**: never lowercase a Solana row.

### 3.2 The boundary routes DO need work — the critique is correct

The claim "exactly like adding a second Chiliz wallet today" was **wrong**. All
three boundary routes hardcode `ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/` and
`toLowerCase()`:
`app/api/admin/identity/route.ts:6,30,38-39`,
`app/api/claims/route.ts` and `app/api/claims/challenge/route.ts:8,20,28`.
`lib/claims.ts:20` hardcodes `address.toLowerCase()` and `Chain: Chiliz (88888)`.
A base58 pubkey is rejected at validation and corrupted by `toLowerCase()`.

**Resolution — branch by address FORMAT at every boundary:**
- `0x…` → lowercase; verify EVM `personal_sign` (viem `verifyMessage` /
  ERC-1271), with the **specific chain bound in the message text**
  (`Chain: Base (8453)`). `personal_sign` is chain-agnostic at the crypto layer,
  so one path covers Chiliz *and* Base.
- base58 → verify as an ed25519 pubkey; store **verbatim**, never lowercase.
  Add a sibling Solana claim path: the wallet's `signMessage` (Phantom/Solflare)
  returns a 64-byte sig over the UTF-8 message bytes, verified with
  `@noble/ed25519` (or `tweetnacl`) + `bs58` against the base58 pubkey — **not**
  viem. `buildClaimMessage` takes an explicit `chainLabel` and skips lowercasing
  for base58.

Audit **every** `toLowerCase` in the identity/claim path as part of this work.
Sybil defense is unchanged: only KYC-verified identities are payable
(`getLeaderboard.payablePoints`, `queries.ts:164`).

### 3.3 KYC dedup is the load-bearing anti-sybil control — state it plainly

The sharper reason cross-chain identity matters is **not** wash trading, it is
the **concave volume unlock**: `Points = maxPnL% × (1 − e^{−V/Vt})`
(`scoring.ts:85-129`). Splitting one winning strategy across unlinked wallets
yields `2·f(V/2) > f(V)` near saturation — each unlinked wallet gets a fresh
unlock. Linking is manual (`/api/admin/identity`); the only structural backstop
is that `payablePoints` counts verified identities only. **Therefore KYC identity
dedup — not address linking — is the real sybil boundary, and it must be enforced
at KYC time across ALL chains: one human → one identity regardless of how many
Chiliz/Base/Solana wallets they hold.** Recommended hardening: require every
payable wallet to be explicitly linked before its points count, rather than
defaulting unlinked wallets to independent solo identities.

`shortAddress` (`queries.ts:34`) works for base58 as-is, but the board should
show a chain glyph next to unverified base58 rows so a Solana address isn't
mistaken for a malformed `0x`.

---

## 4. Cross-chain wash & self-impact — the honest statement

The draft's "sell bridged tokens looks like profit on Chiliz alone" claim is
**largely already neutralized** by the current model: selling un-bought inventory
drives `tokenNet` negative, so `inventoryMarkUsd` is negative
(`indexer.ts:280-281,324-331`) and PnL nets ~0. The **real residual holes** are:

1. **Concave-unlock sybil across unlinked cross-chain wallets** (§3.3) — closed
   only by KYC dedup, not by address math.
2. **Self-impact-on-exit:** source tokens off-Chiliz (not counted), dump them on
   Chiliz; if the average fill sits above the frozen close mark, the trader books
   positive scored PnL. **This vector is OPEN during the phased rollout while
   Base/Solana are display-only, and closes only when the source chain's
   `grossBuy` is also scored and netted per identity.**

Mitigations, required not aspirational (see §5):
- Until every chain with a live bridgeable pool is **scored-and-netted**, either
  cap/discount a trader's inventory MTM against their own price impact, **or**
  gate scoring of a symbol on that symbol **not** having a large un-integrated
  off-chain liquidity source.
- Chiliz's deep pools (≥750k WCHZ per pair, `tokens.ts:33`) **bound** the damage
  but do not eliminate it.

---

## 5. Close-mark manipulation on thin/CL pools — a required spec, not a footnote

Chiliz uses deep-reserve `getReserves` (`indexer.ts:298-306`), robust because the
pools are deep. Off-Chiliz this breaks:
- Base univ3 `slot0.sqrtPriceX96` is an **instantaneous** price a single
  end-of-window swap can set, and concentrated liquidity means a large held
  inventory **cannot actually be liquidated at slot0** — MTM overstates
  realizable value. Meteora DLMM active-bin price has the same defect.
- On thin pools (PSG/Solana ~$4.5k, ARG ~$180) a $50 trade sets the mark that
  values everyone's inventory.

**Required part of the Base/Solana `FlowCollector` spec (blocks their `.flow`
graduation):**
- Mark inventory with a **liquidity-aware or time-weighted** close price: a TWAP
  over the last N minutes, or a **depth-capped** mark
  `min(slot0, price achievable selling the held size into current liquidity)`.
- **Cap a single identity's inventory contribution** relative to pool depth.

Deep Chiliz pools never needed this; thin CL/DLMM pools require it before any
payout depends on them.

---

## 6. Per-source finalization — decoupling payout from the slowest chain

Today Chiliz is the single finality dependency (`indexer.ts:155-160`:
`FINALITY_MARGIN` + `windowClosed`). A global `finalizable &&= h.finalizable`
would let a lagging/erroring Base or Solana RPC freeze the **entire** match —
starving Chiliz winners of settlement.

**Resolution — finalize per source:**
- `collect()` returns `sourceFinal: Record<SourceId, boolean>` (see §1.6), and
  each source carries its own finality clock (`finalityMarginS`).
- A source that returns **no live symbols** from `supports()` does **not**
  participate in any finalization gate.
- Freeze and pay the Chiliz portion when **Chiliz** is final; a lagging source's
  contribution finalizes later — re-score is idempotent, so a late Base/Solana
  freeze simply re-runs and adds its rows.
- Add a **per-source timeout**: after it elapses a missing chain is booked as a
  **zero-contribution with an explicit audit flag** (`flow_sources` row +
  `index_log` warn) rather than blocking forever.
- The existing Chiliz guard ("refuse to freeze $0 marks from a failed reserve
  read", `indexer.ts:351-366`) is preserved **per source**: it now blocks only
  *that* source's freeze, not the whole match.

This is the change that makes multichain **operationally safe** — without it the
league's payout SLA is hostage to the flakiest RPC in the registry.

---

## 7. sqlite schema changes

All additive via the existing `migrate()` pattern (`db.ts:129`). **`scores`,
`matches` core columns, and `payouts` are untouched**, so every existing board
and payout is byte-stable.

1. **`wallets.chain`** — `ALTER TABLE wallets ADD COLUMN chain TEXT NOT NULL
   DEFAULT 'chiliz'`. Proof provenance / which verifier to use; not a partition
   key.

2. **`cex_volume` → `venue_volume`.** The current PK `(match_id, inst)` is a
   **latent** collision, not an active one: Binance uses concatenated
   `MENGOUSDT`, OKX uses hyphenated `MENGO-USDT` (`cex.ts:22-29`), so today's two
   venues never collide. It becomes real the instant a second concatenated-format
   venue (Bitget `MENGOUSDT`) lands. sqlite can't `ALTER` a PK, so rebuild under a
   settings-flag guard (`schema_venue_volume_v2`):
   `CREATE TABLE venue_volume(match_id, source, venue, token, inst, quote TEXT
   NOT NULL, chain TEXT, quote_usd REAL, trades INTEGER, updated_at,
   PRIMARY KEY (match_id, source, inst))`; `INSERT … SELECT` from `cex_volume`
   with `source='cex:'||venue`; `DROP`; `RENAME`. Keep a `cex_volume` **VIEW** so
   `getCexVolume` (`queries.ts:74`) keeps working unchanged. Aggregate DEX rows
   (Solana/Base display-only) write here too (`source='solana:meteora'`).
   `cex_volume` is fully recomputable from public candles → low-risk. **Sequence
   this before Phase 4, not as an emergency.**

3. **`matches.frozen_prices` — namespaced keys AND a value shim (this is a
   correctness fix, the draft missed the value shape).** Today the column is
   `Record<pairAddress, number>` where `number` = **WCHZ-per-token-wei**
   (`indexer.ts:230-236`, `db.ts:137`). The new shape keys to `${source}:${pool}`
   and stores `{ ratioQuotePerTokenBase, quoteUsd }`. A rescore of a
   pre-migration finalized match would otherwise read `{pair: 4.2e-9}`,
   mis-destructure the object, mark held inventory at $0, and **re-finalize a
   different payout**. **Read-time shim (both dimensions):**
   - legacy **bare key** `${pool}` → read as `chiliz:univ2:${pool}`;
   - legacy **scalar value** `number` → interpret as
     `{ ratioQuotePerTokenBase: number, quoteUsd: match.chz_usd }`.
   Cover both with a fixture from a real pre-migration finalized match asserting
   **byte-identical points** before flipping the schema flag. `matches.chz_usd`
   stays as the frozen `quote:WCHZ` USD rate for Chiliz back-compat and is
   reconciled with per-key `quoteUsd` so all legs share one frozen-FX policy.

4. **NEW `flow_sources(match_id, identity, source, gross_buy_usd, gross_sell_usd,
   inventory_usd, swaps, finalized INTEGER, PRIMARY KEY(match_id, identity,
   source))`** — provenance/audit + the per-source finalization ledger (§6).
   `scores` stays chain-blind (`address=identity`, USD already netted).

5. **NEW `cex_credentials(id, identity_id, venue, cipher BLOB, scope_ok,
   created_at)`** — read-only API-key vault (Phase 5). **Ciphertext only**
   (AES-256-GCM); master key from a **Coolify secret outside the DB**, never a
   column.

---

## 8. Hot-path cost & rate limits (was under-specified)

- `collect()` calls `supports()` on **every provisional rescore tick**
  (`scoreDueMatches` runs while windows are open), and `supports()` is defined to
  do a live Jupiter `/quote` or `getReserves`/`slot0` per symbol per source →
  `N_symbols × N_sources` external calls every few minutes. **Cache `supports()`
  per `(source, symbol)` with a TTL** (mint-exists changes slowly); only
  re-check on cache miss or at finalization. This preserves the spirit of the
  current pair-cache (`indexer.ts:41,50-91`).
- **Public Base RPC `eth_getLogs` commonly caps at ≤500 blocks** with aggressive
  rate limits — the draft's "~1500" is optimistic. Set Base `logChunkBlocks ≤500`
  and **document that Base/Solana flow scoring requires a paid RPC**
  (Alchemy/Infura for Base, Helius for Solana) with a per-chain rate budget.

---

## 9. Chiliz-DEX and Binance/OKX-CEX as the first adapters (zero behavior change)

- **`chilizUniV2` `FlowCollector`** = the inline Chiliz loop (`indexer.ts:241-321`)
  lifted 1:1: same `UNIV2_ABI`, same `tx.from` attribution via `sendersFor`, same
  `getReserves` mark, same `2×WCHZ` maker heuristic, same drained-pool $0 mark,
  returning `FlowHarvest{ finalizable }` that reproduces the exact
  `priceReadFailed`/refuse-to-finalize guard. **Preserve today's first-seen wallet
  ordering** (`indexer.ts:207-219,333`) so float-summation order in
  `mergeFlowsByIdentity` is bit-identical and `scoring.test.ts` /
  `settlement.test.ts` stay green with no fixture edits. (If ordering ever must
  change, make the merge order-independent via sorted keys and re-baseline once.)
- **`binance` / `okx` `VolumeCollector`s** wrap `binanceWindowVolume` /
  `okxWindowVolume` unchanged, emitting the same numbers into `venue_volume`
  (backfilled from `cex_volume`); `getCexVolume` reads the compat VIEW.
- `SOURCES = [chilizUniV2, binance, okx]`. `scoreMatchInner`'s
  window/finality/frozen-price/persist logic stays; only its inline
  flow-production body is replaced by `collect(SOURCES, …)`.
- The frozen-price **legacy key+value shim** (§7.3) keeps every prior finalized
  match reproducible.

**Acceptance gate for Phase 1: the existing test suite passes untouched, plus a
new golden-board snapshot from a real finalized Chiliz match.**

---

## 10. Phased implementation plan (honest sizing)

### Phase 1 — Abstraction + refactor — **boilable now (a true lake)**
The seam, the registry, the `ChainConfig`/`DexProtocolAdapter` split, the pinned
base-unit→USD formula, the `LeagueToken` token model with back-compat accessors,
`wallets.chain`, the `venue_volume` PK fix + compat VIEW, the `frozen_prices`
key+value shim, and **per-source finalization plumbing** — with Chiliz + Binance +
OKX as the first adapters. **Zero behavior change; all existing tests green.**

### Phase 2 — Base — **medium as VolumeCollector; the `.flow` path is an ocean**
- **2a (medium):** Base `VolumeCollector` — DEX aggregate volume into
  `venue_volume`. Ships a Base volume tile with no attribution risk.
- **2b (ocean, gated):** Base `.flow` requires resolving the **real trader**, not
  `tx.from`: read the ERC-4337 `UserOperationEvent`/`handleOps` sender and/or the
  pool `Swap` recipient with router-unwrap; fall back to `tx.from` **only** for
  verified direct-EOA calls. **Any swap whose trader can't be resolved becomes
  display-only volume, never scored.** Plus the §5 close-mark spec (TWAP/depth-cap
  + per-identity inventory cap), `univ3`/`aerodrome` adapters (signed int256,
  `slot0`), `logChunkBlocks ≤500`, paid RPC. Do **not** ship `.flow` on a paid
  board until an EOA-vs-4337 resolution test passes on real Base swaps.

### Phase 3 — Solana
- **3a. Aggregate `VolumeCollector` (medium):** Jupiter token API + Dexscreener +
  Meteora `dlmm-api` → `venue_volume`, unauthenticated. Jupiter `/quote` doubles
  as the per-symbol tradability gate. Ships a live Solana volume tile immediately.
- **3b. Per-trader `FlowCollector` (ocean, correctness-gated — NOT merely
  effort-gated):** a separate non-EVM module — no viem, no `tx.from`. Page
  `getSignaturesForAddress(pool)` + `getTransaction({
  maxSupportedTransactionVersion:0, jsonParsed, commitment:'finalized' })`,
  resolve Address Lookup Tables, attribute each swap to the token-account
  **owner** whose fan-token+quote balances net-change (never the fee-payer/signer),
  filter program-owned vault PDAs + Jupiter intermediary legs, handle multiple
  owners per tx, window by each tx's own `blockTime` (slots ≠ block numbers),
  apply the §5 DLMM close-mark spec, taker-only. **The decisive reason to defer is
  not cost — it is that `getSignaturesForAddress(pool)` does not reliably
  enumerate all DLMM swaps** (Meteora routes touch bin-array PDAs + an event
  authority, Jupiter wraps swaps). **A trader the parser misses is silently scored
  0 → underpaid → strictly worse than not scoring Solana.** Hard rule: **Solana
  stays volume-only on any payable board until a reconciliation test proves the
  parser's summed per-owner volume matches an independent aggregate
  (Jupiter/Bitquery) within tolerance for a full window.** Strongly prefer buying
  **Bitquery `Trade.Account.Owner`** (or Birdeye) over hand-rolling the parser.

### Phase 4 — CEX expansion — **medium**
Bitget / Bybit / Gate / Mercado Bitcoin / Paribu `VolumeCollector`s — one file +
listing rows each. `venue_volume` PK already fixed. New work: one FX leg for BRL
(Binance `USDTBRL`), and **pinned unit tests** for array-index traps (Bybit
turnover vs base at idx6/idx5; Gate quote at idx1). Paribu has no historical
kline → best-effort ticker-diff, flagged display-only. Add a test inserting
Binance+Bitget same-ticker to prove the collision is gone.

### Phase 5 — Per-trader CEX scoring — **ocean, deferrable indefinitely**
Graduate CEXes to `.flow`: the `cex_credentials` vault (AES-256-GCM, master key
outside the DB), **read-only scope verification by READING the key-permissions
endpoint** — Binance `GET /sapi/v1/account/apiRestrictions`
(`enableWithdrawals`/`enableSpotTrading`), OKX/Bybit/Bitget equivalents — and
**reject any key with withdraw/trade enabled. NEVER attempt a withdraw or order
as a probe** (it can succeed and move funds; several venues don't return 403 for
scope failures). Fail closed if the permission endpoint is unavailable. Then
per-venue fills adapters (`myTrades`/`fills`/`execution/list`/`my_trades`), a
strict **spot-only** filter (perp/margin notional breaks the collateral-based
PnL% denominator, `scoring.ts:32,104-113`), idempotent dedupe on `venueTradeId`.
Emits `WalletFlow` keyed to the credential's `identity_id`.

### Optional later — event store — **ocean, deferrable (§11)**
Not required for any of the above.

---

## 11. Optional evolution — the idempotent event store

If reproducibility-by-third-party or mixed-cadence collection (Solana slow, EVM
3-min, CEX fills on-demand) becomes a hard requirement, insert a `flow_events`
table *between* collection and scoring: each adapter UPSERTs physical-fact rows
(`PRIMARY KEY (match_id, chain, venue, event_id)`, `event_id` =
`txHash:logIndex` / `sig:ix:owner` / `venue:tradeId`) carrying raw legs (quote
asset, signed token delta) — **never baked USD**. Scoring becomes a pure store
read: value rows through the frozen `flow_marks` table → aggregate to
`WalletFlow` → unchanged formula. It is a strict superset of the v1 in-memory
path, adoptable via extract → dual-write → shadow-verify → flip, each phase
snapshot-tested against the live board. **Ocean; explicitly out of scope for the
initial rollout.** Per-record dedupe keys already live inside each adapter, so
provisional re-scores are idempotent even without this table.

---

## 12. Risks & open questions

| # | Risk | Status / mitigation |
|---|------|---------------------|
| R1 | Base `.flow` via `tx.from` mis-credits a router/bundler as one giant trader on a PAID board | **Blocker resolved:** Base ships volume-only; `.flow` requires the 4337/router-unwrap resolver; unresolved swaps → display-only, never scored (§10 Phase 2b) |
| R2 | Rescoring a pre-migration match re-finalizes a DIFFERENT payout (legacy scalar `frozen_prices` value) | **Blocker resolved:** read-time key+value shim + byte-identical fixture gate (§7.3) |
| R3 | Partial Solana attribution silently underpays missed traders | **Major resolved:** Solana volume-only until a reconciliation proof; prefer Bitquery (§10 Phase 3b) |
| R4 | Boundary routes reject/corrupt base58 identities | **Major resolved:** format-branched validation + ed25519 claim path at every route + `buildClaimMessage(chainLabel)` (§3.2) |
| R5 | A lagging non-Chiliz RPC freezes Chiliz payouts | **Major resolved:** per-source finalization + timeout→zero-contribution-with-audit-flag (§6) |
| R6 | Self-impact-on-exit wash while off-Chiliz is display-only | **Major, partially open:** open until source chain is scored-and-netted; mitigate via inventory MTM cap/discount or gate scoring on no large un-integrated liquidity (§4). Chiliz depth bounds but doesn't eliminate |
| R7 | Instantaneous/CL close-mark manipulation on thin pools | **Major resolved-as-spec:** TWAP/depth-capped mark + per-identity inventory cap are required for Base/Solana `.flow` (§5) |
| R8 | `venue_volume` PK collision on same-ticker venues | **Minor resolved:** rebuild + compat VIEW before Phase 4, with a Binance+Bitget collision test (§7.2) |
| R9 | Concave-unlock sybil scales with more chains | **Minor, structural:** KYC dedup is the load-bearing control; require explicit linking before payout (§3.3) |
| R10 | Float summation order breaks exact-equality tests | **Minor resolved:** preserve first-seen ordering, or make merge order-independent + re-baseline once (§9) |
| R11 | Actively probing withdraw scope can move real funds | **Minor resolved:** verify scope by READING permissions endpoint, never a live probe; fail closed (§10 Phase 5) |
| R12 | `supports()` external-call storm on every tick; Base RPC block-range cap | **Minor resolved:** TTL-cache `supports()`; Base `logChunkBlocks ≤500`; document paid-RPC requirement (§8) |
| R13 | Mixed-decimal quote→USD math mis-marks by 10^n | **Minor resolved:** one pinned formula + unit test per decimal combo; freeze `quoteUsd(asset)` per key (§1.5) |

**Open questions for product/ops:**
1. Do we require explicit per-wallet linking before a wallet's points count
   (closes R9 fully), or keep unlinked-solo defaulting?
2. For R6, do we prefer the inventory-cap mitigation (keeps thin symbols
   scorable) or the liquidity-gate (drops thin symbols from scoring entirely)?
3. Buy Bitquery/Birdeye for Solana per-trader data, or defer 3b indefinitely and
   run Solana volume-only?
4. Is per-trader CEX scoring (Phase 5) ever worth the custody/security liability,
   or is venue-aggregate volume the permanent CEX answer?