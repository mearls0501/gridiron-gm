import assert from "node:assert/strict";
import { newGame } from "../lib/core/newGame";
import { startRegularSeason } from "../lib/core/season/engine";
import { blankPlayerGameStat, blankSeasonLine, blankTeamGameStats } from "../lib/core/season/stats";
import { bandLimits, captureRushingRank5, insideBand, lockedBand, RB_PANEL, rushingPanelMean } from "./guardMeasurements";
import { compareCounts, GAME_THRESHOLDS, SEASON_THRESHOLDS, REFERENCE_GAMES } from "./milestoneComparisons";
import { panelSeed, seedFor } from "./metrics";

const home = lockedBand("conditions.homeWinPct");
assert.deepEqual(home, { lo: 51.439, hi: 57.439 });
assert.ok(insideBand(51.702786377708975, home), "the default observation accepted by the lock cannot fail a second home band");
assert.ok(insideBand(home.lo, home) && insideBand(home.hi, home));
assert.ok(!insideBand(51.4389, home) && !insideBand(57.4391, home) && !insideBand(NaN, home));
assert.throws(() => lockedBand("missing.metric"), /missing locked/);
for (const b of [{}, { target: 54 }, { target: 54, tol: -1 }, { min: 58, max: 52 }, { min: NaN }]) assert.throws(() => bandLimits(b));

const samples = [1365, 1216, 1291, 1280, 1205].map((yards, i) => Object.freeze({ panel: i + 1, yards }));
assert.equal(rushingPanelMean(samples), 1271.4);
assert.ok(insideBand(rushingPanelMean(samples), lockedBand("statcheck.rb5RushYds")));
assert.ok(!insideBand(1288, lockedBand("statcheck.rb5RushYds")), "single-sample miss stays visible, while the guard measures the complete panel");
assert.throws(() => rushingPanelMean(samples.slice(0, 4)), /each standard panel/);
assert.throws(() => rushingPanelMean([...samples.slice(0, 4), samples[0]]), /each standard panel/);
assert.throws(() => rushingPanelMean([...samples.slice(0, 4), { panel: 6, yards: 1205 }]), /each standard panel/);
assert.throws(() => rushingPanelMean([...samples.slice(0, 4), { panel: 5, yards: NaN }]), /each standard panel/);
const previous = process.env.GG_SEED;
try {
  for (const panel of RB_PANEL) {
    process.env.GG_SEED = String(panel);
    assert.equal(panelSeed(8675309, panel), seedFor(8675309), "explicit panel preserves existing gate streams");
  }
  process.env.GG_SEED = "999";
  assert.equal(rushingPanelMean(samples), 1271.4, "an outer seed cannot change fixed panel membership");
} finally { if (previous === undefined) delete process.env.GG_SEED; else process.env.GG_SEED = previous; }

const st = newGame({ seed: 42 }); startRegularSeason(st);
for (const g of st.games) {
  g.played = true; g.boxScore = { home: blankTeamGameStats(), away: blankTeamGameStats(), quarters: {home: [], away: []}, scoringPlays: [], players: [] };
}
const first = st.games[0];
[1600, 1500, 1400, 1300, 1200, 1100].forEach((rushYds, i) => first.boxScore!.players.push({ ...blankPlayerGameStat(i + 1, first.homeId, true), rushYds }));
st.phase = "playoffs";
const before = structuredClone(st);
assert.equal(captureRushingRank5(st), 1200);
assert.deepEqual(st, before, "rank observation cannot alter RNG or game state");
const p = st.players[0]; p.stats = [{ ...blankSeasonLine(st.season, 0), rushYds: 9999 }];
assert.equal(captureRushingRank5(st), 1200, "the measurement uses REG boxes, not contaminated season lines");
first.played = false; assert.throws(() => captureRushingRank5(st), /complete REG/); first.played = true;
first.boxScore!.players.push(first.boxScore!.players[0]); assert.throws(() => captureRushingRank5(st), /duplicate/); first.boxScore!.players.pop();

assert.equal(REFERENCE_GAMES, 1087);
assert.equal(GAME_THRESHOLDS.length + SEASON_THRESHOLDS.length, 46);
assert.equal([...GAME_THRESHOLDS, ...SEASON_THRESHOLDS].filter(t => !t.comparable).length, 4);
const rush200 = GAME_THRESHOLDS.find(t => t.label === "200+ rush yds")!;
const fg60 = GAME_THRESHOLDS.find(t => t.label === "60+ yd FG")!;
assert.equal(rush200.referenceCount, 6); assert.equal(fg60.referenceCount, 18);
assert.equal(compareCounts(38, 4352, rush200.referenceCount, rush200.referenceExposure).verdict, "ok", "bad 5/year estimate must not manufacture a rushing deficiency");
assert.equal(compareCounts(56, 4352, fg60.referenceCount, fg60.referenceExposure).verdict, "ok", "bad 1.5/year FG estimate must not manufacture excessive range");
assert.equal(compareCounts(504, 4352, 72, 1087).verdict, "TOO COMMON", "a genuine sack-distribution miss still fails");
assert.equal(compareCounts(11, 16, 16, 4).verdict, "TOO RARE", "a genuine season passing-tail miss still fails");
assert.equal(compareCounts(1, 16, 0, 4).verdict, "ok", "zero reference observations do not imply impossibility");
assert.equal(compareCounts(0, 16, 0, 4).pValue, 1);
assert.ok(Math.abs(compareCounts(0, 1, 4, 1).pValue - 0.125) < 1e-12, "independent exact binomial fixture: both n=4 extremes");
assert.equal(compareCounts(4000, 80, 200, 4).pValue, 1, "large equal-rate counts avoid PMF underflow");
assert.ok(Math.abs(compareCounts(11, 16, 16, 4).pValue - compareCounts(16, 4, 11, 16).pValue) < 1e-12);
for (const args of [[-1,16,0,4], [1.5,16,0,4], [1,0,0,4], [1,16,0,NaN]]) assert.throws(() => compareCounts(...args as [number,number,number,number]));
console.log("ok    guard measurements — locked home band, complete RB panel, REG evidence, finite NFL reference, exact comparisons, unmatched tackle diagnostics");
