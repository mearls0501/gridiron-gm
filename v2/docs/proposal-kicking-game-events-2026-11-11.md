# Onside kicks, blocked kicks, fair catches

**UNSIGNED.** Proposal only. This note changes no code, test, `scripts/` file, `docs/baselines.json`, `docs/nfl-reference.md`, or canary. Matt signs any change. No re-lock, no dial retune, no panel.

**Traced 2026-11-13:** `docs/nfl-reference.md` §5.14 now holds onside, blocked-kick, fair-catch and return rows by kickoff rule era. The trace blocker below is cleared; the rest of this note is unchanged.

Tree: `/home/user/gridiron-gm/v2`, branch `claude/gracious-allen-i8ij43`, main at `9e74d34`. Line numbers below are from this tree.

## Summary

ROADMAP Phase 6 lists "Onside kicks, blocked kicks and fair catches (none in the sim today)" (`docs/ROADMAP.md` 146, under "Then — the long tail (Phase 6)" at 144). The engine has no onside kick, no blocked field goal, extra point or punt, and no fair catch. This note proposes all three in `lib/core/sim/game.ts`, on a new per-game side stream, in two stages.

**Stage 1** changes no outcome. A blocked FG or XP is a subset of the misses the engine already rolls. A fair catch is a subset of the punts the engine already does not return. Neither moves the parent RNG or any score, and both canaries must stay where they are.

**Stage 2** changes outcomes: blocked punts, block returns (touchdowns and safeties), and onside kicks. It moves the parent RNG before both canary points.

`docs/nfl-reference.md` has none of the rates either stage needs. It has no kickoff, punt-return or blocked-kick block, and it does not name a kickoff rule era. Every rate below is untraced. Per invariant 7, no stage can be built until a reference block exists. The rest of this note is the mechanism, the box-score routes, the RNG plan, and the list of numbers to trace.

## What the engine does today

**Box-score contract.** Team points must equal `6*(passTd + rushTd + defTd + krTd + prTd) + xpm + 2*twoPtMade + 3*fgm + 2*safeties` (`game.ts` 18–24). `verify` sums exactly that (`scripts/verify.ts` 124–131) and fails on any mismatch (157). `calibrate` does the same (`scripts/calibrate.ts` 58–64) and emits `calibrate.scoreMismatches` (144). There is no field for a defensive two-point return.

**Kickoff.** `kickoff` (`game.ts` 1118–1172). `rng.chance(0.62)` is a touchback at the 25 (1123–1129; `TOUCHBACK_YARDLINE = 25`, 34). Otherwise every kick is returned: a returner from the receiving `WR`, `RB` and `CB` units (1132–1135), a TD at `rng.chance(0.0055)` (1137), return yards `normal(23, 8)` clamped 5–45 (1138), the `kr` line (1140–1146), `kickExposure` on the kicker (1148–1149), and a drive at `25 + (ret − 23)` (1166). No branch lets the kicking club keep the ball. No kickoff is fair caught. No kickoff burns clock.

**Stub kickoffs.** The opening kickoff and the second-half kickoff are not live. Each is a touchback event with no draw (`game.ts` 1965–1969 and 1990–1996). Overtime calls the live `kickoff()` (1982). A safety does not free-kick: the scoring defence takes the ball at its own 45 (`changePossession(45)`, 2218).

**Extra point.** `attemptPat` (`game.ts` 1055–1111). With a kicker, `xpa++` (1101), then `rng.chance(clamp(0.86 + (kac − 50) × 0.0022, 0.80, 0.985))` (1103). A miss is `record` plus an `xp`/`miss` event (1108–1109). Nothing can return it.

**Field goal.** `attemptFieldGoal` (`game.ts` 1181–1221). `fga++` (1188). The make chance is built from distance, `kpw`, `kac`, weather and the vacant-coordinator delta (1190–1197). `good = rng.chance(p)` (1200). `kickExposure` (1203). A miss gives the defence the ball at the kick spot or its own 20, `changePossession(clamp(100 − max(yardLine − 8, 20), 1, 99))` (1219). Nothing can block or return it.

**Punt.** `punt` (`game.ts` 1223–1299). Gross distance is `normal` around the punter's `kpw` (1228–1232). A landing at or past the goal line is a touchback (1245–1252). Otherwise `rng.chance(0.55)` returns it (1256): a returner from `WR` and `CB` (1257–1260), a TD at `rng.chance(0.004)` (1261), return yards `normal(8, 7)` clamped 0–40 (1262), the `pr` line (1264–1270), `kickExposure` on the punter (1272). The other 45% is result `"gain"` (1294–1298). That branch is a fair catch, a downed ball and an out-of-bounds kick together, with no label. Nothing can block a punt.

**Return-TD route.** `defensiveTd` (`game.ts` 1302–1310) credits `defTd`, awards 6, calls `attemptPat` for the scoring side and kicks off. Its `kind` is `"INT" | "fumble"`.

