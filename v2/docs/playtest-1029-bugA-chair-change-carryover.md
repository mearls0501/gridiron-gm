# Playtest 1029 — BUG-A: chair change shows a compounded cap carryover

Read-only investigation of **M4 / BUG-A** in the 30-season report (`REPORT.md`, production `https://gridiron-gm-nine.vercel.app`, main `8747e25`). Save `GM Playtest career30 1029`. Fired from Baltimore at the 2049 Tag stage, took San Francisco at `/forced-move`. Shots: `qa-career30-1029/s21-25/25-finances.png` and `s26-30/capA-01` through `capA-09`. B1 / BUG-D is the cliff this room created; it is context here, not a second fix.

Matt signed the proposed fix on 2026-10-30. This branch implements it: `spendBudget = targetSpend × cap + capCarryover` at the two CPU budget sites. Full rollover is unchanged. No `baselines.json` edit, no re-lock, no dial retune, no panel. The line numbers below are the pre-fix tree (`8747e25` through `0679a1a`).

**SIGNED.**

## Verdict

The chair switch stores nothing. `acceptGmChair` writes `userTeamId` and leaves `capCarryover` on the club. San Francisco already held the $1,847.6M. That field is last cutdown's unused space, and unused space includes whatever prior carryover the club did not spend. CPU free agency and CPU re-signs stop at `targetSpend × cap` and never add the carried dollars to that budget, so a club that sits under its own target rolls the whole stock forward and adds a fresh slice every year. Eight headless seasons on seed 42 already have a CPU club at about $450M. Continued at the rate those clubs actually added, a 2049 chair is the $1.6–1.8B the playtest inherited.

The later mismatches ($22.4M against a prior space of $2.91M, $51.9M against $39.8M) are the same field read at two different moments. On every finances shot in this packet, `cap + carryover − committed` equals the space line. The number that becomes next year's carryover is the space at cutdown, after the recap has already stepped the ceiling up 6%, after dead money is wiped, and after the offseason has rewritten the roster.

The ceiling series itself ($430.8M in 2035 to $1,381.7M in 2055) is `salaryCap` at `CAP_GROWTH` 0.06. The tag-window re-sign credit in `docs/playtest-1028-resign-cap-space.md` moves the tag header and is gone before this snapshot. It does not write the carryover.

## What the playtest saw

Fired at the 2049 Tag stage. `/finances` on the new club:

| Moment | Cap on screen | Carryover | Committed | Space |
|---|---:|---:|---:|---:|
| 2049 Tag, just hired (report) | $1,032.5M | $1,847.6M | $757.7M reconstructed | $2,122.4M |
| 2050 Season Review (`25-finances`, `capA-01`) | $1,032.5M | $1,613.0M | $1,268.6M | $1,376.9M |
| 2051 Preseason (`capA-04`) | $1,094.4M | $863.1M | $1,844.4M implied, 169% | $113.1M |
| 2051 Franchise Tag (`capA-06`) | $1,160.1M | $863.1M | $1,837.0M | $186.2M |
| 2052 Season Review (`capA-09`) | $1,160.1M | $13.7M | $1,166.8M | $6.97M |

The 2049 row is the report's three figures. Committed is the residual of `cap + carryover − space` on the exact ceiling `salaryCap` prints as $1,032.5M (`1,032,478,334`). That is 73% of the ceiling: a losing club's ordinary payroll, plus a carried stock bigger than the cap. Space of $2,122.4M "of $1,032.5M" is that sum.

The 2051 preseason row is the same identity run backwards. Cap $1,094.4M, carryover $863.1M and space $113.1M close only at committed $1,844.4M, which is 169% of that ceiling. The report's "169–173%" is this and the $2,009.4M / $1,160.1M book at the 2051 cutdown.

Carryover then fell $1,847.6M → $1,613.0M → $863.1M → $13.7M as the stock was spent and each cutdown stored only what was left. The $13.7M is still on the 2052 review, after B1 had already rewritten the stars. The field is not updated again until the next cutdown.

After the stock was gone the report still saw carryover disagree with the previous screen's space: $22.4M against $2.91M in 2053, $51.9M against $39.8M in 2055.

## Root cause

### What is stored

`Team.capCarryover` (`lib/core/types.ts` lines 444–449) is one number, missing = 0. `teamCap` (`lib/core/select.ts` lines 252–273) reads it:

