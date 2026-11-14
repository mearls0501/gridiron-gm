# Benching a passer for bad play, and trick plays

**UNSIGNED.** Proposal only. This note changes no code, test, `scripts/` file, `docs/baselines.json`, or canary. Matt signs any change. No re-lock, no dial retune, no panel.

**Traced 2026-11-14:** `docs/nfl-reference.md` §5.4c splits the real 21.4% of team-games with a second passer: trick plays 6.0 points, blowout relief 6.1, benching or extended relief 3.6, starter hurt 3.3, gadget snap or one series 2.4. Benching and trick plays together are 9.6 points, not most of the 21.4.

Tree: `/home/user/gridiron-gm/v2`, branch `claude/gracious-allen-i8ij43` at `72ac945` (main at `9e74d34`). Line numbers below are from this tree.

## Summary

`AGENTS.md` (known-open prose, "Garbage-time QB rotation now exists…") says real clubs have a second passer in 21.4% of team-games and the sim reaches 19.6%, through garbage-time rotation alone. The engine never pulls a quarterback for playing badly and never lets a non-quarterback throw. `AGENTS.md`'s further claim, that benching and trick plays "together are most of the real 21.4%", is **untraced**: `nfl-reference.md` §5.4b gives no split of the 21.4% by cause (item 1 below).

On this tree the aggregate is no longer short. Ten fresh seasons read **21.03%** of team-games with two or more passers. The problem is the shape. Measured against the margin table in `nfl-reference.md` §5.4b, the sim relieves its starter far too often in blowout losses and far too rarely in close games. Benching and trick plays are close-game mechanisms. Adding them on top of today's rotation pushes the aggregate past 21.4% and leaves the blowout excess in place.

This note proposes three things: (1) one in-game quarterback selector with a sticky "benched" set that steps down `team.depthChart`, never sorts on rating, and never edits the chart; (2) a performance hook and a trick pass, both behind off-by-default flags until their rates are traced; (3) an explicit user hook on `/play`. The rates the mechanisms need are **not** in `nfl-reference.md`. Neither is the split of the 21.4% by cause. Both must be traced before the flags turn on. Until then the axes are ungated.

## What the engine does today

**Who throws.** `passPlay` takes its passer from `onField(o, "QB", 0)` (`lib/core/sim/game.ts` 1519). `onField` (1031–1036) returns `starters.QB[slot]` unless `decided` is true for that side, and then returns `starters.QB[slot + 1]`. `decided` (1018–1025) is false before the fourth quarter except a 31-point third-quarter lead. In the fourth it is a 22/29-point lead (late/early) for the winning side and 20/27 for the trailing side, with "late" meaning under 420 seconds. The comment at 1001–1017 cites §5.4b. `decided` is re-evaluated every snap, so a starter comes back if the margin closes.

**Where the starter is read directly.** Five other sites read `starters.QB[0]` and ignore `onField`:

| site | line | effect in a rested game |
|---|---|---|
| two-point try converter fallback | 1065 | starter is the fallback converter |
| QB keeper / sneak carrier | 1345 | starter takes the keeper |
| `choosePass` red-zone `tha` lean | 1948 | starter's accuracy sets the pass lean |
| victory-formation kneel | 2018 | starter kneels |
| keeper mobility | 2138 | starter's `spd`/`agi` set the keeper rate |

A rested starter can therefore still take a sneak or a kneel. That is today's behaviour, not something this note adds. A benching that reuses only `onField` inherits the same leak.

**Where the units come from.** `buildStarters` (108–153) fills `starters.QB` from `team.depthChart.QB` in order (118–125), skipping injured, IR, PS and sat players. Only a short chart falls back to rating order (126–133). `ROTATION.QB` is 2 (`lib/core/types.ts` 78), so `starters.QB[1]` is the chart's next healthy quarterback. An emergency quarterback is only for an empty room (136–145).

**In-game injury.** `rollInGameInjury` (878–923) adds the victim to `ctx.out` (`Ctx.out`, 73–74) and splices him out via `removeFromUnits` (747–763). `nextAvailable` (715–739) walks the depth chart, then the roster at that position; for a quarterback with one still dressed it returns nothing rather than another position (736). `ctx.openers` (75–82) keeps a mid-game replacement from being credited a start. `INJURY_PER_RISK` (710) is described as tuned; it cites no source.

**Running backs rest on a different rule.** The carry share drops to 0.15 only under `garbageTime()` (994–999, read at 1369), which rests only the side that is ahead.

