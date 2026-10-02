/**
 * The big board has to be a department order, not a photocopy of consensus,
 * and a grade has to name a slot. True overall stays off the label.
 *
 * Run: npx tsx lib/core/scouting-reports.test.ts
 */
import assert from "node:assert/strict";
import { newGame } from "./newGame";
import { Rng } from "./rng";
import { cpuProspectView, getIntel, publicIntel, runScoutingMethod } from "./scouting";
import {
  boardGrade,
  consensusGrade,
  gradeContext,
  prospectReports,
} from "./scouting-reports";
const state = newGame({ seed: 42, userTeamId: 0 });
const rngBefore = state.rngState;
const pool = state.players.filter(
  (p) => p.prospect && p.draftClassSeason === state.season && p.teamId === null && !p.retired
);
assert.ok(pool.length > 200, `need a class, got ${pool.length}`);
const ctx = gradeContext(state, pool);

function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

const boardSlots = pool.map((p) => boardGrade(state, p, ctx).slot);
const marketSlots = pool.map((p) => consensusGrade(state, p, ctx).slot);
assert.equal(new Set(boardSlots).size, pool.length, "department ranks must be unique");
assert.equal(new Set(marketSlots).size, pool.length, "consensus ranks must be unique");
assert.deepEqual([...boardSlots].sort((a, b) => a - b), Array.from({ length: pool.length }, (_, i) => i + 1));

let differ = 0;
for (const p of pool) {
  if (boardGrade(state, p, ctx).slot !== consensusGrade(state, p, ctx).slot) differ++;
}
assert.ok(differ / pool.length > 0.55, `board still tracks consensus: ${differ}/${pool.length}`);

const byMarket = pool.slice().sort(
  (a, b) => consensusGrade(state, a, ctx).slot - consensusGrade(state, b, ctx).slot
);
const top = byMarket.slice(0, 32);
const meanAbs = mean(top.map((p) => Math.abs(boardGrade(state, p, ctx).slot - consensusGrade(state, p, ctx).slot)));
assert.ok(meanAbs >= 4 && meanAbs <= 24, `consensus top 32 mean |delta| ${meanAbs.toFixed(1)}`);
const stillEarly = top.filter((p) => boardGrade(state, p, ctx).slot <= 64).length;
assert.ok(stillEarly >= 22, `department lost the class: ${stillEarly}/32 of the media top 32 inside our top 64`);

const mediaTop = byMarket.slice(0, 10);
const mediaLabels = new Set(mediaTop.map((p) => consensusGrade(state, p, ctx).label));
assert.equal(mediaLabels.size, 10, "top 10 must not share one label");
for (const p of mediaTop) {
  const g = consensusGrade(state, p, ctx);
  assert.match(g.label, /^#\d+ · /);
  assert.ok(!g.label.includes("-"), "grade must not be an OVR band");
  assert.notEqual(g.label, "Top-10 pick");
}

const cloned = mediaTop.filter(
  (p) => boardGrade(state, p, ctx).label === consensusGrade(state, p, ctx).label
).length;
assert.ok(cloned <= 4, `top 10 still cloned onto our board: ${cloned}`);

const mae = mean(pool.slice(0, 80).map((p) => {
  const i = getIntel(state, p);
  return Math.abs((i.ovrLow + i.ovrHigh) / 2 - p.ovr);
}));
assert.ok(mae > 3, `department band is sitting on true OVR, MAE ${mae.toFixed(2)}`);

let widthOff = 0;
for (const p of pool.slice(0, 40)) {
  const a = getIntel(state, p);
  const b = publicIntel(state, p);
  if (Math.abs((a.ovrHigh - a.ovrLow) - (b.ovrHigh - b.ovrLow)) > 1) widthOff++;
  if (Math.abs((a.potHigh - a.potLow) - (b.potHigh - b.potLow)) > 1) widthOff++;
}
assert.equal(widthOff, 0, "shallow read shifts the center, not the width");

let soft = 0;
let called = 0;
for (const p of pool.slice(0, 40)) {
  const notes = prospectReports(state, p, ctx).map((r) => r.text).join(" ");
  if (notes.includes("still soft")) soft++;
  if (notes.includes("spots")) called++;
  assert.ok(!/\bOVR\b/.test(notes), "the file must not print an OVR");
}
assert.ok(soft >= 30, `soft reads ${soft}/40`);
assert.ok(called >= 8, `rank gaps called ${called}/40`);

{
  const sample = pool.slice(20, 32);
  const before = new Map<number, number>(sample.map((p) => [p.id, boardGrade(state, p, ctx).slot]));
  const cpuBefore = sample.map((p) => cpuProspectView(state, 4, p).ovr);
  const rng = new Rng(99);
  for (const p of sample) runScoutingMethod(state, p.id, "film", rng);
  const moved = gradeContext(state, pool);
  let changes = 0;
  sample.forEach((p, i) => {
    const g = boardGrade(state, p, moved);
    assert.match(g.label, /^#\d+ · /);
    if (g.slot !== before.get(p.id)) changes++;
    assert.equal(cpuProspectView(state, 4, p).ovr, cpuBefore[i], "user film must not move a CPU board");
    const intel = getIntel(state, p);
    assert.ok((intel.methods.film ?? 0) >= 1, "film has to be stored work");
    assert.ok(intel.effort >= 26, `effort ${intel.effort}`);
  });
  assert.ok(changes >= 4, `film moved ${changes}/12 grades — still a bucket`);
}

assert.equal(state.rngState, rngBefore, "grading and a side rng must not draw the parent stream");
