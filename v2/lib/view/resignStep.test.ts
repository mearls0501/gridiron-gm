/**
 * User re-sign step before the tag window closes.
 *
 * Every expiring player on the user's club is listed with the contract
 * office asking price. Meet asking is that office's accept. The Hub
 * walk count is who Continue still releases. CPU re-sign is untouched.
 *
 * Run: npx tsx lib/view/resignStep.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { newGame } from "../core/newGame";
import { Rng } from "../core/rng";
import { LEAGUE_MINIMUM, Player } from "../core/types";
import {
  applyFranchiseTag, applyOfficeExtension, comingYearCapHit, expireContracts, expiringPlayers,
  extensionAskingApy, franchiseTagSalary, isFranchiseTagged, officeExtensionTerms,
  rolloverDeadAtExpiry, submitOfficeOffer, tagWindowCap,
} from "../core/offseason/contracts";
import { reapplyRetirementDead } from "../core/offseason/progression";
import { annualCapHit, capHit, clearDeadCap, teamCap } from "../core/select";
import { runFreeAgencyOpen } from "../core/offseason";
import {
  hubResignWalkWarning, resignPot, resignStepRows, resignWalkCount, screenCap, screenCapHit,
} from "./resignStep";

function clubRoster(st: ReturnType<typeof newGame>, teamId: number): Player[] {
  return st.players.filter((p) => p.teamId === teamId && !p.retired && !p.prospect && p.contract);
}

function plantExpiring(st: ReturnType<typeof newGame>, teamId: number, ovr = 76): Player {
  const p = clubRoster(st, teamId).slice().sort((a, b) => a.ovr - b.ovr)[0];
  assert.ok(p && p.contract, "need a rostered player");
  p.ovr = ovr;
  p.age = 26;
  p.retired = false;
  p.prospect = false;
  p.contract.yearsRemaining = 1;
  p.contract.baseSalary = [p.contract.baseSalary[0] ?? LEAGUE_MINIMUM];
  return p;
}

function walking(st: ReturnType<typeof newGame>): Player[] {
  return expiringPlayers(st, st.userTeamId).filter((p) => !isFranchiseTagged(st, p.id));
}

function ok(label: string) { console.log("ok   ", label); }

// (1) Every user expiring player appears with an asking price.
{
  const st = newGame({ seed: 21 });
  st.phase = "offseason-tag";
  const roster = clubRoster(st, st.userTeamId);
  assert.ok(roster.length >= 4, "need a roster");
  for (const p of roster.slice(0, 4)) {
    assert.ok(p.contract);
    p.contract.yearsRemaining = 1;
    p.contract.baseSalary = [p.contract.baseSalary[0] ?? LEAGUE_MINIMUM];
  }
  const expiring = expiringPlayers(st, st.userTeamId);
  assert.ok(expiring.length >= 4, "planted expiring players");
  const rows = resignStepRows(st, st.userTeamId);
  assert.equal(rows.length, expiring.length, "every user expiring player appears");
  const seen = new Set(rows.map((r) => r.player.id));
  for (const p of expiring) {
    assert.ok(seen.has(p.id), `${p.lastName} missing from the re-sign step`);
    const row = rows.find((r) => r.player.id === p.id);
    assert.ok(row);
    assert.equal(row.asking, extensionAskingApy(st, st.userTeamId, p));
    assert.ok(row.asking > 0, "asking price");
  }
  ok("every user expiring player appears with an asking price");
}

// (2) Offer is the club's market number and re-signs. Under that number refuses.
//     Meet asking pays the premium and also re-signs.
{
  const st = newGame({ seed: 22 });
  st.phase = "offseason-tag";
  const p = plantExpiring(st, st.userTeamId, 74);
  const other = plantExpiring(st, st.userTeamId, 71);
  assert.notEqual(other.id, p.id);
  assert.equal(expiringPlayers(st, st.userTeamId).some((x) => x.id === p.id), true);
  const beforeRng = st.rngState;
  const terms = officeExtensionTerms(st, st.userTeamId, p);
  const under = applyOfficeExtension(st, st.userTeamId, p.id, terms.apy - 1);
  assert.equal(under.ok, false, under.reason ?? "under");
  assert.match(under.reason ?? "", /turned down/i);
  assert.equal(p.contract?.yearsRemaining, 1, "a below-market offer does not re-sign");

  const offer = submitOfficeOffer(st, st.userTeamId, p.id, false);
  assert.equal(offer.ok, true, offer.message);
  assert.equal(p.teamId, st.userTeamId);
  assert.ok(p.contract);
  assert.ok(p.contract.yearsRemaining > 1, "Offer replaces the expiring year");
  assert.equal(expiringPlayers(st, st.userTeamId).some((x) => x.id === p.id), false);
  assert.equal(st.rngState, beforeRng, "Offer must not touch the parent stream");

  const meet = submitOfficeOffer(st, st.userTeamId, other.id, true);
  assert.equal(meet.ok, true, meet.message);
  assert.ok(other.contract);
  assert.ok(other.contract.yearsRemaining > 1, "Meet asking replaces the expiring year");
  assert.equal(expiringPlayers(st, st.userTeamId).some((x) => x.id === other.id), false);
  assert.equal(st.rngState, beforeRng, "Meet asking must not touch the parent stream");
  ok("Offer and Meet asking both re-sign");
}

// (3) Hub walk count equals the expiring players not yet re-signed.
{
  const st = newGame({ seed: 23 });
  st.phase = "offseason-tag";
  const roster = clubRoster(st, st.userTeamId);
  for (const p of roster.slice(0, 3)) {
    assert.ok(p.contract);
    p.contract.yearsRemaining = 1;
    p.contract.baseSalary = [p.contract.baseSalary[0] ?? LEAGUE_MINIMUM];
  }
  const before = walking(st);
  assert.ok(before.length >= 2, "need two who would walk");
  assert.equal(resignWalkCount(st), before.length, "walk count before any re-sign");
  const warning = hubResignWalkWarning(st);
  assert.ok(warning);
  assert.match(warning, new RegExp(`${before.length} expiring players? will walk if you Continue now`));

  const target = before.slice().sort((a, b) => a.ovr - b.ovr)[0];
  assert.ok(target);
  const meet = submitOfficeOffer(st, st.userTeamId, target.id, true);
  assert.equal(meet.ok, true, meet.message);
  const after = walking(st);
  assert.equal(after.some((p) => p.id === target.id), false);
  assert.equal(resignWalkCount(st), after.length);
  assert.equal(resignWalkCount(st), before.length - 1, "re-signed player is no longer a walk");
  const next = hubResignWalkWarning(st);
  assert.ok(next);
  assert.match(next, /will walk if you Continue now/);
  assert.match(next, new RegExp(String(resignWalkCount(st))));

  st.phase = "offseason-fa";
  assert.equal(hubResignWalkWarning(st), null, "the warning is the tag window");
  st.phase = "offseason-tag";

  const still = walking(st)[0];
  assert.ok(still);
  const rng = new Rng(st.rngState);
  assert.equal(applyFranchiseTag(st, st.userTeamId, still.id, rng).ok, true);
  assert.equal(isFranchiseTagged(st, still.id), true);
  assert.equal(
    resignStepRows(st).some((r) => r.player.id === still.id),
    false,
    "a tagged player is not on the re-sign list",
  );
  assert.equal(
    resignWalkCount(st),
    expiringPlayers(st, st.userTeamId).filter((p) => !isFranchiseTagged(st, p.id)).length,
    "a tag is not a walk",
  );
  assert.ok(resignWalkCount(st) < expiringPlayers(st, st.userTeamId).length);
  ok("the Hub walk count equals the expiring players not yet re-signed");
}

// (4) CPU re-sign outcomes are unchanged by a user Meet asking.
{
  const raw = JSON.stringify(newGame({ seed: 24 }));
  const resigned = JSON.parse(raw) as ReturnType<typeof newGame>;
  const plain = JSON.parse(raw) as ReturnType<typeof newGame>;
  resigned.phase = "offseason-tag";
  plain.phase = "offseason-tag";
  const target = plantExpiring(resigned, resigned.userTeamId, 73);
  const twin = plain.players.find((p) => p.id === target.id);
  assert.ok(twin && twin.contract);
  twin.ovr = target.ovr;
  twin.age = target.age;
  twin.contract.yearsRemaining = 1;
  twin.contract.baseSalary = [twin.contract.baseSalary[0] ?? LEAGUE_MINIMUM];
  assert.equal(resigned.rngState, plain.rngState);
  const meet = submitOfficeOffer(resigned, resigned.userTeamId, target.id, true);
  assert.equal(meet.ok, true, meet.message);
  assert.equal(resigned.rngState, plain.rngState, "user re-sign must not move the parent stream");

  const origin = new Map(plain.players.map((p) => [p.id, p.teamId]));
  runFreeAgencyOpen(resigned);
  runFreeAgencyOpen(plain);
  assert.equal(resigned.rngState, plain.rngState, "CPU re-sign drew the same stream");
  assert.equal(target.teamId, resigned.userTeamId, "the re-signed player stayed");
  assert.equal(twin.teamId, null, "the same player walked when he was not re-signed");

  for (const p of resigned.players) {
    if (origin.get(p.id) === resigned.userTeamId) continue;
    const q = plain.players.find((x) => x.id === p.id);
    assert.ok(q);
    assert.equal(p.teamId, q.teamId, `CPU club for ${p.id}`);
    assert.equal(p.contract?.years, q.contract?.years, `CPU years for ${p.id}`);
    assert.equal(p.contract?.yearsRemaining, q.contract?.yearsRemaining, `CPU term for ${p.id}`);
    const ap = p.contract?.baseSalary[0] ?? null;
    const aq = q.contract?.baseSalary[0] ?? null;
    assert.equal(ap, aq, `CPU base for ${p.id}`);
  }
  ok("CPU re-sign outcomes are unchanged");
}

// Hub and /finances both call the office. The step is not a second desk.
{
  const hub = readFileSync(new URL("../../app/page.tsx", import.meta.url), "utf8");
  const finances = readFileSync(new URL("../../app/finances/page.tsx", import.meta.url), "utf8");
  assert.match(hub, /resignStepRows/);
  assert.match(hub, /hubResignWalkWarning/);
  assert.match(hub, /submitOfficeOffer/);
  assert.match(hub, /Meet asking/);
  assert.match(finances, /submitOfficeOffer/);
  assert.match(finances, /Meet asking/);
  ok("Hub and /finances share the contract-office offer");
}

{
  const young = plantExpiring(newGame({ seed: 3 }), 0, 70);
  young.age = 25;
  assert.equal(typeof resignPot(young), "number");
  young.age = 26;
  assert.equal(resignPot(young), null, "potential stays off the row after 25");
  ok("re-sign potential is only for players 25 and under");
}

// Tag-window cap space (`docs/playtest-1028-resign-cap-space.md`, signed
// 2026-11-11). The screen is the coming league year. Meet asking costs the
// new year-1 hit; it no longer credits the expiring deal's closing year.
{
  const st = newGame({ seed: 28 });
  st.phase = "offseason-tag";
  const me = st.userTeamId;
  const p = plantExpiring(st, me, 68);
  p.age = 30;
  const walker = plantExpiring(st, me, 66);
  assert.notEqual(walker.id, p.id);
  const ask = extensionAskingApy(st, me, p);
  assert.ok(p.contract);
  p.contract.baseSalary = [ask + 3_400_000];
  p.contract.signingBonus = 0;
  const closingHit = capHit(p.contract);
  assert.ok(closingHit > ask, "Thigpen shape: the closing hit is above the ask");
  assert.equal(comingYearCapHit(st, p), 0, "an unsigned expiring deal is $0 next year");

  const before = tagWindowCap(st, me).space;
  const beforeTeam = teamCap(st, me).space;
  assert.equal(screenCap(st, me).space, before, "the tag-window screen is the coming year");
  const terms = officeExtensionTerms(st, me, p);
  const rng = st.rngState;
  const r = submitOfficeOffer(st, me, p.id, true);
  assert.equal(r.ok, true, r.message);
  assert.equal(st.rngState, rng, "the click does not draw");

  assert.ok(p.contract);
  const yearOne = annualCapHit(p.contract);
  assert.ok(Math.abs(tagWindowCap(st, me).space - (before - yearOne)) <= 1, "the meter falls by year 1");
  assert.ok(teamCap(st, me).space > beforeTeam, "the closing-year book would still have risen");
  assert.equal(screenCapHit(st, p), yearOne, "the cap-hit cell shows year 1, not $0");
  assert.equal(p.contract.startsNextLeagueYear, true);
  assert.equal(p.contract.yearsRemaining, terms.years, "the signed term");
  const baseOne = p.contract.baseSalary[0];

  const gone = expireContracts(st);
  assert.ok(p.contract);
  assert.equal(p.contract.startsNextLeagueYear, undefined, "the roll clears the flag");
  assert.equal(p.contract.yearsRemaining, terms.years, "year 1 is not burned");
  assert.equal(p.contract.baseSalary[0], baseOne);
  assert.equal(capHit(p.contract), yearOne, "the FA hit is the year-1 hit the meter charged");
  assert.ok(gone.some((x) => x.id === walker.id), "the unsigned player walks");
  assert.equal(walker.teamId, null);
  ok("tag-window Meet asking charges year 1 on the coming-year meter and keeps year 1");
}

// The tag-window meter leaves closing-year dead on the team and shows only
// what survives the FA-open wipe.
{
  const st = newGame({ seed: 29 });
  st.phase = "offseason-tag";
  const t = st.teams[st.userTeamId];
  t.deadCap = 24_200_000;
  t.retirementDeadPending = 2_790_000;
  assert.equal(tagWindowCap(st, st.userTeamId).dead, 2_790_000);
  assert.equal(t.deadCap, 24_200_000);
  st.phase = "offseason-fa";
  assert.equal(screenCap(st, st.userTeamId).dead, 24_200_000, "outside the window the screen is teamCap");
  ok("tag-window dead is retirement acceleration only; the team keeps its closing dead");
}

// Tag-window residuals (`docs/proposal-tag-window-residuals-2026-11-11.md`,
// signed 2026-11-12). A user-replaced expiring deal still owes its void
// remainder on the new league year, and the Tag button checks the meter.
function plantVoid(st: ReturnType<typeof newGame>, p: Player): number {
  assert.ok(p.contract);
  p.contract.years = Math.max(p.contract.years, 2);
  p.contract.signingBonus = 8_000_000;
  p.contract.bonusProrationYears = p.contract.years + 4;
  const L = rolloverDeadAtExpiry(st, p);
  assert.ok(L > 0, "the planted deal has a void remainder");
  return L;
}

function roll(st: ReturnType<typeof newGame>): void {
  clearDeadCap(st);
  reapplyRetirementDead(st);
  expireContracts(st);
}

function voidState(seed: number) {
  const st = newGame({ seed });
  st.phase = "offseason-tag";
  const me = st.userTeamId;
  const p = plantExpiring(st, me, 68);
  p.age = 30;
  const L = plantVoid(st, p);
  return { st, me, p, L };
}

{
  // 1. Walked: the meter shows the remainder, and the roll books it.
  const a = voidState(31);
  const pending = a.st.teams[a.me].retirementDeadPending ?? 0;
  assert.equal(tagWindowCap(a.st, a.me).dead, pending + a.L, "the walker's void remainder is on the meter");
  roll(a.st);
  const walkedDead = a.st.teams[a.me].deadCap ?? 0;
  assert.equal(walkedDead, pending + a.L);

  // 2. Extended: the same dollars, booked at the click and posted after the wipe.
  const b = voidState(31);
  const before = tagWindowCap(b.st, b.me);
  const rng = b.st.rngState;
  const r = submitOfficeOffer(b.st, b.me, b.p.id, true);
  assert.equal(r.ok, true, r.message);
  assert.equal(b.st.rngState, rng, "the click does not draw");
  const after = tagWindowCap(b.st, b.me);
  assert.equal(after.dead, before.dead, "the remainder moves to the pending field; meter dead holds");
  assert.ok(b.p.contract);
  assert.ok(Math.abs(after.space - (before.space - annualCapHit(b.p.contract))) <= 1, "the meter falls by year 1");
  assert.equal(b.st.teams[b.me].rolloverDeadPending, b.L);
  roll(b.st);
  assert.equal(b.st.teams[b.me].deadCap ?? 0, walkedDead, "re-signed or walked, the same dead after the roll");
  assert.equal("rolloverDeadPending" in b.st.teams[b.me], false, "the field is gone after it posts");
  ok("a void remainder costs the same on the new league year whether he walks or re-signs");
}

{
  // 3. No void years, no field.
  const st = newGame({ seed: 32 });
  st.phase = "offseason-tag";
  const me = st.userTeamId;
  const p = plantExpiring(st, me, 68);
  p.age = 30;
  assert.ok(p.contract);
  p.contract.bonusProrationYears = p.contract.years;
  assert.equal(rolloverDeadAtExpiry(st, p), 0);
  const r = submitOfficeOffer(st, me, p.id, true);
  assert.equal(r.ok, true, r.message);
  assert.equal(st.teams[me].rolloverDeadPending, undefined);
  assert.equal(st.teams.some((t) => "rolloverDeadPending" in t), false, "no team gains the key");
  ok("a deal without void years books nothing extra");
}

function tagState(seed: number) {
  const st = newGame({ seed });
  st.phase = "offseason-tag";
  const me = st.userTeamId;
  const p = plantExpiring(st, me, 80);
  p.age = 27;
  assert.ok(p.contract);
  p.contract.bonusProrationYears = p.contract.years;
  return { st, me, p, tender: franchiseTagSalary(st, p) };
}

{
  // 4. Stricter case: the closing book says no, the meter has room.
  const { st, me, p, tender } = tagState(33);
  const closing = teamCap(st, me).space + capHit(p.contract);
  st.teams[me].deadCap = (st.teams[me].deadCap ?? 0) + closing - tender + 1_000_000;
  assert.ok(teamCap(st, me).space + capHit(p.contract) < tender);
  const meter = tagWindowCap(st, me).space;
  assert.ok(meter > tender, "the meter has room for the tender");
  const cpu = structuredClone(st);
  const def = applyFranchiseTag(cpu, me, p.id, new Rng(cpu.rngState));
  assert.equal(def.ok, false);
  assert.match(def.reason ?? "", /Not enough cap space/);
  const r = applyFranchiseTag(st, me, p.id, new Rng(st.rngState), "comingYear");
  assert.equal(r.ok, true, r.reason ?? "");
  assert.ok(p.contract);
  assert.ok(Math.abs(tagWindowCap(st, me).space - (meter - annualCapHit(p.contract))) <= 1, "the meter falls by the tender");
  ok("the Tag button allows a tender the coming-year meter has room for");
}

{
  // 5. Looser case: the closing book says yes, the meter does not.
  const { st, me, p, tender } = tagState(34);
  const meter = tagWindowCap(st, me).space;
  st.teams[me].retirementDeadPending = (st.teams[me].retirementDeadPending ?? 0) + meter - tender + 1_000_000;
  assert.ok(tagWindowCap(st, me).space < tender);
  assert.ok(teamCap(st, me).space + capHit(p.contract) >= tender, "the closing book still has room");
  const cpu = structuredClone(st);
  const r = applyFranchiseTag(st, me, p.id, new Rng(st.rngState), "comingYear");
  assert.equal(r.ok, false);
  const avail = (tagWindowCap(st, me).space / 1e6).toFixed(1);
  assert.ok(!r.ok && (r.reason ?? "").includes(`$${avail}M available`), "the refusal quotes the meter");
  const def = applyFranchiseTag(cpu, me, p.id, new Rng(cpu.rngState));
  assert.equal(def.ok, true, "the CPU (default) check is unchanged");
  ok("the Tag button refuses a tender the coming-year meter cannot hold");
}

{
  // 6. Tag over a void deal: the user path books it; the default path does not.
  const { st, me, p } = tagState(35);
  const L = plantVoid(st, p);
  const cpu = structuredClone(st);
  const before = tagWindowCap(st, me).dead;
  const r = applyFranchiseTag(st, me, p.id, new Rng(st.rngState), "comingYear");
  assert.equal(r.ok, true, r.reason ?? "");
  assert.equal(st.teams[me].rolloverDeadPending, L);
  assert.equal(tagWindowCap(st, me).dead, before, "meter dead holds");
  const def = applyFranchiseTag(cpu, me, p.id, new Rng(cpu.rngState));
  assert.equal(def.ok, true);
  assert.equal(cpu.teams[me].rolloverDeadPending, undefined, "CPU tags keep dropping it until signed");
  ok("a user tag over a void deal books the remainder; CPU tags are unchanged");
}

{
  // 7. Off-window: teamCap ignores the pending field.
  const st = newGame({ seed: 36 });
  st.phase = "offseason-fa";
  const t = st.teams[st.userTeamId];
  t.deadCap = 5_000_000;
  t.rolloverDeadPending = 3_000_000;
  assert.equal(screenCap(st, st.userTeamId).dead, 5_000_000);
  assert.equal(teamCap(st, st.userTeamId).dead, 5_000_000);
  ok("outside the tag window the pending rollover is not on the screen");
}
