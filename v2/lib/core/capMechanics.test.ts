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
  CAP_CARRYOVER_MAX_SHARE, applyCapCarryover, capCarryoverBank, capHit, captureCapCarryover,
  deadMoney, remainingBonusProration, rosterCount, startSeason, teamCap,
} from "./select";
import { Player, ROSTER_LIMIT, salaryCap } from "./types";
import {
  addVoidYearsPreview, applyVoidYears, expireContracts, MAX_VOID_YEARS, reconcileRoster,
  runCpuVoidYears, spendLegalCpuBackToFloor, spendToFloor,
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
  const raw = Math.max(0, before.space);
  const limit = Math.round(before.cap * CAP_CARRYOVER_MAX_SHARE);
  assert.ok(raw <= limit, `seed leftover ${raw} is already over the bank ceiling ${limit}`);
  assert.equal(snap[teamId], raw);
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

// (14) After carryover, a CPU club releases a saving cut before it rewrites,
// and the rewrite is the smallest hit that covers the hole. The user seat
// is not rewritten.
{
  const st = newGame({ seed: 42 });
  const cpu = st.teams.find((t) => t.id !== st.userTeamId);
  assert.ok(cpu);
  const roster = st.players.filter(
    (p) => p.teamId === cpu.id && !p.retired && !p.prospect && p.contract,
  );
  assert.ok(roster.length >= 2);
  const [small, large] = roster.slice().sort((a, b) => a.id - b.id);
  const locked = (hit: number) => ({
    years: 1,
    yearsRemaining: 1,
    baseSalary: [hit],
    signingBonus: 0,
    bonusProrationYears: 1,
    signedSeason: st.season,
    guaranteedYears: 1,
  });
  for (const p of roster) p.contract = locked(795_000);
  small.contract = locked(5_000_000);
  large.contract = locked(40_000_000);
  const info = teamCap(st, cpu.id);
  const playerAndPaid = info.committed - info.dead;
  st.teams[cpu.id].deadCap = info.cap + info.carryover - playerAndPaid + 2_000_000;
  assert.ok(teamCap(st, cpu.id).space < 0, "planted hole");
  const rng = new Rng(st.rngState);
  const rngAt = rng.state;
  reconcileRoster(st, cpu.id, rng, undefined, false, true);
  assert.equal(rng.state, rngAt, "the pick does not draw");
  assert.equal(small.contract?.years, 1);
  assert.ok((small.contract?.baseSalary[0] ?? 0) <= 1_000_000, "smallest covering hit was rewritten");
  assert.equal(large.contract?.baseSalary[0], 40_000_000, "the larger hit was left");
  assert.ok(teamCap(st, cpu.id).space >= 0, "the hole closed");

  const userRoster = st.players.filter(
    (p) => p.teamId === st.userTeamId && !p.retired && !p.prospect && p.contract,
  );
  const [userSmall, userLarge] = userRoster.slice().sort((a, b) => a.id - b.id);
  userSmall.contract = locked(5_000_000);
  userLarge.contract = locked(40_000_000);
  const userInfo = teamCap(st, st.userTeamId);
  const userPay = userInfo.committed - userInfo.dead;
  st.teams[st.userTeamId].deadCap = userInfo.cap + userInfo.carryover - userPay + 2_000_000;
  reconcileRoster(st, st.userTeamId, new Rng(1), undefined, false, true);
  assert.equal(userSmall.contract?.baseSalary[0], 5_000_000, "user seat is not rewritten");
  assert.equal(userLarge.contract?.baseSalary[0], 40_000_000);
  ok("post-carryover rewrite takes the smallest hit that covers the hole");
}

// (15) The refill after that rewrite has to fit. These two CPU clubs were
// over the cap at the 2028 preseason when the trailing fill signed at market
// into room the smallest rewrite had just created.
function rollToNextPreseason(st: ReturnType<typeof newGame>): void {
  let g = 0;
  while (!isOffseason(st.phase) && g++ < 40) advance(st);
  assert.ok(isOffseason(st.phase), `did not reach the offseason (${st.phase})`);
  let o = 0;
  while (isOffseason(st.phase) && o++ < 16) advanceOffseason(st);
  assert.equal(st.phase, "preseason", `ended in ${st.phase}`);
}

{
  const cases = [
    { seed: 506968236, abbr: "NYS" },
    { seed: 506991993, abbr: "DET" },
  ];
  for (const c of cases) {
    const st = newGame({ seed: c.seed });
    const start = st.season;
    rollToNextPreseason(st);
    assert.equal(st.season, start + 1);
    rollToNextPreseason(st);
    assert.equal(st.season, start + 2);
    assert.equal(st.season, 2028, `seed ${c.seed} reached ${st.season}, not 2028`);
    const club = st.teams.find((t) => t.abbr === c.abbr);
    assert.ok(club, c.abbr);
    assert.notEqual(club.id, st.userTeamId, `${c.abbr} is a CPU club on seed ${c.seed}`);
    const space = teamCap(st, club.id).space;
    const n = rosterCount(st, club.id);
    assert.ok(space >= 0, `${c.abbr} on ${c.seed} at 2028 is ${space} over, roster ${n}`);
    assert.equal(n, ROSTER_LIMIT, `${c.abbr} on ${c.seed} at 2028 has ${n} active`);
  }
  ok("New York (506968236) and Detroit (506991993) are under the cap at the 2028 preseason");
}

// (12) Several seasons. Spending the carried dollars slows the stock.
// Pre-fix seed 42, at this same 2031 preseason, had a CPU median field of
// $105.5M on a $341.2M ceiling (31%). With the bank ceiling, no CPU club
// holds more than 20% of that year's cap.
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
    const bank = Math.round(row.cap * CAP_CARRYOVER_MAX_SHARE);
    assert.ok(
      row.max <= bank,
      `${row.year} ${row.abbr} carryover ${row.max} is over the ${bank} bank ceiling`,
    );
  }
  const last = rows[rows.length - 1];
  assert.ok(
    last.med < last.cap * 0.25,
    `${last.year} CPU median carryover ${last.med} is ${((last.med / last.cap) * 100).toFixed(1)}% of the ${last.cap} cap`,
  );
  ok("CPU carryover stays under a quarter of the cap at the median across five seasons");
}

