# Why a receiver still gains 2,000 yards

**UNSIGNED.** Finding only. This note does not change the sim, a test, a dial, or `docs/baselines.json`. It does not re-lock a guard. Matt signs any fix.

The question is why a single season still reaches 2,000 receiving yards after the target-share saturation in draft PR #222 (`cursor/target-share-saturation-a151`, head `d4517e0`). The example in the question is 2,067 yards on seed 7 at about a 30% target share, and a separate 30-season playtest line of 2,181 yards on 187 catches. Target concentration, by itself, does not explain a share that sits inside the NFL range.

## The short answer

A 2,000-yard season in this sim is too many catches at an ordinary yards per catch.

On the saturated build, seed 7, 2030, William Ellington gained **2,067 yards on 161 catches and 193 targets**. That was **31.7%** of his club's 608 targets. The traced club maximum is 33.1%, so the season knee never really engaged: across the year his target weight averaged **0.988**. He caught **83.4%** of those targets. The traced yards leader catches **73.4%** (130 of 177, `nfl-reference.md` §5.7). His yards per catch were **12.84**, which is **0.68 below** the traced leader's 13.52, not above it. The air on his open catches averaged 8.37 yards and the yards after the catch averaged 5.03. Neither is the piece that clears 2,000.

The same gap between his route-running and the coverage he faced is what pushes the catch rate up. It is also an input to the target weight and to the air-yards multiplier. PR #222 discounts only the target weight, and only after the share has passed the NFL maximum. Ellington's share did not pass it. A second shape still clears 2,000 as well: a 73% catch rate, which is the NFL rate, on 223 targets, because the saturation's bend is too shallow to take those targets away. Yards after the catch and air yards are not the out-of-range stat on either shape.

## What was measured

Two panels, same harness, regular season only. `newGame({ seed })` for seeds **42, 1, and 7**, then twenty aged seasons, 2026 through 2045. The offseason between them is the real one, so the roster turns over. Playoff yards are not on the season line. The user's club is unmanaged, the same bias `scripts/drift.ts` already carries. One season is 272 games.

| panel | commit | what it is |
|---|---|---|
| main | `7fff4d0` | current main, no target-share saturation |
| #222 | `d4517e0` | main plus the saturation in `lib/core/sim/game.ts` |

Sixty leader-seasons on each panel. The first eight seasons are inside this window. Seed 7's 2,067 is year five, 2030, so it is inside those eight.

Air yards and yards after the catch are not on the box. They were read off the open-catch path by a counter that does not draw a random number. Contested catches, which have no separate air and yards-after split, were counted on their own. On every one-club leader the counter's targets, catches, and yards matched the season line. That counter is not in this branch.

The two panels are not a paired before-and-after. The saturation changes which receiver is chosen, and the rest of the league follows. Read them as two draws.

One accounting note. A traded player's season line adds every club together, and the per-club share above uses the club where he was targeted most. Two of the sixty saturated leaders changed clubs. Logan Scott, seed 7, 2037, gained 2,022 yards on **204 targets and 158 catches (77.5%)** across four clubs. His biggest club was not a 20% share of the league. The corrected target total is the one used in the means below.

## The 2,067 on seed 7

Saturated build, seed 7, 2030. William Ellington, WR, New Orleans, west-coast identity, age 25, overall 92. One club, 17 games.

| | Ellington | traced #1 (§5.7) |
|---|---:|---:|
| yards | **2,067** | 1,743 ± 128 |
| targets | 193 | 177 |
| receptions | 161 | 130 |
| target share | **31.7%** of 608 | club #1 mean 23.2%, p90 28.8%, max **33.1%** (§5.13) |
| catch rate | **83.4%** | 73.4% (130 / 177) |
| yards / target | 10.71 | 9.82 |
| yards / catch | **12.84** | 13.52 |
| air per open catch | 8.37 | not traced |
| yards after, per open catch | 5.03 | not traced |

The reference does not publish an air-yards or yards-after series. The comparable traced numbers are yards per catch and yards per target. His yards per catch are under the leader. His yards per target are over the leader only because he catches so many of the targets.

Holding the other two numbers where they were:

