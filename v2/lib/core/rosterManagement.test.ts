/**
 * Roster management regressions.
 *
 * Manual depth charts slot newcomers by rating instead of freezing.
 * User auto-fill signs minimum deals and does not cut.
 * CPU clubs stay inside the 53 and the position ceiling.
 * An IR return parks on the practice squad when there is room.
 * A healthy quarterback, including a practice-squad quarterback, plays
 * before a punter.
 * A mid-game exit leaves the other healthy quarterback in. While one is
 * still dressed, the open slot stays empty: a decided game does not hand
 * attempts to another position. The emergency quarterback comes in only
 * when that room is empty.
 *
 * Run: npx tsx lib/core/rosterManagement.test.ts
 */
import assert from "node:assert/strict";
import { newGame } from "./newGame";
import { makeContract, makePlayer, autoSortDepthChart, markDepthManual, refreshDepthCharts } from "./generate";
import {
  enforceCap, fillCpuRosterShortfall, fillOpenActiveSlots, fillUserMinimum, freeActiveSlot,
  refillCpuRostersAfterWaivers, trimCpuRosterSanity,
} from "./offseason/contracts";
import { cutPlayer } from "./offseason/contracts";
import { dressEmergencyQuarterbacks } from "./emergencyQb";
import { sitPlayer, isSat } from "./inactives";
import { Rng } from "./rng";
import { simulateGame } from "./sim/game";
import { advance, startRegularSeason } from "./season/engine";
import { resolveWaivers } from "./waivers";
import { placeOnPs } from "./rosterStatus";
import {
  capHit, deadMoney, isActiveRoster, isOnWaivers, positionCount, practiceSquadCount, rosterCount, teamCap,
} from "./select";
import {
  LEAGUE_MINIMUM, POSITION_ACTIVE_MAX, POSITION_MIN, POSITIONS, PRACTICE_SQUAD_LIMIT, ROSTER_LIMIT,
  type Contract, type GameState, type Player, type Position,
} from "./types";

function clubActive(st: GameState, teamId: number): Player[] {
  return st.players.filter((p) => p.teamId === teamId && !p.retired && !p.prospect && isActiveRoster(p));
}

function addBody(st: GameState, teamId: number | null, pos: Position, ovr: number): Player {
  const p = makePlayer(new Rng(st.nextPlayerId + ovr), st.nextPlayerId++, {
    pos, targetOvr: ovr, age: 26, season: st.season,
  });
  p.ovr = ovr;
  p.teamId = teamId;
  p.contract = makeContract(new Rng(p.id), LEAGUE_MINIMUM, 1, st.season, 0);
  p.injuryWeeks = 0;
  st.players.push(p);
  return p;
}

function userGame(st: GameState) {
  return st.games.find(
    (g) => g.season === st.season && g.week === st.week && !g.played &&
      (g.homeId === st.userTeamId || g.awayId === st.userTeamId),
  );
}

// Edited quarterback order stays. A new corner slots by rating. A departed id is dropped.
// Untouched positions still auto-sort.
{
  const st = newGame({ seed: 3 });
  const team = st.teams[st.userTeamId];
  team.depthChart.QB = team.depthChart.QB.slice().reverse();
  const qbOrder = team.depthChart.QB.slice();
  markDepthManual(team, "QB");

  const cbIds = team.depthChart.CB.filter((id) => st.players.some((p) => p.id === id));
  const cbPlayers = cbIds.map((id) => st.players.find((p) => p.id === id)!);
  const worstFirst = cbPlayers.slice().sort((a, b) => a.ovr - b.ovr || a.id - b.id);
  team.depthChart.CB = [999_999, ...worstFirst.map((p) => p.id)];
  markDepthManual(team, "CB");
  const newbie = addBody(st, team.id, "CB", 100);
  newbie.injuryWeeks = 0;
  delete newbie.status;

  refreshDepthCharts(st);
  assert.deepEqual(team.depthChart.QB, qbOrder, "edited QB order is kept");
  assert.equal(team.depthChart.CB[0], newbie.id, "a better new corner slots in by rating");
  assert.deepEqual(team.depthChart.CB.slice(1), worstFirst.map((p) => p.id), "existing corner order is kept");
  assert.equal(team.depthChart.CB.includes(999_999), false, "departed id is pruned");
  assert.ok(team.depthChartManualAt?.includes("QB") && team.depthChartManualAt.includes("CB"));

  const wrBefore = team.depthChart.WR.slice().reverse();
  team.depthChart.WR = wrBefore;
  refreshDepthCharts(st);
  assert.notDeepEqual(team.depthChart.WR, wrBefore, "an untouched position still auto-sorts");
  assert.deepEqual(team.depthChart.QB, qbOrder);
}

