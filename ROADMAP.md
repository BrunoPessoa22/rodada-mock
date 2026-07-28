# Rodada — Roadmap

Live baseline (v0.4, Jul 2026): open league counting Kayen/FanX on-chain flow
into a public-formula leaderboard, **profit-only scoring (wash = 0)**,
instant wallet-signature claims (manual fallback), **admin identity linking**
so per-identity netting is enforced, reproducible finalization (frozen prices),
and a **settlement runner** (`npm run settle`) that computes the pro-rata payout
ledger. See README for stack.

## Phase 1 — Final weekend (DONE, Jul 20)

- First real finalization ran; board + price freeze automatically on window
  close (now also reproducible via frozen pair prices). Settlement computed via
  `npm run settle`; on-chain disbursement remains a manual, funded step.
- Prize-eligibility rule published on /regras: any wallet can score; only
  KYC-verified identities get paid. Bots stay on the board, unpaid.

## Phase 2 — League loop (Aug)

- Brasileirão rodada windows seeded from FTI fixtures. Constraint discovered
  on-chain: only GALO and MENGO have liquid pools among BR clubs — rule #2
  (depth gate) limits featured matches until Kayen seeds BR club pools; that
  pool-seeding conversation is the real volume-growth lever.
- ~~Wallet-signature claim replacing manual approval~~ — **shipped**.
- ~~Per-identity linking writer~~ — **shipped** (`POST /api/admin/identity`);
  next: self-service multi-wallet link + KYC provider integration.
- Season page: per-matchday history, all-time table, per-wallet profile.
- Automated WhatsApp alerts (T−2h + full-time summary).
- Wash-clustering v1 before any payout beyond the pilot: shared funding
  source + mirrored-timing detection across wallets (profit-only already
  removes the flat-book exploit; this catches coordinated directional rings).
- Payout runbook: final-standings snapshot + payment tx receipts published.

## Phase 3 — Battles pilot (August, Libertadores knockout)

- Battle format per League Proposal v2: equal declared bankrolls, team PnL
  wins, captains scored on squad result (×2 prize weight, applied once),
  70/30 winner/loser split. 2 KOL captains + 3 community traders per side,
  10 manual onboards.
- Stream overlay page (OBS-embeddable live leaderboard for the broadcast).

## Phase 4 — Venue expansion (Sep+)

- CEX read-only key pollers: Mercado Bitcoin, OKX, Binance, Paribu —
  collateral-based flow counting (leverage never multiplies points).
- Vibe postback spec (one page) — unlocks short-side participation.
- Socios ID login when access lands; venues sponsor matchday pools via API.

## Infra backlog (continuous)

- SQLite volume backup cron; indexer-staleness alert (index_log freshness).
- ~~Real client IP for rate limiting behind Traefik~~ — **shipped**
  (rightmost XFF, `TRUSTED_PROXY_HOPS`).
- Multi-operator admin auth when the pilot team grows past one person.
- Admin token: add lockout/rate-limit on repeated bad tokens.
