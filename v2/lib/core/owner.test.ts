/**
 * Two-season firing rule. Worked examples from the 2026-10-06 signed spec,
 * plus one-and-done and the expiring-contract clause.
 *
 * Run: npx tsx lib/core/owner.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { newGame } from "./newGame";
import { recordSeasonHistory } from "./offseason/progression";
import { blankRecord } from "./select";
import { COACH_CONTRACT, fireCpuHeadCoaches, tickCoachContracts } from "./coaches";
import {
  OWNER_MIN_SEASONS,
  OWNER_ONE_AND_DONE_WINS,
  OWNER_WIN_TARGET,
  acceptGmChair,
  applyUserGmFiring,
  ensureOwners,
  ownerBar,
  ownerJobView,
  ownerJudgment,
  retireFromLeague,
  stampSeasonExpectedWins,
  weightedWins,
} from "./owner";
import * as ownerApi from "./owner";
import { teamOutlook } from "./frontOffice";
import { GameState } from "./types";

function ok(label: string) { console.log("ok   ", label); }

function close(actual: number, expected: number, label: string) {
  assert.ok(
    Math.abs(actual - expected) < 1e-9,
    `${label}: ${actual} vs ${expected}`,
  );
}

{
  const st = newGame({ seed: 51 });
  const before = st.rngState;
  for (const t of st.teams) delete t.owner;
  assert.equal(st.teams[st.userTeamId].owner, undefined);
  ensureOwners(st);
  assert.equal(st.rngState, before, "owner child stream must not move the parent");
  for (const t of st.teams) {
    assert.ok(t.owner?.name, `${t.abbr} missing owner`);
    assert.ok(t.owner!.patience >= 0.35 && t.owner!.patience <= 0.80);
  }
  const a = newGame({ seed: 51 });
  const b = newGame({ seed: 52 });
  ensureOwners(a);
  ensureOwners(b);
  assert.equal(st.teams[0].owner!.name, a.teams[0].owner!.name);
  assert.notEqual(st.teams[0].owner!.name, b.teams[0].owner!.name);
  ok("ensure owners on child stream; same seed same names");
}

{
  assert.equal(OWNER_MIN_SEASONS, 2, "weighted rule starts at the second season");
  assert.equal(OWNER_ONE_AND_DONE_WINS, 4);
  assert.equal("ownerHeatFor" in ownerApi, false);
  assert.equal("fireHeatThreshold" in ownerApi, false);
  assert.equal("heatWatchLine" in ownerApi, false);

  close(ownerBar(10, 0.55, false), 8.5, "contend bar");
  close(ownerBar(8, 0.55, false), 7.5, "retool bar");
  close(ownerBar(6, 0.55, false), 7.0, "rebuild bar");
  close(ownerBar(10, 0.80, false), 7.5, "patient owner sits 1.0 lower");
  close(ownerBar(10, 0.35, false), 9.3, "impatient owner sits 0.8 higher");
  close(ownerBar(6, 0.55, true), 6.0, "rebuild runway is 1.0 off at the two-year review");
  close(weightedWins([5, 4]), 4.4, "retool 5, 4");
  close(weightedWins([9, 7]), 7.8, "9 then 7");
  close(weightedWins([11, 7]), 8.6, "contend 11, 7");
  close(weightedWins([4, 6]), 5.2, "rebuild 4, 6");
  close(weightedWins([5, 7]), 6.2, "rebuild 5, 7");
  close(weightedWins([3, 4, 12]), 8.8, "turnaround drops the 3");
  ok("bar, patience, and 60/40 weights");
}

type Seat = "safe" | "watched" | "hot" | "fired";

/** Worked examples at patience 0.55. Result "safe" on the turnaround is the keep. */
const WORKED: {
  label: string;
  wins: number[];
  expected: number[];
  weighted: number;
  bar: number;
  fire: boolean;
  seat: Seat;
  line: string;
}[] = [
  {
    label: "retool 5, 4",
    wins: [5, 4], expected: [8, 8],
    weighted: 4.4, bar: 7.5, fire: true, seat: "fired",
    line: "last two seasons",
  },
  {
    label: "retool 9, 7",
    wins: [9, 7], expected: [8, 8],
    weighted: 7.8, bar: 7.5, fire: false, seat: "hot",
    line: "last two seasons",
  },
  {
    label: "contend 11, 7",
    wins: [11, 7], expected: [10, 10],
    weighted: 8.6, bar: 8.5, fire: false, seat: "hot",
    line: "last two seasons",
  },
  {
    label: "contend 9, 7",
    wins: [9, 7], expected: [10, 10],
    weighted: 7.8, bar: 8.5, fire: true, seat: "fired",
    line: "last two seasons",
  },
  {
    label: "hired into a rebuild 4, 6",
    wins: [4, 6], expected: [6, 6],
    weighted: 5.2, bar: 6.0, fire: true, seat: "fired",
    line: "last two seasons",
  },
  {
    label: "hired into a rebuild 5, 7",
    wins: [5, 7], expected: [6, 6],
    weighted: 6.2, bar: 6.0, fire: false, seat: "hot",
    line: "last two seasons",
  },
  {
    label: "3 → 4 → 12 turnaround",
    wins: [3, 4, 12], expected: [10, 10, 10],
    weighted: 8.8, bar: 8.5, fire: false, seat: "hot",
    line: "last two seasons",
  },
];

