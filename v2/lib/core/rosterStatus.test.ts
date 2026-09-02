/**
 * Regression: IR and practice squad as a status flag on state.players.
 *
 * Injured men occupied the 53 until cut. Cutdown leftovers went to FA only.
 * IR frees a slot; PS holds 16 after the 90→53 cut. Missing status = active.
 *
 * Run: npx tsx lib/core/rosterStatus.test.ts
 */
import assert from "node:assert/strict";
import { newGame } from "./newGame";
import {
  enterDraft, finalizeOffseason, runUdfaChase, simEntireDraft,
} from "./offseason";
import { askingPrice, fillRoster, freeActiveSlot, reconcileRoster, signPlayer } from "./offseason/contracts";
import { resolveWaivers } from "./waivers";
import { makeContract } from "./generate";
import { Rng } from "./rng";
import { isActiveRoster, isOnWaivers, practiceSquadCount, rosterCount, rosterIssues } from "./select";
import {
  CAMP_ROSTER_LIMIT, IR_MIN_GAMES, IR_RETURN_DESIGNATIONS, LEAGUE_MINIMUM,
  PRACTICE_SQUAD_LIMIT, PS_ELEVATIONS_PER_PLAYER, ROSTER_LIMIT,
} from "./types";
import { rosterCapView } from "../view/rosterCap";
import {
  activateFromIr, autoActivateFromIr, autoDesignateIr, canDesignateIr, designateIr,
  elevateFromPs, foldPracticeSquad, placeOnPs, resetSeasonRosterFlags, tickIrGames,
} from "./rosterStatus";

function clubPlayers(st: ReturnType<typeof newGame>, teamId: number) {
  return st.players.filter((p) => p.teamId === teamId && !p.retired && !p.prospect);
}

function cheapestFa(st: ReturnType<typeof newGame>) {
  return st.players
    .filter((p) => p.teamId === null && !p.retired && !p.prospect)
    .sort((a, b) => a.ovr - b.ovr)[0];
}

// Missing status is active. JSON round-trip keeps the optional field.
{
  const st = newGame({ seed: 1 });
  const p = clubPlayers(st, st.userTeamId)[0];
  assert.equal(p.status, undefined);
  assert.equal(isActiveRoster(p), true);
  assert.equal(rosterCount(st, st.userTeamId), ROSTER_LIMIT);

  p.status = "ir";
  p.irGames = 2;
  const raw = JSON.parse(JSON.stringify(st)) as typeof st;
  const back = raw.players.find((x) => x.id === p.id)!;
  assert.equal(back.status, "ir");
  assert.equal(back.irGames, 2);
  const fresh = raw.players.find((x) => x.status === undefined || x.status === null);
  assert.ok(fresh, "old-save players without status survive stringify");
  assert.equal(isActiveRoster(fresh), true);
}

// Injured-on-53 still counts until designated. IR frees a slot; sign works.
{
  const st = newGame({ seed: 2 });
  const p = clubPlayers(st, st.userTeamId).sort((a, b) => a.ovr - b.ovr)[0];
  p.injuryWeeks = 8;
  p.injuryDesc = "Torn ACL";
  assert.equal(rosterCount(st, st.userTeamId), ROSTER_LIMIT, "injured still occupies the 53");
  assert.equal(canDesignateIr(p), true);
  assert.equal(rosterIssues(st, st.userTeamId).filter((i) => i.kind === "underLimit").length, 0);

  const named = designateIr(st, p.id);
  assert.equal(named.ok, true, named.reason ?? "designate");
  assert.equal(p.status, "ir");
  assert.equal(rosterCount(st, st.userTeamId), ROSTER_LIMIT - 1);
  assert.ok(rosterIssues(st, st.userTeamId).some((i) => i.kind === "underLimit"));

  const tooSoon = designateIr(st, p.id);
  assert.equal(tooSoon.ok, false);

  const fa = cheapestFa(st);
  assert.ok(fa);
  const rng = new Rng(st.rngState);
  const signed = signPlayer(st, fa.id, st.userTeamId, 1, askingPrice(st, fa), rng);
  assert.equal(signed.ok, true, signed.reason ?? "IR must free a slot so a replacement can sign");
  assert.equal(rosterCount(st, st.userTeamId), ROSTER_LIMIT);
  st.rngState = rng.state;
}

// Short injuries cannot go on IR.
{
  const st = newGame({ seed: 3 });
  const p = clubPlayers(st, st.userTeamId)[0];
  p.injuryWeeks = 2;
  assert.equal(canDesignateIr(p), false);
  assert.equal(designateIr(st, p.id).ok, false);
  assert.equal(rosterCount(st, st.userTeamId), ROSTER_LIMIT);
}

