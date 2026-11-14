# Phase 1 leftovers: play art, durable /play, live opening kick, P2, P5

**BUILT 2026-11-13** on Matt's go-ahead ("do the phase 1 leftovers next"). Packets A, B (without `returnYards`), C, D1 and E3 were built as recommended. D2 and the formation tree stay deferred. See `HANDOFF.md` 2026-11-13. No re-lock, no dial retune, no panel.

Tree: `/home/user/gridiron-gm/v2`, branch `claude/gracious-allen-i8ij43`, main at `9e74d34`. Line numbers below are from this tree.

## Summary

`docs/ROADMAP.md` 153–157 lists five Phase 1 leftovers: formation tree and play art, a `/play` session that survives refresh, a live opening kick, **P2** (optional `PlayEvent` fields, not signed), and **P5** (snap log on every CPU box, a save-size decision). The spec lists the same set (`docs/phase1-text-pbp-spec-2026-09-22.md` 172–178, 206, 283–288).

This note splits them into five separable packets and measures what each costs on this tree.

| Packet | What | Parent RNG | Outcomes | Save cost | Recommend |
|---|---|---|---|---|---|
| **A** | Durable `/play`: close the leftover, fix the stale-replay residual | none | none | one short string on `callSheet` | yes, 2nd |
| **B** | P2: `kickerId`, `returnerId`, `returnYards` on `PlayEvent`; defensive-TD row order | none | none | ~150 B per persisted box | yes, 1st |
| **C** | Play art (no formation tree) | none | none | none | yes, 3rd |
| **D1** | Opening kick shown live on `/play` (presentation of the existing touchback) | none | none | none (rides on B) | yes, with C |
| **D2** | Opening and halftime kick simulated live in the engine | **moves** | **moves** | +~70 B per game | no, defer |
| **E** | P5: CPU snap log, one-week rolling window | none | none | ≤ +0.40 MB mid-season, ~+0.03 MB at recap | yes, 4th |

The main finding: the durable `/play` leftover already shipped on 2026-10-01 (`docs/HANDOFF.md` 4782–4821, 4570–4605). The ROADMAP line is stale. One residual remains, and it is measured below: a reload after a mid-game depth-chart edit replays a different game from the one the player saw.

The second finding: P5 as written ("snap log on every CPU box") adds **+6.72 to +6.74 MB** to every end-of-season save on this tree. That is over the signed `drift.saveMbAtEnd` max of 15.89 by about 5.7 MB and over the 20 MB quota guard. A compact tuple codec still adds about +1.35 MB, which is over the 1.0 MB headroom. Only a rolling window fits without a re-lock.

The third finding, found while measuring P2: a defensive return touchdown writes its snap row **after** the scoring club's PAT and kickoff rows. 76 of 81 defensive TDs in a 300-game run show that order.

## What is on this tree

### Event stream

- `simulateGame` keeps one `playLog` and stamps each event in `emit` (`lib/core/sim/game.ts` 933–946). `PlayEvent` is `{ q, clock, down, toGo, yardLine, offenseId, kind, result, yards, playerId?, targetId?, homeScore, awayScore }` (`lib/core/types.ts` 655–669).
- Persist policy: every box gets `drives = buildDrives(playLog)`. Only a game with the user club gets `plays` (`game.ts` 2273–2287). CPU games return `plays` in memory but do not keep them on the box.
- Nothing in the engine reads `box.plays` or `box.drives`. The only non-UI reader of `box.plays` is `wentToOvertime` (`lib/view/playByPlay.ts` 18–25). `scripts/calibrate.ts` reads `side.plays`, which is the team counter, not the log (39).

### Opening and halftime kickoff

- The opening kickoff is a touchback event with no draw: `off().stats.possessions++` and an `emit` at the 25 (`game.ts` 1965–1969).
- The second-half kickoff is the same stub (`game.ts` 1990–1996).
- Overtime and every post-score kickoff call the live `kickoff()` (`game.ts` 1118–1172, 1982). `kickoff()` draws `rng.chance(0.62)` for a touchback (1123), then a weighted returner (1132–1135), `rng.chance(0.0055)` for a TD (1137), `normal(23, 8)` for return yards (1138), and `kickExposure` on the kicker (1148–1149), which can roll an injury (869–876, 878–883).
- Each game draws on the week's shared parent stream (`lib/core/season/engine.ts` 64–99). A draw added to one game shifts every later game that week, and the saved `rngState`.

### `/play` session

- `createLiveGame` clones the save at kickoff, declares inactives on the clone, and opens the generator on `new Rng(kickoff.rngState)` (`lib/core/liveGame.ts` 44–57). It does not draw on the save RNG.
- `/play` writes the snap list to `callSheet.snaps` on every Run / Pass / Coach click and on Let the coach finish (`app/play/page.tsx` 138–157). The `apply` store path persists the save (`lib/store/game.ts` 71–72, 353–372).
- On load, `/play` calls `resumeLiveGame` (`app/play/page.tsx` 55–72), which replays `callSheet.snaps` on a fresh clone of the **current** save (`liveGame.ts` 172–182).
- A finished game is sealed onto `state.sealedLive` (`liveGame.ts` 58–82, 134–136). Play Week commits the seal instead of simming again (`engine.ts` 93–96, `applySealedLive` `liveGame.ts` 143–160).
- `livegame` already covers the reload: same snaps, same play log, same last snap, same clock and spot, codec round-trip, and coach-finish reload (`lib/core/liveGame.test.ts` 240–262, 272–279, 332–356).

### UI

