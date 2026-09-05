/**
 * Regression: /finances is a desk — extend and restructure own-roster
 * deals. Street asks use the club's veteran belief; 2-arg rostered asks
 * stay on true OVR so trades / CPU parent streams do not move.
 *
 * Run: npx tsx lib/core/contractOffice.test.ts
 */
import assert from "node:assert/strict";
import { newGame } from "./newGame";
import { makeContract, marketApy } from "./generate";
import { Rng } from "./rng";
import { capHit, startSeason, teamCap } from "./select";
import { LEAGUE_MINIMUM, MAX_CONTRACT_SHARE, Player } from "./types";
import {
  applyFranchiseTag, applyOfficeExtension, applyRestructure, askingPrice,
  beliefNegotiatedApy, expireContracts, isOfficeExtensionEligible,
  isTagExtensionEligible, negotiatedApy, officeExtensionTerms, restructurePreview,
} from "./offseason/contracts";
import { cpuVeteranView } from "./scouting";

function clubActive(st: ReturnType<typeof newGame>, teamId: number) {
  return st.players.filter((p) => p.teamId === teamId && !p.retired && !p.prospect && p.contract);
}

function leftoverBonus(c: NonNullable<Player["contract"]>): number {
  const elapsed = Math.max(0, c.years - c.yearsRemaining);
  const left = Math.max(0, Math.min(c.bonusProrationYears - elapsed, c.yearsRemaining));
  const annual = c.bonusProrationYears > 0 ? c.signingBonus / c.bonusProrationYears : 0;
  return annual * left;
}

function remainingMoney(c: NonNullable<Player["contract"]>): number {
  return leftoverBonus(c) + c.baseSalary.reduce((s, v) => s + v, 0);
}

function plantMultiYear(st: ReturnType<typeof newGame>, teamId: number): Player {
  const p = clubActive(st, teamId).slice().sort((a, b) => b.ovr - a.ovr)[0];
  assert.ok(p && p.contract, "need a rostered player");
  p.age = 26;
  p.retired = false;
  p.prospect = false;
  const rng = new Rng(1);
  p.contract = makeContract(rng, 8_000_000, 4, st.season, 2);
  return p;
}

function ok(label: string) { console.log("ok   ", label); }

// (1) Extend own-roster: years grow, he stays, parent stream does not move.
{
  const st = newGame({ seed: 11 });
  const p = plantMultiYear(st, st.userTeamId);
  const beforeRng = st.rngState;
  const beforeYears = p.contract!.yearsRemaining;
  assert.equal(isOfficeExtensionEligible(st, p), true);
  const terms = officeExtensionTerms(st, st.userTeamId, p);
  assert.ok(terms.years > beforeYears, "extension must add years");
  const r = applyOfficeExtension(st, st.userTeamId, p.id);
  assert.equal(r.ok, true, r.reason ?? "extend");
  assert.ok(p.contract);
  assert.equal(p.contract.years, terms.years);
  assert.equal(p.contract.yearsRemaining, terms.years);
  assert.equal(p.teamId, st.userTeamId);
  assert.equal(st.rngState, beforeRng, "office must not touch the parent stream");
  ok("extend own-roster; parent stream still");
}

// (2) Restructure: this-year hit drops; remaining money is conserved.
{
  const st = newGame({ seed: 12 });
  const p = plantMultiYear(st, st.userTeamId);
  const beforeRng = st.rngState;
  const before = remainingMoney(p.contract!);
  const oldHit = capHit(p.contract);
  const preview = restructurePreview(st, st.userTeamId, p);
  assert.equal(preview.ok, true, preview.reason ?? "preview");
  assert.ok(preview.savings > 0, "restructure must free cap this year");
  const r = applyRestructure(st, st.userTeamId, p.id);
  assert.equal(r.ok, true, r.reason ?? "restructure");
  assert.ok(p.contract);
  const newHit = capHit(p.contract);
  assert.ok(newHit < oldHit, "this-year hit must fall");
  assert.equal(newHit, preview.newHit);
  assert.ok(Math.abs(remainingMoney(p.contract) - before) < 2, "remaining money conserved");
  assert.equal(st.rngState, beforeRng, "restructure must not touch the parent stream");
  ok("restructure saves this year; money conserved");
}

// (3) One-year deal cannot be restructured.
{
  const st = newGame({ seed: 13 });
  const p = plantMultiYear(st, st.userTeamId);
  p.contract!.yearsRemaining = 1;
  p.contract!.baseSalary = [p.contract!.baseSalary[0] ?? LEAGUE_MINIMUM];
  const preview = restructurePreview(st, st.userTeamId, p);
  assert.equal(preview.ok, false);
  assert.match(preview.reason ?? "", /two years/i);
  const r = applyRestructure(st, st.userTeamId, p.id);
  assert.equal(r.ok, false);
  ok("one-year deal is not restructureable");
}

