# vibe.trading in the Trading League

All figures measured live on **2026-08-24** against vibe's public solver and the
public Symmio Goldsky subgraph. Re-measure before acting on any of them.

## What vibe is

[app.vibe.trading](https://app.vibe.trading) is Symmio's flagship perps frontend.
Two independent lanes, and the difference between them decides everything:

| | **VibeCaps lane** | **Main lane** |
|---|---|---|
| Solver | Enigma (`solver.enigma.bz`) | rasa (`base-hedger82.rasa.capital`) |
| Chain | HyperEVM 999 | Base |
| Markets | 204 | 2,747 |
| Priced off | Solana OFT mints on **Meteora** | **Binance** futures mirrors |
| Fan tokens | PSG, AFC, CHZ, POR, SPAIN, BELG, ARG | ALPINE, ASR, CHZ, OG, SANTOS |
| Max notional | see depth table below | **$700,000** @ 20x |

The fan tokens the league runs matchdays on live on the **thin** lane. The lane
with real depth carries a different, almost non-overlapping set.

## Measured reality

### Depth, VibeCaps lane (the fan-token lane)

| Market | id | availableToLong | availableToShort | Open interest | Total cap |
|---|---|---|---|---|---|
| SPAIN | 188 | $3,599 | $3,595 | $3,604 | — |
| PSG | 138 | $43.67 | $39.00 | $48.76 | **$131.44** |
| AFC | 139 | $13.14 | $14.96 | $13.14 | — |
| ARG | 195 | — | — | — | **MARKET LOCKED** (err 11) |
| CHZ | 142 | 0 | 0 | 0 | 0 |
| POR | 187 | 0 | 0 | 0 | 0 |
| BELG | 191 | 0 | 0 | 0 | 0 |

**Capacity does not scale with leverage** — PSG reads $43.67 at 1x and at 20x.
These are hard notional caps, not margin limits.

### Volume actually traded

Lifetime, all 7 Chiliz perps: **$395,302** across ~2,955 executions and ~143
accounts. But the shape matters far more than the total:

| Market | Lifetime volume | Active days | Last activity |
|---|---|---|---|
| SPAIN | $174,280 | 30 | 2026-08-24 |
| ARG | $152,143 | 31 | 2026-08-10 |
| POR | $51,641 | **3** | 2026-07-11 |
| BELG | $16,197 | **2** | 2026-07-11 |
| CHZ | $813 | 44 | 2026-08-17 |
| AFC | $151 | 16 | 2026-07-03 |
| PSG | **$77** | 40 | 2026-08-23 |

Run through the league's own match windows, the picture is unambiguous:

| Window | vibe fan-perp notional | Executions |
|---|---|---|
| **World Cup final** (17–19 Jul) | **$52,942** | 244 |
| Brasileirão R19, MENGO (20–23 Jul) | *no vibe market exists* | — |
| Last 30 days, all 6 markets | **$400** | 32 |

The league measured **$503k** of Chiliz spot volume in that same World Cup final
window. So vibe ran at roughly **10% of spot during a marquee national-team
event**, and fell to **$400 a month** once the tournament ended.

### The read

vibe's fan-token market is a **World Cup artifact**. SPAIN and ARG are 82% of
all volume ever traded and both are national teams whose tournament is over;
POR and BELG were pure two- and three-day bursts. The club tokens — the league's
actual weekly product — have essentially no market: PSG has done **$77** in its
lifetime. And the league's most liquid weekly tokens (MENGO, GALO, BAR, GAL,
TRA) have no vibe market at all.

## What shipped

vibe is now a **tracked venue**, exactly like Binance, OKX and the Solana/Base
pools: `lib/vibe.ts` reads the public subgraph, sums notional per match window,
and writes `venue_volume` rows under source `perp:vibe`. It appears on the
matchday venue board and the landing-page venue wall.

Two things are deliberately different from every other venue:

1. **It is tagged `Perps · tracked · not spot`.** A perp is a synthetic — a fan
   buying PSG perp never touches a PSG token.
2. **Its notional is excluded from the spot volume total** (`isPerpSource()`).
   Folding leveraged synthetic exposure into a token-demand figure would
   overstate the one number Chiliz actually cares about.

Window attribution mirrors the spot indexer exactly: each execution counts once,
at the moment it happens. Open inside the window → count the open leg; close
inside → count the close leg; a position that straddles the whole window counts
neither. Tested in `lib/vibe.test.ts`.

## The scored design (built on paper, NOT enabled)

### Attribution is solved

This was the thing that blocks CEXs, and vibe does not have the problem. The
public Goldsky subgraph exposes:

- `subAccounts { address, owner, affiliateAddress, singleVAMode, isolationType }`
  → **sub-account maps directly to an owner EOA**, which is exactly what the
  league's existing claim flow verifies. A trader signs the same message with
  the same wallet; nothing in `/entrar` changes.
- `quotes { partyA, symbolId, positionType, leverage, quantity, openedPrice,
  averageClosedPrice, closedAmount, timestampOpenPosition, timestampFullyClose }`
  → every position, both legs, per trader, with timestamps.
- `dailySymbolTradesHistories { account, symbolId, day, volume, profit, loss,
  fundingPaid, fundingReceived, platformFeePaid, openFeePaid, closeFeePaid }`
  → realized PnL already netted per account × symbol × day.

So a `VenueFlow` adapter is a few days of work, not a research project.

### The mapping — and the one change scoring.ts needs

For a trader with notional exposure `N`, collateral `C`, and net PnL `P`
(realized profit − loss + funding received − funding paid − fees, plus
unrealized marked at the frozen close price):

