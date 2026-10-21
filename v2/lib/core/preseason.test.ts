/**
 * Preseason games in camp, packet A (docs/preseason-games-design-2026-10-20.md).
 *
 * Three weeks before the cut: separate storage, child RNG streams only, the
 * engine's own injury rates, starters mostly sitting, no overtime, and no
 * effect on who is cut (the camp nudge is packet B).
 *
 * Fixtures only: a fresh league placed in camp. Run: npx tsx lib/core/preseason.test.ts
 */
import assert from "node:assert/strict";
import { newGame } from "./newGame";
import { advanceOffseason } from "./offseason";
import { startRegularSeason } from "./season/engine";
import { playPreseasonWeek, preseasonWeeksLeft, setUserPreseasonPlan } from "./preseason";
import { GameState, PRESEASON_WEEKS } from "./types";
import { simulateGame } from "./sim/game";
import { Rng } from "./rng";

function ok(label: string) { console.log("ok   ", label); }

function inCamp(seed = 42): GameState {
  const st = newGame({ seed });
  st.phase = "offseason-final";
  st.week = 0;
  st.games = [];
  return st;
}

const strip = (st: GameState) => JSON.stringify({ ...st, preseason: undefined, log: undefined, players: undefined });

// (1) Three weeks, every club once a week, outside state.games; parent stream untouched.
{
  const st = inCamp();
  const rng0 = st.rngState;
  const stats0 = JSON.stringify(st.players.map((p) => p.stats));
  const games0 = JSON.stringify(st.games);
  assert.equal(preseasonWeeksLeft(st), PRESEASON_WEEKS);
  for (let w = 1; w <= PRESEASON_WEEKS; w++) {
    const msg = advanceOffseason(st);
    assert.match(msg, new RegExp(`Preseason week ${w}`));
    assert.equal(st.phase, "offseason-final", "still in camp until the cut");
  }
  const ps = st.preseason!;
  assert.equal(ps.season, st.season + 1, "games belong to the league year about to start");
  assert.equal(ps.week, PRESEASON_WEEKS);
  assert.equal(ps.games.length, PRESEASON_WEEKS * (st.teams.length / 2));
  for (let w = 1; w <= PRESEASON_WEEKS; w++) {
    const ids = ps.games.filter((g) => g.week === w).flatMap((g) => [g.homeId, g.awayId]);
    assert.equal(new Set(ids).size, st.teams.length, `week ${w}: every club once`);
  }
  assert.equal(st.rngState, rng0, "parent rngState never moves");
  assert.equal(JSON.stringify(st.games), games0, "nothing enters state.games");
  assert.equal(JSON.stringify(st.players.map((p) => p.stats)), stats0, "no season stat line changes");
  assert.equal(preseasonWeeksLeft(st), 0);
  assert.ok(Object.keys(ps.camp).length > st.teams.length * 30, "camp lines for most of each roster");
}
ok("three preseason weeks, outside state.games, parent stream untouched");

// (2) Deterministic: the same league plays the same preseason.
{
  const a = inCamp(11);
  const b = inCamp(11);
  for (let w = 0; w < PRESEASON_WEEKS; w++) { playPreseasonWeek(a); playPreseasonWeek(b); }
  assert.deepEqual(a.preseason, b.preseason);
  assert.equal(JSON.stringify(a.players.map((p) => [p.injuryWeeks, p.injuryDesc])),
    JSON.stringify(b.players.map((p) => [p.injuryWeeks, p.injuryDesc])));
}
ok("preseason is deterministic per league");

// (3) Starters mostly sit; the second and third units carry the snaps.
{
  const st = inCamp(42);
  setUserPreseasonPlan(st, "sit");
  const qb1 = st.teams.map((t) => t.depthChart.QB[0]);
  playPreseasonWeek(st);
  const camp = st.preseason!.camp;
  const userQb1 = qb1[st.userTeamId];
  assert.equal(camp[userQb1]?.snaps ?? 0, 0, "the user's QB1 sits on the sit plan");
  let starterSnaps = 0;
  let teamSnaps = 0;
  for (const t of st.teams) {
    if (t.id === st.userTeamId) continue;
    const q1 = camp[t.depthChart.QB[0]]?.snaps ?? 0;
    const qbs = st.players.filter((p) => p.teamId === t.id && p.pos === "QB")
      .reduce((n, p) => n + (camp[p.id]?.snaps ?? 0), 0);
    starterSnaps += q1;
    teamSnaps += qbs;
  }
  assert.ok(teamSnaps > 0);
  assert.ok(starterSnaps / teamSnaps < 0.25, `CPU QB1s take a small share on one series (${(starterSnaps / teamSnaps).toFixed(2)})`);
  const backups = st.players.filter((p) => p.teamId !== null && (camp[p.id]?.snaps ?? 0) > 0).length;
  assert.ok(backups > st.teams.length * 30, "most of each camp roster plays");
}
ok("starters mostly sit; depth carries the snaps");

