/**
 * Regression: /play advances the running sim (Wave 3.7 Packet 3c)
 * and reads the engine playLog from the live yield (Wave 3.8 Packet 2).
 *
 * call() / finishAuto() must resume mid-game — no kickoff re-sim.
 * Same-seed live advance must match simulateGame's box AND plays.
 * Bulk-sim / simulateGame drains in one next() — no live yield.
 * finishAuto records each remaining user snap as "auto" so a reload
 * keeps the coach-finished game. A finished game is sealed; Play Week
 * commits that result instead of drawing the user game again.
 *
 * Run: npx tsx lib/core/liveGame.test.ts
 */
import assert from "node:assert/strict";
import { newGame } from "./newGame";
import { Rng } from "./rng";
import { openGameSim, simulateGame } from "./sim/game";
import { startRegularSeason, advance } from "./season/engine";
import { declareGamedayInactives } from "./inactives";
import { setCallSheet, userSimOpts } from "./callSheet";
import { createLiveGame, resumeLiveGame, writeSealedLive } from "./liveGame";
import { encodeSave, decodeSave } from "../store/codec";
import { SnapCall } from "./types";

function userGame(st: ReturnType<typeof newGame>) {
  return st.games.find(
    (g) =>
      g.season === st.season &&
      g.week === st.week &&
      !g.played &&
      (g.homeId === st.userTeamId || g.awayId === st.userTeamId)
  );
}

function untilKickoff(st: ReturnType<typeof newGame>) {
  startRegularSeason(st);
  let guard = 0;
  while (!userGame(st) && guard++ < 18) advance(st);
  assert.ok(userGame(st), "user has a game this week");
}

function cloneState(st: ReturnType<typeof newGame>) {
  return JSON.parse(JSON.stringify(st)) as typeof st;
}

/** Save wire form. Optional play fields (`targetId`) are absent, not undefined. */
function wire<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

function simWithInactives(st: ReturnType<typeof newGame>, snaps?: SnapCall[]) {
  const copy = cloneState(st);
  const g = userGame(copy)!;
  declareGamedayInactives(copy, [g.homeId, g.awayId]);
  let i = 0;
  return simulateGame(
    copy,
    g,
    new Rng(copy.rngState),
    snaps
      ? { playCaller: () => snaps[i++] ?? "auto" }
      : undefined,
  );
}

function boxOf(r: { homeScore: number; awayScore: number; box: ReturnType<typeof simulateGame>["box"]; plays: ReturnType<typeof simulateGame>["plays"] }) {
  return {
    homeScore: r.homeScore,
    awayScore: r.awayScore,
    home: r.box.home,
    away: r.box.away,
    quarters: r.box.quarters,
    scoringPlays: r.box.scoringPlays,
    players: r.box.players,
    drives: r.box.drives,
    plays: r.plays,
  };
}

{
  const st = newGame({ seed: 46 });
  untilKickoff(st);
  const g = userGame(st)!;
  const live = createLiveGame(st, g.id);
  const peek = live.peek();
  assert.equal(peek.done, false);
  if (peek.done) throw new Error("expected a live snap");
  const opening = peek.plays[0];
  assert.ok(opening, "opening kickoff is already on the log");
  const clock0 = peek.info.clock;
  const q0 = peek.info.quarter;
  const drives0 = peek.drives.length;
  const score0 = [peek.info.homeScore, peek.info.awayScore];

  const after = live.call("run");
  assert.equal(after.plays[0], opening, "opening play is the same object — no kickoff re-sim");
  assert.ok(after.plays.length >= peek.plays.length, "live call kept the in-progress log");
  if (!after.done) {
    assert.ok(after.drives.length >= drives0, "drives persist across a live call");
    const advanced =
      after.info.quarter > q0 ||
      after.info.clock < clock0 ||
      after.plays.length > peek.plays.length ||
      after.info.homeScore !== score0[0] ||
      after.info.awayScore !== score0[1];
    assert.ok(advanced, "live call advanced clock, score, or the play log");
    assert.ok(after.info.down >= 1 && after.info.down <= 4);
    assert.ok(after.info.yardLine >= 1 && after.info.yardLine <= 99);
  }

  let view = after;
  let n = 0;
  while (!view.done && n++ < 12) view = live.call("pass");
  assert.equal(view.plays[0], opening, "later calls still hold the same opening play");
  if (!view.done) {
    assert.ok(view.drives.length >= 1, "possession / drive list survived stepping");
    assert.ok(
      view.info.quarter > q0 || view.info.clock < clock0 || view.drives.length > drives0,
      "mid-game clock and possession moved forward",
    );
  }
}

