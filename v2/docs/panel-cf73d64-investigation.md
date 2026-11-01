# Panel cf73d64 — three findings

Read-only investigation of draft PR #214 head `cf73d64`. Matt signed three follow-ups; they are built on top of this note. No `baselines.json` edit, no re-lock, no dial.

**Signed and built.** The 20% ceiling stays as it was. After `applyCapCarryover`, a CPU club still over the cap gets a saving release first (`enforceCap`), then the smallest cap hit that covers the hole, not the largest (`reconcileRoster`, `afterCarryover`). That pass is both the direct legalize and the refill that follows it. The cutdown's own last resort is still the largest hit. The user seat is unchanged. `scripts/sweep.ts` counts CPU clubs only.

On this VM after the rebase onto `81bb316`: `tsc` passed, `npm test` passed, `npm run verify` (5 seasons, seed 20260727) was 552/552. The seed-42 canary stayed tag `1777473079` / FA `3280841901`.

The comparison panel is main `ddc62bd`.

`gate:full:serial`, 5 seeds, was **GATE FAIL, 4 problems** on `cf73d64`: `verify` exited 1, `sweep` exited 1, `coherence` exited 1, and `verify.failures` was 2. `ddc62bd` was **GATE FAIL, 1 problem**, the coherence miss already accepted as noise. Coherence is not one of the three findings below. `drift.medianPayrollPct` did **not** fail the band. The mean 96.57 is inside 90.602±6 (cap 96.602) by 0.03.

`verify` does not read `GG_SEED`. Every panel seed is the same league, `scripts/verify.ts` default seed `20260727`, 10 seasons. The two bargains are two events in that one league, printed five times.

## 1. Payroll rose

### What the panel measured

`drift.medianPayrollPct`, mean of each season's CPU median `payroll / cap`, user club excluded, snapped at `offseason-recap` before that offseason spends (`scripts/drift.ts` lines 124–131 and 208, averaged at line 378).

| Seed | ddc62bd | cf73d64 | Delta |
|---|---:|---:|---:|
| 1 | 96.22 | 97.20 | +0.98 |
| 2 | 95.65 | 97.26 | +1.61 |
| 3 | 94.50 | 95.53 | +1.03 |
| 4 | 96.43 | 97.21 | +0.78 |
| 5 | 94.48 | 95.67 | +1.19 |
| Mean | 95.46 | 96.57 | +1.11 |

The NFL note on the lock is 92. Every seed moved up. That is a spend, not noise.

### Cause

The rise is `spendBudget`, not the ceiling.

`spendBudget` (`lib/core/frontOffice.ts` lines 309–312) is `targetSpend × cap + capCarryover`. CPU free agency uses it as the bid target (`lib/core/offseason/freeAgency.ts` line 167). `cpuResign` uses it as the keep budget (`lib/core/offseason/contracts.ts` line 1162). Before that change a CPU club stopped at `targetSpend × cap` and left the carried dollars unspent, so they never became payroll. Adding them to the budget is how a carried dollar becomes a cap hit. `payroll()` (`frontOffice.ts` lines 324–331) is those hits plus dead and paid-out. Drift reads it in-season, so the offseason that spends the bank shows up the next year.

The ceiling banks at most 20% of the cap (`lib/core/select.ts` lines 287–292, applied in `captureCapCarryover` lines 301–305 and `applyCapCarryover` lines 309–313). It can only **lower** the number `spendBudget` adds, and only once a club's unused room would have exceeded 20%. It cannot be why every seed's payroll is higher than `ddc62bd`.

### Separating the two commits

`GG_SEED=1`, which is the panel's first drift seed. `seedFor(12345)` resolves it to **506939785**. Eight seasons, this VM, `e297802` (spendBudget, no ceiling) against `cf73d64`.

The two runs match through 2028 (trades 114 / 101 / 94, passing leaders 4396 / 4534 / 4532). They diverge in 2029. That is the first in-season book after the ceiling can bind: the 2028 preseason is the first capture that can clip a bank, and that bank is spent in the 2028 offseason.

