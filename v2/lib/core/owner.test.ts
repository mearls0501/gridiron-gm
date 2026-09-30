/**
 * Owner patience, heat, and the firingEnabled bite.
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
  acceptGmChair,
  applyUserGmFiring,
  ensureOwners,
  fireHeatThreshold,
  heatSinceSeason,
  ownerHeatFor,
  ownerJobView,
  retireFromLeague,
  stampSeasonExpectedWins,
} from "./owner";
import { teamOutlook } from "./frontOffice";
import { GameState, SeasonHistory, TeamRecord } from "./types";

function ok(label: string) { console.log("ok   ", label); }

function plantYear(st: GameState, season: number, userWins: number): SeasonHistory {
  const standings: TeamRecord[] = st.teams.map((t) => {
    const r = blankRecord(t.id);
    if (t.id === st.userTeamId) {
      r.w = userWins;
      r.l = 17 - userWins;
    } else {
      r.w = 8;
      r.l = 9;
    }
    return r;
  });
  const row: SeasonHistory = {
    season,
    championId: st.userTeamId === 0 ? 1 : 0,
    runnerUpId: st.userTeamId === 1 ? 2 : 1,
    standings,
    awards: { mvp: null, opoy: null, dpoy: null, roy: null },
    leaders: { passYds: null, rushYds: null, recYds: null, sacks: null },
  };
  st.history.push(row);
  return row;
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
  assert.ok(fireHeatThreshold(0.35) < fireHeatThreshold(0.80), "patient owners are harder to trip");
  assert.equal(OWNER_MIN_SEASONS, 2);

  const impatientHot = ownerHeatFor(0.35, "contend", [4, 4]);
  assert.ok(
    impatientHot >= fireHeatThreshold(0.35),
    `impatient contend 4-13 twice should fire (heat ${impatientHot.toFixed(1)})`,
  );

  const patientRebuild = ownerHeatFor(0.80, "rebuild", [5, 5]);
  assert.ok(
    patientRebuild < fireHeatThreshold(0.80),
    `patient rebuild 5-12 twice should hold (heat ${patientRebuild.toFixed(1)})`,
  );
  ok("proposed firing defaults: impatient contend fires; patient rebuild holds");
}

{
  const st = newGame({ seed: 53 });
  ensureOwners(st);
  st.teams[st.userTeamId].owner!.patience = 0.35;
  st.teams[st.userTeamId].gmHiredSeason = st.season - 2;
  plantYear(st, st.season - 2, 3);
  plantYear(st, st.season - 1, 3);

  st.settings = { ...(st.settings!), firingEnabled: false };
  const off = ownerJobView(st, st.userTeamId);
  assert.ok(off);
  assert.equal(off.firingEnabled, false);
  assert.equal(off.wouldFire, false, "firingEnabled off never fires");
  assert.ok(off.heat > 0, "heat is still computed when firing is off");

  st.settings.firingEnabled = true;
  const on = ownerJobView(st, st.userTeamId)!;
  if (on.heat >= on.threshold && on.seasonsWithGm >= OWNER_MIN_SEASONS) {
    assert.equal(on.wouldFire, true, "flag on + heat over the line means the chair is lost");
  } else {
    assert.equal(on.wouldFire, false);
  }
  ok("firingEnabled is the bite; heat is computed either way");
}

{
  const st = newGame({ seed: 54 });
  const raw = JSON.parse(JSON.stringify(st)) as GameState;
  for (const t of raw.teams) delete t.owner;
  ensureOwners(raw);
  assert.ok(raw.teams.every((t) => t.owner), "stripped save gets an owner");
  ok("old save without owner loads");
}

function forceContend(st: GameState, teamId: number): void {
  if (st.teams[teamId].frontOffice) st.teams[teamId].frontOffice!.winNow = 1;
  for (const p of st.players) {
    if (p.teamId === teamId && !p.retired && !p.prospect) p.ovr = Math.max(p.ovr, 82);
  }
}

{
  const st = newGame({ seed: 55 });
  ensureOwners(st);
  st.settings = { ...(st.settings!), firingEnabled: true };
  st.teams[st.userTeamId].owner!.patience = 0.35;
  forceContend(st, st.userTeamId);
  st.teams[st.userTeamId].gmHiredSeason = st.season - 2;
  plantYear(st, st.season - 2, 3);
  plantYear(st, st.season - 1, 3);
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
  forceContend(st, st.userTeamId);
  st.teams[st.userTeamId].gmHiredSeason = st.season - 2;
  plantYear(st, st.season - 2, 3);
  plantYear(st, st.season - 1, 3);
  applyUserGmFiring(st);
  const r = retireFromLeague(st);
  assert.equal(r.ok, true);
  assert.equal(st.forcedMove?.retired, true);
  ok("retire-save path is available");
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
      r.w = w;
      r.l = Math.max(0, 17 - w);
      r.expectedWins = expectedFor(t.id);
      return r;
    }),
    awards: { mvp: null, opoy: null, dpoy: null, roy: null },
    leaders: { passYds: null, rushYds: null, recYds: null, sacks: null },
  });
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
  ok("runRecap decides heat before contracts tick");
}

{
  const st = newGame({ seed: 92 });
  ensureOwners(st);
  st.settings = { ...(st.settings!), firingEnabled: true };
  const team = st.teams[st.userTeamId];
  team.owner!.patience = 0.35;
  forceContend(st, st.userTeamId);
  team.gmHiredSeason = st.season - 3;
  plantGradedYear(st, st.season - 3, (id) => (id === st.userTeamId ? 3 : 8), () => 6);
  plantGradedYear(st, st.season - 2, (id) => (id === st.userTeamId ? 4 : 8), () => 6);
  plantGradedYear(st, st.season - 1, (id) => (id === st.userTeamId ? 12 : 8), () => 6);
  const graded = ownerHeatFor(0.35, "retool", [3, 4, 12], [6, 6, 6]);
  const retro = ownerHeatFor(0.35, "contend", [3, 4, 12]);
  assert.ok(retro >= fireHeatThreshold(0.35), "scoring the turnaround as today's contend would fire");
  assert.ok(graded < fireHeatThreshold(0.35), "preseason rebuild targets cool the 12-win year");
  const job = ownerJobView(st, st.userTeamId)!;
  assert.equal(job.heat, graded);
  assert.equal(job.wouldFire, false, "3/4/12 turnaround does not fire the user GM");
  assert.equal(applyUserGmFiring(st), null);
  ok("3/4/12 turnaround does not fire");
}

{
  const st = newGame({ seed: 93 });
  ensureOwners(st);
  const cpu = st.teams.find((t) => t.id !== st.userTeamId)!;
  cpu.owner!.patience = 0.55;
  cpu.forcedRebuildUntil = st.season + 5;
  const hc = cpu.coaches!.hc!;
  hc.hiredSeason = st.season - 4;
  hc.yearsRemaining = 4;
  const wins = [3, 3, 3, 3];
  const targets = [8, 6, 6, 6];
  for (let i = 0; i < 4; i++) {
    plantGradedYear(
      st,
      st.season - 4 + i,
      (id) => (id === cpu.id ? wins[i] : 11),
      (id) => (id === cpu.id ? targets[i] : 10),
    );
  }
  const graded = ownerHeatFor(0.55, "retool", wins, targets);
  const asRebuild = ownerHeatFor(0.55, "rebuild", wins);
  assert.ok(asRebuild < fireHeatThreshold(0.55), "today's rebuild label would keep four 3-win years safe");
  assert.ok(graded >= fireHeatThreshold(0.55), "preseason targets put four 3-win years over the line");
  assert.equal(heatSinceSeason(st, cpu.id, 0.55, hc.hiredSeason), graded);
  const id = hc.id;
  const parent = st.rngState;
  const fired = fireCpuHeadCoaches(st);
  assert.equal(st.rngState, parent, "CPU HC fire does not touch the parent stream");
  assert.equal(cpu.coaches?.hc, undefined, "four 3-win seasons under one HC fire that coach");
  assert.ok(fired >= 1);
  assert.equal(st.seasonCounters?.hcFires, fired);
  assert.equal(st.coachMarket?.some((c) => c.id === id), true);
  assert.equal(st.seasonCounters?.hcFireTenureSeasons, 4);
  assert.equal(st.seasonCounters?.hcFireTenureWins, 12);
  ok("four 3-win seasons under one HC fire");
}

{
  const st = newGame({ seed: 94 });
  ensureOwners(st);
  const cpu = st.teams.find((t) => t.id !== st.userTeamId)!;
  cpu.owner!.patience = 0.55;
  const hc = cpu.coaches!.hc!;
  hc.yearsRemaining = 4;
  for (let i = 0; i < 6; i++) {
    plantGradedYear(
      st,
      st.season - 7 + i,
      (id) => (id === cpu.id ? 3 : 10),
      () => 10,
    );
  }
  plantGradedYear(st, st.season - 1, (id) => (id === cpu.id ? 11 : 10), () => 10);
  hc.hiredSeason = st.season - 1;
  const inherited = heatSinceSeason(st, cpu.id, 0.55, st.season - 7);
  const own = heatSinceSeason(st, cpu.id, 0.55, hc.hiredSeason);
  assert.ok(inherited > 60, `pre-hire seasons should peg the chair (heat ${inherited.toFixed(1)})`);
  assert.equal(own, 0, "the new HC's own 11-win year carries no heat");
  const id = hc.id;
  fireCpuHeadCoaches(st);
  assert.equal(cpu.coaches?.hc?.id, id, "a new HC does not inherit the previous chair's heat");
  ok("new HC inherits no heat");
}

{
  const st = newGame({ seed: 95 });
  ensureOwners(st);
  const cpu = st.teams.find((t) => t.id !== st.userTeamId)!;
  cpu.owner!.patience = 0.55;
  const hc = cpu.coaches!.hc!;
  hc.yearsRemaining = 4;
  for (let i = 0; i < 4; i++) {
    plantGradedYear(st, st.season - 6 + i, () => 10, () => 8);
  }
  plantGradedYear(st, st.season - 2, (id) => (id === cpu.id ? 3 : 10), () => 6);
  plantGradedYear(st, st.season - 1, (id) => (id === cpu.id ? 3 : 10), () => 6);
  hc.hiredSeason = st.season - 2;
  const grace = ownerHeatFor(0.55, "rebuild", [3, 3]);
  const noGrace = ownerHeatFor(0.55, "contend", [3, 3]);
  assert.ok(grace < noGrace, "rebuild grace is lighter than a full miss");
  assert.equal(heatSinceSeason(st, cpu.id, 0.55, hc.hiredSeason), grace);
  assert.ok(grace < fireHeatThreshold(0.55));
  ok("rebuild grace is the coach's first two years, not the league's");
}

{
  const st = newGame({ seed: 96 });
  ensureOwners(st);
  const cpu = st.teams.find((t) => t.id !== st.userTeamId)!;
  cpu.owner!.patience = 0.55;
  const hc = cpu.coaches!.hc!;
  hc.hiredSeason = st.season - 1;
  hc.yearsRemaining = 1;
  plantGradedYear(st, st.season - 1, (id) => (id === cpu.id ? 11 : 10), () => 10);
  const id = hc.id;
  const parent = st.rngState;
  fireCpuHeadCoaches(st);
  tickCoachContracts(st);
  assert.equal(st.rngState, parent, "extend does not draw on the parent stream");
  assert.equal(cpu.coaches?.hc?.id, id, "expiring 11-win HC is still the coach");
  assert.equal(cpu.coaches!.hc!.yearsRemaining, COACH_CONTRACT.hc.yearsLo);
  assert.equal(st.seasonCounters?.hcFires ?? 0, 0);
  ok("expiring 11-win HC is extended");
}

{
  const st = newGame({ seed: 97 });
  ensureOwners(st);
  const cpu = st.teams.find((t) => t.id !== st.userTeamId)!;
  cpu.owner!.patience = 0.55;
  for (const t of st.teams) {
    if (t.coaches?.hc && t.id !== cpu.id) t.coaches.hc.yearsRemaining = 4;
  }
  const hc = cpu.coaches!.hc!;
  hc.hiredSeason = st.season - 1;
  hc.yearsRemaining = 1;
  plantGradedYear(st, st.season - 1, (id) => (id === cpu.id ? 3 : 11), (id) => (id === cpu.id ? 10 : 8));
  const watch = fireHeatThreshold(0.55) * 0.55;
  const heat = heatSinceSeason(st, cpu.id, 0.55, hc.hiredSeason);
  assert.ok(heat >= watch, `expiring miss should clear the watched line (${heat.toFixed(1)} vs ${watch.toFixed(1)})`);
  assert.ok(heat < fireHeatThreshold(0.55), "one 3-win year stays under the full fire line");
  fireCpuHeadCoaches(st);
  assert.equal(cpu.coaches?.hc, undefined, "expiring HC over the watched line is not renewed");
  assert.equal(st.seasonCounters?.hcFires, 1);
  tickCoachContracts(st);
  assert.equal(st.seasonCounters?.hcExpiries ?? 0, 0, "a non-renewal is a fire, not an expiry");
  ok("expiring HC over the watched line counts as a fire");
}

console.log("ok    owner people layer");