// A legacy manual flag with no position list reconciles every position.
{
  const st = newGame({ seed: 4 });
  const team = st.teams[st.userTeamId];
  team.depthChart.QB = team.depthChart.QB.slice().reverse();
  const qbOrder = team.depthChart.QB.slice();
  const wrOrder = team.depthChart.WR.slice().reverse();
  team.depthChart.WR = wrOrder.slice();
  team.depthChartManual = true;
  delete team.depthChartManualAt;
  const star = addBody(st, team.id, "WR", 100);
  refreshDepthCharts(st);
  assert.deepEqual(team.depthChart.QB, qbOrder, "legacy chart keeps relative order");
  assert.equal(team.depthChart.WR[0], star.id, "legacy chart slots the new starter by rating");
  assert.deepEqual(team.depthChart.WR.slice(1), wrOrder);
  autoSortDepthChart(st, team);
  assert.equal(team.depthChartManual, false);
  assert.equal(team.depthChartManualAt, undefined);
}

// Auto-fill spends minimum deals on need, not the cap, and cuts nobody.
{
  const st = newGame({ seed: 5 });
  st.phase = "regular";
  const tid = st.userTeamId;
  const star = addBody(st, null, "OT", 97);
  star.contract = null;
  let cut = 0;
  const surplus = clubActive(st, tid)
    .filter((p) => positionCount(st, tid, p.pos) > POSITION_MIN[p.pos])
    .sort((a, b) => capHit(a.contract) - capHit(b.contract));
  for (const p of surplus) {
    if (cut >= 8) break;
    assert.equal(cutPlayer(st, p.id).ok, true);
    cut++;
  }
  assert.ok(cut >= 4, "opened roster spots");
  const kept = new Set(clubActive(st, tid).map((p) => p.id));
  const before = rosterCount(st, tid);
  const rng = new Rng(st.rngState);
  const filled = fillUserMinimum(st, tid, rng);
  assert.ok(filled.signed > 0, "signed somebody");
  assert.equal(star.teamId, null, "the 97 OT is not signed");
  assert.ok(filled.spent < 20_000_000, `spent ${filled.spent}`);
  assert.equal(rosterCount(st, tid), Math.min(ROSTER_LIMIT, before + filled.signed));
  for (const id of kept) {
    const p = st.players.find((x) => x.id === id)!;
    assert.equal(p.teamId, tid, "auto-fill cut a player who was already here");
  }
  for (const p of clubActive(st, tid)) {
    if (kept.has(p.id)) continue;
    assert.equal(p.contract?.years, 1);
    assert.equal(p.contract?.guaranteedYears, 0);
    assert.ok(capHit(p.contract) < 2_000_000);
    assert.ok(p.ovr <= 70, `${p.pos} ${p.ovr} is a star on a minimum deal`);
  }
  for (const pos of POSITIONS) {
    assert.ok(positionCount(st, tid, pos) <= POSITION_ACTIVE_MAX[pos], pos);
  }
}