- At a 73.4% catch rate instead of 83.4%, the same 193 targets and the same 12.84 yards per catch are **1,819 yards**.
- At 177 targets instead of 193, the same catch rate and the same yards per catch are **1,896 yards**.

The catch rate is the larger of the two pushes, and it is the one that crosses 2,000. The extra sixteen targets are real and smaller. The short yards per catch pulls the other way: 161 catches at the traced 13.52 would have been about 110 yards more, not less.

His biggest week was week 12: **19 catches on 22 targets, 248 yards, 46.8%** of a 47-target day. The traced single-game reception maximum is **18** (§5.13). The game knee is 48.6% of that game's targets. This week was under it, so the game bend did not fire. Nineteen catches is already past the traced maximum while the share is still legal.

The season was not one spike. Take the 248-yard week out and the other sixteen games are still 1,819 yards.

The neighboring season is the 29% case. Same player, 2029: **1,926 yards, 155 catches, 188 targets, 29.9% share, 82.4% catch, 12.43 yards per catch.** The saturation was actually on that year (average weight 0.851, over the knee for part of the year) and the season still finished at 1,926, because the catch rate did not move.

## What is out of the NFL range, and by how much

Traced comparison, both panels, sixty seasons. Leader means use the corrected target totals. Yards per catch and the rank yards do not depend on that correction.

| | NFL | main `7fff4d0` | saturated `d4517e0` |
|---|---:|---:|---:|
| yards leader, mean | 1,743 ± 128 | 1,701 (sd **213**) | 1,674 (sd **190**) |
| yards leader, max | 1,947 listed | **2,174** | **2,087** |
| seasons at 2,000+ | none in the 7-year window | **5 of 60** | **7 of 60** |
| seasons at 1,900+ | — | 13 of 60 | 9 of 60 |
| #5 yards | 1,365 | 1,305 | 1,304 |
| #10 yards | 1,208 ± 65 | 1,136 | 1,147 |
| leader targets | 177 | 177 | 171 |
| leader receptions | 130 | **136** | 131 |
| leader catch rate | 73.4% | **77.0%** | **76.8%** |
| leaders who caught 80%+ | — | **18 of 60** | **18 of 60** |
| leader yards / target | 9.82 | 9.70 | 9.87 |
| leader yards / catch | 13.52 | **12.58** | **12.84** |
| club #1 target share, mean | 23.2% | 22.6% | 22.5% |
| club #1 target share, max in the panel | 33.1% | **41.4%** | **35.6%** |
| league completion | ~65% | 64.5% | 64.4% |

The center of the leaderboard is a little short of 1,743, on both builds. Yards per target for the average leader are on the traced 9.82. The spread is the failure: a standard deviation of 190 to 213 against a traced 128, and a maximum 300 to 400 yards past every leader the reference lists. The highest receiving #1 the reference names in the 2018–2024 check is 1,947 (2021). 2,067 is 324 yards over the 1,743 mean.

Catch rate is the rate that is high. The average leader catches about 77% against 73.4%, and in eighteen of the sixty seasons he catches 80% or more. Yards per catch are low, by about two thirds of a yard to a yard. Rank 5 and rank 10 are short of 1,365 and 1,208, not long. The qualified group, anyone with 80 or more targets, sits at about **7.3 yards per target and a 66% catch rate** in the middle. The heat is the top of the board, not the league.

Single-game receptions, from the weeks of the big seasons, against a traced maximum of 18:

| panel | week | line | share of that game |
|---|---|---|---|
| saturated, seed 1, 2041 | Ashcroft, week 6 | **20 catches** on 27 targets, 201 yards | 49.1% |
| saturated, seed 7, 2030 | Ellington, week 12 | **19** on 22, 248 yards | 46.8% |
| saturated, seed 1, 2040 | Jacoby, week 15 | **18** on 20, **351 yards** | 60.6% |
| main, seed 1, 2045 | Ashcroft, week 10 | **23** on 26, 285 yards | 56.5% |

Jacoby's 351-yard week is the one place a long-play week is doing real work. His season was 2,035. Without that week the other sixteen games are 1,684. Ellington's 2,067 does not have a week like that.

