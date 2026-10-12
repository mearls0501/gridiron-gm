/**
 * People-layer coaches: generation, effectiveCoach, old-save backfill,
 * parent-stream stillness, CPU poach of the user OC.
 *
 * Run: npx tsx lib/core/coaches.test.ts
 */
import assert from "node:assert/strict";
import { newGame } from "./newGame";
import { decodeSave, encodeSave } from "../store/codec";
import { effectiveCoach, setCallSheet } from "./callSheet";
import {
  COORD_RATING_CENTRE,
  COORD_YARDS_PER_POINT,
  COORDINATOR_ROLES,
  COACH_ROLES,
  EMPTY_COORDINATOR_COST,
  STC_FG_PER_POINT,
  STC_PUNT_YARDS_PER_POINT,
  coordinatorPlayYards,
  emptyCoordinatorFlags,
  ensureCoaches,
  setPlayedShadow,
  zeroPlayedShadow,
  fireCoach,
  fireCpuHeadCoaches,
  hireCoach,
  peopleCoachDials,
  runCoachCarousel,
  specialTeamsRating,
  staffSlot,
  tickCoachContracts,
  vacantDcYards,
  vacantOcYards,
  vacantStcFgDelta,
  vacantStcPuntDelta,
} from "./coaches";
import { clamp } from "./rng";
import { GameState } from "./types";

function ok(label: string) { console.log("ok   ", label); }

function stripPeople(st: GameState): GameState {
  const raw = JSON.parse(JSON.stringify(st)) as GameState;
  for (const t of raw.teams) {
    delete t.coaches;
    delete t.owner;
  }
  delete raw.coachMarket;
  delete raw.nextCoachId;
  return raw;
}

{
  const st = stripPeople(newGame({ seed: 41 }));
  const before = st.rngState;
  assert.equal(st.teams[st.userTeamId].coaches, undefined, "newGame does not touch generate.ts");
  ensureCoaches(st);
  assert.equal(st.rngState, before, "coaches child stream must not move the parent");
  let sharedCoordinators = 0;
  for (const t of st.teams) {
    assert.ok(t.coaches?.hc && t.coaches.oc && t.coaches.dc && t.coaches.stc, `${t.abbr} missing a chair`);
    assert.equal(t.coaches.hc.name, t.coach.name, "HC keeps the generated coach name");
    assert.equal(t.coaches.hc.offense, t.coach.offense, "HC still copies Team.coach");
    assert.equal(t.coaches.hc.passBias, t.coach.passBias, "HC still copies Team.coach");
    assert.equal(peopleCoachDials(t)!.offense, t.coaches.oc.offense, `${t.abbr} filled OC is not penalized`);
    for (const role of COORDINATOR_ROLES) {
      const person = staffSlot(t, role)!;
      assert.ok(person.offense >= 25 && person.offense <= 95, `${t.abbr} ${role} offense`);
      assert.ok(person.defense >= 25 && person.defense <= 95, `${t.abbr} ${role} defense`);
      assert.ok(person.development >= 25 && person.development <= 95, `${t.abbr} ${role} development`);
      if (
        person.offense === t.coach.offense &&
        person.defense === t.coach.defense &&
        person.development === t.coach.development &&
        person.aggression === t.coach.aggression &&
        person.passBias === t.coach.passBias &&
        person.shadowTendency === t.coach.shadowTendency
      ) sharedCoordinators++;
    }
  }
  assert.equal(sharedCoordinators, 0, "coordinators must not be copies of the head coach");
  assert.ok((st.coachMarket?.length ?? 0) >= 8, "unemployed market is stocked");
  ok("ensure fills 32 clubs; HC copies, coordinators do not; parent stream still");
}

{
  const a = newGame({ seed: 42 });
  const b = newGame({ seed: 42 });
  ensureCoaches(a);
  ensureCoaches(b);
  assert.equal(a.teams[0].coaches!.oc!.name, b.teams[0].coaches!.oc!.name);
  assert.equal(a.teams[7].coaches!.dc!.name, b.teams[7].coaches!.dc!.name);
  const c = newGame({ seed: 43 });
  ensureCoaches(c);
  assert.notEqual(a.teams[0].coaches!.oc!.name, c.teams[0].coaches!.oc!.name);
  ok("same seed same OC names; different seed differs");
}

