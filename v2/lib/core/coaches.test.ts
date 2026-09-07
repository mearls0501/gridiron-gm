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
  COACH_ROLES,
  ensureCoaches,
  fireCoach,
  hireCoach,
  peopleCoachDials,
  runCoachCarousel,
  sameCoachDials,
  staffSlot,
} from "./coaches";
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
  const st = newGame({ seed: 41 });
  const before = st.rngState;
  assert.equal(st.teams[st.userTeamId].coaches, undefined, "newGame does not touch generate.ts");
  ensureCoaches(st);
  assert.equal(st.rngState, before, "coaches child stream must not move the parent");
  for (const t of st.teams) {
    assert.ok(t.coaches?.hc && t.coaches.oc && t.coaches.dc, `${t.abbr} missing a chair`);
    assert.equal(t.coaches.hc.name, t.coach.name, "HC keeps the generated coach name");
    assert.ok(sameCoachDials(peopleCoachDials(t)!, t.coach), `${t.abbr} people dials must copy Team.coach`);
  }
  assert.ok((st.coachMarket?.length ?? 0) >= 8, "unemployed market is stocked");
  ok("ensure fills 32 clubs from Team.coach; parent stream still");
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
  assert.equal(effectiveCoach(team), team.coach, "no people, no sheet → same reference");
  ensureCoaches(st);
  assert.equal(effectiveCoach(team), team.coach, "copied dials still return Team.coach");
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

console.log("ok    coaches people layer");