// Open 53 spots are not filled with punters. A club already over 53 is trimmed.
// The user seat is not.
{
  const st = newGame({ seed: 6 });
  st.phase = "regular";
  const cpu = st.teams.find((t) => t.id !== st.userTeamId)!.id;
  const user = st.userTeamId;
  let opened = 0;
  for (const p of clubActive(st, cpu).slice().sort((a, b) => a.ovr - b.ovr)) {
    if (opened >= 4) break;
    if (p.pos === "P") continue;
    if (positionCount(st, cpu, p.pos) <= POSITION_MIN[p.pos]) continue;
    assert.equal(cutPlayer(st, p.id).ok, true);
    opened++;
  }
  assert.equal(rosterCount(st, cpu), ROSTER_LIMIT - opened);
  st.waivers = [];
  const punters: Player[] = [];
  for (let i = 0; i < 6; i++) punters.push(addBody(st, null, "P", 93));
  for (const p of punters) p.contract = null;
  fillOpenActiveSlots(st, cpu, new Rng(1));
  assert.ok(positionCount(st, cpu, "P") <= POSITION_ACTIVE_MAX.P, `punters ${positionCount(st, cpu, "P")}`);
  assert.equal(rosterCount(st, cpu), ROSTER_LIMIT);
  assert.ok(punters.filter((p) => p.teamId === cpu).length <= POSITION_ACTIVE_MAX.P);

  for (let i = 0; i < 6; i++) addBody(st, cpu, "P", 90);
  for (let i = 0; i < 5; i++) addBody(st, user, "RB", 80);
  assert.ok(rosterCount(st, cpu) > ROSTER_LIMIT);
  assert.ok(positionCount(st, cpu, "P") > POSITION_ACTIVE_MAX.P);
  const userBefore = rosterCount(st, user);
  assert.equal(trimCpuRosterSanity(st), true);
  assert.equal(rosterCount(st, cpu) <= ROSTER_LIMIT, true);
  assert.ok(positionCount(st, cpu, "P") <= POSITION_ACTIVE_MAX.P);
  assert.equal(rosterCount(st, user), userBefore, "user over 53 is not trimmed");
  fillCpuRosterShortfall(st, new Rng(2));
  assert.equal(rosterCount(st, cpu), ROSTER_LIMIT);
  assert.ok(positionCount(st, cpu, "P") <= POSITION_ACTIVE_MAX.P);
  for (const pos of POSITIONS) {
    if (pos === "P") continue;
    assert.ok(positionCount(st, cpu, pos) <= POSITION_ACTIVE_MAX[pos], pos);
  }
}

// A short CPU club at the punter ceiling does not claim another punter.
{
  const st = newGame({ seed: 7 });
  st.phase = "regular";
  const cpu = st.teams.find((t) => t.id !== st.userTeamId)!.id;
  while (positionCount(st, cpu, "P") < POSITION_ACTIVE_MAX.P) addBody(st, cpu, "P", 70);
  let guard = 0;
  while (rosterCount(st, cpu) > ROSTER_LIMIT - 1 && guard++ < 8) {
    const extra = clubActive(st, cpu).find((p) => p.pos !== "P" && positionCount(st, cpu, p.pos) > POSITION_MIN[p.pos]);
    assert.ok(extra);
    assert.equal(cutPlayer(st, extra.id).ok, true);
  }
  assert.equal(rosterCount(st, cpu), ROSTER_LIMIT - 1);
  assert.ok(positionCount(st, cpu, "P") >= POSITION_ACTIVE_MAX.P);
  const donor = st.teams.find((t) => t.id !== cpu && t.id !== st.userTeamId)!.id;
  const punter = addBody(st, donor, "P", 95);
  assert.equal(cutPlayer(st, punter.id).ok, true);
  st.waivers = (st.waivers ?? []).filter((w) => w.playerId === punter.id);
  resolveWaivers(st);
  assert.notEqual(punter.teamId, cpu, "short club at the punter max does not claim another");
  assert.ok(positionCount(st, cpu, "P") <= POSITION_ACTIVE_MAX.P);
  assert.equal(rosterCount(st, cpu), ROSTER_LIMIT - 1);
}