{
  const st = newGame({ seed: 11 });
  const team = st.teams[st.userTeamId];
  const bare = JSON.parse(JSON.stringify(team));
  delete bare.coaches;
  assert.equal(effectiveCoach(bare), bare.coach, "no people, no sheet → same reference");
  ensureCoaches(st);
  assert.equal(effectiveCoach(team).passBias, team.coaches!.oc!.passBias, "OC pass bias is the call");
  assert.equal(effectiveCoach(team).offense, team.coaches!.oc!.offense, "filled OC is not penalized");
  const oc = team.coaches!.oc!;
  const original = oc.passBias;
  oc.passBias = original === 0.25 ? -0.25 : 0.25;
  const blended = effectiveCoach(team);
  assert.equal(blended.passBias, oc.passBias, "OC passBias feeds the dial path");
  assert.notEqual(blended, team.coach);
  oc.passBias = original;
  setCallSheet(st, { passLean: 1 });
  assert.equal(effectiveCoach(team).passBias, 1, "call sheet still wins");
  ok("effectiveCoach: identity when matching, OC then sheet");
}

{
  const st = stripPeople(newGame({ seed: 17 }));
  assert.equal(st.teams[0].coaches, undefined);
  assert.equal(st.teams[0].owner, undefined);
  const before = st.rngState;
  ensureCoaches(st);
  assert.equal(st.rngState, before);
  for (const t of st.teams) {
    for (const role of COACH_ROLES) {
      assert.ok(staffSlot(t, role), `stripped save missing ${t.abbr} ${role}`);
    }
  }
  const round = decodeSave(encodeSave(st));
  assert.equal(round.teams[3].coaches!.hc!.name, st.teams[3].coaches!.hc!.name);
  ok("old save without coaches loads; codec keeps the people");
}

{
  const st = newGame({ seed: 19 });
  ensureCoaches(st);
  const user = st.teams[st.userTeamId];
  const oc = user.coaches!.oc!;
  oc.offense = 95;
  const ocName = oc.name;
  for (const t of st.teams) {
    if (t.id === st.userTeamId) continue;
    delete t.coaches!.hc;
  }
  const before = st.rngState;
  const events = runCoachCarousel(st);
  assert.equal(st.rngState, before, "carousel is child-stream only");
  const poach = events.find((e) => e.kind === "poach" && e.fromTeamId === st.userTeamId);
  assert.ok(poach, "a vacant CPU HC poaches the user OC");
  assert.equal(user.coaches!.oc, undefined, "user OC chair stays empty");
  const hired = st.teams[poach!.teamId];
  assert.equal(hired.coaches!.hc!.name, ocName);
  assert.equal(hired.coaches!.hc!.role, "hc");
  ok("CPU poach of user OC; user chair left vacant");
}

{
  const st = newGame({ seed: 21 });
  ensureCoaches(st);
  const before = st.rngState;
  const user = st.userTeamId;
  const oc = st.teams[user].coaches!.oc!;
  const r = fireCoach(st, user, "oc");
  assert.equal(r.ok, true);
  assert.equal(st.teams[user].coaches!.oc, undefined);
  assert.ok(st.coachMarket!.some((c) => c.id === oc.id));
  const hire = hireCoach(st, user, oc.id, "oc");
  assert.equal(hire.ok, true);
  assert.equal(st.teams[user].coaches!.oc!.id, oc.id);
  assert.equal(st.rngState, before);
  const cpu = st.teams.find((t) => t.id !== user)!;
  assert.equal(fireCoach(st, cpu.id, "hc").ok, false, "cannot fire a CPU coach from the desk");
  ok("user fire/hire; parent still; CPU desk is read-only");
}

{
  const st = newGame({ seed: 23 });
  ensureCoaches(st);
  const cpu = st.teams.find((t) => t.id !== st.userTeamId)!;
  const hc = cpu.coaches!.hc!;
  const name = hc.name;
  hc.yearsRemaining = 1;
  const before = st.rngState;
  const expired = tickCoachContracts(st);
  assert.equal(st.rngState, before, "tick is deterministic; no parent draw");
  assert.ok(expired.some((c) => c.name === name), "HC with 1 year left expires");
  assert.equal(cpu.coaches!.hc, undefined, "expired HC leaves the chair empty");
  assert.ok(st.coachMarket!.some((c) => c.name === name));
  ok("coach contracts tick and expire");
}

{
  const st = newGame({ seed: 25 });
  ensureCoaches(st);
  for (const t of st.teams) {
    if (t.id === st.userTeamId) continue;
    if (t.coaches?.hc) t.coaches.hc.yearsRemaining = 1;
  }
  tickCoachContracts(st);
  const vacant = st.teams.filter((t) => t.id !== st.userTeamId && !t.coaches?.hc);
  assert.ok(vacant.length > 0, "some CPU HC chairs emptied");
  runCoachCarousel(st);
  for (const t of vacant) {
    const hc = t.coaches?.hc;
    assert.ok(hc, `${t.abbr} carousel did not fill HC`);
    assert.ok(hc.yearsRemaining >= 1, `${t.abbr} hired an expired 0-year deal`);
  }
  ok("carousel grants a new deal when hiring an expired coach");
}

