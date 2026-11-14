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
import { declareGamedayInactives } from "../core/inactives";
import { startRegularSeason, advance } from "../core/season/engine";
import { DriveSummary, PlayEvent } from "../core/types";
import { encodeSave, decodeSave } from "../store/codec";
import {
  drivePlays, formatPlay, formatVisiblePlay, penaltyTeamId, playedResultLine,
  spotLabel, visiblePlays, wentToOvertime,
} from "./playByPlay";

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

  const sides = {
    homeId: 1,
    awayId: 2,
    abbr: (id: number) => (id === 1 ? "HOM" : "AWY"),
  };
  const offPen: PlayEvent = {
    ...run, kind: "penalty", result: "accepted", yards: -5, offenseId: 1,
  };
  assert.equal(penaltyTeamId(offPen, sides), 1);
  assert.equal(formatPlay(offPen, names(), sides), "Penalty — HOM, 5 yards");
  const defPen: PlayEvent = { ...offPen, yards: 15 };
  assert.equal(penaltyTeamId(defPen, sides), 2);
  assert.equal(formatPlay(defPen, names(), sides), "Penalty — AWY, 15 yards");
  assert.equal(formatPlay(offPen, names()), "Penalty — 5 yards");

  const fourth: PlayEvent = { ...run, down: 4, yards: 2 };
  const downs: PlayEvent = { ...run, kind: "downs", result: "downs", yards: 0, down: 4 };
  const raw = [fourth, downs];
  const folded = visiblePlays(raw);
  assert.equal(folded.length, 1);
  assert.equal(folded[0].event, fourth);
  assert.equal(folded[0].turnoverOnDowns, true);
  assert.equal(raw.length, 2, "folding the row does not rewrite the stored log");
  assert.equal(raw[1].kind, "downs");
  assert.equal(formatVisiblePlay(folded[0], names()), "Smith run for 2 yards — Turnover on downs");
  const orphan = visiblePlays([downs]);
  assert.equal(orphan.length, 1);
  assert.equal(formatVisiblePlay(orphan[0], names()), "Turnover on downs");
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
    const replayGame = replay.games.find((x) => x.id === g.id)!;
    // Live sits the gameday list on its kickoff clone. The replay has to sit
    // the same list or a week with inactives cannot match.
    declareGamedayInactives(replay, [replayGame.homeId, replayGame.awayId]);
    setCallSheet(replay, { snaps: view.calls });
    const fromSim = simulateGame(
      replay,
      replayGame,
      new Rng(replay.rngState),
      userSimOpts(replay, replayGame),
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

assert.equal(
  playedResultLine({
    homeAbbr: "NYS",
    awayAbbr: "SD",
    homeScore: 29,
    awayScore: 32,
    userIsHome: true,
    ot: true,
  }),
  "SD 32, NYS 29 · Loss (OT)",
);
assert.equal(
  wentToOvertime({ quarters: { home: [7, 7, 7, 8, 0], away: [7, 7, 7, 7, 4] } }),
  true,
);
assert.equal(
  wentToOvertime({ quarters: { home: [7, 7, 7, 3, 0], away: [0, 7, 0, 7, 0] } }),
  false,
);
console.log("ok    playByPlay — SD 32, NYS 29 · Loss (OT)");

// Phase 1 leftover B, P2 (`docs/proposal-phase1-play-leftovers-2026-11-11.md`).
// A defensive return TD's snap row comes before the PAT and kickoff, names
// the returner, and carries the score the return made. Kickoff rows name the
// kicker. No field changes a draw.
{
  const st = newGame({ seed: 12345 });
  const rng = new Rng(999);
  let defTd = 0;
  let returned = 0;
  let kicks = 0;
  let kicked = 0;
  for (let i = 0; i < 120; i++) {
    const g = {
      id: 9000 + i, season: st.season, week: 1, homeId: i % 32, awayId: (i * 7 + 3) % 32,
      played: false, homeScore: 0, awayScore: 0, playoffRound: null, boxScore: null,
    } as unknown as Parameters<typeof simulateGame>[1];
    if (g.homeId === g.awayId) continue;
    for (const p of st.players) { p.injuryWeeks = 0; p.injuryDesc = null; }
    const r = simulateGame(st, g, rng);
    for (const line of r.box.players) defTd += line.defTd;
    for (let j = 0; j < r.plays.length; j++) {
      const e = r.plays[j];
      if (e.kind === "kickoff") {
        kicks++;
        if (e.kickerId !== undefined) kicked++;
      }
      if (e.returnerId === undefined) continue;
      returned++;
      assert.ok(e.result === "int" || e.result === "fumble", "a returner rides an int or fumble row");
      const prev = r.plays[j - 1];
      const next = r.plays[j + 1];
      assert.ok(next && (next.kind === "xp" || next.kind === "two"), "the PAT follows the return");
      assert.notEqual(next.offenseId, e.offenseId, "the defence kicks the PAT");
      const delta = (e.homeScore + e.awayScore) - (prev.homeScore + prev.awayScore);
      assert.equal(delta, 6, "the snap row carries the six the return made");
    }
  }
  assert.ok(defTd > 0, "the sample has defensive touchdowns");
  assert.equal(returned, defTd, "every defensive TD names its returner on the snap row");
  assert.equal(kicked, kicks, "every kickoff row names the kicker");

  const names = (id: number) => (id === 1 ? "Brady" : id === 2 ? "Smith" : id === 3 ? "Tucker" : "");
  const base = {
    q: 2, clock: 300, down: 2, toGo: 7, yardLine: 40, offenseId: 0, yards: 0, homeScore: 7, awayScore: 6,
  };
  assert.equal(
    formatPlay({ ...base, kind: "pass", result: "int", playerId: 1, returnerId: 2 } as PlayEvent, names),
    "Brady pass intercepted — Smith returns it for a TD",
  );
  assert.equal(
    formatPlay({ ...base, kind: "run", result: "fumble", playerId: 1, returnerId: 2 } as PlayEvent, names),
    "Brady run, fumble — Smith returns it for a TD",
  );
  assert.equal(
    formatPlay({ ...base, kind: "kickoff", result: "touchback", kickerId: 3 } as PlayEvent, names),
    "Kickoff — touchback",
    "the kicker is not in the touchback text",
  );
  console.log("ok    playByPlay — P2 returner and kicker fields; the defensive TD row precedes its PAT");
}

// Phase 1 leftover E3, P5. A CPU box keeps its snap log for the latest week
// only. The engine still returns it unpersisted; the week engine attaches it.
{
  const st = newGame({ seed: 46 });
  startRegularSeason(st);
  advance(st);
  const w1 = st.week - 1;
  const cpuOf = (week: number) =>
    st.games.filter(
      (g) => g.week === week && g.played && g.playoffRound === null
        && g.homeId !== st.userTeamId && g.awayId !== st.userTeamId,
    );
  assert.ok(cpuOf(w1).length > 0);
  assert.ok(cpuOf(w1).every((g) => (g.boxScore?.plays?.length ?? 0) > 20), "the latest week's CPU boxes keep their log");
  advance(st);
  const w2 = st.week - 1;
  assert.notEqual(w2, w1);
  assert.ok(cpuOf(w1).every((g) => g.boxScore?.plays === undefined), "an earlier week's CPU logs are dropped");
  assert.ok(cpuOf(w1).every((g) => (g.boxScore?.drives?.length ?? 0) > 0), "the drive chart stays");
  assert.ok(cpuOf(w2).every((g) => (g.boxScore?.plays?.length ?? 0) > 20));
  const user = st.games.filter(
    (g) => g.played && (g.homeId === st.userTeamId || g.awayId === st.userTeamId),
  );
  assert.ok(user.every((g) => (g.boxScore?.plays?.length ?? 0) > 0), "user boxes keep their log");
  const back = decodeSave(encodeSave(st));
  const bg = back.games.find((g) => g.id === cpuOf(w2)[0].id)!;
  const wireOf = (v: unknown) => JSON.parse(JSON.stringify(v));
  assert.deepEqual(wireOf(bg.boxScore?.plays), wireOf(cpuOf(w2)[0].boxScore!.plays), "codec round-trip keeps a CPU log");
  console.log("ok    playByPlay — P5 CPU snap logs live one week");
}
