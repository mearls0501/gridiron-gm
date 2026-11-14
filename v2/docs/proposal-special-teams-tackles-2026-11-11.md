# Special-teams tackles

**UNSIGNED.** Proposal only. This note changes no code, test, `scripts/` file, `docs/baselines.json`, `docs/milestone-reference.json`, or canary. Matt signs any change. No re-lock, no dial retune, no panel.

**Traced 2026-11-13:** `docs/nfl-reference.md` §5.14 now holds the weekly 712.3 already includes 44.6 kick/punt tackles a club-season (scrimmage-only 667.7), and the own-tackle rate on a live return. The trace blocker below is cleared; the rest of this note is unchanged.

Tree: `/home/user/gridiron-gm/v2`, branch `claude/gracious-allen-i8ij43`, main at `9e74d34`. Line numbers below are from this tree.

## Summary

Team tackles land near 655 a season. The 2021–2024 club range is 622–831, mean 712.3 (`nfl-reference.md` §5.13, "Which plays record an own tackle", team primary tackles paragraph). The engine credits a tackle only on scrimmage plays. A live kickoff return and a live punt return credit nobody. This note proposes crediting one coverage tackle on a live, non-scoring kick or punt return, to a coverage man drawn from the kicking club's depth-chart backups, at a traced rate.

The rate is **not** in `nfl-reference.md`. Neither is the fact the whole proposal rests on: whether the 712.3 weekly team total already contains special-teams tackles. Both must be traced into §5.13 before any code lands. Until then the axis is ungated and this proposal is not ready to build.

## What the engine does today

**Scrimmage credit.** `creditTackle` (`lib/core/sim/game.ts` 575–580) credits a tackle on a non-scoring rush, completion, or sack, at the traced family rate in `TACKLE_CREDIT` (`game.ts` 253–262): 41,275/55,037 rushes, 38,002/43,993 completions, 4,594/5,213 sacks (`nfl-reference.md` §5.13, own-tackle table). The coin is `tackleCreditRng` (`game.ts` 518–521), a per-game side stream seeded from `state.seed` and `game.id`. It does not draw on the play `rng`.

**Kickoff.** `kickoff` (`game.ts` 1118–1172). 62% are touchbacks (`rng.chance(0.62)`, 1123). Otherwise a returner is drawn from the receiving club's `WR`, `RB` and `CB` units (1132–1135), a TD rolls at 0.0055 (1137), the return is `normal(23, 8)` clamped 5–45 (1138), and the returner's `kr` line is written (1140–1146). `kickExposure` puts the kicker in contact (1148–1149). The drive starts (1166). No tackle is credited to anybody on the kicking club.

**Punt.** `punt` (`game.ts` 1223–1299). A landing at or past the goal line is a touchback (1245–1252). Otherwise 55% are returned (`rng.chance(0.55)`, 1256). The returner is drawn from `WR` and `CB` (1257–1260), a TD rolls at 0.004 (1261), the return is `normal(8, 7)` clamped 0–40 (1262), and `pr` is written (1264–1270). `kickExposure` puts the punter in contact (1272). The spot moves (1285). The other 45% is result `"gain"`, a fair catch or a downed ball (1294–1298). No tackle is credited.

**Return volume is untraced.** The 0.62 touchback share, the 0.55 return share and both return-yard distributions carry no citation, and `nfl-reference.md` has no kick-return block. The volume that a coverage credit would multiply is the sim's own.

**Measured volume.** Probe, unchanged tree, one regular season, 32 clubs, 272 games:

| seed | team tackles mean (min–max) | KR per club | PR per club | KR TD | PR TD |
|---|---|---:|---:|---:|---:|
| 1 | 655.0 (575–741) | 27.3 | 27.2 | 0.22 | 0.13 |
| 2 | 654.5 (576–708) | 26.9 | 29.2 | 0.16 | 0.28 |
| 3 | 657.4 (557–720) | 26.3 | 30.3 | 0.03 | 0.09 |

The team means match the HANDOFF 2026-11-11 tackle entry (655 / 654.5 / 657.4). Every club covers about **55 live non-scoring returns** a season, in an even schedule the same count it receives.

## The two things that are not traced

### 1. Does 712.3 contain special-teams tackles?

