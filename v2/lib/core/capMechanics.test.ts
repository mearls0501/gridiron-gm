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
  startSeason, teamCap,
} from "./select";
import { Player, salaryCap } from "./types";
import {
  addVoidYearsPreview, applyVoidYears, expireContracts, MAX_VOID_YEARS, runCpuVoidYears,
  spendToFloor,
} from "./offseason/contracts";
import { payroll, SPEND_FLOOR, spendBudget, targetSpend, teamOutlook } from "./frontOffice";
import { acceptGmChair } from "./owner";
import { advance } from "./season/engine";
import { advanceOffseason, isOffseason } from "./offseason";

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

// (7) Zero carryover: spendBudget is the budget those bids already use.
{
  const st = newGame({ seed: 42 });
  const cpu = st.teams.find((t) => t.id !== st.userTeamId);
  assert.ok(cpu);
  assert.equal(cpu.capCarryover ?? 0, 0);
  assert.equal(st.teams[st.userTeamId].capCarryover ?? 0, 0);
  for (const teamId of [st.userTeamId, cpu.id]) {
    const posture = teamOutlook(st, teamId).posture;
    const cap = teamCap(st, teamId).cap;
    assert.equal(
      spendBudget(st, teamId, posture),
      targetSpend(st, teamId, posture) * cap,
      `${st.teams[teamId].abbr} zero-carryover budget`,
    );
  }
  ok("zero carryover spendBudget is today's target times the cap");
}

// (8) A carried stock raises the CPU budget by the whole field. The ceiling does not move.
{
  const st = newGame({ seed: 42 });
  const cpu = st.teams.find((t) => t.id !== st.userTeamId);
  assert.ok(cpu);
  const posture = teamOutlook(st, cpu.id).posture;
  const cap = teamCap(st, cpu.id).cap;
  const today = targetSpend(st, cpu.id, posture) * cap;
  cpu.capCarryover = 200_000_000;
  assert.equal(teamCap(st, cpu.id).cap, cap, "ceiling unchanged");
  assert.equal(spendBudget(st, cpu.id, posture), today + 200_000_000);
  assert.ok(spendBudget(st, cpu.id, posture) > today);
  ok("carryover raises the CPU spend budget by the full stock");
}

// (9) The floor does not spend the stock. A later edit that only touches spendToFloor is not this fix.
{
  const st = newGame({ seed: 42 });
  const cpu = st.teams.find(
    (t) => t.id !== st.userTeamId && payroll(st, t.id) >= teamCap(st, t.id).cap * SPEND_FLOOR,
  );
  assert.ok(cpu, "need a CPU club already above the spending floor");
  cpu.capCarryover = 200_000_000;
  const beforePay = payroll(st, cpu.id);
  spendToFloor(st, cpu.id, new Rng(1));
  assert.equal(payroll(st, cpu.id), beforePay);
  assert.equal(cpu.capCarryover, 200_000_000);
  ok("spendToFloor leaves payroll and carryover unchanged above the floor");
}

// (10) The chair switch is an id write. Carryover stays on the club.
{
  const st = newGame({ seed: 42 });
  const sf = st.teams.find((t) => t.abbr === "SF");
  const bal = st.teams.find((t) => t.abbr === "BAL");
  assert.ok(sf && bal);
  assert.equal(sf.id, 28);
  assert.equal(bal.id, 19);
  if (st.userTeamId === sf.id || st.userTeamId === bal.id) {
    const other = st.teams.find((t) => t.id !== sf.id && t.id !== bal.id);
    assert.ok(other);
    st.userTeamId = other.id;
  }
  const fromId = st.userTeamId;
  st.phase = "offseason-tag";
  sf.capCarryover = 1_847_600_000;
  st.teams[fromId].capCarryover = 40_000_000;
  bal.capCarryover = 12_000_000;
  st.forcedMove = { fromTeamId: fromId, season: st.season, openChairs: [sf.id] };
  const r = acceptGmChair(st, sf.id);
  assert.equal(r.ok, true, r.reason ?? "accept");
  assert.equal(st.userTeamId, sf.id);
  assert.equal(sf.capCarryover, 1_847_600_000);
  assert.equal(st.teams[fromId].capCarryover, 40_000_000);
  assert.equal(bal.capCarryover, 12_000_000);
  ok("acceptGmChair inherits carryover and does not move it");
}

