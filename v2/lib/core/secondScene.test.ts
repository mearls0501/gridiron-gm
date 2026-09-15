/**
 * Wave 3.9 Packet 5 — the second scene (Darnold path).
 *
 * Six gates, one child-stream draw, ceiling never past pot, once per career.
 * Year 0 cannot qualify. Dials SIGNED 2026-09-14.
 *
 * Run: npx tsx lib/core/secondScene.test.ts
 */
import assert from "node:assert/strict";
import { newGame } from "./newGame";
import { runProgression } from "./offseason/progression";
import { Rng } from "./rng";
import { blankSeasonLine } from "./season/stats";
import { decodeSave, encodeSave } from "../store/codec";
import {
  BUST_GAP,
  OPPORTUNITY_SNAPS,
  SCENE_COACH_DELTA,
  SCENE_FIT_DELTA,
  SECOND_SCENE_DRAW_SD,
  SECOND_SCENE_K,
  SECOND_SCENE_K_OTHER,
  applySecondScenes,
  maybeApplySecondScene,
} from "./secondScene";
import { CoachPerson, GameState, Player, Team } from "./types";

function ok(label: string) { console.log("ok   ", label); }

function setOcDev(team: Team, development: number): void {
  const oc: CoachPerson = {
    id: 9000 + team.id,
    name: "Test OC",
    role: "oc",
    teamId: team.id,
    offense: 50,
    defense: 50,
    development,
    aggression: 50,
    passBias: 0,
    shadowTendency: 0.42,
    scheme: team.offScheme ?? "westcoast",
    years: 4,
    yearsRemaining: 3,
    salary: 3_000_000,
    hiredSeason: 2026,
  };
  team.coaches = { ...(team.coaches ?? {}), oc };
}

function passingLine(
  season: number,
  teamId: number,
  opts: { starts: number; snaps: number; att: number; cmp: number; yds: number; td: number; ints: number },
) {
  const line = blankSeasonLine(season, teamId);
  line.games = Math.max(opts.starts, 1);
  line.gamesStarted = opts.starts;
  line.snaps = opts.snaps;
  line.passAtt = opts.att;
  line.passCmp = opts.cmp;
  line.passYds = opts.yds;
  line.passTd = opts.td;
  line.passInt = opts.ints;
  return line;
}

function otherStarter(p: Player, season: number, teamId: number): void {
  p.stats = p.stats.filter((s) => s.season !== season);
  p.stats.push(passingLine(season, teamId, {
    starts: 9, snaps: 700, att: 500, cmp: 340, yds: 3800, td: 28, ints: 8,
  }));
}

function plantBustQb(st: GameState, opts?: {
  sameClub?: boolean;
  snaps?: number;
  age?: number;
}): Player {
  const qbs = st.players.filter((p) => p.pos === "QB" && !p.retired && !p.prospect && p.teamId !== null);
  assert.ok(qbs.length >= 3, "need three quarterbacks");
  const qb = qbs[0];
  const oldTeamId = qb.teamId!;
  const newTeamId = opts?.sameClub
    ? oldTeamId
    : (st.teams.find((t) => t.id !== oldTeamId)!.id);

  qb.age = opts?.age ?? 25;
  qb.peakAge = 27;
  qb.pot = 88;
  qb.ceiling = 76;
  qb.retired = false;
  qb.prospect = false;
  delete qb.secondScene;

  const peers = qbs.filter((p) => p.id !== qb.id).slice(0, 2);
  otherStarter(peers[0], 2025, peers[0].teamId ?? 0);
  otherStarter(peers[1], 2025, peers[1].teamId ?? 1);

  qb.stats = qb.stats.filter((s) => s.season !== 2025 && s.season !== st.season);
  qb.stats.push(passingLine(2025, oldTeamId, {
    starts: 9, snaps: 700, att: 500, cmp: 240, yds: 2400, td: 8, ints: 22,
  }));
  const snaps = opts?.snaps ?? 520;
  qb.stats.push(passingLine(st.season, newTeamId, {
    starts: 14, snaps, att: 400, cmp: 240, yds: 2800, td: 16, ints: 12,
  }));

  qb.teamId = newTeamId;
  const oldT = st.teams[oldTeamId];
  const newT = st.teams[newTeamId];
  setOcDev(oldT, 40);
  setOcDev(newT, 40 + SCENE_COACH_DELTA);
  newT.depthChart.QB = [qb.id, ...newT.depthChart.QB.filter((id) => id !== qb.id)];
  return qb;
}

assert.equal(BUST_GAP, 6);
assert.equal(SCENE_FIT_DELTA, 0.25);
assert.equal(SCENE_COACH_DELTA, 15);
assert.equal(OPPORTUNITY_SNAPS, 500);
assert.equal(SECOND_SCENE_K.QB, 0.45);
assert.equal(SECOND_SCENE_K.TE, 0.35);
assert.equal(SECOND_SCENE_K_OTHER, 0.20);
assert.equal(SECOND_SCENE_DRAW_SD, 0.25);
ok("signed dials 1–8 as recommended 2026-09-14");