§5.13 computes the team primary total as `def_tackles_solo + def_tackles_with_assist` from nflverse `stats_player_week`, summed per club-season. It does not say whether those weekly columns include tackles made on kickoff and punt plays, or tackles made by offensive players after a turnover. HANDOFF (2026-11-11, "Tackle credit") says the missing kick and punt tackles are "most of the gap from 655 to 712". That sentence has no computation behind it in `nfl-reference.md`.

If the weekly columns are scrimmage-only, 712.3 is not the target for a scrimmage-plus-coverage total, and crediting coverage tackles into `tackles` would compare a wider sim number to a narrower NFL one. If they include special teams, the comparison is right and the gap is real.

**Primary data that settles it:** nflverse `play_by_play_2021..2024` (the four files whose SHA-256s are already in §5.13). Count own-tackle ids (`solo_tackle_1/2_player_id`, `tackle_with_assist_1/2_player_id`) per tackler's own team (the matching `solo_tackle_*_team` / `tackle_with_assist_*_team` columns, not `defteam`: which club is `posteam` on a kickoff row and on a punt row must be read from the file, not assumed) and season, once on all plays and once with `play_type` in (`kickoff`, `punt`) removed. Compare both to the weekly team sums. Whichever matches is the definition of 712.3.

### 2. The coverage credit rate

Not in `nfl-reference.md`. **Primary data:** the same `play_by_play` files. Rows with `play_type == "kickoff"` and `play_type == "punt"`, REG, `play_deleted` unset, a return (`kickoff_returner_player_id` / `punt_returner_player_id` set, `return_yards` non-null, not `kickoff_fair_catch` / `punt_fair_catch` / `punt_downed` / touchback), and `touchdown == 0`. Rate = rows with any own-tackle id set by a player on the kicking team / those rows. Two rows, `kickoff` and `punt`, in the same `{ credited, plays }` shape as `TACKLE_CREDIT`.

Three more numbers the proposal would like and does not have:

- Which positions make coverage tackles. Tackler ids joined to nflverse `rosters` (position) and `snap_counts` (`st_snaps`). Without it the pool below is a design choice, not a fit.
- The season maximum of coverage tackles for one player. Needed if `tails` ever reads a coverage line.
- The own-tackle rate on fair catches, downed punts and out-of-bounds kicks. Presumed near zero. The proposal credits none, and that presumption is not traced either.

Until §5.13 carries the first two items with the computation shown, `calibrate`, `statcheck` and `tails` must not gain any coverage-tackle band (invariant 7).

## Proposed change

Three parts. Only the engine part is code. The constants stay zero until the trace lands.

**Which plays.** A kickoff with result `"return"` and a punt with result `"return"`, non-scoring. A return TD credits nothing, the same rule as a scoring scrimmage play (`creditTackle`, 576). A touchback, a punt `"gain"` (fair catch / downed), a missed or made field goal, and a PAT credit nothing. The engine has no onside kick, muff, or kick-return fumble, so there is no other case.

**Who gets credit (invariant 3).** The kicking club's coverage unit is the depth-chart slots past the starter count at `LB`, `S` and `CB`: `ctx.starters.LB.slice(STARTERS.LB)`, `S.slice(STARTERS.S)`, `CB.slice(STARTERS.CB)`. `buildStarters` (`game.ts` 108–157) fills those from `team.depthChart`, `ROTATION` deep (`types.ts` 77–80: LB 4, S 3, CB 4), so this is LB3, LB4, S3 and CB4 as the user ordered them. A man already out of the game (`ctx.out`) is skipped. If that pool is empty, the full `LB`, `S` and `CB` units are the fallback. The weight is `max(1, sc(p, "tkl") − 34)`, the base of the catch-tackle draw (`game.ts` 1862–1867) without its exponent, position share, game-plan boost or saturation. That is a weight over depth-chart slots, not a sort on overall. Kickers, punters and offensive backups are left out of the first cut; real coverage units carry them and §5.13 does not say how often they make the stop.

**No hit.** The coverage tackler gets no `hit`. `kickExposure` (`game.ts` 869–876) already models the only kick contact the sim has, and no special-teams injury rate is traced (`nfl-reference.md` §4, "Specialist in-game injury frequency"). A new hit would add an untraced injury exposure.