**No trick plays.** Every pass play's `passerId` is the `qb` from 1519 (1590, 1597, 1721, 1728, 1751, 1769, 1774, 1783), and every passing stat goes to `qbStat = statFor(qb, o)` (1529). The one non-quarterback ball-handling path is the receiver carry, `RECEIVER_CARRY_RATE = 0.039` (379), traced to §5.6/§5.5 and drawn on `econRng` (1346–1360). The carrier comes from the WR/TE units by speed, not by rating (1352–1360).

**The user's club.** `onField` has no user check, so garbage-time rotation already applies to the user's quarterback in bulk sim, Play Week and `/play`. The play call is read at 2124–2135: a `playCaller` from the call sheet (`lib/core/callSheet.ts` 93–102) or a `yield` on `/play`. `SnapCall` is `"run" | "pass" | "auto"` (`types.ts` 518). `CallSheet` has `passLean`, `aggression`, `snaps` (`types.ts` 524–534). `resumeLiveGame` replays `callSheet.snaps` on a fresh generator (`lib/core/liveGame.ts` 172–182). There is no way to change the quarterback from `/play`.

**Depth charts between games.** `simulateWeek` calls `refreshDepthCharts` every week (`lib/core/season/engine.ts` 67). Untouched charts are re-sorted; positions the user moved keep their order (`lib/core/generate.ts` 489–527).

## Measured on this tree

Probe `qbprobe.ts` (scratchpad, below). Reviewer re-ran seeds 1 and 42 on this tree: 24.08% pooled, which is the mean of the doc's 22.79 and 25.37, and the bucket rows agree. Ten seeds, one fresh regular season each, `newGame` + `advance`, unchanged code. 5,440 team-games with a pass attempt, 28 ties dropped from the margin table.

**Aggregate.**

| | sim | real (`nfl-reference.md` §5.4b) |
|---|---:|---:|
| team-games with two or more passers | **21.03%** | 21.4% (17-game era), 20.8% pooled |
| leader's share of team attempts | **96.10%** | 97.0% (17-game), 97.2% pooled |

Per seed (1, 2, 3, 4, 5, 7, 11, 42, 99, 12345): 22.79, 23.53, 21.32, 21.14, 19.67, 18.75, 22.98, 25.37, 19.67, 15.07. Mean 21.03, range 15.1–25.4. A 544-game season's binomial sd at 21% is 1.75 points, and the seeds spread wider than that. The `HANDOFF.md` figure of 19.6% (2026-08 entry, "within-game QB split") and today's 21.03% are inside that spread. **The aggregate gap is not established on this tree.**

**Shape, by final margin.** "Under 95%" is §5.4b's column: the share of team-games where the game's leading passer took under 95% of his club's attempts.

| final margin | sim n | sim leader share | sim under 95% | real under 95% (§5.4b) | sim 2+ passers |
|---|---:|---:|---:|---:|---:|
| win by 25+ | 374 | 94.1% | 39.0% | 31.0% | 63.1% |
| win by 17–24 | 541 | 98.7% | 6.5% | 8.1% | 12.4% |
| win by 9–16 | 776 | 99.2% | 2.4% | 7.3% | 3.2% |
| win by 1–8 | 1,015 | 99.4% | 2.4% | 3.9% | 2.7% |
| lose by 1–8 | 1,015 | 99.3% | 2.5% | 8.4% | 2.5% |
| lose by 9–16 | 776 | 98.5% | 7.2% | 12.1% | 8.6% |
| lose by 17–24 | 541 | 89.4% | **56.0%** | 22.5% | 61.7% |
| lose by 25+ | 374 | **74.5%** | **94.4%** | 37.8% | 97.1% |

§5.4b's leader shares for the last two rows are 93.9% and 91.1%. The sim's trailing starter in a 25-point loss throws 74.5% of his club's passes.

Weighting both "under 95%" columns by §5.4b's real bucket counts (184, 283, 399, 970, 989, 396, 276, 180; total 3,677):

| | real | sim at real weights |
|---|---:|---:|
| margins ≤ 16 (2,754 games) | 197.96 games, **7.19%** | 86.10 games, **3.13%** |
| margins ≥ 17 (923 games) | 210.10 games | 414.64 games |
| all | 408.06, 11.10% | 500.74, 13.62% |

So the sim is short about **112 under-95 games per 3,677** (3.0 points of all team-games) in one- and two-score games, and long about **205 per 3,677** (5.6 points) in blowouts. The aggregate lands near 21% because the two errors cancel.

