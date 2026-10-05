/**
 * The big board has to be a department order, not a photocopy of consensus,
 * and a grade has to name a slot. True overall stays off the label.
 *
 * Run: npx tsx lib/core/scouting-reports.test.ts
 */
import assert from "node:assert/strict";
import { newGame } from "./newGame";
import { Rng } from "./rng";
import { cpuProspectView, attrBand, getIntel, publicIntel, runScoutingMethod } from "./scouting";
import {
  boardGrade,
  consensusGrade,
  gradeContext,
  prospectReports,
  schemeVerdictFromBands,
  scoutedSchemeFit,
  type SchemeFitVerdict,
} from "./scouting-reports";
import { schemeFit, schemeFor, schemeById } from "./staff";
import { ATTR_KEYS, type AttrKey } from "./types";
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

function fitWord(score: number): Exclude<SchemeFitVerdict, "?"> {
  if (score >= 0.15) return "strong";
  if (score <= -0.15) return "poor";
  return "some";
}

// Zero-width bands sitting on the true attributes must name the same word
// as schemeFit. The display path is the formula, not a second opinion.
{
  for (const p of pool.slice(0, 40)) {
    const s = schemeFor(state.teams[state.userTeamId], p.pos);
    const bands: Partial<Record<AttrKey, { low: number; high: number }>> = {};
    for (const k of ATTR_KEYS) bands[k] = { low: p.attrs[k], high: p.attrs[k] };
    const fromBands = schemeVerdictFromBands(p.pos, s, bands);
    const fromTruth = s ? fitWord(schemeFit(p, s)) : "some";
    assert.equal(fromBands, fromTruth, `${p.pos} band formula drifted from schemeFit`);
  }
}

// A wide emphasised band is "?", even when the midpoint would be a word.
{
  const vertical = schemeById("vertical");
  assert.ok(vertical);
  const bands: Partial<Record<AttrKey, { low: number; high: number }>> = {};
  for (const k of ATTR_KEYS) bands[k] = { low: 70, high: 70 };
  bands.spd = { low: 40, high: 70 };
  assert.equal(schemeVerdictFromBands("WR", vertical, bands), "?");
}

// The verdict follows the bands. Truth that would grade strong does not
// leak into a read whose midpoints grade poor.
{
  const vertical = schemeById("vertical");
  assert.ok(vertical);
  const poor: Partial<Record<AttrKey, { low: number; high: number }>> = {};
  for (const k of ATTR_KEYS) poor[k] = { low: 80, high: 80 };
  poor.spd = { low: 40, high: 40 };
  poor.jmp = { low: 40, high: 40 };
  assert.equal(schemeVerdictFromBands("WR", vertical, poor), "poor");

  const truth = pool.find((p) => p.pos === "WR");
  assert.ok(truth);
  const saved = { ...truth.attrs };
  truth.attrs = { ...saved, spd: 95, jmp: 95, rte: 60, cth: 60, acc: 60, agi: 60, awr: 60, elu: 60 };
  try {
    assert.equal(fitWord(schemeFit(truth, vertical)), "strong");
    assert.equal(schemeVerdictFromBands("WR", vertical, poor), "poor");
  } finally {
    truth.attrs = saved;
  }
}

{
  const userScheme = (p: (typeof pool)[number]) => schemeFor(state.teams[state.userTeamId], p.pos);
  const seen = new Set<SchemeFitVerdict>();
  let followed = 0;
  let split = 0;
  for (const p of pool) {
    const fit = scoutedSchemeFit(state, p);
    assert.match(fit.verdict, /^(strong|some|poor|\?)$/);
    assert.equal("score" in fit, false);
    const bands: Partial<Record<AttrKey, { low: number; high: number }>> = {};
    for (const k of ATTR_KEYS) bands[k] = attrBand(state, p, k);
    assert.equal(fit.verdict, schemeVerdictFromBands(p.pos, userScheme(p), bands));
    followed++;
    seen.add(fit.verdict);
    if (fit.verdict !== "?") {
      const truth = fitWord(schemeFit(p, userScheme(p)));
      if (truth !== fit.verdict) split++;
    }
  }
  assert.equal(followed, pool.length);
  for (const word of ["strong", "some", "poor", "?"] as const) {
    assert.ok(seen.has(word), `seed 42 opening board is missing ${word}`);
  }
  assert.ok(split > 0, "every tight read matched the true attributes");

  const named = (first: string, last: string, pos: string) =>
    pool.find((p) => p.firstName === first && p.lastName === last && p.pos === pos);
  const davis = named("Nico", "Davis", "TE");
  const delacroix = named("Dax", "Delacroix", "WR");
  const flores = named("Carlos", "Flores", "WR");
  const young = named("DeShawn", "Young", "EDGE");
  assert.ok(davis && delacroix && flores && young);
  assert.equal(scoutedSchemeFit(state, davis).verdict, "strong");
  assert.equal(scoutedSchemeFit(state, davis).identity, "Vertical Passing");
  const middle = scoutedSchemeFit(state, delacroix);
  assert.equal(middle.verdict, "some");
  assert.equal(middle.applies, true);
  assert.equal(middle.identity, "Vertical Passing");
  assert.equal(scoutedSchemeFit(state, flores).verdict, "poor");
  assert.equal(scoutedSchemeFit(state, flores).best, "Spread and Space");
  const edge = scoutedSchemeFit(state, young);
  assert.equal(edge.verdict, "?");
  assert.equal(edge.identity, "Pressure and Man");
  assert.equal(edge.best, "?");
}

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