{
  for (const row of WORKED) {
    const judged = ownerJudgment(0.55, row.wins, row.expected, true);
    close(judged.weightedWins, row.weighted, `${row.label} weighted`);
    close(judged.bar, row.bar, `${row.label} bar`);
    assert.equal(judged.wouldFire, row.fire, `${row.label} wouldFire`);
    assert.equal(judged.seat, row.seat, `${row.label} seat`);
    assert.ok(judged.bar <= 8.5, `${row.label} bar stays at or under the contend line`);
  }
  const turn = WORKED[WORKED.length - 1];
  assert.equal(turn.fire, false, "8.8 clears every typical bar");
  assert.ok(ownerBar(8, 0.55, false) <= 8.5);
  assert.ok(ownerBar(6, 0.55, false) <= 8.5);
  assert.ok(ownerBar(6, 0.55, true) <= 8.5);
  assert.ok(turn.weighted > ownerBar(10, 0.55, false));
  ok("worked examples: weighted, bar, seat, wouldFire");
}

function plantGradedYear(
  st: GameState,
  season: number,
  winsFor: (teamId: number) => number,
  expectedFor: (teamId: number) => number,
): void {
  st.history.push({
    season,
    championId: st.userTeamId === 0 ? 1 : 0,
    runnerUpId: st.userTeamId === 1 ? 2 : 1,
    standings: st.teams.map((t) => {
      const w = winsFor(t.id);
      const r = blankRecord(t.id);
      r.w = Math.floor(w);
      r.l = Math.max(0, 17 - Math.floor(w));
      r.t = w % 1 ? 1 : 0;
      if (r.t) r.l = Math.max(0, r.l - 1);
      r.expectedWins = expectedFor(t.id);
      return r;
    }),
    awards: { mvp: null, opoy: null, dpoy: null, roy: null },
    leaders: { passYds: null, rushYds: null, recYds: null, sacks: null },
  });
}

function viewOf(
  wins: number[],
  expected: number[],
  patience = 0.55,
): NonNullable<ReturnType<typeof ownerJobView>> {
  const st = newGame({ seed: 80 + wins.length + wins[0] });
  ensureOwners(st);
  st.settings = { ...(st.settings!), firingEnabled: true };
  const team = st.teams[st.userTeamId];
  team.owner!.patience = patience;
  const start = st.season - wins.length;
  team.gmHiredSeason = start;
  wins.forEach((w, i) => {
    plantGradedYear(
      st,
      start + i,
      (id) => (id === st.userTeamId ? w : 12),
      (id) => (id === st.userTeamId ? expected[i] : 10),
    );
  });
  return ownerJobView(st, st.userTeamId)!;
}