// PS does not count against 53. Elevate burns one of 3.
{
  const st = newGame({ seed: 4 });
  const p = clubPlayers(st, st.userTeamId).sort((a, b) => a.ovr - b.ovr)[0];
  const parked = placeOnPs(st, p.id);
  assert.equal(parked.ok, true, parked.reason ?? "place");
  assert.equal(p.status, "ps");
  assert.equal(rosterCount(st, st.userTeamId), ROSTER_LIMIT - 1);
  assert.equal(practiceSquadCount(st, st.userTeamId), 1);

  for (let n = 1; n <= PS_ELEVATIONS_PER_PLAYER; n++) {
    const up = elevateFromPs(st, p.id);
    assert.equal(up.ok, true, up.reason ?? "elevate");
    assert.equal(isActiveRoster(p), true);
    assert.equal(p.psElevations, n);
    assert.equal(rosterCount(st, st.userTeamId), ROSTER_LIMIT);
    const back = placeOnPs(st, p.id);
    assert.equal(back.ok, true, back.reason ?? "re-place");
  }
  const burned = elevateFromPs(st, p.id);
  assert.equal(burned.ok, false);
  assert.match(burned.reason ?? "", /3/);
}

// Return-from-IR respects min 4 games and the 8-designation cap.
{
  const st = newGame({ seed: 5 });
  const p = clubPlayers(st, st.userTeamId).sort((a, b) => a.ovr - b.ovr)[0];
  p.injuryWeeks = 10;
  assert.equal(designateIr(st, p.id).ok, true);

  p.injuryWeeks = 0;
  p.injuryDesc = null;
  const stillShort = activateFromIr(st, p.id);
  assert.equal(stillShort.ok, false);
  assert.match(stillShort.reason ?? "", /4/);

  p.irGames = IR_MIN_GAMES - 1;
  assert.equal(activateFromIr(st, p.id).ok, false);

  p.irGames = IR_MIN_GAMES;
  const back = activateFromIr(st, p.id);
  assert.equal(back.ok, true, back.reason ?? "activate");
  assert.equal(isActiveRoster(p), true);
  assert.equal(st.teams[st.userTeamId].irReturnsUsed, 1);

  st.teams[st.userTeamId].irReturnsUsed = IR_RETURN_DESIGNATIONS;
  const q = clubPlayers(st, st.userTeamId).find((x) => x.id !== p.id)!;
  q.injuryWeeks = 12;
  assert.equal(designateIr(st, q.id).ok, true, "designations gate returns, not the IR place");
  q.injuryWeeks = 0;
  q.irGames = IR_MIN_GAMES;
  const capped = activateFromIr(st, q.id);
  assert.equal(capped.ok, false);
  assert.match(capped.reason ?? "", /designation/);
}

// tickIrGames only credits clubs that played.
{
  const st = newGame({ seed: 6 });
  const p = clubPlayers(st, st.userTeamId)[0];
  p.injuryWeeks = 8;
  designateIr(st, p.id);
  tickIrGames(st, [st.userTeamId]);
  assert.equal(p.irGames, 1);
  tickIrGames(st, [st.userTeamId + 1]);
  assert.equal(p.irGames, 1);
}

// CPU auto-IRs its own long injuries when designations remain; never the user.
{
  const st = newGame({ seed: 7 });
  st.phase = "regular";
  const user = clubPlayers(st, st.userTeamId)[0];
  user.injuryWeeks = 10;
  const cpuId = st.teams.find((t) => t.id !== st.userTeamId)!.id;
  const cpu = clubPlayers(st, cpuId).sort((a, b) => a.ovr - b.ovr)[0];
  cpu.injuryWeeks = 10;
  autoDesignateIr(st);
  assert.equal(user.status, undefined);
  assert.equal(cpu.status, "ir");
  assert.equal(rosterCount(st, cpuId), ROSTER_LIMIT - 1);

  const rng = new Rng(st.rngState);
  fillRoster(st, cpuId, rng);
  assert.equal(rosterCount(st, cpuId), ROSTER_LIMIT);
  cpu.injuryWeeks = 0;
  cpu.injuryDesc = null;
  cpu.irGames = IR_MIN_GAMES;
  autoActivateFromIr(st, (id) => freeActiveSlot(st, id));
  assert.equal(isActiveRoster(cpu), true);
  assert.equal(rosterCount(st, cpuId), ROSTER_LIMIT);
  assert.equal(user.status, undefined);
  st.rngState = rng.state;
}

