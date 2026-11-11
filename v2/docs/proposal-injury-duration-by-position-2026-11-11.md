# Per-position injury duration table

**UNSIGNED.** This is a proposal. It changes no code, test, `scripts/` file, `docs/baselines.json` entry or canary. Matt signs any change. No re-lock, no band, no panel.

Tree: branch `claude/gracious-allen-i8ij43`, main `9e74d34`. All line numbers below are from this tree. (The branch head is the merge commit `72ac945`. `git diff 9e74d34 72ac945` over `lib/`, `scripts/`, `docs/baselines.json`, `docs/nfl-reference.md` and `AGENTS.md` is empty, so the line numbers hold on either.)

## The limitation

AGENTS.md line 308 lists an accepted limitation: QB availability's second moment is 5 points light. The row reads QB1 16+ games 41% against a real 46%, and under-14 games 42% against 35%. The row gives the cause. `WEEKLY_TABLE` is shared across every position and `POSITION_DURATION` only scales it. ROADMAP.md line 114 and line 149 carry the same item.

The real figures are in `docs/nfl-reference.md` §6.8B. The source is nflverse weekly, 2021–2024, 17-game era. QB1 is the club's leader in attempts, n = 128 team-seasons.

| §6.8B, real 17-game era | value |
|---|---:|
| mean games of 17 | 14.23 |
| games missed | 2.77 |
| played all 17 | 32% |
| 16+ games | 46% |
| under 14 games | 35% |

From those rows, by subtraction: 14% of real QB1s miss exactly one game (46 − 32), 19% miss two or three (65 − 46, where 14+ = 100 − 35), and 35% miss four or more. These are derived here, not printed in §6.8B. They count every game a QB1 has no weekly row, for any reason. §6.8B does not split injury from benching or a lost job (§5.3 names all three), so none of these shares is an injury rate.

## What the code does today

### The weekly roll

`rollWeeklyInjuries` (`lib/core/season/injuries.ts` 223–261) runs once per REG week from `simulateWeek` (`lib/core/season/engine.ts` 126). It runs after `healWeek` (engine.ts 125). It does not run in the playoffs (`lib/core/season/playoffs.ts` 236–240).

For each healthy rostered player, the chance is `weeklyInjuryChance` (`injuries.ts` 139–145): `0.0205 × workload × POSITION_RISK[pos] × durability × age × staff`, clamped to [0.0008, 0.09], then times `medicalHazard`. `POSITION_RISK.QB` is 1.62 (`injuries.ts` 66).

On a hit, the entry comes from the one shared table (`injuries.ts` 237). The weeks are `max(1, round(int(min, max) × POSITION_DURATION[pos] × recoveryMultiplier))` (`injuries.ts` 238–245). `WEEKLY_TABLE` is `injuries.ts` 40–52. `POSITION_DURATION` is `injuries.ts` 165–170; QB is 1.78. `recoveryMultiplier` is exactly 1 on an even staff budget (`lib/core/staff.ts` 227–229).

All three draws (chance, weighted, int) are on the per-player child stream `medicalChildRng(seed, season, week, playerId)` (`injuries.ts` 123–133, used at 234). A fourth draw, `applyWear`'s `rng.int(2, 7)` (`injuries.ts` 247, 270–272), is taken on the same child stream when the result is 8+ weeks. The parent `rngState` is not read or written here (`injuries.ts` 217–222; `lib/core/season/injuries.test.ts` 57–66).

### The rounding floor

`Math.round(1 × 1.78)` is 2. At an even staff budget a QB weekly injury can never cost one week. The same holds for every position whose multiplier is 1.5 or more: QB 1.78, RB 1.6, WR 1.8, LB 2.0, CB 1.6, S 1.6. JavaScript rounds 1.5 up. The floor is an even-budget fact only: a training-heavy club's `recoveryMultiplier` (floor 0.7, `staff.ts` 228) takes 1.78 × 0.755 = 1.34 to 1, so a staffcheck training club (60% training, multiplier 0.755) already produces one-week QB weekly injuries today.

Exact distribution of a QB weekly injury today, from `WEEKLY_TABLE` × 1.78 at an even budget:

| weeks | today, QB |
|---|---:|
| 1 | 0.0% |
| 2–3 | 29.5% |
| 4+ | 70.5% |
| 8+ | 7.2% |
| mean, nominal | 5.05 |

