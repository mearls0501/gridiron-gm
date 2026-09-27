/**
 * Retirement accelerates remaining proration + guaranteed base onto dead cap.
 *
 * Same figure as a waiver clear (`deadMoney`). Posted at the retirement,
 * then re-posted after `clearDeadCap` so it is the new league year's dead
 * money. Cuts, expires, and a player who does not retire do not take this path.
 *
 * Run: npx tsx lib/core/retirementDead.test.ts
 */
import assert from "node:assert/strict";
import { newGame } from "./newGame";
import { Rng } from "./rng";
import { clearDeadCap, deadMoney } from "./select";
import { Contract, Player, PRACTICE_SQUAD_LIMIT } from "./types";
import { applyVoidYears, cutPlayer, expireContracts } from "./offseason/contracts";
import { runFreeAgencyOpen } from "./offseason";
import {
  chargeRetirementAcceleration, reapplyRetirementDead, runProgression,
} from "./offseason/progression";
import { placeOnPs } from "./rosterStatus";
import { resolveWaivers } from "./waivers";

function ok(label: string) { console.log("ok   ", label); }

function rostered(st: ReturnType<typeof newGame>, teamId: number): Player {
  const p = st.players.find((x) => x.teamId === teamId && !x.retired && !x.prospect && x.contract);
  assert.ok(p, "need a rostered player");
  return p;
}

function silenceExcept(st: ReturnType<typeof newGame>, keep: Player): void {
  for (const p of st.players) {
    if (p !== keep) p.retired = true;
  }
}

function install(p: Player, c: Contract): void {
  p.contract = c;
  p.retired = false;
  p.prospect = false;
}

/** Independent of `deadMoney`: remaining proration + remaining guaranteed base. */
function prorationPlusGuarantees(c: Contract): { proration: number; guaranteed: number; total: number } {
  const elapsed = Math.max(0, c.years - c.yearsRemaining);
  const annual = c.bonusProrationYears > 0 ? c.signingBonus / c.bonusProrationYears : 0;
  const proration = annual * Math.max(0, c.bonusProrationYears - elapsed);
  let guaranteed = 0;
  for (let i = 0; i < Math.min(c.guaranteedYears, c.yearsRemaining); i++) {
    guaranteed += c.baseSalary[i] ?? 0;
  }
  return { proration, guaranteed, total: Math.round(proration + guaranteed) };
}

function fatDeal(): Contract {
  return {
    years: 4,
    yearsRemaining: 4,
    baseSalary: [1_000_000, 2_000_000, 3_000_000, 4_000_000],
    signingBonus: 10_000_000,
    bonusProrationYears: 5,
    signedSeason: 2026,
    guaranteedYears: 2,
    voidYears: 1,
  };
}

// (1) Retire with leftover bonus and guarantees → deadMoney, both pieces.
{
  const st = newGame({ seed: 41 });
  const teamId = st.userTeamId;
  const p = rostered(st, teamId);
  install(p, fatDeal());
  const parts = prorationPlusGuarantees(p.contract!);
  assert.ok(parts.proration > 0, "leftover proration");
  assert.ok(parts.guaranteed > 0, "guaranteed base");
  assert.equal(deadMoney(p.contract), parts.total);
  st.teams[teamId].deadCap = 0;
  st.teams[teamId].retirementDeadPending = 0;

  const dead = chargeRetirementAcceleration(st, p);
  assert.equal(dead, parts.total);
  assert.equal(st.teams[teamId].deadCap, parts.total);
  assert.equal(st.teams[teamId].retirementDeadPending, parts.total);
  assert.equal(p.contract?.signingBonus, 10_000_000, "charge happens before the contract is cleared");
  assert.equal(p.teamId, teamId);
  for (const t of st.teams) {
    if (t.id === teamId) continue;
    assert.equal(t.deadCap, 0);
    assert.equal(t.retirementDeadPending ?? 0, 0);
  }
  ok("retirement charges proration + guaranteed base via deadMoney");
}

// (2) Zero leftover → no charge.
{
  const st = newGame({ seed: 42 });
  const teamId = st.userTeamId;
  const p = rostered(st, teamId);
  install(p, {
    years: 2,
    yearsRemaining: 2,
    baseSalary: [1_000_000, 1_000_000],
    signingBonus: 0,
    bonusProrationYears: 2,
    signedSeason: 2026,
    guaranteedYears: 0,
  });
  assert.equal(deadMoney(p.contract), 0);
  st.teams[teamId].deadCap = 4_000_000;
  const before = st.teams[teamId].deadCap;
  const dead = chargeRetirementAcceleration(st, p);
  assert.equal(dead, 0);
  assert.equal(st.teams[teamId].deadCap, before);
  assert.equal(st.teams[teamId].retirementDeadPending ?? 0, 0);
  ok("retirement with zero leftover does not charge");
}

