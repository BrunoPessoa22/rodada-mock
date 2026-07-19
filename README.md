# Rodada — Fan Token Trading League

Live at **https://trading.brunopessoa.com** (PT/EN).

Trade your club's token on match day, wherever you already trade — climb the
leaderboard, take a share of a pot that grows every day. The league never
executes trades, never holds funds, never recommends. It measures, scores,
and pays.

## What this is

- **Real on-chain counting** — the indexer reads Swap/Mint/Burn events from the
  FanX/Kayen AMM pools on Chiliz Chain for every match window and attributes
  flow to the wallet that signed the transaction.
- **One public formula** — [`lib/scoring.ts`](lib/scoring.ts):
  `points = √(net USD flow) × 2 featured × 2 maker`. Round-trips cancel, and
  flows net **per KYC identity before the √**, so both single-identity wash and
  splitting across your own wallets score zero; only verified identities divide
  the pool. Anyone can recompute the on-chain leaderboard. (Beta scope:
  on-chain spot only — unlevered by nature; residual defense against two
  *distinct* colluding identities is manual review + clustering, not the
  formula.)
- **Claim your wallet** — unclaimed addresses appear truncated; claiming puts
  your handle on the leaderboard after manual verification (beta).

Full concept: [League Proposal v2](public/proposal/league-proposal-v2.md) ·
served at [/proposal](https://trading.brunopessoa.com/proposal). The original
static mock is preserved at [/mock](https://trading.brunopessoa.com/mock).

## Stack

Next.js 15 (standalone) · SQLite (better-sqlite3, `/app/data`) · viem against
`rpc.chiliz.com` · in-process indexer loop (`instrumentation.ts`, gated by
`RUN_INDEXER=1`).

```bash
npm install
npm run test        # scoring engine tests
npm run typecheck
npm run dev
npm run score -- <match-slug>   # manual scoring run
```

Env: `ADMIN_TOKEN` (admin API + /admin console), `RUN_INDEXER=1` (indexer loop,
prod only), `DATA_DIR`, `CHILIZ_RPC_URL`, `LOG_CHUNK_BLOCKS`,
`MAKER_COOLDOWN_S` (anti-JIT: liquidity must persist this long past the whistle
to keep maker points; default 6h — the board finalizes only after it elapses).

Deploys via Coolify (Dockerfile build) on push to `main` + manual deploy API
call. Matches are managed through `/admin` (or `POST /api/admin/matches`).