**Which stream.** The coin and the pick both draw on `tackleCreditRng`, never on `rng`. The play stream keeps its draw count. `tackleCreditRng` is the same per-game side stream the scrimmage coin in `creditTackle` (`game.ts` 577) reads. Every coverage draw therefore offsets every later scrimmage credit coin in that game: the scrimmage credits are re-rolled, at the same traced rates, on different plays. That is a change to which scrimmage tackles are credited, not only an added coverage credit. A separate coverage stream (a second `Rng` seeded from `state.seed`, `game.id` and a different salt) would leave the scrimmage coins untouched. The diff below does not do that. That is Decision 8.

```diff
--- a/v2/lib/core/sim/game.ts
+++ b/v2/lib/core/sim/game.ts
@@ -262,6 +262,24 @@ export function tackleCreditRate(kind: TackleCreditKind): number {
   return row.credited / row.plays;
 }
 
+/**
+ * Coverage tackle on a live, non-scoring kick or punt return.
+ * Counts are nflverse `play_by_play_YYYY`, 2021–2024 REG, returned kicks with
+ * touchdown 0, share with an own-tackle id on the kicking team.
+ * NOT TRACED YET. Both rows are zero until nfl-reference.md §5.13 carries them.
+ * A zero row draws nothing, so the build is bit-identical until it is filled.
+ */
+export type CoverageKind = "kickoff" | "punt";
+
+export const COVERAGE_TACKLE_CREDIT: Record<CoverageKind, { credited: number; plays: number }> = {
+  kickoff: { credited: 0, plays: 1 }, // §5.13, not yet measured
+  punt: { credited: 0, plays: 1 },    // §5.13, not yet measured
+};
+
+export function coverageCreditRate(kind: CoverageKind): number {
+  const row = COVERAGE_TACKLE_CREDIT[kind];
+  return row.plays > 0 ? row.credited / row.plays : 0;
+}
+
 /** Scoring plays credit nothing. Any other play credits when `roll` is under the traced rate. */
 export function creditsTackle(scoring: boolean, kind: TackleCreditKind, roll: number): boolean {
@@ -580,6 +598,27 @@
     gameTackles.set(ctx.team.id, (gameTackles.get(ctx.team.id) ?? 0) + 1);
   };
+  /**
+   * Coverage tackle for the kicking club. Depth-chart backups past the starter
+   * count at LB, S and CB. Side stream only. No hit.
+   */
+  const creditCoverageTackle = (ctx: Ctx, kind: CoverageKind) => {
+    const rate = coverageCreditRate(kind);
+    if (!(rate > 0)) return;
+    if (!tackleCreditRng.chance(rate)) return;
+    const backups = [
+      ...ctx.starters.LB.slice(STARTERS.LB),
+      ...ctx.starters.S.slice(STARTERS.S),
+      ...ctx.starters.CB.slice(STARTERS.CB),
+    ].filter((p) => !ctx.out.has(p.id));
+    const unit = backups.length
+      ? backups
+      : [...ctx.starters.LB, ...ctx.starters.S, ...ctx.starters.CB].filter((p) => !ctx.out.has(p.id));
+    if (unit.length === 0) return;
+    const p = tackleCreditRng.weighted(unit, (x) => Math.max(1, sc(x, "tkl") - 34));
+    statFor(p, ctx).tackles++;
+    gameTackles.set(ctx.team.id, (gameTackles.get(ctx.team.id) ?? 0) + 1);
+  };
   const playScores = (yl: number, yds: number) => yl + yds >= 100 || yl + yds <= 0;
@@ -1163,6 +1203,7 @@ const kickoff = () => {
       return;
     }
 
+    if (returner) creditCoverageTackle(kicking, "kickoff");
     startDrive(clamp(TOUCHBACK_YARDLINE + (ret - 23), 5, 60));
@@ -1282,6 +1323,7 @@ function punt(): void {
         return;
       }
+      if (returner) creditCoverageTackle(ctx, "punt");
       spot = clamp(spot + ret, 1, 99);
```

`sc` is declared at `game.ts` 628, after `creditCoverageTackle`. It is read only when the closure runs during a play, so there is no temporal-dead-zone read.