// (3) No club (street FA, not on waivers) → no charge, even with a rich deal.
{
  const st = newGame({ seed: 43 });
  const p = rostered(st, st.userTeamId);
  install(p, fatDeal());
  p.teamId = null;
  st.waivers = [];
  for (const t of st.teams) t.deadCap = 0;
  assert.equal(chargeRetirementAcceleration(st, p), 0);
  assert.ok(st.teams.every((t) => t.deadCap === 0 && (t.retirementDeadPending ?? 0) === 0));
  ok("street free agent retirement has no club to charge");
}

// (4) Waived body with no teamId still charges the original club.
{
  const st = newGame({ seed: 44 });
  const teamId = st.userTeamId;
  const p = rostered(st, teamId);
  install(p, fatDeal());
  p.teamId = null;
  st.waivers = [{ playerId: p.id, originalTeamId: teamId }];
  st.teams[teamId].deadCap = 0;
  const dead = chargeRetirementAcceleration(st, p);
  assert.equal(dead, deadMoney(fatDeal()));
  assert.equal(st.teams[teamId].deadCap, dead);
  ok("waiver-wire retirement charges the original club");
}

// (5) clearDeadCap wipes the post; reapply puts the same dollars back
//     and leaves prior-year (in-season) dead wiped.
{
  const st = newGame({ seed: 45 });
  const teamId = st.userTeamId;
  const p = rostered(st, teamId);
  install(p, fatDeal());
  const inSeason = 7_000_000;
  st.teams[teamId].deadCap = inSeason;
  const dead = chargeRetirementAcceleration(st, p);
  assert.equal(st.teams[teamId].deadCap, inSeason + dead);
  assert.equal(st.teams[teamId].retirementDeadPending, dead);

  clearDeadCap(st);
  assert.equal(st.teams[teamId].deadCap, 0, "annual wipe drops the closing book");
  assert.equal(st.teams[teamId].retirementDeadPending, dead, "retirement figure survives the wipe");

  reapplyRetirementDead(st);
  assert.equal(st.teams[teamId].deadCap, dead);
  assert.equal(st.teams[teamId].retirementDeadPending, 0);

  reapplyRetirementDead(st);
  assert.equal(st.teams[teamId].deadCap, dead, "second reapply does not double-charge");
  ok("retirement dead survives clearDeadCap; in-season dead does not");
}

// (6) runProgression wires the charge, then clears the contract.
{
  const st = newGame({ seed: 46 });
  const teamId = st.userTeamId;
  const p = rostered(st, teamId);
  install(p, fatDeal());
  p.age = 45;
  p.ovr = 40;
  p.peakAge = 27;
  p.pot = 40;
  p.ceiling = 40;
  silenceExcept(st, p);
  const expected = deadMoney(p.contract);
  st.teams[teamId].deadCap = 0;
  const snap = JSON.parse(JSON.stringify(st)) as typeof st;

  let retired = false;
  for (let seed = 1; seed <= 40 && !retired; seed++) {
    const s = JSON.parse(JSON.stringify(snap)) as typeof st;
    const who = s.players.find((x) => x.id === p.id)!;
    const report = runProgression(s, new Rng(seed));
    const row = report.retirements.find((r) => r.player.id === p.id);
    if (!row) continue;
    retired = true;
    assert.equal(row.dead, expected);
    assert.equal(who.contract, null);
    assert.equal(who.teamId, null);
    assert.equal(who.retired, true);
    assert.equal(s.teams[teamId].deadCap, expected);
    assert.equal(s.teams[teamId].retirementDeadPending, expected);
  }
  assert.ok(retired, "an old rostered player retired inside the seed search");
  ok("runProgression charges deadMoney before clearing the contract");
}

// (7) A player who does not retire is untouched. Expire and waiver clears
//     still use their own rules and do not set retirementDeadPending.
{
  const st = newGame({ seed: 47 });
  const teamId = st.userTeamId;
  const p = rostered(st, teamId);
  install(p, fatDeal());
  p.age = 22;
  p.ovr = 80;
  p.peakAge = 27;
  silenceExcept(st, p);
  const contract = p.contract;
  st.teams[teamId].deadCap = 0;
  const report = runProgression(st, new Rng(1));
  assert.equal(report.retirements.length, 0);
  assert.equal(p.retired, false);
  assert.equal(p.contract, contract);
  assert.equal(p.teamId, teamId);
  assert.equal(st.teams[teamId].deadCap, 0);
  assert.equal(st.teams[teamId].retirementDeadPending ?? 0, 0);
  ok("non-retirement progression does not charge");
}