{
  const st = newGame({ seed: 24 });
  ensureCoaches(st);
  const cpu = st.teams.find((t) => t.id !== st.userTeamId)!;
  const hc = cpu.coaches!.hc!;
  hc.hiredSeason = st.season - 2;
  const before = st.rngState;
  fireCpuHeadCoaches(st);
  assert.equal(st.rngState, before, "CPU HC fire draws nothing on the parent");
  ok("fireCpuHeadCoaches is child-stream still");
}

{
  const st = newGame({ seed: 80 });
  assert.equal(st.stcSeeded, true, "league start has introduced the STC chair");
  for (const t of st.teams) {
    assert.ok(t.coaches?.oc && t.coaches.dc && t.coaches.stc, `${t.abbr} missing a rated coordinator`);
    for (const role of COORDINATOR_ROLES) {
      const person = staffSlot(t, role)!;
      assert.ok(Number.isFinite(person.offense) && person.offense > 0, `${t.abbr} ${role} has no offense rating`);
      assert.ok(Number.isFinite(person.defense) && person.defense > 0, `${t.abbr} ${role} has no defense rating`);
      assert.ok(Number.isFinite(person.passBias), `${t.abbr} ${role} has no pass bias`);
      assert.ok(Number.isFinite(person.shadowTendency), `${t.abbr} ${role} has no shadow tendency`);
      assert.ok(person.name.length > 0, `${t.abbr} ${role} has a name`);
    }
    assert.equal(emptyCoordinatorFlags(t).length, 0, `${t.abbr} starts with every chair filled`);
  }
  const user = st.teams[st.userTeamId];
  const cpu = st.teams.find((t) => t.id !== st.userTeamId)!;
  assert.ok(user.coaches!.oc && cpu.coaches!.oc, "user and CPU both start with an OC");
  ok("every club, user and CPU, has rated coordinators at league start");
}

{
  const st = newGame({ seed: 81 });
  const sides = [st.teams[st.userTeamId], st.teams.find((t) => t.id !== st.userTeamId)!];
  for (const team of sides) {
    const other = st.teams.find((t) => t.id !== team.id)!;
    team.coaches!.oc!.offense = 77;
    assert.equal(peopleCoachDials(team)!.offense, 77, "filled OC keeps his rating");
    assert.equal(vacantOcYards(team), 0, "filled OC pays no vacancy cost");
    assert.equal(coordinatorPlayYards(team, other), 0, "filled chairs do not move play yards");
    assert.equal(vacantStcFgDelta(team), 0, "filled STC does not move field goals");
    assert.equal(vacantStcPuntDelta(team), 0, "filled STC does not move punts");
    assert.equal(specialTeamsRating(team), team.coaches!.stc!.offense);

    const fallbackOff = team.coaches!.hc!.offense;
    const oc = team.coaches!.oc!;
    delete team.coaches!.oc;
    const penalized = clamp(fallbackOff - EMPTY_COORDINATOR_COST, 0, 100);
    assert.equal(peopleCoachDials(team)!.offense, penalized, "empty OC is the fallback minus the cost");
    assert.equal(vacantOcYards(team), (penalized - fallbackOff) * COORD_YARDS_PER_POINT);
    assert.ok(vacantOcYards(team) < 0, "empty OC costs yards");
    assert.equal(coordinatorPlayYards(team, other), vacantOcYards(team));
    team.coaches!.oc = oc;

    const fallbackDef = team.coaches!.hc!.defense;
    const dc = team.coaches!.dc!;
    delete team.coaches!.dc;
    const penalizedDef = clamp(fallbackDef - EMPTY_COORDINATOR_COST, 0, 100);
    assert.equal(peopleCoachDials(team)!.defense, penalizedDef, "empty DC is the fallback minus the cost");
    assert.equal(vacantDcYards(team), (fallbackDef - penalizedDef) * COORD_YARDS_PER_POINT);
    assert.ok(vacantDcYards(team) > 0, "empty DC costs yards allowed");
    assert.equal(coordinatorPlayYards(other, team), vacantDcYards(team));
    team.coaches!.dc = dc;
    assert.equal(coordinatorPlayYards(team, other), 0, "restored OC and DC pay nothing");

    const stc = team.coaches!.stc!;
    delete team.coaches!.stc;
    assert.equal(specialTeamsRating(team), COORD_RATING_CENTRE - EMPTY_COORDINATOR_COST);
    assert.equal(vacantStcFgDelta(team), -EMPTY_COORDINATOR_COST * STC_FG_PER_POINT);
    assert.equal(vacantStcPuntDelta(team), -EMPTY_COORDINATOR_COST * STC_PUNT_YARDS_PER_POINT);
    assert.ok(vacantStcFgDelta(team) < 0 && vacantStcPuntDelta(team) < 0, "empty STC costs kicks");
    team.coaches!.stc = stc;
    assert.equal(vacantStcFgDelta(team), 0, "putting the STC back removes the cost");
    assert.equal(coordinatorPlayYards(team, other), 0, "filled chairs again pay nothing");
  }
  ok("empty OC, DC, and STC apply the cost; filled chairs do not");
}