**Decisions.** A kick is chosen on fourth down by `goForIt` and `inFieldGoalRange` (`game.ts` 2057–2062), or by the end-of-half rule `takeLastKick` (2049–2054). The user's club is asked only for run or pass, and only on offensive snaps (2124–2133; `SnapInfo`, `lib/core/callSheet.ts` 18–27). A kick choice is never offered to the user.

**Event and stat types.** `PlayKind` and `PlayResult` (`lib/core/types.ts` 623–653) have no `"blocked"`, `"onside"` or `"fair_catch"`. `PlayEvent` is display only (comment at 622). Stat lines carry `kr`/`krTd` and `pr`/`prTd` (`types.ts` 229–230), and `STAT_KEYS` lists the summed fields (`lib/core/season/stats.ts` 19–28). The codec drops zero fields on save (`lib/store/codec.ts` 11–30), so a rare new key costs almost no bytes. `terminalOf` maps drive endings (`lib/core/sim/events.ts` 36–45). Any `fg` that is not `"good"` reads as `missed_fg` (40). `formatPlay` prints kicks (`lib/view/playByPlay.ts` 121–133).

**RNG.** A season passes one parent `Rng` through every game in order (`lib/core/season/engine.ts` 66 and 95). One extra parent draw in game N shifts every later game. Two in-game streams already exist:

- `tackleCreditRng` (`game.ts` 518–521) is seeded from `state.seed` and `game.id`. It takes **no** parent draw. That is "the coin is a side stream" (HANDOFF 2026-11-11, "Tackle credit").
- `econRng` (`game.ts` 523–530) is seeded by **one** parent draw per game.

## Measured volume

Read-only probes on this tree. Scripts are in `/tmp/claude-0/-home-user/2d544cd2-1358-5d75-a97d-8a892043890c/scratchpad/wf/`.

**Calibrate-style matchups**, `newGame({ seed: 12345 })`, `new Rng(999)`, 600 games (1,200 team-games), injuries cleared each game as `calibrate.ts` does (`kickprobe.ts`):

| event | count | per team-game |
|---|---:|---:|
| FG good / miss | 1,978 / 403 | 1.648 / 0.336 |
| XP good / miss | 2,804 / 272 | 2.337 / 0.227 |
| punt return / non-return `"gain"` / touchback / TD | 1,794 / 1,442 / 568 / 7 | 1.495 / 1.202 / 0.473 / 0.006 |
| kickoff touchback (incl. 1,200 stubs) / return / TD | 4,476 / 2,016 / 11 | — |
| live kickoffs (excl. stubs) | 5,303 | 4.42 |
| live kickoff touchback share | 3,276 / 5,303 = 61.8% | — |
| kickoffs by a club trailing by 1–16 in Q4, ≤ 5:00 left | 108 | 0.090 |
| same, ≤ 3:00 left | 69 | 0.058 |
| overtime kickoffs | 38 | 0.032 |

The engine misses 8.8% of XPs (272 / 3,076) and 16.9% of FGs (403 / 2,381) in this probe. Neither rate is in `nfl-reference.md`. This note does not touch either.

**Seed 42, one regular season** (272 games), the first season the `userOffers` canary walks (`season.ts`): 1,182 FG tries, 1,263 XP tries, 1,868 punts, 919 kick returns, 886 punt returns, 7 KR TD, 4 PR TD, 69 `defTd`, 11 safeties. That is about 4,300 kicks a season that a block coin would see.

**Stage 1 parity literal** (`parity.ts`). 300 calibrate-style games, `seed 12345`, `new Rng(999)`: parent `rng.state` **3282470162** after the loop, score hash **4083448151**, FG misses 213, XP misses 153, punt `"gain"` 756. Stage 1 must reproduce the state and the hash exactly. It is a one-shot PR check, not a new committed canary.

## What `nfl-reference.md` has

None of it.

- No onside attempt rate, onside recovery rate or onside spot.
- No blocked FG, blocked XP or blocked punt rate. No return-TD or safety share on a blocked kick. No defensive two-point count.
- No fair-catch share on punts or kickoffs.
- No kickoff touchback share, return share or return-TD rate. The 0.62, 0.0055, 0.55, 0.004, `normal(23, 8)` and `normal(8, 7)` constants (`game.ts` 1123, 1137, 1138, 1256, 1261, 1262) carry no citation. The `NFL ~1.5 / 23.0`, `~1.4 / 9.0` and `~0.04` notes in `calibrate.ts` 98–101 are not traced either.
- **No kickoff rule era.** The file names no kickoff rule set. Its play-by-play windows are 2021–2024 REG (§5.6, and the §5.13 tackle rows built on `play_by_play_2021..2024`; §5.11 uses 2021–2024 REG counts but not those files). **Untraced rule statement:** those four seasons are generally described as spanning three kickoff rule sets (the post-2018 kickoff formation rules in 2021–2022, a 2023 kickoff fair-catch rule, and the 2024 "dynamic kickoff", said to move the touchback spot and restrict when an onside kick may be tried). None of that, and no kickoff, touchback or onside spot, is in `nfl-reference.md` §4 or anywhere else in the file. It is stated here only to show why the era must be chosen; it must be cited in §4 from the NFL rulebook / operations.nfl.com before anything is built on it. Likewise, the claim that the engine's touchback at the 25 (`game.ts` 34) is a pre-2024 spot is untraced.