const HAND_CALLS: SnapCall[] = ["run", "pass", "auto"];

for (const seed of [46, 47, 48]) {
  const st = newGame({ seed });
  untilKickoff(st);
  const g = userGame(st)!;
  const live = createLiveGame(st, g.id);
  let view = live.peek();
  let i = 0;
  while (!view.done) {
    view = live.call(HAND_CALLS[i++ % HAND_CALLS.length]);
    assert.ok(i < 400, `seed ${seed} live hand-call did not finish`);
  }
  assert.equal(view.done, true);
  if (!view.done) throw new Error("expected a finished live game");
  const sim = simWithInactives(st, view.calls);
  assert.deepEqual(view.result.box, sim.box, `seed ${seed} hand-called live box matches simulateGame`);
  assert.deepEqual(view.result.plays, sim.plays, `seed ${seed} hand-called live plays match simulateGame`);
}

{
  const st = newGame({ seed: 47 });
  untilKickoff(st);
  const g = userGame(st)!;
  const live = createLiveGame(st, g.id);
  const view = live.finishAuto();
  assert.equal(view.done, true);
  if (!view.done) throw new Error("expected a finished live game");
  const sim = simWithInactives(st);
  assert.deepEqual(boxOf(view.result), boxOf(sim), "same-seed live finishAuto matches simulateGame box");
  assert.deepEqual(view.result.box, sim.box, "finishAuto box matches simulateGame");
  assert.deepEqual(view.result.plays, sim.plays, "finishAuto plays match simulateGame");
}

{
  const st = newGame({ seed: 48 });
  untilKickoff(st);
  const g = userGame(st)!;
  const live = createLiveGame(st, g.id);
  const snaps: SnapCall[] = ["run", "pass", "auto", "pass", "run"];
  let view = live.peek();
  const opening = view.done ? null : view.plays[0];
  for (const c of snaps) {
    if (view.done) break;
    view = live.call(c);
  }
  if (!view.done) view = live.finishAuto();
  assert.equal(view.done, true);
  if (!view.done) throw new Error("expected a finished live game");
  assert.equal(view.plays[0], opening, "called snaps resumed the same live sim");
  const sim = simWithInactives(st, view.calls);
  assert.deepEqual(
    boxOf(view.result),
    boxOf(sim),
    "same-seed live calls + finishAuto match simulateGame box",
  );
  assert.deepEqual(view.result.box, sim.box, "partial calls + finishAuto box matches simulateGame");
  assert.deepEqual(view.result.plays, sim.plays, "partial calls + finishAuto plays match simulateGame");
}

{
  const st = newGame({ seed: 49 });
  untilKickoff(st);
  const g = userGame(st)!;
  const beforeInj = st.players.map((p) => p.injuryWeeks);
  const live = createLiveGame(st, g.id);
  live.peek();
  live.call("run");
  live.finishAuto();
  assert.deepEqual(
    st.players.map((p) => p.injuryWeeks),
    beforeInj,
    "live session does not write the save",
  );
}

{
  const st = newGame({ seed: 50 });
  untilKickoff(st);
  const copy = cloneState(st);
  const g = userGame(copy)!;
  declareGamedayInactives(copy, [g.homeId, g.awayId]);
  // simulateGame is one .next() on the non-live generator; it throws if that yields.
  const result = simulateGame(copy, g, new Rng(copy.rngState));
  assert.ok(result.plays.length > 20, "non-interactive / bulk path completes in one next() — no yield");
}

{
  const st = newGame({ seed: 51 });
  untilKickoff(st);
  const copy = cloneState(st);
  const g = userGame(copy)!;
  declareGamedayInactives(copy, [g.homeId, g.awayId]);
  const gen = openGameSim(copy, g, new Rng(copy.rngState));
  const step = gen.next();
  assert.equal(step.done, false, "live path yields at the first user snap");
  if (step.done) throw new Error("expected a live yield");
  assert.ok(step.value.info.down >= 1 && step.value.info.down <= 4);
  assert.ok(step.value.plays.length >= 1, "live yield includes the engine playLog");
}

