# Gate fail on 86e7716 — drift crash and sweep short rosters

Read-only investigation. No sim change, no baseline edit, no gate-metric change. Matt signs any fix.

HEAD is `86e7716` (waiver clearing, #198), parent `d46e132` (roster sanity, #197). The two failures do not share a root cause.

The #182 panel does not have either failure. `v2/docs/HANDOFF.md` records the `a393ac9` 5-seed panel as GATE FAIL 5 on useroffers, staff, `path2BurnInTop10PrPct`, and `rb5RushYds`. That note quotes `playerWeeksLost` as 1638.95, so drift finished and emitted. Sweep is not among those five failures. The follow-up full gate on the #182 line (`gate:full --seeds 1`) is recorded as GATE PASS, with drift 20 and sweep 25×2 both finishing. `b44cc75` (#182) is an ancestor of `86e7716`. Season-1 drift on `f4b260d` (#194, after #182 and the parent of #197) finishes on panels 2, 3, and 4. Both failures below are regressions after that.

---

## 1. Drift crash — unavailable player in a regular-season game

The throw is `scripts/driftAvailability.ts:141`, inside `RegularAvailabilityTracker.finish`. `finish` walks every regular-season box row and throws when the kickoff snapshot for that player is missing, on the wrong team, `ps`, `ir`, `injuryWeeks > 0`, or sat (`driftAvailability.ts:137-141`). The snapshot is taken in `observeKickoff` after `declareGamedayInactives` and `dressEmergencyQuarterbacks`, and before `simulateGame` (`lib/core/season/engine.ts:84-86`). It copies primitives, so an injury that happens during the game does not trip it. A player who was sat or on the practice squad at kickoff still trips it if he gets a box line.

Every `drift.*` metric is missing because `finish` throws before the harness emits.

### The five pairs

Seeds 2, 3, and 4 throw in 2026. Seeds 1 and 5 play all 272 regular-season games of 2026 (ids 1..272) and throw in 2027. 2027 regular-season ids start at 286, so games 343 and 347 are 2027 games. All five are CPU quarterbacks. All five reach the box through `nextAvailable` → `emergencyQuarterback`.

| Panel | Season / week | Game | Player | Kickoff | What the sim did |
| --- | --- | --- | --- | --- | --- |
| 3 | 2026 w1, HAR–NSH | 2 | 480 Tate Northcutt, QB 50, NSH, chart 2 | active, healthy, sat | `unsit`. QB unit still held 479 Tyrell Young (63, healthy). Out: 478 Vince Lockhart II (77). Box: 7 pass attempts, 0 snaps. |
| 3 | 2026 w5 | 69 | 427 Finn Ulrich, QB 47, HOU, chart 2 | sat | Same refill. Unit still held 426. Out: 425. 6 attempts, 0 snaps. |
| 4 | 2026 w11, PIT–CLE | 153 | 215 Keegan Sinclair, QB 50, CLE, chart 2 | sat | `unsit`. Unit still held 1540 Jamal Mitchell (61, healthy). Out: 213 Jordan Gonzalez (73). 8 attempts, 0 snaps. |
| 2 | 2026 w12, LV–KC | 179 | 798 Silas Quarles, QB 53, KC, chart 2 | `ps`, healthy | `return-still-ps`. Unit was empty. Out included 797 Dax Nguyen, the only healthy active QB; 796 Emmett Lewis was already hurt at kickoff. Still `ps` at the final whistle (hurt during the game). 9 attempts, 13 snaps. |
| 2 | 2026 w13 | 187 | 374 Deion Martinez, QB 55, BKN, chart 2 | `ps` | `return-still-ps`. Unit still held 55 Kion Rodriguez (healthy). Out: 54 Keegan Torres II. Still `ps`. 13 attempts, 0 snaps. |
| 1 | 2027 w5, HOU–NYS | 347 | 1434 Michael Walker II, QB 58, NYS, chart 2 | sat | `unsit`. Unit still held 108 Evan Xiong (61, healthy). Out: 849 Carlos Carter (87). 5 attempts, 0 snaps. |
| 5 | 2027 w4, KC–LV | 343 | 2042 Hayden Zeller II, QB 55, KC, chart 2 | `ps` | `return-still-ps`. Unit still held 797 Derrick Wilson (65, healthy). Out: 796 Rowan Martin (76). Still `ps`. 4 attempts, 0 snaps. |

A box line is written for any player with a snap or a counting stat, including `passAtt` (`lib/core/sim/game.ts:2049-2055`). In a decided game `onField` steps to `unit[slot + 1]` (`game.ts:857-861`), so the emergency body throws a handful of passes. Snap shares are a separate accounting; several of these lines have attempts and 0 snaps. The attempts are in the box a player would open.

### Cause

`buildStarters` calls `emergencyQuarterback` only for an empty quarterback room, and the comment says so (`game.ts:134-145`): do not unsit a quarterback the club already benched behind a healthy one, and do not put a second body in once a quarterback is dressed.

`nextAvailable` does not have that guard. Whenever the QB unit is short of `ROTATION.QB` (2) and no healthy active unsitted quarterback is outside the unit, it calls `emergencyQuarterback` (`game.ts:545-552`, added in `d46e132`). Injuring one of the two dressed quarterbacks refills the second slot while the other healthy quarterback is still in the unit.

`emergencyQuarterback` (`lib/core/emergencyQb.ts:27-48`) unsits a healthy inactive quarterback, else returns a practice-squad quarterback. Elevation runs only when elevations remain and `rosterCount < rosterLimit` (`emergencyQb.ts:45-47`). When that fails it still returns the practice-squad quarterback (`emergencyQb.ts:48`). The file comment says that is deliberate (`emergencyQb.ts:14-15`). `dressEmergencyQuarterbacks` (`emergencyQb.ts:62-80`) frees a CPU slot only when the room is already empty at kickoff. It does not run mid-game, and it does not run at all when a healthy active quarterback is already dressed. So a mid-game call on a full 53 returns a body whose status is still `ps`.

`rosterManagement.test.ts:258-284` signs the empty-room case: both active quarterbacks hurt, a 99 punter on the 53, a practice-squad quarterback must be the one with `passAtt > 0`.

Two behaviors, one call site:

1. Rotation refill while a healthy quarterback remains in the unit. This is the Northcutt, Ulrich, Sinclair, Martinez, Walker, and Zeller games. The inactive or practice-squad quarterback throws while a healthy quarterback is still up. That contradicts `buildStarters`. A player sees it in the box.
2. True empty room. Quarles, game 179. This matches the signed test and the comment in `emergencyQb.ts`. He plays the rest of the game while remaining on the practice squad, because the 53 is full and nothing frees a slot mid-game. A player sees a practice-squad body in the box.

The tracker is doing what it says. This is a roster bug in the sim. A tracker-only exemption would hide the rotation refill.

### Introducing commit

`d46e132` — Roster sanity: depth charts, auto-fill, the 53, and emergency quarterbacks (#197).

`emergencyQb.ts` is that commit. The `nextAvailable` call is blamed to that commit (`game.ts:545-552`). On `f4b260d` (#194), panels 2, 3, and 4 finish season 2026. On `d46e132` those three panels throw the same pairs the gate reported: 798/179, 480/2, 215/153. #198 is not on this path.

### Repro

From `v2/`:

```
GG_SEED=3 npx tsx scripts/drift.ts 1
```

Throws `unavailable player 480 appeared in game 2`.

```
GG_SEED=2 npx tsx scripts/drift.ts 1
```

Throws `unavailable player 798 appeared in game 179`.

```
GG_SEED=1 npx tsx scripts/drift.ts 2
```

2026 finishes. 2027 throws `unavailable player 1434 appeared in game 347`.

```
GG_SEED=5 npx tsx scripts/drift.ts 2
```

2026 finishes. 2027 throws `unavailable player 2042 appeared in game 343`.

Panel seed is `seedFor(12345)` (`scripts/metrics.ts:66-73`). Panels 1..5 are 506939785, 1013891931, 1520852267, 2027804413, 387272780.

### Proposed fix (not applied)

1. In `nextAvailable`, call `emergencyQuarterback` only when the QB unit is empty, the same condition `buildStarters` already uses (`game.ts:137`). That removes the rotation refill. It fixes panels 1, 3, 4, and 5, and panel 2's game 187.
2. Keep the signed empty-room behavior (`emergencyQb.ts:48`, `rosterManagement.test.ts:277`). Panel 2 game 179 still throws after step 1, because Quarles is `ps` at kickoff and then appears. `finish` has to allow a quarterback whose only kickoff flags are `sat` or `ps`. Keep throwing on `ir`, `injuryWeeks > 0`, a team mismatch, a missing kickoff row, and on `sat` or `ps` for every other position. A sat quarterback who is still listed in `box.inactives` should still throw; the refill cases above are absent from that list because `activateFromInactive` already ran. Quarles is not on that list either (he was never sat; he was `ps`), so the `ps` exception has to be explicit for quarterbacks.

Relaxing the tracker without step 1 would let the inactive third quarterback keep throwing beside a healthy backup. Returning null from the empty-room path would fail the signed test and hand the attempts to the punter. Mid-game elevation of a CPU body does not by itself clear the tracker: the snapshot is already `ps`.

### What a fix would move

The canary is the drift step itself. Today it exits before emit, so every `drift.*` metric is missing. After the throw is gone those metrics emit again.

`drift.playerWeeksLost` (locked 2158.23 ± 700) counts kickoff injury and IR, not these appearances, so it should land near a completed run. Do not treat that as a promise it stays inside the band, and do not retune it.

Step 1 moves a handful of decided-game pass attempts from the scrub or practice-squad quarterback back to the healthy quarterback who was already in the unit. That can twitch passing yards in statcheck / calibrate. The emergency-quarterback test in `rosterManagement.test.ts` is the behavior canary for step 2 and should stay green if the empty-room path still produces `passAtt > 0`.

---

## 2. Sweep bad-rosters — CPU clubs under 53 at the preseason checkpoint

`scripts/sweep.ts:36-38` fails a league when, after the offseason has returned the save to preseason, any club has `rosterCount !== 53` or cap space under 0. `rosterCount` is active bodies only (`lib/core/select.ts:39-44`). It does not look at position minimums, position ceilings, the practice squad, or the quarterback count. `rosterIssues` calls a short active roster `underLimit` (`select.ts:406-411`).

The gate's hit shape (`over-cap=0`, `bad-rosters=1–4`, mostly 2028, a few 2027) is that check. A classifier on panel 1 (`GG_SEED=1`, the same seeds as `sweep.ts`) through 15 of 25 leagues found 9 problem seeds. Every flagged club was a CPU club, every issue was `underLimit`, every cap space was positive, and every hit in that sample was the 2028 preseason. Active counts ran from 45 to 52. No position was under its minimum. Practice squads were inside 16. A few of the same clubs were also over `POSITION_ACTIVE_MAX`: punter 3>2, tight end 6>5, safety 8>6. The sweep does not count those.

### Concrete league

`GG_SEED=1`, league index 1, seed 506928641. 2027 preseason: every club at 53. 2028 preseason: CLE 51 (space +$5.5M), CIN 52 (space +$2.5M). CIN also had 3 punters against a ceiling of 2.

The 2028 week-0 log, after `2028 preseason begins.`, is `settleWaivers`. CLE's own 2027 cutdown bodies clear in that window with dead money on top of the bonus already booked at the cut, including Elias King Jr. (QB, $1.0M), Patrick Underwood Jr. (QB, $1.6M), and Diego Clark (WR, $0.8M). At the end of the window the log has unpaired waivers and no matching claim: CLE waived Jamal Everhart II (CB), Travis Jacoby (WR), and Jalen Wetzel II (EDGE); CIN waived Malik Miller (EDGE). CLE finished at 51, CIN at 52. Nothing signed a body back.

### Cause

`finalizeOffseason` reconciles every club to a legal 53 (`lib/core/offseason/index.ts:263-277`), rolls the calendar to preseason, then calls `settleWaivers` (`index.ts:335`). The follow-up legalize runs `reconcileRoster` only when cap space is still negative (`index.ts:338-342`).

#198 books the signing bonus on the cutting club inside `cutPlayer` (`lib/core/offseason/contracts.ts:649-665`, `bookedAtCut: true`). When an unclaimed player clears, `stashOrFreeAgent` charges the remaining dead money (the guarantee) to the old club (`lib/core/waivers.ts:258-259`). `resolveWaivers` then, for each CPU club with space under 0, calls `enforceCap` (`waivers.ts:304-309`). `enforceCap` (`contracts.ts:1920-1939`) cuts until space is back to zero or better. It does not refill. Those cuts go on the next waiver window. Once `enforceCap` has done its job, space is positive, the `index.ts:338` loop does not run, and the club stays under 53.

`enforceCap` skips `userTeamId` (`waivers.ts:307`). The flagged clubs are CPU clubs. The hole is on the preseason desk, which is the checkpoint sweep reads. The next regular-season week does call `fillCpuRosterShortfall` (`engine.ts:70-73`), so the count can be patched at week 1. The preseason roster is still short, and that is what the gate counts.

The position-ceiling leftovers are a separate gap from #197. `trimCpuRosterSanity` applies `POSITION_ACTIVE_MAX` only in the regular season and the playoffs (`contracts.ts:1480-1506`). Cutdown reconciliation caps quarterbacks (`capQuarterbacksOn53`, `QB_53_MAX`) and does not re-apply the punter, kicker, tight end, or safety ceilings. A third punter can sit on the preseason 53. Week-1 trim would cut him and open another hole until the fill runs. That is not what makes sweep fail.

`fillRoster`'s `atActiveMax` break (`contracts.ts:1330`) is not this hole. The same leagues are legal 53s at the 2027 preseason, and they go short only at the 2028 week-0 backstop, after reconciliation has already finished.

### Introducing commit

`86e7716` — waiver clearing (#198). The `enforceCap` loop in `resolveWaivers` is blamed entirely to that commit (`waivers.ts:304-308`).

The same first four sweep leagues, including seed 506928641, are 0/4 bad on `d46e132` (#197). #197 does not produce this under-53 preseason shape.

### Repro

From `v2/`:

```
GG_SEED=1 npx tsx scripts/sweep.ts 2 2
```

League index 0 is clean. League index 1, seed 506928641, prints `season 2028: over-cap=0 bad-rosters=2`.

The gate command is `tsx scripts/sweep.ts 25 2` with `GG_SEED` 1..5. Sweep seeds are `seedFor(100000) + i * 7919` (`scripts/sweep.ts:17`).

### Proposed fix (not applied)

After `settleWaivers` in `finalizeOffseason`, refill every CPU club that is under 53 even when cap space is already non-negative. `fillOpenActiveSlots` or `reconcileRoster` at `index.ts:338` is the place. `enforceCap` can stay as the cap backstop. It cannot be the last edit to the roster.

At that same checkpoint, apply `POSITION_ACTIVE_MAX` for every position, not only `QB_53_MAX`, so a third punter does not survive until week 1. The sweep will not go red on that rider today. Week-1 trim will otherwise cut the extra body and leave the club short until `fillCpuRosterShortfall`.

Do not start cutting the user seat. `enforceCap` already leaves it alone.

### What a fix would move

The canary is the sweep exit. Bad-seed counts (18, 19, 16, 15, 20 on the five panels) should go to 0 if the refill lands before the preseason check.

Signing minimums into clubs that already have millions of room should leave `over-cap` at 0. The new bodies, and any ceiling cuts, can move drift payroll, cap, and roster-churn metrics, and can nudge careers survival. Do not retune.

---

## Shared cause

No. The drift crash is an in-game quarterback substitution from #197 (`game.ts:545-552`). The sweep failure is a post-waiver cap cut that does not refill, from #198 (`waivers.ts:304-309` plus `index.ts:338-342`). Different commit, different moment, different rule.