// Practice squad full and the club cannot eat the dead money: he stays off the active roster.
// He clears to free agency (docs/waiver-clearing-design-2026-10-23.md), not back on the wire.
{
  const st = newGame({ seed: 8 });
  st.phase = "regular";
  const tid = st.userTeamId;
  let parked = 0;
  for (const p of clubActive(st, tid).slice().sort((a, b) => a.ovr - b.ovr)) {
    if (parked >= PRACTICE_SQUAD_LIMIT) break;
    if (placeOnPs(st, p.id).ok) parked++;
  }
  assert.equal(practiceSquadCount(st, tid), PRACTICE_SQUAD_LIMIT);
  const victim = clubActive(st, tid).find((p) => deadMoney(p.contract) > 0);
  assert.ok(victim);
  victim.ovr = 20;
  victim.pot = 20;
  victim.ceiling = 20;
  const activeBefore = rosterCount(st, tid);
  assert.equal(cutPlayer(st, victim.id).ok, true);
  st.teams[tid].deadCap = 9e15;
  resolveWaivers(st);
  assert.equal(victim.teamId, null);
  assert.equal(isActiveRoster(victim) && victim.teamId === tid, false);
  assert.equal(isOnWaivers(st, victim.id), false, "cleared, not re-listed");
  assert.equal(victim.contract, null, "a free agent, not activated");
  assert.equal(rosterCount(st, tid), activeBefore - 1);
}

// IR slot free parks on the practice squad instead of waiving.
{
  const st = newGame({ seed: 9 });
  st.phase = "regular";
  const cpu = st.teams.find((t) => t.id !== st.userTeamId)!.id;
  const psBefore = practiceSquadCount(st, cpu);
  const wire = (st.waivers ?? []).length;
  assert.equal(freeActiveSlot(st, cpu), true);
  assert.equal(practiceSquadCount(st, cpu), psBefore + 1);
  assert.equal((st.waivers ?? []).length, wire);
  assert.equal(rosterCount(st, cpu), ROSTER_LIMIT - 1);
}

// Both quarterbacks hurt, a 99 punter on the 53, a practice-squad quarterback: the quarterback throws.
{
  const st = newGame({ seed: 10 });
  startRegularSeason(st);
  let guard = 0;
  while (!userGame(st) && guard++ < 18) advance(st);
  const g = userGame(st);
  assert.ok(g);
  const tid = st.userTeamId;
  for (const p of clubActive(st, tid)) if (p.pos === "QB") p.injuryWeeks = 8;
  const punter = clubActive(st, tid).find((p) => p.pos === "P");
  assert.ok(punter);
  punter.ovr = 99;
  const psQb = addBody(st, tid, "QB", 72);
  assert.equal(placeOnPs(st, psQb.id).ok, true, "park the emergency quarterback");
  assert.equal(psQb.status, "ps");
  const rng = new Rng(st.rngState);
  const result = simulateGame(st, g, rng);
  const row = result.box.players.find((s) => s.playerId === psQb.id);
  assert.ok(row && row.passAtt > 0, "practice-squad quarterback takes the snaps");
  const punterRow = result.box.players.find((s) => s.playerId === punter.id);
  assert.ok(!punterRow || (punterRow.passAtt ?? 0) === 0, "punter does not throw");
  for (const s of result.box.players) {
    if ((s.passAtt ?? 0) <= 0) continue;
    const p = st.players.find((x) => x.id === s.playerId);
    if (p && p.teamId === tid) assert.equal(p.pos, "QB");
  }
}