{
  for (const row of WORKED) {
    const job = viewOf(row.wins, row.expected);
    close(job.weightedWins, row.weighted, `${row.label} view weighted`);
    close(job.bar, row.bar, `${row.label} view bar`);
    close(job.margin, row.weighted - row.bar, `${row.label} margin`);
    assert.equal(job.wouldFire, row.fire, `${row.label} view wouldFire`);
    assert.equal(job.seat, row.seat, `${row.label} view seat`);
    assert.ok(job.line.includes(row.line), `${row.label} line counts the seasons: ${job.line}`);
    if (row.label.startsWith("hired into a rebuild")) {
      assert.ok(job.line.includes("rebuild"), job.line);
    }
  }
  ok("ownerJobView matches every worked-example row");
}

{
  const st = newGame({ seed: 53 });
  ensureOwners(st);
  st.teams[st.userTeamId].owner!.patience = 0.55;
  st.teams[st.userTeamId].gmHiredSeason = st.season - 2;
  plantGradedYear(st, st.season - 2, (id) => (id === st.userTeamId ? 5 : 12), () => 8);
  plantGradedYear(st, st.season - 1, (id) => (id === st.userTeamId ? 4 : 12), () => 8);

  st.settings = { ...(st.settings!), firingEnabled: false };
  const off = ownerJobView(st, st.userTeamId)!;
  assert.equal(off.firingEnabled, false);
  assert.equal(off.wouldFire, false, "firingEnabled off never fires");
  assert.ok(off.margin < 0, "the margin is still computed when firing is off");
  assert.equal(off.seat, "fired");

  st.settings.firingEnabled = true;
  const on = ownerJobView(st, st.userTeamId)!;
  assert.equal(on.wouldFire, true, "flag on and under the bar means the chair is lost");
  ok("firingEnabled is the bite; the margin is computed either way");
}

{
  const st = newGame({ seed: 54 });
  const raw = JSON.parse(JSON.stringify(st)) as GameState;
  for (const t of raw.teams) delete t.owner;
  ensureOwners(raw);
  assert.ok(raw.teams.every((t) => t.owner), "stripped save gets an owner");
  ok("old save without owner loads");
}

{
  const st = newGame({ seed: 55 });
  ensureOwners(st);
  st.settings = { ...(st.settings!), firingEnabled: true };
  st.teams[st.userTeamId].owner!.patience = 0.35;
  st.teams[st.userTeamId].gmHiredSeason = st.season - 2;
  plantGradedYear(st, st.season - 2, (id) => (id === st.userTeamId ? 3 : 12), () => 10);
  plantGradedYear(st, st.season - 1, (id) => (id === st.userTeamId ? 3 : 12), () => 10);
  const job = ownerJobView(st, st.userTeamId)!;
  assert.equal(job.wouldFire, true, "impatient contend 3-14 twice fires the user GM");
  const before = st.userTeamId;
  const move = applyUserGmFiring(st);
  assert.ok(move, "forced move is written");
  assert.equal(move!.fromTeamId, before);
  assert.ok(move!.openChairs.length > 0, "open chairs are offered");
  assert.equal(st.userTeamId, before, "taking a chair is the GM's choice");
  const chair = move!.openChairs[0];
  const r = acceptGmChair(st, chair);
  assert.equal(r.ok, true, r.reason ?? "accept");
  assert.equal(st.userTeamId, chair);
  assert.equal(st.forcedMove?.resolved, true);
  assert.equal(teamOutlook(st, chair).posture, "rebuild");
  ok("user-GM fire is a forced move; arrival is rebuild");
}