```
grossBuyUsd      = N        → capital = max(N, N) = N
grossSellUsd     = N        → pnlUsd  = N − N + P = P
inventoryMarkUsd = P        → pnlPct  = P / N     ✅ comparable to spot
```

PnL% must be computed on **notional**, not collateral. Otherwise leverage
becomes a straight points multiplier: at 20x, a 1% price move is a 20% return on
collateral, so a levered trader outscores a spot trader with the identical
market view by 20×. Returns on exposure are the only cross-venue-fair basis.

But volume — which drives the unlock multiplier — must be **collateral**-based,
per the rule already written into `lib/scoring.ts` ("collateral counts, notional
doesn't"). At 20x, notional-based volume would let a trader unlock the
multiplier for 5% of the capital a spot trader needs.

Those two requirements conflict in the current `WalletFlow` shape, because
`scoreWallet` derives both `capital` and `volumeUsd` from the same
`grossBuy`/`grossSell` pair. **The scored path therefore needs one additive
change**: an optional `volumeUsd` override on `WalletFlow`, used only by
leveraged venues, set to `2 × C`. Spot adapters keep deriving it as today, so
the existing board is bit-identical.

Do not make that change until the gate below is passed — `lib/scoring.ts` is the
highest-consequence file in the repo.

### The gate — why it is not scored today

**Mark integrity.** VibeCaps fan perps are priced off Solana Meteora pools.
Those pools are thin, and July's probe found SPAIN's sell depth under $3 with
the mark "manipulable upward for pennies". Depth today is *worse*, not better:
PSG's entire market caps at $131. A league that paid CHZ for PnL on those marks
would be inviting a trader to move a shallow pool, print league points, and
collect from the prize pot. That is a direct attack on the pool, and it is the
same finding the July battle-fusion analysis made ("score oracle player-writable
at ~$25K vault depth").

**A market only becomes scoreable when all of these hold at window open:**

1. Cost to move the underlying spot mark by 2% ≥ **10 ×** the matchday pool.
   You must not be able to buy the pot for less than the pot.
2. `availableToLong` **and** `availableToShort` each ≥ **25 ×** the largest
   single position the league expects to score, and the market is not LOCKED.
3. The market is genuinely two-sided. A one-sided book is a broken mark.
4. Counsel has signed off on rewarding leveraged-derivatives performance in a
   consumer product — see below.
5. A decision exists on maximum countable leverage.

On today's numbers, **no vibe fan market passes gate 1 or 2.** SPAIN comes
closest and is a retired tournament token.

### The non-technical blockers

- **Regulatory.** The league's current posture is deliberately clean: free
  entry, no stake, "you cannot lose money to the league because you never give
  it any." That is true of spot. Rewarding 20x perp performance means actively
  incentivising leveraged derivatives trading among football fans, with
  liquidation risk. Brazil (CVM) is the league's core audience and the July work
  already flagged unregistered-derivatives exposure with no license lane. This
  needs counsel before it needs code.
- **Geo.** Symmio geo-bans US/CA/KR/SG/CN/RU. The league is open to everyone, so
  a scored vibe layer would create a board some entrants cannot compete on.
- **KPI direction.** The league's own strategic rule says Solana/Base OFT
  trading is "worth tracking for token-demand KPIs, never worth weighting over
  Chiliz-native venues" because it burns no CHZ gas. A perp is one step further
  out: it does not buy the token at all. Scoring perps at parity with Chiliz
  spot would invert the league's stated priority.

## What to actually ask vibe for

The measurements above are the negotiating position, and they are strong: *when
vibe listed markets fans cared about, the league measured $52,942 of matchday
perp notional in a single three-day window — about 10% of what Chiliz spot did.
Then it fell to $400 a month, because the only listed fan markets were national
teams and the tournament ended.*

1. **List the league's club tokens.** MENGO, GALO, BAR, GAL, TRA, PSG with real
   markets — the tokens that trade every week, not once every four years.
2. **Seed the vaults.** $131 of total capacity on PSG is not a market. Gate 2
   above is the number to negotiate against.
3. **Register a Chiliz affiliate on HyperEVM.** Every fan-market quote today
   carries vibe's own affiliate (`0xbcb033c9…41b7c`) — 432 of 432 sampled. A
   Chiliz affiliate address would give clean attribution of league-driven flow
   *and* fee share, and it is already ask #1 from the July partnership list.
4. **Unlock ARG** (currently `Market Locked`) or explain the policy.
5. **Solver SLAs on fan symbols** — published caps, spread bands, quote uptime,
   and symmetric shorts.
6. **Chiliz Chain 88888 as a supported VibeCaps chain**, so Kayen-traded tokens
   list directly instead of routing through Solana OFTs. This is the ask that
   would fix mark integrity at the root, because the mark would then derive from
   the deepest venue the token has.

## Why this is still worth doing

Vibe is the only venue on the board where a fan can be **short** their club.
Today the league can only reward being right about upside. That is half a
market, and it is the half that does not fit the fan who thinks their team is
about to lose. That is the strategic prize, and it is what Altug named vibe as a
candidate for. It is blocked on depth and coverage — not on anything the league
has to build.

## Re-measuring

```bash
# Markets and depth (read-only; sdk.js has no wallet client, writes throw)
ssh ec2-tunnel 'cd /home/ubuntu/clawd/vibe && node sdk.js markets'
ssh ec2-tunnel 'cd /home/ubuntu/clawd/vibe && node sdk.js caps PSG'

# Main lane symbol list (public, no auth)
curl -s https://base-hedger82.rasa.capital/contract-symbols | jq '.count'
```

Window volume runs automatically from the indexer loop
(`refreshDueVibeVolume`, alongside the CEX and DEX collectors).
