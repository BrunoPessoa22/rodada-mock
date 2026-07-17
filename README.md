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
  `points = √(net USD flow) × 2 featured × 2 maker`. Round-trips cancel;
  wash volume scores zero by construction. Anyone can recompute the
  leaderboard.
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
prod only), `DATA_DIR`, `CHILIZ_RPC_URL`, `LOG_CHUNK_BLOCKS`.

Deploys via Coolify (Dockerfile build) on push to `main` + manual deploy API
call. Matches are managed through `/admin` (or `POST /api/admin/matches`).