- `/play` shows Last snap, Drive Log with a field bar, and Play by Play (`app/play/page.tsx` 274, 368–371, 376–410). The field bar is `driveBar` (`lib/view/playByPlay.ts` 203–209).
- `/game/[id]` already links a drive to its snaps (`app/game/[id]/page.tsx` 706). That is spec packet P1.
- `formatPlay` prints `"Kickoff — touchback"` for every touchback (`playByPlay.ts` 121–124) and `"Penalty — TEAM, N yards"` for a foul (143). Side comes from the yardage sign (`penaltyTeamId`, 80–86).
- There is no formation anywhere in the engine. `docs/nfl-reference.md` §4, the "This-week play-calling" bullet (832–837): "no formation tree — the play loop has down / toGo / yardLine / passBias / aggression and a victory kneel, nothing else. Ungated."

### Penalties carry no foul type

Offensive pre-snap fouls draw `rng.pick([5, 5, 10, 10, 15])` yards (`game.ts` 2083–2084). Defensive fouls draw `rng.pick([5, 5, 5, 10, 15])` (2097–2098). No foul name is chosen anywhere. P2 cannot stamp one from an existing outcome string, because there is none.

## Measured on this tree

Read-only probes under `/tmp/claude-0/-home-user/2d544cd2-1358-5d75-a97d-8a892043890c/scratchpad/wf`, run with `npx tsx` from `v2/`. No repo file was written.

### Save size, P5 (`p5size.ts`)

New game, regular season and playoffs through to `offseason-recap`, which is the point where `drift` takes `saveMB` (`scripts/drift.ts` 111, 204). Before each regular and playoff week, a clone of the save sims that week's games on the same RNG and keeps each CPU `plays` array. Those arrays are then attached to the real CPU boxes and the save is re-encoded with `encodeSave`.

| | seed 42 | seed 12345 |
|---|---:|---:|
| games played (user / CPU) | 285 (17 / 268) | 285 (17 / 268) |
| encoded save at recap, today | 6.311 MB | 6.332 MB |
| same save, every CPU box with `plays` | 13.055 MB | 13.054 MB |
| **delta** | **+6.743 MB** | **+6.722 MB** |
| bytes per user box `plays` (already persisted) | 26,552 | 26,196 |
| bytes per CPU box `plays` | 26,376 | 26,293 |
| events per CPU game | 166.4 | — |
| JSON bytes per event | 158.6 | — |
| tuple form `[q,clock,down,toGo,yardLine,offenseId,kindIdx,resultIdx,yards,playerId,targetId]`, all CPU | 1.350 MB (31.8 B / event) | 1.346 MB |

User `plays` already cost about **0.43–0.45 MB** of every recap save (451,380 and 445,328 bytes).

`drift.saveMbAtEnd` is measured at season 20's recap. Box scores are current-season only (`docs/save-size-2026-07-27.md`, "Where the bytes were"; `state.games = []` at rollover, `lib/core/offseason/index.ts` 299). So a per-season box cost is a constant on every snapshot. It moves `saveMbAtEnd` by the full amount and leaves `saveGrowthMbPerSeason` (end minus start, `drift.ts` 396) nearly flat.

The signed bounds are `saveMbAtEnd` max **15.89** (panel 14.89 + 1.0) and `saveGrowthMbPerSeason` max **0.61** (`docs/baselines.json` 351–358). The quota guard is `< 20` MB (`drift.ts` 403–406).

### Durable `/play` residual (`resume.ts`)

Seed 42, first user game. A live session takes 12 calls (38 events). The snap list is stored, the save is cloned, one edit is made, then `resumeLiveGame` runs.

| edit between calls and reload | first differing event | events | score at pause |
|---|---:|---:|---|
| none | — (identical) | 38 / 38 | same |
| user QB1 ↔ QB2 in `depthChart` | **index 2** | 38 / 38 | same |
| user RB1 ↔ RB2 in `depthChart` | **index 1** | 38 / 38 | same |
| `callSheet.passLean` = +1 | — (identical on this seed) | 38 / 38 | same |

A reload after a depth-chart edit rewrites plays the player already watched. The lean edit did not diverge on this seed; it can, because an `"auto"` snap reads `choosePass`, which reads the lean. Not measured further.

Replay cost: a full 65-snap list replays in **45 ms**; a 12-snap list in 32–50 ms.

A projection of both clubs (team objects without `callSheet.snaps`, the two leans, every player on either club, `rngState`, `game.conditions`) is **89,007** JSON bytes and hashes with FNV-1a in **2.1 ms** (`key.ts`).

### Defensive return TD order (`dtd.ts`)

300 calibrate-style games, `newGame({ seed: 12345 })`, `new Rng(999)`, the `scripts/calibrate.ts` loop. 81 defensive TDs (`defTd` summed over player lines). **76** of them appear in the log as: scoring club's `xp`/`two` row, then the kickoff row, then the turnover snap row at the old spot. Example, one game:

```
pass complete   offense 3  yl 62   7-0
xp good         offense 0          14-0
kickoff return  offense 3  yl 24   14-0
run fumble      offense 3  yl 76   14-0     <- the snap that caused the TD
pass incomplete offense 3  yl 24   14-0
```

Cause: `defensiveTd` awards, kicks the PAT, and kicks off inside the play function (`game.ts` 1302–1310, called from 1462 and 1768). The scrimmage row is emitted only after the play function returns (`game.ts` 2160–2177). The code comment at 2144–2146 already records that the units swap first. The row also carries no returner: `playerId` is the passer or carrier.

Also: 12.42 penalty events and 10.77 kickoff events per game; 165 events per game.

### Live opening kick in the engine, D2 (`kick.ts`)

A scratch copy of `game.ts` with the two stubs replaced by `kickoff()` (opening: flip `offenseIsHome`, call `kickoff()`; halftime: `offenseIsHome = receivedFirst`, call `kickoff()`). Same 300-game calibrate loop.

| | main | live opening + halftime kick |
|---|---:|---:|
| parent `rng.state` after 300 games | **3282470162** | **649645961** |
| points per team-game | 23.938 | 23.483 |
| plays per team-game | 62.35 | 62.49 |
| possessions per team-game | 10.722 | 10.768 |
| kick returns per team-game | 1.665 | 2.038 |
| kick return average | 23.05 | 22.91 |
| kick return TDs | 6 | 7 |
| games whose first row is not a touchback | 0 | 116 of 300 |
| log bytes per game | 26,143 | 26,204 |

