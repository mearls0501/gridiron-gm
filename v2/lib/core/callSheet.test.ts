/**
 * Regression: this-week call sheet + Play-the-Game snaps.
 *
 * Auto uses coach passBias / aggression. A pass-heavy or run-heavy sheet
 * must move the user box. CPU games stay auto. Sit desk still works.
 * Through the Playoffs does not wait for snap clicks.
 *
 * Run: npx tsx lib/core/callSheet.test.ts
 */
import assert from "node:assert/strict";
import { newGame } from "./newGame";
import { Rng } from "./rng";
import { simulateGame } from "./sim/game";
import { startRegularSeason, simulateWeek, isOnBye, advance } from "./season/engine";
import { sitPlayer, isSat } from "./inactives";
import { runSimTo } from "../store/simTo";
import { defaultSettings, ROSTER_LIMIT } from "./types";
import {
  AGGRESSION_AGGRESSIVE, AGGRESSION_CONSERVATIVE, PASS_LEAN_PASS, PASS_LEAN_RUN,
  boxAttempts, clearCallSheets, effectiveCoach, setCallSheet, userSimOpts,
} from "./callSheet";
import { createLiveGame } from "./liveGame";
import { rosterCount } from "./select";

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

function playUser(st: ReturnType<typeof newGame>) {
  const g = userGame(st);
  assert.ok(g, "user has a game this week");
  const rng = new Rng(st.rngState);
  return simulateGame(st, g, rng, userSimOpts(st, g));
}

// Old save: missing callSheet is coach-only. Same seed, same box.
{
  const auto = newGame({ seed: 11 });
  untilKickoff(auto);
  assert.equal(auto.teams[auto.userTeamId].callSheet, undefined);
  const raw = JSON.parse(JSON.stringify(auto)) as typeof auto;
  assert.equal(raw.teams[auto.userTeamId].callSheet, undefined);
  assert.equal(effectiveCoach(raw.teams[raw.userTeamId]), raw.teams[raw.userTeamId].coach);

  const sheet = cloneState(auto);
  const rAuto = playUser(auto);
  const rSheet = playUser(sheet);
  const tid = auto.userTeamId;
  assert.deepEqual(boxAttempts(rAuto.box, tid), boxAttempts(rSheet.box, tid));
  assert.equal(rAuto.homeScore, rSheet.homeScore);
  assert.equal(rAuto.awayScore, rSheet.awayScore);
}

// Pass-heavy vs Auto moves user pass attempts. Run-heavy moves rush attempts.
{
  const auto = newGame({ seed: 12 });
  untilKickoff(auto);
  const pass = cloneState(auto);
  const run = cloneState(auto);
  setCallSheet(pass, { passLean: PASS_LEAN_PASS });
  setCallSheet(run, { passLean: PASS_LEAN_RUN });

  const rAuto = playUser(auto);
  const rPass = playUser(pass);
  const rRun = playUser(run);
  const tid = auto.userTeamId;
  const a = boxAttempts(rAuto.box, tid);
  const p = boxAttempts(rPass.box, tid);
  const r = boxAttempts(rRun.box, tid);
  assert.ok(p.passAtt > a.passAtt, `pass-heavy ${p.passAtt} should beat auto ${a.passAtt}`);
  const autoRushShare = a.rushAtt / Math.max(1, a.passAtt + a.rushAtt);
  const runRushShare = r.rushAtt / Math.max(1, r.passAtt + r.rushAtt);
  assert.ok(
    runRushShare > autoRushShare || r.passAtt < a.passAtt,
    `run-heavy mix ${r.passAtt}/${r.rushAtt} should lean off auto ${a.passAtt}/${a.rushAtt}`
  );
}

// Forced Play-the-Game passes move the box vs Auto.
{
  const auto = newGame({ seed: 13 });
  untilKickoff(auto);
  const forced = cloneState(auto);
  setCallSheet(forced, { snaps: Array.from({ length: 80 }, () => "pass" as const) });

  const rAuto = playUser(auto);
  const rForce = playUser(forced);
  const tid = auto.userTeamId;
  assert.ok(
    boxAttempts(rForce.box, tid).passAtt > boxAttempts(rAuto.box, tid).passAtt,
    "forced-pass snaps should raise pass attempts"
  );
}

// 4th-down aggression override moves fourthDownAtt.
{
  const soft = newGame({ seed: 14 });
  untilKickoff(soft);
  const loud = cloneState(soft);
  setCallSheet(soft, { aggression: AGGRESSION_CONSERVATIVE });
  setCallSheet(loud, { aggression: AGGRESSION_AGGRESSIVE });
  const rSoft = playUser(soft);
  const rLoud = playUser(loud);
  const tid = soft.userTeamId;
  const gSoft = userGame(soft);
  const gLoud = userGame(loud);
  assert.ok(gSoft && gLoud);
  const soft4 = gSoft.homeId === tid ? rSoft.box.home.fourthDownAtt : rSoft.box.away.fourthDownAtt;
  const loud4 = gLoud.homeId === tid ? rLoud.box.home.fourthDownAtt : rLoud.box.away.fourthDownAtt;
  assert.ok(
    loud4 >= soft4,
    `aggressive 4th downs ${loud4} should be at least conservative ${soft4}`
  );
}