// (4) Tagged tender is not on this desk.
{
  const st = newGame({ seed: 14 });
  const p = plantMultiYear(st, st.userTeamId);
  p.contract!.yearsRemaining = 1;
  p.contract!.baseSalary = [p.contract!.baseSalary[0] ?? LEAGUE_MINIMUM];
  const rng = new Rng(st.rngState);
  assert.equal(applyFranchiseTag(st, st.userTeamId, p.id, rng).ok, true);
  st.rngState = rng.state;
  expireContracts(st);
  assert.equal(isTagExtensionEligible(st, p), true);
  assert.equal(isOfficeExtensionEligible(st, p), false);
  const ext = applyOfficeExtension(st, st.userTeamId, p.id);
  assert.equal(ext.ok, false);
  assert.match(ext.reason ?? "", /tagged/i);
  ok("tagged tender stays on the Hub desk");
}

// (5) Cap block on an extension that does not fit.
{
  const st = newGame({ seed: 15 });
  const p = plantMultiYear(st, st.userTeamId);
  st.teams[st.userTeamId].deadCap = teamCap(st, st.userTeamId).cap;
  const r = applyOfficeExtension(st, st.userTeamId, p.id);
  assert.equal(r.ok, false);
  assert.match(r.reason ?? "", /cap/i);
  ok("extension blocked when it does not fit");
}

// (6) Belief ask: street FA 2-arg is user belief (not invertible truth);
//     two clubs disagree; own-roster 2-arg stays on truth; CPU negotiatedApy
//     stays on truth.
{
  const st = newGame({ seed: 16 });
  const own = clubActive(st, st.userTeamId)[0];
  assert.ok(own);
  const truthOwn = marketApy(own.ovr, own.pos, own.age, st.season, startSeason(st));
  assert.equal(askingPrice(st, own), truthOwn, "own-roster 2-arg stays on truth");
  assert.equal(askingPrice(st, own, st.userTeamId), truthOwn, "own-roster 3-arg is known");

  const fa = st.players.find((p) => p.teamId === null && !p.retired && !p.prospect && p.ovr >= 70);
  assert.ok(fa, "need a street veteran");
  const truthFa = marketApy(fa.ovr, fa.pos, fa.age, st.season, startSeason(st));
  const userAsk = askingPrice(st, fa);
  const userAsk3 = askingPrice(st, fa, st.userTeamId);
  assert.equal(userAsk, userAsk3, "2-arg street ask is the user's belief");
  const believed = cpuVeteranView(st, st.userTeamId, fa).ovr;
  assert.equal(
    userAsk,
    marketApy(believed, fa.pos, fa.age, st.season, startSeason(st)),
    "street ask is marketApy of the belief, not truth"
  );
  if (Math.abs(believed - fa.ovr) >= 0.05) {
    assert.notEqual(userAsk, truthFa, "belief ask must not equal the true-OVR invert");
  }

  const a = askingPrice(st, fa, 0);
  const b = askingPrice(st, fa, 1);
  const va = cpuVeteranView(st, 0, fa).ovr;
  const vb = cpuVeteranView(st, 1, fa).ovr;
  if (Math.abs(va - vb) >= 0.05) {
    assert.notEqual(a, b, "two clubs must disagree on the ask");
  }

  const ceiling = Math.round(teamCap(st, st.userTeamId).cap * MAX_CONTRACT_SHARE);
  assert.equal(
    negotiatedApy(st, st.userTeamId, fa, 1),
    Math.max(LEAGUE_MINIMUM, Math.min(Math.round(truthFa), ceiling)),
    "negotiatedApy stays on true OVR"
  );
  assert.equal(
    beliefNegotiatedApy(st, st.userTeamId, fa, 1),
    Math.max(LEAGUE_MINIMUM, Math.min(Math.round(userAsk), ceiling)),
    "beliefNegotiatedApy follows the club ask"
  );
  ok("belief ask on street; truth on own-roster and negotiatedApy");
}

// (7) Old save shape: a contract with only the original fields still
//     extends and restructures after a JSON round-trip.
{
  const st = newGame({ seed: 17 });
  const p = plantMultiYear(st, st.userTeamId);
  const raw = JSON.parse(JSON.stringify(p.contract));
  assert.equal("restructures" in raw, false);
  p.contract = raw;
  const before = capHit(p.contract);
  const rest = applyRestructure(st, st.userTeamId, p.id);
  assert.equal(rest.ok, true, rest.reason ?? "old contract restructure");
  assert.ok(capHit(p.contract) < before);
  const q = clubActive(st, st.userTeamId).find((x) => x.id !== p.id);
  assert.ok(q && q.contract);
  q.contract = JSON.parse(JSON.stringify(q.contract));
  const ext = applyOfficeExtension(st, st.userTeamId, q.id);
  assert.equal(ext.ok, true, ext.reason ?? "old contract extend");
  ok("old contract fields load and act");
}