```ts
space: cap + carryover - committed - dead - paidOut,
```

`committed` in that expression is the player-hit sum. The returned `committed` adds dead and paid-out once (`select.ts` line 266), so the space line is `cap + carryover − returned.committed`. The finances header prints those fields directly (`app/finances/page.tsx` lines 127–148). The 2050 review and the 2051 tag close to the dollar on the millions the shots show. The 2052 review's $7.00M versus $6.97M is `formatMoney` (`select.ts` lines 430–436): one decimal at or above $10M, two below.

`unusedCapSpace` (`select.ts` lines 275–278) is `max(0, round(space))`. `captureCapCarryover` (`select.ts` lines 280–283) maps that once per club, in `state.teams` order. `applyCapCarryover` (`select.ts` lines 285–290) writes `amounts[i]` onto `state.teams[i]`. Year-0 generation sets `id: i` (`lib/core/generate.ts` line 604), and a seed-42 `newGame` still has `teams[i].id === i` for all 32 clubs, so the write lands on the club that was measured. There is no sum-into-one-team path. The only production writer is `applyCapCarryover`.

`finalizeOffseason` captures, then increments `state.season`, then writes (`lib/core/offseason/index.ts` lines 287–294). The published rule is full rollover of unused room, no haircut (`docs/nfl-reference.md` §4, the cap-carryover bullet). The snapshot replaces the field. It does not add a second copy on the side.

### The ceiling steps up at the recap, not at `season += 1`

`salaryCap` (`types.ts` lines 1571–1613) is `round(255_000_000 × 1.06 ^ (season − startSeason))`. `startSeason` is `season − history.length` (`select.ts` lines 315–317), so the exponent is `history.length`.

`runRecap` pushes the closed year onto `history` and leaves `state.season` where it is (`offseason/index.ts` lines 86–87 and 113). From the tag window through the cutdown, the ceiling on screen is already next year's. One step is exactly 6%. Seed 42, year 0, one stub `history.push`: cap $255,000,000 → $270,300,000, space up by the same $15,300,000, season still 2026. `captureCapCarryover` returned that post-push space.

That is why the 2051 preseason shot says $1,094.4M and the 2051 tag shot says $1,160.1M under a "2051 season" label. Exact integers:

| Label | Exponent | Integer | Shown |
|---|---:|---:|---:|
| 2035 in-season | 9 | 430,817,135 | $430.8M |
| 2049 in-season | 23 | 974,036,164 | $974.0M |
| 2049 tag and 2050 in-season | 24 | 1,032,478,334 | $1,032.5M |
| 2051 in-season | 25 | 1,094,427,034 | $1,094.4M |
| 2051 tag and 2052 in-season | 26 | 1,160,092,656 | $1,160.1M |
| 2055 in-season | 29 | 1,381,688,914 | $1,381.7M |

The report's 2035–2054 column matches this series. The 2042 cell `611.1→686.7` spans two steps (2041 in-season is $611.1M, exponent 15; 2043 in-season is $686.7M, exponent 17). One recap push moves a single step, which is the 2051 pair above. The growth is the constant. It is doing what `CAP_GROWTH` says.

The comment on the capture (`index.ts` lines 287–289) says the snapshot is taken before the calendar rolls so the new ceiling is not counted as leftover. The calendar roll is not what grows the ceiling. The push already did. At the capture, the roster has also been expired, re-signed, drafted and cut, so the charges are the book that will play under that same stepped-up ceiling. Seed 42's first rollover stored a CPU max of $32.1M, not a second copy of the $270.3M cap. The snapshot is unspent room against next year's ceiling, and that room includes last year's carryover.

### Why the stock compounds

Two budgets ignore the field.

CPU free agency (`lib/core/offseason/freeAgency.ts` lines 165–186):

```ts
const target = targetSpend(state, teamId, posture) * capInfo.cap;
const headroom = target - (cap.committed + load.hit);
if (headroom <= 1_000_000) break;
```

`targetSpend` (`lib/core/frontOffice.ts` lines 293–298) is 0.82–0.995 of the ceiling, clamped to the floor. `roomPct` divides by `cap`, not by `cap + carryover`, so a large stock does not raise appetite either. The loop stops when committed reaches that fraction of the ceiling.