So 70.5% of QB soft-tissue injuries reach `IR_MIN_GAMES` = 4 (`lib/core/types.ts` 1605; `canDesignateIr`, `lib/core/rosterStatus.ts` 20–22). This is the mechanism behind the light 16+ share. The real league has a block of QB1s who miss exactly one game. The weekly roll cannot produce that block for a quarterback.

### The in-game roll

`rollInGameInjury` (`lib/core/sim/game.ts` 878–923) draws on the parent `rng` passed into `simulateGame`. Its `INJURY_TIERS` (`game.ts` 845–851) are also shared across positions. The tier is picked at `game.ts` 896–901 with no position term. Tier 0 sets 0 weeks, tier 1 sets 1–2. The in-game result is written during the week's game, and `healWeek` runs after the games in the same step (`engine.ts` 125), so an in-game injury of n weeks costs n − 1 future games: tier 1 costs 0 or 1 games, not 1–2. (A weekly injury is rolled after `healWeek` and costs its full n.) This path does give QBs one-game absences, from a 2-week tier-1 draw. This proposal does not touch it. `nfl-reference.md` has no traced source for those tiers.

### Who reads `injuryWeeks`

- `drift.playerWeeksLost`: `scripts/drift.ts` 98–100 drives `RegularAvailabilityTracker.observeKickoff` (`scripts/driftAvailability.ts` 116–120). It counts a player-game when `injuryWeeks > 0` or `status === "ir"` at REG kickoff (`driftAvailability.ts` 176–179). Internal guard 1500–4000 at `drift.ts` 389–391. Locked 2158.23 ±700 (`docs/baselines.json` `drift.playerWeeksLost`). §6.7 says that lock was set on the old composite and is not an NFL target for this population. Report-only components are emitted at `drift.ts` 437–446.
- `statcheck`: **there is no QB availability metric in this tree.** `scripts/statcheck.ts` simulates one season of one seed (`seedFor(8675309)`, lines 12–14) and emits its metrics at 120–136. The §6.8B "sim after" figures came from the task/308 probe written up in `docs/HANDOFF.md` 11267–11290, not from a harness. The statcheck metrics that do move with QB availability are `qb5PassYds`, `qb10PassYds`, `qb20PassYds` and `leadPassYds` (`statcheck.ts` 125 for `leadPassYds`, 131–133 for the three ranks).
- `verify`: `checkSnapCoverage` (`scripts/verify.ts` 424–437) counts depth-chart leaders with `injuryWeeks === 0` who played fewer than 12 games. It must stay under 12%.
- `calibrate` (`scripts/calibrate.ts` 29) and `leverage` (`scripts/leverage.ts` 68) zero `injuryWeeks` before every game. They never call `rollWeeklyInjuries`. They do not see this change.
- `staff`: `scripts/staffcheck.ts` gives half the league 60% training (`staffcheck.ts` 112–126). Training moves `recoveryMultiplier`. The proposal keeps that multiplier on the QB table.
- Engine and UI: `applyWear` at `SERIOUS_WEEKS` = 8 (`injuries.ts` 173, 247). IR at 4+ weeks (`rosterStatus.ts` 20–22; CPU path `engine.ts` 270–277). `healOffseason` (`injuries.ts` 303–309). Trade health discount `1 − clamp(injuryWeeks / 30, 0, 0.55)` (`lib/core/trades.ts` 265). The Hub sim pauses when the user's QB1 goes out 8+ weeks (`lib/store/simTo.ts` 95–115). The weekly briefing (`lib/core/season/briefing.ts` 189, 248, 359, 398–401). Gameday inactives (`lib/core/inactives.ts` 40, 101–123). The injury log line uses `entry.desc` (`injuries.ts` 254–259).

## Measured on this tree

Read-only probe, not committed. The doc first cited `/tmp/claude-0/-home-user/2d544cd2-1358-5d75-a97d-8a892043890c/scratchpad/wf/qbprobe.ts`; that path now holds a different probe (multi-passer games), and the availability probe script is no longer on disk. Its outputs are: `base30.json` / `base30b.json` (this tree, seeds 1–30 / 31–60) and `c3r172.json` / `c3r172b.json` (proposed), in the same scratchpad `wf/` folder. The table below matches those files. It cannot be re-run from the cited path. The probe runs `newGame({ seed })`, one `advance`, then the REG season with a kickoff observer. QB1 is the club's attempts leader in its own REG box rows. Games are REG weeks with a box row for that player, out of 17. This is the §6.8B definition. It reads **season 1 of fresh leagues only**. It is not the drift 20-season walk. Seeds 1–60, n = 1,920 QB1-seasons per row.