// Return designations gate activate, not the IR place. CPU still IRs after 8.
{
  const st = newGame({ seed: 12 });
  st.phase = "regular";
  const cpuId = st.teams.find((t) => t.id !== st.userTeamId)!.id;
  st.teams[cpuId].irReturnsUsed = IR_RETURN_DESIGNATIONS;
  const cpu = clubPlayers(st, cpuId).sort((a, b) => a.ovr - b.ovr)[0];
  cpu.injuryWeeks = 10;
  autoDesignateIr(st);
  assert.equal(cpu.status, "ir");
  assert.equal(rosterCount(st, cpuId), ROSTER_LIMIT - 1);
  cpu.injuryWeeks = 0;
  cpu.irGames = IR_MIN_GAMES;
  autoActivateFromIr(st, () => true);
  assert.equal(cpu.status, "ir", "8th return used: place still works, activate does not");
}

// Cutdown extras hit waivers first; unclaimed stash to PS (up to 16).
{
  const st = newGame({ seed: 11 });
  st.phase = "offseason-final";
  const fas = st.players.filter((p) => p.teamId === null && !p.retired && !p.prospect);
  const rng = new Rng(st.rngState);
  for (let i = 0; i < 7; i++) {
    fas[i].teamId = st.userTeamId;
    fas[i].pos = "WR";
    fas[i].ovr = 20;
    fas[i].pot = 20;
    fas[i].age = 29;
    fas[i].draftedRound = null;
    fas[i].contract = makeContract(rng, LEAGUE_MINIMUM, 1, st.season, 0);
  }
  assert.equal(rosterCount(st, st.userTeamId), 60);
  reconcileRoster(st, st.userTeamId, rng, ROSTER_LIMIT, true);
  assert.equal(rosterCount(st, st.userTeamId), ROSTER_LIMIT);
  assert.equal(practiceSquadCount(st, st.userTeamId), 0, "cutdown extras wait on waivers");
  assert.equal((st.waivers ?? []).length, 7);
  for (const w of st.waivers ?? []) {
    assert.equal(isOnWaivers(st, w.playerId), true);
  }
  resolveWaivers(st);
  assert.equal(practiceSquadCount(st, st.userTeamId), 7);
  st.rngState = rng.state;
}

// finalizeOffseason still locks every club's ACTIVE count at 53.
{
  const st = newGame({ seed: 1 });
  enterDraft(st);
  simEntireDraft(st);
  const rng = new Rng(st.rngState);
  runUdfaChase(st, rng);
  st.rngState = rng.state;
  st.phase = "offseason-final";

  const userN = rosterCount(st, st.userTeamId);
  assert.ok(userN > ROSTER_LIMIT, `user camp roster ${userN} should sit over 53`);
  assert.ok(userN <= CAMP_ROSTER_LIMIT);
  assert.equal(rosterIssues(st, st.userTeamId).filter((i) => i.kind === "overLimit").length, 0);

  finalizeOffseason(st);
  for (const t of st.teams) {
    assert.equal(rosterCount(st, t.id), ROSTER_LIMIT, `${t.abbr} active after cutdown`);
    assert.ok(practiceSquadCount(st, t.id) <= PRACTICE_SQUAD_LIMIT, `${t.abbr} PS over 16`);
  }
  assert.equal(st.phase, "preseason");
  const after = rosterCapView(st, st.userTeamId);
  assert.equal(after.label, "53/53");
  assert.equal(after.cutdown, false);
}

// Camp 90 still works: fill/reconcile do not dump to 53, PS stash is cutdown-only.
{
  const st = newGame({ seed: 8 });
  st.phase = "offseason-final";
  const fas = st.players.filter((p) => p.teamId === null && !p.retired && !p.prospect);
  const rng = new Rng(st.rngState);
  for (let i = 0; i < 7; i++) {
    fas[i].teamId = st.userTeamId;
    fas[i].contract = makeContract(rng, LEAGUE_MINIMUM, 1, st.season, 0);
  }
  fillRoster(st, st.userTeamId, rng);
  assert.equal(rosterCount(st, st.userTeamId), 60, "camp fill must not trim to 53");
  reconcileRoster(st, st.userTeamId, rng);
  assert.equal(rosterCount(st, st.userTeamId), 60, "camp reconcile must not dump to 53");
  assert.equal(practiceSquadCount(st, st.userTeamId), 0, "camp reconcile does not stash to PS");
  st.rngState = rng.state;
}

// fold + reset: last year's PS re-enter the 53 pool; elevation / return counters clear.
{
  const st = newGame({ seed: 9 });
  const p = clubPlayers(st, st.userTeamId)[0];
  placeOnPs(st, p.id);
  p.psElevations = 2;
  st.teams[st.userTeamId].irReturnsUsed = 3;
  foldPracticeSquad(st, st.userTeamId);
  assert.equal(isActiveRoster(p), true);
  resetSeasonRosterFlags(st);
  assert.equal(p.psElevations, undefined);
  assert.equal(st.teams[st.userTeamId].irReturnsUsed, undefined);
}

console.log("irps: ok");