CPU re-signs use the same product (`lib/core/offseason/contracts.ts` line 1162): `targetSpend × teamCap().cap`.

`spendToFloor` (`contracts.ts` lines 1706–1713) loops only while `payroll < cap × SPEND_FLOOR` (`SPEND_FLOOR` is 0.78, `frontOffice.ts` line 308). A club already above the floor returns immediately. Planted $1,847,600,000 of carryover on seed-42 Brooklyn, payroll $207.2M against a $255.0M cap, posture `retool`, target 0.8597 × cap = $219.2M, headroom $12.0M, space $1,895.4M. `spendToFloor` changed payroll by $0 and left the field at $1,847,600,000.

`upgradeRoster` can spend `teamCap().space`, and it is capped at 10 swaps (`contracts.ts` lines 1803 and 1860). Waiver claims use `spaceOf` (`lib/core/waivers.ts` lines 152–158), which subtracts hits, dead and paid-out from the ceiling and never reads `capCarryover`. The comment at `index.ts` lines 336–337 says the carryover enlarges that claim chain. The function it calls does not see the field. Capture has already run by then (`index.ts` line 290, `settleWaivers` at line 335), so a claim cannot shrink the number just stored.

A club whose committed stays under `targetSpend × cap` therefore keeps every unspent carried dollar, and the capture adds whatever slice of the new ceiling it also left. That is the whole stock next year.

### The chair change

`acceptGmChair` (`lib/core/owner.ts` lines 482–514) checks the open-chair list, sets `state.userTeamId`, stamps `gmHiredSeason` and `forcedRebuildUntil`, and marks the move resolved. On a tag or recap phase it runs `runCpuFranchiseTags` for the other open chairs. It does not read or write `capCarryover`, `deadCap`, or any contract. The page says so (`app/forced-move/page.tsx` lines 62–64): "Void years and cap carryover are not in this packet."

San Francisco is team id 28, Baltimore is 19 (`lib/core/names.ts` lines 77 and 89; `generate.ts` assigns `id: i`). Seed 42, phase `offseason-tag`, SF carryover planted at $1,847,600,000, the club he left planted at $40,000,000, Baltimore at $12,000,000. After `acceptGmChair(sfId)`: `userTeamId` is 28, all three fields unchanged.

The playtest's $1,847.6M was San Francisco's stock at the 2049 tag, captured at the previous cutdown and held all year. The drop to $1,613.0M, then $863.1M, then $13.7M is each later cutdown storing a smaller leftover after the user spent the room. The field does not tick down as money is committed. Only the next `applyCapCarryover` replaces it.

### Why a later carryover disagrees with the previous space

Next year's field equals `unusedCapSpace` at the capture inside `finalizeOffseason`. The Season Review header is earlier, and it is a different book.

At the review, phase is `offseason-recap` and `runRecap` has not pushed history, so the ceiling is still this year's. Dead money and the closing roster are still on the meter. Continue then:

1. Pushes history. The ceiling steps up 6%. Space rises by that step with no roster transaction. On the 2051 pair that step is $1,160,092,656 − $1,094,427,034 = $65,665,622.
2. Opens free agency with `clearDeadCap` and `expireContracts` (`index.ts` lines 121–128). The 2052 review was carrying $378.4M of dead. That wipe adds the dead back to space before anyone signs.
3. Re-signs, bids, the draft and the cut all move `committed`.
4. The capture reads whatever space is left, against the already-stepped ceiling.

$22.4M − $2.91M = $19.5M, and $51.9M − $39.8M = $12.1M. Both are the size of a partial step of growth plus whatever the dead wipe and the new deals netted, not a second formula. The career save is not in the repo, so those two pairs were not replayed. The shots that are in the packet obey `cap + carryover − committed = space`.

The tag-window re-sign credit (`docs/playtest-1028-resign-cap-space.md`) sits in step 1's phase. Meet asking can raise the tag header by deleting the closing-year hit. `expireContracts` then slices the new deal's first year, and that runs before the capture. The raised tag number is not what gets stored. It does make a tag-phase "prior space" the wrong comparison, which is the interaction with that finding. The cap-ceiling growth interacts only as the 6% step in (1), and as the dollar scale of every contract. It is not a separate rollover.

### How this fed B1

