/**
 * Regression: cuts hit waivers before FA or the cutter's practice squad.
 *
 * Design doc Part 5: everyone cut passes through waivers before you can
 * stash him. Claim order is inverse standings. Missing state.waivers =
 * nobody on the wire.
 *
 * Run: npx tsx lib/core/waivers.test.ts
 */
import assert from "node:assert/strict";
import { newGame } from "./newGame";
import { makeContract } from "./generate";
import { cutPlayer, reconcileRoster } from "./offseason/contracts";
import { designateIr, placeOnPs } from "./rosterStatus";
import { Rng } from "./rng";
import { freeAgents, isOnWaivers, practiceSquadCount, rosterCount } from "./select";
import { LEAGUE_MINIMUM, Player, PRACTICE_SQUAD_LIMIT, ROSTER_LIMIT } from "./types";
import { startRegularSeason } from "./season/engine";
import { enterCampAfterDraft, enterDraft, finalizeOffseason, simEntireDraft } from "./offseason";
import {
  resolveWaivers, settleWaivers, submitWaiverClaim, waiverPriority, waiverWire, withdrawWaiverClaim,
} from "./waivers";

function clubPlayers(st: ReturnType<typeof newGame>, teamId: number) {
  return st.players.filter((p) => p.teamId === teamId && !p.retired && !p.prospect);
}

function weakest(st: ReturnType<typeof newGame>, teamId: number) {
  return clubPlayers(st, teamId)
    .filter((p) => !p.status)
    .sort((a, b) => a.ovr - b.ovr)[0];
}

/** Below replacement at WR, no upside. Clubs will not dump a surplus WR for him. */
function makeUnclaimable(p: Player): void {
  p.pos = "WR";
  p.ovr = 20;
  p.pot = 20;
  p.ceiling = 20;
  p.age = 29;
  p.draftedRound = null;
}

// Cut → on waivers, not FA. Contract stays. Old saves missing the list load.
{
  const st = newGame({ seed: 1 });
  assert.ok(!("waivers" in st) || st.waivers === undefined);
  const raw = JSON.parse(JSON.stringify(st)) as typeof st;
  assert.ok(!("waivers" in raw) || raw.waivers === undefined);
  assert.equal(waiverWire(raw).length, 0);

  const p = weakest(st, st.userTeamId);
  const contract = p.contract;
  assert.ok(contract);
  const beforeDead = st.teams[st.userTeamId].deadCap ?? 0;
  const cut = cutPlayer(st, p.id);
  assert.equal(cut.ok, true, cut.reason ?? "cut");
  assert.equal(p.teamId, null);
  assert.equal(p.status, undefined);
  assert.equal(p.contract, contract);
  assert.equal(isOnWaivers(st, p.id), true);
  assert.equal(freeAgents(st).some((x) => x.id === p.id), false);
  assert.equal(st.teams[st.userTeamId].deadCap ?? 0, beforeDead);
  assert.equal(rosterCount(st, st.userTeamId), ROSTER_LIMIT - 1);
  assert.equal((st.waivers ?? []).some((w) => w.playerId === p.id && w.originalTeamId === st.userTeamId), true);

  const trip = JSON.parse(JSON.stringify(st)) as typeof st;
  assert.equal(trip.waivers?.length, 1);
  assert.equal(isOnWaivers(trip, p.id), true);
}

// Place on PS from the roster is the same waive — he does not skip to PS.
{
  const st = newGame({ seed: 2 });
  const p = weakest(st, st.userTeamId);
  const cut = cutPlayer(st, p.id);
  assert.equal(cut.ok, true);
  assert.notEqual(p.status, "ps");
  assert.equal(isOnWaivers(st, p.id), true);
  assert.equal(practiceSquadCount(st, st.userTeamId), 0);
}

// Unclaimed at window close: original club stashes to PS if under 16.
{
  const st = newGame({ seed: 3 });
  const p = weakest(st, st.userTeamId);
  makeUnclaimable(p);
  const cut = cutPlayer(st, p.id);
  assert.equal(cut.ok, true);
  resolveWaivers(st);
  assert.equal(isOnWaivers(st, p.id), false);
  assert.equal(p.status, "ps", `unclaimed stash; landed team=${p.teamId} status=${p.status}`);
  assert.equal(p.teamId, st.userTeamId);
  assert.ok(p.contract);
  assert.equal(practiceSquadCount(st, st.userTeamId), 1);
  assert.equal(st.waivers, undefined);
}