`if (returner)` gates the credit on the same condition as the `kr`/`pr` line. A live return with an empty receiving pool (no `WR`, `RB` or `CB` dressed) writes no return line and credits no coverage tackle. `ctx.out` is already enforced on the units: `removeFromUnits` (`game.ts` 747–763) splices an injured man out of `ctx.starters` and pushes a replacement at the end, so the `filter` is a guard, not the mechanism. After an in-game injury the backup slice can therefore hold a promoted replacement from `nextAvailable` (`game.ts` 715–).

`kickoff()` and `punt()` also run in playoff games and in preseason exhibitions (`game.ts` 1973, `exhibition`). The diff credits coverage in all three. Playoff boxes feed the playoff tackle prior (`priorCountingStats`, `game.ts` 280–), so a playoff coverage credit bends later playoff tackle draws the same way a regular-season one does.

**Where the credit lands.** This diff writes into the existing `tackles` field. That is right only if trace item 1 finds that the weekly `def_tackles_*` columns include kick and punt plays. If they do not, the credit must go to a new `stTackles` field instead (a `STAT_KEYS` entry in `lib/core/season/stats.ts` 18–30, which the save codec and preseason lines read), `gameTackles` must not include it, and the sim's `tackles` stays comparable to §5.13 as it is. That is Decision 2.

On the `tackles` path the coverage credit also enters the share-saturation denominators. `tackleDrawWeight` (`game.ts` 583–595) divides a player's credited tackles by `gameTackles` and by the season prior from `priorCountingStats`, which reads the season `tackles` line. About three coverage credits a club-game raise both denominators, so a starter's share reads lower and the saturation bites later. The knees (`GAME_TACKLE_SHARE_KNEE` 0.212, `SEASON_TACKLE_SHARE_KNEE` 0.171, `game.ts` 227–228) were traced against §5.13 shares of the weekly team total. If trace item 1 says that total includes special teams, the wider denominator is the right one. If it does not, the knees were traced against a scrimmage-only denominator and this path loosens them. That is one more reason the field choice comes before any code.

## What it does — measured at a stand-in rate

The rows below were measured on a scratch copy of this tree with the diff above and **both rates set to 1.0**. 1.0 is the arithmetic ceiling (every live return credits one man), not a proposed rate. A real rate r scales the coverage column by about r. Same five seeds, one regular season each. `COVER_RATE=0` is the same diff with a coin that never credits; it isolates what the extra side-stream draws alone do.

| seed | base team tkl | r=1 team tkl (min–max) | coverage per club | base lead | r=1 lead | r=0 lead | base max game | r=1 max game | r=0 max game |
|---|---:|---|---:|---:|---:|---:|---:|---:|---:|
| 1 | 655.0 | 710.2 (655–776) | 55.2 | 106 | 117 | 111 | 17 | 20 | 16 |
| 2 | 654.5 | 708.1 (670–771) | 54.9 | 109 | 120 | 116 | 13 | 16 | 13 |
| 3 | 657.4 | 712.8 (587–796) | 57.3 | 113 | 111 | 106 | 13 | 18 | 13 |
| 4 | 656.2 | 712.9 (667–765) | 56.2 | 108 | 124 | 112 | 15 | 15 | 14 |
| 5 | 653.8 | 708.6 (651–764) | 57.1 | 97 | 102 | 100 | 14 | 16 | 13 |