{
  const st = newGame({ seed: 82 });
  const user = st.teams[st.userTeamId];
  assert.deepEqual(emptyCoordinatorFlags(user), [], "filled chairs raise no Hub flag");
  delete user.coaches!.dc;
  const flags = emptyCoordinatorFlags(user);
  assert.equal(flags.length, 1);
  assert.equal(flags[0].role, "dc");
  assert.match(flags[0].message, /Defensive coordinator chair is empty/);
  assert.equal(flags[0].href, "/staff");
  delete user.coaches!.oc;
  delete user.coaches!.stc;
  const all = emptyCoordinatorFlags(user);
  assert.deepEqual(all.map((f) => f.role), ["oc", "dc", "stc"]);
  for (const f of all) assert.match(f.message, /chair is empty/);
  ensureCoaches(st);
  assert.equal(user.coaches!.dc, undefined, "ensure does not refill a chair the GM emptied");
  assert.ok(emptyCoordinatorFlags(user).some((f) => f.role === "dc"));
  ok("Hub flag appears when a coordinator chair is empty");
}

{
  const st = newGame({ seed: 84 });
  delete st.stcSeeded;
  for (const t of st.teams) delete t.coaches!.stc;
  const before = st.rngState;
  ensureCoaches(st);
  assert.equal(st.rngState, before, "STC backfill is the coaches child stream");
  for (const t of st.teams) assert.ok(t.coaches!.stc, `${t.abbr} STC introduced once`);
  delete st.teams[st.userTeamId].coaches!.stc;
  ensureCoaches(st);
  assert.equal(st.teams[st.userTeamId].coaches!.stc, undefined, "after introduction a vacancy stays empty");
  ok("an old staff gets one STC; a later vacancy stays empty");
}

{
  const st = newGame({ seed: 3 });
  const team = st.teams[1];
  const dc = team.coaches!.dc!;
  dc.shadowTendency = 0.95;
  team.coach.shadowTendency = 0;
  assert.equal(effectiveCoach(team).shadowTendency, 0.95, "zeroing the head coach leaves the DC in the game");
  team.coach.shadowTendency = 0.4;
  zeroPlayedShadow(team);
  assert.equal(dc.shadowTendency, 0, "sides trial zeroes the DC");
  assert.equal(team.coach.shadowTendency, 0.4, "sides trial does not zero the head coach");
  assert.equal(effectiveCoach(team).shadowTendency, 0, "the shadow the game plays is 0");

  const bare = stripPeople(newGame({ seed: 3 }));
  const old = bare.teams[1];
  old.coach.shadowTendency = 0.4;
  zeroPlayedShadow(old);
  assert.equal(old.coach.shadowTendency, 0, "no DC: the played dial is Team.coach");
  assert.equal(effectiveCoach(old).shadowTendency, 0);
  ok("sides trial zeroes the shadow the game plays");
}

{
  const st = newGame({ seed: 3 });
  const team = st.teams[1];
  const dc = team.coaches!.dc!;
  dc.shadowTendency = 0.2;
  team.coach.shadowTendency = 1;
  assert.equal(effectiveCoach(team).shadowTendency, 0.2, "writing the head coach leaves the DC in the game");
  team.coach.shadowTendency = 0.4;
  setPlayedShadow(team);
  assert.equal(dc.shadowTendency, 1, "shadow trial sets the DC to 1");
  assert.equal(team.coach.shadowTendency, 0.4, "shadow trial does not set the head coach");
  assert.equal(effectiveCoach(team).shadowTendency, 1, "the shadow the game plays is 1");

  const bare = stripPeople(newGame({ seed: 3 }));
  const old = bare.teams[1];
  old.coach.shadowTendency = 0.4;
  setPlayedShadow(old);
  assert.equal(old.coach.shadowTendency, 1, "no DC: the played dial is Team.coach");
  assert.equal(effectiveCoach(old).shadowTendency, 1);
  ok("shadow trial sets the shadow the game plays to 1");
}

console.log("ok    coaches people layer");