{
  const st = newGame({ seed: 56 });
  ensureOwners(st);
  st.settings = { ...(st.settings!), firingEnabled: true };
  st.teams[st.userTeamId].owner!.patience = 0.35;
  st.teams[st.userTeamId].gmHiredSeason = st.season - 2;
  plantGradedYear(st, st.season - 2, (id) => (id === st.userTeamId ? 3 : 12), () => 10);
  plantGradedYear(st, st.season - 1, (id) => (id === st.userTeamId ? 3 : 12), () => 10);
  applyUserGmFiring(st);
  const r = retireFromLeague(st);
  assert.equal(r.ok, true);
  assert.equal(st.forcedMove?.retired, true);
  ok("retire-save path is available");
}

{
  const st = newGame({ seed: 91 });
  const rng = st.rngState;
  for (const t of st.teams) {
    assert.ok(
      t.seasonExpectedWins === 6 || t.seasonExpectedWins === 8 || t.seasonExpectedWins === 10,
      `${t.abbr} preseason target ${t.seasonExpectedWins}`,
    );
  }
  stampSeasonExpectedWins(st);
  assert.equal(st.rngState, rng, "stamping the preseason target does not draw");
  const hist = recordSeasonHistory(st);
  for (const row of hist.standings) {
    assert.equal(row.expectedWins, st.teams[row.teamId].seasonExpectedWins);
  }
  ok("preseason outlook is locked onto the standings row");
}

{
  const recap = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "offseason/index.ts"),
    "utf8",
  );
  const fn = recap.slice(recap.indexOf("export function runRecap"));
  const fireAt = fn.indexOf("fireCpuHeadCoaches(state)");
  const tickAt = fn.indexOf("tickCoachContracts(state)");
  assert.ok(fireAt !== -1 && tickAt !== -1 && fireAt < tickAt, "fire before the contract tick");
  ok("runRecap decides the bar before contracts tick");
}

function cpuClub(st: GameState) {
  return st.teams.find((t) => t.id !== st.userTeamId)!;
}

function holdOtherContracts(st: GameState, keepId: number) {
  for (const t of st.teams) {
    if (!t.coaches?.hc) continue;
    if (t.id === keepId) continue;
    t.coaches.hc.yearsRemaining = 4;
  }
}

{
  const fired = viewOf([3], [8]);
  assert.equal(fired.wouldFire, true, "3-win first season fires");
  assert.equal(fired.seat, "fired");
  close(fired.bar, OWNER_ONE_AND_DONE_WINS, "typical one-and-done bar is 4");
  assert.ok(fired.line.includes("this season alone"), fired.line);

  const held = viewOf([5], [8]);
  assert.equal(held.wouldFire, false, "5-win first season is not fired");
  assert.equal(held.seat, "hot", "5 is one win above the one-and-done line");
  close(held.margin, 1, "5 − 4");

  const st = newGame({ seed: 101 });
  ensureOwners(st);
  st.settings = { ...(st.settings!), firingEnabled: true };
  const cpu = cpuClub(st);
  cpu.owner!.patience = 0.55;
  const hc = cpu.coaches!.hc!;
  hc.hiredSeason = st.season - 1;
  hc.yearsRemaining = 4;
  holdOtherContracts(st, cpu.id);
  plantGradedYear(st, st.season - 1, (id) => (id === cpu.id ? 3 : 14), () => 8);
  const id = hc.id;
  const parent = st.rngState;
  const n = fireCpuHeadCoaches(st);
  assert.equal(st.rngState, parent, "one-and-done does not draw");
  assert.equal(cpu.coaches?.hc, undefined, "3-win first season fires the CPU HC");
  assert.equal(n, 1);
  assert.equal(st.seasonCounters?.hcFires, 1);
  assert.equal(st.seasonCounters?.hcOneAndDone, 1);
  assert.equal(st.seasonCounters?.hcFiredLastSeasonWins, 3);
  assert.equal(st.coachMarket?.some((c) => c.id === id), true);

  const user = newGame({ seed: 102 });
  ensureOwners(user);
  user.settings = { ...(user.settings!), firingEnabled: true };
  user.teams[user.userTeamId].owner!.patience = 0.55;
  user.teams[user.userTeamId].gmHiredSeason = user.season - 1;
  plantGradedYear(user, user.season - 1, (id) => (id === user.userTeamId ? 3 : 14), () => 8);
  assert.equal(ownerJobView(user, user.userTeamId)!.wouldFire, true);
  assert.ok(applyUserGmFiring(user), "user GM uses the same one-and-done");
  ok("3-win first season fires; user GM uses the same rule");
}

