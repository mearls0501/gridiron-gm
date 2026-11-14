/**
 * User FA Auto-fix holds the draft and camp bill, and a user signing whose
 * actual cap hit does not fit is refused. CPU `bestAffordable` and the
 * #213 user rewrite ban are unchanged.
 *
 * Run: npx tsx lib/core/userFaReserve.test.ts
 */
import assert from "node:assert/strict";
import { newGame } from "./newGame";
import { Rng } from "./rng";
import { makeContract } from "./generate";
import { advance } from "./season/engine";
import { advanceOffseason, isOffseason } from "./offseason";
import { previewDraftPicks, rookieContract } from "./offseason/draft";
import { reconcileRoster, userFaCampHold } from "./offseason/contracts";
import {
  capHit, rosterCount, rosterIssues, teamCap,
} from "./select";
import { hubAdvanceBlock } from "../view/seasonStartGate";
import {
  CAMP_ROSTER_LIMIT, LEAGUE_MINIMUM, ROSTER_LIMIT, type GameState, type Player,
} from "./types";

function ok(label: string) { console.log("ok   ", label); }

function active(st: GameState, teamId: number): Player[] {
  return st.players.filter(
    (p) => p.teamId === teamId && !p.retired && !p.prospect && p.status !== "ir" && p.status !== "ps",
  );
}

function openHoles(st: GameState, teamId: number, n: number): number {
  const victims = active(st, teamId).slice().sort((a, b) => a.ovr - b.ovr || a.id - b.id).slice(0, n);
  for (const p of victims) {
    p.teamId = null;
    p.contract = null;
  }
  return victims.length;
}

function setSpace(st: GameState, teamId: number, target: number): void {
  const info = teamCap(st, teamId);
  st.teams[teamId].deadCap = Math.max(0, (st.teams[teamId].deadCap ?? 0) + (info.space - target));
}

function pricedHold(st: GameState, teamId: number): number {
  const picks = previewDraftPicks(st, st.season).filter((p) => p.teamId === teamId);
  const rng = new Rng(1);
  let rookieHits = 0;
  for (const pick of picks) rookieHits += capHit(rookieContract(st, pick.round, rng, pick.pick));
  const minHit = capHit(makeContract(new Rng(1), LEAGUE_MINIMUM, 1, st.season, 0));
  const street = Math.max(0, CAMP_ROSTER_LIMIT - ROSTER_LIMIT - picks.length);
  return rookieHits + street * minHit;
}

function reachFa(st: GameState): void {
  let g = 0;
  while (!isOffseason(st.phase) && g++ < 40) advance(st);
  let o = 0;
  while (st.phase !== "offseason-fa" && o++ < 6) advanceOffseason(st);
  assert.equal(st.phase, "offseason-fa");
}

const minHit = capHit(makeContract(new Rng(1), LEAGUE_MINIMUM, 1, 2026, 0));
assert.equal(minHit, 795_000, "a one-year minimum is all base: no bonus stacked on the floor");
ok("actual one-year minimum cap hit is 795000");

{
  const st = newGame({ seed: 42, startSeason: 2026 });
  const id = st.userTeamId;
  const owners = JSON.stringify(st.pickOwners);
  const rngAt = st.rngState;
  assert.equal(userFaCampHold(st, id), 0, "preseason does not reserve the camp bill");
  st.phase = "offseason-fa";
  const cpu = st.teams.find((t) => t.id !== id)!;
  assert.equal(userFaCampHold(st, cpu.id), 0, "CPU club is not reserved");
  const hold = userFaCampHold(st, id);
  assert.equal(hold, pricedHold(st, id));
  assert.ok(hold > 30 * minHit, `hold ${hold} should cover 30 camp street bodies plus rookies`);
  assert.equal(JSON.stringify(st.pickOwners), owners, "pricing picks writes nothing");
  assert.equal(st.rngState, rngAt, "pricing picks does not draw");
  ok(`user FA hold is ${hold}`);
}

{
  const st = newGame({ seed: 42, startSeason: 2026 });
  st.phase = "offseason-fa";
  const id = st.userTeamId;
  assert.equal(openHoles(st, id, 1), 1);
  setSpace(st, id, 88_000);
  const before = teamCap(st, id).space;
  const ids = active(st, id).map((p) => p.id).sort((a, b) => a - b);
  const bodies = st.players.length;
  const rng = new Rng(st.rngState);
  const rngAt = rng.state;
  reconcileRoster(st, id, rng);
  assert.equal(rng.state, rngAt);
  assert.equal(st.players.length, bodies);
  assert.deepEqual(active(st, id).map((p) => p.id).sort((a, b) => a - b), ids);
  assert.equal(teamCap(st, id).space, before);
  assert.equal(before, 88_000);
  ok("one hole and $88,000: no signing, no draw, space unchanged");
}

{
  const st = newGame({ seed: 42, startSeason: 2026 });
  st.phase = "offseason-fa";
  const id = st.userTeamId;
  assert.equal(openHoles(st, id, 21), 21);
  setSpace(st, id, 3_530_000);
  const before = teamCap(st, id).space;
  const bodies = st.players.length;
  const rng = new Rng(st.rngState);
  const rngAt = rng.state;
  reconcileRoster(st, id, rng);
  assert.equal(rng.state, rngAt);
  assert.equal(st.players.length, bodies);
  assert.equal(rosterCount(st, id), 32);
  assert.equal(teamCap(st, id).space, before);
  assert.equal(before, 3_530_000);
  ok("21 holes and $3.53M: Auto-fix does not create the 2052 hole");
}