The main-branch state 3282470162 matches the Stage 1 parity literal in `docs/proposal-kicking-game-events-2026-11-11.md` (64). The points drop (−0.455) is about one standard error of the main-branch mean (per-team-game sd **11.12**, SE **0.454** on 600 team-games, measured in review, `rev/sd.ts`) and inside the ≈0.64 SE of a difference between two independent 600-team-game means. It is not resolvable on this sample. It is also inside `calibrate.pts` 23.144 ±1.6 (`baselines.json` 57–61). Every other calibrate line moves too, because the parent stream moves.

## Packet A — durable `/play`

### A1. Close the leftover in docs

The session already survives refresh. `ROADMAP.md` 155 and spec rows 176 and 206 say it does not. Strike them, and point at HANDOFF 2026-10-01 ("keep the called game", 4782–4821) and "Coach finish persists the auto snaps" (4570–4605).

### A2. Fix the stale replay

`resumeLiveGame` replays on the save as it is now, not as it was at kickoff (`liveGame.ts` 172–182). The `/play` page does not stop a depth-chart, roster, or call-sheet edit mid-game (`app/depth-chart/page.tsx` 88 writes `t.depthChart[pos]`; `app/week/page.tsx` 231–289 writes the leans). A reload then shows a different game. After the whistle, the page also replays instead of showing the seal, so `/play` can show a final score that Play Week will not commit (`engine.ts` 95 commits the seal). That last case follows from the code; it was not run.

Proposed rule: stamp a kickoff key with the snaps. If the key no longer matches on reload, the called game is void and `/play` opens at kickoff with a one-line notice. A sealed game always shows the seal.

```diff
--- a/v2/lib/core/types.ts
+++ b/v2/lib/core/types.ts
@@ -530,6 +530,11 @@ export interface CallSheet {
    * Consumed in order; leftover snaps use choosePass. Missing = Auto.
    */
   snaps?: SnapCall[];
+  /**
+   * Kickoff key for `snaps`: a hash of both clubs, their players, the leans,
+   * the conditions and rngState when the session opened. Display only.
+   */
+  snapsKey?: string;
 }
--- a/v2/lib/core/liveGame.ts
+++ b/v2/lib/core/liveGame.ts
+/** FNV-1a over a projection of what this game reads. No RNG. */
+export function liveKey(state: GameState, gameId: number): string {
+  const g = state.games.find((x) => x.id === gameId);
+  if (!g) return "";
+  const ids = [g.homeId, g.awayId];
+  const json = JSON.stringify({
+    rng: state.rngState,
+    cond: g.conditions ?? null,
+    teams: ids.map((id) => {
+      const { callSheet, ...t } = state.teams[id];
+      return { t, lean: callSheet?.passLean ?? null, agg: callSheet?.aggression ?? null };
+    }),
+    players: state.players.filter((p) => p.teamId != null && ids.includes(p.teamId)),
+  });
+  let h = 0x811c9dc5;
+  for (let i = 0; i < json.length; i++) { h ^= json.charCodeAt(i); h = Math.imul(h, 0x01000193); }
+  return (h >>> 0).toString(36);
+}
@@ export function createLiveGame(state: GameState, gameId: number) {
+  const key = liveKey(state, gameId);
   const kickoff = JSON.parse(JSON.stringify(state)) as GameState;
@@
     peek,
     snaps: () => calls.slice(),
+    key: () => key,
     seal,
   };
@@ export function resumeLiveGame(state: GameState, gameId: number) {
-  const live = createLiveGame(state, gameId);
-  const snaps = state.teams[state.userTeamId].callSheet?.snaps;
-  if (!snaps || snaps.length === 0) return live;
+  const live = createLiveGame(state, gameId);
+  const sheet = state.teams[state.userTeamId].callSheet;
+  const snaps = sheet?.snaps;
+  if (!snaps || snaps.length === 0) return { live, stale: false };
+  if (sheet?.snapsKey && sheet.snapsKey !== live.key()) return { live, stale: true };
   let view = live.peek();
   for (const choice of snaps) {
     if (view.done) break;
     view = live.call(choice);
   }
-  return live;
+  return { live, stale: false };
 }
--- a/v2/app/play/page.tsx
+++ b/v2/app/play/page.tsx
@@ const persistSnaps = (calls: SnapCall[]) => {
     apply((s) => {
-      setCallSheet(s, { snaps: calls });
+      setCallSheet(s, { snaps: calls, snapsKey: session.key() });
       if (sealed) writeSealedLive(s, sealed);
     });
```

`setCallSheet` needs the matching `"snapsKey" in patch` branch, and it must drop `snapsKey` when `snaps` is cleared (`lib/core/callSheet.ts` 64–84). On `stale`, `/play` clears `snaps`, `snapsKey` and `sealedLive` for that game on the first new call and shows "Your depth chart or roster changed after kickoff. The game restarted." When `state.sealedLive?.gameId === g.id`, `/play` builds its done view from the seal (`box`, `box.plays`) instead of a replay.

Keys are stamped only by `/play`. A save with `snaps` and no `snapsKey` (written before this packet) replays as today.

