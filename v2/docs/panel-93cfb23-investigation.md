# Panel 93cfb23 — seven red lines, one bug

Read-only investigation of the 5-seed `gate:full:serial` on main `93cfb23` (the Node 22.23.4 pin, #252). The comparison tree is `a453c24` (target-share and tackle-share bend, #222), whose panel the note in the task treats as the last clean sweep and the source of the parenthetical readings.

Nothing here edits `scripts/`, `docs/baselines.json`, a dial, or a lock. Node on every run was **v22.23.4** (`v2/.nvmrc`). Harnesses are the ones the gate calls, on the failing seed, except the sweep diagnosis which walks the same 25×2 loop as `scripts/sweep.ts` and names the club.

Draft PR **#248** (`ae3fd14`, branch `claude/spend-to-floor-active-only`, already contains `93cfb23`) is the roster fix. It stays a draft. This note does not mark it ready and does not merge it.

## What the panel reported

| # | Row | `93cfb23` | `a453c24` panel |
|---|---|---|---|
| 1 | `sweep` exit | 6 problem leagues, every one `bad-rosters=1`, `over-cap=0`. Per panel seed **1 / 0 / 1 / 3 / 1** | clean |
| 2, 5 | `conditions.problems` 0.20 | seed 3 home win **50.985%**, band 51.439–57.439 | 0 |
| 3 | `coherence` seed 1 | **82.86%** under the per-seed floor of 85 | 82.07, Matt signed as noise |
| 4 | `leverage.wrongSign` 0.20 | seed 1 only, `EDGE.prs` points **27.0 → 27.5** | 0 |
| 6 | `careers.path2BurnInTop10PrPct` | **16.67** (19/114), cap 16 | 15.97 (19/119) |
| 7 | `staff.leagueOvrDelta` | **1.36**, cap 1.2. Seeds **1.50 / 1.42 / 1.10 / 1.00 / 1.80** | 0.64 |

Passed, and left alone: `trimIdentity` 1443 / rng 1785272726 on the locked seed, `verify` 1063/1063, `staff.problems` 0, `fgPct` 84.868, `leadTackles` 108.6, `leadRushYds` 1563.4 (the signed target is 1533.3).

`conditions` and `coherence` build a fresh league per season and play the regular season only. `leverage` sims paired games and never enters a week. `sweep`, `staffcheck` and `careers` walk the offseason. That split is why the first three move only when generation or the play, or an in-season cut or trade, moves, and the last three also move when an offseason rule moves.

## 1. Sweep — real bug, already fixed on #248

Reproduced on this VM. `GG_SEED` 1, 3, 4 and 5, `sweep.ts`'s own formula (`seedFor(100000) + i * 7919`), 25 leagues × 2 seasons. Bad counts **1, 1, 3, 1**. Seed 2 was the panel's clean seed and was not re-run.

| Panel seed | i | League seed | Season opened | Club | Active | PS | IR |
|---|---:|---:|---|---|---:|---:|---:|
| 1 | 0 | 506920722 | 2028 | Denver | 54 | 15 | 0 |
| 3 | 13 | 1521057239 | 2027 | Washington | 69 | 0 | 0 |
| 4 | 2 | 2027724354 | 2028 | Pittsburgh | 58 | 11 | 2 |
| 4 | 10 | 2027787706 | 2027 | Kansas City | 67 | 2 | 1 |
| 4 | 11 | 2027795625 | 2027 | Cleveland | 68 | 1 | 0 |
| 5 | 7 | 387301214 | 2027 | Charlotte | 67 | 2 | 1 |

Active plus practice squad is 69 in every row (53 + 16). The missing practice-squad bodies are the extra active bodies. Charlotte, Kansas City, Cleveland and Washington are one offseason in. Denver and Pittsburgh are two.

### The path

`spendLegalCpuBackToFloor` runs at the end of `finalizeOffseason`, after waivers have parked the practice squad, and only for a CPU club already at 53 and under the cap. It calls `spendToFloor`. That function's worst-at-position map was every non-retired, non-prospect body. A practice-squad man is often the worst at his position. Cutting him and signing a free agent, who is active, adds one to the 53. The spend-back is the last roster write of the offseason.

Traced on Denver, seed 506920722, with a one-line log that was not kept:

`spendToFloor DEN season=2028 phase=preseason` cut **Julian Lewis, OT, 41 OVR, status=ps**, signed **Preston Yeager, OT, 62 OVR**. Active was 53 and the practice squad was 16 before the cut. After it, active 54, practice squad 15.

Washington at 69 and 0 is sixteen of those swaps, the whole squad. Pittsburgh's +5 is five of them. Same function.

The filter was never there. `spendToFloor` has counted practice-squad bodies since the v2 import. The panel stays clean until a club under the 78% floor (`SPEND_FLOOR`) still has cap room and a worse practice-squad body than the open market at that position.

### Which commit turns it on

Every bad index is clean on `ed69556` (#249).

On `3929425` (#250, retirement scale, older starting deals, trade acceleration at 680):

| Club | #250 |
|---|---|
| Denver | clean |
| Washington | **69** |
| Pittsburgh | clean |
| Kansas City | **67** |
| Cleveland | **68** |
| Charlotte | **67** |

On `5b922ec` (#251, CPU clubs budget against half their carryover, bank ceiling 8%): Denver **54**, Pittsburgh **58**. Those two are clean on #250, and #252 does not change the sim, so #251 is the commit that adds them.

#250's three production hunks were split onto the #249 tree and Washington (the +16) was re-run:

| Hunks | Washington |
|---|---|
| retirement scale only | clean |
| starting deals only | clean |
| trade price only | clean |
| retirement + starting deals | clean |
| retirement + trade price | clean |
| starting deals + trade price | clean |
| all three | **69** |

Any two leave the club at 53. The three signed rules together are what put Washington under the floor with a practice squad still on the roster. Kansas City, Cleveland and Charlotte were not split hunk by hunk. They appear at the same full commit, in the same offseason, with the same active-plus-practice-squad total.

### #248

`ae3fd14` adds `isActiveRoster` to the map in `spendToFloor`. `upgradeRoster` already filtered that way. Replayed on this VM, same index the panel failed:

| League | `93cfb23` | `ae3fd14` |
|---|---|---|
| Denver i=0 | 54 | **bad=0** |
| Washington i=13 | 69 | **bad=0** |
| Pittsburgh i=2 | 58 | **bad=0** |
| Kansas City i=10 | 67 | **bad=0** |
| Cleveland i=11 | 68 | **bad=0** |
| Charlotte i=7 | 67 | **bad=0** |

No second roster bug showed up. No further fix. #248's own note, after the merge of `93cfb23`, already records the fingerprints holding: trim identity **1443** cuts, rng **1785272726**; userOffers tag **3242373722**, free agency **691387436**. Not re-locked. This investigation did not re-run `tsc`, `npm test`, `verify.ts 5` or `determinism.ts 2` on that head. Those four are in the #248 handoff from the same Node.

Classification: **real bug**. The defect is old. #250 exposes four of the six leagues, #251 the other two. Both commits are signed cap rules. The illegal 53 is not a consequence to accept. The fix is the active-only filter, already on #248.

## 2 and 5. Home win, seed 3 — signed #250, both spending hunks

`GG_SEED=3`, `scripts/conditions.ts 6`. The locked band is 54.439 ± 3, so 51.439–57.439. The gate fails the step on any seed's exit, and the mean of `conditions.problems` is 0.20 when one seed of five prints one problem.

| Commit | Home win % | Exit |
|---|---:|---|
| `a453c24` | 53.260 | pass |
| `60617a9` #234 play log | 53.260, identical | pass |
| `8ac573b` #235 field goals, in-season cap | 53.637 | pass |
| `ab90614` #241 minimum deals, no bonus | 52.369 | pass |
| `7aec8c0` #244 veteran cuts | 52.862 | pass |
| `21d51e9` #245 tag, no bonus | 52.862, identical to #244 | pass |
| `61b3a70` #246 retirement charges bonus only | 52.862, identical | pass |
| `df6e8c1` #247 cap-release order | 53.444 | pass |
| `ed69556` #249 claims and late-round bonuses | 52.128 | pass |
| `3929425` #250 | **50.98522167487685** | fail |
| `5b922ec` #251 | same float | fail |
| `93cfb23` | same float | fail |

The printed line on `93cfb23` is `home win rate 50.985% outside locked 51.439–57.439%`. That is 0.454 under the floor. #251 and the Node pin do not move it.

#250 is three hunks. The harness never runs the offseason, so the retirement scale cannot be why a fresh regular season changed. The other two can: older starting deals change year-0 cap hits, and `ACCEL_PRICE` 340→680 changes which in-season trades clear. Split onto the #249 tree:

| Variant | Home win % | Against the band |
|---|---:|---|
| starting deals only | 52.064 | inside |
| trade price only | 53.695 | inside |
| both, no retirement scale | **50.98522167487685** | the panel number |

Neither signed rule alone crosses the line. Together they do, and the float matches #250 exactly. The home-field code was not touched.

Classification: **expected consequence of a signed change**, one seed, four tenths under the floor. Not a home-field bug. Matt should sign seed 3 at 50.985% as noise. Do not retune the band and do not undo either hunk.

## 3. Coherence, seed 1 — same pair of hunks, back to a number Matt already signed

`GG_SEED=1`, `scripts/coherence.ts 5`. The floor is 85, and the step exits on that seed alone.

| Commit | Explained % | Exit |
|---|---:|---|
| `a453c24` | **82.069** | fail (the signed 82.07) |
| `60617a9` #234 | 82.069, identical | fail |
| `8ac573b` #235 | 88.462 | pass |
| `ab90614` #241 | 90.345 | pass |
| `995fd2a` #243 bonus ramp | 85.401 | pass |
| `7aec8c0` #244 | 84.314 | fail |
| `21d51e9` #245 | 84.314, identical | fail |
| `61b3a70` #246 | 84.314, identical | fail |
| `df6e8c1` #247 | 84.138 | fail |
| `ed69556` #249 | **85.333** | pass |
| `3929425` #250 | **82.857** | fail |
| `93cfb23` | 82.857 | fail |

#234 does not move a regular-season harness. #235, the field-goal range, lifts the seed Matt had signed as noise up to 88.5. #244's in-season trim (`cutFreesNothing` on the affordability pick) drops it under 85 again. #249 brings it back over. The number the panel printed, 82.86, is #250, and it is stable through #251 and the Node pin.

Split the same way as the home-win rate:

| Variant | Explained % |
|---|---:|
| starting deals only | 84.672 (would fail on its own) |
| trade price only | 88.667 (pass) |
| both | **82.857** (the panel) |

Classification: **seed noise, the same miss Matt already signed**, landed again by the signed #250 pair. 82.86 is not a new coherence bug. #235 had cleared it. Do not retune the floor. Sign 82.86 the way 82.07 was signed.

## 4. Leverage, seed 1 — the field-goal commit crossed a 1% line

`GG_SEED=1`, `scripts/leverage.ts 150`. `EDGE.prs` is the opponent's pass rush against our points. The expected swing is negative.

| Commit | Low | High | Swing | Verdict | `wrongSign` |
|---|---:|---:|---:|---|---:|
| `a453c24` | 27.5 | 27.5 | +0.1 | NO EFFECT (under 1% relative) | 0 |
| `60617a9` #234 | 27.5 | 27.5 | +0.1 | NO EFFECT | 0 |
| `8ac573b` #235 | 27.0 | 27.5 | +0.5 | WRONG SIGN | 1 |
| `93cfb23` | 27.0 | 27.5 | +0.5 | WRONG SIGN | 1 |

#234 matches `a453c24` on the printed row. #235 matches HEAD. Later cap commits do not touch `simulateGame`, and this harness never runs a week, so they cannot be the cause. The change inside #235 that moves points is `inFieldGoalRange(false)` on the last-kick decision: the desperate stretch of 7 yards is not applied there.

The other four panel seeds on `93cfb23`, same 150 games:

| Seed | Low | High | Swing | Verdict |
|---|---:|---:|---:|---|
| 2 | 18.5 | 16.5 | −2.0 | ok |
| 3 | 27.6 | 25.9 | −1.7 | ok |
| 4 | 19.5 | 18.8 | −0.7 | weak, right sign |
| 5 | 23.3 | 22.3 | −1.0 | ok |

`wrongSign` is 1 on seed 1 and 0 on the rest, so the panel mean is 0.20 and the max of 0 fails. The attribute is not working backwards. On the seed where the probe was already a null (+0.1, counted as no effect, which is inside `leverage.noEffect` max 1), the field-goal rule moved the paired points by four tenths and the 1% relative test called it a wrong sign.

Classification: **seed noise**, exposed by signed #235. Do not retune pass rush and do not widen `wrongSign`. Sign seed 1's +0.5 as noise.

## 6. Careers burn-in — the pool's 19 is not the same 19

The gate pools `100 * sum(events) / sum(pop)`. The Studio pool went from 19/119 (15.97, under the cap of 16) to 19/114 (16.67). Same numerator, five fewer qualifying QBs.

On this VM, `scripts/careers.ts 24`, the per-seed counts are not stable. Seed 1 and seed 2:

| | `a453c24` events/pop | `93cfb23` events/pop |
|---|---|---|
| seed 1 | 1/26 | 3/19 |
| seed 2 | 4/23 | 3/20 |
| seeds 1–2 | 5/49 | 6/39 |

Seed 1 gained two events and lost seven from the population. Seed 2 lost one event and three from the population. A pool that stays at 19 events is those moves cancelling across the five seeds, not one group of 19 careers sitting still while five QBs fall out of the denominator.

Seed 1 along the way, same harness:

| Commit | events/pop |
|---|---|
| `a453c24` | 1/26 |
| `7aec8c0` #244 | 2/23 |
| `93cfb23` | 3/19 |

#244, the signed "do not pay a veteran in full to leave" rule, is where seed 1 first moves. It is not the whole move. `3929425` and `5b922ec` were started for seed 1 and had not finished when this note was written. Seeds 3, 4 and 5 of the two endpoints were still running too. The Studio pool is the number to sign against. This VM's finished seeds are enough to reject "the events did not change."

The burn-in formula was not edited between these commits. Who has a bottom-third starter season in years 1–3, and who later posts a top-10 passer rating on a new club, follows from the roster and cap rules that did change.

Classification: **expected consequence of the signed cap and cut rules**, 0.67 over a cap of 16 on a k-of-n that moved by a handful of QBs. Not a path-2 bug. Matt should sign the new pool (accept 19/114, or re-lock the max from a panel he chooses). Do not tune the scene, the starter bar, or the band to pull 16.67 back under 16.

## 7. Staff league OVR — seed 1's 1.50 is #251

`GG_SEED=1`, `scripts/staffcheck.ts 8`. The cap 1.2 is the panel mean. One seed over the line does not increment `staff.problems` (that counter stayed 0, as the panel said). Seed 1 on the panel is 1.50. On this VM the seed is `seedFor(4242)` = **506947876**, and the delta is **1.4991960475127115** on `93cfb23`, on `5b922ec`, and on `ae3fd14`.

`staff.ts` is not in the diff from `a453c24` to `93cfb23`. The step on seed 1:

| Commit | `staff.leagueOvrDelta` |
|---|---:|
| `a453c24` | 0.889 |
| `8ac573b` #235 | 0.664 |
| `ab90614` #241 | 0.386 |
| `7aec8c0` #244 | 1.132 |
| `61b3a70` #246 | 0.754 |
| `3929425` #250 | 0.441 |
| `5b922ec` #251 | **1.499** |
| `93cfb23` | **1.499** |
| `ae3fd14` #248 | **1.499** |

#244 spikes the seed and #246 and #250 give it back. The panel's 1.50 appears at #251 and nowhere earlier in this list. #251's production change is `CARRYOVER_SPEND_SHARE` 0.5 in `spendBudget`, and `CAP_CARRYOVER_MAX_SHARE` 0.20 → 0.08. Matt signed both on 2026-11-14. #252 only pins Node. #248's active-only filter does not move the delta, so the practice-squad swaps are not what opened the gap.

The two leagues in the harness differ only in the staff split. Both live under the new budget. A smaller bank changes who is signed and who is extended, and eight years of development then separate the specialised mean from the neutral mean by a point and a half instead of four tenths. That is the strategy layer measured on a different roster, not a multiplier that started creating value. `developmentMultiplier` was not touched.

Seeds 2–5 were not re-run here. The panel's own list is 1.50 / 1.42 / 1.10 / 1.00 / 1.80, mean 1.36. Seed 1's jump is +0.61 from `a453c24`'s 0.889. Spread across five seeds that is only +0.12 on the mean, and the mean rose by about +0.72, so the other seeds rose too. They were not bisected. The commit that produces the reported seed-1 number is #251.

Classification: **expected consequence of signed #251**. Do not undo the half-budget or the 8% ceiling to chase 1.2, and do not touch `staff.ts`. Matt should re-lock `staff.leagueOvrDelta` from a panel, or accept 1.36 against the standing max. The max was the panel mean when it was signed. It is a panel mean again.

## Fingerprints

No new code in this investigation. #248, the one code change that clears a red row, does not move the locks on `93cfb23`:

| | Lock on `93cfb23` | `ae3fd14` |
|---|---|---|
| trim identity, seed 42, opening 2030 | 1443 cuts, rng 1785272726 | same, per the #248 handoff |
| userOffers tag | 3242373722 | same |
| userOffers free agency | 691387436 | same |

Nothing to re-lock. Matt still has to sign #248. The signature is for the filter, not for a moved canary.

## What to sign, and the order

No baseline edit belongs in any of these branches.

1. **#248** (`ae3fd14`). The only code fix. Illegal 53s on all six panel leagues go to 0. Fingerprints held. Leave it a draft until Matt signs it, then it is the one to merge. The other reds are not a reason to hold the roster fix.
2. **Nothing else merges as code.** Home win, coherence, leverage, careers and staff are signatures, not patches.
3. **This note**, whenever, in a docs-only draft. It does not change a sim. One merge at a time, so it waits behind #248 if both are in the queue.

Signatures, in words:

- Accept seed 3 home win 50.985% as noise from the signed #250 pair (starting deals and trade acceleration together).
- Accept seed 1 coherence 82.86% as the same noise as the signed 82.07. #250 put it back there after #235 and #249 had cleared it.
- Accept seed 1 `EDGE.prs` +0.5 as noise from the signed #235 field-goal range. Seeds 2–5 have the right sign.
- Accept the careers pool 19/114, or re-lock that one max from a panel. The per-seed events moved. Do not tune the path.
- Re-lock `staff.leagueOvrDelta`, or accept a mean of 1.36, as the consequence of the signed #251 budget. Seed 1 is 1.499 with or without the roster fix.
