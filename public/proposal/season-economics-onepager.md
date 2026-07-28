# Season economics — one page

**Product:** Fan Token Trader League (trading.brunopessoa.com)  
**Goal:** More **organic, repeated** fan-token volume on Chiliz-stack venues.  
**Constraint:** CHZ from the Community Incentive Pool (inflation). We cannot spend more to buy volume than the activity is worth to Chiliz — especially with **club rev-share** on most fan tokens (we do not capture full notional economics).

---

## 1. How it is today

| Piece | What it is now | Pays out? |
|--------|----------------|-----------|
| **Season pot (homepage)** | `base + 10k CHZ/day` counter | **No** — display only |
| **Matchday pool** | `matches.pool_chz` set in admin | **Projection only** — pro-rata by points among *verified* wallets |
| **Points** | Per match window: `PnL% × (1 − e^(−Volume / V_target))` | Rank + matchday share |
| **Challenges / battles** | In proposal, not productized in the app | — |

**Problem:** The biggest number on screen (season pot) is not the retention mechanic. Matchday projection is the only economic link to points. Season long-term “why I come back” is underbuilt.

---

## 2. Proposed format (simple)

**One scoring formula. Two prize layers. Optional challenges. Hard CHZ budget.**

```text
Matchday score  =  max(0, PnL% × (1 − e^(−Volume / V_target)))
Season score    =  sum of matchday scores   [optional: best N of M]
```

Same formula everywhere. No second skill system.

### A. Season pot — the main carrot (retention)

- Funded from a **fixed season budget** of Community Pool CHZ (not open-ended “print until volume looks good”).
- Homepage counter = **remaining / target season pot** (honest accrual toward a known pot, or fixed pot announced at season open).
- **Pays once at season end** (or at defined checkpoints: e.g. half-season + final — still simple).
- Split among **verified** traders:

```text
season share = (season points / sum of verified season points) × season pot
soft cap: no single identity > 20% of season pot (overflow redistributed pro-rata)
```

- **Eligibility (keep thin):** verified identity + scored on **≥ K distinct matchdays** (e.g. K = 4). Stops one lucky weekend from taking the grind prize without showing up.

### B. Matchday pool — the habit snack

- Smaller, frequent: e.g. **10–20% of weekly incentive CHZ**, rest reserved for season.
- Same pro-rata as today: `(matchday points / verified matchday points) × matchday pool`.
- Soft cap optional later; not required for pilot.

### C. Challenges — acquisition spike, not a second league

Like Squad Rivals’ **P2P challenge** energy, but **not** a second scoring stack:

| | Squad Rivals | Trader League challenge |
|--|--------------|-------------------------|
| Contest | Squad vs squad on match results | Trader/team vs trader/team on **same window trades** |
| Skill metric | Prediction score | **Same league points** (or raw PnL% if bankrolls equalized) |
| Prize | Platform pool / tickets | **Sponsor or separate challenge purse** — not the season pot |
| Side effect | Engagement | Trades still mint **normal league points** toward season |

**How a challenge works (minimal):**

1. Admin or sponsor opens a challenge on a listed match window (depth gate applies).  
2. Fixed roster (e.g. 2×5) or open entry with a **declared same bankroll** for fairness.  
3. At whistle: rank by **league points already earned in that window** (or equal-bankroll PnL% if we force parity).  
4. Challenge purse: **70/30** winner/loser side (or 1st/2nd table) — sponsor CHZ preferred.  
5. No new formula. No change to season math.

If that still feels heavy for v1: **ship season + matchday only**; challenges are stream/KOL ops with a manual purse until the pilot needs the button.

---

## 3. Budget split (illustrative)

Assume a season Community Pool allocation **S CHZ** (hard cap).

| Bucket | Share of S | Role |
|--------|------------|------|
| **Season pot** | **70–80%** | Retention, identity, “I’m in this all season” |
| **Matchday pools** | **15–25%** | Habit, WhatsApp loop, game-day dopamine |
| **Ops / buffer** | **0–5%** | Manual review, edge cases, clawbacks |
| **Challenges** | **0% of S** (default) | Sponsor / marketing budget only |

**Unit economics gate (non-negotiable):**

```text
CHZ out (season + matchday)  ≤  min(
  hard Community Pool allocation for the season,
  k × attributable Chiliz-side value   // fees/gas/strategy — k < 1
)
```

Do **not** fund as “% of notional volume.” Fan-token rev-share means notional is the wrong denominator. Prefer: **fixed S** + KPI dashboard (volume, returning traders, % volume in league windows, CHZ spent per $ organic volume).

---

## 4. What users feel (one loop)

1. **Matchday:** trade in the window → points → small CHZ share + leaderboard move.  
2. **Season:** those same points stack → rank toward the **big pot**.  
3. **Optional challenge:** same trades, extra spotlight/purse on a marquee window — still builds season score.

Retention driver = **season rank and season share**, not the daily drip alone.

---

## 5. Current → proposed (delta)

| | Now | Proposed |
|--|-----|----------|
| Season pot | Cosmetic counter | Real prize, end-of-season (or 2 checkpoints) |
| Matchday | Only real economic layer | Smaller share of budget; still pro-rata |
| Points | Per window only | Window + **running season total** |
| Challenges | Proposal only | Optional; same points; separate purse |
| Budget | Unbounded narrative | **Hard S** from Community Pool |

**Build order (don’t overcomplicate):**

1. Season points aggregate + season leaderboard + pot rules in copy  
2. Wire matchday % of budget vs season %  
3. Soft cap + min matchdays for season payout  
4. Challenges only if a sponsor/stream needs them  

---

## 6. Principles (keep on a sticky note)

1. **One formula** — never invent challenge-only math.  
2. **Season is the carrot; matchday is the loop.**  
3. **Pay skill-weighted participation, not volume rebates.**  
4. **Hard CHZ budget** — inflation is not free money.  
5. **Challenges are marketing on top of the league**, like Squad Rivals challenges sit on a season — not a second product.

---

*This page is the economics contract. Scoring remains `lib/scoring.ts`. Product surface: English-only Fan Token Trader League.*
