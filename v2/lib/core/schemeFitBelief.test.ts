/**
 * CPU clubs price scheme fit from a hashed belief. The belief is not the
 * true sheet, and the multiplier is small enough to even out across a class.
 *
 * Run: npx tsx lib/core/schemeFitBelief.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { newGame } from "./newGame";
import { cpuSchemeFitBelief } from "./scouting";
import { cpuBoardShortlist, cpuSchemeFitMultiplier } from "./offseason/draft";
import { schemeFit, schemeFor } from "./staff";
import type { Player } from "./types";

const state = newGame({ seed: 42, userTeamId: 0 });
const rngBefore = state.rngState;
const pool = state.players.filter(
  (p) => p.prospect && p.draftClassSeason === state.season && p.teamId === null && !p.retired
);
assert.ok(pool.length > 200, `need a class, got ${pool.length}`);

function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

// The valuation files must not name the true sheet.
{
  const draftSrc = readFileSync(new URL("./offseason/draft.ts", import.meta.url), "utf8");
  assert.equal(draftSrc.includes("schemeFit("), false);
  assert.equal(draftSrc.includes(".attrs"), false);
  const scoutSrc = readFileSync(new URL("./scouting.ts", import.meta.url), "utf8");
  const start = scoutSrc.indexOf("export function cpuSchemeFitBelief");
  const end = scoutSrc.indexOf("export function scoutQuality");
  assert.ok(start > 0 && end > start);
  const body = scoutSrc.slice(start, end);
  assert.equal(body.includes(".attrs"), false);
  assert.equal(body.includes("schemeFit("), false);
}

// Stable, private, and blind to the true attributes.
{
  const wr = pool.find((p) => p.pos === "WR");
  assert.ok(wr);
  const a = cpuSchemeFitBelief(state, 3, wr);
  const b = cpuSchemeFitBelief(state, 3, wr);
  assert.equal(a, b);
  assert.ok(a >= -1 && a <= 1);
  const other = cpuSchemeFitBelief(state, 11, wr);
  assert.notEqual(a, other, "two clubs must not share one scheme-fit opinion");

  const saved = { ...wr.attrs };
  wr.attrs = { ...saved };
  for (const k of Object.keys(wr.attrs) as (keyof Player["attrs"])[]) wr.attrs[k] = 99;
  try {
    assert.equal(cpuSchemeFitBelief(state, 3, wr), a, "true attributes moved the belief");
    assert.equal(cpuSchemeFitMultiplier(state, 3, wr), 1 + 0.08 * a);
  } finally {
    wr.attrs = saved;
  }
}

// A position the identity does not name is neutral. A graded one is not
// stuck at zero for the whole class.
{
  const team = state.teams[4];
  const savedOff = team.offScheme;
  team.offScheme = "vertical";
  try {
    const rbs = pool.filter((p) => p.pos === "RB");
    const wrs = pool.filter((p) => p.pos === "WR");
    assert.ok(rbs.length > 5 && wrs.length > 5);
    for (const p of rbs) assert.equal(cpuSchemeFitBelief(state, 4, p), 0);
    for (const p of pool.filter((x) => x.pos === "K" || x.pos === "P")) {
      assert.equal(cpuSchemeFitMultiplier(state, 4, p), 1);
    }
    const wrBeliefs = wrs.map((p) => ({ p, b: cpuSchemeFitBelief(state, 4, p) }));
    assert.ok(wrBeliefs.some((x) => x.b !== 0), "every receiver drew a zero belief");
    const lean = wrBeliefs.filter((x) => x.b !== 0).map(
      (x) => (cpuSchemeFitMultiplier(state, 4, x.p) - 1) / x.b
    );
    for (const x of lean) assert.ok(Math.abs(x - 0.08) < 1e-12);
  } finally {
    team.offScheme = savedOff;
  }
}

// Changing the identity changes the opinion. The true fit is a different number.
{
  const team = state.teams[6];
  const wr = pool.find((p) => p.pos === "WR");
  assert.ok(wr);
  const saved = team.offScheme;
  team.offScheme = "vertical";
  const verticalBelief = cpuSchemeFitBelief(state, 6, wr);
  const verticalTruth = schemeFit(wr, schemeFor(team, wr.pos));
  team.offScheme = "spread";
  const spreadBelief = cpuSchemeFitBelief(state, 6, wr);
  team.offScheme = saved;
  assert.notEqual(verticalBelief, spreadBelief);
  assert.notEqual(verticalBelief, verticalTruth);
}

// The belief does not track the true fit, and it evens out.
{
  const sample = pool.filter((p) => p.pos !== "K" && p.pos !== "P").slice(0, 80);
  const beliefs: number[] = [];
  const truths: number[] = [];
  const mults: number[] = [];
  for (let t = 0; t < 32; t++) {
    for (const p of sample) {
      const belief = cpuSchemeFitBelief(state, t, p);
      beliefs.push(belief);
      mults.push(cpuSchemeFitMultiplier(state, t, p));
      if (belief !== 0) truths.push(schemeFit(p, schemeFor(state.teams[t], p.pos)));
    }
  }
  const paired = sample.flatMap((p) => {
    const rows: { b: number; f: number }[] = [];
    for (let t = 0; t < 32; t++) {
      const b = cpuSchemeFitBelief(state, t, p);
      if (b === 0) continue;
      rows.push({ b, f: schemeFit(p, schemeFor(state.teams[t], p.pos)) });
    }
    return rows;
  });
  const mb = mean(paired.map((r) => r.b));
  const mf = mean(paired.map((r) => r.f));
  let num = 0;
  let db = 0;
  let df = 0;
  for (const r of paired) {
    const xb = r.b - mb;
    const xf = r.f - mf;
    num += xb * xf;
    db += xb * xb;
    df += xf * xf;
  }
  const corr = num / Math.sqrt(db * df);
  assert.ok(Math.abs(corr) < 0.12, `belief tracks true scheme fit, corr ${corr.toFixed(3)}`);
  assert.ok(Math.abs(mean(beliefs)) < 0.02, `belief mean ${mean(beliefs).toFixed(4)} did not even out`);
  assert.ok(Math.abs(mean(mults) - 1) < 0.002, `multiplier mean ${mean(mults).toFixed(4)}`);
  const spread = mean(mults.map((m) => Math.abs(m - 1)));
  assert.ok(spread > 0.005 && spread < 0.04, `lean spread ${spread.toFixed(4)} is not a small multiplier`);
  assert.ok(truths.length > 100);
}

// Swapping the identity moves a club's board. The parent stream does not.
{
  const before = cpuBoardShortlist(state, 2, pool, 24).slice(0, 8).map((x) => x.v);
  const team = state.teams[2];
  const savedOff = team.offScheme;
  const savedDef = team.defScheme;
  team.offScheme = savedOff === "vertical" ? "spread" : "vertical";
  team.defScheme = savedDef === "zone" ? "blitz" : "zone";
  const after = cpuBoardShortlist(state, 2, pool, 24).slice(0, 8).map((x) => x.v);
  team.offScheme = savedOff;
  team.defScheme = savedDef;
  assert.ok(before.some((v, i) => v !== after[i]), "scheme swap left the board unchanged");
  assert.equal(state.rngState, rngBefore);
}

console.log("ok    schemeFitBelief");
