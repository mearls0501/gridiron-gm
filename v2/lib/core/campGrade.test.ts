/**
 * Camp battles, packet B (`campGrade.ts`): a bounded nudge on the cut from
 * camp's preseason games. Ships off; `GG_CAMP_NUDGE=1` turns it on.
 *
 * Fixtures only: a fresh league placed in camp. Run: npx tsx lib/core/campGrade.test.ts
 */
import assert from "node:assert/strict";
import { newGame } from "./newGame";
import { advanceOffseason } from "./offseason";
import { playOutPreseason } from "./preseason";
import { CAMP_NUDGE_MAX, campGrade, campNudge, campNudgeOn } from "./campGrade";
import { GameState } from "./types";

function ok(label: string) { console.log("ok   ", label); }

function campPlayed(seed: number): GameState {
  const st = newGame({ seed });
  st.phase = "offseason-final";
  st.week = 0;
  st.games = [];
  playOutPreseason(st);
  return st;
}

const clone = (st: GameState): GameState => structuredClone(st);
const roster = (st: GameState) =>
  st.players.filter((p) => p.teamId !== null && !p.retired).map((p) => `${p.id}:${p.teamId}:${p.status ?? ""}`).sort();

function withNudge<T>(on: boolean, fn: () => T): T {
  const before = process.env.GG_CAMP_NUDGE;
  if (on) process.env.GG_CAMP_NUDGE = "1";
  else delete process.env.GG_CAMP_NUDGE;
  try { return fn(); } finally {
    if (before === undefined) delete process.env.GG_CAMP_NUDGE;
    else process.env.GG_CAMP_NUDGE = before;
  }
}

delete process.env.GG_CAMP_NUDGE;

// (1) Ships off.
{
  assert.equal(campNudgeOn(), false);
  const st = campPlayed(42);
  for (const p of st.players) assert.equal(campNudge(st, p), 0);
}
ok("the nudge ships off");

// (2) Grades: bounded, shrunk by snaps, zero where the box has no production line.
{
  const st = campPlayed(42);
  const graded = st.players.filter((p) => campGrade(st, p) !== 0);
  assert.ok(graded.length > st.teams.length * 20, `most camp bodies graded (${graded.length})`);
  for (const p of st.players) {
    const g = campGrade(st, p);
    assert.ok(g >= -1 && g <= 1, "grade within ±1");
    if (["OT", "OG", "C", "P"].includes(p.pos)) assert.equal(g, 0, `${p.pos} has no production line`);
  }
  const camp = st.preseason!.camp;
  const few = graded.filter((p) => (camp[p.id]?.snaps ?? 0) <= 10);
  for (const p of few) assert.ok(Math.abs(campGrade(st, p)) <= 0.25, "ten snaps or fewer moves at most a quarter");
  assert.ok(graded.some((p) => campGrade(st, p) > 0.4) && graded.some((p) => campGrade(st, p) < -0.4), "both tails exist");
}
ok("grades are bounded, shrunk by snaps, zero for the line and punters");

// (3) Zero outside camp, and before any preseason week.
{
  const st = campPlayed(7);
  const p = st.players.find((x) => campGrade(st, x) !== 0)!;
  st.phase = "regular";
  assert.equal(campGrade(st, p), 0);
  const fresh = newGame({ seed: 7 });
  fresh.phase = "offseason-final";
  for (const q of fresh.players) assert.equal(campGrade(fresh, q), 0);
}
ok("zero outside camp and before the first preseason week");

// (4) Off: the cut does not read the camp at all.
{
  const a = campPlayed(11);
  const b = clone(a);
  b.preseason!.camp = {};
  withNudge(false, () => { advanceOffseason(a); advanceOffseason(b); });
  assert.equal(a.phase, "preseason");
  assert.deepEqual(roster(a), roster(b), "same 53s whatever the camp lines say");
  assert.equal(a.rngState, b.rngState);
}
ok("off: the cut is identical with or without camp lines");

// (5) On: it reorders a few bubble spots, deterministically, and never more than the dial allows.
{
  const base = campPlayed(11);
  const off = clone(base);
  const on1 = clone(base);
  const on2 = clone(base);
  withNudge(false, () => advanceOffseason(off));
  withNudge(true, () => { advanceOffseason(on1); advanceOffseason(on2); });
  assert.deepEqual(roster(on1), roster(on2), "deterministic");
  const offSet = new Set(roster(off));
  const changed = roster(on1).filter((r) => !offSet.has(r));
  const kept = off.players.filter((p) => p.teamId !== null).length;
  assert.ok(changed.length > 0, "the nudge does something when on");
  assert.ok(changed.length < kept * 0.08, `a few bubble spots, not a reshuffle (${changed.length} of ${kept})`);
  withNudge(true, () => {
    for (const p of base.players) assert.ok(Math.abs(campNudge(base, p)) <= CAMP_NUDGE_MAX);
  });
}
ok("on: a bounded, deterministic reorder at the bubble");

console.log("campGrade: all passed");
