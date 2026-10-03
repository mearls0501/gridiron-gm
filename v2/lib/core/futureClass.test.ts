/**
 * Future classes live before they are scouted.
 *
 * The current class stays on the parent generator. Later classes, injuries,
 * and early declarations use a child stream. Run: npx tsx lib/core/futureClass.test.ts
 */
import assert from "node:assert/strict";
import { newGame } from "./newGame";
import { Rng } from "./rng";
import { draftClass } from "./select";
import { generateDraftClass, initialScoutingPass } from "./offseason/draft";
import { runScoutingMethod } from "./scouting";
import { GameState } from "./types";
import {
  FUTURE_ID_BASE,
  catchUpFutureClasses,
  ensureFutureClasses,
  futureClassRows,
  isFutureProspect,
  promoteDraftClass,
  tickFutureClasses,
} from "./futureClass";

function ok(label: string) {
  console.log("ok   ", label);
}

function clone(state: GameState): GameState {
  return JSON.parse(JSON.stringify(state)) as GameState;
}

function idsOf(state: GameState, season: number): number[] {
  return draftClass(state, season).map((p) => p.id).sort((a, b) => a - b);
}

function snapshotClass(state: GameState, season: number): string {
  return draftClass(state, season)
    .map((p) => `${p.id}:${p.ovr}:${p.pot}:${p.ceiling}:${p.draftClassSeason}:${p.retired}`)
    .sort()
    .join("|");
}

const st = newGame({ seed: 42 });
const y0 = idsOf(st, st.season);
const y1 = idsOf(st, st.season + 1);
const y2 = idsOf(st, st.season + 2);
assert.ok(y0.length > 200, `current class ${y0.length}`);
assert.ok(y1.length > 200, `next class ${y1.length}`);
assert.ok(y2.length > 200, `class after that ${y2.length}`);
assert.equal(idsOf(st, st.season + 3).length, 0, "horizon stops at the pick window");
assert.ok(y0.every((id) => id < FUTURE_ID_BASE));
assert.ok(y1.every((id) => id >= FUTURE_ID_BASE));
assert.ok(y2.every((id) => id >= FUTURE_ID_BASE));
assert.ok(st.nextPlayerId < FUTURE_ID_BASE);
const again = newGame({ seed: 42 });
assert.deepEqual(idsOf(again, again.season + 1), y1);
assert.equal(again.rngState, st.rngState);
ok("two future classes exist on a child stream; current ids and rngState stay put");

const beforeEnsure = st.rngState;
const beforeNext = st.nextPlayerId;
const beforeCurrent = snapshotClass(st, st.season);
ensureFutureClasses(st);
assert.equal(st.rngState, beforeEnsure);
assert.equal(st.nextPlayerId, beforeNext);
assert.equal(snapshotClass(st, st.season), beforeCurrent);
assert.equal(idsOf(st, st.season + 1).length, y1.length);
ok("a second ensure does not draw, duplicate, or touch this year's class");

const rows = futureClassRows(st, st.season + 1);
assert.ok(rows.length > 200);
assert.ok(rows.every((r) => !r.consensus.includes(".")));
assert.ok(rows.every((r) => !/\bovr\b/i.test(r.consensus + r.notes.join(" "))));
const blob = JSON.stringify(rows);
assert.ok(!blob.includes("ceiling"));
ok("the public sheet is school, size, testing, and a consensus rank");

const currentSnap = snapshotClass(st, st.season);
const rngBefore = st.rngState;
const nextBefore = st.nextPlayerId;
st.phase = "regular";
for (let w = 1; w <= 18; w++) {
  st.week = w;
  tickFutureClasses(st, w);
}
const afterTick = snapshotClass(st, st.season);
tickFutureClasses(st, 18);
assert.equal(snapshotClass(st, st.season), afterTick);
assert.equal(snapshotClass(st, st.season), currentSnap);
assert.equal(st.rngState, rngBefore);
assert.equal(st.nextPlayerId, nextBefore);
const moved = st.players.filter(
  (p) => p.id >= FUTURE_ID_BASE && (p.pipeline?.notes.length ?? 0) > 0,
);
assert.ok(moved.length > 0, "a season of weeks leaves a mark");
assert.ok(
  moved.some((p) => p.pipeline!.notes.some((n) => n.includes("injury"))) ||
    moved.some((p) => p.pipeline!.notes.some((n) => n.startsWith("Declared") || n.startsWith("Staying"))),
);
for (const p of st.players) {
  if (!p.prospect || p.id < FUTURE_ID_BASE) continue;
  assert.ok((p.draftClassSeason ?? 0) > st.season, `${p.id} entered the current class`);
  const notes = (p.pipeline?.notes ?? []).join(" ");
  assert.ok(!notes.includes("ceiling"));
  assert.ok(!notes.includes(String(p.ovr)));
}
const stillFuture = st.players.filter((p) => isFutureProspect(st, p));
assert.ok(stillFuture.length > 100);
ok("injuries and declarations stay on future classes and do not move the parent");

const filmTarget = draftClass(st, st.season)[0];
const futureTarget = st.players.find((p) => isFutureProspect(st, p))!;
assert.equal(runScoutingMethod(st, futureTarget.id, "film", new Rng(1)), false);
assert.equal(runScoutingMethod(st, filmTarget.id, "film", new Rng(1)), true);
assert.ok(filmTarget.scouted > 0);
ok("film still lands on this year's class and refuses a future one");

const liveIds = new Set(idsOf(st, st.season + 1));
const seasonBefore = st.season;
st.season += 1;
const parent = new Rng(st.rngState);
const fresh = clone(st);
const freshRng = new Rng(fresh.rngState);
generateDraftClass(fresh, freshRng, fresh.season);
initialScoutingPass(fresh, fresh.season, freshRng);
promoteDraftClass(st, parent);
assert.equal(parent.state, freshRng.state, "promotion spends the same two parent draws");
const opened = idsOf(st, st.season);
for (const id of liveIds) assert.ok(opened.includes(id), `living id ${id} was replaced`);
assert.ok(opened.length > liveIds.size, "camp bodies arrive with the class");
assert.equal(idsOf(st, seasonBefore).length, y0.length);
ok("the opened class is the one that was already alive, not a fresh roll");

const old = newGame({ seed: 42 });
const kept = snapshotClass(old, old.season);
const keptRng = old.rngState;
const keptNext = old.nextPlayerId;
old.players = old.players.filter((p) => p.draftClassSeason == null || p.draftClassSeason === old.season);
delete old.nextFuturePlayerId;
delete old.futureClassTick;
old.phase = "regular";
old.week = 6;
catchUpFutureClasses(old);
assert.equal(snapshotClass(old, old.season), kept);
assert.equal(old.rngState, keptRng);
assert.equal(old.nextPlayerId, keptNext);
assert.ok(idsOf(old, old.season + 1).length > 200);
assert.equal((old.futureClassTick as { week: number } | undefined)?.week, 5);
ok("an old save grows future classes without moving rngState or this year's board");

console.log("future class pipeline ok");