The 187-catch playtest line was not in this window. The high reception totals here were 173 on main (Blake Nelson, 2,081 yards, 84.0% catch) and 163 on the saturated build (William Boseman, 2,014 yards). The shape is the same: a catch total well past the traced leader's 130, at a yards per catch that is not.

## What is not out of range

**Yards per catch, air yards, and yards after the catch.** The saturated leader averages 12.84 yards a catch against a traced 13.52. His open catches split about 8.5 before the catch and 5.2 after it. Across the seasons that actually cleared 2,000, yards per catch ran from 12.36 to 14.28. The §5.7 rank table runs from 13.52 at the leader to 14.39 at rank 3 and 13.71 at rank 10. The hot seasons are inside that band or below it. The one clear exception on main is William Ellington in 2027, seed 7: 1,981 yards, 12.01 per target, **15.24 per catch**, 11.54 air yards on the open catches, separation gap +20. That is the air-yards season the question guessed at, and it stopped under 2,000.

**The sepEdge cap.** Air yards are scaled by `sepEdge = clamp(1 + (separation − coverage) / 180, 0.85, 1.22)`. On the saturated leaders the average multiplier was 1.09, and the 1.22 cap was hit on about 1% of open catches. The multiplier is real. It is a 10% stretch on a route that is short on roughly 80 to 85% of completions, which is why the yards per catch do not run away.

**League completion and the club's ordinary target share.** Completion for the whole league was 64.5% on main and 64.4% on the saturated build, inside the locked 66.7 ± 2.5 and next to the NFL note of 65. The average club's leading target share was 22.6% on main and 22.5% saturated, against a traced 23.2%. The saturation did not break the mean it was built to leave alone. `armQuality` is not the tail either. It is a passer term, centered at 70, and it does not know which receiver is open.

**The mean of the leader.** 1,674 and 1,701 are both under 1,743. A fix that lowers every catch in the league will make that mean worse and will press `calibrate.cmpPct`, which is already near the bottom of its band. The thing that is wrong is the width.

## Why the saturation does not catch Ellington

The bend is an exponential on the target weight, in `targetShareSaturation`. It is exactly 1 at or below the knee. The season knee is the traced club maximum, **33.1%**. The game knee is the traced single-game p99.9, **48.6%**. The season lambda is one e-fold across the 4.3-point gap from the p90 (28.8%) to that maximum, measured on Michael Thomas's 559-target season. The code comment calls that shape signed on 2026-11-10.

Ellington finished at 31.7%. He was over a running 33.1% in two weeks. His average weight for the year was 0.988, and the weight was actually reduced on 14% of the throws the model considered. The game knee never fired: no game of his was over 48.6%, and the 19-catch week was at 46.8%. A share in the high 20s or the low 30s is the region the function was written to ignore. That is why a 29.6% share, or this measured 31.7%, still produces the yards.

The same function does not stop a share that is barely past the knee, because the bend is shallow at the start of the excess and most of the targets are already banked before the running share gets there.

## The other season that still clears 2,000

Saturated build, seed 7, 2035. William Boseman, **2,014 yards, 163 catches, 223 targets, 35.1%** of a 636-target club. Catch rate **73.1%**. Yards per target **9.03**. Yards per catch **12.36**. Separation gap only +9. Air 7.90, yards after 5.28. This is the NFL catch rate on far too many targets. 177 of those targets at 9.03 yards would have been about 1,600.

His average saturation weight was **0.975**. The weight was reduced on 28% of the considered throws. He spent seven weeks over a running 33.1% and still finished with 223 targets, 46 more than the traced leader. The lambda is too gentle to pull a 35% season back to 177 targets.

Main, with no saturation, produces the same volume shape at a higher share. Seed 1, 2034, Andre Sanchez, **2,067 yards on 238 targets, 37.9% share, 68.9% catch, 8.68 yards per target**. That 2,067 is a different season from Ellington's. The catch rate is under the NFL leader and the efficiency is under it. The targets are the whole story. The saturated panel's worst club share was 35.6%, against 41.4% on main, so the bend does cut the far tail of the share. It does not cut it enough, and it does not touch the catch rate at all.

The seven saturated seasons of 2,000 or more:

| seed | year | player | yards | tgt | share | catch | yds/catch | average weight |
|---|---|---|---:|---:|---:|---:|---:|---:|
| 1 | 2041 | Omar Ashcroft | 2,087 | 193 | 33.2% | 80.8% | 13.38 | 0.858 |
| 7 | 2030 | William Ellington | 2,067 | 193 | 31.7% | 83.4% | 12.84 | 0.988 |
| 7 | 2034 | Logan Scott | 2,042 | 182 | 33.6% | 78.6% | 14.28 | 0.894 |
| 1 | 2040 | Isaac Jacoby | 2,035 | 182 | 33.3% | 79.7% | 14.03 | 0.915 |
| 7 | 2037 | Logan Scott, four clubs | 2,022 | 204 | — | 77.5% | 12.80 | 0.939 |
| 7 | 2035 | William Boseman | 2,014 | 223 | 35.1% | 73.1% | 12.36 | 0.975 |
| 42 | 2029 | Lincoln Delacroix | 2,007 | 195 | 33.6% | 80.0% | 12.87 | 0.918 |

Five of the seven caught 78% or more. Boseman is the target pile. Scott's 2,022 is four clubs added together. Jacoby's 2,035 includes the 351-yard week. Ellington is the clean rate.

## How the receiver's rating gets into the catch

Separation and coverage are the same two numbers in three places in `passPlay`.

```
separation = route × 0.55 + speed × 0.25 + agility × 0.20
coverage   = cover × 0.52 + speed × 0.31 + awareness × 0.17
```

On main that is `game.ts` around 1409 and 1442. The saturated file has the same formulas, later in the file because the saturation block sits above them.

1. The target weight multiplies by `clamp(1 + (separation − coverage) / 68, 0.40, 1.75)`, on top of the role bonus and the weekly boost (`game.ts` 1416–1427 on main). This is the term #222 discounts, past the knee.
2. The completion probability adds `edge(separation, coverage, 30) × 0.32`, where `edge` is a logistic, and then clamps the whole probability to **0.15–0.88** (`game.ts` 1463–1472 on main, 1539 on `d4517e0`).
3. Air yards are multiplied by `sepEdge`, the clamp described above (`game.ts` 1618 on main, 1694 on `d4517e0`). Yards after the catch are a draw around `2.60 + (elusiveness − 55) × 0.043 + (speed − 60) × 0.028`, minus the tackler's leverage, with a rare broken tackle on top (`game.ts` 1632–1640).

Ellington's measured gap was **+18.4** (separation 91.4, coverage 73.0). His ratings were route 98, speed 82, agility 84, hands 94, elusiveness 79. The logistic of an 18-point gap is about 0.65, and 0.65 × 0.32 is **+0.21** on a base of 0.533, before the quarterback and the hands are added. Hands at 94 add about +0.07. A good arm adds more, on the order of a tenth. Before red zone, pressure, and the down-and-distance penalties, that sum wants to be in the low 0.90s, and the clamp holds a single throw at 0.88. On his targets the average completion probability, penalties included, was **0.848**, and **55%** of them were sitting on that 0.88 cap. He caught 83.4%. The model did what it computed.

The same +18.4 becomes a sepEdge of `1 + 18.4 / 180 = 1.10`. Measured 1.105. That is a 10% longer throw, on a mix that was 86% short routes, and the yards per catch came out at 12.84. The gap is doing its damage in the completion probability. The air-yards use of the same gap is the smaller, and on this season it is not even pointing up relative to the NFL leader.

League completion stays at 64% because the average throw is not an 18-point gap. The qualified middle catches 66%. The leader's gap averaged +15.7 on the saturated panel. The gradient from the league to the number one is too steep, and the mean is already where the lock wants it.

## Packets, unsigned

Do not cut `sepEdge`, the yards-after formula, or `armQuality` to chase these seasons. The yards per catch are already short of the traced leader. That cut would reopen the shortfall §5.7 added `sepEdge` to repair, and it would not remove Ellington or Boseman. Do not move a league-mean dial. Do not edit `docs/baselines.json`. Measure the two packets separately. The leader mean is already 70 yards under 1,743 on the saturated panel, and doing both at once can push it further.

### 1. Compress the separation term inside the completion probability