{
  const st = newGame({ seed: 52 });
  untilKickoff(st);
  const g = userGame(st)!;
  const rngBefore = st.rngState;
  const injuries = st.players.map((p) => p.injuryWeeks);
  const live = createLiveGame(st, g.id);
  const opened = live.peek();
  assert.equal(opened.done, false);
  if (opened.done) throw new Error("expected a live snap");
  const opening = opened.plays[0];
  assert.equal(opening.kind, "kickoff");
  assert.equal(opening.result, "touchback");
  let mid = live.call("run");
  assert.equal(mid.done, false, "one called snap does not finish the game");
  if (mid.done) throw new Error("expected to still be live after Run");
  mid = live.call("pass");
  assert.deepEqual(live.snaps(), ["run", "pass"]);
  const midPlays = mid.plays.map((p) => ({ ...p }));
  const midLast = mid.lastSnap ? { ...mid.lastSnap } : mid.lastSnap;
  const midInfo = mid.done ? null : { ...mid.info };
  setCallSheet(st, { snaps: live.snaps() });
  assert.equal(st.rngState, rngBefore, "persisting snaps does not move the save RNG");
  assert.deepEqual(st.players.map((p) => p.injuryWeeks), injuries, "persisting snaps does not write injuries");

  const saved = JSON.parse(JSON.stringify(st)) as typeof st;
  const resumed = resumeLiveGame(saved, g.id);
  const again = resumed.peek();
  assert.deepEqual(resumed.snaps(), live.snaps(), "reload restores the called snaps");
  assert.deepEqual(again.plays, midPlays, "reload restores the same play log");
  assert.equal(again.plays[0].kind, "kickoff");
  assert.equal(again.plays[0].result, "touchback", "row 1 is still the kickoff touchback");
  assert.notEqual(again.plays[0], opening, "reload is a new session, not a second kickoff on the old log");
  assert.deepEqual(again.lastSnap, midLast, "reload restores the last called snap");
  assert.equal(again.lastSnap && again.lastSnap.kind, "pass", "last snap is still the called pass");
  if (midInfo && !again.done) {
    assert.deepEqual(again.info, midInfo, "reload restores the same clock and spot");
  }
  assert.equal(saved.rngState, rngBefore, "resume does not draw on the save RNG");

  if (!mid.done && !again.done) {
    const cont = live.call("auto");
    const cont2 = resumed.call("auto");
    assert.deepEqual(cont2.plays, cont.plays, "resumed generator continues from the restored snap");
  }

  const decoded = decodeSave(encodeSave(saved));
  const fromDisk = resumeLiveGame(decoded, g.id);
  assert.deepEqual(fromDisk.peek().plays, midPlays, "codec round-trip keeps the in-progress snaps");
  assert.deepEqual(fromDisk.snaps(), ["run", "pass"]);
  assert.equal(decoded.rngState, rngBefore);

  const old = cloneState(st);
  delete old.teams[old.userTeamId].callSheet;
  const fresh = resumeLiveGame(old, g.id);
  const kick = fresh.peek();
  assert.deepEqual(fresh.snaps(), [], "old save with no call sheet starts uncalled");
  assert.equal(kick.done, false);
  if (!kick.done) {
    assert.equal(kick.lastSnap, null);
    assert.equal(kick.plays[0].kind, "kickoff");
    assert.equal(kick.plays[0].result, "touchback");
    assert.deepEqual(kick.info, opened.info, "old save opens on the same kickoff state");
  }
  assert.equal(old.rngState, rngBefore);
}

