/**
 * BUG-D. Start the Season used to release the user club for cap and, when
 * that could not get under, rewrite the largest deals to a 1-year league
 * minimum ($895K). The GM cuts his own cap. The 53-man trim stays.
 * CPU clubs still take both passes.
 *
 * Run: npx tsx lib/core/startSeasonCap.test.ts
 */
import assert from "node:assert/strict";
import { newGame } from "./newGame";
import { Rng } from "./rng";
import { defaultGuaranteedYears, makeContract } from "./generate";
import { advanceOffseason } from "./offseason";
import { enforceCap, reconcileRoster } from "./offseason/contracts";
import { capHit, capSavingsFromCut, deadMoney, formatMoney, rosterCount, rosterIssues, teamCap } from "./select";
import { LEAGUE_MINIMUM, PRESEASON_WEEKS, ROSTER_LIMIT, type GameState, type Player } from "./types";
import { autoFixComplianceToast, hubAdvanceBlock } from "../view/seasonStartGate";

function ok(label: string) { console.log("ok   ", label); }

function rostered(st: GameState, teamId: number): Player[] {
  return st.players.filter((p) => p.teamId === teamId && p.contract && !p.retired && !p.prospect);
}

function atCutdownDoor(st: GameState): void {
  st.phase = "offseason-final";
  st.preseason = {
    season: st.season + 1,
    week: PRESEASON_WEEKS,
    games: [],
    camp: {},
    userPlan: "sit",
  };
}

/** Push `teamId` through the hole the 2052 book had: megadeals the release
 *  pass cannot cut, plus one minimum body it would cut first. */
function plantOverCap(st: GameState, teamId: number): { stars: Player[]; camp: Player } {
  const roster = rostered(st, teamId);
  const stars = roster.slice().sort((a, b) => b.ovr - a.ovr).slice(0, 5);
  const camp = roster.filter((p) => p.ovr < 62 && !stars.includes(p))[0];
  assert.ok(camp, "need a sub-62 body who is not one of the five stars");
  const r = new Rng(99);
  for (const p of stars) {
    p.contract = makeContract(r, 40_000_000, 5, st.season, defaultGuaranteedYears(40_000_000, 5));
    assert.equal(capHit(p.contract), 37_870_000);
    assert.equal(deadMoney(p.contract), 115_200_000);
    assert.ok(capSavingsFromCut(p.contract) < 0);
  }
  camp.contract = makeContract(r, LEAGUE_MINIMUM, 1, st.season, 0);
  assert.equal(capHit(camp.contract), 895_000);
  assert.ok(capSavingsFromCut(camp.contract) > 0);
  const room = teamCap(st, teamId).space;
  st.teams[teamId].deadCap = (st.teams[teamId].deadCap ?? 0) + Math.max(0, room) + 900_000_000;
  assert.ok(teamCap(st, teamId).space < 0);
  return { stars, camp };
}

function dealSnapshot(p: Player): string {
  return JSON.stringify(p.contract);
}

// User seat at the Start the Season door. No rewrite, no cap waive, blocked.
{
  const st = newGame({ seed: 7 });
  const uid = st.userTeamId;
  atCutdownDoor(st);
  const { stars, camp } = plantOverCap(st, uid);
  const deals = new Map(stars.map((p) => [p.id, dealSnapshot(p)]));
  const campDeal = dealSnapshot(camp);
  const overage = formatMoney(-teamCap(st, uid).space);
  const block = hubAdvanceBlock(st.phase, rosterIssues(st, uid));
  assert.ok(block, "Start the Season is blocked");
  assert.match(block!, /Over the salary cap by /);
  assert.ok(block!.includes(overage), `message should name ${overage}, got ${block}`);
  assert.equal(rosterCount(st, uid), ROSTER_LIMIT);

  const msg = advanceOffseason(st);
  assert.match(msg, /preseason begins/);
  for (const p of stars) {
    assert.equal(p.teamId, uid, `${p.lastName} was waived`);
    assert.equal(dealSnapshot(p), deals.get(p.id));
    assert.notEqual(capHit(p.contract), 895_000);
  }
  assert.equal(camp.teamId, uid, "the minimum body was a phantom waive");
  assert.equal(dealSnapshot(camp), campDeal);
  const abbr = st.teams[uid].abbr;
  assert.ok(!st.log.some((e) => e.text.includes(`${abbr} restructured`) && e.text.includes("to the league minimum")));
  assert.ok(!(st.waivers ?? []).some((w) => w.originalTeamId === uid && stars.concat(camp).some((p) => p.id === w.playerId)));
  assert.ok(teamCap(st, uid).space < 0, "the book is still the GM's to cut");
  const after = hubAdvanceBlock(st.phase, rosterIssues(st, uid));
  assert.ok(after, "preseason still blocks the same over-cap book");
  assert.ok(after!.includes(formatMoney(-teamCap(st, uid).space)));
}
ok("over-cap user at Start the Season: no rewrite, no phantom waive, blocked");

