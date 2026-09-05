/**
 * Regression: play-by-play / drive log / live peek.
 *
 * Phase 1 viewer. Emit hooks must not move outcomes or the parent RNG.
 * Peek must not re-sim. Old boxes without a play log still load.
 *
 * Run: npx tsx lib/view/playByPlay.test.ts
 */
import assert from "node:assert/strict";
import { newGame } from "../core/newGame";
import { Rng } from "../core/rng";
import { simulateGame } from "../core/sim/game";
import { buildDrives, lastCalledSnap } from "../core/sim/events";
import { createLiveGame } from "../core/liveGame";
import { setCallSheet, userSimOpts, boxAttempts } from "../core/callSheet";
import { startRegularSeason, advance } from "../core/season/engine";
import { DriveSummary, PlayEvent } from "../core/types";
import { encodeSave, decodeSave } from "../store/codec";
import { drivePlays, formatPlay, spotLabel } from "./playByPlay";

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

function names(): (id: number) => string {
  return () => "Smith";
}

{
  assert.equal(spotLabel(25), "own 25");
  assert.equal(spotLabel(50), "50");
  assert.equal(spotLabel(75), "opp 25");
  const run: PlayEvent = {
    q: 1, clock: 800, down: 1, toGo: 10, yardLine: 25,
    offenseId: 1, kind: "run", result: "gain", yards: 4,
    playerId: 9, homeScore: 0, awayScore: 0,
  };
  assert.equal(formatPlay(run, names()), "Smith run for 4 yards");
  const inc: PlayEvent = {
    ...run, kind: "pass", result: "incomplete", yards: 0, targetId: 10,
  };
  assert.match(formatPlay(inc, names()), /incomplete/);
}

{
  const empty = buildDrives([]);
  assert.deepEqual(empty, []);
  const planted: DriveSummary = {
    n: 1, offenseId: 1, q: 1, clock: 900, startYl: 25, endYl: 40,
    plays: 3, yards: 15, result: "punt", from: 0, to: 0,
  };
  assert.deepEqual(drivePlays([], planted), []);
}

{
  const a = newGame({ seed: 42 });
  untilKickoff(a);
  const g = userGame(a)!;
  const b = cloneState(a);
  const r1 = simulateGame(a, g, new Rng(a.rngState));
  const r2 = simulateGame(b, b.games.find((x) => x.id === g.id)!, new Rng(b.rngState));

  assert.equal(r1.homeScore, r2.homeScore, "home score identical");
  assert.equal(r1.awayScore, r2.awayScore, "away score identical");
  assert.equal(r1.box.home.totalYards, r2.box.home.totalYards);
  assert.equal(r1.box.away.totalYards, r2.box.away.totalYards);
  assert.equal(r1.box.home.plays, r2.box.home.plays);
  assert.deepEqual(r1.plays, r2.plays, "play log byte-identical");
  assert.ok(r1.plays.length > 20, `expected a real play log, got ${r1.plays.length}`);
  assert.ok(r1.box.plays && r1.box.plays.length === r1.plays.length, "user game stores the play log");
  assert.ok(r1.box.drives && r1.box.drives.length >= 8, "drive log present");
  assert.equal(r1.plays.filter((p) => p.kind === "run" || p.kind === "pass" || p.kind === "sack").length > 10, true);

  const tdDrives = (r1.box.drives ?? []).filter((d) => d.result === "touchdown").length;
  const offTd = r1.box.scoringPlays.filter((s) => /yd TD/.test(s.desc) && !/return TD/.test(s.desc)).length;
  assert.ok(tdDrives <= r1.box.scoringPlays.length, "drive TDs cannot exceed scoring plays");
  void offTd;
}

