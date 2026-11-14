/**
 * Play art (Phase 1 leftover C, `docs/proposal-phase1-play-leftovers-2026-11-11.md`).
 * A field strip from the event's own fields. No formation, no draw.
 *
 * Run: npx tsx lib/view/playArt.test.ts
 */
import assert from "node:assert/strict";
import { PlayEvent } from "../core/types";
import { KICKOFF_TEE, fieldX, snapArt } from "./playArt";

function ok(label: string) { console.log("ok   ", label); }

const ev = (o: Partial<PlayEvent>): PlayEvent => ({
  q: 1, clock: 600, down: 1, toGo: 10, yardLine: 30, offenseId: 0,
  kind: "run", result: "gain", yards: 0, homeScore: 0, awayScore: 0, ...o,
});

{
  const td = snapArt(ev({ kind: "pass", result: "td", yardLine: 80, yards: 20 }));
  assert.equal(td.end, 100, "a touchdown reaches the goal line");
  assert.equal(td.glyph, "pass");
  const run = snapArt(ev({ kind: "run", result: "gain", yards: 6 }));
  assert.deepEqual(run, { los: 30, lineToGain: 40, end: 36, glyph: "run" });
  ok("run and touchdown end where the ball ended");
}

{
  const sack = snapArt(ev({ kind: "sack", result: "sack", yards: -8 }));
  assert.ok(sack.end < sack.los, "a sack ends behind the line");
  assert.equal(sack.end, 22);
  const inc = snapArt(ev({ kind: "pass", result: "incomplete", yards: 0 }));
  assert.equal(inc.end, inc.los, "an incomplete pass ends at the line");
  assert.equal(inc.glyph, "incomplete");
  const pick = snapArt(ev({ kind: "pass", result: "int", yards: 0 }));
  assert.equal(pick.glyph, "turnover");
  ok("sack, incomplete and turnover");
}

{
  const pen = snapArt(ev({ kind: "penalty", result: "accepted", yards: -10 }));
  assert.equal(pen.glyph, "penalty");
  assert.equal(pen.lineToGain, null, "a penalty draws no line to gain");
  assert.equal(pen.end, 20);
  ok("penalty");
}

{
  const tb = snapArt(ev({ kind: "kickoff", result: "touchback", yardLine: 25, down: 1 }));
  assert.deepEqual(tb, { los: KICKOFF_TEE, lineToGain: null, end: 0, glyph: "kick" });
  const ret = snapArt(ev({ kind: "kickoff", result: "return", yardLine: 31 }));
  assert.equal(ret.end, 31, "a return ends where the drive starts");
  ok("kickoff art comes from the tee");
}

{
  assert.equal(snapArt(ev({ yardLine: -4, yards: -9, kind: "sack", result: "sack" })).end, 0, "clamps at 0");
  assert.equal(snapArt(ev({ yardLine: 97, toGo: 10, yards: 12 })).end, 100, "clamps at 100");
  assert.equal(snapArt(ev({ yardLine: 97, toGo: 10 })).lineToGain, 100);
  assert.equal(fieldX(30, 0, 0), 30, "the left club's offence runs left to right");
  assert.equal(fieldX(30, 1, 0), 70, "the other club's offence mirrors");
  ok("clamps and mirror");
}