{
  const st = newGame({ seed: 48 });
  const teamId = st.userTeamId;
  const p = rostered(st, teamId);
  p.age = 26;
  p.retired = false;
  p.prospect = false;
  p.contract = {
    years: 2,
    yearsRemaining: 2,
    baseSalary: [2_000_000, 2_000_000],
    signingBonus: 8_000_000,
    bonusProrationYears: 2,
    signedSeason: st.season,
    guaranteedYears: 1,
    voidYears: 0,
  };
  assert.equal(applyVoidYears(st, teamId, p.id).ok, true);
  const leftoverAtSign = (() => {
    const c = p.contract!;
    const annual = c.signingBonus / c.bonusProrationYears;
    return annual * Math.max(0, c.bonusProrationYears - (c.years - c.yearsRemaining));
  })();
  const voids = p.contract!.voidYears ?? 0;
  const annual = leftoverAtSign / (p.contract!.yearsRemaining + voids);
  st.teams[teamId].deadCap = 0;
  st.teams[teamId].retirementDeadPending = 0;
  expireContracts(st);
  assert.ok(p.contract, "void deal still live after one year");
  assert.equal(p.retired, false);
  assert.equal(st.teams[teamId].deadCap, 0);
  expireContracts(st);
  assert.equal(p.contract, null);
  const expected = Math.round(annual * voids);
  assert.ok(Math.abs(st.teams[teamId].deadCap - expected) <= 2, `void expire ${st.teams[teamId].deadCap} vs ${expected}`);
  assert.equal(st.teams[teamId].retirementDeadPending ?? 0, 0);
  ok("void expire still charges leftover proration only, not the retirement path");
}

{
  const st = newGame({ seed: 49 });
  const teamId = st.userTeamId;
  const extras = st.players.filter((p) => p.teamId === teamId && !p.retired && !p.prospect && !p.status);
  for (let i = 0; i < PRACTICE_SQUAD_LIMIT; i++) {
    extras[i].ovr = 80;
    assert.equal(placeOnPs(st, extras[i].id).ok, true);
  }
  const p = extras[PRACTICE_SQUAD_LIMIT];
  p.pos = "WR";
  p.ovr = 20;
  p.pot = 20;
  p.ceiling = 20;
  p.age = 29;
  p.draftedRound = null;
  install(p, fatDeal());
  const expected = deadMoney(p.contract);
  st.teams[teamId].deadCap = 0;
  st.teams[teamId].retirementDeadPending = 0;
  assert.equal(cutPlayer(st, p.id).ok, true);
  assert.equal(st.teams[teamId].deadCap, 0, "a cut does not charge until he clears");
  resolveWaivers(st);
  assert.equal(p.contract, null);
  assert.equal(st.teams[teamId].deadCap, expected);
  assert.equal(st.teams[teamId].retirementDeadPending ?? 0, 0);
  ok("waiver clear still charges deadMoney and does not take the retirement path");
}

// (8) FA open: wipe, then the retirement figure is what the opening book keeps.
{
  const st = newGame({ seed: 50 });
  const teamId = st.userTeamId;
  const p = rostered(st, teamId);
  install(p, fatDeal());
  const dead = chargeRetirementAcceleration(st, p);
  p.retired = true;
  p.teamId = null;
  p.contract = null;
  st.teams[teamId].deadCap += 7_000_000;
  for (const q of st.players) {
    if (!q.contract) continue;
    q.contract.voidYears = 0;
    q.contract.yearsRemaining = Math.max(2, q.contract.yearsRemaining);
    q.contract.years = Math.max(q.contract.years, q.contract.yearsRemaining);
    while (q.contract.baseSalary.length < q.contract.yearsRemaining) q.contract.baseSalary.push(1_000_000);
    q.contract.bonusProrationYears = Math.min(q.contract.bonusProrationYears, q.contract.years);
  }
  runFreeAgencyOpen(st);
  assert.equal(st.teams[teamId].deadCap, dead);
  assert.equal(st.teams[teamId].retirementDeadPending ?? 0, 0);
  ok("runFreeAgencyOpen keeps retirement dead and wipes the prior-year extra");
}
