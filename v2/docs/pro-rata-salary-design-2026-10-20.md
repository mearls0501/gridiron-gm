# In-season salary, pro rata — design note (2026-10-20)

Docs only. No code, no gate, no baseline. Asked for by Matt after #185 and
`claude/trade-valuation` (ROADMAP "Later — in-season salary is pro rata").
Decisions for Matt are at the end.

## The problem

The sim charges a club a contract's full-year base salary whenever the club
holds it, at any point in the league year. `capHit` (`lib/core/select.ts`) is
`baseSalary[0]` plus one year of bonus proration and never looks at the week.
So:

- A week-9 deadline trade puts the whole year's base on the acquiring club,
  and the trading club gets back the whole year, as if it had paid nothing.
- A week-16 street signing costs a full year of base.
- A cut in week 12 that clears waivers posts the full year of guaranteed base
  as dead money, and frees the full year of unguaranteed base, including the
  eleven weeks already paid.

## What the NFL does

- **Paragraph 5 salary is paid in regular-season installments.** 2020 CBA
  Article 26, Section 5 pays a player's Paragraph 5 salary in weekly or
  biweekly installments over the regular season, starting with the first
  regular-season game (text as hosted at
  https://overthecap.com/collective-bargaining-agreement/article/26/section/5;
  not reachable from this session, so taken from search excerpts of that page).
  Current practice is 18 installments for the 18-week season.
- **A trade splits the year by weeks.** The acquiring club carries the weeks
  left. Published cap analyses show it: Davante Adams's 2024 cap number with
  the Jets was 12/18 of his base plus per-game roster bonuses, and a trade after
  week 8 leaves the buyer 10/18 (CBS Sports "Agent's Take" trade cap
  analyses). Secondary sources, not CBA text.