At the 2051 tag the field was still $863.1M and space was $186.2M, so commits above the $1,160.1M ceiling were legal. The report's cutdown book was $2,009.4M committed, 173% of that ceiling.

Planted that book on a seed-42 state with `season = 2051` and `history.length = 26` (ceiling $1,160,092,656), carryover $863,100,000, committed forced to $2,009,400,000. Space was $13,792,656, still positive, so the user's `reconcileRoster` before the capture (`index.ts` line 280) does not enter `enforceCap`. `applyCapCarryover` of a $13,700,000 sliver — the shape of the $13.7M still showing on the 2052 review — dropped space to −$835,607,344. Commitments had not moved. The old stock was simply no longer in the room.

The loop after `settleWaivers` (`index.ts` lines 338–342) calls `reconcileRoster` on every club with negative space, the user's included. The last resort (`contracts.ts` lines 1989–2008) replaces the largest hits with `makeContract(..., LEAGUE_MINIMUM, 1, ...)`. A one-year minimum's cap hit is $895,000 (`LEAGUE_MINIMUM` is $795,000; the $100,000 proration is what the finances page shows as $895K). A planted over-cap `reconcileRoster` on seed 7 rewrote the club's largest deal, a $30.6M quarterback, to that $895K hit. That is the shape of B1's five overwritten starters. This note does not propose changing that last resort. M2 can still reach it without this carryover.

## Measured on this tree (`8747e25` and later; these files are unchanged)

Local scripts under `/tmp`, not committed. No career save was loaded. No gate, no panel.

**The snapshot follows the push.** Seed 42, `newGame`, Brooklyn. Before a stub `history.push`: cap $255,000,000, space $47.8M, carryover 0. After the push: season still 2026, cap $270,300,000, space up by $15,300,000. `captureCapCarryover()[id]` equaled the post-push unused space, $15,300,000 above the pre-push space.

**The floor does not spend the stock.** Same club, carryover set to $1,847,600,000. `spendToFloor` left payroll and the field unchanged. See the root-cause plant above.

**The chair switch is an id write.** Seed 42, `acceptGmChair` onto SF (id 28) from a planted tag-phase forced move. SF stayed at $1,847,600,000. The club he left stayed at $40,000,000. Baltimore stayed at $12,000,000.

**The cliff.** The $2,009.4M / $863.1M plant above: space $13,792,656, then −$835,607,344 after the sliver was written. The $895,000 minimum hit is `capHit(makeContract(rng, LEAGUE_MINIMUM, 1, ...))`.

**The stock on a real headless run.** Seed 42, `advance` / `advanceOffseason`, eight seasons, 995s, not a panel. Carryover at each preseason, CPU clubs, whole millions:

| Preseason | Cap | CPU max | CPU median | CPU sum | SF | SF committed |
|---|---:|---:|---:|---:|---:|---:|
| 2026 | $255.0M | $0 | $0 | $0 | $0 | 88% |
| 2027 | $270.3M | KC $32.1M | $11.8M | $425.6M | $11M | 98% |
| 2028 | $286.5M | TB $68.2M | $22.0M | $877.2M | $21M | 101% |
| 2029 | $303.7M | BKN $105.5M | $44.0M | $1,459.6M | $41M | 99% |
| 2030 | $321.9M | BKN $168.1M | $78.9M | $2,501.8M | $98M | 85% |
| 2031 | $341.2M | CAR $223.7M | $105.5M | $3,178.0M | $169M | 85% |
| 2032 | $361.7M | CAR $298.4M | $112.9M | $3,906.5M | $231M | 88% |
| 2033 | $383.4M | CAR $372.1M | $148.3M | $4,524.9M | $251M | 100% |
| 2034 | $406.4M | CAR $449.6M | $147.6M | $5,379.0M | $331M | 86% |

Max, median and sum are `formatMoney` (one decimal at or above $10M). The SF column is truncated to a whole million. SF's adds from 2030 on are about $57–80M a year except the year it sat at 100% (about $20M). That is 15–20% of a ~$350–400M ceiling, inside the 0.78–0.995 target band, stacked on the previous field.

Projecting from SF's 2034 stock of about $331M, adding 12% of each later ceiling through 2049, lands about $1.53B. At 15% it lands about $1.83B. Carolina's $450M stock at the same 12–15% lands about $1.65–1.95B. The playtest's $1,847.6M is that tail on a different seed, on a chair whose owner was already firing the GM. This was not a 23-season replay, and it was not run on the Mac Studio.