- **Team tackles.** At the ceiling the mean is 710.5, next to 712.3. At any traced rate r it is about `655 + 55r`. Whether 712.3 is the right comparison is trace item 1. The closeness of 710.5 to 712.3 is not evidence for any rate: the 55 live returns a club it multiplies come from the untraced 0.62 and 0.55 shares, and choosing r, the pool or the return shares to close the gap would be tuning toward a target (`AGENTS.md`, "Check the target before you chase it").
- **Who gets them.** Coverage credits split LB ~50%, S ~27%, CB ~21%, with a stray EDGE or DT where `buildStarters` filled a short room. 232–247 players a season get at least one. Median 6–7 per credited player; the most for one player is 19–30 at the ceiling.
- **`leadTackles`.** The top three tacklers on every seed had 0 or 1 coverage tackles. The leader moves, but the r=0 column moves it almost as much: that is the stream shift, not coverage credit. Every reading, 97–124, sits inside the signed 92–128 band (`docs/baselines.json` `statcheck.leadTackles`, 110 ±18).
- **`tails` tackle rows.** `scripts/tails.ts` 78 (game max, `[19]`) and 95 (season max, `[128]`). The season max is the leader, above. The game max reached **20** once (seed 1), by an EDGE with 8 coverage tackles that season. The probe does not split that game. `docs/milestone-reference.json` "20+ tackles" counts 0/0/0/0 in 2021–2024 and "15+" counts 2/1/0/0 (352–375). That row feeds `tails.milestonesOff` through `scripts/milestoneComparisons.ts` 4. A coverage tackle lands on a backup, not on the starters who carry the game max, but the r=1 column shows the max can still move.
- **DPOY.** Weights unchanged: `sacks * 9 + ints * 11 + tackles * 0.55 + ff * 5 + passDef * 1.5` (`lib/core/offseason/progression.ts` 347, `lib/view/seasonReview.ts` 136). The winner was an EDGE on all five seeds before and after, at 164–256 points. The most coverage tackles any one player got, 30, is worth 16.5 points, and it goes to a backup with few sacks. It cannot make a winner.
- **ROY.** `+ tackles * 0.5` (`progression.ts` 355, `seasonReview.ts` 144). Rookies are often the backups in LB3/S3/CB4, so they collect coverage credit. At 20–30 coverage tackles that is 10–15 points. HANDOFF puts a defensive rookie at about 114 against a 4,000-yard passer near 200. It does not flip.
- **Other readers of `tackles`.** `lib/view/teamLeaders.ts` 121 and `lib/view/seasonReview.ts` 164/189 (display ranking), `lib/core/secondScene.ts` 46–49 (`starterGrade`, starters with enough starts only, so mostly untouched), `lib/core/campGrade.ts` 58 (camp grade; `campNudge` is off unless `GG_CAMP_NUDGE=1`, `campGrade.ts` 35–36), `lib/core/season/records.ts` 94–119 (record book). A backup linebacker will now show a season line of 10–30 tackles. That is the visible change.
- **`docs/milestone-reference.json`.** Unchanged under either decision. Its `tackles` key is `def_tackles_solo + def_tackles_with_assist` (line 60). If trace item 1 finds ST plays inside those columns, the sim's `tackles` now matches that definition better. If not, the coverage credit goes to `stTackles` and the reference keeps reading scrimmage `tackles`. Either way the file is not recomputed.

## Gate, canaries

**Parent RNG: it moves, before both canary points.** The diff does not draw on `rng`. It still moves the parent stream, by two routes. First, a coverage credit changes `pstats` and `gameTackles`. Second, every coverage coin and pick consumes `tackleCreditRng`, so later scrimmage credit coins in the same game land on different plays, which also changes `pstats` and `gameTackles`. `tackleDrawWeight` (`game.ts` 583–595) reads both, so a later `rng.weighted` tackle draw (1489–1497, 1861–1867) can name a different man with the same draw, `hit` lands on him (1501 or 1504; 1869), and the injury roll is weighted by who is in contact. Different injuries make a different league. The r=0 column is the second route alone: the stand-in coin drew on `tackleCreditRng` but never credited, and it moved the parent stream after one season on seeds 2–5 (seed 1 stayed at 3980744328). The proposed diff's `if (!(rate > 0)) return` exits before any draw, so at zero rows neither route runs. Both canaries walk at least one full regular season before their check, so both move. The zero-row early return in the diff keeps the build bit-identical only while both rows are zero.

At the stand-in ceiling (r=1), not the literals any signed build would produce:

| canary | today | stand-in r=1 |
|---|---:|---:|
| `userOffers` seed 42 tag `rngState` (`lib/core/userOffers.test.ts` 129) | 1779302491 | 3653581986 |
| `userOffers` seed 42 FA `rngState` (`userOffers.test.ts` 133) | 1323223106 | 2693549325 |
| `trimIdentity` seed 42 opening 2030 cuts (`lib/core/trimIdentity.test.ts` 22–) | 1600 | 1399 |
| `trimIdentity` rng after that click (`trimIdentity.test.ts` 21) | 2524091302 | 4283224912 |