- **A release keeps what was paid.** Unguaranteed base comes off the books
  from the release on; base already paid stays on the releasing club's year;
  guaranteed base still owed is charged (Spotrac, "Understanding NFL Dead
  Cap"; CBS "post-June 1 designation explained"). Secondary sources.
- **A mid-season signing is charged for the weeks he is under contract.**
  Same installment rule as above.

The sim already matches the NFL calendar: `REGULAR_SEASON_WEEKS = 18`,
`GAMES_PER_TEAM = 17`, one bye per club in weeks 2–17 (`types.ts`,
`schedule.ts`). So the unit is 1/18 of `baseSalary[0]` per regular-season week.

## Every in-season path that moves money today

From a read of `claude/trade-valuation` (`85ec3aa`). File:line is approximate.

| path | where | what it does with money today |
|---|---|---|
| Trade | `trades.ts` `moveAsset` / `executeTrade`; CPU `runCpuTrades` in `simulateWeek`, user `/trades` | Sender posts uncharged bonus as dead; receiver carries full-year base (and guarantee) |
| Trade cap test | `trades.ts` `checkTrade` | Receiver charged full `baseSalary[0]` |
| Street / FA signing | `contracts.ts` `signPlayer` (user, `/free-agency` signs instantly outside `offseason-fa`) | New `makeContract`, full-year base, full `capHit` cap check |
| CPU fill | `signAtMarket` via `fillOpenActiveSlots` (`irFill.ts`), `fillRoster` in `reconcileRoster`, `generateReplacement` | New full-year contracts |
| Cap last resort | `reconcileRoster` → `enforceCap` | Rewrites a deal to 1-yr `LEAGUE_MINIMUM`, no dead money |
| Cut | `contracts.ts` `cutPlayer` | Player to waivers, `teamId=null`, contract unchanged, **no money posted yet** |
| Waiver claim | `waivers.ts` `awardClaim` | Claimant takes the contract unchanged, full `capHit` |
| Waiver clear | `waivers.ts` `stashOrFreeAgent` | Back to original club's PS (full hit again), or `addDeadCap(original, deadMoney)` = full-year guaranteed base + proration |
| Extension / restructure / void years | `contracts.ts` `applyOfficeExtension`, `applyRestructure`, `applyVoidYears`; `/finances` has no phase gate | Extension replaces the deal with a new full-year contract; restructure converts `baseSalary[0]` above the minimum to bonus |
| IR / PS / elevation | `rosterStatus.ts`, `irFill.ts` | Same club; no money change. PS pay is not modelled separately |

No player retires in-season (retirement runs in `runProgression` at recap).
Playoffs: trades are closed and waivers do not resolve until
`advanceOffseason`; CPU IR fill can still sign.

The contract year rolls at FA open (`expireContracts` shifts `baseSalary`,
decrements `guaranteedYears`), the same step that wipes `deadCap`
(`clearDeadCap`).

## Proposed design

### 1. One helper for weeks paid

`regularWeeksPaid(state): number`, 0–18. The count of regular-season weeks
whose games are final. It cannot be `state.week`: CPU trades run inside
`simulateWeek` after week `w`'s games with `state.week === w`, while the user
acts between weeks with `state.week === w + 1` and week `w + 1` unplayed.
Derive it from the schedule (weeks with every game final), or keep one counter
bumped at the end of each `simulateWeek`. Preseason and offseason return 0.
Playoffs return 18.

### 2. The contract carries how much of this year is someone else's

Add `Contract.weeksBefore?: number` (0–18, missing = 0): regular-season weeks
of the current league year that belong to earlier holders, or that passed
before he signed. Then:

- `capHit` = `baseSalary[0] × (18 − weeksBefore) / 18` + one year of
  proration. `deadMoney` uses the same remaining fraction for this year's
  guaranteed base. Both stay pure functions of the contract.
- `baseSalary[0]` keeps the annual rate, so contract pages, asking prices and
  `topCapPct`'s "highest contract" reading keep their meaning.
- `expireContracts` resets `weeksBefore` to 0 when it shifts the year.

Older saves and every generated deal load with 0, so year-0 is byte-identical.

### 3. The club keeps what it paid, in its own bucket

Add `Team.salaryPaidOut?: number` (missing = 0): base already paid this league
year to players who have since left. Counted in `teamCap` and `payroll()`
like `deadCap`, wiped beside it at FA open. It is not dead money, so the
finances page can show it as its own line and `drift.deadMoneyPct` keeps
meaning "dead money". (`deadMoneyPct` reads after the FA-open wipe, so it
would not have seen in-season charges anyway; the separate bucket is for
honest display and for `payroll()`, which recap-time drift reads.)

### 4. Each transaction, under the rule

Let `w = regularWeeksPaid(state)`, `B = baseSalary[0]`, `b = weeksBefore`.

| event | from-club | to-club / contract |
|---|---|---|
| Trade | `salaryPaidOut += B × (w − b)/18`; bonus accelerates as today | `weeksBefore = w`; receiver's `capHit` is the rest of the year. `checkTrade` and the review read the same number |
| Cut | `salaryPaidOut += B × (w − b)/18` at the cut | `weeksBefore = w`. Claimant takes the remainder. A clear posts `deadMoney` on the remainder only |
| Signing (user, CPU fill, replacement, last-resort minimum) | — | New deal with `weeksBefore = w`; the cap check is the pro-rated hit |
| Extension in-season | — | Keeps `weeksBefore` for the current year (the new deal starts paying where the old one stopped) |
| Restructure | — | Converts only the unpaid part of this year's base, `B × (18 − w)/18`; paid weeks cannot become bonus |
| IR / PS / elevation | — | No change |

The trade valuation from `claude/trade-valuation` (`acquiredCapHit`) becomes
"base for the weeks left", the same number `capHit` would show after the deal.

## What it moves

Every CPU signing and trade in-season gets cheaper for the receiver and
returns less room to the sender. Expect the seed-42 canary to move, and
payroll-shaped reads to move: `medianPayrollPct` (lock 90.602 ±6) and
`minPayrollSeasonsUnder55` (max 0) read `payroll()` at recap, which now
includes `salaryPaidOut`; `topCapPctMean` (20.3 ±3) reads the active 53's
`capHit`, so a mid-season arrival reads lower; `irCapPctMean` likewise.
Trade volume may rise again as deadline deals get cheaper for buyers. Needs a
Studio panel and a signed canary, same as #185 and `claude/trade-valuation`.

## Tests it needs

- `regularWeeksPaid` from inside `simulateWeek` and from between weeks agree
  on the same played state; 0 in preseason, 18 in playoffs.
- A week-`w` trade: sender's `salaryPaidOut` and receiver's `capHit` sum to
  the full `B` over the year; a player traded twice splits three ways.
- Cut then claim, cut then clear: paid weeks stay, the clear charges only the
  remaining guaranteed base.
- Week-16 signing costs 2/18 of base; `checkTrade` and the trade review match
  execution (the #185 invariant).
- Contract roll resets `weeksBefore`; FA open wipes `salaryPaidOut`.
- Save migration: old saves load with both fields at 0, and year-0 harnesses
  stay byte-identical.

## Decisions for Matt

1. **Vested-veteran termination pay.** In the NFL a vested veteran on the
   week-1 roster is owed the full season's base if cut later (Article 30,
   termination pay; not verified here). Leave it out of this packet?
2. **Playoff signings.** With 18 weeks paid, a player signed in the playoffs
   costs nothing this league year. Accept that, or start such deals in the
   next league year?
3. **`topCapPctMean`.** Keep reading the active 53's cap charge (moves for
   mid-season arrivals), or read the annual rate (`baseSalary[0]` plus
   proration) so the metric does not move from this rule alone? This is a
   measurement choice, so it is yours.
4. **Scope.** One packet for every path above, or trades and cuts first,
   then signings? Doing trades alone recreates the inconsistency this note is
   about, so the recommendation is one packet.