{
  const st = newGame({ seed: 53 });
  untilKickoff(st);
  const g = userGame(st)!;
  const rngBefore = st.rngState;
  const injuries = st.players.map((p) => p.injuryWeeks);
  const live = createLiveGame(st, g.id);
  const hand: SnapCall[] = ["run", "pass", "run"];
  let mid = live.peek();
  for (const c of hand) {
    assert.equal(mid.done, false, "hand calls stay inside the game");
    mid = live.call(c);
  }
  const handSnaps = live.snaps().slice();
  assert.deepEqual(handSnaps, hand);
  const finished = live.finishAuto();
  assert.equal(finished.done, true);
  if (!finished.done) throw new Error("expected coach finish to reach the whistle");
  const stored = live.snaps();
  assert.ok(stored.length > handSnaps.length, "coach finish records the auto tail");
  assert.deepEqual(stored.slice(0, handSnaps.length), handSnaps, "hand calls stay at the front");
  assert.ok(stored.slice(handSnaps.length).every((c) => c === "auto"), "the tail is auto");
  assert.deepEqual(finished.calls, stored, "the finished view carries the same list");
  const userSnaps = finished.plays.filter(
    (p) =>
      p.offenseId === st.userTeamId &&
      (p.kind === "run" || p.kind === "pass" || p.kind === "sack"),
  ).length;
  assert.equal(stored.length, userSnaps, "one recorded call per user offensive snap");
  assert.ok(finished.lastSnap, "coach finish still has a last snap");

  setCallSheet(st, { snaps: stored });
  assert.equal(st.rngState, rngBefore, "persisting the coach finish does not move the save RNG");
  assert.deepEqual(
    st.players.map((p) => p.injuryWeeks),
    injuries,
    "persisting the coach finish does not write injuries",
  );

  const saved = JSON.parse(JSON.stringify(st)) as typeof st;
  const resumed = resumeLiveGame(saved, g.id);
  const again = resumed.peek();
  assert.equal(again.done, true, "reload after coach finish stays at the final whistle");
  if (!again.done) throw new Error("expected the resumed game to be finished");
  assert.deepEqual(again.plays, finished.plays, "reload keeps the coach-finished play log");
  assert.deepEqual(again.result.box, finished.result.box, "reload keeps the coach-finished box");
  assert.deepEqual(again.lastSnap, finished.lastSnap, "reload keeps the coach-finished last snap");
  assert.deepEqual(resumed.snaps(), stored, "reload restores the coach-finished snap list");
  assert.equal(saved.rngState, rngBefore, "resume does not draw on the save RNG");

  const handOnly = cloneState(saved);
  setCallSheet(handOnly, { snaps: handSnaps });
  const rewound = resumeLiveGame(handOnly, g.id);
  assert.equal(rewound.peek().done, false, "a hand-only sheet still stops at the last hand call");
  assert.deepEqual(rewound.snaps(), handSnaps);

  const replay = cloneState(saved);
  const rg = userGame(replay)!;
  declareGamedayInactives(replay, [rg.homeId, rg.awayId]);
  const week = simulateGame(replay, rg, new Rng(replay.rngState), userSimOpts(replay, rg));
  assert.deepEqual(week.box, finished.result.box, "same-rng replay matches the coach-finished box");
  assert.deepEqual(week.plays, finished.plays, "same-rng replay matches the coach-finished log");

  const decoded = decodeSave(encodeSave(saved));
  const fromDisk = resumeLiveGame(decoded, g.id);
  const disk = fromDisk.peek();
  assert.equal(disk.done, true, "codec round-trip keeps the coach-finished game");
  assert.deepEqual(disk.plays, finished.plays, "codec round-trip keeps the coach-finished play log");
  assert.deepEqual(fromDisk.snaps(), stored);
  assert.equal(decoded.rngState, rngBefore);
}

console.log("ok    liveGame — resume mid-game; same-seed box and plays match simulateGame");