| Tree | `drift.medianPayrollPct` (8 seasons) |
|---|---:|
| `e297802` | 98.88 |
| `cf73d64` | 99.30 |

The ceiling raised this window by 0.42, it did not lower it. The same direction is on the earlier seed-42 ten-season preview: mean of the ten in-season medians 99.91 with `spendBudget` only, 100.09 with the ceiling. Eight seasons of one seed sit near 99 because the early years, once clubs spend the bank, are already at the cap. The 20-season panel mean is lower. The split is the same: almost all of the rise versus a tree that does not spend carryover is `spendBudget`. The ceiling is a few tenths, and those tenths point up.

Why the ceiling can raise payroll: it also changes who hits the minimum rewrite in finding 2. A rewritten star drops from a $30–70M hit to $895,000. Fewer of those rewrites leaves more of the big hits on the sheet. On this VM the ceiling produced fewer rewrites than `e297802` (finding 2), which is the direction of a higher median.

`#213` (`0679a1a`) stops the user seat from being cap-released. Drift already drops that club. It is not this delta.

### Proposed fix — signed as "do not undo"

Do not retune the band and do not take the carryover back out of `spendBudget`. The panel mean is inside the lock. The rise is the signed spend. Undoing it is a different decision than the ceiling. **Built as that: no payroll change.**

If a later panel crosses 96.602, the lever is the add in `spendBudget`, not `CAP_CARRYOVER_MAX_SHARE`. Changing that add would move `drift.medianPayrollPct` back down and would change who gets signed from 2027 on. The seed-42 `userOffers` canary is the first tag and the first free agency, while year-0 carryover is still 0, so `spendBudget` at zero carryover is the old product and the canary (tag `1777473079` / FA `3280841901`) stays. This note does not authorize that undo.

## 2. Two league-minimum FA bargains

### What the panel measured

`verify` 1061/1063 on every seed, against 1063/1063 on `ddc62bd`. Both misses are the same check (`scripts/verify.ts` lines 471–486): a fresh deal, not a four-year rookie contract, whose asking price is over three times the minimum and whose annual hit is under half of that ask.

Studio log, seed `20260727`:

| Labeled season | Player | Ask | Signed |
|---|---|---:|---:|
| 2029 | Lopez, QB, 86 OVR | $54.4M | $0.9M |
| 2032 | Dabney, OT, 85 OVR | $38.3M | $0.9M |

The check runs after that season's offseason (`verify.ts` line 605), so the deal was written during the offseason that rolled the calendar. `$0.9M` is `capHit` of a one-year `LEAGUE_MINIMUM` (`$795,000` plus the $100,000 proration).

This VM does not reproduce those two names. The same verify seed matches the Studio log through 2027 and then diverges (2028 champion and, later, the rewritten players). The deals it does fail are the same kind of contract. Treat Lopez and Dabney as that path on the Studio's side of the divergence, not as a second mechanism.

### The path

It is not a free-agency bid that negotiated down to the minimum, and it is not `signMinimum`. `signMinimum` (`contracts.ts` lines 1575–1580) refuses anyone over `USER_FILL_OVR` 66 (`contracts.ts` line 1544 and 1568). An 83–90 OVR player cannot take that route.

The write is the last resort in `reconcileRoster` (`contracts.ts` lines 1994–2013). After eight passes of `enforceCap` plus `fillRoster` still leave `space < 0`, and only for a CPU club, it replaces the **largest** hit over twice the minimum with `makeContract(rng, LEAGUE_MINIMUM, 1, ...)`. The log line is unique to that block: "restructured … to the league minimum — forced by the cap". `askingPrice` (`contracts.ts` lines 755–758) is then the player's real market, and the hit is $895,000, which is the verify miss.

`enforceCap` (`contracts.ts` lines 1945–1964) only cuts a deal whose cap hit exceeds its dead money. A club whose cuts would not save money falls through to the largest-hit rewrite. A hole of a few million dollars deletes a $30–70M hit.

