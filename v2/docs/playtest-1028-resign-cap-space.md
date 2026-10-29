# Playtest 1028 — Meet asking raises cap space

Read-only investigation of career playtest findings **#2** and **#12** (`REPORT.md`, production `https://gridiron-gm-nine.vercel.app`, main `8747e25`). Kansas City Stampede, save `GM Playtest career5 1028`, shots `qa-career5-1028/s5/08` and `s5/09`.

No sim change in this PR. No `baselines.json` edit, no re-lock, no dial retune, no panel. Matt signs any fix.

## Verdict

Meet asking raises the header because it deletes the expiring deal's **closing-year** cap hit and writes a new year-1 hit into the same `teamCap()` total. The space line itself is exact: measured delta equals old hit minus new hit, residual $0. There is no separate cap-hold field. `nextSeasonCapHit` already prices an expiring deal at **$0** for the coming year, and the header never reads it.

Continue then does two more things to that number. `expireContracts` burns a year off the deal just signed, so the charge that moved the meter is not the charge for the season about to be played. `clearDeadCap` wipes the closing year's dead money with no roster move. That wipe is finding #12's Tag → FA drop. The FA → preseason rise is a different stock, booked after the wipe.

## What the playtest saw

Finding #2. On the Tag-phase re-sign list, Meet asking often raised Cap Space.

- 2030 Tag: 8 of 15 clicks raised it. Thigpen, asking $3.46M, took the header from $27.7M to $31.1M (+$3.4M).
- 2029 Tag: about $60M of asking prices took the header from $47.8M to $59.6M (+$11.8M), then $75.3M at FA.

The Hub list (`app/page.tsx` around the Re-sign card) shows Player, Pos, Age, OVR, POT, Asking. It does not show the hit being removed. Offer and Meet asking both call `submitOfficeOffer`. The shot is the same list, Cap Space $24.1M after five re-signs.

Finding #12. Dead money moved between phases with no user transaction, every season. The example is $24.2M at Tag, $2.79M at FA, $12.6M at preseason.

## Root cause

The tag window is still the league year that just ended. `runRecap` sets `phase` to `offseason-tag` and does not roll contracts or the calendar (`lib/core/offseason/index.ts` `runRecap`). `state.season += 1` waits until `finalizeOffseason` (`index.ts` line 293), after the draft and the cut. `expireContracts` waits until Continue, inside `runFreeAgencyOpen` (`index.ts` lines 118–128).

Until that Continue, an expiring player (`yearsRemaining === 1`, `expiresAtRollover` in `lib/core/select.ts` lines 124–126) still has a full `capHit` (`select.ts` lines 139–143): this year's base plus one year of bonus proration. That is the correct charge for the season already played. It is the wrong charge for a decision about whether he walks at FA.

The header, the Hub stat, `/finances`, and `/roster` all read `teamCap()` (`components/Shell.tsx` lines 104 and 151–158, `app/page.tsx` lines 120 and 815–818, `app/finances/page.tsx` line 95, `app/roster/page.tsx` line 139). Inside that function the player hits are summed first (`select.ts` lines 254–260). The returned `committed` adds dead and paid-out on top (line 266). Space subtracts the player hits, dead, and paid-out once each: `cap + carryover - playerHits - dead - paidOut` (line 270). That line matched the measured click to the dollar.

The engine already has the coming-year number, and the tag UI does not use it. `nextSeasonCapHit` returns $0 when `yearsRemaining <= 1` (`lib/core/offseason/contracts.ts` lines 194–198). `upcomingSeasonCommitted` uses that during `offseason-tag` and `offseason-recap` (lines 210–224) for the CPU tag's 90% headroom. An unsigned expiring player counts $0 next year.

### The click

`submitOfficeOffer` (`contracts.ts` lines 947–960) sends Meet asking into `applyOfficeExtension` (lines 891–940). The cap check is:

```ts
  const currentHit = capHit(p.contract);
  // ... offer refused when under the club number ...
  const paidOld = departingPaidOut(state, p.contract);
  const contract = startContractNow(state, makeContract(
    contractOfficeChildRng(state), apy, yrs, state.season, defaultGuaranteedYears(apy, yrs)
  ));
  const hit = capHit(contract);
  const cap = teamCap(state, teamId);
  const available = cap.space + currentHit - paidOld;
  if (hit > available) {
    // refuse
  }
  settlePaidWeeks(state, p, teamId);
  p.contract = contract;
```

`regularWeeksPaid` is 0 outside the regular season and the playoffs (`select.ts` lines 161–168), so in the tag window `paidOld` is 0 and `settlePaidWeeks` books nothing. `startContractNow` sets `startsNextLeagueYear` only in the playoffs (`select.ts` lines 209–215). A tag-window deal starts immediately.

After the swap, `teamCap().space` changes by `currentHit - hit`. Space rises whenever the closing-year hit is larger than the new deal's year-1 hit.

That happens in two ordinary cases:

1. The old deal's final year is the heavy end of `makeContract`, and the new deal's year 1 is the light end. Weights are `0.94 + 0.04 * i` (`lib/core/generate.ts` line 196). A player whose ask is close to his old hit still frees money.
2. The ask has fallen below the old hit (age, a lower OVR). Thigpen's +$3.4M on a $3.46M ask is this shape: the removed hit was about $3.4M larger than the new year-1 charge, so the net of "signing him" was a gain.

In-season extensions use this same credit on purpose. The pro-rata design keeps the weeks already paid and replaces the rest of this year's hit (`docs/pro-rata-salary-design-2026-10-20.md`). That path is the season you are playing. The tag window is the season that is over.

`applyFranchiseTag` uses the same credit (`contracts.ts` lines 167–172): `available = cap.space + currentHit`. Leave it. A first tag is `max(top-five, 120% of last year's hit)`, so the tender is usually above the old hit, and `expireContracts` skips tagged players (`contracts.ts` line 574), so the tender is not burned. Changing that check changes who CPU clubs tag.

### The year that gets thrown away

Continue from Tag runs `runFreeAgencyOpen`: `clearDeadCap`, `reapplyRetirementDead`, `expireContracts`, then `cpuResign` (`index.ts` lines 118–142).

`expireContracts` (`contracts.ts` lines 568–603) decrements every deal that is not tagged and not `startsNextLeagueYear`:

```ts
    p.contract.yearsRemaining -= 1;
    p.contract.baseSalary = p.contract.baseSalary.slice(1);
```

The extension was not flagged, so its year 1 is sliced off before a game is played. The Hub text is `officeExtensionTerms` years (`contracts.ts` lines 877–882: at least 2, and `suggestedYears` is 2 from age 30 and 1 from age 33, then clamped up to 2). A 30-year-old's "2yr" deal enters the new league year with 1 year left, on the escalated base. A 4-year deal enters with 3.

`cpuResign` runs after that roll (`contracts.ts` line 1158, called from `index.ts` line 142). CPU re-signs keep year 1. The user path does not.

### Finding #12 is the same boundary

`clearDeadCap` (`select.ts` lines 307–313) zeros `deadCap` and deletes `salaryPaidOut`. `reapplyRetirementDead` (`lib/core/offseason/progression.ts` lines 216–222) puts back only `retirementDeadPending`, which `chargeRetirementAcceleration` stored at the recap (lines 203–213). In-season cuts and trades are not carried. That is the published rule (`docs/nfl-reference.md` §4, retirement acceleration: the wipe stays, retirement is re-posted, no June-1 split).