// Claim moves him to the claiming club's 53, contract as-is. No cash fee.
{
  const st = newGame({ seed: 4 });
  const cpuId = st.teams.find((t) => t.id !== st.userTeamId)!.id;
  const p = weakest(st, cpuId);
  makeUnclaimable(p);
  const kept = p.contract;
  assert.ok(kept);
  assert.equal(cutPlayer(st, p.id).ok, true);

  const slot = weakest(st, st.userTeamId);
  slot.injuryWeeks = 10;
  assert.equal(designateIr(st, slot.id).ok, true);
  assert.ok(rosterCount(st, st.userTeamId) < ROSTER_LIMIT);

  const claim = submitWaiverClaim(st, p.id);
  assert.equal(claim.ok, true, claim.reason ?? "claim");
  resolveWaivers(st);
  assert.equal(p.teamId, st.userTeamId);
  assert.equal(p.status, undefined);
  assert.equal(p.contract, kept);
  assert.equal(isOnWaivers(st, p.id), false);
  assert.equal(rosterCount(st, st.userTeamId), ROSTER_LIMIT);
}

// Original club cannot claim its own waived player. Withdraw works.
{
  const st = newGame({ seed: 5 });
  const p = weakest(st, st.userTeamId);
  assert.equal(cutPlayer(st, p.id).ok, true);
  const own = submitWaiverClaim(st, p.id);
  assert.equal(own.ok, false);
  const cpuId = st.teams.find((t) => t.id !== st.userTeamId)!.id;
  const q = weakest(st, cpuId);
  makeUnclaimable(q);
  assert.equal(cutPlayer(st, q.id).ok, true);
  const slot = weakest(st, st.userTeamId);
  slot.injuryWeeks = 10;
  designateIr(st, slot.id);
  assert.equal(submitWaiverClaim(st, q.id).ok, true);
  assert.equal(withdrawWaiverClaim(st, q.id).ok, true);
  resolveWaivers(st);
  assert.notEqual(q.teamId, st.userTeamId);
}

// Unclaimed and PS full → FA. Dead money then, not at the waive.
{
  const st = newGame({ seed: 6 });
  const extras = clubPlayers(st, st.userTeamId).filter((p) => !p.status);
  for (let i = 0; i < PRACTICE_SQUAD_LIMIT; i++) {
    extras[i].ovr = 80;
    assert.equal(placeOnPs(st, extras[i].id).ok, true);
  }
  assert.equal(practiceSquadCount(st, st.userTeamId), PRACTICE_SQUAD_LIMIT);
  const p = extras[PRACTICE_SQUAD_LIMIT];
  makeUnclaimable(p);
  const beforeDead = st.teams[st.userTeamId].deadCap ?? 0;
  assert.equal(cutPlayer(st, p.id).ok, true);
  assert.ok(p.contract);
  assert.equal(st.teams[st.userTeamId].deadCap ?? 0, beforeDead);
  resolveWaivers(st);
  assert.equal(p.teamId, null);
  assert.equal(p.contract, null);
  assert.equal(isOnWaivers(st, p.id), false);
  assert.ok(freeAgents(st).some((x) => x.id === p.id));
  assert.ok((st.teams[st.userTeamId].deadCap ?? 0) >= beforeDead);
}

// Inverse standings: worse record claims first. CPU with a slot takes him.
{
  const st = newGame({ seed: 7 });
  st.phase = "regular";
  st.week = 8;
  const user = weakest(st, st.userTeamId);
  user.ovr = 88;
  const kept = user.contract;
  assert.equal(cutPlayer(st, user.id).ok, true);

  const order = waiverPriority(st);
  const firstCpu = order.find((id) => id !== st.userTeamId);
  assert.ok(firstCpu !== undefined);
  const hole = weakest(st, firstCpu);
  hole.injuryWeeks = 10;
  designateIr(st, hole.id);
  resolveWaivers(st);
  assert.equal(user.teamId, firstCpu);
  assert.equal(user.contract, kept);
}