**Review correction: do not put the `liveKey` check in `userSimOpts` as first drafted.** `userSimOpts` runs inside `simulateWeek`'s game loop (`engine.ts` 95), after `resolveWaivers`, `refreshDepthCharts`, `trimCpuRosterSanity` and `declareGamedayInactives` have mutated the real save (`engine.ts` 65–85; `declareGamedayInactives` writes `team.inactives`, `inactives.ts` 57–58, 126–127). The projection includes the team objects, so the key computed there is not the key `/play` stamped. Review probe (`rev/key2.ts`, seed 42, weeks 1–3, user game): the key matched after `resolveWaivers` in 3 of 3 weeks, changed after `refreshDepthCharts` in 2 of 3, and changed after `declareGamedayInactives` in **3 of 3** (5/5, 4/3, 5/4 inactives). A check there would void the hand calls on essentially every Play Week. If Matt wants Play Week to refuse a stale list, the key must be taken at a fixed point before any of those mutations (top of `simulateWeek`, before `resolveWaivers`) and compared there, or `userSimOpts` stays as it is. This is unresolved; see Review.

Pre-existing, not caused by this packet: an unsealed, partly-called game is already not the same game at Play Week. `/play` opens on `new Rng(kickoff.rngState)` without `refreshDepthCharts` (`liveGame.ts` 45–55), while Play Week runs the user game on the shared week stream after the depth-chart refresh and after every earlier game in the loop has drawn (`engine.ts` 66–95). Only the seal reproduces what the player saw.

`resumeLiveGame`'s return type changes from the session to `{ live, stale }`. Every caller changes with it: `app/play/page.tsx` 66 and the six `resumeLiveGame(` calls in `lib/core/liveGame.test.ts` (251, 272, 279, 332, 344, 356). The draft above does not show those edits.

Alternative, not recommended: block depth-chart and roster edits while `snaps` is non-empty. There are many entry points (`/depth-chart`, `/roster`, `/trades`, `/free-agency`, `/week`), and a missed one is the same bug.

Cost: no RNG anywhere; `liveKey` is a hash. Save +≈20 bytes (`"snapsKey":"…"`, a ≤7-character base-36 value plus the key name) on one team for one week. `JSON.stringify` of the projection is about 89 KB and 2.1 ms, run once at session open.

## Packet B — P2, optional `PlayEvent` fields

Additive only, per spec §3.1 (`phase1-text-pbp-spec` 184–193). No field is renamed. Every value comes from a variable the engine already holds. No draw.

| Field | On | Source | Use |
|---|---|---|---|
| `kickerId?: number` | every `kickoff` event, stubs included | `kicking.starters.K[0]?.id` | opening kick in D1, kickoff rows |
| `returnerId?: number` | `int` / `fumble` snap scored by the defence | `defender.id` in `defensiveTd` | "Smith 34 yd interception return TD" |
| `returnYards?: number` | same | `retYds` in `defensiveTd` | same |

Not proposed:

- **Penalty foul type.** No outcome string exists (`game.ts` 2083–2084, 2097–2098). A foul name would need a new draw on a side stream and a traced distribution. `nfl-reference.md` has no penalty-type block. The dataset is nflverse `play_by_play` `penalty_type`, `penalty_team`, `penalty_yards`. Ungated, left out.
- **First-down flag.** The view can derive it from the next row's `down === 1` and same `offenseId`.

Fix the defensive-TD order in the same packet. It is a display defect in the same emit site.

```diff
--- a/v2/lib/core/types.ts
+++ b/v2/lib/core/types.ts
@@ -664,6 +664,12 @@ export interface PlayEvent {
   playerId?: number;
   targetId?: number;
+  /** Kickoff: the kicker. Display only. */
+  kickerId?: number;
+  /** Defensive return TD on this snap: the returner and the return. */
+  returnerId?: number;
+  returnYards?: number;
   homeScore: number;
   awayScore: number;
 }
--- a/v2/lib/core/sim/game.ts
+++ b/v2/lib/core/sim/game.ts
@@ const kickoff = () => {
     const receivingIsHome = !offenseIsHome;
     const receiving = receivingIsHome ? ctxHome : ctxAway;
+    const kicking = receivingIsHome ? ctxAway : ctxHome;
+    const kickerId = kicking.starters.K[0]?.id;
     offenseIsHome = receivingIsHome;
     if (rng.chance(0.62)) {
       startDrive(TOUCHBACK_YARDLINE);
       emit({
         kind: "kickoff", result: "touchback", yards: 0,
         down: 1, toGo: 10, yardLine: TOUCHBACK_YARDLINE, offenseId: receiving.team.id,
+        kickerId,
       });
@@
-    const kicking = receivingIsHome ? ctxAway : ctxHome;
     kickExposure(kicking.starters.K[0], kicking, 0.25);
     (kickerId added to the "td" and "return" emits too)
@@ const defensiveTd = (defender: Player, defCtx: Ctx, kind: "INT" | "fumble", retYds: number) => {
+    lastDefTd = { id: defender.id, yards: retYds, home: defCtx.team.id === home.id };
     const st = statFor(defender, defCtx);
@@ main loop, opening stub (1965–1969) and halftime stub (1990–1996)
-    down: 1, toGo: 10, yardLine: TOUCHBACK_YARDLINE, offenseId: off().team.id,
+    down: 1, toGo: 10, yardLine: TOUCHBACK_YARDLINE, offenseId: off().team.id,
+    kickerId: (offenseIsHome ? ctxAway : ctxHome).starters.K[0]?.id,
@@ before the snap (2150–2153)
     const snapYl = yardLine;
+    const snapAt = playLog.length;
+    const snapHome = homeScore, snapAway = awayScore;
+    lastDefTd = null;
     const outcome = doPass ? passPlay() : runPlay(sneak);
@@ scrimmage emit (2170–2176)
-      emit({
+      const row = {
         kind, result, yards: outcome.yards,
         ...
-      });
+      };
+      if (outcome.scored && lastDefTd) {
+        // The PAT and kickoff were already logged inside the play function.
+        // Put the snap ahead of them, with the score the return made.
+        playLog.splice(snapAt, 0, {
+          ...row, q: quarter, clock: Math.max(0, Math.round(clock)),
+          homeScore: snapHome + (lastDefTd.home ? 6 : 0),
+          awayScore: snapAway + (lastDefTd.home ? 0 : 6),
+          returnerId: lastDefTd.id, returnYards: lastDefTd.yards,
+        });
+      } else emit(row);
```