// (11) The cliff stays visible. Replacing the stock with a sliver opens a huge hole. Not a reconcileRoster test.
{
  const st = newGame({ seed: 42 });
  st.season = 2051;
  st.history.length = 26;
  const cpu = st.teams.find((t) => t.id !== st.userTeamId);
  assert.ok(cpu);
  assert.equal(st.teams[cpu.id]?.id, cpu.id, "capture index is the club id");
  cpu.capCarryover = 863_100_000;
  const info = teamCap(st, cpu.id);
  cpu.deadCap = 2_009_400_000 - (info.committed - info.dead);
  const planted = teamCap(st, cpu.id);
  assert.equal(planted.cap, salaryCap(2051, 2051 - 26));
  assert.equal(planted.committed, 2_009_400_000);
  assert.ok(planted.space > 0 && planted.space < 20_000_000, `space ${planted.space}`);
  const amounts = st.teams.map(() => 0);
  amounts[cpu.id] = 13_700_000;
  applyCapCarryover(st, amounts);
  const after = teamCap(st, cpu.id);
  assert.equal(after.space, planted.cap + 13_700_000 - 2_009_400_000);
  assert.ok(after.space < -800_000_000, `space ${after.space} should be about -$836M`);
  ok("a sliver in place of the stock opens the B1 hole");
}

// (12) Several seasons. Spending the carried dollars slows the stock.
// Pre-fix seed 42, at this same 2031 preseason, had a CPU median field of
// $105.5M on a $341.2M ceiling (31%). The max crossed that ceiling at the
// 2034 preseason. The median here stays under a quarter of the ceiling,
// and no club has stacked a full extra cap inside this window.
{
  const st = newGame({ seed: 42 });
  const rows: { year: number; max: number; med: number; cap: number; abbr: string }[] = [];
  for (let i = 0; i < 5; i++) {
    const year = st.season;
    let g = 0;
    while (!isOffseason(st.phase) && g++ < 40) advance(st);
    assert.ok(isOffseason(st.phase), `${year} did not reach the offseason (${st.phase})`);
    let o = 0;
    while (isOffseason(st.phase) && o++ < 16) advanceOffseason(st);
    assert.equal(st.phase, "preseason", `${year} ended in ${st.phase}`);
    assert.equal(st.season, year + 1);
    const cap = salaryCap(st.season, startSeason(st));
    let max = 0;
    let abbr = "";
    const carries: number[] = [];
    for (const t of st.teams) {
      if (t.id === st.userTeamId) continue;
      const c = t.capCarryover ?? 0;
      carries.push(c);
      if (c > max) {
        max = c;
        abbr = t.abbr;
      }
    }
    carries.sort((a, b) => a - b);
    const med = carries[Math.floor(carries.length / 2)];
    rows.push({ year: st.season, max, med, cap, abbr });
  }
  for (const row of rows) {
    assert.ok(
      row.max < row.cap,
      `${row.year} ${row.abbr} carryover ${row.max} reached the ${row.cap} ceiling`,
    );
  }
  const last = rows[rows.length - 1];
  assert.ok(
    last.med < last.cap * 0.25,
    `${last.year} CPU median carryover ${last.med} is ${((last.med / last.cap) * 100).toFixed(1)}% of the ${last.cap} cap`,
  );
  ok("CPU carryover stays under a quarter of the cap at the median across five seasons");
}

console.log("\ncapMechanics: all passed");