**What the sim's second passers are.** None is a performance benching and none is a trick play; there is no path for either. Of 1,144 multi-passer games, 2 had a non-QB passer. There is no designed non-QB throw, so both came through a roster fallback (`buildStarters` 146–151 or `nextAvailable` 736–737). They were not inspected further. 75 (6.6%) had the opening quarterback logged as "left the game" in `state.log`. That undercounts injury: CPU day-to-day exits are not logged (`game.ts` 911–913). On the user's club, where every exit is logged and the box carries the play log, 27 multi-passer games had the relief passer's first throw at a margin that `decided` passes in 23 cases (85%). The other 4 (15%) came in at margins `decided` did not pass at that clock (three of them +1, −7 and −12). The only other path to a second passer is in-game injury, or an empty-room fallback. So today's second passer is roughly **85% decided-game rotation and 15% injury**. That is 169 user games; treat the split as indicative.

**A confound, not in scope.** The sim's margin distribution is wider than §5.4b's: 6.9% of team-games per side are 25+ (374/5,412) against 4.9% (180/3,677). More blowouts feed more rotation. This note does not propose touching it.

**Room for a hook in the sim.** Probe `badline.ts`, seeds 1–5, 2,717 starter team-games, the opening quarterback's FINAL line (an upper bound, since a hook would fire mid-game):

| final line | all team-games | margin ≤ 16 |
|---|---:|---:|
| 3+ INT | 3.86% | 2.10% |
| 2+ INT and passer rating < 55 (≥ 15 att) | 5.74% | 2.65% |
| passer rating < 40 (≥ 15 att) | 3.31% | 1.29% |

Any real hook rate below about 2.5% of team-games is reachable with an INT-based trigger. The real rate is not known (next section).

## What `nfl-reference.md` has, and what it does not

**Traced, usable as a check:** §5.4b's 21.4% / 20.8% multi-passer share, the 97.0% / 97.2% leader share, and the margin table (n, leader share, under-95% per bucket). Note the bucket table is pooled 2018–2024, not 17-game era. §5.4b's prose names "injuries, a wildcat snap, a trick play, one series to a backup" as what fills the one-score floor. It gives no counts.

**Not traced.** Each of these is needed and none is in the file:

1. **The 21.4% split by cause**: non-QB passer, decided-game relief, in-game injury relief, and relief that is none of those (performance benching, a package quarterback, one series). Primary data: nflverse `play_by_play_YYYY.csv.gz` 2021–2024 REG (`posteam`, `passer_player_id`, `pass_attempt`, `qb_dropback`, `qtr`, `game_seconds_remaining`, `score_differential`, `desc`), joined to source **P** `players.csv` for position. Rule: a non-QB `passer_player_id` is a trick play; the first relief snap's `score_differential` and clock against §5.4b's buckets marks decided relief; a starter whose last play's `desc` contains "injured", or who is listed in the nflverse `injuries` weekly report the following week, is injury; the rest is the benching/other residual. Source **S** `snap_counts` gives the starter's offensive snaps as a cross-check.
2. **Non-QB pass attempts per team-game**, and their completion, yards, TD and INT rates. Same pbp + position join.
3. **The performance-benching rate per team-game**, and the starter's line at the moment of the hook (attempts, INTs, fumbles lost, rating, quarter, margin). That is the trigger shape. Same pbp; the rating is computed from the starter's rows up to the relief snap.
4. **Whether a benched starter returns in the same game, and whether he starts the next week.** Same pbp plus nflverse `schedules`/`rosters` starters.
5. **Multi-passer share by margin bucket.** §5.4b gives "under 95%" per bucket, not "two or more passers". A one-attempt trick pass in a 35-attempt game is a 97.1% leader share, so it never shows in the traced column.
6. **The 17-game-era version of the bucket table.**
7. **The p10 within-game share of 93.1%** quoted in the `decided` comment (`game.ts` 1020–1022). It is not in the file.

Per invariant 7 every one of these stays ungated until it is added to `nfl-reference.md` with the computation shown. This note does not invent any of them.

## Proposed change

Three parts. Part 1 is mechanism only and has no rate. Parts 2 and 3 ship behind flags that default off, the `GG_CAMP_NUDGE` pattern (`lib/core/campGrade.ts` 35–36). With both flags off the engine takes no new branch and makes no new draw.

### Part 1 — one quarterback selector, with a benched set

Add `benched: Set<number>` to `Ctx` beside `out` (`game.ts` 73–74). Replace `onField` with a quarterback selector that every passer and keeper site calls:

```ts
// game.ts, replacing onField (1031–1036)
const qbOnField = (ctx: Ctx): Player | undefined => {
  const unit = (ctx.starters.QB ?? []).filter((p) => !ctx.benched.has(p.id));
  const diff = scoreDiffFor(ctx.team.id === home.id);
  if (!decided(diff > 0, Math.abs(diff))) return unit[0] ?? ctx.starters.QB[0];
  return unit[1] ?? unit[0] ?? ctx.starters.QB[0];
};
```