The candidate was run on a copy of `lib/` in the scratchpad (`wf/libB`). `injuries.ts` carries the candidate, switched on by globals. `sim/game.ts` also carries one instrumentation line (it records QB in-game weeks to a global; no RNG draw). Nothing else differs from the repo. The repo was not touched. On the seed-42 walk, the unedited copy reproduces the signed canary pair exactly (tag 1779302491, FA 1323223106).

| seeds 1–60, season 1 | mean games | all 17 | 16+ | 14+ | under 14 |
|---|---:|---:|---:|---:|---:|
| real (§6.8B) | **14.23** | **32%** | **46%** | **65%** | **35%** |
| this tree | 13.81 | 31.2% | 36.1% | 52.9% | 47.2% |
| QB table, `POSITION_RISK.QB` 1.62 | 14.44 | 33.2% | 48.5% | 66.5% | 33.6% |
| **QB table, `POSITION_RISK.QB` 1.72 (proposed)** | **14.36** | **31.2%** | **47.9%** | **65.4%** | **34.7%** |

Per 30-seed half, proposed row: seeds 1–30 read 14.36 / 31.5 / 48.1 / 64.8 / 35.2. Seeds 31–60 read 14.36 / 30.8 / 47.6 / 65.9 / 34.1. The binomial standard error on a share at n = 1,920 is about 1.1 points. On the mean it is about 0.08 games. That understates the seed-to-seed noise: on unchanged code the two halves read all-17 34.0% / 28.3% and 16+ 38.8% / 33.3%, a 5.5–5.7 point gap that a 1.5-point half-sample SE does not explain. The weights and the 1.72 were also picked on these same seeds 1–60. Every "proposed" figure here is in-sample. It needs a held-out seed set before it is quoted as a fit.

This tree reads **worse** than the AGENTS.md row. 16+ is 36%, not 41%. Under-14 is 47%, not 42%. The mean is 13.81, not 14.27. The probe is season 1 only, and the task/308 method may have differed. The AGENTS.md row should not be quoted as the current state until it is re-measured by one agreed method (Decision 5).

Not all QB1 absences are injuries. In the probe, about 31 QB1 games per league-season are missed with the QB1 healthy at kickoff: benched, or promoted mid-season. That is about 1.0 game per QB1-season. The table cannot move that part. §5.3 (`nfl-reference.md` line 1185) says the real figure also includes benching and a lost job. It does not split injury from benching.

Other probe readings, seeds 1–60, season 1:

| | this tree | proposed |
|---|---:|---:|
| QB injury/IR player-games at REG kickoff, per league-season | 114.9 | 87.0 |
| all positions, same count (probe rule, not the drift tracker) | 1,434.4 | 1,391.5 |
| `leadPassYds`, mean | 4,615 | 4,680 |
| `qb5PassYds`, mean | 4,060 | 4,140 |
| `qb10PassYds`, mean | 3,671 | 3,792 |
| `qb20PassYds`, mean | 3,010 | 3,186 |

## Proposed change

QB gets its own duration table. Every other position keeps `WEEKLY_TABLE × POSITION_DURATION` exactly as today. The QB table carries its own weeks, so `POSITION_DURATION.QB` becomes 1 and the table is not scaled twice. `recoveryMultiplier` still applies, so the staff training lever is unchanged and the even budget is exactly 1 (invariant 6).

The descriptions are the same eleven strings already in `WEEKLY_TABLE`, so the log, briefing and player page need no new text. A non-QB player's own child-stream draws are unchanged. The draw count per player is unchanged: one `chance`, one `weighted`, one `int`, plus `applyWear`'s child-stream `int` when the result is 8+ weeks. More QB results reach 8+ under the table (7.2% → 9.6%), so QBs take that fourth child draw more often. It stays on the child stream. `Rng.weighted` takes one `next()` whatever the table length (`lib/core/rng.ts` 64–72).

The diff is illustrative. Its hunk headers are approximate and it will not `git apply` as written.