{
  const st = newGame({ seed: 43 });
  untilKickoff(st);
  const cpu = st.games.find(
    (g) =>
      g.week === st.week &&
      !g.played &&
      g.homeId !== st.userTeamId &&
      g.awayId !== st.userTeamId
  );
  assert.ok(cpu);
  const r = simulateGame(st, cpu, new Rng(st.rngState));
  assert.ok(r.plays.length > 20);
  assert.equal(r.box.plays, undefined, "CPU game does not persist the snap log");
  assert.ok(r.box.drives && r.box.drives.length >= 6, "CPU game still gets a drive chart");
}

{
  const st = newGame({ seed: 44 });
  untilKickoff(st);
  const g = userGame(st)!;
  const live = createLiveGame(st, g.id);
  const p1 = live.peek();
  const p2 = live.peek();
  assert.equal(p1, p2, "peek returns the cached view — no re-sim");
  assert.equal(p1.done, false);
  if (!p1.done) {
    assert.ok(p1.info.down >= 1);
    assert.ok(p1.plays.length >= 1, "opening kickoff is already on the log");
  }

  const beforeInj = st.players.map((p) => p.injuryWeeks);
  let view = live.call("run");
  assert.ok(view.lastSnap, "first called snap has a result");
  assert.equal(view.lastSnap!.kind === "run" || view.lastSnap!.kind === "pass" || view.lastSnap!.kind === "sack", true);
  const afterCall = live.peek();
  assert.equal(afterCall, view, "peek after call stays cached");
  assert.deepEqual(afterCall.lastSnap, view.lastSnap);

  let n = 0;
  while (!view.done && n++ < 6) view = live.call("pass");
  if (!view.done) view = live.finishAuto();
  assert.equal(view.done, true);
  if (view.done) {
    assert.ok(view.plays.length > 20);
    assert.ok(view.drives.length >= 8);
    const replay = cloneState(st);
    setCallSheet(replay, { snaps: view.calls });
    const fromSim = simulateGame(
      replay,
      replay.games.find((x) => x.id === g.id)!,
      new Rng(replay.rngState),
      userSimOpts(replay, replay.games.find((x) => x.id === g.id)!),
    );
    assert.equal(view.result.homeScore, fromSim.homeScore, "live finish matches sheet replay");
    assert.equal(view.result.awayScore, fromSim.awayScore);
    assert.deepEqual(
      boxAttempts(view.result.box, st.userTeamId),
      boxAttempts(fromSim.box, st.userTeamId),
    );
    const tagged = lastCalledSnap(view.plays, st.userTeamId, view.calls.length);
    assert.ok(tagged);
  }
  assert.deepEqual(
    st.players.map((p) => p.injuryWeeks),
    beforeInj,
    "live session does not write the save",
  );
}

{
  const st = newGame({ seed: 45 });
  untilKickoff(st);
  const g = userGame(st)!;
  const r = simulateGame(st, g, new Rng(st.rngState));
  g.played = true;
  g.homeScore = r.homeScore;
  g.awayScore = r.awayScore;
  g.boxScore = r.box;
  const roundTrip = decodeSave(encodeSave(st));
  const boxed = roundTrip.games.find((x) => x.id === g.id)!;
  assert.ok(boxed.boxScore?.plays && boxed.boxScore.plays.length === r.plays.length, "codec keeps the play log");
  assert.ok(boxed.boxScore?.drives && boxed.boxScore.drives.length === r.box.drives?.length);

  const old = cloneState(st);
  const og = old.games.find((x) => x.id === g.id)!;
  if (og.boxScore) {
    delete og.boxScore.plays;
    delete og.boxScore.drives;
  }
  const loaded = decodeSave(encodeSave(old));
  const bare = loaded.games.find((x) => x.id === g.id)!;
  assert.equal(bare.boxScore?.plays, undefined, "old box without plays still loads");
  assert.equal(bare.boxScore?.home.totalYards, r.box.home.totalYards);
  assert.deepEqual(buildDrives(bare.boxScore?.plays ?? []), []);
}

console.log("ok    playByPlay — capture / drives / live peek; outcomes unchanged");