// (13) The bank ceiling. Amounts inside it roll in full. Amounts above it
// bank at 20% of the cap, for the user and for a CPU club. The chair then
// inherits that bank, not the raw stockpile.
{
  const cap = 255_400_000;
  const limit = Math.round(cap * CAP_CARRYOVER_MAX_SHARE);
  assert.equal(capCarryoverBank(6_348_893, cap), 6_348_893);
  assert.equal(capCarryoverBank(50_096_964, cap), 50_096_964);
  assert.equal(capCarryoverBank(1_847_600_000, cap), limit);
  assert.ok(50_096_964 <= limit, "the 2025 NFL max roll fits under the ceiling");

  const st = newGame({ seed: 42 });
  const sf = st.teams.find((t) => t.abbr === "SF");
  const bal = st.teams.find((t) => t.abbr === "BAL");
  assert.ok(sf && bal);
  assert.notEqual(st.userTeamId, sf.id);
  const fromId = st.userTeamId;
  const liveCap = teamCap(st, fromId).cap;
  const liveLimit = Math.round(liveCap * CAP_CARRYOVER_MAX_SHARE);

  const setUnused = (teamId: number, unused: number) => {
    const t = st.teams[teamId];
    t.capCarryover = 0;
    const info = teamCap(st, teamId);
    const playerAndPaid = info.committed - info.dead;
    t.deadCap = info.cap - playerAndPaid - unused;
    assert.equal(teamCap(st, teamId).space, unused, `${t.abbr} unused`);
  };
  setUnused(bal.id, 12_000_000);
  st.teams[fromId].capCarryover = 1_000_000_000;
  sf.capCarryover = 1_000_000_000;

  const snap = captureCapCarryover(st);
  assert.equal(snap[fromId], liveLimit, "user bank");
  assert.equal(snap[sf.id], liveLimit, "CPU bank");
  assert.equal(snap[bal.id], 12_000_000, "under the ceiling rolls in full");
  applyCapCarryover(st, snap);
  assert.equal(st.teams[fromId].capCarryover, liveLimit);
  assert.equal(sf.capCarryover, liveLimit);
  assert.equal(bal.capCarryover, 12_000_000);

  st.phase = "offseason-tag";
  st.forcedMove = { fromTeamId: fromId, season: st.season, openChairs: [sf.id] };
  const r = acceptGmChair(st, sf.id);
  assert.equal(r.ok, true, r.reason ?? "accept");
  assert.equal(st.userTeamId, sf.id);
  assert.equal(sf.capCarryover, liveLimit, "the chair inherits the bank, not the stockpile");
  assert.equal(st.teams[fromId].capCarryover, liveLimit, "the club he left keeps its own bank");
  assert.equal(bal.capCarryover, 12_000_000, "a modest roll is not haircut");
  ok("carryover banks at 20% of the cap, and the chair inherits that bank");
}

