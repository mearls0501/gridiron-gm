/**
 * Regression: fifth-year option sits on the post-draft camp Hub.
 *
 * Rookie deals are 4 years with no option. An eligible R1 (round 1,
 * original deal, one year remaining) can be picked up — he stays
 * through year 5 — or declined, and then expires after year 4 as today.
 *
 * Run: npx tsx lib/core/fifthYearOption.test.ts
 */
import assert from "node:assert/strict";
import { newGame } from "./newGame";
import { makeContract } from "./generate";
import { Rng } from "./rng";
import { capHit, freeAgents, isActiveRoster, teamCap } from "./select";
import { LEAGUE_MINIMUM, Player } from "./types";
import {
  applyFifthYearOption, declineFifthYearOption, expireContracts,
  fifthYearOptionPlayers, fifthYearOptionSalary, franchiseTagSalary,
  isFifthYearOptionEligible, runCpuFifthYearOptions,
} from "./offseason/contracts";
import { advanceOffseason, enterCampAfterDraft, enterDraft, simEntireDraft } from "./offseason";

function clubActive(st: ReturnType<typeof newGame>, teamId: number) {
  return st.players.filter((p) => p.teamId === teamId && !p.retired && !p.prospect && isActiveRoster(p));
}

function plantRookieDeal(
  st: ReturnType<typeof newGame>, teamId: number, round: number, pick: number
): Player {
  const p = clubActive(st, teamId).slice().sort((a, b) => b.ovr - a.ovr)[0];
  assert.ok(p && p.contract, "need a rostered player to plant");
  p.age = 24;
  p.retired = false;
  p.prospect = false;
  p.draftedRound = round;
  p.draftedPick = pick;
  p.draftClassSeason = st.season - 3;
  p.yearsPro = 3;
  const rng = new Rng(1);
  const c = makeContract(rng, LEAGUE_MINIMUM * (round === 1 ? 5.2 : 2.4), 4, p.draftClassSeason, 2);
  c.yearsRemaining = 1;
  c.baseSalary = [c.baseSalary[c.baseSalary.length - 1] ?? LEAGUE_MINIMUM];
  c.guaranteedYears = 0;
  p.contract = c;
  return p;
}

// (1) R1 with 1 year left can be picked up and then has a 5th year /
// does not expire after that 4th season.
{
  const st = newGame({ seed: 1 });
  const p = plantRookieDeal(st, st.userTeamId, 1, 5);
  assert.equal(isFifthYearOptionEligible(st, p), true);
  const picked = applyFifthYearOption(st, st.userTeamId, p.id);
  assert.equal(picked.ok, true, picked.reason ?? "pick up");
  assert.ok(p.contract);
  assert.equal(p.contract.years, 5);
  assert.equal(p.contract.yearsRemaining, 2);
  assert.equal(p.contract.baseSalary.length, 2);
  assert.ok(p.contract.guaranteedYears >= 1);
  assert.equal(p.teamId, st.userTeamId);

  expireContracts(st);
  assert.equal(p.teamId, st.userTeamId, "optioned player must not expire after year 4");
  assert.ok(p.contract);
  assert.equal(p.contract.yearsRemaining, 1);
  assert.equal(p.contract.years, 5);
  assert.equal(freeAgents(st).some((x) => x.id === p.id), false);
}

// (2) Decline → expires after year 4 as today.
{
  const st = newGame({ seed: 2 });
  const p = plantRookieDeal(st, st.userTeamId, 1, 8);
  const declined = declineFifthYearOption(st, st.userTeamId, p.id);
  assert.equal(declined.ok, true, declined.reason ?? "decline");
  assert.ok(p.contract);
  assert.equal(p.contract.years, 4);
  assert.equal(p.contract.yearsRemaining, 1);
  expireContracts(st);
  assert.equal(p.teamId, null);
  assert.equal(p.contract, null);
  assert.equal(freeAgents(st).some((x) => x.id === p.id), true);
}

// Skip / Continue with none also expires after year 4.
{
  const st = newGame({ seed: 3 });
  const p = plantRookieDeal(st, st.userTeamId, 1, 12);
  expireContracts(st);
  assert.equal(p.teamId, null);
  assert.equal(freeAgents(st).some((x) => x.id === p.id), true);
}

// (3) R2 has no option.
{
  const st = newGame({ seed: 4 });
  const p = plantRookieDeal(st, st.userTeamId, 2, 40);
  assert.equal(isFifthYearOptionEligible(st, p), false);
  assert.equal(fifthYearOptionPlayers(st, st.userTeamId).some((x) => x.id === p.id), false);
  const r = applyFifthYearOption(st, st.userTeamId, p.id);
  assert.equal(r.ok, false);
  assert.match(r.reason ?? "", /first-rounder/i);
  assert.ok(p.contract);
  assert.equal(p.contract.years, 4);
}