{
  const st = newGame({ seed: 103 });
  ensureOwners(st);
  const cpu = cpuClub(st);
  cpu.owner!.patience = 0.55;
  const hc = cpu.coaches!.hc!;
  hc.hiredSeason = st.season - 1;
  hc.yearsRemaining = 4;
  holdOtherContracts(st, cpu.id);
  plantGradedYear(st, st.season - 1, (id) => (id === cpu.id ? 5 : 14), () => 8);
  const id = hc.id;
  fireCpuHeadCoaches(st);
  assert.equal(cpu.coaches?.hc?.id, id, "5-win first season keeps the CPU HC");
  assert.equal(st.seasonCounters?.hcFires ?? 0, 0);
  assert.equal(st.seasonCounters?.hcOneAndDone ?? 0, 0);

  const user = newGame({ seed: 104 });
  ensureOwners(user);
  user.settings = { ...(user.settings!), firingEnabled: true };
  user.teams[user.userTeamId].owner!.patience = 0.55;
  user.teams[user.userTeamId].gmHiredSeason = user.season - 1;
  plantGradedYear(user, user.season - 1, (id) => (id === user.userTeamId ? 5 : 14), () => 8);
  assert.equal(ownerJobView(user, user.userTeamId)!.wouldFire, false);
  assert.equal(applyUserGmFiring(user), null);
  ok("5-win first season is not fired");
}

{
  const rebuild = ownerJudgment(0.55, [3], [OWNER_WIN_TARGET.rebuild], true);
  assert.equal(rebuild.wouldFire, false, "rebuild target skips the one-and-done clause");
  const retool = ownerJudgment(0.55, [3], [OWNER_WIN_TARGET.retool], true);
  assert.equal(retool.wouldFire, true, "retool 3-win year 1 still fires");
  assert.equal(OWNER_WIN_TARGET.rebuild, 6);
  assert.equal(OWNER_WIN_TARGET.retool, 8);

  const user = newGame({ seed: 107 });
  ensureOwners(user);
  user.settings = { ...(user.settings!), firingEnabled: true };
  user.teams[user.userTeamId].owner!.patience = 0.55;
  user.teams[user.userTeamId].gmHiredSeason = user.season - 1;
  plantGradedYear(
    user,
    user.season - 1,
    (id) => (id === user.userTeamId ? 3 : 14),
    (id) => (id === user.userTeamId ? OWNER_WIN_TARGET.rebuild : OWNER_WIN_TARGET.retool),
  );
  assert.equal(ownerJobView(user, user.userTeamId)!.wouldFire, false, "user hired into a rebuild with 3 wins is not fired");
  assert.equal(applyUserGmFiring(user), null);

  const retoolUser = newGame({ seed: 109 });
  ensureOwners(retoolUser);
  retoolUser.settings = { ...(retoolUser.settings!), firingEnabled: true };
  retoolUser.teams[retoolUser.userTeamId].owner!.patience = 0.55;
  retoolUser.teams[retoolUser.userTeamId].gmHiredSeason = retoolUser.season - 1;
  plantGradedYear(
    retoolUser,
    retoolUser.season - 1,
    (id) => (id === retoolUser.userTeamId ? 3 : 14),
    (id) => (id === retoolUser.userTeamId ? OWNER_WIN_TARGET.retool : OWNER_WIN_TARGET.contend),
  );
  assert.equal(ownerJobView(retoolUser, retoolUser.userTeamId)!.wouldFire, true, "retool club, 3 wins in year 1, fires the user GM");
  assert.ok(applyUserGmFiring(retoolUser), "retool year 1 still fires the user GM");

  const st = newGame({ seed: 108 });
  ensureOwners(st);
  st.settings = { ...(st.settings!), firingEnabled: true };
  const cpu = cpuClub(st);
  cpu.owner!.patience = 0.55;
  const hc = cpu.coaches!.hc!;
  hc.hiredSeason = st.season - 1;
  hc.yearsRemaining = 4;
  holdOtherContracts(st, cpu.id);
  plantGradedYear(
    st,
    st.season - 1,
    (id) => (id === cpu.id ? 3 : 14),
    (id) => (id === cpu.id ? OWNER_WIN_TARGET.rebuild : OWNER_WIN_TARGET.retool),
  );
  const id = hc.id;
  fireCpuHeadCoaches(st);
  assert.equal(cpu.coaches?.hc?.id, id, "rebuild target year 1 keeps the CPU HC");
  assert.equal(st.seasonCounters?.hcFires ?? 0, 0);
  assert.equal(st.seasonCounters?.hcOneAndDone ?? 0, 0);
  ok("rebuild year 1 is not one-and-done; a retool club still fires");
}

