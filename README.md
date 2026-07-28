# Rodada — Fan Token Trading League

Live at **https://trading.brunopessoa.com** (English).

Trade your club's token on match day, wherever you already trade — climb the
leaderboard, take a share of a pot that grows every day. The league never
executes trades, never holds funds, never recommends. It measures, scores,
and pays.

## What this is

- **Real on-chain counting** — the indexer reads Swap/Mint/Burn events from the
  FanX/Kayen AMM pools on Chiliz Chain for every match window and attributes
  flow to the wallet that signed the transaction.
- **One public formula** — [`lib/scoring.ts`](lib/scoring.ts):
  `SkillScore = max(PnL%, 0)` then
  `Points = SkillScore × (1 − e^(−Volume / V_target))` (profit-only:
  `SKILL_FLOOR_PCT = 0` by default). Break-even and losses score 0, so a
  self-round-trip (wash) is worthless no matter its volume — volume only
  qualifies the unlock, profit scores. Flows net **per KYC identity before the
  formula** (wallets linked via `POST /api/admin/identity`); only verified
  identities divide the pool. Anyone can recompute the on-chain leaderboard.
- **Claim your wallet** — choose a username and sign a one-time message
  (domain- and chain-bound) so your verified name appears on the leaderboard
  immediately; an optional contact is captured for prizes. Manual review
  remains available as a fallback.
- **Settlement** — `npm run settle -- <slug|season>` materializes the
  leaderboard's pro-rata projection into a payouts ledger + CSV (verified
  identities only). The on-chain CHZ transfer is a separate, human-authorized
  step; the "Funding verified" badge shows only when `funding_verified` is set.
- **CEX venue volume** — [`lib/cex.ts`](lib/cex.ts) tracks spot volume of each
  matchday token on **OKX** and **Binance** (public candles per listed pair,
  summed inside the window, converted to USD) and shows it at
  [/api/cex](https://trading.brunopessoa.com/api/cex). This is **display only —
  it does not score points today** (only Kayen on-chain flow does). Per-trader
  CEX attribution (read-only API keys → same formula) is the next layer.

Full concept: [League Proposal v2](public/proposal/league-proposal-v2.md) ·
served at [/proposal](https://trading.brunopessoa.com/proposal). The original
static mock is preserved at [/mock](https://trading.brunopessoa.com/mock).

## Stack

Next.js 15 (standalone) · SQLite (better-sqlite3, `/app/data`) · viem against
`rpc.chiliz.com` · in-process indexer loop (`instrumentation.ts`, gated by
`RUN_INDEXER=1`).

```bash
npm install
npm run test        # scoring engine + api tests
npm run typecheck
npm run dev
npm run score  -- <match-slug>       # manual scoring run
npm run settle -- <match-slug|season>   # compute payouts (CSV; --write to persist)
```

Env: `ADMIN_TOKEN` (admin API + /admin console), `RUN_INDEXER=1` (indexer loop,
prod only), `DATA_DIR`, `CHILIZ_RPC_URL`, `LOG_CHUNK_BLOCKS`,
`VOLUME_TARGET_USD` (volume unlock target; default 1000),
`SKILL_FLOOR_PCT` (PnL skill floor; default **0** = profit-only — a positive
value re-enables the flat-book-scores-F behavior and must not be raised without
switching the unlock to net exposure),
`TRUSTED_PROXY_HOPS` (reverse-proxy hops for client-IP resolution; default 1),
`INDEXER_INTERVAL_MS` (default 3min, floored at 10s),
`MAKER_COOLDOWN_S` (anti-JIT: liquidity must persist this long past the whistle
to keep counting toward the volume unlock; default 6h — the board finalizes
only after it elapses).

Deploys via Coolify (Dockerfile build) on push to `main` + manual deploy API
call. Matches are managed through `/admin` (or `POST /api/admin/matches`).