// CPU kickoff elevates the practice-squad quarterback. The user club is not cut to do it.
{
  const st = newGame({ seed: 11 });
  st.phase = "regular";
  const cpu = st.teams.find((t) => t.id !== st.userTeamId)!.id;
  for (const id of [cpu, st.userTeamId]) {
    for (const p of clubActive(st, id)) if (p.pos === "QB") p.injuryWeeks = 8;
  }
  const cpuQb = addBody(st, cpu, "QB", 74);
  const userQb = addBody(st, st.userTeamId, "QB", 74);
  assert.equal(placeOnPs(st, cpuQb.id).ok, true);
  assert.equal(placeOnPs(st, userQb.id).ok, true);
  const userActive = new Set(clubActive(st, st.userTeamId).map((p) => p.id));
  dressEmergencyQuarterbacks(st, [cpu, st.userTeamId]);
  assert.equal(cpuQb.status, undefined, "CPU practice-squad quarterback is elevated");
  assert.equal(isActiveRoster(cpuQb), true);
  assert.equal(rosterCount(st, cpu), ROSTER_LIMIT);
  assert.equal(userQb.status, "ps", "user is not cut to open a spot");
  for (const id of userActive) {
    assert.equal(st.players.find((p) => p.id === id)?.teamId, st.userTeamId);
  }
}

// Post-waiver checkpoint. enforceCap can leave a CPU club under 53 with
// space already positive; that club is refilled to 53. The position ceiling
// is applied there too. The user club is not refilled and not trimmed.
// Cap space stays non-negative.
{
  const st = newGame({ seed: 12 });
  st.phase = "preseason";
  const user = st.userTeamId;
  const cpus = st.teams.map((t) => t.id).filter((id) => id !== user);
  const cpuShort = cpus[0];
  const cpuCeil = cpus[1];

  function unguaranteed(apy: number): Contract {
    return {
      years: 1,
      yearsRemaining: 1,
      baseSalary: [apy],
      signingBonus: 0,
      bonusProrationYears: 0,
      signedSeason: st.season,
      guaranteedYears: 0,
    };
  }

  const surplus = clubActive(st, cpuShort)
    .filter((p) => positionCount(st, cpuShort, p.pos) > POSITION_MIN[p.pos])
    .sort((a, b) => a.ovr - b.ovr || a.id - b.id);
  assert.ok(surplus.length >= 4, "need surplus bodies enforceCap can cut");
  const hit = 10_000_000;
  for (const p of surplus.slice(0, 6)) p.contract = unguaranteed(hit);
  const spaceNow = teamCap(st, cpuShort).space;
  const target = -(hit * 2 + hit / 2);
  const deadPush = spaceNow - target;
  if (deadPush > 0) {
    st.teams[cpuShort].deadCap = (st.teams[cpuShort].deadCap ?? 0) + deadPush;
  }
  assert.ok(teamCap(st, cpuShort).space < 0, "enforceCap has a hole to cut");
  enforceCap(st, cpuShort);
  const shortCount = rosterCount(st, cpuShort);
  assert.ok(shortCount < ROSTER_LIMIT, `enforceCap left ${shortCount}`);
  assert.ok(teamCap(st, cpuShort).space >= 0, "enforceCap stops once space is positive");

  assert.equal(rosterCount(st, cpuCeil), ROSTER_LIMIT);
  while (positionCount(st, cpuCeil, "P") <= POSITION_ACTIVE_MAX.P) {
    const donor = clubActive(st, cpuCeil)
      .filter((p) => p.pos !== "P" && positionCount(st, cpuCeil, p.pos) > POSITION_MIN[p.pos])
      .sort((a, b) => a.ovr - b.ovr || a.id - b.id)[0];
    assert.ok(donor, "need a surplus body to make an extra punter");
    donor.pos = "P";
  }
  for (const p of clubActive(st, cpuCeil)) {
    if (p.pos === "P") p.contract = unguaranteed(LEAGUE_MINIMUM);
  }
  assert.ok(positionCount(st, cpuCeil, "P") > POSITION_ACTIVE_MAX.P);
  assert.equal(rosterCount(st, cpuCeil), ROSTER_LIMIT);
  assert.ok(teamCap(st, cpuCeil).space >= 0, "ceiling club still has room");

  let opened = 0;
  for (const p of clubActive(st, user).slice().sort((a, b) => a.ovr - b.ovr || a.id - b.id)) {
    if (opened >= 3) break;
    if (positionCount(st, user, p.pos) <= POSITION_MIN[p.pos]) continue;
    assert.equal(cutPlayer(st, p.id).ok, true);
    opened++;
  }
  assert.equal(opened, 3);
  while (positionCount(st, user, "P") <= POSITION_ACTIVE_MAX.P) {
    const donor = clubActive(st, user)
      .filter((p) => p.pos !== "P" && positionCount(st, user, p.pos) > POSITION_MIN[p.pos])
      .sort((a, b) => a.ovr - b.ovr || a.id - b.id)[0];
    assert.ok(donor, "need a surplus user body to make an extra punter");
    donor.pos = "P";
  }
  const userCount = rosterCount(st, user);
  const userPunters = positionCount(st, user, "P");
  const userSpace = teamCap(st, user).space;
  const userIds = clubActive(st, user).map((p) => p.id).sort((a, b) => a - b);
  assert.ok(userCount < ROSTER_LIMIT, "user is short so a refill would show");
  assert.ok(userPunters > POSITION_ACTIVE_MAX.P, "user is over the ceiling so a trim would show");

  refillCpuRostersAfterWaivers(st, new Rng(st.rngState));

  assert.equal(rosterCount(st, cpuShort), ROSTER_LIMIT, "short CPU club refilled to 53");
  assert.ok(teamCap(st, cpuShort).space >= 0, "short CPU club stayed under the cap");
  for (const pos of POSITIONS) {
    assert.ok(positionCount(st, cpuShort, pos) <= POSITION_ACTIVE_MAX[pos], `${pos} over the ceiling after refill`);
  }

  assert.equal(rosterCount(st, cpuCeil), ROSTER_LIMIT, "ceiling cut was refilled");
  assert.ok(positionCount(st, cpuCeil, "P") <= POSITION_ACTIVE_MAX.P, "punter ceiling applied");
  assert.ok(teamCap(st, cpuCeil).space >= 0, "ceiling club stayed under the cap");
  for (const pos of POSITIONS) {
    assert.ok(positionCount(st, cpuCeil, pos) <= POSITION_ACTIVE_MAX[pos], `${pos} over the ceiling`);
  }

  assert.equal(rosterCount(st, user), userCount, "user club was not refilled");
  assert.equal(positionCount(st, user, "P"), userPunters, "user club was not trimmed");
  assert.equal(teamCap(st, user).space, userSpace, "user cap was not touched");
  assert.deepEqual(
    clubActive(st, user).map((p) => p.id).sort((a, b) => a - b),
    userIds,
    "user roster was not touched",
  );
}