{
  const st = newGame({ seed: 105 });
  ensureOwners(st);
  const cpu = cpuClub(st);
  cpu.owner!.patience = 0.55;
  const hc = cpu.coaches!.hc!;
  hc.hiredSeason = st.season - 2;
  hc.yearsRemaining = 1;
  holdOtherContracts(st, cpu.id);
  plantGradedYear(st, st.season - 2, (id) => (id === cpu.id ? 8 : 14), (id) => (id === cpu.id ? 8 : 10));
  plantGradedYear(st, st.season - 1, (id) => (id === cpu.id ? 8 : 14), (id) => (id === cpu.id ? 8 : 10));
  const judged = ownerJudgment(0.55, [8, 8], [8, 8], true);
  close(judged.margin, 0.5, "expiring coach 0.5 above the retool bar");
  assert.equal(judged.wouldFire, false, "half a win clear is not an in-term fire");
  const id = hc.id;
  fireCpuHeadCoaches(st);
  assert.equal(cpu.coaches?.hc, undefined, "0.5 above the bar is not renewed");
  assert.equal(st.seasonCounters?.hcFires, 1, "the non-renewal counts as a fire");
  assert.equal(st.seasonCounters?.hcOneAndDone ?? 0, 0, "two seasons is not one-and-done");
  assert.equal(st.seasonCounters?.hcFiredLastSeasonWins, 8);
  tickCoachContracts(st);
  assert.equal(st.seasonCounters?.hcExpiries ?? 0, 0, "a non-renewal is a fire, not an expiry");
  assert.equal(st.coachMarket?.some((c) => c.id === id), true);
  ok("expiring coach 0.5 above the bar is not renewed and counted");
}

{
  const st = newGame({ seed: 106 });
  ensureOwners(st);
  const cpu = cpuClub(st);
  cpu.owner!.patience = 0.55;
  const hc = cpu.coaches!.hc!;
  hc.hiredSeason = st.season - 3;
  hc.yearsRemaining = 1;
  holdOtherContracts(st, cpu.id);
  for (let i = 0; i < 3; i++) {
    plantGradedYear(
      st,
      st.season - 3 + i,
      (id) => (id === cpu.id ? 9 : 14),
      (id) => (id === cpu.id ? 6 : 10),
    );
  }
  const judged = ownerJudgment(0.55, [9, 9, 9], [6, 6, 6], true);
  close(judged.bar, 7, "third year has no rebuild runway");
  close(judged.margin, 2, "expiring coach 2 above the bar");
  assert.equal(judged.wouldFire, false);
  const id = hc.id;
  const parent = st.rngState;
  fireCpuHeadCoaches(st);
  tickCoachContracts(st);
  assert.equal(st.rngState, parent, "extend does not draw on the parent stream");
  assert.equal(cpu.coaches?.hc?.id, id, "2 above the bar is extended");
  assert.equal(cpu.coaches!.hc!.yearsRemaining, COACH_CONTRACT.hc.yearsLo);
  assert.equal(st.seasonCounters?.hcFires ?? 0, 0);
  ok("expiring coach 2 above the bar is extended");
}