That rewrite runs in `finalizeOffseason` **after** `applyCapCarryover` (`offseason/index.ts` lines 291–295, then the negative-space pass at lines 338–342). The order is the cliff from the BUG-A note. `spendBudget` lets a CPU club commit up toward `targetSpend × cap + carryover`. The next capture replaces that carryover with whatever unused room is left (and, on this tree, at most 20% of the cap). If the new bank is smaller than the bank the deals were signed against, space goes negative with the contracts still on the book. The last resort then fires. The logged season is the new year, because `season += 1` has already happened (`index.ts` line 293).

On this VM, seed `20260727`, the rewrite log and the contract shape (1 year, APY `$795,000`, hit `$895,000`):

| Tree | Through the 2032 offseason | 2033 offseason | Eight-season total |
|---|---|---|---:|
| `e297802` (no ceiling) | 5. 2030: Cameron Vandross Jr., MIN, EDGE 90, was $48.5M. 2032: four more, including Preston Radcliffe II, BKN, OT 82, was $42.2M | none | 5 |
| `cf73d64` | 2. 2030: Kyle Jennings, PHI, EDGE 83, was $29.3M. 2032: Silas Fairchild, BKN, QB 75, was $43.4M | Zach Hawthorne, CIN, OT 86, was $52.4M | 3 |

Every one of those banks was **under** 20% of that year's cap (the largest in the table is Houston's $58.9M on a $383.4M cap, and 20% is $76.7M). The ceiling did not clip the club that got rewritten. It changed other clubs' banks earlier, the league diverged, and a different star was the largest hit when a book went negative.

### Did the ceiling make it more frequent?

Not on this VM. Through the same eight seasons, `e297802` rewrote five deals and `cf73d64` rewrote three. Through the paired 2032 offseason the counts are five and two. An uncapped bank lets `spendBudget` commit more, and the next leftover is a deeper hole, so more clubs reach the last resort. The ceiling makes that hole smaller and, here, the miss rarer.

Versus `ddc62bd`, which had zero, the class is new. `spendBudget` is what creates it. The ceiling does not. The Studio's two events in ten seasons and this VM's two events through 2032 are the same count on `cf73d64`, with different names because the leagues diverged. The earlier five-season run on `e297802` was the one miss (Vandross, 551/552). Jennings in that shorter run was the `cf73d64` name, not the `e297802` name.

### Proposed fix — SIGNED and built

In the post-apply legalize only (`offseason/index.ts`, the `reconcileRoster` call after `applyCapCarryover`), do not call the largest-hit rewrite to close the hole. `enforceCap` runs first, and it does not draw. If the book is still negative, rewrite the **smallest** hit that covers `-space`, not the largest hit on the roster. The cutdown's own last resort is still the largest hit. The user seat still returns before either rewrite.

Year-0 `newGame` does not enter the rewrite on seeds 42, 1, 12345, or 20260727 (zero "league minimum" log lines, zero clubs over the cap). The canary is read at the first tag and the first FA, before the first `finalizeOffseason`. This fix should leave tag `1777473079` / FA `3280841901` put. It would clear `verify.failures` if the hole no longer destroys a star. A panel can move `drift.medianPayrollPct` slightly **up**, because the star keeps his hit. Do not re-lock from this note. Do not retune `targetSpend` or the ceiling to hide it.

## 3. Seed-4 sweep over-cap

### What the panel measured

`scripts/sweep.ts` full tier is 25 leagues × 2 seasons. Seed 4 of the panel (`GG_SEED=4`) logged:

```
seed 2027708516 season 2027: over-cap=1 bad-rosters=0
```

`seedFor(100000)` with `GG_SEED=4` is the base, and league index 0 is `base + 0 * 7919` = **2027708516** (`sweep.ts` lines 16–18 and 36–38). The print is `st.season` after the offseason has rolled the calendar, so this is the **2027 preseason**, after the first `finalizeOffseason`. Rosters are all 53. One club has negative space. `ddc62bd` was clean.

### Reproduction

Same league on three trees, this VM. The bad club is identical on all three.