// (16) A cover that rewrites a club under 55% does not leave it there.
// Seed 1013891931 did not fall under 55% on this VM (low was 72%), so this
// is the book that rewrite leaves: 53 men, under the cap, almost all at the
// minimum. The spend-back uses the same floor as spendToFloor.
{
  const st = newGame({ seed: 42 });
  const cpu = st.teams.find((t) => t.id !== st.userTeamId);
  assert.ok(cpu);
  const minimum = (signedSeason: number) => ({
    years: 1,
    yearsRemaining: 1,
    baseSalary: [795_000],
    signingBonus: 0,
    bonusProrationYears: 1,
    signedSeason,
    guaranteedYears: 0,
  });
  const plantCheap = (teamId: number) => {
    for (const p of clubActive(st, teamId)) p.contract = minimum(st.season);
  };
  plantCheap(cpu.id);
  plantCheap(st.userTeamId);
  const cap = teamCap(st, cpu.id).cap;
  const before = payroll(st, cpu.id);
  const userBefore = payroll(st, st.userTeamId);
  assert.ok(before < cap * 0.55, `planted payroll ${before} is not under 55% of ${cap}`);
  assert.ok(teamCap(st, cpu.id).space >= 0, "planted book is under the cap");
  assert.equal(rosterCount(st, cpu.id), ROSTER_LIMIT);
  // The cover on an already-legal full roster does not spend. The hole stays.
  reconcileRoster(st, cpu.id, new Rng(1), ROSTER_LIMIT, true, true);
  assert.ok(payroll(st, cpu.id) < cap * 0.55, "the cover left the cheap book in place");
  assert.equal(rosterCount(st, cpu.id), ROSTER_LIMIT);
  spendLegalCpuBackToFloor(st, new Rng(st.rngState));
  const after = payroll(st, cpu.id);
  assert.ok(after >= cap * SPEND_FLOOR, `payroll ${after} is under the ${cap * SPEND_FLOOR} floor`);
  assert.ok(teamCap(st, cpu.id).space >= 0, `space ${teamCap(st, cpu.id).space}`);
  assert.equal(rosterCount(st, cpu.id), ROSTER_LIMIT, "the spend-back keeps 53");
  assert.equal(payroll(st, st.userTeamId), userBefore, "the user seat is not spent up");
  ok("a CPU club under 55% after the cover is spent back to the floor and stays legal");
}

// (17) A deal with years left is restructured, not rewritten. The base above
// the minimum becomes bonus over the remaining term, the player keeps every
// dollar, and nobody is put on a one-year minimum.
{
  const st = newGame({ seed: 42 });
  const cpu = st.teams.find((t) => t.id !== st.userTeamId);
  assert.ok(cpu);
  const roster = st.players.filter(
    (p) => p.teamId === cpu.id && !p.retired && !p.prospect && p.contract,
  );
  const [small, large] = roster.slice().sort((a, b) => a.id - b.id);
  const locked = (hit: number, years = 1) => ({
    years,
    yearsRemaining: years,
    baseSalary: Array.from({ length: years }, () => hit),
    signingBonus: 0,
    bonusProrationYears: years,
    signedSeason: st.season,
    guaranteedYears: years,
  });
  for (const p of roster) p.contract = locked(795_000);
  small.contract = locked(5_000_000);
  large.contract = locked(40_000_000, 3);
  const info = teamCap(st, cpu.id);
  st.teams[cpu.id].deadCap = info.cap + info.carryover - (info.committed - info.dead) + 2_000_000;
  assert.ok(teamCap(st, cpu.id).space < 0, "planted hole");
  const owed = (c: NonNullable<Player["contract"]>) =>
    c.baseSalary.reduce((sum, x) => sum + x, 0) + leftover(c);
  const owedBefore = owed(large.contract);
  const hitBefore = capHit(large.contract);
  const logAt = st.log.length;
  const rng = new Rng(st.rngState);
  const rngAt = rng.state;
  reconcileRoster(st, cpu.id, rng, undefined, false, true);
  assert.equal(rng.state, rngAt, "a restructure does not draw");
  assert.ok(teamCap(st, cpu.id).space >= 0, "the hole closed");
  assert.equal(large.contract?.years, 3, "the deal keeps its term");
  assert.equal(large.contract?.yearsRemaining, 3);
  assert.ok(capHit(large.contract) < hitBefore, "this year's hit came down");
  assert.ok(Math.abs(owed(large.contract!) - owedBefore) <= 3, "every dollar is still owed");
  assert.equal(large.contract?.baseSalary[1], 40_000_000, "later years are untouched");
  assert.equal(small.contract?.baseSalary[0], 5_000_000, "the one-year deal was not rewritten");
  const added = st.log.slice(logAt).map((e) => e.text);
  assert.ok(added.some((t) => t.includes("restructured") && t.includes("converted")), "the restructure is logged");
  assert.ok(!added.some((t) => t.includes("to the league minimum")), "no forced minimum rewrite");
  ok("post-carryover cover restructures a multi-year deal before any minimum rewrite");
}

console.log("\ncapMechanics: all passed");
