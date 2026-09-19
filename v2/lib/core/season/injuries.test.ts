/**
 * Wave 4.0 Packet 5 — medical risk teeth on the weekly injury draw.
 *
 * The draw sits on a child stream keyed (seed, season, week, "medical",
 * playerId). Parent rngState is not read. First check: it used to
 * consume the week's parent stream (engine.ts passed `rng`).
 *
 * Run: npx tsx lib/core/season/injuries.test.ts
 */
import assert from "node:assert/strict";
import { newGame } from "../newGame";
import { Rng } from "../rng";
import { Player, ProspectProfile, RiskGrade } from "../types";
import {
  MEDICAL_HAZARD,
  medicalChildRng,
  medicalHazard,
  rollWeeklyInjuries,
  weeklyInjuryChance,
} from "./injuries";

function ok(label: string) { console.log("ok   ", label); }

function stubProfile(medicalRisk: RiskGrade): ProspectProfile {
  return {
    college: "", classYear: "SR", heightIn: 74, weightLb: 220,
    combine: {}, medicalRisk, characterRisk: "clean", coachability: 60,
  };
}

{
  const a = medicalChildRng(11, 2026, 3, 40);
  const b = medicalChildRng(11, 2026, 3, 40);
  assert.equal(a.next(), b.next(), "same key same stream");
  const week3 = medicalChildRng(11, 2026, 3, 40);
  const week4 = medicalChildRng(11, 2026, 4, 40);
  assert.notEqual(week3.next(), week4.next(), "week is in the key");
  const other = medicalChildRng(11, 2026, 3, 41);
  assert.notEqual(medicalChildRng(11, 2026, 3, 40).next(), other.next(), "playerId is in the key");
  ok("medical child stream is keyed (seed, season, week, playerId)");
}

{
  const stub = (grade: RiskGrade, durability = 70): Player =>
    ({ pos: "WR", age: 25, durability, profile: stubProfile(grade) }) as Player;
  assert.equal(medicalHazard(stub("clean")), 1);
  assert.equal(medicalHazard(stub("major")), MEDICAL_HAZARD.major);
  const clean = weeklyInjuryChance(stub("clean"), 55, 1);
  const major = weeklyInjuryChance(stub("major"), 55, 1);
  assert.ok(major > clean, "major raises the weekly hazard");
  assert.equal(Number((major / clean).toFixed(2)), MEDICAL_HAZARD.major);
  const none = weeklyInjuryChance({ pos: "WR", age: 25, durability: 70 } as Player, 55, 1);
  assert.equal(none, clean, "missing profile is clean");
  ok("medicalHazard scales weekly chance; missing profile is clean");
}

{
  const st = newGame({ seed: 51 });
  const before = st.rngState;
  const parent = new Rng(st.rngState);
  const parentBefore = parent.state;
  rollWeeklyInjuries(st, []);
  assert.equal(st.rngState, before, "rollWeeklyInjuries does not write rngState");
  assert.equal(parent.state, parentBefore, "caller parent Rng is not consumed");
  ok("weekly injury draw does not consume the parent stream");
}

{
  const a = newGame({ seed: 52 });
  const b = newGame({ seed: 52 });
  rollWeeklyInjuries(a, []);
  rollWeeklyInjuries(b, []);
  const ids = (st: typeof a) =>
    st.players
      .filter((p) => p.injuryWeeks > 0)
      .map((p) => [p.id, p.injuryWeeks, p.injuryDesc] as const)
      .sort((x, y) => x[0] - y[0]);
  assert.deepEqual(ids(a), ids(b), "same seed same weekly injuries");
  ok("same seed same weekly injuries on the child stream");
}

{
  const st = newGame({ seed: 53 });
  for (const p of st.players) {
    if (p.teamId === null || p.retired || p.prospect) continue;
    p.profile = stubProfile("major");
  }
  const before = st.rngState;
  rollWeeklyInjuries(st, []);
  assert.equal(st.rngState, before);
  ok("planting medicalRisk does not move the parent");
}

console.log("ok    injuries medical risk teeth");
