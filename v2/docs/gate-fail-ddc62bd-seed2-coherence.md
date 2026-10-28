# Gate fail on ddc62bd — coherence seed 2

Read-only investigation. No sim change, no dial change, no `baselines.json` edit, no re-lock, no canary edit. The calibration freeze stands. Matt signs any fix. The proposal at the bottom is no change.

HEAD is `ddc62bd` (staff panel-mean cap, #204). The parent is `8810097` (short quarterback unit, #205). The panel before that fix is `89bca4d` (empty-room emergency quarterback, #202). The seed-4 write-up for `89bca4d` is `docs/gate-fail-89bca4d-investigation.md` on `cursor/gate-fail-89bca4d-investigation-0202` (draft PR #203). That doc is not on this branch.

The attached `gate:full:serial` log (5 seeds) ends:

```
FAIL  coherence  exited 1
GATE FAIL  1 problem
```

`coherence.outlierExplainedPct` is a per-seed floor of 85 (`scripts/coherence.ts:336-339`, `docs/baselines.json` min 85). The process exits 1 when that seed is under the floor. The gate then fails the step because `coherence` is `exitGates` (`scripts/gate.ts`). The averaged `##M` is a separate check, and it is not a FAIL line on this panel.

| panel | seed 1 | seed 2 | seed 3 | seed 4 | seed 5 | mean |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `89bca4d` | 89.506 | 85.625 | 85.065 | 82.014 | 93.377 | 87.118 |
| `ddc62bd` (this log) | 89.610 | 83.673 | 85.714 | 86.429 | 92.806 | 87.646 |

Seed 2 is the only seed under 85 on this panel. Seed 4, which was the miss on `89bca4d`, is over the floor. The mean moved 87.12 → 87.65, which is above 85. `coherence.eliteCbSidesDrop` and `coherence.eliteCbShadowDrop` are inside their bands on every seed, including seed 2 (0.233 and 1.125). The exit is the outlier floor only.

The FAIL reprint in the log leads with Vandross Jr., 522 yards. That line is the biggest passing game in the failing seed. It is not an unexplained game. The harness prints the biggest game after the unexplained sample, and the gate reprints that tail.

**Verdict.** Not a sim bug. The 83.7 reading is deterministic. #205 reshuffled seed 2 from a sample that cleared the floor by one game (137/160) to a sample that misses it by two (123/147). #204 did not move a game. The 522-yard line is a labeled overtime shootout by the dressed quarterback.

---

## 1. Reproduction

`GG_SEED=2` mixes the harness base through `panelSeed` (`scripts/metrics.ts:66-73`). The five year-0 leagues are `newGame({ seed: seedFor(24680) + s * 1013 })` (`scripts/coherence.ts:44-48`). On this seed those are 1013879562, 1013880575, 1013881588, 1013882601, and 1013883614. The harness does not walk an offseason.

Official harness, this VM, `ddc62bd`:

```
GG_SEED=2 npx tsx scripts/coherence.ts 5
```

It printed the log's seed-2 block, including the same four unexplained passing lines, the same Vandross biggest line, the same corner trial, and:

```
##M coherence.eliteCbSidesDrop 0.23293820309045365
##M coherence.eliteCbShadowDrop 1.1252356095212654
##M coherence.outlierExplainedPct 83.6734693877551
BELOW TARGET (85%)
```

Exit 1. A second walk of the same five leagues, same scoring rules, same kickoff observer, produced the same 147 outlier lines in the same order. 83.6734693877551 is 123/147.

| kind | games | explained | rate |
| --- | ---: | ---: | ---: |
| 200+ receiving | 13 | 13 | 100% |
| 150+ rushing, running backs | 100 | 82 | 82% |
| 400+ passing | 34 | 28 | 82.35% (prints 82%) |
| weighted | 147 | 123 | **83.673%** |

85% of 147 is 124.95, so the seed needs 125 explained games. It is two short. 124/147 would still print under 85 (84.35%).

### What the scorer counts

A game is explained only when it has a talent reason and a second factor of any kind (`coherence.ts:175-176`). Talent is a short list:

- 150+ rushing yards, running back only: elite back (`z >= 0.6`) or a front seven at least 2.5 points under the league mean. Volume is 30+ team carries. Leading is a final margin of 7 or more. Bad weather is context.
- 400+ passing yards: elite quarterback (`z >= 0.5`) or a secondary at least 2.5 coverage points under the league mean. Volume is 42+ attempts by that passer.
- 200+ receiving yards uses the same shape, and on this seed it is fully explained.

`z` is that player's end-of-season overall against the league's rostered players at the position. A quarterback at 74 can clear `z >= 0.5` when the league mean sits in the mid-60s. On league 5 the quarterback mean is 66.32 and the sd is 11.65, so 74 is z 0.659. The "elite" line is about a 72 overall.

The log's heading "unexplained (no talent reason)" is wider than the words. The filter also rejects a talent reason that is the only reason. Two of the 24 misses are that case. The other 22 have no talent reason.

---

## 2. The 522-yard game, and the 24 that miss

### Hunter Vandross Jr. is explained

League 5, week 5, Baltimore 30, Carolina 27. Hunter Vandross Jr., QB 74, z 0.659, throw accuracy 70, throw power 77, decision 84. He started. He is QB1 at kickoff, ahead of Ira Sanchez (QB 73) and Joseph Torres (QB 51). Nobody else threw.

| | |
| --- | --- |
| line | 45/59, 522 yards, 4 TD, 0 INT, long 27 |
| score by quarter | 7-7, 6-3, 7-7, 7-10, overtime 3-0 |
| margin | +3 |
| weather | 85°F, wind 10, no precip |
| plays | 81 = 59 attempts + 16 rushes + 6 sacks |
| team rush yards | 47 |
| gross pass yards | 522, and the receivers sum to 522 |
| team pass yards | 471 |

Team pass yards are gross minus sack loss (`game.ts:1380`). Six sacks account for the 51-yard gap (522 − 471). Receiving yards match the passer. There is no second passer, no non-quarterback passer, and no double count.

The long is 27. Yards per attempt are 8.85 and yards per completion are 11.6, spread across five catchers, none over 164: Zamora WR 75 (15/20, 164), Hall Jr. WR 80 (12/14, 147), Roberts Jr. WR 71 (7/7, 93), Jones TE 77 (8/13, 85), Quarles RB 79 (2/3, 27). This is not one broken deep ball.

It is not garbage time. `decided` benches a winner only at a lead of 29, or 22 inside the last seven minutes, and a trailer at 27 or 20 (`game.ts:837-844`). A three-point game, including the overtime, never crosses that. `onField` stays on slot 0 (`game.ts:850-854`). He was supposed to throw.

The explainer's reasons are the ones it printed: elite quarterback, weak secondary, high volume, clean conditions. The opponent's top five defensive backs average coverage 69.4 against a league 73.19. The weak line is 70.69, so the secondary clears it by 1.29 points. Arm quality on the signed formula (`tha`/`thp` centred on 70, `game.ts:1599-1600`) is about 1.02, two percent over a neutral arm. A 74 with a 77 arm and an 84 decision rating, against that secondary, in an overtime game that stayed one score, is a high-volume day the metric is built to accept.

On `89bca4d` a Vandross Jr. at QB 74 also appears, and he is a different game: league 5, week 3, 426 yards on 30/38, talent-only, unexplained. League 5 kept one outlier line across the fork. The 522 is not that box score run hotter.

### The six unexplained passing games

All six are the listed quarterback, and he is a quarterback. Non-quarterback attempts in these games: 0. Receiver yards equal passer yards in every one. Plays equal attempts + rushes + sacks. None is a 100-play clock.

| league / week | line | Y/A | long | plays | margin | why it misses |
| --- | --- | --- | --- | --- | --- | --- |
| L2 W7 | Dax Sanchez, QB 66, z 0.022, tha 54, thp 65, dec 69, 45/65, 516 yds, 2 TD, 1 INT | 7.94 | 52 | 75 (65 att, 9 rush, 1 sack) | +2 | volume and clean weather. Secondary is 1.95 coverage points short of weak (74.20 vs mean 74.75). Accuracy 54. The tight ends did the work: Roberts TE 82 caught 21/23 for 182, long 20; Ulrich TE 76 caught 8/9 for 119, long 52 |
| L1 W6 | Robert Roberts, QB 64, z −0.05, tha 69, thp 57, 32/50, 423, 2 TD, 1 INT | 8.46 | 35 | 72 (50 / 17 / 5) | −6 | volume and clean weather. Front of the secondary is 3.69 points short of weak. Best catcher is Perez WR 88, 9/11 for 130, long 25 |
| L1 W17 | Cameron Grimaldi, QB 64, z −0.05, tha 61, thp 74, 27/44, 418, 2 TD, 2 INT | 9.50 | 58 | 62 (44 / 12 / 6) | −15 | volume and trailing. 26°F, so weather is not "clean". No 200-yard receiver. The 58-yard catch is the long; the other 26 completions average about 14 yards |
| L1 W12 | Robert Ashcroft, QB 64, z −0.05, tha 60, thp 71, 31/55, 413, 1 TD, 5 INT | 7.51 | 50 | 66 (55 / 10 / 1) | −9 | volume, trailing, dome. Secondary is strong (coverage 81.4, gap 10.1). Five interceptions. Wilson WR 72 had 204 of it, which is its own receiving outlier and that category was fully explained |
| L5 W6 | Miguel Radcliffe, QB 71, z 0.401, tha 73, thp 77, 29/53, 407, 2 TD, 2 INT | 7.68 | 54 | 77 (53 / 21 / 3) | +8 | volume only. He is 0.099 z short of elite. Secondary gap is 7.51 the wrong way |
| L1 W14 | Ethan Osgood, QB 62, z −0.25, tha 66, thp 66, 39/57, 401, 2 TD, 1 INT | 7.04 | 24 | 84 (57 / 25 / 2) | +19 | volume only. Long 24, so this is dink-and-dunk at a league-average 7.0 Y/A. Secondary is 0.89 points short of weak. The lead is 19, under the 22/29 bench line, so he stays in |

Sanchez at 516 is the game that looks like the 522 and is not. Same shape, opposite label. One-score game, one passer, 75 plays, gross yards match the catchers, one sack explains the team net (516 vs 509). Y/A 7.94 with a 54 accuracy rating is a good day, not a record-efficiency day. The volume is 65 attempts, which is a fat tail (the traced team-attempt max in `nfl-reference.md` §5.4 is 751 for a season, not a game; a single Sunday at 65 is rare and the play count still closes). The explainer refuses it because he is an ordinary quarterback and the secondary is ordinary. That is the rule working. The weapons are real (an 82 overall tight end with 21 catches) and the passing rule does not treat a receiver as a talent reason. Adding that would be a new claim. It would also explain only this one game: 124/147 still fails.

Grimaldi at 9.50 Y/A is the hottest rate in the six. The box still closes, the long is 58 rather than a string of 80s, and he threw two interceptions while trailing. I do not have a second path (fallback, double count, clock) to hang it on.

### The 18 unexplained rushing games

Eight of these are the same week, player, and yard line as on `89bca4d`, where this seed scored 85.625. They are marked "same". They are not what pushed the seed under the floor.

| league / week | line | YPC | z gap | front gap | reasons | note |
| --- | --- | ---: | ---: | ---: | --- | --- |
| L5 W13 | Ramirez, RB 73, 220 on 33, long 48 | 6.67 | 0.116 | 4.68 | volume | above average, not elite |
| L2 W17 | Taylor Jr., RB 69, spd 59, elu 79, 214 on 30, long 35 | 7.13 | 0.476 | 5.80 | volume, leading, weather | margin +35, 83 plays, a blowout grind |
| L5 W3 | Sanchez, RB 72, 213 on 23, long 51 | 9.26 | 0.234 | 6.54 | volume | the 51-yard run does a lot of it; the other 22 carries average 7.4 |
| L2 W3 | Lopez III, RB 63, spd 59, 203 on 34, long 34 | 5.97 | 1.224 | 8.73 | volume | **same.** Bad back, strong front, already unexplained when the seed passed |
| L3 W14 | Hernandez, RB 72, 195 on 28, long 34 | 6.96 | 0.248 | 3.97 | volume, leading, weather | **same** |
| L4 W2 | Sanchez, RB 72, 190 on 35, long 40 | 5.43 | 0.082 | 11.05 | volume | **same.** 0.08 z short of elite, then volume would finish the pair |
| L4 W18 | Lockhart II, RB 81, z 1.52, 172 on 25, long 31 | 6.88 | elite | 4.12 | elite back | talent only. 25 carries, margin +5 (leading needs 7) |
| L5 W7 | Quarles, RB 68, 167 on 29, long 37 | 5.76 | 0.705 | 2.39 | volume, leading, weather | |
| L1 W6 | Wetzel, RB 72, 166 on 25, long 56 | 6.64 | 0.136 | 2.90 | volume, leading, weather | |
| L1 W13 | Radcliffe, RB 71, 162 on 29, long 30 | 5.59 | 0.264 | 4.40 | volume, leading, weather | |
| L2 W16 | Delacroix, RB 67, 162 on 22, long 45 | 7.36 | 0.726 | 6.08 | volume, weather | margin +1 |
| L3 W11 | Moore II, RB 74, z 0.584, 161 on 30, long 17 | 5.37 | 0.016 | 5.69 | volume | **same.** 0.016 z short of elite. Long 17, so no single burst |
| L2 W5 | Campbell, RB 70, 160 on 28, long 29 | 5.71 | 0.352 | 0.80 | volume, weather | front is 0.80 points short of weak |
| L3 W13 | Hernandez, RB 72, 157 on 22, long 56 | 7.14 | 0.248 | 1.76 | volume, leading | **same** |
| L2 W4 | Rodriguez, RB 71, 156 on 24, long 39 | 6.50 | 0.227 | 4.01 | volume, leading | **same** |
| L3 W11 | Ulrich, RB 74, z 0.584, 155 on 27, long 41 | 5.74 | 0.016 | 2.11 | volume, leading | **same.** Same z as Moore II, different back |
| L3 W4 | Moore II, RB 74, z 0.584, 151 on 29, long 38 | 5.21 | 0.016 | 8.26 | volume | **same.** His other game. Margin −22, strong front |
| L5 W5 | Rivera, RB 82, z 1.55, 150 on 14, long 38 | 10.71 | elite | 2.39 | elite back | talent only. 14 carries, margin +5 |

Moore II's two games and Ulrich's one sit 0.016 under the elite line and already have a second factor. Counting those three would put the seed at 126/147. Counting only Moore II's two would put it at 125/147 = 85.03%, which passes. Those two were already unexplained on `89bca4d` (z gap 0.008 there) and that seed still cleared 85.6 without them. Moving 0.6 to 0.58 would be fitting the line to this seed. It is not the cause of the drop.

Lockhart II and Rivera are the second-factor rule rejecting an elite back. Counting both would also land on 125/147. The seed-4 write-up measured the same class and did not treat it as the fix. Rivera at 10.7 yards a carry on 14 attempts is a short sample with a 38-yard run, which is why volume is the second factor he does not have.

Lopez III is the ugly one: a 63 with 59 speed, 6 yards a carry on 34 attempts, against a front 8.7 points the wrong side of weak. The metric is right to leave him unexplained. He was already in the passing sample. He is not new.

No unexplained rusher has a non-quarterback throwing the game, and none of the lines fail the carry arithmetic in a way that looks like a double count. The biggest rushing game on the seed is White Jr., RB 84, 254 on 29, and he is explained (elite, weak front, volume, leading, weather).

### Non-quarterback passers, checked and set aside

Seed 2 on `ddc62bd` has two games in which a non-quarterback threw, 56 attempts and 338 yards between them. Neither is a 400-yard outlier. They are not in the 24.

Both are Philadelphia in league 2.

Week 13, Philadelphia 30, New Orleans 10. Kickoff chart: Jaylen Young QB 48 healthy, Nico Zeller QB 75 already out two weeks, Hunter Thomas QB 77 on IR. No practice-squad quarterback on the club. Passers: Young 22/34 for 200, and Daniel Cortland, LB 83, 16/21 for 186, long 24. Cortland is not on the quarterback chart. `buildStarters` will not fill the second quarterback slot with another position while Young is dressed (`game.ts:146`). `nextAvailable` returns before that fallback while the unit is non-empty (`game.ts:555`). The path that still puts Cortland in is the empty unit: Young leaves hurt, `emergencyQuarterback` finds nobody, and the any-position line runs. Cortland's `started` flag is the linebacker start, not a quarterback start (`game.ts:75-81`).

Week 14, Washington 23, Philadelphia 9. Zeller and Young are both hurt (one week each) and Thomas is still on IR. Carlos Garcia, TE 85, is the only passer: 14/35, 152 yards, 4.3 per attempt, long 23. The room is empty at kickoff. That is `buildStarters`'s existing empty-room fallback, the one #202 left in place when no sat or practice-squad quarterback exists. `dressEmergencyQuarterbacks` has nobody to elevate.

On `89bca4d` the same seed has 11 such games, 82 attempts and 389 yards, and every one of them still has a healthy quarterback on the kickoff chart. The attempt counts are the short relief the seed-4 note described: an edge 7/14, a center 3/9, a corner 8/9 and 4/12, a kicker 3/9, a linebacker 3/7, a running back 3/8. That is the dressed-quarterback hole #205 closed. It is not what remains, and it is not the 522.

---

## 3. #205 moved the sample. #204 did not.

Seed 2, same harness rules, three commits:

| commit | what it is | explained | outliers | rate | non-QB pass games |
| --- | --- | ---: | ---: | ---: | ---: |
| `89bca4d` (#202) | emergency quarterback only on an empty room; any-position fallback still fills a short unit | 137 | 160 | **85.625** | 11 |
| `8810097` (#205) | `nextAvailable` returns while a quarterback is still dressed | 123 | 147 | **83.673** | 2 |
| `ddc62bd` (#204) | staff cap is the panel mean | 123 | 147 | **83.673** | 2 |

`8810097` and `ddc62bd` have the same 147 outlier lines. Not the same rate from a different list. The same list. #204's diff is `staffcheck.ts`, `staffLeagueOvrDelta.ts`, `staffLeagueOvrDelta.test.ts`, `gate.ts`, `package.json`, and `HANDOFF.md`. It does not touch `lib/core/sim`. A second run on `ddc62bd` matched the first list. This is not the staff failure from the `89bca4d` panel, which did not reproduce on a second run.

`89bca4d` reproduces the prior panel's 85.625 (137/160) on this VM. 160 × 0.85 is 136, so that seed cleared by one game. The #205 list needs 125 and has 123.

The five leagues do not all move.

| year-0 league | `89bca4d` outliers (unexplained) | `ddc62bd` outliers (unexplained) | identical outlier lines |
| --- | --- | --- | --- |
| 1 | 26 (2) | 34 (6) | 4 |
| 2 | 40 (8) | 28 (6) | 8 |
| 3 | 33 (5) | 31 (5) | 29 |
| 4 | 28 (3) | 29 (2) | 7 |
| 5 | 33 (5) | 25 (5) | 1 |

League 3 is almost the old list. Leagues 1, 2, 4, and 5 fork, which is what an in-game substitution change does once the first injury changes who is on the field and therefore which later random numbers get drawn. Forty-nine outlier lines are shared. Eight of the 24 unexplained lines are shared, all rushing, listed above. All six unexplained passing games are new. The unexplained count went from 23 to 24 while the denominator fell from 160 to 147, and the explained count fell from 137 to 123. The rate moved about two points. No single league collapsed, and no single game is the miss.

### The other seeds

I re-ran seed 2 at all three commits. I did not re-run seeds 1, 3, 4, and 5. Their figures are the two panels. Seed 4 on the `ddc62bd` log is 86.428571 (121/140), the same `##M` the #205 note in `HANDOFF.md` recorded on `8810097`. Seed 2 is identical between those two commits, and #204 does not touch the sim, so the rest of the panel movement is #205 as well.

| seed | `89bca4d` | `ddc62bd` | movement |
| --- | ---: | ---: | --- |
| 1 | 89.506 | 89.610 | still clear |
| 2 | 85.625 | 83.673 | the miss, two games short |
| 3 | 85.065 | 85.714 | still clear, was the closest after seed 2 |
| 4 | 82.014 | 86.429 | the #205 repair |
| 5 | 93.377 | 92.806 | still clear |
| mean | 87.118 | 87.646 | above 85 either way |

#205 took one seed from under the floor to over it and another from one game over to two games under. The mean went up. Reversing the guard would hand seed 4 back the miss the guard was signed to close.

The seed-42 user-offer canary on this tree still matches the signed pair. `npx tsx lib/core/userOffers.test.ts` passed: tag `1777473079`, free agency `3280841901` (`lib/core/userOffers.test.ts`). #205's note already recorded that adding the guard did not move that pair. #204 does not draw.

---

## 4. Proposed fix (not applied)

**No change.** Do not edit `game.ts`, `coherence.ts`, `baselines.json`, or the canary.

Leave the floor at 85. Leave the z lines and the 2.5-point front and secondary lines. Leave the #205 guard. Do not re-lock `outlierExplainedPct`. The red line is a seed that was one game over the floor, reshuffled by a fix that closed a real backup-quarterback hole, and landed two games under. The games that miss are the rule as written: a mediocre back or quarterback with volume, or an elite back with no second factor. A handful sit on the 0.6 z line. The 522-yard game is not one of them.

What this does to the other seeds: nothing, because nothing is edited. They stay at the `ddc62bd` panel (89.6 / 83.7 / 85.7 / 86.4 / 92.8). The canary stays tag `1777473079`, FA `3280841901`.

These were considered and are not the proposal.

1. **Revert `game.ts:555`.** That is the #205 guard. Seed 2 goes back to 85.625 (measured). Seed 4 goes back to 82.014 (measured on `89bca4d`, and the reason #205 exists). The dressed-quarterback fallback returns: non-quarterbacks throw the short relief while a quarterback is up. The canary did not move when the guard was added, so taking it out is not expected to move tag `1777473079` / FA `3280841901` either. It is still the wrong trade. Seed 4 fails again, and the mean is not the problem.

2. **Lower the floor** in `scripts/coherence.ts` (`THRESHOLD`) and `docs/baselines.json` (`coherence.outlierExplainedPct` min 85). The averaged metric already passes at 87.65. The exit is the per-seed floor, on purpose. A floor that accepted 83.7 would also have accepted seed 4 at 82.0. That is the softening the seed-4 note said not to do.

3. **Move the running-back elite line** in `scripts/coherence.ts` from `z >= 0.6` to something under 0.584, so Moore II's two games count. This seed would print 125/147 = 85.03% and exit 0. Those two games were already unexplained on the 85.6 sample. The other seeds were not re-scored under that line. It changes what the guard measures so this seed passes. That is a lead decision, and it is not justified by a bug in the games.

4. **Drop the second factor** so an elite player with no other reason counts. Lockhart II and Rivera would flip, and this seed would also scrape over 85. Same answer as the seed-4 investigation: the second factor is the metric, and it is not what moved the seed.

The empty-room fallback that put a tight end under center for Philadelphia in week 14 is the signed behavior when the room is actually empty. It is not in the outlier set. I would not change it to chase 83.7.