The unmanaged user club on the same seed, which every CPU spender skips, was at $81.4M in 2027 and $198.9M in 2028. Drift already drops that club from `medianPayrollPct` for the same reason. The playtest's own Baltimore years stayed ordinary because the user was spending. The stock showed up when the user inherited a CPU book.

## Proposed fix

**SIGNED 2026-10-30.** Carry the dollars, and let a CPU club spend them. Do not cap the field. Do not move the ceiling.

`nfl-reference.md` §4 records Matt's signed rule: unused room carries in full, no haircut, no expiration. A cap at one year's ceiling would hide this bug and would also cut a club that was genuinely $30M under for several years. That is a different decision. It is not this fix.

Add `spendBudget` next to `targetSpend` in `lib/core/frontOffice.ts`:

```ts
export function spendBudget(state: GameState, teamId: number, posture: Posture): number {
  const cap = teamCap(state, teamId);
  return targetSpend(state, teamId, posture) * cap.cap + cap.carryover;
}
```

Use it in the two places that currently multiply by the ceiling alone:

- `lib/core/offseason/freeAgency.ts` line 167, the `target` that feeds `headroom` and `roomPct`.
- `lib/core/offseason/contracts.ts` line 1162, the `cpuResign` budget.

When `capCarryover` is missing or 0, both lines return the number they return today. A club with carried room bids and re-signs until committed reaches the ordinary target plus those dollars. The next capture then stores that year's fresh unspent slice, and the stock stops compounding. `spendToFloor`, `upgradeRoster`, `salaryCap`, `startSeason`, `history.push`, `acceptGmChair`, `captureCapCarryover` and `reconcileRoster` stay as they are.

`acceptGmChair` should keep inheriting the field. Once the stock is real unused room, the new GM is supposed to have it.

Residual, not in this diff: `spaceOf` still ignores `capCarryover`, so the claim chain is tighter than `teamCap().space` and the comment at `index.ts` lines 336–337 overstates what waivers see. Capture runs first, so this hole does not create the stock. Touching `spaceOf` moves waiver results. Leave it for a separate sign-off.

Residual: the post-apply `reconcileRoster` still rewrites a club that enters the cut over the cap down to the $895K hit, in silence. This budget change keeps a new career from handing the user a $1.8B mask. It does not change that last resort. B1 and M2 stay open.

Residual: the finances label "Unused room from last year" means the cutdown snapshot, not the Season Review header. The $22.4M / $2.91M and $51.9M / $39.8M pairs are that gap. No formula change makes those two screens equal.

## As built

The formula above is what shipped. Seed 42, ten headless seasons, on `0679a1a` plus this change. The pre-fix column matches the table through 2034, and continues:

| Preseason | Cap | Before max | After max | Before median | After median | Before sum | After sum |
|---|---:|---:|---:|---:|---:|---:|---:|
| 2035 | $430.8M | CAR $544.0M | MIN $392.3M | $169.5M | $125.9M | $6,343.1M | $4,127.5M |
| 2036 | $456.7M | CAR $609.1M | MIN $459.9M | $187.3M | $171.0M | $7,399.8M | $4,872.9M |

The league sum is lower. The median is lower through 2034 ($105.9M against $147.6M) and then closes most of the gap. The biggest club is lower than the pre-fix max and was still rising. It crossed one ceiling at the 2036 preseason. A full roster cannot deploy the whole field in one offseason: `cpuResign` only keeps players it already wanted, free agency stops at 53, and `spendToFloor` / `upgradeRoster` were left alone. The stock did not stop compounding inside ten seasons. No haircut was added. Mean of the ten in-season CPU median payroll percentages was 99.32 before and 99.91 after. Not re-locked.

## Regression test

Add cases to `lib/core/capMechanics.test.ts`. That file is already `capmechanics` in both gate tiers (`scripts/gate.ts`). No new test file, no `scripts/` edit. Do not commit the test with this note.

