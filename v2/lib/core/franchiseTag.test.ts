/**
 * Regression: franchise-tag window sits between Recap and FA.
 *
 * expireContracts used to fire inside the Recap advance, so CPU resign
 * got first crack and the user never tagged. Exclusive tag only; one
 * per club per year; published CBA tender (top-5 hit or 120%).
 *
 * Run: npx tsx lib/core/franchiseTag.test.ts
 */
import assert from "node:assert/strict";
import { newGame } from "./newGame";
import { makeContract } from "./generate";
import { Rng } from "./rng";
import { capHit, freeAgents, isActiveRoster, rosterCount, teamCap } from "./select";
import { LEAGUE_MINIMUM, Player, ROSTER_LIMIT } from "./types";
import {
  applyFranchiseTag, clubFranchiseTaggedPlayer, clubHasFranchiseTag, expireContracts,
  expiringPlayers, franchiseTagSalary, isFranchiseTagged, runCpuFranchiseTags,
} from "./offseason/contracts";
import { teamOutlook } from "./frontOffice";
import { advanceOffseason, faPool } from "./offseason";

function clubActive(st: ReturnType<typeof newGame>, teamId: number) {
  return st.players.filter((p) => p.teamId === teamId && !p.retired && !p.prospect && isActiveRoster(p));
}

function plantExpiring(st: ReturnType<typeof newGame>, teamId: number): Player {
  const p = clubActive(st, teamId).slice().sort((a, b) => b.ovr - a.ovr)[0];
  assert.ok(p && p.contract, "need a rostered player to plant");
  p.age = 25;
  p.retired = false;
  p.contract.yearsRemaining = 1;
  p.contract.baseSalary = [p.contract.baseSalary[0] ?? LEAGUE_MINIMUM];
  return p;
}

// (1) Tag keeps him off the FA board and on the 53 with a 1-year hit.
{
  const st = newGame({ seed: 1 });
  const p = plantExpiring(st, st.userTeamId);
  const rng = new Rng(st.rngState);
  const tagged = applyFranchiseTag(st, st.userTeamId, p.id, rng);
  assert.equal(tagged.ok, true, tagged.reason ?? "tag");
  assert.equal(p.teamId, st.userTeamId);
  assert.ok(p.contract);
  assert.equal(p.contract.years, 1);
  assert.equal(p.contract.yearsRemaining, 1);
  assert.ok(capHit(p.contract) > 0);

  expireContracts(st);
  assert.equal(p.teamId, st.userTeamId, "tagged player must not expire");
  assert.ok(p.contract);
  assert.equal(p.contract.yearsRemaining, 1);
  assert.equal(isActiveRoster(p), true);
  assert.equal(freeAgents(st).some((x) => x.id === p.id), false);
  assert.ok(rosterCount(st, st.userTeamId) <= ROSTER_LIMIT);
  assert.ok(clubActive(st, st.userTeamId).some((x) => x.id === p.id));
}

// (2) A second tag that year is refused.
{
  const st = newGame({ seed: 2 });
  const names = expiringPlayers(st, st.userTeamId);
  const a = names[0] ?? plantExpiring(st, st.userTeamId);
  if (a.contract && a.contract.yearsRemaining !== 1) plantExpiring(st, st.userTeamId);
  const roster = clubActive(st, st.userTeamId).filter((p) => p.contract?.yearsRemaining === 1);
  assert.ok(roster.length >= 1);
  const first = roster[0];
  const rng = new Rng(st.rngState);
  assert.equal(applyFranchiseTag(st, st.userTeamId, first.id, rng).ok, true);
  const second = roster.find((p) => p.id !== first.id) ?? (() => {
    const extra = clubActive(st, st.userTeamId).find((p) => p.id !== first.id && p.contract);
    assert.ok(extra && extra.contract);
    extra.contract.yearsRemaining = 1;
    extra.contract.baseSalary = [extra.contract.baseSalary[0] ?? LEAGUE_MINIMUM];
    return extra;
  })();
  const again = applyFranchiseTag(st, st.userTeamId, second.id, rng);
  assert.equal(again.ok, false);
  assert.match(again.reason ?? "", /already used its franchise tag/i);
  assert.equal(clubHasFranchiseTag(st, st.userTeamId), true);
}

// (3) Skip → he expires into FA as today.
{
  const st = newGame({ seed: 3 });
  const p = plantExpiring(st, st.userTeamId);
  expireContracts(st);
  assert.equal(p.teamId, null);
  assert.equal(p.contract, null);
  assert.equal(freeAgents(st).some((x) => x.id === p.id), true);
}

// Old saves missing franchiseTags still load and expire as today.
{
  const st = newGame({ seed: 4 });
  delete st.franchiseTags;
  const raw = JSON.parse(JSON.stringify(st)) as typeof st;
  assert.ok(!("franchiseTags" in raw) || raw.franchiseTags === undefined);
  const p = plantExpiring(raw, raw.userTeamId);
  expireContracts(raw);
  assert.equal(p.teamId, null);
  assert.equal(freeAgents(raw).some((x) => x.id === p.id), true);
}

