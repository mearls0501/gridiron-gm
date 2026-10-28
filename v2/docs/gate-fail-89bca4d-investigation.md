# Gate fail on 89bca4d — coherence seed 4 and staff seed 3

Read-only investigation. No sim change, no `baselines.json` edit, no re-lock, no dial retune, no metric or band change. The calibration freeze stands. Matt signs any fix.

HEAD is `89bca4d` (empty-room emergency quarterback, #202). The parent panel is `86e7716` (waiver-clearing design note, #198). The commit between them on this path is `12d437f` (CPU roster refill, #201). `b49350d` is HANDOFF only.

The attached `gate:full:serial` log (5 seeds, 14 cores) ends:

```
FAIL  coherence  exited 1
FAIL  staff  exited 1
FAIL  staff.problems  0.20  expected <= 0
GATE FAIL  3 problems
```

Drift and sweep are not in that list. The third line is the staff failure counted again: `scripts/gate.ts` averages each seed's `staff.problems` (`gate.ts:344-349`), and one seed at 1 makes the panel mean 0.20. It is not a separate bug.

The two failures do not share a root cause.

---

## 1. Coherence — seed 4 at 82.0, under the 85 floor

`coherence.outlierExplainedPct` is a per-seed floor of 85 (`scripts/coherence.ts:336-339`, `docs/baselines.json` min 85). The process exits 1 when that seed is under the floor. The panel mean is not a FAIL line.

| panel | seed 1 | seed 2 | seed 3 | seed 4 | seed 5 | mean |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `86e7716` (as given) | 89.3 | 84.5 | 84.8 | 87.1 | 91.4 | 87.42 |
| `89bca4d` (this log) | 89.506 | 85.625 | 85.065 | 82.014 | 93.377 | 87.118 |

Seed 4 is the only seed under 85 on this panel. Seeds 2 and 3, which were under the floor on `86e7716`, are over it here. Seed 5 rose. The mean moved 87.42 → 87.12.

`coherence.eliteCbSidesDrop` and `coherence.eliteCbShadowDrop` are inside their bands on every seed in the log, including seed 4 (−0.156 and 2.361). The exit is the outlier floor only.

### What the scorer counts

A game is explained only when it has a talent reason and a second factor of any kind (`coherence.ts:175-176`). Talent is a short list:

- 150+ rushing yards, running back only: elite back (`z >= 0.6`) or a front seven at least 2.5 points under the league mean (`coherence.ts:131-139`). Volume is 30+ team carries. Leading and bad weather are context.
- 400+ passing yards: elite quarterback (`z >= 0.5`) or a secondary at least 2.5 coverage points under the league mean (`coherence.ts:150-159`). Volume is 42+ attempts.
- 200+ receiving yards uses the same shape (`coherence.ts:115-120`).

The harness plays five independent year-0 leagues, `newGame({ seed: seedFor(24680) + s * 1013 })` (`coherence.ts:44-48`). It does not walk an offseason. `GG_SEED=4` mixes that to base seed 2027783852 (`scripts/metrics.ts:66-73`).

### Reproduction

Same thresholds as `scripts/coherence.ts`, one seed, no panel. Headline on `89bca4d` is 82.014388, the log's `##M` (114 explained / 139). `86e7716` and `12d437f` both print 87.096774 (135 / 155), which is the prior panel's 87.1. The `86e7716` and `12d437f` game lists are the same list. #201 does not move this seed.

| commit | receiving | rushing | passing | weighted |
| --- | --- | --- | --- | --- |
| `86e7716` | 15/15 = 100% | 83/99 = 83.84% | 37/41 = 90.24% | **87.10** |
| `12d437f` (#201) | same list | same list | same list | **87.10** |
| `89bca4d` (#202) | 17/17 = 100% | 68/87 = 78.16% | 29/35 = 82.86% | **82.01** |

82.01 is 4.15 games short of 85% of 139 (need 119 explained, have 114).

### Which games are unexplained on seed 4

Receiving is fully explained. The 25 misses are 19 rushing and 6 passing. Sixteen rushing games have no talent reason. Three rushing games and two passing games are talent-only: the player is elite and nothing else on the list fires, so the second-factor rule rejects them.

The log's printed sample is the top of that list. The full set, with how far each talent factor missed:

Rushing, no talent reason (16). `zNeed` is how far the back is under 0.6. `frontGap` is how many points the front sits above the "weak" line (league mean − 2.5).

| league / week | line | why it misses |
| --- | --- | --- |
| L5 W15 | Anderson, RB 73, z 0.52, 228 on 33, front gap 0.54, 41 carries | volume only. 0.08 z and 0.54 front points from a talent reason |
| L2 W8 | Caldwell, RB 72, z 0.47, 211 on 20, front gap 5.17, 23 carries | nothing. Ordinary back, strong front, low volume |
| L3 W16 | Allen, RB 71, z 0.27, 209 on 27, front gap 8.09, 34 carries | volume against a strong front |
| L4 W12 | Quarles, RB 70, z 0.24, 204 on 36, front gap 1.55, 44 carries | volume and a lead. Front is 1.55 points short of weak |
| L3 W13 | Hill II, RB 63, z −0.70, 171 on 26, front gap 3.52 | volume. The back is bad |
| L2 W1 | Adams II, RB 73, z 0.59, 168 on 27, front gap 2.75, 50 carries | 0.01 z short of elite, then volume, lead, and weather would explain him |
| L1 W14 | Holloway, RB 74, z prints 0.60, zNeed 0.00, 167 on 27 | just under 0.6. Volume and weather are already true |
| L5 W6 | Xiong, RB 71, 162 on 26, front gap 3.19 | volume and a lead |
| L2 W1 | Cortland II, RB 64, 161 on 20, front gap 5.32 | volume |
| L5 W3 | Ingersoll, RB 73, z 0.52, 161 on 31, front gap 8.11 | volume and a lead, strong front |
| L2 W17 | Fitzgibbon, RB 67, 160 on 35, front gap 5.46 | volume and a lead |
| L3 W8 | Hill, RB 71, 158 on 35, front gap 5.16 | volume |
| L5 W1 | Baker, RB 72, z 0.41, 155 on 21, front gap 8.04 | volume, strong front |
| L2 W1 | Roberts III, RB 72, 153 on 23, front gap 3.39 | volume and a lead |
| L3 W14 | Gonzalez, RB 65, 150 on 23, front gap 3.52 | volume |
| L5 W15 | Xiong, RB 71, 150 on 27, front gap 8.04 | volume and a lead, strong front |

Rushing, talent only (3). The back is elite and the second factor is absent:

| league / week | line | missing second factor |
| --- | --- | --- |
| L2 W11 | Ellington, RB 90, z 2.55, 162 on 19, front gap 12.0 | 19 carries, strong front, not leading |
| L5 W1 | White, RB 75, z 0.76, 155 on 19, front gap 2.33 | 19 carries |
| L1 W4 | Montoya III, RB 89, z 2.28, 151 on 10, front gap 9.5 | 10 carries against a strong front |

Passing (6):

| league / week | line | why it misses |
| --- | --- | --- |
| L5 W15 | Lee II, QB 81, z 1.59, 423 on 28/36, secondary gap 4.62 | elite, and that is the only factor. 36 attempts, need 42 |
| L1 W11 | Carter, QB 63, z −0.23, 417 on 41/57, secondary gap 3.36 | volume and clean weather. Not a good quarterback, not a weak secondary |
| L3 W1 | Ramirez, QB 68, z 0.28, 417 on 33/57, secondary gap 0.72 | volume and trailing. The secondary is 0.72 coverage points from "weak" |
| L5 W15 | Delacroix, QB 65, z 0.02, 416 on 36/53, secondary gap 6.22 | volume and clean weather, against a strong secondary |
| L1 W12 | Prescott, QB 94, z 2.67, 404 on 30/38, secondary gap 1.56 | elite only. 38 attempts, need 42. Secondary is 1.56 points from weak |
| L5 W8 | Davis Jr., QB 69, z 0.41, 400 on 42/59, secondary gap 6.22 | volume and clean weather. z is 0.09 under elite |

One rushing game (Anderson) is inside both talent notches. One rushing game (Holloway, and Adams II at 0.01 z) is an elite-line rounding miss. One passing game (Ramirez) is 0.72 coverage points from a talent reason. The other 21 are the rule working as written: a mediocre back or quarterback with volume, or an elite player with no second factor. Five of the 25 are the second-factor rule rejecting an elite player. Counting those five as explained would put the seed at 119/139 = 85.6%. That would be a scorer change. The same class of rejection is already in the `86e7716` list (Ellington, White, Montoya III, Prescott, and Jones at QB 87), and that seed still cleared 87.1. Softening the second factor is not what moved seed 4.

### Where #202 moves the games

The five year-0 leagues do not all move.

| year-0 league | `86e7716` outliers (unexplained, explained %) | `89bca4d` outliers (unexplained, explained %) |
| --- | --- | --- |
| 1 | 26 (4, 84.6%) | 26 (4, 84.6%) |
| 2 | 29 (5, 82.8%) | 27 (6, 77.8%) |
| 3 | 36 (3, 91.7%) | 21 (5, 76.2%) |
| 4 | 32 (1, 96.9%) | 32 (1, 96.9%) |
| 5 | 32 (7, 78.1%) | 33 (9, 72.7%) |

Leagues 1 and 4 keep the same outlier count and the same unexplained games (Holloway, Montoya III, Carter, Prescott, Quarles). League 3 is the move: 15 fewer outlier games, explained rate 91.7% → 76.2%. Leagues 2 and 5 move by a few games. Caldwell, Quarles, Adams II, Ellington, Cortland II, Xiong's 162-yard game, Ingersoll, Baker, White, Roberts III, Montoya III, Carter, Prescott, and Davis Jr. are on both lists with the same yard lines. This is not a fresh sample of five leagues. It is the old sample with leagues 2, 3, and 5 forked.

#201 cannot fork it. `refillCpuRostersAfterWaivers` runs only from `finalizeOffseason` (`lib/core/offseason/index.ts:340-346`, `contracts.ts:1529-1541`). Coherence's first `advance` on a new game is `startRegularSeason` (`lib/core/season/engine.ts:187-189`). The regular-season loop stops when the phase leaves `"regular"` (`coherence.ts:48`). The offseason refill never runs. The identical `86e7716` / `12d437f` lists are that fact, measured.

#202 is the fork. `buildStarters` calls `emergencyQuarterback` only for an empty room, and it refuses to fill a short quarterback unit with another position once any quarterback is dressed (`game.ts:134-152`). `nextAvailable` now has the empty-room half of that rule (`game.ts:545-552`). It does not have the other half. After a quarterback is removed, `ROTATION.QB` is still 2 (`lib/core/types.ts:78`), so the unit is short while the other quarterback is still in it (`unit.length === 1`). The emergency call is skipped. The next line takes the first other healthy body on the roster (`game.ts:554`). In a decided game `onField` steps from slot 0 to slot 1 (`game.ts:848-852`), so that body throws the backup attempts.

That is the disagreement already written on this commit in `docs/HANDOFF.md` (2026-10-24, the #202 entry): the signed text only gates the emergency helper, and the any-position fallback is unchanged. Before #202, the same slot was an unsat or practice-squad quarterback (`game.ts:545-552` on `86e7716`). The `86e7716` investigation (`fc5df99`) asked for the empty-room gate because that unsit was the drift crash. #202 is that gate. The coherence number moves because the decided-game backup changed, and leagues that hit the injury path then diverge. Leagues that never fill that slot stay on the old list.

### Verdict

Seed variance around a floor the panel still clears, on top of one real leftover in `nextAvailable`.

The scorer did not change between `86e7716` and `89bca4d`. The panel mean did not move in any way that says outliers got less explicable (87.42 → 87.12). The prior panel already had two seeds under 85. This panel has one, and it is a different seed. The misses are the same kinds of games the rule already rejects: volume without a talent factor, and an elite player with no second factor. A handful sit on the 0.6 z line or the 2.5-point front/secondary line.

The seed-4 number itself did move, and the cause is #202, not #201 and not noise on unchanged code. Unchanged code reproduces 87.10. #202 reproduces 82.01. The games that move are the year-0 leagues that take the new backup, especially league 3.

### PR #185

#185 does not share this cause.

#185 is merged (2026-10-21, `0a17239`), not an open draft. Its body and `docs/HANDOFF.md` (2026-10-20, "Trade cap accounting") record fast-tier `--seeds 1` only, and say the full tier was not run. There is no seed-4 coherence figure in the PR body, the PR comments, or the commit history. The coherence floor misses HANDOFF actually records on the panels around that work are other seeds: seed 1 at 84.62 (the long 84.6 / 90.6 / 87.7 / 87.7 / 86.4 series) and seed 2 at 84.91. Seed 4 on those series is above 85 (86.4 to 90.4). Those misses are the same per-seed floor. They are not the #202 backup path. #185 does not touch `nextAvailable`.

The open draft on `claude/dazzling-pasteur-02nh3y` is #200, the earlier emergency-quarterback proposal. Its body does not mention coherence. #201 and #202 are the versions that landed.

### Proposed fix (not applied)

Leave the floor at 85. Do not re-lock `outlierExplainedPct`. Do not retune the z lines or the 2.5-point front and secondary lines. Those are the metric.

The code change, if Matt wants the leftover closed, is the one HANDOFF already states and did not apply: in `nextAvailable`, do not take the any-position fallback for quarterback while `unit.length > 0`. That is the guard `buildStarters` already uses at `game.ts:146`. Do not put the pre-#202 `emergencyQuarterback` call back. That unsit is the drift crash #202 closed. Leaving the second slot empty keeps decided-game attempts on the quarterback who is already in the unit (`onField` stays on slot 0 when the unit length is 1).

Do not treat a return to 87.10 as the test. 87.10 is the unsit series. The test is that a decided game does not hand attempts to a non-quarterback while a quarterback is still up, and that drift still finishes. Coherence seed 4 will move. It does not have to land on 87.

---

## 2. Staff — seed 3, league mean 63.72 vs 65.10, delta 1.38

`staff.problems` max is 0 (`docs/baselines.json`). `staff.leagueOvrDelta` max is 1.2, on the panel mean. The harness also applies 1.2 inside the process, per seed (`scripts/staffcheck.ts:135-138`): `Math.abs(splitOvr - neutralOvr) < 1.2`. One seed over that line increments `problems` and exits 1. The gate then averages the five problem counts.

This log:

| seed | neutral | specialised | delta (`##M`) | problems |
| --- | ---: | ---: | ---: | ---: |
| 1 | — | 64.65 | 0.761 | 0 |
| 2 | — | 64.59 | 0.626 | 0 |
| 3 | 63.72 | 65.10 | 1.377 | 1 |
| 4 | 63.28 | 64.21 | 0.928 | 0 |
| 5 | 64.02 | 65.20 | 1.175 | 0 |
| mean | | | **0.973** | **0.20** |

`staff.leagueOvrDelta` is not a FAIL line. The mean 0.973 is under 1.2. Seed 5 is 1.175, 0.025 under the same per-seed line that seed 3 misses by 0.177. The other three checks on seed 3 passed in the log: concentration 4.40 OVR, potential wall 0, scheme scoring −0.06. `overPotential` is 0.

The five deltas span 0.63 to 1.38. The sample standard deviation is about 0.30. 1.2 sits under the top of that spread. One seed in five over the line is 0.20, which is the arithmetic of the #182 report.

### Same noise as a393ac9, or a new defect

Same guard, different draw. Not the field-goal clock, and not a new inflation bug in #201 or #202.

HANDOFF (2026-10-18, #182 finish) records `a393ac9` as GATE FAIL with `staff.problems` 0.20, and calls it noise: staff seed 2 at 1.31 against 1.2, panel mean 0.58. Matt left that red line reported. The max stayed 0. The 1.2 bound was not widened. `takeLastKick` in that commit reshuffled the stream from week 1. That commit is an ancestor of both panels here. Seed 2, the seed that was at 1.31, is 0.626 on this log.

The shape matches: one seed over a per-seed copy of the panel-mean cap, pooled problems 0.20, panel mean inside 1.2, wall intact. The seed does not match, and the clock-rule stream is not this stream.

### Reproduction

`GG_SEED=3` is seed 1520860546, the seed printed in the log. Official harness, this VM, `89bca4d`:

```
GG_SEED=3 npx tsx scripts/staffcheck.ts 8
```

| | neutral | specialised | delta | spread | problems |
| --- | ---: | ---: | ---: | --- | ---: |
| attached log | 63.72 | 65.10 | 1.377 | 7.62 · 7.87 | 1 |
| this rerun | 63.72 | 64.46 | 0.737 | 7.62 · 8.16 | 0 |

The neutral league matches the log (mean 63.72 and spread 7.62). The independent probes match the log's `##M` digits: focus gain 4.4, ceiling gain 3.792275098684803, scheme scoring delta −0.06315789473684319, sample size 15, over-potential 0. The specialised 8-year league does not match (64.46 vs 65.10, spread 8.16 vs 7.87, scheme-fit mean 0.0174 vs the log's 0.0152). The rerun passes the 1.2 check.

A replay of the same loop on `86e7716`, same seed, finished at delta 0.879 (neutral 63.96, specialised 64.84), also under 1.2. On this machine #201 plus #202 moved seed 3 from 0.88 to 0.74. They did not create a failing seed.

The 1.38 is one specialised trajectory of this seed. It is the number in the attached log. It is not what this commit produces on a second run. That is the noise.

### What the positive delta is, on the run that reproduces

The harness is built so an even 25/25/25/25 budget multiplies development by 1 (`lib/core/staff.ts:163-179`, `AGENTS.md` invariant 6). The specialised league is not even, and the two halves are not mirrors.

`normaliseBudget` of the harness inputs (`staffcheck.ts:111-116`) is development 85 / scouting 5 / training 5 / scheme 5 on even team ids, and development 5 / scouting 5 / training 85 / scheme 5 on odd ids. Sixteen clubs each way.

| | development share | broad growth | named-player growth (3 names) | decline | injury risk |
| --- | ---: | ---: | ---: | ---: | ---: |
| dev-heavy | 0.85 | 1.54 | 2.19 | 1.10 | 1.22 |
| train-heavy | 0.05 | 0.82 | — | 0.80 | 0.55 |

Broad growth is `1 + (share − 0.25) * 0.9` (`staff.ts:171`). Named players also take `broad * (1 + perMan * 1.5)` (`staff.ts:178`). Decline and injury are `staff.ts:222-233`. Ceiling recovery runs only for a named player (`staff.ts:195-207`). Young players on the development half realize more of a ceiling, and the named ones have ceiling added back toward `pot`. The training half grows slower and ages slower. Those are not equal OVR. The baseline note on `staff.leagueOvrDelta` already says the mean rose from 0.11 to about 0.70 when scheme reached the play engine, which is why the bound is 1.2 rather than tight.

The wall held on both runs (`overPotential` 0). Allocation is not manufacturing players past `pot`.

On the reproduced `89bca4d` seed-3 run the pieces are:

| piece | result |
| --- | --- |
| year-end delta, years 1–8 | 0.209, 0.681, 0.471, 0.701, 0.397, 0.085, −0.010, **0.737** |
| players in both final active lists | 1649, specialised − neutral = **+0.40 OVR** |
| specialised only | 463 players, mean 54.76 |
| neutral only | 535 players, mean 54.28 |
| dev-heavy clubs | +0.49 OVR (n 1114 → 1113) |
| train-heavy clubs | +1.05 OVR (n 1070 → 999) |
| age under peak | +0.60 |
| age at or past peak | +1.03 |
| OVR under 60 | 759 neutral, 687 specialised |
| OVR 80+ | 169 neutral, 193 specialised |

The gap is not a smooth 0.17 a year from the development multiplier. Through year 7 the delta is between −0.01 and 0.70. Year 8 opens it: the neutral mean falls 64.596 → 63.721 while that league adds 119 active bodies (2065 → 2184). The specialised mean stays put (64.586 → 64.458, n 2111 → 2112). The same players who exist in both leagues are 0.40 apart. The rest is who is on the roster, including 72 fewer bodies under 60 on the specialised side.

Which half is hotter is not stable. On `86e7716` the same seed's dev-heavy clubs were +1.48 and the train-heavy clubs +0.27. On the reproduced `89bca4d` run the train-heavy clubs are the higher half (+1.05) and the dev-heavy clubs are +0.49. That flip is the two commits changing who plays and who is cut. It is not a new creation term in `developmentMultiplier`.

The largest position gaps on the reproduced run are QB +1.68, punter +1.66, WR +1.65. Several lines are flat or down (OT −0.41, DT −0.29, S −0.49). A single position is not the delta.

### Verdict

Noise, of the same kind Matt already left red on `a393ac9`. Not a new defect, and not reproduced on a second run of seed 3.

The signed claim, the panel mean of `staff.leagueOvrDelta`, passes at 0.973. The harness exit is a per-seed use of that same 1.2. Seed 3 is the seed that landed over it in the Studio log. Seed 5 nearly did. A clean `staffcheck.ts 8` of seed 3 on this commit passes at 0.74, with the neutral league matching the log. `86e7716` on the same seed passes at 0.88. The potential wall is intact.

### Proposed fix (not applied)

Do not widen 1.2. Do not re-lock `staff.problems`. Do not retune `developmentMultiplier`, `ceilingRecovery`, or the training multipliers.

Leave the red line reported, the same decision as 2026-10-18. The rerun says the line is already inside the noise of this seed.

If Matt wants the gate to enforce the signed claim and not also a per-seed copy of it, the change is in `staffcheck.ts:136`: do not increment `problems` for one seed's mean when the panel mean is what `baselines.json` locks. That is a `scripts/` change. It is a lead decision. It is not required to describe this panel, and it is not applied here.

---

## Shared cause

No. Coherence seed 4 moves because #202's in-game quarterback fallback forks three of the five year-0 leagues, and the 85 floor is per seed. Staff seed 3 is one specialised trajectory over a per-seed 1.2, pooled to `staff.problems` 0.20, and a second run of that seed passes. Different harness, different commit, different rule.