function reachUserGame(st: GameState) {
  let guard = 0;
  while (!userGame(st) && guard++ < 18) advance(st);
  const g = userGame(st);
  assert.ok(g);
  return g;
}

/** The two quarterbacks buildStarters will dress, and nobody else healthy at the position. */
function dressTwoQuarterbacks(st: GameState): [Player, Player] {
  const tid = st.userTeamId;
  const team = st.teams[tid];
  const active = clubActive(st, tid).filter((p) => p.pos === "QB" && p.injuryWeeks <= 0 && !isSat(team, p.id));
  assert.ok(active.length >= 2, "club has two healthy quarterbacks");
  const onChart = (team.depthChart.QB ?? [])
    .map((id) => active.find((p) => p.id === id))
    .filter((p): p is Player => !!p);
  const dressed = [...onChart, ...active.filter((p) => !onChart.includes(p))].slice(0, 2);
  assert.equal(dressed.length, 2);
  for (const p of clubActive(st, tid)) {
    if (p.pos === "QB" && !dressed.includes(p)) p.injuryWeeks = 8;
  }
  team.depthChart.QB = [dressed[0].id, dressed[1].id];
  return [dressed[0], dressed[1]];
}

/** User passes become sacks so a dressed quarterback actually leaves the game. */
function crushUserPassProtection(st: GameState): void {
  const tid = st.userTeamId;
  for (const p of st.players) {
    if (p.teamId === tid && (p.pos === "OT" || p.pos === "OG" || p.pos === "C")) {
      p.attrs.pbk = 1;
      p.attrs.str = 1;
    }
    if (p.teamId === tid && p.pos === "QB" && p.injuryWeeks <= 0 && p.status !== "ps") {
      p.attrs.awr = 1;
      p.attrs.agi = 1;
      p.attrs.acc = 1;
      p.attrs.spd = 1;
      p.durability = 99;
    }
    if (p.teamId !== tid && (p.pos === "EDGE" || p.pos === "DT")) {
      p.attrs.prs = 99;
      p.attrs.acc = 99;
    }
  }
}