`let lastDefTd: { id: number; yards: number; home: boolean } | null = null;` sits beside `playLog` (`game.ts` 933). Optional fields are left off the object when undefined, so the wire form keeps the existing `wire()` convention in `liveGame.test.ts` 46–49.

`formatPlay` (`playByPlay.ts` 112–168): `int` / `fumble` with `returnerId` prints `"QB pass intercepted, Smith 34 yd return TD"`. Kickoff touchback keeps the exact text `"Kickoff — touchback"` so `scripts/e2e-desks.mjs` 10, 557, 585, 611, 629 still match; the kicker goes in a second muted span, not in the string.

`buildDrives` (`lib/core/sim/events.ts` 67–157; `terminalOf` 36–46) needs no code change: the snap row now closes the drive as `turnover`, and the PAT/two-point rows that follow are absorbed into that drive (`events.ts` 142–151). **The drive count does change.** Today the misordered rows produce two spurious drives per defensive TD: a zero-play drive for the scoring club holding the PAT, and a one-play kickoff-plus-turnover drive. Review probe (`rev/drv.ts`, same 300-game loop, the 76 misordered snaps moved ahead of their PAT in the stored log, nothing re-simulated): `buildDrives` total **6552 → 6410 (−142)** over 300 games; parent `rng.state` 3282470162 on both. `box.drives` is persisted on every box, CPU included (`game.ts` 2273, 2285), so B changes the stored drive chart on every game with a defensive TD. No gate harness reads `drives`; `playByPlay.test.ts` 121, 144 and `liveGame.test.ts` 99 use floors that the drop cannot breach. The defensive-TD drive is labelled `turnover`, not a return score; there is no `DriveResult` for a defensive return TD. That label is left as it is.

**Review caveat on `returnYards`: the source values are wrong today, and P2 would put them on screen.** The engine already prints them in `scoringPlays.desc` (`game.ts` 1306), so this is pre-existing, but B makes them more visible.

- Fumble return: `defensiveTd(recoverer, d, "fumble", 100 - spot)` (`game.ts` 1462). `spot` is offence-relative (a touchdown is `yardLine ≥ 100`, `game.ts` 1750), so the defence is `spot` yards from the end zone, not `100 - spot`. The TD chance rises when `spot < 30` (1461), which agrees with that reading. A fumble at the offence's 70 is printed as a 30-yard return.
- Interception return: `ds.intYds += retYds` (1766), then `defensiveTd` adds `Math.max(retYds, 20)` to the same player's `intYds` again (1305, 1768). A pick-six counts its return yards twice in the box, and neither figure is tied to field position.

Neither is a scoring error (points and TD stat lines reconcile; invariant 2 holds). Fixing either changes a box stat or a description, not a draw. This proposal does not fix them. Matt decides whether B ships `returnYards` as is, ships it after a separate display fix, or drops the field (see Decisions).

Cost: no RNG. `rng.state` after the 300-game loop must stay **3282470162**. Save: `kickerId` is ~14 B on 10.77 kickoffs per game, about 150 B per persisted box, about 2.6 KB per season on user boxes. Under Packet E's window, about 2.4 KB more at peak.

## Packet C — play art, no formation tree

A field strip per snap, drawn from fields the event already has: line of scrimmage (`yardLine`), line to gain (`yardLine + toGo`), end spot (`yardLine + yards`), and a glyph by `kind` / `result` (run line, pass arc, sack behind the line, turnover marker, kick arc). On `/play` it goes in the Last snap card (`app/play/page.tsx` 274, 368–371). On `/game/[id]` it opens on a Play by Play row.

New pure helper `lib/view/playArt.ts`:

```ts
export interface SnapArt {
  los: number;        // 0..100, offense-relative, clamped
  lineToGain: number | null;
  end: number;        // clamped 0..100; a TD reaches 100
  glyph: "run" | "pass" | "incomplete" | "sack" | "turnover" | "kick" | "penalty" | "none";
}
export function snapArt(e: PlayEvent): SnapArt;
```

The SVG mirrors for the away offence using `offenseId` against `homeId`, as `penaltyTeamId` already does (`playByPlay.ts` 80–86). No RNG, no save field.

**Formation tree: not proposed.** The engine has no formation or personnel (`nfl-reference.md` §4, 832–837). Drawing a formation would show the player a choice the sim never made. A formation tree that changes outcomes is an engine change. It needs traced rates first: formation and personnel shares and their effect on yards. `nfl-reference.md` has none. Datasets: nflverse `play_by_play` `shotgun`, `no_huddle`; nflverse participation `offense_formation`, `offense_personnel`, `defenders_in_box`. That axis stays ungated and out of Phase 1.

## Packet D — live opening kick

### D1. Presentation (recommended)

The opening and halftime kicks stay touchbacks in the engine. On `/play`, before the first snap, the opening row animates as a kick arc to the end zone in the play-art strip and names the kicker from Packet B's `kickerId`. The text row stays `"Kickoff — touchback"`. It shows what the engine did, and nothing it did not.

No RNG, no save field, no engine edit beyond Packet B.

### D2. Engine (not recommended now)

Replace both stubs with `kickoff()`. Measured above: the parent stream moves (3282470162 → 649645961 on 300 games), 116 of 300 openings become returns, kick returns rise from 1.665 to 2.038 per team-game, and points read 23.94 → 23.48.

Why defer:

- It runs two more kickoffs per game through constants that trace to nothing: 0.62, 0.0055 and `normal(23, 8)` (`game.ts` 1123, 1137, 1138). `docs/proposal-kicking-game-events-2026-11-11.md` 73–74 records the same gap and the missing kickoff rule era. Invariant 7 says not to add load to an untraced rate.
- It moves the parent RNG before both canary points, and `livegame` asserts the opening row is a touchback (`liveGame.test.ts` 237, 256, 286). So it needs a signed canary re-lock and test edits.
- The kicking-game Stage 2 (onside kicks, blocked punts) moves the same stream for the same kind of reason. One re-lock for both is cheaper than two.