// (4) CPU tags at most one per club and stay under the cap.
{
  const st = newGame({ seed: 5 });
  for (const t of st.teams) {
    if (t.id === st.userTeamId) continue;
    plantExpiring(st, t.id);
  }
  const rng = new Rng(st.rngState);
  runCpuFranchiseTags(st, rng);
  const byClub = new Map<number, number>();
  for (const tag of st.franchiseTags ?? []) {
    assert.notEqual(tag.teamId, st.userTeamId, "user club is not auto-tagged");
    byClub.set(tag.teamId, (byClub.get(tag.teamId) ?? 0) + 1);
  }
  for (const [teamId, n] of byClub) {
    assert.ok(n <= 1, `club ${teamId} tagged ${n}`);
    assert.ok(teamCap(st, teamId).space >= 0, `club ${teamId} over the cap`);
  }
}

// Cap block uses the same Sign-shaped reason.
{
  const st = newGame({ seed: 6 });
  const p = plantExpiring(st, st.userTeamId);
  p.contract = makeContract(new Rng(1), LEAGUE_MINIMUM, 1, st.season, 0);
  // Burn the space so the published tender cannot fit.
  st.teams[st.userTeamId].deadCap = teamCap(st, st.userTeamId).cap;
  const rng = new Rng(st.rngState);
  const blocked = applyFranchiseTag(st, st.userTeamId, p.id, rng);
  assert.equal(blocked.ok, false);
  assert.match(blocked.reason ?? "", /Not enough cap space/);
  assert.equal(clubHasFranchiseTag(st, st.userTeamId), false);
}

// Tender is at least 120% of last year's hit when that beats the top-5 average.
{
  const st = newGame({ seed: 7 });
  const p = plantExpiring(st, st.userTeamId);
  const last = capHit(p.contract);
  const tender = franchiseTagSalary(st, p);
  assert.ok(tender >= Math.round(last * 1.2) || tender >= last);
  assert.ok(tender >= LEAGUE_MINIMUM);
}

// (5) Headless recap → tag → FA still opens a market.
{
  const st = newGame({ seed: 8 });
  st.phase = "offseason-recap";
  const kept = plantExpiring(st, st.userTeamId);
  kept.age = 24;
  const msg1 = advanceOffseason(st);
  assert.equal(st.phase, "offseason-tag", msg1);
  assert.ok(!st.fa, "FA board is not live during the tag window");
  const msg2 = advanceOffseason(st);
  assert.equal(st.phase, "offseason-fa", msg2);
  assert.ok(st.fa, "market opened");
  assert.ok(faPool(st).length > 0, "FA pool is not empty");
  assert.ok(freeAgents(st).length > 0);
}

// Two clubs tag different players the same season: each club's lookup
// resolves to ITS OWN tagged player, not the first league-wide match.
{
  const st = newGame({ seed: 9 });
  const otherId = st.teams.find((t) => t.id !== st.userTeamId)!.id;
  const ours = plantExpiring(st, st.userTeamId);
  const theirs = plantExpiring(st, otherId);
  assert.notEqual(ours.id, theirs.id);
  const rng = new Rng(st.rngState);
  assert.equal(applyFranchiseTag(st, otherId, theirs.id, rng).ok, true);
  assert.equal(applyFranchiseTag(st, st.userTeamId, ours.id, rng).ok, true);

  const oursLookup = clubFranchiseTaggedPlayer(st, st.userTeamId);
  const theirsLookup = clubFranchiseTaggedPlayer(st, otherId);
  assert.ok(oursLookup);
  assert.ok(theirsLookup);
  assert.equal(oursLookup!.id, ours.id, "user club must resolve its own tag");
  assert.equal(theirsLookup!.id, theirs.id, "other club must resolve its own tag");
  assert.notEqual(oursLookup!.id, theirsLookup!.id);

  // The old Hub card used players.find(isFranchiseTagged). Put the other
  // club's man first in the array so that path would name the wrong player.
  const theirsIdx = st.players.findIndex((p) => p.id === theirs.id);
  const oursIdx = st.players.findIndex((p) => p.id === ours.id);
  if (theirsIdx > oursIdx) {
    const [moved] = st.players.splice(theirsIdx, 1);
    st.players.splice(oursIdx, 0, moved);
  }
  const leagueFirst = st.players.find((p) => isFranchiseTagged(st, p.id));
  assert.ok(leagueFirst);
  assert.equal(leagueFirst!.id, theirs.id, "league-wide find hits the other club");
  assert.notEqual(leagueFirst!.id, ours.id);
  assert.equal(clubFranchiseTaggedPlayer(st, st.userTeamId)!.id, ours.id);
}

function ok(label: string) { console.log("ok   ", label); }