/**
 * `nextAvailable` is inside the game. Force the sack check on user passes,
 * then the injury roll, until the requested dressed quarterbacks have left.
 * Any other injury roll is a no-op so the quarterback still in the unit stays.
 */
class ForceQuarterbackExits extends Rng {
  readonly gone = new Set<number>();
  constructor(seed: number, private readonly ids: readonly number[], private readonly stopAfter: number) {
    super(seed);
  }
  private from(fn: string): boolean {
    return (new Error().stack ?? "").includes(fn);
  }
  override chance(p: number): boolean {
    if (this.from("rollInGameInjury")) return this.gone.size < this.stopAfter;
    if (this.gone.size < this.stopAfter && this.from("passPlay")) {
      if (p <= 0) return false;
      // Crushed protection puts the sack check just under 0.29. Escape is 0.
      if (p > 0.2 && p <= 0.7) return true;
    }
    return super.chance(p);
  }
  override weighted<T>(items: readonly T[], weight: (item: T, i: number) => number): T {
    if (this.from("rollInGameInjury") && this.gone.size < this.stopAfter) {
      const rows = items as readonly { p?: Player; risk?: number }[];
      const hit = rows.find((c) => c?.p && typeof c.risk === "number" && this.ids.includes(c.p.id) && !this.gone.has(c.p.id));
      if (hit?.p) {
        this.gone.add(hit.p.id);
        return hit as T;
      }
      return { p: { id: -1 }, ctx: { out: { has: (id: number) => id === -1 } } } as T;
    }
    return super.weighted(items, weight);
  }
}

function attemptsOf(box: { players: { playerId: number; passAtt?: number; snaps: number }[] }, id: number) {
  return box.players.find((s) => s.playerId === id);
}

// One dressed quarterback leaves. The healthy one still in the unit stays the quarterback.
{
  const st = newGame({ seed: 12 });
  startRegularSeason(st);
  const g = reachUserGame(st);
  const tid = st.userTeamId;
  const team = st.teams[tid];
  const [starter, backup] = dressTwoQuarterbacks(st);
  const psQb = addBody(st, tid, "QB", 70);
  assert.equal(placeOnPs(st, psQb.id).ok, true);
  const satQb = addBody(st, tid, "QB", 68);
  assert.equal(sitPlayer(st, satQb.id).ok, true);
  crushUserPassProtection(st);
  const rng = new ForceQuarterbackExits(st.rngState, [starter.id, backup.id], 1);
  const result = simulateGame(st, g, rng, { playCaller: () => "pass" });
  assert.equal(rng.gone.size, 1, "one dressed quarterback left");
  const stayed = rng.gone.has(starter.id) ? backup : starter;
  const stayedLine = attemptsOf(result.box, stayed.id);
  assert.ok(stayedLine && ((stayedLine.passAtt ?? 0) > 0 || stayedLine.snaps > 0), "the healthy quarterback still plays");
  assert.equal(stayed.injuryWeeks, 0);
  assert.equal(psQb.status, "ps", "practice-squad quarterback stays down");
  assert.equal(isSat(team, satQb.id), true, "sat quarterback stays sat");
  for (const id of [psQb.id, satQb.id]) {
    const line = attemptsOf(result.box, id);
    assert.ok(!line || ((line.passAtt ?? 0) === 0 && line.snaps === 0), "emergency quarterback does not play");
  }
}