The unchanged tree reproduced tag 1779302491 / FA 1323223106 on this VM. The unchanged `trimIdentity` was not re-run here; HANDOFF 2026-11-11 records it passing at 1600 / 2524091302.

A signed build needs one re-lock of these four literals, measured at the traced rates, and nothing else. Do not write the stand-in values above into a test.

| Metric | Lock | Why it can move |
|---|---|---|
| `statcheck.leadTackles` | 110 ±18 (92–128) | Stream shift, and a leader can pick up a coverage credit in the fallback pool. Ceiling run read 102–124. Do not retune. |
| `tails` game / season tackle max | report `[19]` / `[128]` | Game max read 20 once at the ceiling. |
| `tails.milestonesOff` | max 16 | The 15+ and 20+ game rows, and the 150+ and 180+ season rows (`milestone-reference.json` 608–630, also key `tackles`), can gain events. Already known-open at 7 / 12 / 10 / 10 / 11 (`AGENTS.md` known-open table); HANDOFF 2026-11-11 `tails.ts 16` read 11. |
| `calibrate.*` scoring, yards | existing | Not touched directly. Injuries move with the stream. A red line here is the stream, not a reason to edit a baseline. |
| `calibrate.scoreMismatches` | 0 | No points are added or removed. A coverage tackle is only written on a non-scoring return. Must stay 0. |
| `drift.*` (payroll, trades, tags, `playerWeeksLost`) | existing | Different injuries, different league. |
| `careers.path2BurnInTop10PrPct` | 7–16 pooled | `starterGrade` reads `tackles` for LB/S/CB starters. Indirect. |
| `verify.checks` | floor 330 | Unchanged. |
| `userOffers` tag / FA | 1779302491 / 1323223106 | Moves. Re-lock once, at the traced rate. |
| `trimIdentity` cuts / rng | 1600 / 2524091302 | Moves. Re-lock once, at the traced rate. |

No row in `docs/baselines.json` moves. No new band. Team tackles stay an ungated report; the 712.3 figure is not a target until trace item 1 says what it contains.

## Regression plan