// Three consecutive tags: 120% then 144%/QB; no fourth.
{
  const st = newGame({ seed: 21 });
  const p = clubActive(st, st.userTeamId)
    .filter((x) => x.pos !== "QB" && x.contract)
    .sort((a, b) => b.ovr - a.ovr)[0] ?? plantExpiring(st, st.userTeamId);
  p.age = 25;
  p.retired = false;
  p.contract!.yearsRemaining = 1;
  p.contract!.baseSalary = [p.contract!.baseSalary[0] ?? LEAGUE_MINIMUM];
  const rng = new Rng(st.rngState);
  const first = applyFranchiseTag(st, st.userTeamId, p.id, rng);
  assert.equal(first.ok, true, first.reason ?? "first tag");
  const tag1 = (st.franchiseTags ?? []).find((t) => t.playerId === p.id);
  assert.equal(tag1?.consecutiveTags, 1);
  const tender1 = capHit(p.contract);
  assert.ok(tender1 > 0);

  st.season += 1;
  assert.equal(p.contract?.yearsRemaining, 1);
  const tender2 = franchiseTagSalary(st, p);
  assert.equal(tender2, Math.round(tender1 * 1.2));
  const second = applyFranchiseTag(st, st.userTeamId, p.id, rng);
  assert.equal(second.ok, true, second.reason ?? "second tag");
  const tag2 = (st.franchiseTags ?? []).find((t) => t.playerId === p.id && t.season === st.season);
  assert.equal(tag2?.consecutiveTags, 2);
  assert.equal(capHit(p.contract), tender2);

  st.season += 1;
  const qbHits = st.players
    .filter((x) => !x.retired && !x.prospect && x.pos === "QB" && x.contract)
    .map((x) => capHit(x.contract))
    .filter((h) => h > 0)
    .sort((a, b) => b - a)
    .slice(0, 5);
  const qbTender = qbHits.length
    ? Math.round(qbHits.reduce((a, b) => a + b, 0) / qbHits.length)
    : tender2;
  const tender3 = franchiseTagSalary(st, p);
  assert.equal(tender3, Math.max(Math.round(tender2 * 1.44), qbTender));
  const third = applyFranchiseTag(st, st.userTeamId, p.id, rng);
  assert.equal(third.ok, true, third.reason ?? "third tag");
  const tag3 = (st.franchiseTags ?? []).find((t) => t.playerId === p.id && t.season === st.season);
  assert.equal(tag3?.consecutiveTags, 3);

  st.season += 1;
  const fourth = applyFranchiseTag(st, st.userTeamId, p.id, rng);
  assert.equal(fourth.ok, false);
  assert.match(fourth.reason ?? "", /three consecutive/i);
  ok("three-tag escalator; no fourth");
}

// Rebuild club never tags.
{
  const st = newGame({ seed: 22 });
  const cpuId = st.teams.find((t) => t.id !== st.userTeamId)!.id;
  plantExpiring(st, cpuId);
  for (const p of clubActive(st, cpuId)) {
    if (p.ovr >= 75) p.ovr = 74;
    p.age = 22;
  }
  if (st.teams[cpuId].frontOffice) {
    st.teams[cpuId].frontOffice!.winNow = 0.05;
  }
  assert.equal(teamOutlook(st, cpuId).posture, "rebuild");
  const rng = new Rng(st.rngState);
  runCpuFranchiseTags(st, rng);
  assert.equal((st.franchiseTags ?? []).some((t) => t.teamId === cpuId), false);
  ok("rebuild club never tags");
}

// A tag in the same window does not change another club's tender.
{
  const st = newGame({ seed: 23 });
  const otherId = st.teams.find((t) => t.id !== st.userTeamId)!.id;
  const ours = plantExpiring(st, st.userTeamId);
  const theirs = (() => {
    const samePos = clubActive(st, otherId).find((p) => p.pos === ours.pos && p.contract);
    assert.ok(samePos, "need a same-position player on the other club");
    samePos.age = 25;
    samePos.retired = false;
    samePos.contract!.yearsRemaining = 1;
    samePos.contract!.baseSalary = [LEAGUE_MINIMUM];
    samePos.contract!.signingBonus = 0;
    return samePos;
  })();
  // Make this club's tag large enough that a live re-average would move.
  st.teams[st.userTeamId].deadCap = 0;
  for (const x of clubActive(st, st.userTeamId)) {
    if (x.id === ours.id || !x.contract) continue;
    x.contract.baseSalary = x.contract.baseSalary.map(() => LEAGUE_MINIMUM);
    x.contract.signingBonus = 0;
  }
  ours.contract = makeContract(new Rng(1), teamCap(st, st.userTeamId).cap * 0.18, 1, st.season, 0);
  const before = franchiseTagSalary(st, theirs);
  const rng = new Rng(st.rngState);
  const tagged = applyFranchiseTag(st, st.userTeamId, ours.id, rng);
  assert.equal(tagged.ok, true, tagged.reason ?? "tag");
  const after = franchiseTagSalary(st, theirs);
  assert.equal(after, before, "same-window tag must not raise another club's tender");
  ok("snapshot: same-window tag does not move another tender");
}