// (4) Injuries are real, carry to the cut, and a week passes after each preseason week.
{
  const st = inCamp(42);
  const before = new Map(st.players.map((p) => [p.id, p.injuryWeeks]));
  playPreseasonWeek(st);
  const hurt = st.players.filter((p) => p.injuryWeeks > 0 && (before.get(p.id) ?? 0) === 0);
  assert.ok(hurt.length > 0, "48 games produce at least one injury");
  const longest = hurt.sort((a, b) => b.injuryWeeks - a.injuryWeeks)[0];
  const w1 = longest.injuryWeeks;
  playPreseasonWeek(st);
  playPreseasonWeek(st);
  assert.equal(longest.injuryWeeks, Math.max(0, w1 - 2), "two more preseason weeks heal two weeks");
  const stillOut = st.players.filter((p) => p.injuryWeeks > 0).map((p) => p.id);
  advanceOffseason(st); // the cut
  assert.equal(st.phase, "preseason");
  for (const id of stillOut) {
    const p = st.players.find((x) => x.id === id)!;
    assert.ok(p.injuryWeeks > 0, "an injury still open at the cut is still open after it");
  }
}
ok("preseason injuries carry to the cut");

// (5) The cut and the calendar: offseason still ends in phase preseason; one advance reaches regular; camp data wiped at kickoff.
{
  const st = inCamp(99);
  for (let w = 0; w < PRESEASON_WEEKS; w++) advanceOffseason(st);
  assert.ok(st.preseason);
  advanceOffseason(st);
  assert.equal(st.phase, "preseason");
  assert.ok(st.preseason, "results stay readable until kickoff");
  startRegularSeason(st);
  assert.equal(st.phase, "regular");
  assert.equal(st.preseason, undefined, "wiped when the season starts");
}
ok("cut after week 3; wiped at kickoff");

// (6) No camp nudge in packet A: the cut is the same whether or not preseason was played,
// apart from what injuries changed.
{
  const a = inCamp(7);
  const b = inCamp(7);
  for (let w = 0; w < PRESEASON_WEEKS; w++) playPreseasonWeek(a);
  // Undo preseason injuries on `a` so only the games themselves differ.
  for (const p of a.players) {
    const q = b.players.find((x) => x.id === p.id)!;
    p.injuryWeeks = q.injuryWeeks;
    p.injuryDesc = q.injuryDesc;
  }
  advanceOffseason(a);
  advanceOffseason(b);
  // b is still in camp after one advance (it plays preseason week 1); bring it to the cut too.
  for (let w = 1; w < PRESEASON_WEEKS; w++) advanceOffseason(b);
  advanceOffseason(b);
  const roster = (st: GameState) => st.players.filter((p) => p.teamId !== null).map((p) => `${p.id}:${p.teamId}:${p.status ?? ""}`).sort().join(",");
  assert.equal(roster(a), roster(b), "same 53s when injuries match: games do not steer the cut");
  void strip;
}
ok("packet A does not steer the cut");

// (7) No overtime: an exhibition never scores in a fifth period; a regular game still can.
{
  const st = inCamp(5);
  let fifth = 0;
  let ties = 0;
  for (let i = 0; i < 120; i++) {
    const home = i % st.teams.length;
    const away = (i * 7 + 3) % st.teams.length === home ? (home + 1) % st.teams.length : (i * 7 + 3) % st.teams.length;
    const game = {
      id: -1, season: st.season + 1, week: 0, homeId: home, awayId: away, played: false,
      homeScore: 0, awayScore: 0, playoffRound: null, boxScore: null,
    };
    const res = simulateGame(st, game, new Rng(1000 + i), {
      exhibition: { plans: { [home]: "series", [away]: "series" } },
    });
    if ((res.box.quarters.home[4] ?? 0) + (res.box.quarters.away[4] ?? 0) > 0) fifth++;
    if (res.homeScore === res.awayScore) ties++;
  }
  assert.equal(fifth, 0, "no preseason game scores in overtime");
  assert.ok(ties > 0, `ties stand (${ties} of 120)`);
}
ok("preseason games end after four quarters; ties stand");

console.log("preseason: all passed");
