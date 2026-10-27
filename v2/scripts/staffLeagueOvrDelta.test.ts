/**
 * The 1.2 cap is the panel mean of staff.leagueOvrDelta.
 *
 * One seed over 1.2, with the panel mean under 1.2, is not a problem.
 * A panel mean over 1.2 is. The per-seed copy that used to increment
 * staff.problems is not part of the count. Cap stays 1.2.
 */
import assert from "node:assert/strict";
import baselines from "../docs/baselines.json";
import {
  LEAGUE_OVR_DELTA_CAP,
  panelLeagueOvrDeltaFails,
  panelMean,
  seedLeagueOvrDeltaNote,
  seedLeagueOvrDeltaProblemCount,
} from "./staffLeagueOvrDelta";

assert.equal(LEAGUE_OVR_DELTA_CAP, 1.2);
assert.equal(baselines.metrics["staff.leagueOvrDelta"].max, LEAGUE_OVR_DELTA_CAP);
assert.equal(baselines.metrics["staff.problems"].max, 0);

/** Same max rule as scripts/gate.ts checkBound: fail only when value > max. */
function gateFailsMax(name: "staff.leagueOvrDelta" | "staff.problems", value: number): boolean {
  const max = baselines.metrics[name].max;
  if (max === undefined) throw new Error(`missing max for ${name}`);
  return value > max;
}

// 89bca4d staff panel (investigation table). Seed 3 is 1.377. Mean is 0.973.
const panel89 = [0.761, 0.626, 1.377, 0.928, 1.175];
assert.ok(panel89[2] > LEAGUE_OVR_DELTA_CAP);
assert.ok(panelMean(panel89) < LEAGUE_OVR_DELTA_CAP);
assert.ok(Math.abs(panelMean(panel89) - 0.9734) < 1e-9);
assert.equal(panelLeagueOvrDeltaFails(panel89), false);
assert.equal(gateFailsMax("staff.leagueOvrDelta", panelMean(panel89)), false);

const problems89 = panel89.map(seedLeagueOvrDeltaProblemCount);
assert.deepEqual(problems89, [0, 0, 0, 0, 0]);
assert.equal(panelMean(problems89), 0);
assert.equal(gateFailsMax("staff.problems", panelMean(problems89)), false);
assert.ok(seedLeagueOvrDeltaNote(panel89[2])?.includes("not a problem"));
assert.equal(seedLeagueOvrDeltaNote(panel89[0]), null);

// The old per-seed copy: abs(delta) < 1.2, so seed 3 alone set problems to 1
// and the pooled count was 0.20. That count is what this change removes.
const oldPerSeed = panel89.map((d) => (Math.abs(d) < LEAGUE_OVR_DELTA_CAP ? 0 : 1));
assert.deepEqual(oldPerSeed, [0, 0, 1, 0, 0]);
assert.equal(panelMean(oldPerSeed), 0.2);
assert.equal(gateFailsMax("staff.problems", panelMean(oldPerSeed)), true);

// One seed above 1.2, panel mean under 1.2: not a problem.
const mixed = [1.377, 0.9, 0.9, 0.9, 0.9];
assert.ok(mixed[0] > LEAGUE_OVR_DELTA_CAP);
assert.ok(panelMean(mixed) < LEAGUE_OVR_DELTA_CAP);
assert.equal(seedLeagueOvrDeltaProblemCount(mixed[0]), 0);
assert.equal(panelLeagueOvrDeltaFails(mixed), false);
assert.equal(gateFailsMax("staff.leagueOvrDelta", panelMean(mixed)), false);
assert.equal(gateFailsMax("staff.problems", panelMean(mixed.map(seedLeagueOvrDeltaProblemCount))), false);

// Panel mean above 1.2 is a problem, even though no seed increments staff.problems.
const over = [1.3, 1.3, 1.3, 1.3, 1.3];
assert.ok(over.every((d) => d > LEAGUE_OVR_DELTA_CAP));
assert.ok(over.every((d) => seedLeagueOvrDeltaProblemCount(d) === 0));
assert.equal(panelMean(over.map(seedLeagueOvrDeltaProblemCount)), 0);
assert.equal(panelLeagueOvrDeltaFails(over), true);
assert.equal(gateFailsMax("staff.leagueOvrDelta", panelMean(over)), true);

// Exactly 1.2 is inside the signed max. The old per-seed line failed it.
assert.equal(panelLeagueOvrDeltaFails([1.2, 1.2, 1.2, 1.2, 1.2]), false);
assert.equal(gateFailsMax("staff.leagueOvrDelta", 1.2), false);
assert.equal(seedLeagueOvrDeltaProblemCount(1.2), 0);
assert.ok(seedLeagueOvrDeltaNote(1.2)?.includes("not a problem"));
assert.equal(seedLeagueOvrDeltaProblemCount(-1.5), 0);
assert.equal(panelLeagueOvrDeltaFails([-1.5, -1.5, -1.5, -1.5, -1.5]), false);

assert.throws(() => seedLeagueOvrDeltaProblemCount(Number.NaN), /finite/);
assert.throws(() => panelMean([]), /at least one seed/);
assert.throws(() => panelLeagueOvrDeltaFails([1, Number.NaN]), /finite/);

console.log("ok    staff league OVR delta — one seed over 1.2 is not a problem; a panel mean over 1.2 is");