`passPlay` (1519) calls `qbOnField(o)`. Whether the five direct reads (1065, 1345, 1948, 2018, 2138) also move to `qbOnField` is a decision (below). Moving them fixes the "rested starter still kneels" leak in decided games too, and moves `calibrate.qbRushYds` slightly.

Invariant 3 holds because `unit` is `starters.QB`, which `buildStarters` built from `team.depthChart.QB` in order. Nothing sorts on `ovr`. `team.depthChart` is never written. `benched` lives on the `Ctx` and dies with the game. If `starters.QB` has no second healthy quarterback, nobody is benched: `qbOnField` returns the starter. No emergency quarterback is ever unsat for a benching, the same rule as #202 (`game.ts` 134–145).

If the backup is hurt after a benching, `removeFromUnits` / `nextAvailable` refill the unit from the chart as today. The benched starter is still in `starters.QB`, so `qbOnField` falls back to him (`unit[0] ?? ctx.starters.QB[0]`) when he is the only one left. A benched starter returns only when nobody else can play.

### Part 2a — the performance hook (flag `GG_QB_HOOK`)

Evaluated once per possession, between drives, for the side whose drive just ended. Not every snap, so a hook cannot fire mid-drive.

**Correction (review).** The first draft put this in `changePossession` (`game.ts` 1050–1053). That misses every drive that ends in a score. After a touchdown, field goal or safety the next drive starts from `kickoff` (1118–1166), which sets `offenseIsHome` itself and calls `startDrive` directly (1124, 1166). A pick-six is in that set: `passPlay` calls `defensiveTd` (1768), which scores and calls `kickoff()` itself (1302–1309), and the passer's club gets the ball back through `kickoff`, not `changePossession`. The interception that most often ends a starter's day would never be evaluated until his club's next non-scoring possession change. The hook belongs in `startDrive` (1042–1048, called from both paths), evaluated for the side about to take the field, before its first snap.

Conditions, all required:

- flag on, and the side's quarterback selector currently returns `starters.QB[0]` (not already benched, not in a decided game);
- `quarter >= 3`;
- the starter has at least `HOOK_MIN_ATT` attempts;
- his line meets `HOOK_LINE` (proposed shape: INTs ≥ 3, or INTs + lost fumbles ≥ 2 with game passer rating < `HOOK_RATING`);
- a backup exists in `starters.QB[1]`;
- for the user club, not in a `/play` session (Part 3);
- a coin at `HOOK_P` on a side stream.

The side stream is a per-game hash seeded like `tackleCreditRng` (`game.ts` 519–521), with a different salt. The coin does not draw on the play `rng`.

`HOOK_MIN_ATT`, `HOOK_LINE`, `HOOK_RATING` and `HOOK_P` are **untraced** (items 3 and 4 above). They do not get values in this note. If Matt wants the flag buildable before the trace, the constants carry a comment saying they are design placeholders, ungated, the same treatment as `kickExposure` (`AGENTS.md`, "Kickers and punters can now be hurt in-game…"). The badline probe shows an INT-led trigger has 2–3% of close team-games to work with.