| Tree | Club | Over | Cap | Committed | Dead | Carryover | Roster |
|---|---|---:|---:|---:|---:|---:|---:|
| `0679a1a` (main, before either BUG-A change) | Boston, id 0, the **user** | $575,000 | $270,300,000 | $270,875,000 | $3,306,667 | 0 | 53 |
| `e297802` | Boston, the user | $575,000 | same | same | same | 0 | 53 |
| `cf73d64` | Boston, the user | $575,000 | same | same | same | 0 | 53 |

The 2028 preseason check is clean on all three. One problem seed, then it heals.

The ceiling did not do this. Carryover is 0, so `capCarryoverBank` stored nothing and there was nothing to clamp. `spendBudget` did not do it either: year-0 carryover is 0, so the first free agency and the first re-sign use the same dollars they used before that function existed, and the three trees match to the dollar.

### Where the $575,000 comes from

Boston's own book through the first offseason (`cf73d64`, and the same shape on the other two trees):

| Moment | Phase | Space | Dead | Committed | Roster |
|---|---|---:|---:|---:|---:|
| 2026 playoffs done | `offseason-recap` | +$32,208,335 | $0 | $222,791,665 | 53 |
| After recap | `offseason-tag` | +$49,350,835 | $550,000 | $220,949,165 | 51 |
| After free agency | `offseason-draft` | +$97,213,334 | $550,000 | $173,086,666 | 35 |
| Camp opens | `offseason-final` | −$15,236,666 | $550,000 | $285,536,666 | 71 |
| After `finalizeOffseason` | 2027 preseason | −$575,000 | $3,306,667 | $270,875,000 | 53 |

Player hits at the end are `committed − dead` = $267,568,333, which is **$2,731,667 under** the $270.3M cap. The $3,306,667 of dead money is the whole overage: $3,306,667 − $2,731,667 = $575,000.

The cap on that line is already next year's. Recap has pushed history, so `salaryCap` is $270,300,000 while `season` is still 2026. Camp is allowed to hold 71 and to sit over. The cut to 53 is `reconcileRoster` on the user seat inside `finalizeOffseason` (`index.ts` lines 279–280). `#213` (`0679a1a`) made that seat skip `enforceCap` and return before the minimum rewrite (`contracts.ts` lines 1980–1992). The cut still waives bodies — the log shows eighteen Boston waivers at that cut, starting with Deion Nakamura — and the bonus acceleration lands in `deadCap`. Nothing after that spends the user back under. Capture sees negative space, banks 0 (`unusedCapSpace` floors at 0, `select.ts` lines 295–297). Apply writes 0. The post-waiver legalize calls `reconcileRoster` again (`index.ts` lines 338–342) and the user seat returns still over. `refillCpuRostersAfterWaivers` (`contracts.ts` lines 1529–1541) skips the user on purpose.

`ddc62bd` is before `#213`, so the same cut still ran `enforceCap` on the user and the sweep stayed clean. The miss is the headless user under the signed `#213` rule. It is not carryover, not the 20% clamp, and not the refill.

### Proposed fix — SIGNED and built

Count CPU clubs only in `scripts/sweep.ts`. `#213` signed that the user's book is not rewritten and that the hub blocks a human who is over. A headless sweep has no human and no hub, so the user seat is a false failure. User cap enforcement stays off. That undoes `#213`.

The change is the harness exit code. Sweep emits no locked metric. It does not run before the canary's tag and FA, and it would not be in that path anyway. Tag `1777473079` / FA `3280841901` stay. No baseline moves. No dial moves.

## What was re-run here

No production file changed.

- `npx tsc --noEmit` passed.
- Seed-42 `userOffers` still tag `1777473079` / FA `3280841901`.
- `npm test` passed (exit 0) on this unchanged tree.
- Light VM runs only: the one sweep league on three trees, `verify` seed `20260727` for eight seasons on `e297802` and `cf73d64`, and `GG_SEED=1` drift for eight seasons on those two trees. No Mac Studio panel.