A kickoff rate pooled across 2021–2024 would mix three rule sets. Onside recovery and kickoff fair catches are the rows that move most across them.

### What would supply each number

All from nflverse `play_by_play_YYYY`, REG only (`season_type == "REG"`), the same file family as §5.6 and §5.13. Column names are as published in the nflverse data dictionary and must be confirmed when the block is computed.

| number | columns |
|---|---|
| onside attempts, by situation | `play_type == "kickoff"`, onside text in `desc`, `qtr`, `game_seconds_remaining`, `score_differential` (kicking side) |
| onside recovery rate | the same rows, `own_kickoff_recovery` |
| onside spot | `yardline_100` on the next play, `own_kickoff_recovery_td` |
| blocked FG share of non-made FGs | `field_goal_result` in {`missed`, `blocked`} |
| blocked XP share of non-good XPs | `extra_point_result` in {`failed`, `blocked`} |
| blocked punt rate | `punt_blocked` over `punt_attempt` |
| blocked kick → TD, safety, spot | `return_touchdown`, `td_team`, `safety`, `yardline_100` on the next play, `blocked_player_id` |
| defensive two-point returns | `defensive_two_point_conv`, `defensive_extra_point_conv` |
| punt fair-catch share | `punt_fair_catch` over `punt_fair_catch + punt_downed + punt_out_of_bounds` (the sim's unreturned, non-touchback branch) |
| kickoff fair-catch share, by era | `kickoff_fair_catch`, `touchback`, `kickoff_attempt` |
| rule geometry (kickoff spot, 10-yard minimum, touchback spot, when an onside is allowed) | NFL rulebook / operations.nfl.com, cited in §4 like the jersey rule |

Until a §5.14 block holds these, each axis stays **ungated**. Nothing goes into `baselines.json`.

## Proposed change

### RNG: one new side stream, no parent draw

Add a third in-game stream beside `tackleCreditRng`, keyed the same way with its own salt:

```ts
// Not a draw on `rng`. Kick-event coins must not shift the parent on a kick where nothing happens.
const kickEventRng = new Rng(
  (state.seed ^ Math.imul((game.id + 1) >>> 0, 0x85ebca6b) ^ 0x2c1b3c6d) >>> 0,
);
```

Every new coin goes on `kickEventRng`: the block coins, the fair-catch label, the blocker pick, block-return yards, the onside recovery coin and the onside spot. Draws that already exist stay on `rng`.

What this buys, stated plainly:

- **Stage 1.** Every outcome is unchanged and every new coin is off the parent. The parent stream is identical by construction, so the whole season, both canaries and every gated metric stay where they are. The parity literal above checks it.
- **Stage 2.** The side stream decides **whether** an event happens without shifting the parent on the ~4,300 kicks a season where nothing happens. It does not cover the onside kick: deciding to try one is a policy, not a coin, and the attempt itself skips the parent touchback draw (see Canaries). It does **not** keep later games identical. Once a blocked punt or onside recovery changes possession, the rest of that game takes a different number of parent draws (`attemptPat`, `kickoff`, `rollInGameInjury` at 883, every scrimmage play), and every later game in the season inherits that position. A side stream cannot prevent that, and this note does not claim it does.

The `econRng` pattern (one parent draw per game) is the wrong model here. It would move the parent on every game, Stage 1 included.

### Stage 1: labels inside outcomes the engine already rolls

**Blocked FG.** In the miss branch only (`game.ts` 1213–1220). The make chance and its `rng.chance(p)` (1200) are untouched, so `fgm`, `fga` and `calibrate.fgPct` are unchanged by construction. The spot stays the miss spot. The rate is the §5.14 share `blocked / (missed + blocked)`.

**Blocked XP.** In the XP miss branch only (`game.ts` 1107–1110). Dead ball. `xpm` and `xpa` are unchanged. The rate is `blocked / (failed + blocked)`.

**Blocker credit.** One new stat key, `blk`, on the defender. He is drawn on `kickEventRng` from the defence's `DT`, `EDGE` and `LB` starters (invariant 3: the depth chart picks him, not a sort on OVR). Draw only among players who already have a `pstats` row, so no new box row appears. If none qualifies, credit nobody. Caveat: a `pstats` row is not the same as a box row. The box keeps a row only if `snaps` rounds above 0 or one of the listed fields is non-zero (`game.ts` 2259–2270), and `blk` is not in that list. A row whose fractional snaps round to 0 would drop its `blk` silently. Restrict the draw to rows that will survive that filter (in practice `snaps >= 0.5` at the time of the block), and do **not** add `blk` to the filter: that would create a new box row, which moves `games` on the season line. `blk` is added to `SeasonStatLine` (`types.ts` 201–234) and `STAT_KEYS` (`stats.ts` 19–28). It is not a scoring field. No award, progression or contract path reads it.

**Punt fair catch.** In the unreturned `"gain"` branch only (`game.ts` 1294–1298). The spot stays `100 − landing`, so possession and field position are unchanged. The event result becomes `"fair_catch"` at the §5.14 share of that branch. No stat is credited; real fair catches are not returns. Whether to add a team or returner `fc` count is a decision below.

**Kickoff fair catch.** Era-dependent, so off by default. *Untraced rule statement:* under the 2023 rule a kickoff fair catch inside the 25 is said to give the receiving club the ball at the 25, which the engine already writes as a touchback. If Matt picks that era and the rule is cited in §4, a share of the touchback branch (1123–1129) is relabelled `"fair_catch"` with the same `startDrive(TOUCHBACK_YARDLINE)`. How large the row is under 2021–2022 rules is not known; this note previously called it "effectively empty", which is an untraced guess. The probe cannot say, since §5.14 does not exist.

```diff
--- a/v2/lib/core/sim/game.ts
+++ b/v2/lib/core/sim/game.ts
@@ attemptFieldGoal, miss branch (1213–1220)
     } else {
-      record(ctx.team.id, `${k.lastName} ${distance} yd field goal is NO GOOD`);
-      emit({
-        kind: "fg", result: "miss", yards: distance,
+      const blocked = kickEventRng.chance(kickEventRate("fgBlockedOfMissed"));
+      if (blocked) creditBlock(def());
+      record(ctx.team.id, `${k.lastName} ${distance} yd field goal is ${blocked ? "BLOCKED" : "NO GOOD"}`);
+      emit({
+        kind: "fg", result: blocked ? "blocked" : "miss", yards: distance,
         down, toGo, yardLine, offenseId: ctx.team.id, playerId: k.id,
       });
       changePossession(clamp(100 - Math.max(yardLine - 8, 20), 1, 99));
@@ attemptPat, XP miss branch (1107–1110)
     } else {
-      record(ctx.team.id, "Extra point MISSED");
-      emit({ kind: "xp", result: "miss", ...
+      const blocked = kickEventRng.chance(kickEventRate("xpBlockedOfMissed"));
+      if (blocked) creditBlock(ctx.team.id === home.id ? ctxAway : ctxHome);
+      record(ctx.team.id, blocked ? "Extra point BLOCKED" : "Extra point MISSED");
+      emit({ kind: "xp", result: blocked ? "blocked" : "miss", ...
@@ punt, unreturned branch (1294–1298)
-    emit({
-      kind: "punt", result: "gain", yards: Math.round(gross),
+    const fair = kickEventRng.chance(kickEventRate("puntFairCatchOfUnreturned"));
+    emit({
+      kind: "punt", result: fair ? "fair_catch" : "gain", yards: Math.round(gross),
       down, toGo, yardLine, offenseId: ctx.team.id, playerId: p?.id,
     });
```

`kickEventRate(key)` reads a table shaped like `TACKLE_CREDIT` (`game.ts` 253–262), integers from §5.14, `{ events, plays }`. **This diff cannot merge with empty rows.** There is no placeholder rate.

Display: `PlayResult` gains `"blocked"` and `"fair_catch"` (`types.ts` 637–653). `formatPlay` adds the three strings (`playByPlay.ts` 121–133). `terminalOf` needs no change for Stage 1: a blocked FG still reads `missed_fg` (`events.ts` 40) and a fair-caught punt reads `punt` (39).

### Stage 2: outcomes that change

**Blocked punt.** A `kickEventRng` coin at the top of `punt()`, before the gross draw (`game.ts` 1228). On a block: no gross, no return draw, no `kickExposure`. The punter's line takes the attempt; whether a blocked punt counts in `punts` and with what yards is a decision below, since §5.14 does not state the convention. The defence takes the ball behind the line at a `kickEventRng` spot. The blocker and the recoverer must be drawn from the defence's depth-chart starters (invariant 3), on `kickEventRng`; the draft above does not name the unit. Three endings:

- recovered and returned into the end zone, or recovered in it: `defTd` to the recoverer, through `defensiveTd` with a new kind `"blocked punt"`;
- the ball goes out of the back of the end zone: `safeties++` on the blocker, `award(def, 2)`, then the existing safety handoff, `changePossession(45)` (2218);
- otherwise the defence's ball at the spot.

`calibrate.punts` keeps its meaning only if a blocked punt still counts as a punt. That is a decision below.

**Blocked FG returned.** Inside the Stage 1 blocked branch, a `kickEventRng` coin at the §5.14 return-TD share. A TD goes through `defensiveTd` with kind `"blocked FG"`. `defensiveTd`'s description string assumes `"INT" | "fumble"` (`game.ts` 1306) and needs a branch for each new kind. Its scoring row is also subject to the order defect in `docs/proposal-phase1-play-leftovers-2026-11-11.md` (a defensive TD's snap row is emitted after the PAT and kickoff rows), which `terminalOf` would inherit for `fg`/`td`. `defTd` is already in the box formula, so `verify` and `calibrate` reconcile with no `scripts/` edit. A non-TD keeps the miss spot.

