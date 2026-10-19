import assert from "node:assert/strict";
import { newGame } from "../lib/core/newGame";
import { Player, POSITIONS } from "../lib/core/types";
import { captureAging, measureAging, postPeakProblems, summarizePostPeak } from "./driftAging";

const state = newGame({ seed: 42 });
function fixtures(): Player[] {
  return POSITIONS.map((pos, i) => {
    const p = structuredClone(state.players.find((p) => p.pos === pos)!);
    p.id = i + 1;
    p.age = 33;
    p.peakAge = 28;
    p.ovr = 80;
    p.retired = false;
    p.prospect = false;
    p.teamId = 0;
    p.status = undefined;
    return p;
  });
}
function progress(players: Player[], delta = -2): void {
  for (const p of players) { p.age++; p.ovr += delta; }
}

const younger = fixtures().map((p) => {
  p.id += 1000; p.age = 26; p.peakAge = 29; p.ovr = 60;
  return p;
});
const players = [...fixtures(), ...younger];
const before = captureAging(players);
assert.ok(Object.isFrozen(before) && before.every(Object.isFrozen));
progress(players);
for (const p of younger) p.ovr = 65;
players[0].retired = true;
players[0].teamId = null;
players[1].status = "ir";
players[2].status = "ps";
players[3].teamId = null;
assert.equal(before[0].age, 33, "later aging cannot relabel the captured age cohort");
assert.equal(before[0].ovr, 80);
assert.equal(before[0].active, true);
assert.equal(before[0].retired, false);
assert.equal(before[POSITIONS.length].age, 26, "growth cannot relabel a captured younger cohort either");
const measured = measureAging(before, players);
assert.deepEqual(measured.errors, []);
assert.equal(measured.pairs.length, POSITIONS.length,
  "retirement, IR, practice squad and release cannot remove a measured decline");
assert.equal(measured.pairs[0].after.retired, true);
assert.equal(measured.pairs[0].delta, -2);
assert.ok(measured.pairs.every((p) => p.after.ovr > younger[0].ovr));
assert.deepEqual(postPeakProblems(measured.pairs), [],
  "declining veterans pass even if their OVR still exceeds a different younger cohort");
players[0].ovr = 99;
players[0].age = 50;
assert.equal(measured.pairs[0].after.ovr, 78, "the after snapshot also survives later mutations");
assert.equal(measured.pairs[0].after.age, 34);

const late = fixtures().slice(0, 3);
late[0].age = 30; late[0].peakAge = 32;
late[1].age = 31; late[1].peakAge = 32;
late[2].age = 32; late[2].peakAge = 32;
const lateBefore = captureAging(late);
progress(late, 2);
late[2].ovr = 79;
const lateMeasured = measureAging(lateBefore, late);
assert.deepEqual(lateMeasured.errors, []);
assert.equal(lateMeasured.pairs.length, 1, "growth before or at a personal peak is not post-peak decline");
assert.equal(lateMeasured.pairs[0].before.id, late[2].id);
assert.equal(lateMeasured.pairs[0].yearsPastPeak, 1);

const skipped = fixtures();
const skippedBefore = captureAging(skipped);
assert.equal(measureAging(skippedBefore, skipped).errors.length, POSITIONS.length,
  "skipping the age tick must fail rather than shrinking the post-peak sample");
skipped[0].age += 2;
assert.match(measureAging(skippedBefore, skipped).errors[0], /expected 34/);
assert.equal(measureAging(skippedBefore, skipped.slice(1)).errors.length, POSITIONS.length,
  "missing players cannot silently disappear from the preselected sample");

const stalled = fixtures();
const stalledBefore = captureAging(stalled);
progress(stalled, -4);
stalled[0].ovr = 80;
const stalledMeasurement = measureAging(stalledBefore, stalled);
assert.deepEqual(stalledMeasurement.errors, []);
assert.equal(postPeakProblems(stalledMeasurement.pairs).length, 1,
  "decline in other positions cannot conceal one position with no aging");
assert.match(postPeakProblems(stalledMeasurement.pairs)[0], /^QB: mean change 0/);
stalled[0].ovr = 82;
assert.match(postPeakProblems(measureAging(stalledBefore, stalled).pairs)[0], /^QB: mean change 2/);
const flat = fixtures();
const flatBefore = captureAging(flat);
progress(flat, 0);
assert.equal(postPeakProblems(measureAging(flatBefore, flat).pairs).length, POSITIONS.length);
assert.equal(postPeakProblems([]).length, POSITIONS.length, "an empty sample cannot pass");
assert.equal(summarizePostPeak([])[0].meanDelta, null);

const ineligible = fixtures();
ineligible[0].retired = true;
ineligible[1].prospect = true;
assert.equal(captureAging(ineligible).length, POSITIONS.length - 2,
  "already retired players and prospects are not expected to progress");
console.log("ok    drift aging — frozen snapshots, personal peaks, retirements, missing ages, and stalled/reversed aging");