// Same hole on a CPU club: the release pass and the minimum rewrite stay.
{
  const st = newGame({ seed: 7 });
  const cpu = st.teams.find((t) => t.id !== st.userTeamId)!;
  atCutdownDoor(st);
  const { stars, camp } = plantOverCap(st, cpu.id);
  reconcileRoster(st, cpu.id, new Rng(st.rngState), ROSTER_LIMIT, true);
  assert.equal(camp.teamId, null, "CPU still waives the positive-savings minimum");
  for (const p of stars) {
    assert.equal(p.teamId, cpu.id, `${p.lastName} should stay and be rewritten`);
    assert.equal(p.contract?.years, 1);
    assert.equal(p.contract?.yearsRemaining, 1);
    assert.equal(capHit(p.contract), 895_000);
    assert.equal(p.contract?.baseSalary[0], 795_000);
    assert.equal(p.contract?.signingBonus, 100_000);
  }
  assert.ok(st.log.some((e) => e.text.includes(`${cpu.abbr} restructured`) && e.text.includes("to the league minimum")));
}
ok("CPU cutdown still releases for cap and rewrites the minimum");

// enforceCap's sort is the same function the waiver backstop uses on CPU clubs.
{
  const st = newGame({ seed: 7 });
  const cpu = st.teams.find((t) => t.id !== st.userTeamId)!;
  const roster = rostered(st, cpu.id);
  const star = roster.slice().sort((a, b) => b.ovr - a.ovr)[0];
  const camp = roster.slice().sort((a, b) => a.ovr - b.ovr)[0];
  star.contract = {
    years: 3, yearsRemaining: 3,
    baseSalary: [20_000_000, 20_000_000, 20_000_000],
    signingBonus: 0, bonusProrationYears: 0,
    signedSeason: st.season, guaranteedYears: 0,
  };
  camp.ovr = 62;
  camp.contract = makeContract(new Rng(1), LEAGUE_MINIMUM, 1, st.season, 0);
  assert.ok(capSavingsFromCut(star.contract) / Math.pow(star.ovr - 45, 1.6)
    > capSavingsFromCut(camp.contract) / Math.pow(62 - 45, 1.6));
  const room = teamCap(st, cpu.id).space;
  st.teams[cpu.id].deadCap = (st.teams[cpu.id].deadCap ?? 0) + Math.max(0, room) + 5_000_000;
  enforceCap(st, cpu.id);
  assert.equal(star.teamId, null, "highest savings/cost is still the CPU cut");
  assert.equal(camp.teamId, cpu.id);
}
ok("CPU enforceCap sort is unchanged");

// The 53-man trim still cuts the user's lowest-worth surplus. It does not
// touch the deals that stay.
{
  const st = newGame({ seed: 7 });
  const uid = st.userTeamId;
  atCutdownDoor(st);
  const { stars } = plantOverCap(st, uid);
  const deals = new Map(stars.map((p) => [p.id, dealSnapshot(p)]));
  const fas = st.players.filter((p) => p.teamId === null && !p.retired && !p.prospect);
  const extras: Player[] = [];
  const r = new Rng(3);
  for (let i = 0; i < 4; i++) {
    const p = fas[i];
    p.teamId = uid;
    p.pos = "WR";
    p.ovr = 40;
    p.pot = 40;
    p.age = 34;
    p.draftedRound = null;
    p.contract = makeContract(r, LEAGUE_MINIMUM, 1, st.season, 0);
    extras.push(p);
  }
  assert.equal(rosterCount(st, uid), ROSTER_LIMIT + 4);
  reconcileRoster(st, uid, new Rng(st.rngState), ROSTER_LIMIT, true);
  assert.equal(rosterCount(st, uid), ROSTER_LIMIT);
  for (const p of extras) assert.equal(p.teamId, null, `${p.lastName} should be the 53-man cut`);
  for (const p of stars) {
    assert.equal(p.teamId, uid);
    assert.equal(dealSnapshot(p), deals.get(p.id));
  }
  assert.ok(!st.log.some((e) => e.text.includes("to the league minimum") && e.text.startsWith(st.teams[uid].abbr)));
  assert.ok(teamCap(st, uid).space < 0);
  const block = hubAdvanceBlock(st.phase, rosterIssues(st, uid));
  assert.ok(block?.includes(formatMoney(-teamCap(st, uid).space)));
}
ok("user 53-man trim still cuts lowest worth and leaves the deals");

// The gate matches preseason: over the cap names the overage, a short
// roster blocks only once the season is the lock, and the regular season
// is not this door.
{
  const over = { kind: "overCap" as const, message: "Over the salary cap by $12.50M" };
  const under = { kind: "underLimit" as const, message: "Roster under the limit: 50/53" };
  const heavy = { kind: "overLimit" as const, message: "Roster over the limit: 91/90" };
  assert.equal(hubAdvanceBlock("offseason-final", [over]), over.message);
  assert.equal(hubAdvanceBlock("preseason", [over]), over.message);
  assert.equal(hubAdvanceBlock("offseason-final", [under]), null);
  assert.equal(hubAdvanceBlock("preseason", [under]), "Fix your roster before the season starts.");
  assert.equal(hubAdvanceBlock("offseason-final", [heavy]), "Fix your roster before the season starts.");
  assert.equal(hubAdvanceBlock("regular", [over]), null);
  assert.equal(hubAdvanceBlock("offseason-fa", [over]), null);
  assert.equal(hubAdvanceBlock("offseason-final", []), null);

  const still = autoFixComplianceToast(-12_500_000);
  assert.match(still, /Still over the salary cap by \$12\.5M/);
  assert.match(still, /\/finances/);
  assert.equal(autoFixComplianceToast(1_000), "Roster and cap brought back into compliance");
}
ok("Start the Season block names the overage; Auto-fix does not claim a book it left over");

console.log("startSeasonCap: ok");