**Blocked XP returned.** *Untraced rule statement:* the NFL rule is understood to allow a defensive two-point return on a try; `nfl-reference.md` does not cite it. The box formula has no field for it (`game.ts` 23, `verify.ts` 128–129, `calibrate.ts` 61–62). Adding one means a new stat key and an edit to both harness formulas, which is a lead decision (AGENTS.md, "Editing `scripts/`"). **Proposed: leave it out.** A blocked XP stays a dead ball. That is a decision below.

**Onside kick.** At the top of `kickoff()` (`game.ts` 1118), before `rng.chance(0.62)`:

```ts
const kicking = receivingIsHome ? ctxAway : ctxHome;
if (wantsOnside(kicking)) { onsideKick(kicking, receiving); return; }
```

`wantsOnside` is a coaching policy with no coin: `quarter >= 4`, not overtime, the kicking club trails by 1–16, and the clock is at or under a signed threshold. It only reads state, so it takes no draw. On this tree, ≤ 3:00 gives 0.058 qualifying kickoffs a team-game and ≤ 5:00 gives 0.090. Neither is an NFL rate. The attempt rate in those situations is a §5.14 row, and the threshold must be checked against it.

`onsideKick` rolls recovery on `kickEventRng` at the §5.14 era rate. The kicking club keeps the ball on a recovery, the receiving club takes it otherwise, at a spot from rule geometry (kickoff spot plus the 10-yard minimum, cited in §4) plus a `kickEventRng` spread. No return, no `kr` line, no TD in v1. `own_kickoff_recovery_td` and an onside returned for a score are both rare and both left out. No clock burns, which matches every other kickoff today. A surprise onside and an onside on the stub kickoffs (1965–1969, 1990–1996) are out of scope. The live opening kick is already a Phase 1 leftover (`ROADMAP.md`, "Phase 1 leftovers").