```diff
--- a/v2/lib/core/season/injuries.ts
+++ b/v2/lib/core/season/injuries.ts
@@ -52,6 +52,30 @@ const WEEKLY_TABLE: InjuryEntry[] = [
   { desc: "Torn ACL", min: 22, max: 44, weight: 0.7 },
 ];
 
+/**
+ * Quarterbacks get their own durations. The shared table scaled by 1.78
+ * rounds a one-week strain up to two, so a quarterback could never miss
+ * exactly one game to a weekly injury, and 70% of his soft-tissue injuries
+ * reached IR length. In nfl-reference.md S6.8B, 14% of real QB1s miss
+ * exactly one game (16+ 46% less all-17 32%). That share counts any
+ * missed game, benching included; S6.8B does not split out injury.
+ *
+ * Weights and ranges are FITTED, not sourced. The targets are S6.8B's
+ * mean, all-17, 16+ and under-14 shares, fitted jointly with
+ * POSITION_RISK.QB. No QB absence-length distribution is in
+ * nfl-reference.md. Weeks here are final: POSITION_DURATION.QB is 1.
+ */
+const QB_TABLE: InjuryEntry[] = [
+  { desc: "Ankle sprain", min: 1, max: 1, weight: 22 },
+  { desc: "Back spasms", min: 1, max: 1, weight: 10 },
+  { desc: "Shoulder soreness", min: 1, max: 1, weight: 8 },
+  { desc: "Hamstring strain", min: 1, max: 3, weight: 12 },
+  { desc: "Groin strain", min: 2, max: 3, weight: 8 },
+  { desc: "Calf strain", min: 2, max: 4, weight: 8 },
+  { desc: "Quad strain", min: 2, max: 5, weight: 6 },
+  { desc: "High ankle sprain", min: 4, max: 8, weight: 12 },
+  { desc: "Foot fracture", min: 6, max: 10, weight: 9 },
+  { desc: "Achilles tear", min: 22, max: 44, weight: 0.8 },
+  { desc: "Torn ACL", min: 22, max: 44, weight: 0.7 },
+];
+
+/** A position listed here draws from its own table; the rest share WEEKLY_TABLE. */
+const DURATION_TABLE: Partial<Record<Position, InjuryEntry[]>> = { QB: QB_TABLE };
+
@@ -65,7 +89,7 @@ const POSITION_RISK: Record<Position, number> = {
-  QB: 1.62, RB: 1.58, WR: 1.18, TE: 1.36,
+  QB: 1.72, RB: 1.58, WR: 1.18, TE: 1.36,
   OT: 1.05, OG: 1.05, C: 0.93,
@@ -165,7 +189,7 @@ const POSITION_DURATION: Record<Position, number> = {
-  QB: 1.78, RB: 1.6, WR: 1.8, TE: 1.2,
+  QB: 1, RB: 1.6, WR: 1.8, TE: 1.2,
   OT: 1.4, OG: 1.4, C: 1.4,
@@ -237,7 +261,7 @@ export function rollWeeklyInjuries(state: GameState, games: Game[]): void {
-    const entry = draw.weighted(WEEKLY_TABLE, (e) => e.weight);
+    const entry = draw.weighted(DURATION_TABLE[p.pos] ?? WEEKLY_TABLE, (e) => e.weight);
     p.injuryWeeks = Math.max(
```

The `POSITION_RISK.QB` line is a separate choice (Decision 2). With the table alone at 1.62, the probe reads mean 14.44 and under-14 33.6%. The extra incidence brings the mean down to 14.36 and puts all-17 at 31.2% against a real 32%.

The `POSITION_DURATION` comment (`injuries.ts` 147–164) and the §6.8B text would need one sentence each saying QB is now carried by `QB_TABLE`. AGENTS.md line 308 and ROADMAP.md lines 114 and 149 would move from "accepted limitation" to the measured result. Those are doc edits for the implementing PR, not this one.

Exact distribution of a QB weekly injury under `QB_TABLE`, even budget:

| weeks | today | proposed |
|---|---:|---:|
| 1 | 0.0% | 45.6% |
| 2–3 | 29.5% | 25.2% |
| 4+ (IR length) | 70.5% | 29.2% |
| 8+ (`SERIOUS_WEEKS`, Hub pause) | 7.2% | 9.6% |
| mean, nominal | 5.05 | 3.34 |

"Hurt rarely, out long" in the injuries.ts comment (150–156) and in §6.5 does not describe the fit. The fit has more one-week absences, fewer 2–7 week absences, and a slightly heavier 8+ tail. §6.5 goes further than a slogan. It says raising QB incidence "would show up as too many one-week absences and too few multi-week ones" and that "the duration mix in `WEEKLY_TABLE` is the lever that has to carry the quarterback row". This proposal raises incidence (Decision 2) and adds one-week absences. That reverses §6.5's stated reading. §6.5's reading is not measured: no QB spell-length data is in `nfl-reference.md` (see below). But the §6.5 text would need to change with the code, and that is Matt's call.

### Other positions

