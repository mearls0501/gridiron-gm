/**
 * Regression: void-year proration / acceleration and unused-cap carryover.
 *
 * Year-0 generation has no void years and no carryover, so calibrate /
 * statcheck stay byte-identical. Run: npx tsx lib/core/capMechanics.test.ts
 */
import assert from "node:assert/strict";
import { newGame } from "./newGame";
import { makeContract } from "./generate";
import { Rng } from "./rng";
import {
  applyCapCarryover, capHit, captureCapCarryover, deadMoney, remainingBonusProration,
  teamCap,
} from "./select";
import { Player } from "./types";
import {
  addVoidYearsPreview, applyVoidYears, expireContracts, MAX_VOID_YEARS, runCpuVoidYears,
} from "./offseason/contracts";
import { teamOutlook } from "./frontOffice";

function clubActive(st: ReturnType<typeof newGame>, teamId: number) {
  return st.players.filter((p) => p.teamId === teamId && !p.retired && !p.prospect && p.contract);
}

function plantDeal(st: ReturnType<typeof newGame>, teamId: number, years = 3): Player {
  const p = clubActive(st, teamId).slice().sort((a, b) => b.ovr - a.ovr)[0];
  assert.ok(p && p.contract, "need a rostered player");
  p.age = 26;
  p.retired = false;
  p.prospect = false;
  p.contract = makeContract(new Rng(1), 10_000_000, years, st.season, 1);
  return p;
}

function leftover(c: NonNullable<Player["contract"]>): number {
  return remainingBonusProration(c);
}

function ok(label: string) { console.log("ok   ", label); }

// (1) Year-0 generation: no void years, carryover 0, leftover matches old shape.
{
  const st = newGame({ seed: 21 });
  for (const t of st.teams) {
    assert.equal(t.capCarryover ?? 0, 0, `${t.abbr} year-0 carryover`);
  }
  let any = 0;
  for (const p of st.players) {
    if (!p.contract) continue;
    any++;
    assert.equal(p.contract.voidYears ?? 0, 0, "generated deal has no voids");
    assert.ok(p.contract.bonusProrationYears <= p.contract.years);
    const elapsed = p.contract.years - p.contract.yearsRemaining;
    const capped = Math.max(0, Math.min(
      p.contract.bonusProrationYears - elapsed, p.contract.yearsRemaining
    ));
    const uncharged = Math.max(0, p.contract.bonusProrationYears - elapsed);
    assert.equal(uncharged, capped, "uncharged equals old capped leftover on generated deals");
  }
  assert.ok(any > 0);
  ok("year-0 generation has no voids and no carryover");
}

// (2) Proration math: adding N void years lowers this-year hit; leftover conserved.
{
  const st = newGame({ seed: 22 });
  const p = plantDeal(st, st.userTeamId, 3);
  const beforeLeftover = leftover(p.contract!);
  const oldHit = capHit(p.contract);
  const oldDead = deadMoney(p.contract);
  const preview = addVoidYearsPreview(st, st.userTeamId, p);
  assert.equal(preview.ok, true, preview.reason ?? "preview");
  assert.equal(preview.add, MAX_VOID_YEARS);
  assert.ok(preview.savings > 0, "void years must free cap this year");
  const r = applyVoidYears(st, st.userTeamId, p.id);
  assert.equal(r.ok, true, r.reason ?? "apply");
  assert.equal(p.contract!.voidYears, MAX_VOID_YEARS);
  assert.equal(p.contract!.yearsRemaining, 3, "real term unchanged");
  assert.equal(p.contract!.baseSalary.length, 3);
  const newHit = capHit(p.contract);
  assert.ok(newHit < oldHit);
  assert.equal(newHit, preview.newHit);
  assert.ok(Math.abs(leftover(p.contract!) - beforeLeftover) < 2, "leftover bonus conserved");
  assert.ok(deadMoney(p.contract) >= oldDead - 1, "cut cost still includes the leftover bonus");
  ok("void-year proration lowers this-year hit; leftover conserved");
}

// (3) Acceleration on void: remaining proration lands on deadCap when the deal voids.
{
  const st = newGame({ seed: 23 });
  const p = plantDeal(st, st.userTeamId, 2);
  const teamId = st.userTeamId;
  assert.equal(applyVoidYears(st, teamId, p.id).ok, true);
  const leftoverAtSign = leftover(p.contract!);
  const annual = leftoverAtSign / (p.contract!.yearsRemaining + MAX_VOID_YEARS);
  st.teams[teamId].deadCap = 0;

  expireContracts(st);
  assert.ok(p.contract, "still on the books after year 1");
  assert.equal(p.contract!.yearsRemaining, 1);
  assert.equal(st.teams[teamId].deadCap, 0, "no acceleration until the deal voids");

  expireContracts(st);
  assert.equal(p.contract, null, "voided");
  assert.equal(p.teamId, null);
  const expected = Math.round(annual * MAX_VOID_YEARS);
  assert.ok(
    Math.abs(st.teams[teamId].deadCap - expected) <= 2,
    `dead ${st.teams[teamId].deadCap} vs leftover voids ${expected}`
  );
  ok("void-year remainder accelerates onto deadCap");
}

// (4) Carryover across a rollover: unused space is stored and added next year.
{
  const st = newGame({ seed: 24 });
  const teamId = st.userTeamId;
  const before = teamCap(st, teamId);
  assert.equal(before.carryover, 0);
  const snap = captureCapCarryover(st);
  assert.equal(snap[teamId], Math.max(0, before.space));
  applyCapCarryover(st, snap);
  const after = teamCap(st, teamId);
  assert.equal(after.carryover, snap[teamId]);
  assert.equal(after.space, before.space + snap[teamId]);
  assert.equal(after.cap, before.cap);
  assert.equal(after.committed, before.committed);
  ok("carryover adds unused room in full");
}

// (5) Old save shape: missing voidYears / capCarryover still acts.
{
  const st = newGame({ seed: 25 });
  const p = plantDeal(st, st.userTeamId, 4);
  const raw = JSON.parse(JSON.stringify(p.contract)) as Player["contract"];
  assert.ok(raw);
  delete raw.voidYears;
  p.contract = raw;
  const before = capHit(p.contract);
  const r = applyVoidYears(st, st.userTeamId, p.id);
  assert.equal(r.ok, true, r.reason ?? "old contract voids");
  assert.ok(capHit(p.contract) < before);
  delete st.teams[st.userTeamId].capCarryover;
  const cap = teamCap(st, st.userTeamId);
  assert.equal(cap.carryover, 0);
  ok("old contract / team fields load");
}

// (6) CPU voids only when contend AND tight; user club is skipped.
{
  const st = newGame({ seed: 26 });
  const user = plantDeal(st, st.userTeamId, 4);
  const beforeUser = user.contract!.voidYears ?? 0;

  const cpu = st.teams.find((t) => t.id !== st.userTeamId);
  assert.ok(cpu);
  const planted = plantDeal(st, cpu.id, 4);
  const { posture } = teamOutlook(st, cpu.id);
  cpu.deadCap = Math.round(teamCap(st, cpu.id).cap * 0.95);
  runCpuVoidYears(st);
  if (posture === "contend") {
    assert.ok((planted.contract!.voidYears ?? 0) > 0, "contend + tight adds voids");
  } else {
    assert.equal(planted.contract!.voidYears ?? 0, 0, "non-contend does not add voids");
  }
  assert.equal(user.contract!.voidYears ?? 0, beforeUser, "user club is not auto-voided");
  ok("CPU voids gated on contend + tight cap");
}

console.log("\ncapMechanics: all passed");