{
  const st = newGame({ seed: 93 });
  ensureOwners(st);
  const cpu = cpuClub(st);
  cpu.owner!.patience = 0.55;
  const hc = cpu.coaches!.hc!;
  hc.hiredSeason = st.season - 4;
  hc.yearsRemaining = 4;
  holdOtherContracts(st, cpu.id);
  const wins = [3, 3, 3, 3];
  for (let i = 0; i < 4; i++) {
    plantGradedYear(
      st,
      st.season - 4 + i,
      (id) => (id === cpu.id ? wins[i] : 14),
      (id) => (id === cpu.id ? 6 : 10),
    );
  }
  const id = hc.id;
  const parent = st.rngState;
  const fired = fireCpuHeadCoaches(st);
  assert.equal(st.rngState, parent, "CPU HC fire does not touch the parent stream");
  assert.equal(cpu.coaches?.hc, undefined, "four 3-win seasons under one HC fire that coach");
  assert.equal(fired, 1);
  assert.equal(st.seasonCounters?.hcFires, 1);
  assert.equal(st.coachMarket?.some((c) => c.id === id), true);
  assert.equal(st.seasonCounters?.hcFireTenureSeasons, 4);
  assert.equal(st.seasonCounters?.hcFireTenureWins, 12);
  assert.equal(st.seasonCounters?.hcFiredLastSeasonWins, 3);
  assert.equal(st.seasonCounters?.hcOneAndDone ?? 0, 0);
  ok("four 3-win seasons under one HC fire on the last two");
}

{
  const st = newGame({ seed: 94 });
  ensureOwners(st);
  const cpu = cpuClub(st);
  cpu.owner!.patience = 0.55;
  const hc = cpu.coaches!.hc!;
  hc.yearsRemaining = 4;
  holdOtherContracts(st, cpu.id);
  for (let i = 0; i < 6; i++) {
    plantGradedYear(
      st,
      st.season - 7 + i,
      (id) => (id === cpu.id ? 3 : 14),
      () => 10,
    );
  }
  plantGradedYear(st, st.season - 1, (id) => (id === cpu.id ? 11 : 14), () => 10);
  hc.hiredSeason = st.season - 1;
  const id = hc.id;
  fireCpuHeadCoaches(st);
  assert.equal(cpu.coaches?.hc?.id, id, "a new HC is judged only on his own season");
  ok("new HC inherits no prior seasons");
}

{
  const st = newGame({ seed: 92 });
  ensureOwners(st);
  st.settings = { ...(st.settings!), firingEnabled: true };
  const team = st.teams[st.userTeamId];
  team.owner!.patience = 0.55;
  team.gmHiredSeason = st.season - 3;
  plantGradedYear(st, st.season - 3, (id) => (id === st.userTeamId ? 3 : 12), () => 6);
  plantGradedYear(st, st.season - 2, (id) => (id === st.userTeamId ? 4 : 12), () => 6);
  plantGradedYear(st, st.season - 1, (id) => (id === st.userTeamId ? 12 : 12), () => 6);
  const job = ownerJobView(st, st.userTeamId)!;
  close(job.weightedWins, 8.8, "turnaround weighted");
  assert.ok(job.bar <= 8.5, `bar ${job.bar}`);
  assert.equal(job.wouldFire, false, "3/4/12 turnaround does not fire the user GM");
  assert.equal(applyUserGmFiring(st), null);
  ok("3/4/12 turnaround does not fire");
}

console.log("ok    owner two-season firing rule");
