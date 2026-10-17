/** The RB guard always measures the same complete five-seed panel, in either gate tier. */
import { newGame } from "../lib/core/newGame";
import { advance } from "../lib/core/season/engine";
import { captureRushingRank5, RB_PANEL, rushingPanelMean } from "./guardMeasurements";
import { emitAll, panelSeed, progress } from "./metrics";

const samples = RB_PANEL.map((panel) => {
  const seed = panelSeed(8675309, panel);
  const state = newGame({ seed });
  advance(state);
  let weeks = 0;
  while (state.phase === "regular" && weeks++ < 40) advance(state);
  const yards = captureRushingRank5(state);
  progress(`  RB panel ${panel}/${RB_PANEL.length} seed=${seed} rank5=${yards}`);
  return Object.freeze({ panel, yards });
});
const mean = rushingPanelMean(samples);
console.log(`RB #5 five-seed REG mean: ${mean.toFixed(2)} yards (individual seasons are diagnostic)`);
emitAll({ "statcheck.rb5RushYds": mean, "rbpanel.samples": samples.length,
  "rbpanel.minSample": Math.min(...samples.map((s) => s.yards)),
  "rbpanel.maxSample": Math.max(...samples.map((s) => s.yards)) });