On a hook: `ctx.benched.add(starter.id)`, and one `PlayEvent` with a new `kind: "qb_change"` (or a `state.log` line for the user's club only, if a new `PlayKind` is not wanted). The backup does not get a start (`openers`, 75–82). The starter's line stops where it is. The box reconciles because nothing scores.

For CPU clubs the benching lasts one game. `refreshDepthCharts` re-sorts the chart next week (`engine.ts` 67, `generate.ts` 525–527). A benching that costs a quarterback his job is a season-level availability mechanism (§5.3 "injury, benching, a lost job"), and it is out of scope here.

### Part 2b — the trick pass (flag `GG_TRICK_PASS`)

A branch inside `passPlay`, after the call is already a pass (`doPass` true, 2135). The number of pass *calls* does not move. **Correction (review):** the first draft said `calibrate.passAtt` was untouched by construction. It is not. The sack-or-scramble branch (1548–1599) runs on the thrower's `awr`, `agi`, `acc` and `spd`, and a sack or scramble is not an attempt (`passAtt++` is at 1601, after it). A receiver who throws is sacked or scrambles at a different rate, so attempts, sacks and QB-designated rush lines can move. The move is small at a rate of a few per cent of games, but it is not zero.

```ts
// game.ts, passPlay, after 1519
const trick = trickPassOn() && trickRng.chance(TRICK_PASS_RATE);
const thrower = trick ? trickThrower(o) ?? qb : qb;
```

`trickThrower` chooses from `o.starters.WR` and `o.starters.RB` (the depth chart's on-field units, as the receiver carry does at 1355–1360), weighted by `tha`, never by `ovr`. `receivers` (1527, which includes `RB[0]`) excludes the thrower. Every read of `qb` inside `passPlay` uses `thrower`: `qbStat` (1529), the sack branch (1548–1599, including `hit` at 1572 and the strip-sack `car` check at 1578), `accuracy` (1658), the completion term (1663), the interception term (1689), the deep-ball term (1790) and every `passerId`. Attempts, completions and yards go to his line through `qbStat` (1601, 1737–1739); the TD goes through `passerId` (2192–2193). The box score and the scoreboard still reconcile.

`trickRng` is another per-game hashed side stream. `TRICK_PASS_RATE` is **untraced** (items 1 and 2). Same treatment as the hook constants.

Wildcat direct snaps are runs. They do not create a second passer and are not in this note.

### Part 2c — the garbage-time margins (no flag; a separate decision)

Parts 2a and 2b add second passers in close games. Today's 21.03% already sits on the target, so adding them without touching `decided` overshoots 21.4%. The blowout excess (56.0% and 94.4% under-95 against 22.5% and 37.8%) is the trailing-side margins, 20/27 (`game.ts` 1024).

§5.4b's under-95% column **is** traced, per bucket. A refit of the trailing-side margins against that column is allowed by invariant 7. It is still a dial fitted toward a target. The calibration freeze (`ROADMAP.md` standing rules, Matt SIGNED 2026-10-08) allows no re-lock "unless a playtest finding needs one", and no playtest finding asks for this one; the evidence is this note's own probe. So 2c needs Matt to sign an exception to the freeze, not only the dial change. It also moves both canaries (below). This note does not propose new margin values. The fit should be to the bucket column, not to the 21.4% aggregate, and it should be read at 60 seeds; the 2026-08-02 `HANDOFF.md` entry ("QB pass volume, session seven", within-game QB split) reported its `statcheck` movement at 60 seeds and showed the 5-seed panel could not resolve it. That entry does not say how many seeds the 96.6% / 19.6% fit itself was read at.

### Part 3 — the user's hook on `/play`, and the call sheet

The user is the coach on `/play`. Inside a live session the engine does not run Part 2a for the user's club. Instead `/play` gets a "Go to the backup" control beside the snap intents (`app/play/page.tsx` 290 area, `lib/core/snapIntent.ts`). Garbage-time rotation still applies to the user's club, as today.

Storage, so a resumed session replays exactly:

```ts
// types.ts, CallSheet (524–534)
/** Offensive-snap index at which the user benched QB1 in this game. Missing = never. */
benchAtSnap?: number;

// callSheet.ts SimOpts (29–47)
/** User club: bench the starting QB before this offensive snap. Bulk-sim omits it. */
benchAtSnap?: number;
```

`runGameSim` (456) counts user offensive snaps where it reads the call (2124–2134). When the count reaches `benchAtSnap` it adds `starters.QB[0]` to the user `Ctx`'s `benched`. `resumeLiveGame` (`liveGame.ts` 172–182) passes the stored index. **Plumbing the first draft left out (review):** a live session opens through `openGameSim` (`game.ts` 448–454), which hard-codes `{ live: true }` and takes no other option; `createLiveGame` calls it at `liveGame.ts` 55. Both need a parameter for `benchAtSnap`. A Play Week replay goes through `userSimOpts` (`callSheet.ts` 93–101), which returns `undefined` when `snaps` is empty; if `benchAtSnap` is to carry into a Play Week sim, that early return must change too, or the field is `/play`-only and says so. `setCallSheet` (`callSheet.ts` 64–84) and `clearCallSheets` (86–90) handle the new field like `snaps`. Missing on an older save means never, which survives `JSON.stringify` / `JSON.parse` unchanged (invariant 5).

In bulk sim and Play Week the user's club gets the same coach rule as every CPU club, flag permitting. That matches how garbage-time rotation already treats the user. The user's depth chart is never edited. After a benching the user sees a log line and decides on `/depth-chart` whether the backup starts next week (`markDepthManual`, `generate.ts` 502–507).

## Gate, canaries

**The parent RNG.** Every regular-season game draws on the parent stream: `simulateWeek` opens `new Rng(state.rngState)` (`engine.ts` 66) and passes it to `simulateGame` (95); playoff games take the same parent stream (`lib/core/season/playoffs.ts` 201, 209). Preseason games do not: they run on `preseasonRng(state.seed, …)` (`lib/core/preseason.ts` 134). Putting the hook and trick coins on hashed side streams keeps the coins themselves off the parent. It does not keep the parent still. The first time either mechanism fires, a different passer throws, the sack, accuracy and interception branches take different paths, and every later parent draw shifts. One firing in season 1 is enough.

- **`userOffers` seed 42** (`lib/core/userOffers.test.ts` 113–133) walks season 1's regular season and playoffs before it asserts tag **1779302491** (129) and FA **1323223106** (133). **With either flag on, both move.** With both flags off and Part 1 limited to `passPlay`, neither moves: `qbOnField` returns exactly what `onField` returns when `benched` is empty.
- **`trimIdentity` seed 42** (`lib/core/trimIdentity.test.ts` 20–21; the walk is `atCutdownDoor`, 132–153; the asserts are 156–164) walks four seasons to the opening-2030 cut and asserts **1600** cuts and rng **2524091302**. Same answer: moves with a flag on, holds with both off.
- **Part 1 moving the five direct reads** (1065, 1345, 1948, 2018, 2138) changes who sneaks and kneels in decided games, and the keeper rate, with no flag. **That moves both canaries even with the flags off.** If Matt wants it, it needs a re-lock.
- **Part 2c** moves both canaries.
- **Part 3 alone** moves neither. Neither test sets a call sheet or opens a live game, so `benchAtSnap` is never present and no new branch runs.
- **Preseason.** Neither canary's parent stream is drawn in preseason (`preseason.ts` 134 uses `preseasonRng`). But a flag that fires in an exhibition changes who is hurt and how badly, and that state carries into week 1. The first draft did not say whether 2a/2b run under `opts.exhibition` (`game.ts` 777–790). Proposed: they do not; both check `!exhibition`. With that guard the preseason adds nothing to the canary answer above.

| metric | lock | why it can move |
|---|---|---|
| `calibrate.scoreMismatches` | max 0 | A trick pass credits the thrower through `passerId`. Must stay 0. |
| `calibrate.passAtt` / `cmpPct` / `int` / `passYds` / `passTd` | 34.772 ±2.5 / 66.723 ±2.5 / 0.774 ±0.2 / 240.293 ±12 / 1.601 ±0.22 | Pass calls do not move. Attempts can, through the thrower's sack/scramble rate (Part 2b correction). Efficiency moves when a backup or a receiver throws. Small at a rate of a few per cent of games. |
| `calibrate.qbRushYds` | 17.209 ±8 | Only if the direct reads move to `qbOnField`. |
| `statcheck.qb20PassYds` | 3046 ±244 | A benching takes attempts from a starter. Read at 60 seeds; the panel cannot resolve a move this size (`AGENTS.md`, retired `qb20PassYds` row). |
| `statcheck.qb5PassYds` / `qb10PassYds` / `leadPassYds` | 4089.8 ±360 / 3710 ±322 / 4730 ±700 | Same, smaller: hooks land on bad games, not top seasons. |
| `drift.passRecordSeasons` | max 3 | Can only fall. Already 0 of 20; the `baselines.json` note says that breaches §6.4's floor and the guard "passes for the wrong reason". |
| `tails.milestonesOff` | max 16 | Passing tail categories can move a count either way. |
| `statcheck.implausibleLines` | max 0 | A receiver with a pass line must not trip a QB-shaped check. |
| `coherence` 400+ passing reasons | none | The leader is chosen by `passAtt`; a trick pass never leads. |
| `leverage` | wrongSign 0 | QB `tha`/`dec` effects can soften if bad games end early. Re-run. |
| `drift.playerWeeksLost` | 2158.23 ±700 | Not touched. No injury path changes. |

No `baselines.json` entry is proposed. No band is added for the multi-passer share or the bucket table; the calibration freeze stands.

## Regression plan

New file `lib/core/qbHook.test.ts`, registered in `package.json` `test` and in both `FAST` and `FULL` of `scripts/gate.ts` (the #47 convention). Cases:

1. **Flags off is identity.** Seed 42, one regular season, flags unset. Every box score and `state.rngState` equal a run on the parent commit. This is the canary guard for Part 1.
2. **The chart picks the backup.** A club whose `depthChart.QB` is `[A, B, C]` with C's `ovr` above B's. Force a hook. Every later `passerId` is B. `team.depthChart.QB` is still `[A, B, C]` after the game.
3. **Sticky.** After a hook, the margin returning to a one-score game does not bring A back.
4. **No bench into an empty room.** A club with one dressed quarterback. Force the hook conditions. Nobody is benched; no emergency quarterback is unsat.
5. **Backup hurt after a hook.** B goes out; C comes in from the chart. If C is absent, A returns.
6. **Starts.** B's box row has `started: false`; A's has `started: true`.
7. **Trick pass reconciles.** Force a trick pass for a TD. The thrower is a WR or RB from `starters`, his line has `passAtt`, `passCmp`, `passYds`, `passTd`; the target has the matching `rec`/`recTd`; the score equals the box.
8. **Coins are off the parent.** With the hook forced to "no" by a zero rate, flags on, the parent `rngState` after a season equals flags off.
9. **`/play` replay.** Open a live game, call three snaps, bench at snap 4, call two more. `resumeLiveGame` from the stored sheet produces the same play log and box.
10. **User club in a live session.** The coach hook never fires for the user club when `opts.live` is set.
11. **Hook after a pick-six.** Force a starter over the trigger with an interception returned for a touchdown. The hook is evaluated before his club's next snap (the `startDrive` placement), not at its next non-scoring possession change.
12. **Exhibition.** With both flags on and `opts.exhibition` set, no hook and no trick pass fire.

Then: `npx tsc --noEmit`; `verify.ts 5`; `calibrate.ts 300` with each flag on; `statcheck` `qb20PassYds` at 60 seeds with and without; `coherence.ts 5`; `leverage.ts 150`; the two canaries; `node scripts/e2e.mjs` and `node scripts/e2e-interact.mjs` for the `/play` control. A Studio `gate:full:serial` with each flag on against one with both off, before any flag defaults on.

## Probes

Both read-only, run with `npx tsx` from `/home/user/gridiron-gm/v2`, importing repo modules by absolute path. Scripts in `/tmp/claude-0/-home-user/2d544cd2-1358-5d75-a97d-8a892043890c/scratchpad/wf/`.

- `qbprobe.ts 1,2,3,4,5,7,11,42,99,12345` — 75 s. Multi-passer share, leader share, the margin table, the injury-logged count, the user-game relief margins.
- `badline.ts 1,2,3,4,5` — the opening quarterback's final line against candidate triggers.

No code was built. There is no stand-in-rate measurement of the hook or the trick pass.

## Decisions for Matt

1. **Trace first, or build first?** Either the seven untraced items above are computed into `nfl-reference.md` (§5.4b addendum, nflverse pbp 2021–2024 + source P position join) before any code, or Parts 1–3 are built with both flags off and the constants marked as untraced placeholders.
2. **Part 1 scope.** `qbOnField` in `passPlay` only (no canary moves with flags off), or also at the five direct reads 1065, 1345, 1948, 2018, 2138 (fixes the rested-starter sneak and kneel; moves `userOffers` and `trimIdentity`; needs a re-lock).
3. **Hook trigger shape.** INT-led (`INTs ≥ 3`, or `INTs + lost fumbles ≥ 2` with rating under a threshold), evaluated between drives (`startDrive`, see item 11) from the third quarter on. Values stay unset until traced.
4. **Trick pass passer pool.** WR and RB from the on-field units, weighted by `tha`. Or WR only.
5. **Part 2c.** Whether to open a separate signed refit of the trailing-side `decided` margins (`game.ts` 1024) against §5.4b's under-95% column, read at 60 seeds. Without it, turning on 2a/2b overshoots 21.4%.
6. **The user's club.** On `/play` the user owns the hook (proposed) and the coach rule does not fire. In bulk sim and Play Week the coach rule fires for the user like every CPU club (proposed), or never fires for the user.
7. **Storage.** `CallSheet.benchAtSnap` and `SimOpts.benchAtSnap` (proposed), or a new `SnapCall` value.
8. **Log surface.** A new `PlayKind` `"qb_change"` in the play log, or a `state.log` line for the user's club only.
9. **Re-lock.** When a flag turns on, `userOffers` seed 42 (tag 1779302491, FA 1323223106) and `trimIdentity` seed 42 (1600 cuts, rng 2524091302) move and need a signed re-lock in the same PR.
10. **Part 2c and the freeze.** 2c is a fit toward §5.4b's bucket column with no playtest finding behind it. It needs a signed exception to the 2026-10-08 calibration freeze, not only a dial signature.
11. **Hook placement and exhibitions.** The hook runs at `startDrive` (so scoring drives and pick-sixes are seen), and 2a/2b are off under `opts.exhibition` (proposed).

## Review (2026-11-11)

Adversarial review against the tree at `72ac945`. Every `file:line` was opened. The probe was re-run on seeds 1 and 42 and reproduced (24.08%, the mean of the doc's 22.79 and 25.37). Every §5.4b figure (21.4 / 20.8, 97.0 / 97.2, the eight bucket counts, leader shares and under-95% values) matches `nfl-reference.md` 1260–1303, and the weighted 7.19% / 3.13% / 11.10% / 13.62% arithmetic checks. The baseline values in the risk table match `docs/baselines.json`.

**Changed in place.**

1. Citations corrected: `openers` 76–81 → 75–82; `INJURY_PER_RISK` 709 → 710; `nextAvailable` 713–738 → 715–739; `removeFromUnits` 742–758 → 747–763; CPU day-to-day logging 910–912 → 911–913; `simulateWeek` RNG open `engine.ts` 62 → 66 and `refreshDepthCharts` 63 → 67 (two places); `markDepthManual` 503–508 → 502–507; `trimIdentity` 133–156 → walk 132–153, asserts 156–164. The `passerId` list gained 1774 and 1783, and `qbStat` (1529) is named as where passing stats land.
2. **Part 2a placement was wrong.** `changePossession` never runs after a scoring drive; `kickoff` calls `startDrive` directly (1124, 1166), and `defensiveTd` calls `kickoff` itself (1302–1309). A pick-six, the most likely hook trigger, would not have been evaluated. Moved to `startDrive` (1042–1048); test 11 added.
3. **Part 2b's "passAtt untouched by construction" was wrong.** The sack/scramble branch (1548–1599) reads the passer's `awr`/`agi`/`acc`/`spd`, and a sack or scramble is not an attempt. The list of `qb` reads the trick pass must redirect was incomplete (`qbStat`, 1663, 1689, 1790, `hit`, the strip-sack check). The claim that pass yards go through `passerId` was wrong: yards go through `qbStat` (1737–1739); only the TD goes through `passerId` (2192–2193). Risk-table row updated.
4. **Part 2c and the freeze.** The draft treated 2c as an ordinary signed dial change. The freeze allows re-locks only for a playtest finding, and there is none; the doc now says 2c needs a freeze exception (decision 10). The "60 seeds as the 2026-08 fit was" wording overstated what `HANDOFF.md` says and was reworded.
5. **Part 3 plumbing.** `openGameSim` (448–454) hard-codes `{ live: true }` and `createLiveGame` (`liveGame.ts` 55) passes nothing else; `userSimOpts` (`callSheet.ts` 93–101) returns `undefined` with no snaps. Both noted.
6. **Untraced attribution labelled.** `AGENTS.md`'s "benching and trick plays are most of the 21.4%" is now marked untraced in the summary.
7. **Canary section completed.** Playoffs draw the parent (`playoffs.ts` 201, 209); preseason does not (`preseason.ts` 134). Part 3 alone moves neither canary. 2a/2b under `opts.exhibition` was unspecified; proposed off (decision 11, test 12). `drift.passRecordSeasons` relabelled per its `baselines.json` note ("breaches §6.4's floor"), not "accepted limitation".

**Checked and sound.** The canary claim for Part 1 holds: with `benched` empty, `qbOnField` returns exactly what `onField` (1031–1036) returns in every case, including a one-quarterback unit, and makes no draw, so with both flags off and Part 1 limited to `passPlay` neither `userOffers` (tag 1779302491 / FA 1323223106) nor `trimIdentity` (opening 2030, 1600 cuts, rng 2524091302) moves. Both canaries walk regular-season games on the parent stream, so a flag that fires once before those points moves both, as stated. Hashed side streams seeded from `state.seed` and `game.id` (the `tackleCreditRng` pattern, 519–521) satisfy invariant 1 and replay identically in `/play`. `trickThrower` weighted by `tha` over depth-chart units does not sort on `ovr` (invariant 3). Env flags read via `process.env` follow `campNudgeOn` (`campGrade.ts` 35–36) and add no dependency (invariant 5). The proposal gives no value to any untraced rate (invariant 7).

**Still open.**

- All seven untraced items in "What `nfl-reference.md` has" remain untraced; every 2a/2b constant is a placeholder and both axes stay ungated.
- `badline.ts` was not re-run by the reviewer; its table is the author's.
- The 85% / 15% decided-versus-injury split rests on 27 user-club games and is indicative only.
- The sim's wider margin distribution (6.9% vs 4.9% of team-games 25+) feeds the blowout excess and is out of scope; a 2c refit that ignores it fits margins to compensate for a score-distribution error.
- A benched starter returning as `unit[0] ?? starters.QB[0]` when the backup is hurt and no third quarterback is dressed should be checked against `nextAvailable`'s QB rule (736): the unit can hold only the benched starter, which is the intended fallback, but test 5 must cover it.