1. `spendBudget` with `capCarryover` 0 equals `targetSpend × teamCap().cap` for the user's club and for one CPU club.
2. Set one CPU club's `capCarryover` to $200,000,000. `spendBudget` equals the case-1 product plus $200,000,000. `teamCap().cap` is unchanged.
3. That same club, payroll already above `cap × 0.78`. `spendToFloor` leaves payroll and `capCarryover` unchanged. This locks the hole the fix is aimed at, so a later edit that only touches the floor does not count as the fix.
4. Phase `offseason-tag`. Plant a pending forced move whose open chair is SF (id 28) and whose `fromTeamId` is the user. Set three different `capCarryover` values on SF, on the club he leaves, and on Baltimore (id 19). `acceptGmChair` returns ok, `userTeamId` is 28, and all three fields are unchanged.
5. The cliff, so B1's trigger stays visible. `season = 2051`, `history.length = 26`. Carryover $863,100,000 and committed $2,009,400,000 on one club (dead money is a legal way to force the committed figure). Space is positive and under $20M. `applyCapCarryover` of a $13,700,000 sliver makes space negative by about $836M. Do not assert that `reconcileRoster` rewrites a named player in this file; that path has its own RNG and belongs with B1.

`npx tsx lib/core/capMechanics.test.ts` is the check. Case 3 fails once `spendToFloor` itself starts spending the stock, which this proposal does not do. Cases 1 and 2 fail if `spendBudget` is wired and then rounded differently at carryover 0.

## Risk to gate metrics and canaries

The implementation is the formula above. Do not retune. Do not edit `docs/baselines.json`. Do not re-lock. Do not run a panel for this note. The seed-42 `userOffers` canary stayed tag `1777473079` / FA `3280841901`.

| Check | Why it stays if the diff is `spendBudget` plus the two call sites | What would move it |
|---|---|---|
| Seed-42 `userOffers` canary, tag `1777473079` / FA `3280841901` (`lib/core/userOffers.test.ts` lines 126 and 130) | The literals are the parent RNG at the first tag and the first FA. Year-0 `capCarryover` is 0 on every club; the first `applyCapCarryover` is the first `finalizeOffseason`, after the draft and camp, past both literals. The canary never calls `acceptGmChair`. `spendBudget` at carryover 0 is the product those bids already use. | Changing `salaryCap`, `startSeason`, or moving `history.push`. The first tag and the first FA already run after that push, against the stepped-up ceiling. Also any edit to the FA or `cpuResign` budget that changes the value when carryover is 0. The fingerprint moves. Stop. Do not edit the literals. |
| `drift.medianPayrollPct` | Locked 90.602 ±6. Snapshot is in-season `payroll / cap`, user club excluded. Carryover is 0 through the whole first season, so a one-season read does not see the new spending. | A multi-season panel. From 2027 on, CPU clubs would deploy the stock and committed would rise toward `targetSpend × cap + carryover`. Seed 42's CPU median field is already $147.6M on a $406.4M ceiling by 2034. Spending that moves the median. Expect a re-lock conversation. Do not take it. |
| `drift.topCapPctMean` | Locked 20.3 ±3. In-season max `annualCapHit / cap`. | The same panel, if the extra budget buys larger deals. `MAX_CONTRACT_SHARE` is 0.22 and this proposal does not touch it. |
| `drift.capBustSeasons` | Max 0. A single contract over 28% of the ceiling. | A change to `makeContract` or the 0.22 share. The budget change should not create one. Confirm on the panel before calling it clean. |
| `drift.minPayrollSeasonsUnder55` | Max 0. The floor is unchanged. | A change to `spendToFloor` or `SPEND_FLOOR`. |
| `drift.franchiseTagsPerSeason` | Locked 14 ±4. The tag headroom reads `teamCap().cap` and `upcomingSeasonCommitted`, not `capCarryover`. | Higher offseason committed, from the new budget, can push clubs over the 90% headroom so they tag less. Possible on a panel. The tag function itself is untouched. |
| `drift.deadMoneyPct` | Report-only. Preseason `deadCap` after the wipe, voids, trades and the cut. | More spending, then more cuts, can raise it. Not a reason to edit the wipe. |

Before Matt signs the implementation: `npx tsx lib/core/userOffers.test.ts` must still print tag `1777473079`, FA `3280841901`. If it does not, the diff changed a year-0 budget or the ceiling. Revert that part. The canary is not re-locked from this finding. A full-tier drift panel is required before any baseline moves, and this note does not authorize one.
