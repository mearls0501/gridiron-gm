/**
 * Named scouts are the user's department only. Lenses and leans
 * redistribute error. They do not change the class-average miss at an
 * even budget, and they do not move a CPU read.
 *
 * Run: npx tsx lib/core/scoutStaff.test.ts
 */
import assert from "node:assert/strict";
import { newGame } from "./newGame";
import { Rng } from "./rng";
import { evenBudget } from "./staff";
import { cpuProspectView, ensureScouting, focusIds, getIntel, scoutQuality, setFocus, tickFocusFilm } from "./scouting";
import { advanceScoutingWindow } from "./scouting";
import { initDraft, cpuPick } from "./offseason/draft";
import {
  COLLEGE_REGIONS,
  FOCUS_CAP,
  buildScoutStaff,
  collegeRegion,
  coveringScout,
  creditUserDraft,
  ensureScoutStaff,
  leanWord,
  prospectReadAdjust,
  scoutRecordText,
  scoutRecords,
  userScouts,
} from "./scoutStaff";

function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function currentClass(state: ReturnType<typeof newGame>) {
  return state.players.filter(
    (p) => p.prospect && !p.retired && (p.draftClassSeason ?? state.season) === state.season,
  );
}

const state = newGame({ seed: 42, userTeamId: 0 });
const rngBefore = state.rngState;
const staff = userScouts(state);
const pool = currentClass(state);
assert.ok(pool.length > 200, `need a class, got ${pool.length}`);

assert.equal(staff.length, 5);
assert.equal(staff.filter((s) => s.role === "area").length, 3);
assert.equal(staff.filter((s) => s.role === "national").length, 1);
assert.equal(staff.filter((s) => s.role === "director").length, 1);
assert.equal(new Set(staff.map((s) => s.id)).size, 5);
assert.equal(new Set(staff.map((s) => s.name)).size, 5);
for (const scout of staff) {
  assert.equal("accuracy" in scout, false);
  assert.equal("tier" in scout, false);
  assert.ok(scout.lean === "high" || scout.lean === "low");
}

const covered = staff.filter((s) => s.role === "area").flatMap((s) => s.regions);
assert.equal(covered.length, COLLEGE_REGIONS.length);
assert.equal(new Set(covered).size, COLLEGE_REGIONS.length);
for (const region of COLLEGE_REGIONS) assert.ok(covered.includes(region), region);

const rebuilt = buildScoutStaff(state.seed, state.userTeamId);
assert.deepEqual(rebuilt, staff);
state.season += 1;
assert.deepEqual(userScouts(state).map((s) => s.name), staff.map((s) => s.name));
state.season -= 1;
delete state.scoutStaff;
assert.deepEqual(ensureScoutStaff(state).map((s) => s.id), staff.map((s) => s.id));

for (const team of state.teams) {
  assert.equal("scoutStaff" in team, false);
  assert.equal("scoutCredits" in team, false);
}

for (const t of state.teams) t.staff = evenBudget();
assert.equal(scoutQuality(state, state.userTeamId), 1);

const shifts: number[] = [];
const scales: number[] = [];
const err0: number[] = [];
const err1: number[] = [];
for (const p of pool) {
  const adj = prospectReadAdjust(state, p);
  shifts.push(adj.shift);
  scales.push(adj.scale);
  const intel = getIntel(state, p);
  const mid = (intel.ovrLow + intel.ovrHigh) / 2;
  err0.push(mid - p.ovr);
  err1.push(mid + adj.shift - p.ovr);
  const region = collegeRegion(p.profile?.college ?? "");
  assert.ok(region, p.profile?.college ?? "missing college");
  const area = coveringScout(state, p);
  assert.equal(area.role, "area");
  assert.ok(area.regions.includes(region!));
}
assert.ok(Math.abs(mean(shifts)) < 1e-8, `class-mean lean ${mean(shifts)}`);
assert.ok(Math.abs(mean(scales.map((s) => s * s)) - 1) < 1e-8, `mean scale^2 ${mean(scales.map((s) => s * s))}`);
assert.ok(Math.abs(mean(err0) - mean(err1)) < 1e-8, "lean moved the class-average error");
assert.ok(scales.some((s) => s < 0.95) && scales.some((s) => s > 1.05), "lens is not flat");
assert.ok(shifts.some((s) => s > 0.4) && shifts.some((s) => s < -0.4), "leans do not all cancel to zero on every name");

const fundedScale = prospectReadAdjust(state, pool[0]).scale;
state.teams[state.userTeamId].staff = { development: 15, scouting: 55, training: 15, scheme: 15 };
assert.ok(scoutQuality(state, state.userTeamId) < 1);
assert.equal(prospectReadAdjust(state, pool[0]).scale, fundedScale);
state.teams[state.userTeamId].staff = evenBudget();

const cpuBefore = pool.slice(0, 12).map((p) => cpuProspectView(state, 4, p).ovr);
const pinned = pool.slice(0, 4);
for (const p of pinned) assert.equal(setFocus(state, p.id, true), "added");
assert.equal(focusIds(state).length, 4);
const future = state.players.find((p) => p.prospect && (p.draftClassSeason ?? 0) > state.season);
assert.ok(future);
assert.equal(setFocus(state, future.id, true), "closed");
assert.equal(focusIds(state).includes(future.id), false);