{
  const st = newGame({ seed: 90 });
  untilKickoff(st);
  const g = userGame(st)!;
  const rngBefore = st.rngState;
  const injuriesBefore = st.players.map((p) => [p.id, p.injuryWeeks, p.injuryDesc] as const);
  const live = createLiveGame(st, g.id);
  const hand: SnapCall[] = ["run", "pass", "run"];
  let mid = live.peek();
  for (const c of hand) {
    assert.equal(mid.done, false);
    mid = live.call(c);
  }
  assert.equal(live.seal(), null, "an unfinished game does not seal");
  const finished = live.finishAuto();
  if (!finished.done) throw new Error("expected coach finish to reach the whistle");
  const sealed = live.seal();
  if (!sealed) throw new Error("expected a seal at the whistle");
  assert.equal(sealed.gameId, g.id);
  assert.equal(sealed.homeScore, finished.result.homeScore);
  assert.equal(sealed.awayScore, finished.result.awayScore);
  assert.deepEqual(wire(sealed.box), wire(finished.result.box));
  assert.ok(sealed.box.plays && sealed.box.plays.length > 0, "the seal carries the play log");
  writeSealedLive(st, sealed);
  setCallSheet(st, { snaps: live.snaps() });
  assert.equal(st.rngState, rngBefore, "sealing does not draw on the save RNG");
  assert.deepEqual(
    st.players.map((p) => [p.id, p.injuryWeeks, p.injuryDesc] as const),
    injuriesBefore,
    "sealing does not write injuries until the week is committed",
  );
  assert.deepEqual(st.sealedLive?.homeScore, finished.result.homeScore);
  assert.deepEqual(st.sealedLive?.box, wire(finished.result.box));

  const isHome = g.homeId === st.userTeamId;
  const us = isHome ? finished.result.homeScore : finished.result.awayScore;
  const them = isHome ? finished.result.awayScore : finished.result.homeScore;

  const unbound = cloneState(st);
  delete unbound.sealedLive;
  advance(unbound);
  const wrong = unbound.games.find((x) => x.id === g.id)!;
  assert.equal(wrong.played, true);
  assert.notDeepEqual(
    [wrong.homeScore, wrong.awayScore],
    [finished.result.homeScore, finished.result.awayScore],
    "the week engine's shared rng does not reproduce the live score",
  );

  const quiet = cloneState(st);
  delete quiet.sealedLive;
  delete quiet.teams[quiet.userTeamId].callSheet;
  const quiet2 = cloneState(quiet);
  advance(quiet);
  advance(quiet2);
  const q1 = quiet.games.find((x) => x.id === g.id)!;
  const q2 = quiet2.games.find((x) => x.id === g.id)!;
  assert.equal(q1.played, true);
  assert.deepEqual(q1.boxScore, q2.boxScore, "Hub sim without a live game stays on the shared-rng path");
  assert.equal(quiet.rngState, quiet2.rngState);
  assert.equal(quiet.sealedLive, undefined);

  const partial = cloneState(st);
  delete partial.sealedLive;
  setCallSheet(partial, { snaps: hand });
  advance(partial);
  const part = partial.games.find((x) => x.id === g.id)!;
  assert.equal(part.played, true);
  assert.notDeepEqual(part.boxScore, finished.result.box, "a hand-only sheet still finishes on the week sim");

  const bound = cloneState(st);
  const fromDisk = decodeSave(JSON.parse(JSON.stringify(encodeSave(bound))));
  assert.equal(fromDisk.sealedLive?.gameId, g.id);
  assert.deepEqual(fromDisk.sealedLive?.box, wire(finished.result.box), "codec keeps the sealed box");
  advance(bound);
  advance(fromDisk);
  const official = bound.games.find((x) => x.id === g.id)!;
  const diskGame = fromDisk.games.find((x) => x.id === g.id)!;
  assert.equal(official.played, true);
  assert.equal(official.homeScore, finished.result.homeScore);
  assert.equal(official.awayScore, finished.result.awayScore);
  assert.deepEqual(official.boxScore, wire(finished.result.box), "Play Week commits the live box");
  assert.deepEqual(diskGame.boxScore, official.boxScore, "a reloaded seal commits the same box");
  assert.equal(bound.rngState, fromDisk.rngState, "committing a seal is deterministic");
  assert.equal(bound.sealedLive, undefined, "the seal is consumed");
  assert.equal(bound.teams[bound.userTeamId].callSheet, undefined, "the call sheet still clears");
  assert.ok(
    bound.log.some((l) => l.kind === "result" && l.text.includes(`${us}-${them}`)),
    "the week log records the live score",
  );
  for (const row of sealed.injuries) {
    const p = bound.players.find((x) => x.id === row.playerId);
    assert.ok(p, "injured player still exists");
    const left = Math.max(0, row.injuryWeeks - 1);
    assert.equal(p!.injuryWeeks, left, "the live injury is charged for the week that was played");
    if (left > 0) assert.equal(p!.injuryDesc, row.injuryDesc);
    else assert.equal(p!.injuryDesc, null);
  }
  for (const line of sealed.log) {
    assert.ok(bound.log.some((l) => l.kind === line.kind && l.text === line.text), "live injury news is kept");
  }
}

console.log("ok    liveGame — a finished /play game is the official week result");