The user does not get an onside prompt. `opts.live` pauses only on offensive snaps (`game.ts` 2124–2133). The user's club uses the same `wantsOnside` policy as the CPU. A kick-call prompt is a separate UI decision.

**Drive summaries.** `terminalOf` (`events.ts` 36–45) needs two lines: `fg`/`td` → `return_td`, and `punt`/`blocked` → `turnover`, or a new `DriveResult`. The drive builder's `kickoff` handling (`events.ts` 93 onward) must treat an onside recovery as the kicking club's drive starting. `DriveResult` (`types.ts` 671–681) may need `"onside"`. These are display paths. `DriveSummary` is stored on every box, CPU games included (`drives` is written unconditionally, `game.ts` 2273 and 2285); only the play log `plays` is user-only (`game.ts` 2286, `types.ts` 756–757). A new `DriveResult` value therefore lands in every saved box, though it is one short string per drive.

### Not changed

The make chance for FG and XP, the touchback share, return-TD rates, return-yard distributions, punt gross, `goForIt`, `inFieldGoalRange`, `takeLastKick`, the tackle credit, award weights, and the staff budget. No staff multiplier touches a kick event, so invariant 6 holds trivially. Attribute tilts on block or recovery chance are left out of v1. A mean-preserving tilt (blocker `str`/`spd` against OL `pbk`, hands team against the kicker's `kac`) is a decision below.

### Overlap with the special-teams tackle proposal

`docs/proposal-special-teams-tackles-2026-11-11.md` (unsigned, same date) edits the same return branches in `kickoff()` and `punt()`. A fair catch, a blocked kick and an onside recovery credit no coverage tackle under that proposal's rule (it credits only a live, non-scoring return). Either can land first. The streams are separate but not symmetric: this note's coins are on `kickEventRng`; that note's coverage coin and pick draw on the existing `tackleCreditRng` (its "Which stream" paragraph and Decision 8), not on a salted stream of its own. Neither shares a stream with the other, so neither moves the other's coins. That proposal moves the parent RNG on its own (through `pstats`/`gameTackles` and `tackleDrawWeight`), so if it lands first, this note's Stage 1 parity literal must be re-measured on that tree before Stage 1 is checked. Stage 1 here does not change which returns are live, so it cannot change that proposal's coverage coins. Whichever lands second rebases onto the first.

## Regression

New file `lib/core/sim/kickingEvents.test.ts`, added with the fix, not in this PR. Register it as AGENTS.md says: the `package.json` `test` script, and a named step (`kickevents`) in `scripts/gate.ts` in both `FAST` and `FULL`, beside `useroffers` (80, 169) and `trimidentity` (124, 213). That pair is the only `scripts/` edit the fix may make.

**Stage 1 cases.**

1. **Parent parity.** 300 calibrate-style games, `seed 12345`, `new Rng(999)`: parent `rng.state` and the score hash equal the pre-change values (3282470162, 4083448151). Run in the PR. Do not commit the literal as a new canary.
2. **Miss carve-out.** Across the same loop: `blocked FG + missed FG` equals 213 and `blocked XP + missed XP` equals 153. `"fair_catch" + "gain"` punts equal 756. Only labels moved.
3. **Blocker draw.** Every `blk` credit is on a `DT`, `EDGE` or `LB` who has a snap that game. No box row exists with only `blk` set.
4. **Box reconciliation.** Zero mismatches on the formula in `verify.ts` 128–129, every game.
5. **Side-stream key.** Two different `game.id` values on one seed give different block sequences. One `game.id` on one seed gives the same sequence twice.

**Stage 2 cases.**

6. **Every new scoring route reconciles.** A blocked-punt TD, a blocked-punt safety and a blocked-FG TD each write the matching `defTd` or `safeties` line and the matching points. Built from a deterministic fixture that forces each branch through exported pure helpers (`resolveBlockedPunt`, `resolveBlockedFgReturn`, `onsideSpot`), not by hunting a seed.
7. **Onside policy.** `wantsOnside` is false when leading, tied, in overtime, before Q4, above the signed clock threshold, or trailing by 17 or more. It never draws: `kickEventRng` and `rng` state are unchanged across the call.
8. **Possession.** After an onside recovery, `offenseId` on the next scrimmage play is the kicking club. After a failure it is the receiving club. Neither writes a `kr` line.
9. **No defensive two.** A blocked XP never awards points, if Matt signs leaving it out.

Run, when the fix is actually made:

```bash
npx tsx lib/core/sim/kickingEvents.test.ts
npx tsx lib/core/sim/tackleShare.test.ts
npx tsx lib/core/sim/targetShare.test.ts
npx tsx lib/view/playByPlay.test.ts
npx tsx scripts/verify.ts 3
npx tsx scripts/calibrate.ts 300
npx tsx lib/core/userOffers.test.ts
npx tsx lib/core/trimIdentity.test.ts
```

## Gate, canaries

### Canaries

| canary | lock | Stage 1 | Stage 2 |
|---|---|---|---|
| `userOffers` seed 42, `offseason-tag` `rngState` (`lib/core/userOffers.test.ts` 129) | **1779302491** | must not move | moves |
| `userOffers` seed 42, `offseason-fa` `rngState` (133) | **1323223106** | must not move | moves |
| `trimIdentity` seed 42, opening 2030, cuts (`lib/core/trimIdentity.test.ts` `CUTS`, 22 onward) | **1600** | must not move | moves |
| `trimIdentity` rng after that click (21) | **2524091302** | must not move | moves |

**Does the parent RNG move before those points?**

- **Stage 1: no.** Every new draw is on `kickEventRng`. No outcome, possession, score, injury roll or stat that a decision reads changes. A red canary after Stage 1 means a coin landed on `rng`, a new box row appeared, or something reads `blk`. Fix that. Do not re-lock.
- **Stage 2: yes, early in 2026 (not measured on seed 42).** The `userOffers` walk plays the whole 2026 season and postseason before the tag window (`userOffers.test.ts` 117–120). Two routes move the parent, and the first needs no coin at all:
  - **Onside attempt.** When `wantsOnside` is true, `kickoff()` returns before `rng.chance(0.62)` (1123), so the parent loses that draw (and, on a would-be return, the returner pick, TD coin, yards and the `kickExposure` injury roll) whether or not the kick is recovered. The first qualifying kickoff of the season moves the parent with certainty. On calibrate-style matchups the ≤ 3:00 policy qualifies 0.058 kickoffs a team-game, about 1.8 per 16-game week, so week 1 is likely but not certain. Seed 42 week 1 was not measured: CPU boxes carry no play log (`game.ts` 2286).
  - **Blocked punt.** It skips the parent gross draw, `burn(rng.int(9, 14))` and the return draws (1228–1272). Only punts carry an outcome-changing block coin: blocked FGs and XPs that are not returned change nothing. Seed 42 has 1,868 punts that season; at any per-punt block rate of 0.1% or more the chance of no blocked punt all season is at most `0.999^1868` ≈ 15%. That is arithmetic on the sim's own punt count, not an NFL rate. (An earlier draft used all 4,313 kicks as the denominator; FG/XP blocks without a return do not move the parent.)

  Either route changes that game's remaining parent draws and every later game. Both `userOffers` literals move, and `trimIdentity` (four seasons later) moves. A re-lock is Matt's to sign, and it is a re-lock under the calibration freeze (`docs/ROADMAP.md` 10–11: "No new metrics, bands or re-locks unless a playtest finding needs one"). Stage 2 is a Phase 6 roadmap item, not a playtest finding, so Matt must sign an explicit exception to the freeze as well as the re-lock. Do not write the new literals into either test without that.

### Gated metrics

| metric | lock | Stage 1 | Stage 2 |
|---|---|---|---|
| `calibrate.scoreMismatches` / `verify` reconcile | 0 | must stay 0 | must stay 0. Every new score uses `defTd` or `safeties`, already in the formula. A defensive two would break it, which is why it is left out. |
| `verify.checks` | floor 330 | unchanged | unchanged unless new checks are added |
| `calibrate.fgPct` | 86.029 ±4 (floor 82.029); last read **81.995** (HANDOFF 2026-11-11) | unchanged by construction: blocks are carved from misses | unchanged by construction |
| `calibrate.punts` | 3.348 ±0.9 | unchanged | unchanged if a blocked punt counts as a punt; down by the block count if not |
| `calibrate.pts`, `calibrate.seasonPfg` 22.325 ±1.6, `statcheck.meanTeamScore` 22.107 ±1.6 | as locked | unchanged | moves. Block TDs add points. Onside recoveries add trailing-club possessions; failures hand the leader short fields. Direction not signed. |
| `calibrate.tieRatePct` 0.533 ±1.5 | as locked | unchanged | can move: late onside recoveries are tying drives |
| `calibrate.turnovers` 1.356 ±0.28 | as locked | unchanged | unchanged if a blocked punt and a failed onside are not counted as turnovers. The NFL counting convention is not in `nfl-reference.md`; decide it with item 7 |
| `calibrate.topMinutes`, `calibrate.plays` | as locked | unchanged | small: possessions change hands differently |
| `conditions.homeWinPct` 54.439 ±3 | as locked | unchanged | indirect through scoring |
| `tails.milestonesOff` | max 16 | unchanged | indirect. The 5+ FG game and 60+ yd FG rows read `fgm`/`longFg`, which do not change. |
| `statcheck.fieldMismatches`, `statcheck.implausibleLines` | 0 | `blk` must be in `STAT_KEYS` or the season line drifts from the box | same |
| `drift.saveMbAtEnd` 15.89, `drift.saveGrowthMbPerSeason` 0.61 | max | `blk` is zero on almost every row and the codec drops it | same |
| `determinism` | 0 failures | `new Rng(seed)` is allowed; no banned API | same |
| `drift`, `careers` | as locked | unchanged | indirect only, through injuries and results after week 1 |

No row in `docs/baselines.json` moves. No band is added for any kick event, and no new metric is emitted: adding an `emitAll` key to `calibrate.ts` is both a `scripts/` edit (a lead decision, AGENTS.md "Editing `scripts/`") and a new metric under the calibration freeze (`docs/ROADMAP.md` 10–11). Kick-event counts are read from the new test file and one-off probes only, until §5.14 exists and Matt signs otherwise.

## Decisions for Matt

1. **Trace first.** Approve a `docs/nfl-reference.md` §5.14 "Kicking-game events" block from nflverse `play_by_play`, REG, with the columns above. No stage is built before it exists.
2. **Kickoff era.** Which rule set the kickoff rows trace to: 2021–2022, 2023, or 2024+. The rule descriptions attached to each era in this note (formation rules, the kickoff fair-catch rule, the dynamic kickoff and its touchback spot, and whether the engine's 25-yard touchback at `game.ts` 34 matches any era) are untraced and must first be cited in §4. Whether punt, FG and XP rows can pool 2021–2024 depends on whether any of those rules changed in the window; that is also not in `nfl-reference.md`.
3. **Side stream.** `kickEventRng`, keyed (seed, `game.id`) like `tackleCreditRng`, with no parent draw. Not an `econRng`-style child.
4. **Staging.** Stage 1 (FG/XP block labels carved from misses, punt fair-catch label) lands alone, canaries unchanged. Stage 2 (blocked punts, block returns, onside) lands after, as its own PR.
5. **Stage 2 re-lock and freeze exception.** Stage 2 moves `userOffers` (tag 1779302491, FA 1323223106) and `trimIdentity` (1600 cuts, rng 2524091302); the onside policy alone moves them, with no coin. Sign an exception to the calibration freeze (Stage 2 is not a playtest finding) and a re-lock of those four literals only, with no other baseline.
6. **Defensive two-point return.** Leave it out (a blocked XP is a dead ball), or add a stat field and edit the box formula in `verify.ts` and `calibrate.ts`.
7. **Blocked punt stat convention.** Does a blocked punt count in the punter's `punts` (and with what yards)? This decides whether `calibrate.punts` moves.
8. **Stats.** Add `blk` on the defender. Add a fair-catch count (`fc`) on the returner or the team, or leave fair catches as play-log labels only.
9. **Onside policy.** The clock threshold (≤ 3:00 measures 0.058 qualifying kickoffs a team-game here, ≤ 5:00 measures 0.090) and the 1–16 deficit window, checked against the §5.14 attempt rate. No surprise onside. No user prompt.
10. **Attribute tilt.** Flat traced rates in v1, or a mean-preserving tilt on block and onside recovery from depth-chart attributes.

## Review (2026-11-11)

Adversarial review against this tree. Every `game.ts`, `verify.ts`, `calibrate.ts`, `types.ts`, `stats.ts`, `codec.ts`, `events.ts`, `playByPlay.ts`, `callSheet.ts`, `engine.ts`, `gate.ts`, `userOffers.test.ts` and `trimIdentity.test.ts` citation was opened. Probes re-run: `parity.ts` reproduced rng **3282470162**, hash **4083448151**, FG miss 213, XP miss 153, punt `"gain"` 756; `season.ts` reproduced seed 42's 1,182 FGA, 1,263 XPA, 1,868 punts, 919 KR, 886 PR, 7/4 KR/PR TD, 69 `defTd`, 11 safeties; `kickprobe.ts` reproduced every row in the volume table. The trailing-kickoff rows counted `q >= 4`, which includes overtime; re-run with `q === 4` (`kickprobe_q4.ts`) gives the same 69 and 108.

**Changed in place.**

1. Citations: ROADMAP item is at line 146 (heading 144), not 145–147; `tackleCreditRng` is 518–521; `econRng` is 523–530.
2. Wrong claim: `DriveSummary` is not user-only. `drives` is written on every box (`game.ts` 2273, 2285); only `plays` is user-only (2286).
3. Rule statements presented as fact are now labelled untraced: the three kickoff rule eras, the 2023 kickoff fair-catch spot, the 2024 touchback/onside change, "the 25 is a pre-2024 spot", "under 2021–2022 the row is effectively empty", and "the real rule allows a defensive two-point return". None is in `nfl-reference.md`. Decision 2 reworded the same way. The §5.11 window sentence corrected (§5.11 does not use the play-by-play files).
4. "Each stays an ungated emit" removed. Emitting new kick metrics needs a `calibrate.ts` edit (lead decision) and is a new metric under the calibration freeze.
5. Overlap paragraph: the special-teams tackle proposal draws on `tackleCreditRng`, not its own salted stream. Added that its landing first would invalidate this note's parity literal.
6. Canary reasoning for Stage 2 rewritten. The onside policy moves the parent with no coin (an attempt skips `rng.chance(0.62)` at 1123). The block arithmetic used 4,313 kicks; only punts carry an outcome-changing block, so it is now `0.999^1868` ≈ 15%. "Week 1" was asserted, not measured; it is now "early 2026, not measured on seed 42".
7. Calibration freeze: Stage 2's re-lock conflicts with ROADMAP 10–11 (re-locks only for a playtest finding). Decision 5 now asks for an explicit freeze exception.
8. Added: blocker draw must survive the box-row filter (`game.ts` 2259–2270) and `blk` must stay out of that filter; Stage 2 blocker/recoverer must come from depth-chart starters; `defensiveTd` string and the defensive-TD row-order defect.

**Confirmed sound.** Stage 1 adds no parent draw and changes no possession, score, stat a decision reads, `pstats` tackle/snap value, or `tackleDrawWeight` input, so `userOffers` (1779302491 / 1323223106) and `trimIdentity` (1600 cuts, 2524091302) should not move; the parity literal is the right check. Score routes in Stage 2 stay inside the box formula. No dependency, no staff path, no banned API. `game.id` comes from `state.nextGameId++` (`lib/core/schedule.ts` 420), so the side-stream key does not repeat across seasons.

**Open.**

- Every rate in both stages is untraced; nothing can be built until a §5.14 block exists. Column names in the nflverse table are unconfirmed.
- The onside clock threshold and 1–16 deficit window are design numbers. Choosing them to match a traced attempt rate is fitting a policy to a target; Matt should say whether that is allowed under "report, never tune".
- The Stage 2 drive-summary changes (`terminalOf`, `buildDrives` onside handling, a possible new `DriveResult`) are sketched, not specified.
- Whether a blocked punt counts as a punt and whether a blocked punt or failed onside counts as a turnover are unresolved conventions (Decisions 7 and 9); neither is in `nfl-reference.md`.

