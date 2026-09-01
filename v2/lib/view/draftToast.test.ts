/**
 * Regression for the Sim-entire-draft toast undercount.
 *
 * Playtest leftover: toast said "201 picks made" (also 190) while the
 * Prospects Left subtitle read "224 of 224 picks made". simAll() used
 * after − before (remaining on this click), not filled slots.
 *
 * Run: npx tsx lib/view/draftToast.test.ts
 */
import assert from "node:assert/strict";
import { newGame } from "../core/newGame";
import { enterDraft, simEntireDraft } from "../core/offseason";
import { availableProspects, makePick } from "../core/offseason/draft";
import { Rng } from "../core/rng";
import { simEntireDraftToast } from "./draftToast";

function filledCount(picks: ReadonlyArray<{ playerId: number | null }>): number {
  return picks.filter((p) => p.playerId !== null).length;
}

function headerSub(picks: ReadonlyArray<{ playerId: number | null }>): string {
  return `${filledCount(picks)} of ${picks.length} picks made`;
}

function oldDeltaToast(
  before: number,
  after: number,
  classSize: number,
): string {
  const made = after - before;
  return `Draft complete — ${made} pick${made === 1 ? "" : "s"} made, ${classSize} in your class`;
}

// Playtest shape: 23 already filled, then Sim entire draft. Old toast: 201.
{
  const picks = [
    ...Array.from({ length: 23 }, (_, i) => ({
      playerId: i + 1,
      teamId: i < 2 ? 1 : 2,
    })),
    ...Array.from({ length: 201 }, () => ({ playerId: null, teamId: 2 })),
  ];
  const before = filledCount(picks);
  const afterPicks = picks.map((p, i) => ({
    ...p,
    playerId: p.playerId ?? 1000 + i,
  }));
  const filled = filledCount(afterPicks);
  const classSize = afterPicks.filter((p) => p.teamId === 1 && p.playerId !== null).length;
  const toast = simEntireDraftToast(afterPicks, 1);

  assert.equal(before, 23);
  assert.equal(filled, 224);
  assert.equal(headerSub(afterPicks), "224 of 224 picks made");
  assert.equal(toast, "Draft complete — 224 picks made, 2 in your class");
  assert.equal(oldDeltaToast(before, filled, classSize), "Draft complete — 201 picks made, 2 in your class");
  assert.notEqual(toast, oldDeltaToast(before, filled, classSize));
  assert.match(toast, new RegExp(`${filled} picks made`));
}

// Live leftover path: some slots filled, then simEntireDraft. Toast = header fill.
{
  const st = newGame({ seed: 1 });
  enterDraft(st);
  assert.ok(st.draft);
  let before = filledCount(st.draft.picks);
  if (before === 0) {
    const rng = new Rng(st.rngState);
    const pool = availableProspects(st, st.season);
    assert.ok(pool[0], "need a prospect to force a mid-draft board");
    assert.ok(makePick(st, pool[0].id, rng));
    st.rngState = rng.state;
    before = filledCount(st.draft.picks);
  }
  assert.ok(before > 0, "leftover path needs a non-empty board");

  simEntireDraft(st);
  const filled = filledCount(st.draft.picks);
  const toast = simEntireDraftToast(st.draft.picks, st.userTeamId);
  const header = headerSub(st.draft.picks);
  const classSize = st.draft.picks.filter(
    (p) => p.teamId === st.userTeamId && p.playerId !== null,
  ).length;
  const delta = filled - before;

  assert.equal(filled, st.draft.picks.length);
  assert.equal(header, `${filled} of ${st.draft.picks.length} picks made`);
  assert.match(toast, new RegExp(`${filled} pick`));
  assert.ok(toast.endsWith(`, ${classSize} in your class`));
  assert.ok(delta < filled, `delta ${delta} must be the leftover, not the board`);
  assert.notEqual(toast, oldDeltaToast(before, filled, classSize));
}

console.log("ok    draftToast — Sim entire draft toast matches filled pick count");