{
  const st = newGame({ seed: 41 });
  const parent = st.rngState;
  const qb = plantBustQb(st);
  const gap = qb.pot - qb.ceiling;
  const fired = maybeApplySecondScene(st, qb);
  assert.equal(st.rngState, parent, "child stream must not move the parent");
  assert.equal(fired, true);
  assert.ok(qb.secondScene, "flag is set");
  assert.ok(qb.secondScene!.lift > 0 && qb.secondScene!.lift <= gap, `lift ${qb.secondScene!.lift} not in (0, gap]`);
  assert.ok(qb.ceiling <= qb.pot, "ceiling never past pot");
  assert.equal(qb.ceiling, 76 + qb.secondScene!.lift);
  assert.equal(qb.secondScene!.season, st.season);
  assert.equal(qb.secondScene!.teamId, qb.teamId);
  assert.ok(
    st.log.some((e) => e.kind === "milestone" && e.text.includes("has found something")),
    "milestone line",
  );
  ok(`planted QB lift ${qb.secondScene!.lift.toFixed(2)} in (0, ${gap}]`);
}

{
  const st = newGame({ seed: 41 });
  const qb = plantBustQb(st, { sameClub: true });
  const ceiling = qb.ceiling;
  assert.equal(maybeApplySecondScene(st, qb), false);
  assert.equal(qb.secondScene, undefined);
  assert.equal(qb.ceiling, ceiling);
  ok("re-signed with the same club → no lift");
}

{
  const st = newGame({ seed: 41 });
  const qb = plantBustQb(st, { snaps: 300 });
  const ceiling = qb.ceiling;
  assert.equal(maybeApplySecondScene(st, qb), false);
  assert.equal(qb.secondScene, undefined);
  assert.equal(qb.ceiling, ceiling);
  ok("new club, better OC, 300 snaps → no lift");
}

{
  const st = newGame({ seed: 41 });
  const qb = plantBustQb(st);
  assert.equal(maybeApplySecondScene(st, qb), true);
  const first = { ...qb.secondScene! };
  const ceiling = qb.ceiling;
  const other = st.teams.find((t) => t.id !== qb.teamId && t.id !== first.teamId)!;
  qb.teamId = other.id;
  other.depthChart.QB = [qb.id, ...other.depthChart.QB.filter((id) => id !== qb.id)];
  setOcDev(other, 90);
  qb.stats.push(passingLine(st.season + 1, other.id, {
    starts: 16, snaps: 600, att: 400, cmp: 250, yds: 3000, td: 18, ints: 10,
  }));
  st.season += 1;
  qb.age = 26;
  assert.equal(maybeApplySecondScene(st, qb), false);
  assert.deepEqual(qb.secondScene, first);
  assert.equal(qb.ceiling, ceiling);
  ok("second qualifying scene later in the career → no second lift");
}

{
  const st = newGame({ seed: 12 });
  const before = st.players.map((p) => p.ceiling);
  const parent = st.rngState;
  applySecondScenes(st);
  assert.equal(st.rngState, parent);
  assert.ok(st.players.every((p) => !p.secondScene), "year-0 nobody qualifies");
  assert.deepEqual(st.players.map((p) => p.ceiling), before, "year-0 ceilings identical");
  ok("year-0 league: nobody qualifies; ceilings identical");
}

{
  const st = newGame({ seed: 12 });
  const rng = new Rng(st.rngState);
  runProgression(st, rng);
  assert.ok(st.players.every((p) => !p.secondScene), "year-0 progression does not fire");
  ok("year-0 runProgression: nobody qualifies");
}

{
  const a = newGame({ seed: 41 });
  const b = newGame({ seed: 41 });
  const qa = plantBustQb(a);
  const qb = plantBustQb(b);
  maybeApplySecondScene(a, qa);
  maybeApplySecondScene(b, qb);
  assert.ok(qa.secondScene && qb.secondScene);
  assert.equal(qa.secondScene.lift, qb.secondScene.lift);
  const c = newGame({ seed: 42 });
  const qc = plantBustQb(c);
  maybeApplySecondScene(c, qc);
  assert.ok(qc.secondScene);
  assert.notEqual(qc.secondScene.lift, qa.secondScene.lift);
  ok("same seed → same lifts; other seed differs");
}

{
  const st = newGame({ seed: 41 });
  const qb = plantBustQb(st);
  maybeApplySecondScene(st, qb);
  const round = decodeSave(encodeSave(st));
  const back = round.players.find((p) => p.id === qb.id)!;
  assert.ok(back.secondScene);
  assert.equal(back.secondScene!.season, qb.secondScene!.season);
  assert.equal(back.secondScene!.teamId, qb.secondScene!.teamId);
  assert.equal(back.secondScene!.lift, qb.secondScene!.lift);

  const stripped = newGame({ seed: 8 });
  for (const p of stripped.players) delete p.secondScene;
  const loaded = decodeSave(encodeSave(stripped));
  assert.ok(loaded.players.every((p) => !p.secondScene), "old save without the field loads");
  ok("codec keeps secondScene; missing stays missing");
}

{
  const st = newGame({ seed: 41 });
  const qb = plantBustQb(st);
  const parent = st.rngState;
  const rng = new Rng(parent);
  runProgression(st, rng);
  assert.ok(qb.secondScene, "runProgression applies the scene before developPlayer");
  assert.equal(qb.age, 26, "age still increments after the draw");
  ok("runProgression hook fires the planted scene then develops");
}

console.log("ok    secondScene — qualify / lift / once / year-0");