// Two quarterbacks are dressed and one leaves. The open slot stays empty, so a
// decided game does not hand attempts to the highest other healthy body.
{
  const st = newGame({ seed: 14 });
  startRegularSeason(st);
  const g = reachUserGame(st);
  const tid = st.userTeamId;
  const opp = g.homeId === tid ? g.awayId : g.homeId;
  const [starter, backup] = dressTwoQuarterbacks(st);
  const others = clubActive(st, tid).filter((p) => p.pos !== "QB");
  const plant = others[0];
  assert.ok(plant, "club has a non-quarterback");
  plant.ovr = 100;
  for (const p of others) if (p !== plant && p.ovr >= plant.ovr) p.ovr = 99;
  for (const p of st.players) {
    if (p.teamId === tid) {
      for (const k of Object.keys(p.attrs) as (keyof Player["attrs"])[]) p.attrs[k] = 1;
      if (p.pos === "QB" && p.injuryWeeks <= 0) p.durability = 99;
    } else if (p.teamId === opp) {
      for (const k of Object.keys(p.attrs) as (keyof Player["attrs"])[]) p.attrs[k] = 99;
    }
  }
  const rng = new ForceQuarterbackExits(st.rngState, [starter.id, backup.id], 1);
  const result = simulateGame(st, g, rng, { playCaller: () => "pass" });
  assert.equal(rng.gone.size, 1, "one dressed quarterback left");
  const stayed = rng.gone.has(starter.id) ? backup : starter;
  const userHome = g.homeId === tid;
  const userScore = userHome ? result.homeScore : result.awayScore;
  const oppScore = userHome ? result.awayScore : result.homeScore;
  assert.ok(oppScore - userScore >= 31, "the game is decided, so a filled second slot would throw");
  const stayedLine = attemptsOf(result.box, stayed.id);
  assert.ok(stayedLine && (stayedLine.passAtt ?? 0) > 0, "the healthy quarterback still throws");
  const plantLine = result.box.players.find((s) => s.playerId === plant.id);
  assert.ok(!plantLine || ((plantLine.passAtt ?? 0) === 0 && (plantLine.sacked ?? 0) === 0), "the other body does not fill the quarterback slot");
  for (const s of result.box.players) {
    if (s.teamId !== tid || ((s.passAtt ?? 0) <= 0 && (s.sacked ?? 0) <= 0)) continue;
    const p = st.players.find((x) => x.id === s.playerId);
    assert.equal(p?.pos, "QB", "no non-quarterback fills a quarterback slot");
  }
}

// The last healthy quarterback leaves. The empty room still uses the practice-squad quarterback.
{
  const st = newGame({ seed: 13 });
  startRegularSeason(st);
  const g = reachUserGame(st);
  const tid = st.userTeamId;
  const [starter, other] = dressTwoQuarterbacks(st);
  other.injuryWeeks = 8;
  const punter = clubActive(st, tid).find((p) => p.pos === "P");
  assert.ok(punter);
  punter.ovr = 99;
  const psQb = addBody(st, tid, "QB", 72);
  assert.equal(placeOnPs(st, psQb.id).ok, true);
  crushUserPassProtection(st);
  const rng = new ForceQuarterbackExits(st.rngState, [starter.id], 1);
  const result = simulateGame(st, g, rng, { playCaller: () => "pass" });
  assert.equal(rng.gone.size, 1, "the quarterback room went empty");
  const row = attemptsOf(result.box, psQb.id);
  assert.ok(row && (row.passAtt ?? 0) > 0, "practice-squad quarterback takes the snaps");
  const punterRow = attemptsOf(result.box, punter.id);
  assert.ok(!punterRow || (punterRow.passAtt ?? 0) === 0, "punter does not throw");
  for (const s of result.box.players) {
    if ((s.passAtt ?? 0) <= 0 || s.teamId !== tid) continue;
    const p = st.players.find((x) => x.id === s.playerId);
    assert.equal(p?.pos, "QB");
  }
}

console.log("ok    roster management");