New file `lib/core/sim/coverageTackle.test.ts`, with the fix, not with this note. Register it in the `package.json` `test` script and as a named step in `scripts/gate.ts` in both `FAST` and `FULL` (the #47 convention, the only permitted `scripts/` edit).

1. **Constants trace.** `COVERAGE_TACKLE_CREDIT.kickoff` and `.punt` equal the §5.13 counts exactly, and `coverageCreditRate` equals `credited / plays`. Same shape as the `TACKLE_CREDIT` asserts in `tackleShare.test.ts`.
2. **Zero is inert.** With both rows zero, a seed-42 one-season walk ends at the same `rngState` and the same box lines as main. This protects the staged landing.
3. **Scoring credits nothing.** `PlayEvent` (`lib/core/types.ts` 655–669) carries no tackler and no tackle count, so the event stream cannot show which play credited a tackle. Extract the decision as a pure helper beside `creditsTackle` (`game.ts` 265–268), e.g. `creditsCoverage(scoring, kind, roll)`, and assert it returns false for every `scoring` true input and for a zero row. Then a season-level bound: per club-game, coverage credits ≤ that club's count of `kickoff`/`punt` events with `result` `"return"` while it was kicking. Counting coverage credits separately from scrimmage credits needs a test-only counter or the `stTackles` field; neither exists today.
4. **Depth chart drives it.** Fixture club: move a named LB to slot 3 of `depthChart.LB`. Over a season he records coverage tackles. Move him to slot 1 and a different LB3 records them. Nobody outside `LB`/`S`/`CB` gets one unless the backup pool was empty.
5. **Play stream untouched.** For one game with fixed state, the play `rng` draw count from kickoff to final whistle is the same with and without the coverage rows filled. The parent may still diverge later through injuries; that is the canary re-lock, not a failure of this case.
6. **Box reconciles.** Team `tackles` = scrimmage credits + coverage credits on every game of a season, and `calibrate.scoreMismatches` stays 0. The first half needs the same split counter as case 3; the box line alone does not separate the two.

Run when the fix exists:

```bash
npx tsx lib/core/sim/coverageTackle.test.ts
npx tsx lib/core/sim/tackleShare.test.ts
npx tsx lib/core/sim/targetShare.test.ts
npx tsx lib/core/userOffers.test.ts
npx tsx lib/core/trimIdentity.test.ts
npx tsx scripts/verify.ts 3
npm run gate
```

Then Matt's Mac Studio `gate:full:serial` for `tails`, `drift`, `careers`.

## Probes

Scratch only, `/tmp/claude-0/-home-user/2d544cd2-1358-5d75-a97d-8a892043890c/scratchpad/wf`: `probe.ts` (volume on main), `probe2.mts` / `probe3.mts` (team totals, leaders, coverage split), `canary.mts` (seed-42 tag/FA walk), `trimProbe.ts` (trim walk). The patched copy is `wf/v2copy`, with an env-var stand-in rate that is not part of the proposed diff. No repo file other than this note was written. The `wf` directory is shared with other proposal runs and `wf/probe.ts` has since been overwritten by an unrelated probe, so these files are not a stable record. The reviewer re-ran the unchanged-tree volume row for seed 1 (`wf/stReview.mts`): 272 games, team tackles 655.0 (575–741), KR 27.3 and PR 27.2 per club, KR TD 0.22, PR TD 0.13, parent `rngState` 3980744328. It matches. The r=1 and r=0 columns, the position split and the stand-in canary literals were not re-run by the reviewer.

## Decisions for Matt

1. **Trace first.** Add a §5.13 block from nflverse `play_by_play` 2021–2024 with (a) whether the weekly `def_tackles_*` team totals include `kickoff`/`punt` plays, and (b) the kickoff and punt own-tackle rates on live non-TD returns. No code until both are in, with the computation shown.
2. **Which field.** If (a) is yes: credit `tackles`, as the diff does. If (a) is no: credit a new `stTackles` field, keep it out of `gameTackles` and out of every `tackles` reader. Sign one.
3. **Coverage pool.** LB3–4, S3, CB4 from the depth chart, weight `max(1, tkl − 34)`, kickers, punters and offence excluded. Or sign a different pool. The pool is not traced.
4. **No hit.** Coverage tackles carry no injury exposure. Sign, or ask for a traced special-teams injury rate first.
5. **Staged landing.** Allow the plumbing with zero rows (bit-identical, canaries unchanged), or land only with the traced rows.
6. **Re-lock.** When the traced rows land, one re-lock of `userOffers` seed-42 tag/FA (1779302491 / 1323223106) and `trimIdentity` seed-42 2030 (1600 cuts / 2524091302), measured on that build. Nothing else in `baselines.json`, no award weight, no `milestone-reference.json` edit.
7. **Return volume.** The 0.62 touchback and 0.55 punt-return shares are untraced. Leave them as they are for this change, or require them traced in the same §5.13 block.
8. **Coverage stream.** Draw the coverage coin and pick on the existing `tackleCreditRng`, as the diff does, which re-rolls every later scrimmage credit in the game; or on a separate per-game coverage stream with its own salt, which leaves scrimmage credits as they are and moves the parent only through credited coverage tackles. Sign one.

## Review (2026-11-11)

Adversarial review against this tree (main `9e74d34`). Every `file:line` was opened. No repo file other than this note was edited.

**Changed in place.**

- `sc` is declared at `game.ts` 628, not 644. Corrected.
- The run-tackle draw is 1489–1497 and its `hit` is at 1501 (forcer) or 1504 (tackler), not 1501–1503; the catch-tackle `hit` is 1869. `tackleDrawWeight` ends at 595. Corrected.
- The parent-RNG paragraph named only the credit route. The diff shares `tackleCreditRng` with the scrimmage coin (`game.ts` 577), so each coverage draw re-rolls later scrimmage credits in the same game. That is what the r=0 column measured. Added to "Which stream" and to "Gate, canaries", and added Decision 8 (separate stream or shared).
- Added: on the `tackles` path coverage credits widen the share-saturation denominators read by `tackleDrawWeight`, whose knees (`game.ts` 227–228) were traced against §5.13 shares. Tied to trace item 1 and Decision 2.
- Added: the diff also credits in playoff games and preseason exhibitions; `if (returner)` skips a returnerless return; `removeFromUnits` (747–763) already removes `ctx.out` men from the units.
- `tails.milestonesOff` row: the 7–12 figure is the `AGENTS.md` known-open series 7 / 12 / 10 / 10 / 11. Cited it, added HANDOFF's 11, and added the 150+ and 180+ season rows, which are also `tackles` keys.
- Trace item 1: attribute tackles by the tackler's own team column, not `defteam`. `posteam`/`defteam` roles on kickoff and punt rows must be read from the file.
- Regression case 3 could not be written as stated: `PlayEvent` (`types.ts` 655–669) carries no tackler. Rewritten as a pure-helper test plus a per-club-game upper bound. Case 6 needs the same split counter; noted.
- Added a sentence that 710.5 next to 712.3 is not evidence for r=1 and must not drive r, the pool or the return shares.
- Probes: `wf/probe.ts` was overwritten by another run. The reviewer reproduced the seed-1 unchanged-tree row exactly (655.0, 575–741, 27.3/27.2, 0.22/0.13, rng 3980744328). The stand-in r=1 and r=0 numbers were not re-run.

**Confirmed, no change.** Every kickoff and punt line cite (1118–1172, 1223–1299). `TACKLE_CREDIT` 253–262 and its §5.13 counts. `tackleCreditRng` 518–521. `buildStarters` 108–157 and `ROTATION` (`types.ts` 77–80); with `STARTERS` LB 2, S 2, CB 3 (`types.ts` 61–67) the backup slice is LB3–4, S3, CB4. `kickExposure` 869–876. `STAT_KEYS` (`stats.ts` 18–30). DPOY and ROY weights (`progression.ts` 347, 355; `seasonReview.ts` 136, 144). `teamLeaders.ts` 121, `seasonReview.ts` 164/189, `secondScene.ts` 46–49, `campGrade.ts` 35–36 and 58, `records.ts` 94–119. `tails.ts` 78/95 with `[19]`/`[128]` at 117/124. `milestone-reference.json` 60 and 352–375. `statcheck.leadTackles` 110 ±18. Canary literals: `userOffers.test.ts` 129/133 and `trimIdentity.test.ts` 21–22 hold 1779302491 / 1323223106 and 2524091302 with the 1600-cut list (signed in HANDOFF line 11). NFL numbers: 622–831, mean 712.3, the three own-tackle rates, 15+ = 3 and 20+ = 0 games, season max 128 are all in §5.13; the specialist injury gap is §4. §5.13 has no kick-return, touchback, or coverage rate, as the note says.

**Invariants.** (1) Seeded RNG: side stream only, no new entropy; the shared-stream effect is now stated. (2) Box score: credit only on non-scoring returns, no points touched. (3) Depth chart: pool is depth-chart slots, weighted, not sorted on overall; the `buildStarters` overall-sorted fallback for short rooms is existing behaviour. (4) One players array: untouched. (5) No dependency, backend, or LLM. (6) Staff: `sc` (`game.ts` 628) applies the existing `schemeAttrMultiplier` lean, the same read the catch-tackle draw already uses; the diff adds no staff path and no budget-dependent multiplier. (7) Rates are zero until traced; the pool, weight and no-hit rule are labelled design choices. No baseline moves; no band added. The proposal does not tune toward 712.3 as written.

**Canaries.** Both walks play full regular seasons and playoffs before their check points (`userOffers.test.ts` 112–129, `trimIdentity.test.ts` 134–148), so any non-zero row moves all four literals. At zero rows the diff exits before drawing and is bit-identical. The note's claim holds.

**Still open.**

- Trace item 1 (does 712.3 include special-teams plays) and item 2 (the coverage rates) are not in §5.13. Nothing builds until they are.
- The coverage pool, the `tkl − 34` weight and the no-hit rule are untraced design choices.
- The 0.62 / 0.55 return shares and the return-yard distributions remain untraced and drive the volume.
- The stand-in r=1 / r=0 rows and the r=1 canary literals are the author's measurement only.
- Regression cases 3 and 6 need a coverage/scrimmage split counter that does not exist.