// Cutdown extras go to waivers, not straight to PS or FA. Resolve stashes
// unclaimed leftovers. Active 53 stays locked.
{
  const st = newGame({ seed: 8 });
  st.phase = "offseason-final";
  const fas = st.players
    .filter((p) => p.teamId === null && !p.retired && !p.prospect)
    .sort((a, b) => a.ovr - b.ovr);
  const rng = new Rng(st.rngState);
  for (let i = 0; i < 5; i++) {
    fas[i].teamId = st.userTeamId;
    makeUnclaimable(fas[i]);
    fas[i].contract = makeContract(rng, LEAGUE_MINIMUM, 1, st.season, 0);
  }
  assert.equal(rosterCount(st, st.userTeamId), 58);
  reconcileRoster(st, st.userTeamId, rng, ROSTER_LIMIT, true);
  assert.equal(rosterCount(st, st.userTeamId), ROSTER_LIMIT);
  assert.equal(practiceSquadCount(st, st.userTeamId), 0);
  const waived = (st.waivers ?? []).filter((w) => w.originalTeamId === st.userTeamId);
  assert.equal(waived.length, 5);
  for (const w of waived) {
    assert.equal(isOnWaivers(st, w.playerId), true);
    assert.equal(freeAgents(st).some((x) => x.id === w.playerId), false);
  }
  resolveWaivers(st);
  assert.equal(rosterCount(st, st.userTeamId), ROSTER_LIMIT);
  assert.equal(practiceSquadCount(st, st.userTeamId), 5);
  st.rngState = rng.state;
}

// startRegularSeason closes the window (preseason leftovers).
{
  const st = newGame({ seed: 9 });
  st.phase = "preseason";
  const p = weakest(st, st.userTeamId);
  makeUnclaimable(p);
  assert.equal(cutPlayer(st, p.id).ok, true);
  startRegularSeason(st);
  assert.equal(p.status, "ps");
  assert.equal(p.teamId, st.userTeamId);
  assert.equal(st.waivers, undefined);
}

// A club that cuts to make a claim slot puts that man on the NEXT window.
// One resolve leaves him; settle closes the chain.
{
  const st = newGame({ seed: 10 });
  st.phase = "regular";
  st.week = 8;
  const p = weakest(st, st.userTeamId);
  p.pos = "WR";
  p.ovr = 92;
  p.pot = 92;
  p.ceiling = 92;
  assert.equal(cutPlayer(st, p.id).ok, true);
  resolveWaivers(st);
  assert.ok(p.teamId !== null && p.teamId !== st.userTeamId, "CPU claims the stud");
  assert.ok((st.waivers ?? []).length >= 1, "claim-cut sits on the next window");
  assert.equal((st.waivers ?? []).some((w) => w.playerId === p.id), false);
  settleWaivers(st);
  assert.equal(st.waivers, undefined);
}

// Headless draft + camp fill + Start the Season: extras hit waivers first,
// then the claim-cut chain settles so the desk is not the whole dump.
{
  const st = newGame({ seed: 42 });
  enterDraft(st);
  simEntireDraft(st);
  const rng = new Rng(st.rngState);
  enterCampAfterDraft(st, rng);
  st.rngState = rng.state;
  const extras = st.teams.reduce((n, t) => n + Math.max(0, rosterCount(st, t.id) - ROSTER_LIMIT), 0);
  assert.ok(extras > 200, `camp dump too small: extras=${extras}`);
  const logAt = st.log.length;
  finalizeOffseason(st);
  const waived = st.log.slice(logAt).filter((e) => e.text.includes(" waived ")).length;
  assert.ok(waived >= extras, `extras must hit waivers; waived=${waived} extras=${extras}`);
  assert.equal(st.phase, "preseason");
  for (const t of st.teams) {
    assert.equal(rosterCount(st, t.id), ROSTER_LIMIT, `${t.abbr} after cutdown`);
  }
  const wire = st.waivers?.length ?? 0;
  assert.ok(wire < 40, `Start the Season must settle the claim chain; wire=${wire}`);
  let ps = 0;
  for (const t of st.teams) ps += practiceSquadCount(st, t.id);
  assert.ok(ps > 0, "unclaimed extras may PS-stash");
  startRegularSeason(st);
  assert.ok((st.waivers?.length ?? 0) < 40, `season-start wire=${st.waivers?.length ?? 0}`);
}

console.log("waivers: ok");