{
  const st = newGame({ seed: 42, startSeason: 2026 });
  st.phase = "offseason-fa";
  const id = st.userTeamId;
  const holes = openHoles(st, id, 5);
  assert.equal(holes, 5);
  setSpace(st, id, -1_000_000);
  const before = teamCap(st, id).space;
  assert.ok(before < 0);
  const bodies = st.players.length;
  const rng = new Rng(st.rngState);
  const rngAt = rng.state;
  reconcileRoster(st, id, rng);
  assert.equal(rng.state, rngAt);
  assert.equal(st.players.length, bodies);
  assert.equal(rosterCount(st, id), ROSTER_LIMIT - 5);
  assert.equal(teamCap(st, id).space, before);
  ok("negative room: minimum hit is refused, book unchanged");
}

{
  const st = newGame({ seed: 42, startSeason: 2026 });
  st.phase = "offseason-fa";
  const id = st.userTeamId;
  const cpu = st.teams.find((t) => t.id !== id)!;
  const user = st;
  const cpuSt = JSON.parse(JSON.stringify(st)) as GameState;
  openHoles(user, id, 18);
  openHoles(cpuSt, cpu.id, 18);
  const hold = userFaCampHold(user, id);
  reconcileRoster(user, id, new Rng(user.rngState));
  reconcileRoster(cpuSt, cpu.id, new Rng(cpuSt.rngState));
  const userSpace = teamCap(user, id).space;
  const cpuSpace = teamCap(cpuSt, cpu.id).space;
  assert.ok(userSpace >= hold, `user space ${userSpace} fell through hold ${hold}`);
  assert.ok(cpuSpace < 2_000_000, `CPU space ${cpuSpace} kept a user-sized reserve`);
  assert.ok(userSpace > cpuSpace);
  assert.equal(rosterCount(cpuSt, cpu.id), ROSTER_LIMIT);
  ok(`18 holes: user kept ${userSpace} (hold ${hold}); CPU spent to ${cpuSpace}`);
}

{
  const st = newGame({ seed: 42, startSeason: 2026 });
  st.phase = "offseason-final";
  const id = st.userTeamId;
  setSpace(st, id, 88_000);
  const before = teamCap(st, id).space;
  const deals = new Map(
    st.players.filter((p) => p.teamId === id && p.contract).map((p) => [p.id, JSON.stringify(p.contract)]),
  );
  const rng = new Rng(st.rngState);
  const rngAt = rng.state;
  reconcileRoster(st, id, rng);
  assert.equal(rng.state, rngAt);
  assert.equal(rosterCount(st, id), ROSTER_LIMIT);
  assert.equal(teamCap(st, id).space, before);
  for (const [pid, raw] of deals) {
    const p = st.players.find((x) => x.id === pid)!;
    assert.equal(JSON.stringify(p.contract), raw);
  }
  ok("camp Auto-fix at 53 with $88,000 does not sign the 37 street bodies");
}

{
  const st = newGame({ seed: 7, startSeason: 2026 });
  st.phase = "offseason-final";
  const id = st.userTeamId;
  const info = teamCap(st, id);
  st.teams[id].deadCap = (st.teams[id].deadCap ?? 0) + info.space + 5_000_000;
  assert.ok(teamCap(st, id).space < 0);
  const deals = new Map(
    st.players.filter((p) => p.teamId === id && p.contract).map((p) => [p.id, JSON.stringify(p.contract)]),
  );
  const space = teamCap(st, id).space;
  const abbr = st.teams[id].abbr;
  reconcileRoster(st, id, new Rng(st.rngState));
  assert.equal(teamCap(st, id).space, space);
  for (const [pid, raw] of deals) {
    const p = st.players.find((x) => x.id === pid)!;
    assert.equal(JSON.stringify(p.contract), raw, "user deal rewritten");
  }
  assert.ok(!st.log.some((e) => e.text.includes(`${abbr} restructured`) && e.text.includes("to the league minimum")));
  ok("over-cap user at camp: no minimum rewrite, space unchanged");
}

function throughCamp(st: GameState): void {
  advanceOffseason(st);
  assert.equal(st.phase, "offseason-draft");
  advanceOffseason(st);
  assert.equal(st.phase, "offseason-final");
}

for (const seed of [42, 7]) {
  const st = newGame({ seed, startSeason: 2026 });
  reachFa(st);
  const id = st.userTeamId;
  const hold = userFaCampHold(st, id);
  const rng = new Rng(st.rngState);
  const rngAt = rng.state;
  reconcileRoster(st, id, rng);
  st.rngState = rng.state;
  const afterFa = teamCap(st, id).space;
  assert.ok(afterFa >= hold, `seed ${seed} FA space ${afterFa} < hold ${hold}`);
  assert.equal(rng.state, rngAt, `seed ${seed} FA fill drew`);
  throughCamp(st);
  const afterCamp = teamCap(st, id).space;
  assert.ok(afterCamp >= 0, `seed ${seed} camp space ${afterCamp}`);
  assert.equal(hubAdvanceBlock(st.phase, rosterIssues(st, id)), null, `seed ${seed} gate`);
  const abbr = st.teams[id].abbr;
  assert.ok(!st.log.some((e) => e.text.includes(`${abbr} restructured`) && e.text.includes("to the league minimum")));
  ok(`seed ${seed} ${abbr}: FA ${afterFa} (hold ${hold}), camp ${afterCamp}, gate open`);
}
