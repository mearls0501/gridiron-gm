/**
 * CPU clubs draft on a believed scheme fit: true fit, plus the club's own
 * error. The error uses the old hash lane. The board adds the field's
 * 4-point term. There is no lean dial.
 *
 * Run: npx tsx lib/core/schemeFitBelief.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { newGame } from "./newGame";
import { cpuBoardShortlist } from "./offseason/draft";
import { boardGrade, gradeContext, scoutedSchemeFit } from "./scouting-reports";
import { FIT_ERR_SD, cpuSchemeFitBelief, scoutQuality } from "./scouting";
import { schemeFit, schemeFor, share } from "./staff";
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

function corr(xs: number[], ys: number[]): number {
  const mx = mean(xs);
  const my = mean(ys);
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < xs.length; i++) {
    const a = xs[i] - mx;
    const b = ys[i] - my;
    num += a * b;
    dx += a * a;
    dy += b * b;
  }
  return num / Math.sqrt(dx * dy);
}

function graded(teamId: number, ps: Player[]): Player[] {
  const team = state.teams[teamId];
  return ps.filter((p) => {
    const keys = schemeFor(team, p.pos)?.emphasis[p.pos];
    return !!keys && keys.length > 0;
  });
}

assert.equal(FIT_ERR_SD, 0.35);

// No lean dial, and the user's grade does not read the CPU belief.
{
  const draftSrc = readFileSync(new URL("./offseason/draft.ts", import.meta.url), "utf8");
  assert.equal(draftSrc.includes("SCHEME_FIT_LEAN"), false);
  assert.equal(draftSrc.includes("cpuSchemeFitMultiplier"), false);
  assert.equal(draftSrc.includes("schemeFit("), false);
  const reports = readFileSync(new URL("./scouting-reports.ts", import.meta.url), "utf8");
  assert.equal(reports.includes("cpuSchemeFitBelief"), false);
  assert.equal(reports.includes("cpuBoardValue"), false);
}

// At an even budget the belief tracks true fit across the class.
{
  const teamId = 4;
  assert.equal(share(state.teams[teamId], "scouting"), 0.25);
  assert.equal(scoutQuality(state, teamId), 1);
  const men = graded(teamId, pool);
  assert.ok(men.length > 40, `graded class too small: ${men.length}`);
  const beliefs = men.map((p) => cpuSchemeFitBelief(state, teamId, p));
  const truths = men.map((p) => schemeFit(p, schemeFor(state.teams[teamId], p.pos)));
  for (const b of beliefs) assert.ok(b >= -1 && b <= 1);
  const r = corr(beliefs, truths);
  assert.ok(r > 0.5, `belief vs true fit r=${r.toFixed(3)}`);
}

// A higher scouting share tightens the error around the true fit.
{
  const teamId = 4;
  const team = state.teams[teamId];
  const men = graded(teamId, pool);
  const truthOf = (p: Player) => schemeFit(p, schemeFor(team, p.pos));
  const mae = () => mean(men.map((p) => Math.abs(cpuSchemeFitBelief(state, teamId, p) - truthOf(p))));
  const even = mae();
  const saved = team.staff;
  team.staff = { development: 15, scouting: 55, training: 15, scheme: 15 };
  try {
    assert.ok(scoutQuality(state, teamId) < 1);
    const funded = mae();
    assert.ok(funded < even, `funded error ${funded.toFixed(3)} did not tighten from ${even.toFixed(3)}`);
  } finally {
    team.staff = saved;
  }
}

// Two clubs with the same identity disagree. A reload holds the opinion.
{
  const wr = pool.find((p) => p.pos === "WR");
  assert.ok(wr);
  const a = state.teams[2];
  const b = state.teams[7];
  const savedA = { off: a.offScheme, def: a.defScheme };
  const savedB = { off: b.offScheme, def: b.defScheme, staff: b.staff };
  a.offScheme = "vertical";
  b.offScheme = "vertical";
  a.defScheme = "zone";
  b.defScheme = "zone";
  b.staff = a.staff ? { ...a.staff } : a.staff;
  try {
    const fitA = schemeFit(wr, schemeFor(a, wr.pos));
    const fitB = schemeFit(wr, schemeFor(b, wr.pos));
    assert.equal(fitA, fitB);
    const beliefA = cpuSchemeFitBelief(state, a.id, wr);
    const beliefB = cpuSchemeFitBelief(state, b.id, wr);
    assert.notEqual(beliefA, beliefB, "two clubs shared one scheme-fit opinion");
    assert.equal(cpuSchemeFitBelief(state, a.id, wr), beliefA);
  } finally {
    a.offScheme = savedA.off;
    a.defScheme = savedA.def;
    b.offScheme = savedB.off;
    b.defScheme = savedB.def;
    b.staff = savedB.staff;
  }

  const held = cpuSchemeFitBelief(state, 3, wr);
  assert.equal(cpuSchemeFitBelief(state, 3, wr), held);
  const reloaded = newGame({ seed: 42, userTeamId: 0 });
  const wr2 = reloaded.players.find((p) => p.id === wr.id);
  assert.ok(wr2);
  assert.equal(cpuSchemeFitBelief(reloaded, 3, wr2), held);
}

// A position the identity does not name is 0.
{
  const team = state.teams[8];
  const saved = team.offScheme;
  team.offScheme = "vertical";
  try {
    const rbs = pool.filter((p) => p.pos === "RB");
    const wrs = pool.filter((p) => p.pos === "WR");
    assert.ok(rbs.length > 5 && wrs.length > 5);
    for (const p of rbs) assert.equal(cpuSchemeFitBelief(state, team.id, p), 0);
    for (const p of pool.filter((x) => x.pos === "C")) assert.equal(cpuSchemeFitBelief(state, team.id, p), 0);
    for (const p of pool.filter((x) => x.pos === "K" || x.pos === "P")) {
      assert.equal(cpuSchemeFitBelief(state, team.id, p), 0);
    }
    assert.ok(wrs.some((p) => cpuSchemeFitBelief(state, team.id, p) !== 0), "every receiver drew a zero belief");
  } finally {
    team.offScheme = saved;
  }
}

// The user's board and the scouted scheme-fit word do not move.
{
  const ctx = gradeContext(state, pool);
  const slots = pool.map((p) => boardGrade(state, p, ctx).slot);
  const words = pool.slice(0, 40).map((p) => {
    const f = scoutedSchemeFit(state, p);
    return `${f.verdict}|${f.identity}|${f.best}|${f.applies}`;
  });
  for (const p of pool) {
    for (let t = 0; t < state.teams.length; t++) cpuSchemeFitBelief(state, t, p);
  }
  const ctx2 = gradeContext(state, pool);
  pool.forEach((p, i) => {
    assert.equal(boardGrade(state, p, ctx2).slot, slots[i]);
  });
  pool.slice(0, 40).forEach((p, i) => {
    const f = scoutedSchemeFit(state, p);
    assert.equal(`${f.verdict}|${f.identity}|${f.best}|${f.applies}`, words[i]);
  });
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