Not in this proposal. RB, WR, LB, CB and S have the same rounding floor (no one-week weekly injury). §6.5 has 16+ and under-14 shares for every group, but on the blended 2018–2024 era. §6.6 says the 16+ column cannot be era-corrected. §6.5 does carry a "17 (17-game era)" all-17 share for every group (QB 34%, RB 36%, WR 40%, TE 43%, OL 42%, DL 49%, LB 45%, DB 35%), and §6.6 gives an era-corrected mean per group. So each group has a 17-game-era mean and all-17 share. None has a 17-game-era 16+ or under-14 share. Only QB has that, from §6.8B. Those positions stay on the shared table until that number exists (Decision 4).

## Regression test plan

Extend `lib/core/season/injuries.test.ts`. It is already registered as `injuries` in both `FAST` and `FULL` (`scripts/gate.ts` 140, 229) and in the `package.json` `test` script. No `scripts/` edit is needed for the test.

1. **Non-QB identity.** Seed a league and roll one week with a hand-built `games` array whose box rows give every player a heavy snap count. `weeklyInjuryChance` has no workload hook to stub; the snap rows are the only input (`injuries.ts` 198–207, 229). For every non-QB player, recompute the weeks with the old formula in the test (literal copy of the current `WEEKLY_TABLE` and `POSITION_DURATION` values, same `medicalChildRng` key, same draws, including `applyWear`'s at 8+). Assert equal `injuryWeeks`, `injuryDesc` and `durability`. This locks the claim that only QBs moved.
2. **QB table bounds.** Roll many (seed, week, playerId) keys for a stub QB. Every result lies in `[1, 44]` and its `injuryDesc` is a `QB_TABLE` entry whose range contains the weeks at an even budget.
3. **The floor is gone.** Across those rolls at least one QB result is exactly 1 week. Today this assertion fails, which is the bug.
4. **Staff still scales.** With a training-heavy budget, a QB's weeks equal `max(1, round(raw × recoveryMultiplier))`. At an even budget they equal the raw table draw.
5. **Parent untouched.** The existing block at `injuries.test.ts` 57–66 already asserts `rngState` and a caller parent `Rng` do not move. Keep it.
6. **Weekly chance.** `weeklyInjuryChance` for a stub QB at 55 snaps rises by 1.72 / 1.62 if Decision 2 is taken. Compare to a fixed number of decimals, not with strict float equality.

Run when the change is made:

```bash
npx tsx lib/core/season/injuries.test.ts
npx tsx scripts/driftAvailability.test.ts
npx tsx lib/core/userOffers.test.ts      # expected to FAIL on the literals; see below
npx tsx lib/core/trimIdentity.test.ts    # expected to FAIL on the literals; see below
npx tsx scripts/verify.ts 5
npx tsx scripts/statcheck.ts
```

## Gate, canaries

**The parent RNG moves, inside the first regular season, before both canary points.** The weekly draw itself is on a child stream. But a different QB absence changes who plays the next week, and `simulateGame` draws on the parent (`engine.ts` 95, saved at 172). The CPU IR and fill step also changes, because far fewer QB injuries reach 4 weeks. The fill itself runs on `fillRng`, seeded by one parent `int` taken whatever the outcome (`engine.ts` 132–133), so the IR change reaches the parent through who plays and through later parent readers in the same step, not through the fill's own draws. Measured on the seed-42 walk with the proposed table and 1.72: the parent matches through the week-1 games and diverges in the step that plays week 2 of 2026. There is no variant of this change that leaves the parent alone.

| Check | Lock | Effect | Measured |
|---|---|---|---|
| `userOffers` seed-42 tag `rngState` (`lib/core/userOffers.test.ts` 129) | 1779302491 | **Moves.** The walk plays the 2026 REG season and playoffs first (112–128). | Candidate reads **2459926758**. Re-run by the reviewer: same. |
| `userOffers` seed-42 FA `rngState` (`userOffers.test.ts` 133) | 1323223106 | **Moves.** | Candidate reads **3771471989**. |
| `trimIdentity` seed 42, opening 2030: 1600 cuts, rng 2524091302 (`lib/core/trimIdentity.test.ts` 20–22, 132–165) | 1600 / 2524091302 | **Moves.** The walk plays 2026–2029 (132–152). The cut list and rng change. | Reviewer run on the scratchpad candidate copy (table + 1.72): the test fails at the count, **1561** cuts against 1600. The rng after the click was not read, because the assertion stops first. |
| `drift.playerWeeksLost` | 2158.23 ±700 legacy; internal 1500–4000 (`drift.ts` 390) | Down. QB injury/IR kickoff games fall 115 → 87 a league-season; all positions 1,434 → 1,392 (−3%) in season 1. Last 20-season panel: 1679.70 / 1674.85 / 1667.70 (§6.7). A −3% move (about −50) keeps it above 1500 and inside the band, with about 120–130 of margin left to the internal floor. The probe's own all-position count (1,434 → 1,392) is a different rule and is already under 1500; do not compare it to the guard. | Season 1 probe only. Not measured on `drift.ts 20`. |
| `drift.injuredIrWeeks`, `drift.healthyIrWeeks` (report-only) | none | Down. QB injuries that reach IR length fall from 70.5% to 29.2% of weekly QB injuries, so fewer QBs carry IR minimum-stay weeks. | Not measured. |
| `statcheck.qb20PassYds` | 3046 ±244 | **Up, toward the ceiling.** Probe mean 3,010 → 3,186. §6.8C: 60-seed sd 154. statcheck reads one seed, so a single-seed reading above 3,290 is plausible. | 60-seed probe means. |
| `statcheck.qb10PassYds` | 3710 ±322 | Up. 3,671 → 3,792. | Same. |
| `statcheck.qb5PassYds` | 4089.8 ±360 | Up. 4,060 → 4,140. | Same. |
| `statcheck.leadPassYds` | 4730 ±700 | Up. 4,615 → 4,680. | Same. |
| `drift.passRecordSeasons`, `tails.bestSeasonPassYds` | max 3 (0 of 20 today); 5392.4 ±500 | Up, the direction §6.4 asks for. More QB1 games raise the top-season tail. Reaching 4 of 20 is not plausible from +65 at the leader. | Not measured. |
| `verify` "healthy starters play a full season" (`verify.ts` 424–437) | thin < 12% | Safer. Healthy QB starters appear in more games. | Not measured. |
| `calibrate`, `leverage` | — | Unaffected. Both zero `injuryWeeks` each game and never call the weekly roll. | — |
| `staff` | `overPotential` 0 and the scoring delta | Even budget is still exactly 1. Training still scales QB weeks, but the shape of its QB effect changes. Today a 60%-training club turns a QB's nominal 2 weeks into 1 (1.78 × 0.755 rounds to 1). Under the table, 45.6% of QB weekly injuries are already 1 week and `max(1, …)` stops training from shortening them. Training's QB value moves from shortening short absences to trimming the 4+ tail. | Not measured. |
| `careers` | as locked | QBs reach `SERIOUS_WEEKS` slightly more often per injury (7.2% → 9.6%), so durability wear moves. Career length and QB supply can shift. | Not measured. |
| `determinism` | 0 failures | No new RNG source. The child-stream key is unchanged. | — |

**The `qb20PassYds` row matters most.** Today the metric sits on its real 3,046 while QB1 mean games is 0.42 *under* the real 14.23. A correct availability fit pushes `qb20` up about 130–175 yards. So the middle of the passing leaderboard reads correct today partly because QB1s are over-injured. That is a finding to report, not a reason to retune production or move the band. If statcheck goes red on `qb20PassYds` after this change, the change is what moved it.

Do not edit the canary literals as part of the change. If Matt signs, the re-lock is his, measured after the change lands, the same way the 2026-11-11 `trimIdentity` re-lock was done (`docs/HANDOFF.md` lines 5–13).

## Numbers this proposal needs that `nfl-reference.md` does not have

- **QB absence-spell lengths.** The distribution of consecutive games missed by a QB1. It would let the table be sourced, not fitted. Primary data: nflverse `snap_counts` 2021–2024 (runs of zero-snap REG weeks for an established starter), cross-checked with nflverse `player_stats` weekly rows. The `injuries` report dataset is not usable for this. §6.3 shows it drops IR stints.
- **Injury versus benching in real QB1 absences.** §5.3 says both exist. Neither is counted. Primary data: nflverse `injuries` (`report_status`) joined with `depth_charts` and weekly `player_stats`.
- **17-game-era second moments for RB, WR, TE, OL, DL, LB, DB.** §6.5 is blended 2018–2024, and §6.6 says its 16+ column cannot be era-corrected. Primary data: nflverse `snap_counts` 2021–2024, the §6.5 aggregation restricted to the 17-game seasons.
- **Weekly QB injury incidence.** `POSITION_RISK.QB` is fitted in this proposal, as it was in §6.8B.
- **In-game injury tier mix by position.** `INJURY_TIERS` (`game.ts` 845–851) has no source and no position term.

Until those exist, the QB table's ranges and weights are fit parameters, like `POSITION_DURATION` today, and only the four §6.8B shares are targets. No new band is proposed. The per-position spell-length axis stays **ungated**.

## Invariants and the calibration freeze

Added by the 2026-11-11 review.

- **This is a tune toward a target.** `QB_TABLE`'s eleven weights and ranges and `POSITION_RISK.QB` 1.72 were chosen by trying candidates against the four §6.8B shares on seeds 1–60. The targets trace (§6.8B). The parameters do not, and cannot until a QB spell-length series exists. That is the same footing as task/308's 1.62 / 1.78, but it is still dial tuning.
- **The calibration freeze applies.** ROADMAP.md lines 10–11: no new metrics, bands or re-locks unless a playtest finding needs one. This item is a ROADMAP "real, not urgent" line (ROADMAP.md 146–150), not a playtest finding. Landing it needs a re-lock of both canaries and moves dials, so it needs Matt to sign an exception to the freeze, not only the change (Decision 8).
- **Invariant 1 (seeded RNG).** No new RNG source and no new parent draw from `rollWeeklyInjuries`. The weekly roll stays on `medicalChildRng`. The parent still moves, inside the first regular season, through who plays (measured above).
- **Invariant 2 (box score).** Not touched.
- **Invariant 3 (depth chart).** Not touched. The change alters `injuryWeeks` only. Who plays is still read from `team.depthChart`.
- **Invariant 4 (one players array).** Not touched. No new collection.
- **Invariant 5 (no deps, JSON-safe).** The tables are module constants. No save field is added. `injuryDesc` strings are the existing eleven. Old saves load unchanged.
- **Invariant 6 (even budget).** Holds. `recoveryMultiplier` and `injuryRiskMultiplier` stay exactly 1 at an even split. The training lever's QB effect changes shape (see the `staff` row).
- **Invariant 7 (traced numbers).** The four §6.8B targets trace. The 14% / 19% / 35% splits are derived by subtraction and include non-injury absences. Every `QB_TABLE` entry and 1.72 are fitted and untraced, and the code comment must say so (the diff does). The sim does not read anything it must not.

## Decisions for Matt

1. **Adopt a QB-only duration table** (`QB_TABLE` and `DURATION_TABLE` above, `POSITION_DURATION.QB` → 1), with weights and ranges labelled as fitted, not sourced. Or keep the limitation as accepted.
2. **Incidence.** Move `POSITION_RISK.QB` 1.62 → 1.72 with the table (probe: mean 14.36, all-17 31.2%, 16+ 47.9%, under-14 34.7%). Or take the table alone at 1.62 (14.44, 33.2%, 48.5%, 33.6%).
3. **Canary re-lock after the change.** Both `userOffers` seed-42 literals (tag 1779302491, FA 1323223106) and `trimIdentity` (1600 cuts, rng 2524091302) will move. The measured candidate pair is tag 2459926758, FA 3771471989; the candidate `trimIdentity` reads 1561 cuts (rng not read). Sign a one-time re-lock measured on the landed code.
4. **Scope.** QB only, now. RB, WR, LB, CB and S keep the same no-one-week floor until a 17-game-era second moment is computed in `nfl-reference.md`. Approve or decline the `snap_counts` 2021–2024 aggregation as the next reference task.
5. **Measurement.** Pick one canonical QB1 availability method (season 1 of fresh leagues, or the drift 20-season walk) and say whether it gets a report-only emit. If yes, that emit is a lead `scripts/` edit. Until then, AGENTS.md line 308's 41% / 42% is not the current reading on this tree (36.1% / 47.2% in the season-1 probe).
6. **`qb20PassYds`.** Accept that a correct QB availability fit pushes it about +175 in the probe, to 3,186 against 3,046 ±244. No production retune and no band move. Read it at 60 seeds per §6.8C before calling it red.
7. **Panel.** Studio `gate:full:serial` and `drift.ts 20` on the landed change before merge. `drift.playerWeeksLost`, `careers` and the QB-wear effect were not measured here.
8. **Freeze exception.** Sign, or decline, an exception to the 2026-10-08 calibration freeze for a dial fit and two canary re-locks that no playtest finding asked for. If declined, the limitation stays accepted as AGENTS.md line 308 records it.
9. **§6.5's QB reading.** Accept that the table reverses §6.5's "hurt rarely, out long" / "too many one-week absences" reading, and that the §6.5 text is rewritten with the code. Or require a sourced QB spell-length series (nflverse `snap_counts` 2021–2024) first.
10. **Held-out seeds.** Require the fit to be re-read on seeds the weights were not picked on (for example 61–120) before it is quoted as the result.

## Review (2026-11-11)

Adversarial review. Every file:line above was opened on this tree. Only this doc was edited.

**Confirmed as written.** AGENTS.md 308, ROADMAP.md 114 and 149. Every §6.8B real figure (14.23, 2.77, 32%, 46%, 35%, n = 128). The `injuries.ts` citations (40–52, 66, 123–133, 139–145, 165–170, 173, 217–261, 303–309). The `engine.ts` order (95, 124–126, 172, 270–277). `playoffs.ts` 236–240. `IR_MIN_GAMES` and `canDesignateIr`. `recoveryMultiplier`. `Rng.weighted`. `injuries.test.ts` 57–66 and the `gate.ts` 140 / 229 registration. The drift, `driftAvailability`, `verify`, `calibrate`, `leverage`, `staffcheck`, `trades.ts`, `simTo.ts` (8-week pause), `briefing.ts` and `inactives.ts` citations. The baselines locks quoted in the risk table. The exact today/proposed QB duration tables (recomputed: 0.0 / 29.5 / 70.5 / 7.2 / 5.05 and 45.6 / 25.2 / 29.2 / 9.6 / 3.34). The probe table and the "other readings" table match the saved probe JSON. The `userOffers` canary was re-run on the scratchpad copy: the unedited copy gives 1779302491 / 1323223106, the candidate gives 2459926758 / 3771471989, and the parent first differs after the step that plays week 2 of 2026.

**Changed.**
- Tree line: noted the branch head is `72ac945` with no code diff from `9e74d34`.
- §6.8B splits (14% / 19% / 35%): labelled as derived here and as counting benching, not injury. Same fix in the diff's code comment.
- Child-stream draws: added `applyWear`'s fourth draw at 8+ weeks, which the table makes more frequent.
- The rounding floor: limited to an even budget; a 60%-training club already gets one-week QB injuries today.
- In-game tiers: an n-week in-game injury costs n − 1 games because `healWeek` runs after the game in the same step. Tier 1 costs 0–1 games, not 1–2.
- `statcheck` citations: emit block is 120–136; `leadPassYds` is 125; ranks are 131–133.
- Probe provenance: the cited `qbprobe.ts` now holds a different probe; the availability script is gone; the JSON outputs are named. The candidate copy also differs in one instrumentation line of `sim/game.ts`.
- Noise: the binomial SE understates seed noise (unchanged-code halves differ by 5.5–5.7 points), and all proposed figures are in-sample on the seeds the fit was picked on.
- §6.5 / other positions: §6.5 does have a 17-game-era all-17 share per group; the missing piece is a 17-game-era 16+ / under-14 share.
- §6.5 conflict: the proposal reverses §6.5's stated QB mechanism; now said plainly.
- Test plan: item 1 cannot "stub workload" (no hook); it must use snap rows, and must cover `applyWear`. Item 6 must not use strict float equality.
- Gate: the fill runs on `fillRng` (one parent draw, outcome-independent); the parent moves through who plays. `userOffers` line range corrected to 112–128. `trimIdentity` range corrected to 20–22 / 132–165 and now **measured**: the candidate fails at 1561 cuts against 1600.
- `staff` row: the training lever's QB effect changes shape.
- `drift.playerWeeksLost` row: margin to the 1500 floor stated; the probe's own count is not comparable.
- Added "Invariants and the calibration freeze" and Decisions 8–10.

**Open.**
- The proposal is a dial fit toward §6.8B under a signed calibration freeze, needing two canary re-locks no playtest finding asked for. It cannot land without a freeze exception (Decision 8).
- `QB_TABLE` and 1.72 are untraced fit parameters. No QB absence-spell series and no injury-versus-benching split exist in `nfl-reference.md`. The fit absorbs whatever gap exists between the sim's benching rate (about 1.0 game per QB1-season healthy-missed in the probe) and the real one.
- The fit is in-sample. No held-out seeds were read.
- The availability probe script is not on disk, so the headline table cannot be reproduced from the cited path.
- `trimIdentity` rng after the 2030 click on the candidate was not read.
- Not measured: `drift.ts 20`, `careers`, `staff`, `verify`, `statcheck` at 60 seeds on the candidate, and the QB-wear effect.