If Matt wants D2, build it on that proposal's era decision and its §5.14 kickoff block, in the same PR as Stage 2.

## Packet E — P5, CPU snap log

### Options, measured or estimated from the table above

| Option | Recap delta (one season of boxes) | `saveMbAtEnd` from the 14.89 panel | Verdict |
|---|---:|---:|---|
| E0 today: user boxes only | 0 | 14.89 | — |
| E1 every CPU box, JSON as today | **+6.72 to +6.74 MB** | ≈ 21.6 | fails 15.89 and the 20 MB quota |
| E2 every CPU box, tuple codec | +1.35 MB | ≈ 16.24 | fails 15.89 |
| E2 + user boxes also tupled | +1.35 − ~0.34 ≈ +1.01 MB | ≈ 15.90 | on the line; needs a re-lock, which the freeze forbids |
| **E3 CPU `plays` kept for the latest week only** | ≈ +0.03 MB (one Super Bowl box, if CPU) | ≈ 14.9 | fits |

The 14.89 panel figure is from `748036a`, not this tree. The `saveMbAtEnd` column adds this note's season-1 delta to that panel. Neither was re-measured at season 20; that needs `drift`, which this note did not run.

E2 also breaks the codec rule that every stored key carries its own name (`lib/store/codec.ts` 22–27).

