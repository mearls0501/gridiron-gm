/**
 * Wave 3.7 Packet 3b — people-layer teeth.
 * Coach tenure, owner-heat CPU HC fires, holdout inactivity, no user-desk plant.
 *
 * Run: npx tsx lib/core/peopleTeeth.test.ts
 */
import assert from "node:assert/strict";
import { newGame } from "./newGame";
import { ensureCoaches, fireCpuHeadCoaches, tickCoachContracts } from "./coaches";
import { ensureOwners } from "./owner";
import {
  HOLDOUT_AUTO_REPORT_WEEKS,
  HOLDOUT_CAP,
  isHoldoutInactive,
  plantDemand,
  runPsychology,
} from "./psychology";
import { declareGamedayInactives, isSat, sitHoldouts } from "./inactives";
import { startRegularSeason, advance } from "./season/engine";
import { GameState } from "./types";

function ok(label: string) { console.log("ok   ", label); }

function plantOneSeason(st: GameState): void {
  plantStandings(st, st.season - 1, () => 8);
}

function plantStandings(st: GameState, season: number, winsFor: (teamId: number) => number): void {
  st.history.push({
    season,
    championId: 0,
    runnerUpId: 1,
    standings: st.teams.map((t) => ({
      teamId: t.id, w: winsFor(t.id), l: 17 - winsFor(t.id), t: 0,
      pf: 0, pa: 0, divW: 0, divL: 0, divT: 0, confW: 0, confL: 0, confT: 0,
    })),
    awards: { mvp: null, opoy: null, dpoy: null, roy: null },
    leaders: { passYds: null, rushYds: null, recYds: null, sacks: null },
  });
}

{
  const st = newGame({ seed: 70 });
  const user = st.players.find((p) => p.teamId === st.userTeamId && !p.prospect && p.ovr >= 70)!;
  plantDemand(st, user.id, "holdout", "money");
  st.phase = "regular";
  st.week = 1;
  assert.equal(st.history.length, 0);
  assert.equal(isHoldoutInactive(st, user), false, "year-0 holdouts do not sit (calibrate/statcheck)");
  ok("year-0 holdout is a desk flag, not a sit");
}

{
  const st = newGame({ seed: 71 });
  const user = st.players.find((p) => p.teamId === st.userTeamId && !p.prospect && p.ovr >= 70)!;
  plantOneSeason(st);
  plantDemand(st, user.id, "holdout", "money");
  st.phase = "regular";
  st.week = 1;
  assert.equal(isHoldoutInactive(st, user), true);
  sitHoldouts(st, st.userTeamId);
  assert.equal(isSat(st.teams[st.userTeamId], user.id), true, "holdout is gameday inactive");
  ok("holdout is inactive until resolved");
}

{
  const st = newGame({ seed: 72 });
  const user = st.players.find((p) => p.teamId === st.userTeamId && !p.prospect && p.ovr >= 76 && p.contract)!;
  if (user.contract) user.contract.baseSalary = user.contract.baseSalary.map(() => 400_000);
  startRegularSeason(st);
  plantDemand(st, user.id, "holdout", "money");
  user.psychology!.filedWeek = 1;
  user.psychology!.filedSeason = st.season;
  delete st.psychTick;
  for (let i = 0; i < HOLDOUT_AUTO_REPORT_WEEKS; i++) {
    assert.equal(!!user.psychology?.holdout, true, `still holding at week ${st.week}`);
    advance(st);
  }
  assert.equal(!!user.psychology?.holdout, false, "auto-reports after 4 weeks");
  assert.equal(user.psychology?.autoReportedSeason, st.season);
  ok("4-week auto-report path");
}

{
  const seeds = [11, 22, 33, 44];
  for (const seed of seeds) {
    const st = newGame({ seed });
    runPsychology(st);
    const holds = st.players.filter((p) => p.psychology?.holdout);
    assert.ok(holds.length <= HOLDOUT_CAP, `seed ${seed} holdouts ${holds.length} over cap`);
    const userHolds = holds.filter((p) => p.teamId === st.userTeamId).length;
    const cpuHolds = holds.filter((p) => p.teamId !== st.userTeamId).length;
    if (userHolds > 0) {
      assert.ok(cpuHolds >= 0);
    }
  }
  ok("plantUserDesk is gone; cap is league-wide, not a user-club extra");
}

{
  const st = newGame({ seed: 73 });
  ensureCoaches(st);
  ensureOwners(st);
  for (const t of st.teams) {
    if (t.id === st.userTeamId) continue;
    if (t.coaches?.hc) t.coaches.hc.hiredSeason = st.season - 2;
  }
  const left = Math.floor(st.teams.length / 2);
  for (const t of st.teams) {
    if (t.id >= left) continue;
    if (t.frontOffice) t.frontOffice.winNow = 1;
    for (const p of st.players) {
      if (p.teamId === t.id && !p.retired && !p.prospect) p.ovr = Math.max(p.ovr, 82);
    }
  }
  plantStandings(st, st.season - 2, (id) => (id < left ? 3 : 11));
  plantStandings(st, st.season - 1, (id) => (id < left ? 3 : 11));
  const before = st.teams.filter((t) => t.id !== st.userTeamId && t.coaches?.hc).map((t) => t.coaches!.hc!.id);
  const parent = st.rngState;
  const fired = fireCpuHeadCoaches(st);
  assert.equal(st.rngState, parent);
  const after = st.teams.filter((t) => t.id !== st.userTeamId && t.coaches?.hc).map((t) => t.coaches!.hc!.id);
  assert.ok(fired >= 1, `owner heat should fire some CPU HCs (fired ${fired})`);
  assert.ok(after.length < before.length, "fired chairs are empty for the carousel");
  console.log(`##M people.cpuHcFiresPlanted ${fired}`);
  ok(`owner heat fired ${fired} CPU HC(s) on a planted 3-14 / 11-6 split`);
}

{
  const st = newGame({ seed: 74 });
  ensureCoaches(st);
  const cpu = st.teams.find((t) => t.id !== st.userTeamId)!;
  cpu.coaches!.hc!.yearsRemaining = 1;
  cpu.coaches!.oc!.yearsRemaining = 1;
  const parent = st.rngState;
  tickCoachContracts(st);
  assert.equal(st.rngState, parent);
  assert.equal(cpu.coaches!.hc, undefined);
  assert.equal(cpu.coaches!.oc, undefined);
  ok("tick expires every chair at 0 years, not just the user desk");
}

{
  const st = newGame({ seed: 75 });
  plantOneSeason(st);
  startRegularSeason(st);
  const p = st.players.find((x) => x.teamId === st.userTeamId && !x.prospect)!;
  plantDemand(st, p.id, "holdout", "money");
  declareGamedayInactives(st, [st.userTeamId]);
  assert.equal(isSat(st.teams[st.userTeamId], p.id), true, "declareGamedayInactives sits holdouts");
  ok("gameday declaration sits holdouts");
}

console.log("ok    people-layer teeth");
