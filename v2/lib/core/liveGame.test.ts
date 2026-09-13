/**
 * Regression: /play advances the running sim (Wave 3.7 Packet 3c).
 *
 * call() / finishAuto() must resume mid-game — no kickoff re-sim.
 * Same-seed live advance must match simulateGame's box.
 *
 * Run: npx tsx lib/core/liveGame.test.ts
 */
import assert from "node:assert/strict";
import { newGame } from "./newGame";
import { Rng } from "./rng";
import { simulateGame } from "./sim/game";
import { startRegularSeason, advance } from "./season/engine";
import { declareGamedayInactives } from "./inactives";
import { createLiveGame } from "./liveGame";
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

console.log("ok    liveGame — resume mid-game; same-seed box matches simulateGame");