const intelBeforeRemove = { ...getIntel(state, pinned[0]) };
tickFocusFilm(state, 1);
assert.equal(state.rngState, rngBefore, "focus film must not draw the parent stream");
pool.slice(0, 12).forEach((p, i) => {
  assert.equal(cpuProspectView(state, 4, p).ovr, cpuBefore[i], "user film moved a CPU read");
});
const week1 = pinned.filter((p) => (getIntel(state, p).methods.film ?? 0) === 1);
assert.equal(week1.length, 3, `week 1 filmed ${week1.length}`);
const countsAfter = pinned.map((p) => getIntel(state, p).methods.film ?? 0);
tickFocusFilm(state, 1);
assert.deepEqual(pinned.map((p) => getIntel(state, p).methods.film ?? 0), countsAfter);
tickFocusFilm(state, 2);
tickFocusFilm(state, 3);
tickFocusFilm(state, 4);
for (const p of pinned) {
  assert.ok((getIntel(state, p).methods.film ?? 0) <= 2, `${p.id} film ${getIntel(state, p).methods.film}`);
}
assert.ok(pinned.every((p) => (getIntel(state, p).methods.film ?? 0) === 2));

const kept = getIntel(state, pinned[0]);
assert.equal(setFocus(state, pinned[0].id, false), "removed");
assert.equal(focusIds(state).includes(pinned[0].id), false);
assert.equal(getIntel(state, pinned[0]).methods.film, kept.methods.film);
assert.equal(getIntel(state, pinned[0]).effort, kept.effort);
assert.ok((kept.methods.film ?? 0) >= (intelBeforeRemove.methods?.film ?? 0));

let filler = 0;
for (const p of pool) {
  if (focusIds(state).length >= FOCUS_CAP) break;
  if (focusIds(state).includes(p.id)) continue;
  const result = setFocus(state, p.id, true);
  if (result === "added") filler++;
}
assert.equal(focusIds(state).length, FOCUS_CAP);
const extra = pool.find((p) => !focusIds(state).includes(p.id));
assert.ok(extra);
assert.equal(setFocus(state, extra.id, true), "full");

const focusSnapshot = focusIds(state).slice();
state.phase = "offseason-fa";
ensureScouting(state);
advanceScoutingWindow(state);
assert.deepEqual(focusIds(state), focusSnapshot, "closing a window drops the focus list");

state.season += 1;
state.phase = "preseason";
ensureScouting(state);
assert.deepEqual(focusIds(state), []);
assert.deepEqual(userScouts(state).map((s) => s.name), staff.map((s) => s.name));
state.season -= 1;

creditUserDraft(state, pool[10], 1);
assert.equal(state.scoutCredits?.length, 1);
const credit = state.scoutCredits![0];
assert.equal(credit.playerId, pool[10].id);
assert.ok(credit.scoutIds.includes("director"));
assert.ok(credit.scoutIds.includes(coveringScout(state, pool[10]).id));
creditUserDraft(state, pool[10], 1);
assert.equal(state.scoutCredits?.length, 1);
const line = scoutRecordText(scoutRecords(state).find((r) => r.scoutId === "director")!);
assert.match(line, /1 drafted/);
assert.equal(line.includes("OVR"), false);
assert.equal(line.includes(String(pool[10].ovr)), false);

const cpuLeague = newGame({ seed: 8, userTeamId: 0 });
const draftRng = new Rng(1);
cpuLeague.draft = initDraft(cpuLeague, draftRng);
const cpuSlot = cpuLeague.draft.picks.findIndex((p) => p.teamId !== cpuLeague.userTeamId);
assert.ok(cpuSlot >= 0);
cpuLeague.draft.onClock = cpuSlot;
cpuPick(cpuLeague, new Rng(2));
assert.equal(cpuLeague.scoutCredits?.length ?? 0, 0, "a CPU pick wrote a scout credit");

assert.deepEqual(staff.map((s) => `${s.name}|${s.role}|${leanWord(s.lean)}|${s.lensLabel}`), [
  "Ruth Vogel|area|optimistic|",
  "Ruth Ward|area|cautious|",
  "Victor Ward|area|cautious|",
  "Victor Yeung|national|cautious|skill",
  "Ruth Shah|director|optimistic|quarterbacks",
]);
console.log("seed 42 scouts:");
for (const scout of staff) {
  const where = scout.role === "area" ? scout.regions.join(", ") : scout.lensLabel;
  console.log(`  ${scout.name} — ${scout.role} — ${leanWord(scout.lean)} — ${where}`);
}
const filmExample = newGame({ seed: 42, userTeamId: 0 });
const examplePool = currentClass(filmExample).slice(0, 4);
for (const p of examplePool) setFocus(filmExample, p.id, true);
tickFocusFilm(filmExample, 1);
const log = filmExample.scouting?.focusFilm;
const filmLines = (log?.lines ?? []).map((row) => {
  const p = filmExample.players.find((x) => x.id === row.playerId);
  const scout = userScouts(filmExample).find((s) => s.id === row.scoutId);
  return `${scout?.name} watched ${p?.firstName} ${p?.lastName} (${p?.pos}, ${p?.profile?.college})`;
});
assert.deepEqual(filmLines, [
  "Ruth Vogel watched Evan Ulrich (DT, Holloway State)",
  "Ruth Vogel watched Garrett Wright III (EDGE, Brier College)",
  "Victor Ward watched Lincoln Lopez (C, Millbrook University)",
]);
console.log("seed 42 week-1 focus film:");
for (const line of filmLines) console.log(`  ${line}`);

assert.equal(state.rngState, rngBefore);
console.log("ok    named scouts and focus film");