// One decision per eligible player per window.
{
  const st = newGame({ seed: 5 });
  const p = plantRookieDeal(st, st.userTeamId, 1, 3);
  assert.equal(applyFifthYearOption(st, st.userTeamId, p.id).ok, true);
  const again = applyFifthYearOption(st, st.userTeamId, p.id);
  assert.equal(again.ok, false);
  assert.match(again.reason ?? "", /already decided/i);
}

// (4) Cap block uses the same Sign-shaped reason.
{
  const st = newGame({ seed: 6 });
  const p = plantRookieDeal(st, st.userTeamId, 1, 4);
  st.teams[st.userTeamId].deadCap = teamCap(st, st.userTeamId).cap;
  const blocked = applyFifthYearOption(st, st.userTeamId, p.id);
  assert.equal(blocked.ok, false);
  assert.match(blocked.reason ?? "", /Not enough cap space/);
  assert.ok(p.contract);
  assert.equal(p.contract.years, 4);
  assert.equal(p.contract.yearsRemaining, 1);
}

// Tender is not the exclusive franchise tag.
{
  const st = newGame({ seed: 7 });
  const p = plantRookieDeal(st, st.userTeamId, 1, 4);
  const topTender = fifthYearOptionSalary(st, p);
  p.draftedPick = 22;
  const lateTender = fifthYearOptionSalary(st, p);
  p.draftedPick = 4;
  const tag = franchiseTagSalary(st, p);
  assert.ok(topTender >= LEAGUE_MINIMUM);
  assert.ok(lateTender >= LEAGUE_MINIMUM);
  assert.notEqual(topTender, tag, "option must not quietly equal the exclusive tag");
  assert.ok(lateTender <= topTender, "picks 11–32 are the cheaper band");
}

// (5) CPU does not auto-pick the user club.
{
  const st = newGame({ seed: 8 });
  const user = plantRookieDeal(st, st.userTeamId, 1, 6);
  for (const t of st.teams) {
    if (t.id === st.userTeamId) continue;
    plantRookieDeal(st, t.id, 1, 9);
  }
  runCpuFifthYearOptions(st);
  assert.equal(isFifthYearOptionEligible(st, user), true, "user club is not auto-picked");
  assert.equal((st.fifthYearOptions ?? []).some((o) => o.teamId === st.userTeamId), false);
  for (const o of st.fifthYearOptions ?? []) {
    assert.notEqual(o.teamId, st.userTeamId);
    if (o.pickedUp) assert.ok(teamCap(st, o.teamId).space >= 0, `club ${o.teamId} over the cap`);
  }
}

// Old saves missing fifthYearOptions still load and expire as today.
{
  const st = newGame({ seed: 9 });
  delete st.fifthYearOptions;
  const raw = JSON.parse(JSON.stringify(st)) as typeof st;
  assert.ok(!("fifthYearOptions" in raw) || raw.fifthYearOptions === undefined);
  const p = plantRookieDeal(raw, raw.userTeamId, 1, 2);
  expireContracts(raw);
  assert.equal(p.teamId, null);
  assert.equal(freeAgents(raw).some((x) => x.id === p.id), true);
}

// (6) Headless draft → camp still reaches cutdown.
{
  const st = newGame({ seed: 10 });
  st.phase = "offseason-draft";
  enterDraft(st);
  simEntireDraft(st);
  const rng = new Rng(st.rngState);
  enterCampAfterDraft(st, rng);
  st.rngState = rng.state;
  assert.equal(st.phase, "offseason-final");
  assert.equal((st.fifthYearOptions ?? []).some((o) => o.teamId === st.userTeamId), false);
  const msg = advanceOffseason(st);
  assert.equal(st.phase, "preseason", msg);
}

// Cap-hit of the appended year is the published tender.
{
  const st = newGame({ seed: 11 });
  const p = plantRookieDeal(st, st.userTeamId, 1, 1);
  const tender = fifthYearOptionSalary(st, p);
  assert.equal(applyFifthYearOption(st, st.userTeamId, p.id).ok, true);
  assert.ok(p.contract);
  assert.equal(p.contract.baseSalary[p.contract.baseSalary.length - 1], tender);
  expireContracts(st);
  assert.ok(p.contract);
  assert.equal(capHit(p.contract), tender);
}
