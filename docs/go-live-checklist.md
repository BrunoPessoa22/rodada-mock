# Go-live checklist

State as of 24 Aug 2026. Everything under "Done" is shipped and verified in
production. Everything under "Yours" needs a decision, not code.

`ADMIN=<the ADMIN_TOKEN from Coolify>` for the commands below.

---

## Yours — the actual blockers

### 1. Money

`settings.funding_verified = '0'` and `settings.season_pool_chz = 0`. Until a
real, funded source is confirmed, the site correctly shows the pot as a target
and projects a payout of zero. Nothing is owed to anyone, which is the honest
state — but it is also not a launched league.

Decide the source (Community Reserve, sponsor, club non-cash) and the number,
then:

```bash
# The CHZ actually committed to the season board's payout math.
curl -X POST https://trading.brunopessoa.com/api/admin/settings \
  -H "Authorization: Bearer $ADMIN" -H 'Content-Type: application/json' \
  -d '{"key":"season_pool_chz","value":"250000"}'

# The headline target shown on the homepage. Set it to something you can defend.
curl -X POST https://trading.brunopessoa.com/api/admin/settings \
  -H "Authorization: Bearer $ADMIN" -H 'Content-Type: application/json' \
  -d '{"key":"pot_base_chz","value":"250000"}'

# ONLY once the CHZ genuinely exists and is earmarked. This flips the "Not yet
# funded" chip to "Funding verified", re-enables the daily accrual, and turns
# the prize-rules page's funding callout green. It is the one setting that makes
# the site assert something it cannot itself verify.
curl -X POST https://trading.brunopessoa.com/api/admin/settings \
  -H "Authorization: Bearer $ADMIN" -H 'Content-Type: application/json' \
  -d '{"key":"funding_verified","value":"1"}'
```

The current target is 1,247,500 CHZ with the daily drip frozen. It was seeded in
July and has never had anything behind it — pick a number you can fund.

### 2. Fixture

The pilot season (`2026-pilot`) has no match, so the calendar is empty. This is
the last step before the product is live. Creating one lights up the matchday
card, the venue board, the countdown and the committed-pool math — verified end
to end against a copy of the production database.

```bash
curl -X POST https://trading.brunopessoa.com/api/admin/matches \
  -H "Authorization: Bearer $ADMIN" -H 'Content-Type: application/json' \
  -d '{
    "slug":"bra-r24-fla-pal",
    "home":"Flamengo","away":"Palmeiras",
    "competition":"Brasileirao - Round 24",
    "kickoff_utc":"2026-08-30T21:30:00Z",
    "window_start_utc":"2026-08-28T12:00:00Z",
    "window_end_utc":"2026-08-31T00:00:00Z",
    "featured":true,
    "tokens":["MENGO","VERDAO"],
    "pool_chz":25000
  }'
```

Season is set automatically from `settings.active_season` — do not pass it.

Picking tokens: only symbols with a liquid Chiliz-Chain pool score. The deepest
and most active are pinned in `lib/tokens.ts` (SPAIN, ARG, BAR, PSG, GALO,
MENGO, GAL, TRA, POR are the proven ones). A featured match on a thin token
breaks one of the three never-break rules — check pool depth before committing.

Windows: open it ~48h before kickoff and close it a few hours after full time.
The board then waits `MAKER_COOLDOWN_S` (default 6h) before finalising.

### 3. Owner

Who signs off a payout, and who answers a scoring dispute? `/terms` points
disputes at "the operator contact published alongside the current matchday
announcement" — that contact needs to exist before the first announcement.

On-chain disbursement is still a manual human step: `npm run settle -- <slug>`
computes who is owed what and emits a CSV with full addresses; a funded wallet
then has to send the CHZ.

### 4. Counsel

`/terms`, `/privacy` and `/prizes` are written and live, and they are
conservative — but they have not been reviewed by a lawyer. Contact details
(WhatsApp / Telegram) are collected from EU users. Get them read before real
money moves.

### 5. Public repo

`BrunoPessoa22/rodada-mock` is public. League Proposal v2 and the season
economics one-pager were removed from the served site, but remain in the repo's
history — including the Community Incentive Pool funding source and the club
rev-share framing. See `docs/internal/README.md` for what closing that costs.

---

## Done — verified in production

- **Seasons.** The board reads one season only. The July windows are archived at
  `/archive` under the formula they ran on. See `docs/preseason.md` — this is
  the fix for the worst defect the audit found.
- **The pot reads as a target** while unfunded: no accrual, no animation, and
  the payout card multiplies by the committed pool, never the headline.
- **Payout share divides by all points on the board**, so one early verifier
  cannot be projected the whole pot. Unclaimed share stays in the pot.
- **"Live" means live.** The board only claims Live while a window is open, and
  stamps an as-of otherwise.
- **`/terms`, `/privacy`, `/prizes`** exist; the footer no longer points four
  different labels at one page.
- **`sig_e2e_test` purged** from the verified (payable) set.
- **Container healthcheck** on `/api/health`, defined in the Dockerfile and run
  with node. Coolify's platform-level HTTP check shells out to curl/wget inside
  the container and `node:22-bookworm-slim` ships neither — enabling it fails
  every deploy, so it stays off. **This only reports liveness: a wedged indexer
  still answers 200.** Point an external uptime monitor at `/api/health` and
  alert on `indexerStale: true` and `orphanMatches > 0` — that is the check that
  matters during a live window, and it is still yours to set up.
- **Backups off the volume**: `~/bin/trading-league-backup.sh`, daily 11:30 UTC,
  30-day retention, integrity-checked, on the host rather than inside the
  Docker volume it protects.
- **Internal proposal no longer served**; `robots.txt` keeps crawlers off
  `/admin` and `/api`.

## Known limits, accepted for a pilot

- Pre-window inventory has no cost basis, so liquidating a bag held before the
  window still reads as profit. Bounded by `capital = max(buy, sell)`, not
  eliminated.
- Identity linking is admin-trust, not KYC. Two-wallet collusion needs manual
  review before any payout.
- Single admin token, pasted into the admin page. Fine for one operator; not
  fine for a handover.
- Only Chiliz-Chain flow scores. Everything else is measured and displayed.