**Scope.** The logistic in `completionP` only: `edge(separation, coverage, 30) × 0.32`, and the 0.88 cap only as the backstop it already is. A wider scale, or a smaller coefficient, re-centered so a neutral matchup completes what it completes today. Lowering the 0.88 cap by itself does not do this. Ellington's average probability was 0.848, so plenty of his throws are under the cap. The coefficient is the knob. Leave the target weights, the saturation, `sepEdge`, and `armQuality` alone in the same change.

**Files.** `v2/lib/core/sim/game.ts`, the `completionP` block in `passPlay`. Nothing else.

**Expected effect.** A gap of +18 stops producing a completion probability in the mid-0.80s. Ellington's season, 193 targets at 12.84 yards per catch, falls from 2,067 toward about 1,820 if the catch rate goes from 83% to the traced 73%, and the targets do not change. The same cut reaches Ashcroft (80.8%), Delacroix (80.0%), Jacoby (79.7%), and the main-build weeks of 23 and 20 catches. It does not reach Boseman or Sanchez, whose catch rates are already at or under 73%.

**Calibration risk.** `calibrate.cmpPct` is locked at 66.723 ± 2.5 and these panels completed 64.4–64.5% of their throws, near the bottom of that band and next to the NFL 65. There is little room to drop the mean. The change has to take from the top of the gap and give it back on the neutral throw, or the lock moves. `calibrate.passYds`, `passTd`, and `int` move if the re-centering is off, because completions are yards and the incompletions change the down-and-distance mix. `statcheck.wr10RecYds` is locked at 1,105.8 against an NFL 1,208, and this panel's #10 was 1,136 on main and 1,147 saturated, already under the NFL figure. A flatter catch-rate gradient can lower #10 as well as #1. `coherence.eliteCbShadowDrop` is yards per target with a shutdown corner on the number one. A real corner should still cost yards per target. A flatter curve makes that cost smaller. Do not retune the guard to hide it. No baseline edit until a signed re-measure says the mean held and the 2,000-yard count moved.

### 2. Steepen the season bend, and keep the knees

**Scope.** `SEASON_TARGET_SHARE_LAMBDA` only, on the saturation that #222 already added. The knees stay at the traced 33.1% and 48.6%. The current lambda is one e-fold across 4.3 points of share, which is why a 35.1% season still drew at an average weight of 0.975 and finished with 223 targets. A steeper lambda makes the weight fall once the running share is past 33.1%, without touching a 23% share or Ellington's 31.7%.

This will not fix the 19-catch week. That week was at 46.8%, under the game knee. On a 47-target day the game knee starts at about 23 targets. A receiver who catches what he is thrown is already past 18 receptions while the game weight is still 1. Steepening the game lambda trims targets after that point. It does not bring a legal share back under 18 catches. That is packet 1.

**Files.** `v2/lib/core/sim/game.ts`, the lambda constant next to `targetShareSaturation`. `v2/lib/core/sim/targetShare.test.ts` pins the current lambda and would have to move with it. That test is on the #222 branch. This packet is a change to that branch's saturation, not a new mechanism, and the code comment treats the present lambda as signed. A steeper one is a new sign.

**Expected effect.** Boseman's 223-target season, and the main-build seasons at 35–38% (Sanchez 238 targets, Pemberton 38.1%, Garcia 37.3%), lose targets. Redistributed targets stay in the game, so the club's passing yards should move less than the leader's yards. Ellington's 2,067 does not move, because his weight was already 0.988.

**Calibration risk.** `calibrate.passYds` is the one to watch, in case the shed targets become incompletions rather than someone else's catches. `statcheck.wr10RecYds` may rise if those targets land on the next receivers, which would be toward the NFL 1,208 rather than away from it. The leader mean can fall further under 1,743 if this packet and packet 1 land together. Run them as two measurements. A share under 33.1% is untouched on purpose. Lowering the knee toward the 28.8% p90 would start taxing seasons the reference still contains, and this note does not ask for that. No baseline edit.

## What this does not change

No engine edit, no test edit, no dial, no `baselines.json`, no re-lock. The counter used to split air yards from yards after the catch was local to the measurement and is not in this branch. The sixty-season panels are three aged franchises, not sixty fresh leagues, and the seasons inside one seed share a roster. That is the right comparison to a playtest. It is not a new tails baseline.