On the tag screen the header still shows the closing book, and the season label is still the old year (playtest #28). Advancing the phase deletes that dead money from the meter with no roster transaction. The planted check below reproduces the playtest's $24.2M → $2.79M exactly.

The FA → preseason rise ($2.79M → $12.6M in the example) is dead booked **after** the wipe: void-year acceleration inside `expireContracts` (lines 589–592, only when `bonusProrationYears` still has uncharged years, which means void years), offseason trade proration, and cutdown waiver dead from `finalizeOffseason` (`reconcileRoster` on the user's club, then `settleWaivers`). `drift.deadMoneyPct` reads that preseason stock (`scripts/drift.ts` line 259, after the offseason loop). Carrying the closing-year dead forward would double-count it against the rule in `nfl-reference.md` and move that emit.

One related hole, separate from the click's arithmetic: replacing the contract drops whatever `expireContracts` would have accelerated. A planted expiring deal with $5M of uncharged proration (void years) extended and then expired at **$0** dead. A normal final year has $0 leftover (`bonusProrationYears` equals `years`, so the last slice is the `capHit` proration, and the census in `docs/deadmoney-by-source-2026-09.md` already has non-void expiry at $0). The 8-of-15 raises do not need this hole. It is listed under residuals. It is not in the proposed diff.

## Measured on this tree (`8747e25`)

Local scripts, not committed. The career save is not in the repo, so Thigpen himself was not replayed. The function under the button was.

**The delta is old hit minus new hit.** Planted an expiring deal with a $6.700M hit, phase `offseason-tag`, `submitOfficeOffer(..., meetAsk: true)`. Ask $21.168M, 4 years. New year-1 hit $20.200M. `teamCap().space` went from $72.927M to $59.427M, delta −$13.500M. That equals $6.700M − $20.200M. Residual $0. `rngState` did not move. `deadCap` did not move. `startsNextLeagueYear` was false. `expireContracts` then took years remaining from 4 to 3, `baseSalary[0]` from $15.150M to $15.800M, and the cap hit from $20.200M to $20.850M.

**The playtest's sign.** Same call on a 30-year-old CB with OVR 68, so the ask is in Thigpen's band, and a closing hit set $3.4M above the new year-1. Ask $3.078M, signed as 2 years (the age-30 term). Old hit $6.373M, new hit $3.025M. Space $52.358M → $55.707M, delta +$3.348M, the same size and sign as $27.7M → $31.1M on a $3.46M ask. `expireContracts` took the 2-year deal to 1 year remaining and the hit from $3.025M to $3.131M.

**Fresh seed 42, year 0, user club.** 14 players already on expiring deals. For every one, year-1 of a Meet asking deal is below the closing hit, so every click would raise `teamCap().space`. The largest is OT Wilson, 82 OVR: old hit $24.423M, ask $23.004M, year-1 $21.650M, would free $2.773M. The 2030 result of 8 of 15 is the same comparison after five seasons, once some asks have climbed past the old hit.

**Dead wipe, no roster edit.** `deadCap = $24.200M`, `retirementDeadPending = $2.790M`, `salaryPaidOut = $1.100M`. After `clearDeadCap` and `reapplyRetirementDead`: dead $2.790M, paid-out gone, space $7.882M → $30.392M. The space gain is the $21.410M of dead removed plus the $1.100M of paid-out removed.

## Proposed fix

Tag-window Offer / Meet asking charges the coming year, and the number on screen is that same coming year. `teamCap()`, `applyFranchiseTag`, `clearDeadCap`, and `expireContracts`'s treatment of every other contract stay as they are. Headless leagues never call `submitOfficeOffer`.

Coming-year charge for one player, in `lib/core/offseason/contracts.ts` beside `nextSeasonCapHit`:

- Franchise-tagged tender: `annualCapHit`. The roll skips him, so his year 1 is real. `nextSeasonCapHit` would return $0 because `yearsRemaining === 1`.
- `startsNextLeagueYear`: `annualCapHit` (year 1). `nextSeasonCapHit` already does this.
- Otherwise: `nextSeasonCapHit`. An unsigned expiring deal is $0.

`tagWindowCap(state, teamId)` returns a `CapSummary` with:

- `cap` = `salaryCap(state.season, startSeason(state))`. The same ceiling FA and the draft still use. The calendar does not grow the cap until `finalizeOffseason`. Using `season + 1` here would add about 6% (`CAP_GROWTH`) on a screen the header still labels with the old year.
- `carryover` = the team's current `capCarryover`. FA still has this field. The next capture is `finalizeOffseason`.
- `dead` = `retirementDeadPending` only. That is what survives `clearDeadCap`. Closing-year `deadCap` stays on the team for the CPU and for `drift`, and it stays out of this meter.
- `paidOut` = 0. The wipe deletes it.
- `space` = `cap + carryover - charges - dead`, with `committed` reported as `charges + dead`, matching `teamCap`'s shape.

`screenCap` in `lib/view/resignStep.ts` returns `tagWindowCap` when `phase === "offseason-tag"` and `teamCap` otherwise. The header, the Hub Cap Space stat, `/finances`, and `/roster` read `screenCap`. In the tag phase, the cap-hit cells (`app/finances/page.tsx` line 282, `app/roster/page.tsx` line 468) use the coming-year charge. Leaving those cells on `capHit` would show $0 after the click, because `capHit` returns 0 while `startsNextLeagueYear` is set (`select.ts` line 140).

`applyOfficeExtension`, only when `phase === "offseason-tag"`:

```ts
const tagWindow = state.phase === "offseason-tag";
const paidOld = tagWindow ? 0 : departingPaidOut(state, p.contract);
const contract = startContractNow(state, makeContract(
  contractOfficeChildRng(state), apy, yrs, state.season, defaultGuaranteedYears(apy, yrs)
));
if (tagWindow) contract.startsNextLeagueYear = true;
const hit = tagWindow ? annualCapHit(contract) : capHit(contract);
const available = tagWindow
  ? tagWindowCap(state, teamId).space
  : teamCap(state, teamId).space + capHit(p.contract) - paidOld;
if (hit > available) {
  return {
    ok: false,
    reason: `Not enough cap space. That deal costs $${(hit / 1e6).toFixed(1)}M against $${(available / 1e6).toFixed(1)}M available.`,
  };
}
if (!tagWindow) settlePaidWeeks(state, p, teamId);
p.contract = contract;
```

The tag-window check does not add the closing-year hit back. The player was $0 on the coming-year meter, so Meet asking costs the new year-1 hit and the meter falls by that hit. `expireContracts` already keeps a `startsNextLeagueYear` deal and clears the flag (`contracts.ts` lines 576–578), which is how playoff signings survive the roll. Year 1 is the hit at FA.

In-season, preseason, FA, the draft, and camp stay on the existing credit. `applyTagExtension` (the July 15 desk, `offseason-final`) stays on it too: by then the tender has survived the roll and is the current charge.

`/finances` during `offseason-recap` still has the closing-year books. The re-sign list is not on that screen. Widening the display switch onto the season review is a separate change.

Residual, not in this diff: a tag-window extension still drops uncharged bonus from the deal it replaces. Booking `remainingBonusProration` of that replaced deal onto `deadCap` (and into `retirementDeadPending` if it has to survive the wipe, or onto `deadCap` after the user has already been shown the coming-year meter) is a second decision. Void deals are the ones with a nonzero leftover.

Residual: the Tag button still affordability-checks `teamCap().space + currentHit`. The header would show coming-year room. Those two numbers can disagree, which is the same family as playtest #11. Leave `applyFranchiseTag` so CPU tags do not move.

## Regression test

Add cases to `lib/view/resignStep.test.ts`. That file is already `resignstep` in both gate tiers (`scripts/gate.ts`) and in `package.json`. No new test file, no `scripts/` edit.

1. Phase `offseason-tag`. Plant an expiring player whose `capHit` is about $3.4M above year-1 of his Meet asking deal (the Thigpen shape: age 30, ask near $3M, closing base above it). Record `tagWindowCap` space and `teamCap` space.
2. `submitOfficeOffer(..., true)` succeeds. `rngState` is unchanged.
3. `tagWindowCap` space falls by `annualCapHit` of the new deal (dollar tolerance $1). `teamCap().space` may still rise. The test locks the screen figure, which is `tagWindowCap`.
4. The contract has `startsNextLeagueYear`, and `yearsRemaining` equals the signed term (2 for this age-30 player).
5. `expireContracts`. The flag is gone. `yearsRemaining` is still the signed term. `baseSalary[0]` is still year 1. `capHit` equals the pre-expire `annualCapHit`.
6. A second planted expiring player, left unsigned, is released by that same `expireContracts`. His release does not change the signed player's year-1 hit.
7. Dead display. Set `deadCap` to $24,200,000 and `retirementDeadPending` to $2,790,000. `tagWindowCap(...).dead` is $2,790,000. `team.deadCap` is still $24,200,000. This locks the screen against the wipe without changing `clearDeadCap`.

`npx tsx lib/view/resignStep.test.ts` is the check. The existing Offer / Meet asking cases in that file run in `offseason-tag` and should still pass: they assert the player stays and that CPU clubs match across `runFreeAgencyOpen`, and they do not assert the user's year count after the roll.

## Risk to gate metrics and canaries

This packet changes nothing on the headless path if the diff stays inside `applyOfficeExtension`'s tag-window branch, `tagWindowCap`, and the four screens. Do not retune. Do not edit `docs/baselines.json`. Do not re-lock. Do not run a panel for this doc.

| Check | Why it stays | What would move it |
|---|---|---|
| Seed-42 `userOffers` canary, tag `1777473079` / FA `3280841901` (`lib/core/userOffers.test.ts` lines 126 and 130) | The canary never calls `submitOfficeOffer`. The tag literal is the parent RNG when the phase first becomes `offseason-tag`, after `runCpuFranchiseTags`. The FA literal is one `advanceOffseason` later (`runFreeAgencyOpen`, trades, bidding). `contractOfficeChildRng` does not write `state.rngState`. The new flag is set only on a user tag-window contract, which that run does not create. | Changing `teamCap()` while `phase === "offseason-tag"`, or `applyFranchiseTag`'s `available` line, or `expireContracts` for deals that are not `startsNextLeagueYear`. CPU tag results feed the FA pool and the parent draws. The fingerprint moves. Stop. Do not edit the literals. |
| `drift.deadMoneyPct` | Report-only, no band (`nfl-reference.md` §4, ~5–8% OTC). Read at preseason from `Team.deadCap` after the wipe, void acceleration, trades, and cutdown. `clearDeadCap` is unchanged. The screen reads `retirementDeadPending` and leaves `deadCap` on the team. | Editing `clearDeadCap`, `reapplyRetirementDead`, or `expireContracts`'s `addDeadCap`. |
| `drift.topCapPctMean` | Locked 20.3 ±3. Snapshot is in-season `annualCapHit`, before the offseason. User re-signs are not on the headless path. | A change to `makeContract` or `annualCapHit`. This proposal does not touch them. |
| `drift.medianPayrollPct` | Locked 90.602 ±6. Same in-season snapshot. | A change to `payroll` or to contracts CPU clubs sign. |
| `drift.franchiseTagsPerSeason` | Locked 14 ±4. CPU tags still use `teamCap` and `applyFranchiseTag`. | The `available = cap.space + currentHit` edit called out above. |
| `drift.capBustSeasons` | In-season over-cap count. Tag-window user deals are absent from headless runs. | A change to `teamCap` or to `enforceCap`. |

Before Matt signs the implementation: `npx tsx lib/core/userOffers.test.ts` must still print the pair tag `1777473079`, FA `3280841901`. If it does not, the diff reached the CPU tag or the roll. Revert that part. The canary is not re-locked from this finding.

`node scripts/e2e.mjs` looks for the words "Cap Space" and "Meet asking". It does not assert a dollar figure. A changed tag-window dollar is not an e2e failure by itself. Worth one look after the screens switch to `screenCap`, because the tag screen's number will sit higher than today's closing-year meter (expiring hits and closing dead leave the display) and then fall on each Meet asking.
