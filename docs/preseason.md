# Preseason 2026 — why the July board is archived, not rescored

## What happened

The league's first three windows were scored between 17 and 27 July 2026:

| slug | fixture | scored_at |
|---|---|---|
| `final-2026-spain-arg` | Espanha × Argentina (WC final) | 2026-07-20 |
| `bra-r19-chape-fla` | Chapecoense × Flamengo | 2026-07-23 |
| `bra-r20-fla-sao` | Flamengo × São Paulo | 2026-07-27 |

They ran on the league's **first** formula:

```
points = 2 · √|net taker USD|
```

Sign-blind: it scored the *magnitude* of a wallet's net flow, in either
direction, and never looked at whether the trade made money.

On 28 July the formula was replaced (commit `ac42a60`) with the profit-only
rule that `lib/scoring.ts` and `/regras` publish today:

```
SkillScore = max(PnL%, 0)
points     = SkillScore × (1 − e^(−Volume / V_target))
```

`scoreDueMatches` skips anything already `status = 'scored'`, so the three
finalized boards were never recomputed. The result, until 24 August 2026, was a
public leaderboard the public formula could not reproduce:

- The season's #1 (507 pts) had **PnL −65%** — zero points under the published rule.
- #2 was a wallet **net −$44,993** across the window.
- Recomputing the WC final under the published rule drops the board from
  **43 scorers to ~19** and reorders the top completely.

For a league whose central claim is *"anyone can recompute the board"*, that is
the worst possible defect.

## Why a rescore was the wrong fix

`matches.frozen_prices` is `NULL` on all three rows — the column shipped
*after* they were finalized. A rescore therefore marks July's unsold inventory
at **today's** pool reserves. That is not "the July board under the new rules";
it is "the July board plus a month of price movement the traders never had a
chance to act on". Publishing that as a result would be worse than publishing
nothing.

## What was done instead

`matches.season` (added 24 August 2026):

- The three July matches were backfilled to `preseason-2026`.
- `settings.active_season` = `2026-pilot`; new matches inherit it at creation
  and never have it rewritten on update.
- `getLeaderboard`, `getCurrentMatch` and `scoreDueMatches` are all scoped to
  the active season.
- The preseason board stays public at `/archive`, labelled with the formula it
  ran on and the reason it was retired.

## The rule this establishes

**A formula change applies from the next season, never retroactively inside
one.** A season already scored is archived under the rules it ran on. This is
published on `/regras` and `/prizes` so a participant can rely on it.

Operationally, that means: to change scoring, roll the season.

```bash
# Roll to a new season (admin console → Settings, or directly):
#   settings.active_season = '2027-s1'
# Existing matches keep their season; the board starts empty.
```
