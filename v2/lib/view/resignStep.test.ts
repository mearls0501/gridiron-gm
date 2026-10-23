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
  applyFranchiseTag, applyOfficeExtension, expiringPlayers, extensionAskingApy,
  isFranchiseTagged, officeExtensionTerms, submitOfficeOffer,
} from "../core/offseason/contracts";
import { runFreeAgencyOpen } from "../core/offseason";
import { hubResignWalkWarning, resignPot, resignStepRows, resignWalkCount } from "./resignStep";

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