E3 peak is mid-season: at most 15 CPU games a week (16 games, one of them the user's) × ~26.4 KB ≈ **+0.40 MB** while a week's boxes hold their logs. `drift` does not measure mid-season, so no gate sees it. It is about 2% of the 20 MB quota.

### Proposed E3

Keep `simulateGame` unchanged (`game.ts` 2286), so `lib/view/playByPlay.test.ts` 143 ("CPU game does not persist the snap log") still holds at the engine. Attach in the week engine.

```diff
--- a/v2/lib/core/season/engine.ts
+++ b/v2/lib/core/season/engine.ts
@@ export function simulateWeek(state: GameState, onKickoff?: RegularKickoffObserver): void {
+  // P5: CPU snap logs live one week. Clear the last week's before this one.
+  dropCpuPlays(state);
@@
     const result = sealed ?? simulateGame(state, g, rng, userSimOpts(state, g));
     g.homeScore = result.homeScore;
     g.awayScore = result.awayScore;
     g.boxScore = result.box;
+    if (!g.boxScore.plays && result.plays.length) g.boxScore.plays = result.plays;
     g.played = true;
--- a/v2/lib/core/season/playoffs.ts
+++ b/v2/lib/core/season/playoffs.ts
@@ (same two lines around 219–222)
```

`dropCpuPlays` deletes `boxScore.plays` from every played game without the user club. It reads nothing random. It runs at the top of `simulateWeek` and the playoff week sim.

`/game/[id]` already renders a snap log whenever `box.plays` exists (`app/game/[id]/page.tsx` 359–367, 720–734). An older CPU box keeps its Drive Chart, as today.

Cost: no RNG. The `plays` array is the one the engine already built. Old saves load; boxes without `plays` are already tested (`lib/view/playByPlay.test.ts` 226).

## Regression plan

All new assertions go in the two harnesses already registered in both gate tiers (`scripts/gate.ts` 99, 112, 188, 201), except `playArt.test.ts`, which needs registration in `package.json` `test` and in `FAST` and `FULL`. That registration is the only `scripts/` edit any packet makes.

**A — `liveGame.test.ts`.**

1. Twelve calls, store snaps and `snapsKey`, swap user QB1 ↔ QB2, reload: `stale === true`, the view is at kickoff (`plays.length === 1`).
2. Same with no edit: `stale === false`, plays `deepEqual` the live log (existing assertion, plus the key).
3. `snaps` with no `snapsKey` (a pre-packet save) replays as today.
4. Finished and sealed, then a depth-chart swap, then reload: the done view's box `deepEqual`s `sealedLive.box`.
5. `userSimOpts` returns `undefined` on a key mismatch.
6. Save `rngState` unchanged across every step above.

**B — `lib/view/playByPlay.test.ts`.**

1. 300-game calibrate loop (`seed 12345`, `new Rng(999)`): parent `rng.state` **3282470162** and the same per-game scores as before. One-shot PR check; not a committed literal.
2. Every `int` / `fumble` row with `returnerId` comes before any `xp` / `two` row with the same clock and the other `offenseId`. Zero out-of-order rows (today 76 of 81).
3. Every `kickoff` row has `kickerId` when the kicking club has a K.
4. `formatPlay` golden lines: interception return TD, fumble return TD, kickoff touchback text unchanged.
5. `buildDrives` on the probe sample: the turnover drive closes on the snap row and holds the PAT; no zero-play drive follows a defensive TD; total drive count falls by exactly the spurious pair per moved TD (review probe: 6552 → 6410 on the 300-game loop). One-shot PR check, not a committed literal.

**C — new `lib/view/playArt.test.ts`.** TD ends at 100; sack ends behind `los`; incomplete ends at `los`; penalty has no line to gain moved by the glyph; away offence mirrors; clamps at 0 and 100.

**D1 — browser.** `scripts/e2e-desks.mjs` keeps `OPENING_KICKOFF` exact. Add: the opening row shows a kicker name in its second span.

**E — `lib/view/playByPlay.test.ts` and `scripts/e2e.mjs`.**

1. After `advance` through two regular weeks: every CPU box of the latest week has `plays`; no CPU box of an earlier week has `plays`; `rngState` equals a run of the pre-packet code from the same save.
2. Codec round-trip with CPU `plays`.
3. `e2e.mjs` 14–15 and `checkPhase1BoxScores` (343) treat a CPU snap log as a failure. Under E3 a latest-week CPU box has one. The check must open a CPU game from an earlier week, or accept a log on the latest week. That is a `scripts/` edit Matt signs with E.
4. `npm run savesize` (`scripts/savesize.ts`) at the PR head, one seed, mid-season and at recap, pasted into the PR.

## Gate, canaries

| Guard | Today | A | B | C + D1 | D2 | E3 |
|---|---:|---|---|---|---|---|
| `userOffers` seed 42 tag `rngState` (`lib/core/userOffers.test.ts` 129) | **1779302491** | must not move | must not move | must not move | **moves** | must not move |
| `userOffers` seed 42 FA `rngState` (133) | **1323223106** | must not move | must not move | must not move | **moves** | must not move |
| `trimIdentity` seed 42 opening 2030 cuts (`lib/core/trimIdentity.test.ts` 22, 160–163) | **1600** | must not move | must not move | must not move | **moves** | must not move |
| `trimIdentity` rng after that click (21, 164) | **2524091302** | must not move | must not move | must not move | **moves** | must not move |
| 300-game parity `rng.state` (one-shot) | 3282470162 | n/a | must hold | n/a | 649645961 | n/a |
| `calibrate` / `statcheck` `##M` | locked | byte-identical | byte-identical | byte-identical | all move; `pts` 23.94 → 23.48 on the probe | byte-identical |
| `calibrate.scoreMismatches` | 0 | 0 | 0 | 0 | must stay 0 | 0 |
| `playbyplay` | pass | pass | pass + new rows | pass | pass | line 143 still holds |
| `livegame` | pass | pass + new rows | pass | pass | **237, 256, 286 fail** until edited | pass |
| `e2e-desks` opening row | exact text | pass | pass | pass | fails on a return | pass |
| `e2e.mjs` CPU snap-log check | pass | pass | pass | pass | pass | fails until edited |
| `drift.saveMbAtEnd` max 15.89 | panel 14.89 | ≈ 0 | ≈ 0 | 0 | ≈ 0 | ≈ +0.03 MB |
| `drift.saveGrowthMbPerSeason` max 0.61 | panel 0.56 | ≈ 0 | ≈ 0 | 0 | ≈ 0 | ≈ 0 |
| `determinism` | clean | clean | clean | clean | clean | clean |

Both canary walks sim full seasons of games before their checkpoint: `userOffers` runs seed 42 to `offseason-tag` (`userOffers.test.ts` 113–131), and `trimIdentity` runs to the 2030 opening. Any change to draws inside `simulateGame` reaches both. A, B, C, D1 and E3 add no draw and change no outcome, so neither canary may move. D2 moves the parent RNG inside every game, before both points.

## Numbers this proposal needs that `nfl-reference.md` does not have

- Kickoff touchback share, return-TD rate and return-yard distribution for the opening and halftime kick (D2 only). `game.ts` 1123, 1137, 1138 are untraced. nflverse `play_by_play`: `kickoff_attempt`, `touchback`, `return_yards`, `return_touchdown`, by kickoff rule era. D2 stays ungated and deferred.
- Kick returns per team-game. `scripts/calibrate.ts` 98 prints "NFL ~1.5 / 23.0" with no citation. Same dataset.
- Penalty foul-type distribution for a penalty description (not proposed). nflverse `play_by_play` `penalty_type`.
- Formation and personnel shares and their outcome effect (formation tree, not proposed). nflverse `play_by_play` `shotgun`, `no_huddle`; nflverse participation `offense_formation`, `offense_personnel`.

A, B, C, D1 and E need no NFL number.

## Recommended order

1. **B (P2).** It fixes a measured display defect, and C and D1 read `kickerId` and `returnerId`.
2. **A.** Close the stale ROADMAP line; fix the replay key. Independent of B.
3. **C + D1** together. Pure view.
4. **E3.** After B, so the kept CPU logs already carry the new fields and the right row order.
5. **D2** only with kicking-game Stage 2 and a traced kickoff block.

## Decisions for Matt

1. **Durable `/play`.** Agree the leftover is shipped (HANDOFF 2026-10-01) and strike it from `ROADMAP.md` 155 and spec 176 / 206. Sign A2: a stale kickoff key voids the called game and restarts at kickoff with a notice. Or pick the alternative: block edits while snaps exist. Separately, choose whether Play Week checks the key at all; if it does, the key must be taken before `resolveWaivers` at the top of `simulateWeek`, not in `userSimOpts` (see A2 review correction).
2. **P2.** Sign the three optional fields (`kickerId`, `returnerId`, `returnYards`) and the defensive-TD row move, accepting that the move changes `box.drives` on every box with a defensive TD (−142 drives on 300 games). Choose how `returnYards` ships, given the fumble distance is reversed (`100 - spot`) and pick-six yards are double-counted today: as is, after a separate display/stat fix, or without `returnYards`. Confirm no penalty foul type.
3. **Play art.** Sign the field strip with no formation drawing. Confirm the formation tree stays out of Phase 1 and ungated.
4. **Opening kick.** Sign D1 (presentation only). Confirm D2 is deferred to kicking-game Stage 2.
5. **P5.** Pick E3 (CPU log for the latest week only, ≈ +0.40 MB mid-season peak, ≈ +0.03 MB at recap) or E0 (no change). E1 and E2 are not offered under the freeze.
6. **`scripts/` edits.** Sign `playArt.test.ts` registration (C) and the `e2e.mjs` CPU snap-log check change (E3).
7. **Canaries.** Confirm A, B, C, D1 and E3 must leave all four canary literals where they are.

## Review (2026-11-11)

Adversarial review. Only this file was edited. Review probes are under `/tmp/claude-0/-home-user/2d544cd2-1358-5d75-a97d-8a892043890c/scratchpad/wf/rev` (`drv.ts`, `key2.ts`, `sd.ts`), run read-only with `npx tsx` from `v2/`.

### Checked and correct

- Engine citations: `kickoff()` 1118–1172 with draws at 1123 / 1132–1135 / 1137 / 1138 and `kickExposure` 1149; opening stub 1965–1969; halftime stub 1990–1996; OT `kickoff()` 1982; `defensiveTd` 1302–1310, called from 1462 and 1768; penalty picks 2084 and 2098; snap capture 2144–2153; scrimmage emit 2170–2176; persist policy 2273–2287. `PlayEvent` `types.ts` 655–669; `CallSheet.snaps` 533.
- `liveGame.ts` 44–57, 58–82, 134–136, 143–160, 172–182; `app/play/page.tsx` 55–72, 138–157, 274, 368–371, 376–410; `engine.ts` 64–99 and 94–95; `callSheet.ts` 64–84, 93–100; `playByPlay.ts` 18–25, 80–86, 112–168, 122, 143, 203–209; `gate.ts` 99, 112, 188, 201; `e2e-desks.mjs` 10, 557, 585, 611, 629; `e2e.mjs` 14–15, 343; `drift.ts` 111, 204, 396, 403–406; `baselines.json` 57–61, 351–358; `codec.ts` 22–27; `offseason/index.ts` 299; `playoffs.ts` 219–222; `HANDOFF.md` 1644–1646, 4570–4605, 4782–4821; `ROADMAP.md` 153–157; kicking proposal 64 and 73–74; `nfl-reference.md` 832–837.
- Defensive-TD misorder reproduced exactly: 81 `defTd`, 76 misordered, parent `rng.state` **3282470162** after the 300-game loop; main-branch points per team-game 23.938.
- Canaries. `userOffers` asserts **1779302491** at `offseason-tag` (`userOffers.test.ts` 129) and **1323223106** at `offseason-fa` (133) after a seed-42 walk through a full season (113–131). `trimIdentity` walks seed 42 to the 2030 cutdown click (`trimIdentity.test.ts` 132–157) and asserts **1600** cuts (`CUTS` 22–159, count at 160) and **2524091302** (21, 164). Both walks run `simulateGame` every week via `advance`. A, B, C, D1 and E3 add no draw: `liveKey` is FNV over JSON; B reads `starters.K[0]?.id` and splices the log; E3's `dropCpuPlays` deletes a key. Neither walk stores `callSheet.snaps`, so the A edits return early. None of these moves the parent RNG before either canary point. D2 adds draws inside every game from the first season on, so it moves the parent RNG before both points.
- Invariants. No `Math.random` / `Date` (1); no score is touched (2: B moves a log row, not a point); no player selection by rating (3); no new collection (4); no dependency, FNV is inline (5); no staff effect (6). No NFL number is presented as fact: the D2 kickoff constants (0.62, 0.0055, `normal(23, 8)`) and `calibrate.ts` 98's "NFL ~1.5 / 23.0" are labelled untraced, and `nfl-reference.md` has no kickoff, penalty-type, formation or personnel block (searched). Nothing tunes toward a target. D2 is correctly left ungated and deferred. No packet adds a `##M` metric, band or re-lock, so the calibration freeze holds; `playArt.test.ts` registration is the #47 test-registration exception.

### Changed in this review

1. `emit` citation 932–946 → 933–946.
2. **A2: the `userSimOpts` key check was wrong.** Measured: the projection changes after `declareGamedayInactives` in 3 of 3 weeks and after `refreshDepthCharts` in 2 of 3, all before `userSimOpts` runs. As drafted it would void hand calls on nearly every Play Week. Replaced with a correction and a fixed-point alternative. Added the pre-existing note that an unsealed partly-called game is already a different game at Play Week (different RNG position, refreshed depth charts).
3. A2: named the callers the `resumeLiveGame` return-type change breaks (`app/play/page.tsx` 66, six calls in `liveGame.test.ts`). Save cost +≈8 B → +≈20 B.
4. **B: "drive count unchanged" was false.** Measured −142 drives on the 300-game loop (two spurious drives per moved TD). `box.drives` changes on every box, CPU included. Fixed the `buildDrives` / `terminalOf` line ranges (30–45 → 67–157 / 36–46) and regression item B5.
5. **B: added the `returnYards` caveat.** The fumble return distance is `100 - spot` where it should be `spot` (`game.ts` 1462), and a pick-six's yards are added to `intYds` twice (1766 and 1305). Both are pre-existing. P2 would display them.
6. D2: the "inside one standard error" claim now carries measured figures (sd 11.12, SE 0.454, SE of difference ≈0.64). The drop is not resolvable.
7. E3 peak: "16 CPU games" → at most 15 (one game a week is the user's); +0.42 → +0.40 MB in the summary, body and Decisions.
8. `playByPlay.test.ts` references now give the path `lib/view/playByPlay.test.ts`.
9. Decisions 1 and 2 now carry the `userSimOpts` choice and the `returnYards` choice.

### Still open

- The A2 key's coverage. It hashes every field of both team objects and every player on both clubs. Any unrelated write to those objects between kickoff and reload (a mood or morale tick, a viewed flag, a trade-block edit) would void the called game. No probe listed which pages write team or player fields mid-week. That list is needed before A2 ships.
- A fixed-point key for Play Week (before `resolveWaivers`) was not prototyped or measured.
- The fumble-distance and pick-six double-count bugs are reported, not fixed or measured for frequency beyond the 81-TD sample. They need their own packet and Matt's call.
- There is no `DriveResult` for a defensive return TD; after B the drive reads `turnover`.
- The P5 save-size figures (`p5size.ts`) were not re-run in review; they were checked for arithmetic consistency only (268 × 26,376 B ≈ 6.74 MiB; tuple 31.8 B × 166.4 × 268 ≈ 1.35 MiB). The 14.89 panel is from `748036a`, and season-20 `drift` was not run.
- D2 figures other than the main-branch `rng.state` and points were not reproduced.