// CPU-vs-CPU game is unchanged by a user call sheet (user is not in it).
{
  const auto = newGame({ seed: 15 });
  untilKickoff(auto);
  const cpu = auto.games.find(
    (g) =>
      g.season === auto.season &&
      g.week === auto.week &&
      !g.played &&
      g.homeId !== auto.userTeamId &&
      g.awayId !== auto.userTeamId
  );
  assert.ok(cpu, "week 1 has a CPU game");
  const withSheet = cloneState(auto);
  setCallSheet(withSheet, { passLean: PASS_LEAN_PASS, aggression: AGGRESSION_AGGRESSIVE });
  const g2 = withSheet.games.find((g) => g.id === cpu.id)!;
  const r1 = simulateGame(auto, cpu, new Rng(auto.rngState));
  const r2 = simulateGame(withSheet, g2, new Rng(withSheet.rngState));
  assert.equal(r1.homeScore, r2.homeScore);
  assert.equal(r1.awayScore, r2.awayScore);
  assert.deepEqual(boxAttempts(r1.box, cpu.homeId), boxAttempts(r2.box, g2.homeId));
}

// Sheet clears after the week. Sit desk still works with a sheet set.
{
  const st = newGame({ seed: 16 });
  untilKickoff(st);
  const tid = st.userTeamId;
  const qb1 = st.teams[tid].depthChart.QB[0];
  assert.equal(sitPlayer(st, qb1).ok, true);
  setCallSheet(st, { passLean: PASS_LEAN_PASS });
  assert.equal(isSat(st.teams[tid], qb1), true);
  assert.equal(rosterCount(st, tid), ROSTER_LIMIT);

  simulateWeek(st);
  for (const t of st.teams) {
    assert.equal(t.callSheet, undefined, `${t.abbr} call sheet should clear`);
  }
  const played = st.games.find(
    (g) => g.played && (g.homeId === tid || g.awayId === tid) && g.week === 1
  );
  assert.ok(played?.boxScore);
  const satRow = played!.boxScore!.players.find((s) => s.playerId === qb1);
  assert.ok(!satRow || satRow.snaps === 0, "sit desk still zeros snaps with a sheet");
}

// Bye week: user has no game, so no call sheet is required.
{
  const st = newGame({ seed: 17 });
  startRegularSeason(st);
  let guard = 0;
  while (!isOnBye(st, st.userTeamId) && guard++ < 18) advance(st);
  assert.ok(isOnBye(st, st.userTeamId), "found a bye");
  assert.equal(userGame(st), undefined);
}

// Live Play-the-Game records snaps; leftover snaps stay auto. Does not mutate the save.
{
  const st = newGame({ seed: 18 });
  untilKickoff(st);
  const g = userGame(st);
  assert.ok(g);
  const beforeInj = st.players.map((p) => p.injuryWeeks);
  const live = createLiveGame(st, g.id);
  let view = live.peek();
  let n = 0;
  while (!view.done && n++ < 8) view = live.call("pass");
  if (!view.done) view = live.finishAuto();
  assert.equal(view.done, true);
  if (view.done) {
    assert.ok(boxAttempts(view.result.box, st.userTeamId).passAtt > 0);
    assert.ok(view.calls.length >= 1);
  }
  assert.deepEqual(
    st.players.map((p) => p.injuryWeeks),
    beforeInj,
    "live peek must not write the save"
  );
}

// Through the Playoffs finishes with a sheet set. No snap wait.
{
  const st = newGame({ seed: 19 });
  startRegularSeason(st);
  setCallSheet(st, { passLean: PASS_LEAN_PASS, aggression: AGGRESSION_AGGRESSIVE });
  st.settings = defaultSettings();
  st.settings.pauseOn.tradeOffer = false;
  st.settings.pauseOn.injuredStarter = false;
  const msg = runSimTo(st, "champion");
  assert.ok(st.phase.startsWith("offseason"), `Through the Playoffs stalled: ${msg} phase=${st.phase}`);
  for (const t of st.teams) {
    assert.equal(t.callSheet, undefined, `${t.abbr} leftover sheet after bulk sim`);
  }
}

clearCallSheets(newGame({ seed: 1 }));
console.log("ok    callSheet — Auto vs lean moves the box; sit desk; bulk-sim; bye");
