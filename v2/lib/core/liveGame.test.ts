/**
 * Regression: /play advances the running sim (Wave 3.7 Packet 3c)
 * and reads the engine playLog from the live yield (Wave 3.8 Packet 2).
 *
 * call() / finishAuto() must resume mid-game — no kickoff re-sim.
 * Same-seed live advance must match simulateGame's box AND plays.
 * Bulk-sim / simulateGame drains in one next() — no live yield.
 *
 * Run: npx tsx lib/core/liveGame.test.ts
 */
import assert from "node:assert/strict";
import { newGame } from "./newGame";
import { Rng } from "./rng";
import { openGameSim, simulateGame } from "./sim/game";
import { startRegularSeason, advance } from "./season/engine";
import { declareGamedayInactives } from "./inactives";
import { setCallSheet } from "./callSheet";
import { createLiveGame, resumeLiveGame } from "./liveGame";
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

console.log("ok    liveGame — resume mid-game; same-seed box and plays match simulateGame");
