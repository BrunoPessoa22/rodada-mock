# Rodada — Roadmap

Live baseline (v0.4, Jul 17 2026): open league counting Kayen/FanX on-chain
flow into a public-formula leaderboard, WC-final launch window, claim flow with
manual verification, admin console. See README for stack.

## Phase 1 — Final weekend (now → Jul 20)

- Watch the first real finalization (window closes Sun 22:30 UTC; indexer
  freezes the board + price automatically). Manual payout decision after.
- Publish prize-eligibility rule on /regras: any wallet can score; only
  KYC-verified identities get paid. Bots stay on the board, unpaid.
- Claim outreach to the top on-chain wallets (the leaderboard IS the lead
  list); manual WhatsApp alert T−2h to claimed users.

## Phase 2 — League loop (Jul → Aug)

- Brasileirão rodada windows seeded from FTI fixtures. Constraint discovered
  on-chain: only GALO and MENGO have liquid pools among BR clubs — rule #2
  (depth gate) limits featured matches until Kayen seeds BR club pools; that
  pool-seeding conversation is the real volume-growth lever.
- Wallet-signature claim (sign a message → instant verify) replacing manual
  approval; manual stays as fallback.
- Season page: per-matchday history, all-time table, per-wallet profile.
- Automated WhatsApp alerts (T−2h + full-time summary).
- Wash-clustering v1 before any payout beyond the pilot: shared funding
  source + mirrored-timing detection across wallets.
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
- Real client IP for rate limiting behind Traefik.
- Multi-operator admin auth when the pilot team grows past one person.
