/**
 * Tail-distribution analysis.
 *
 * Averages being right does not mean the extremes are right. A simulation can
 * hit 22.5 points a game and still produce a 500-yard passer every other week,
 * or never produce one at all. This measures how OFTEN milestone performances
 * happen and compares that to how often they happen in real NFL history.
 *
 *   npx tsx scripts/tails.ts [seasons]
 */
import { newGame } from "../lib/core/newGame";
import { advance } from "../lib/core/season/engine";
import { GameState, Player } from "../lib/core/types";
import { emitAll, progress, seedFor } from "./metrics";
import { compareCounts, GAME_THRESHOLDS, SEASON_THRESHOLDS, Threshold } from "./milestoneComparisons";

const SEASONS = Number(process.argv[2] ?? 12);

function report(title: string, rows: { t: Threshold; count: number }[], seasons: number, games: number, scope: "game" | "season"): number {
  console.log(`\n${title} (fresh leagues; NFL 2021–24 REG; exact two-sample 95% comparison)`);
  console.log(`  ${"milestone".padEnd(17)} ${"sim/season".padStart(10)} ${"NFL/season".padStart(10)}   counts / exposure · p-value · verdict`);
  let problems = 0;
  for (const { t, count } of rows) {
    const exposure = scope === "game" ? games : seasons;
    const comparison = t.comparable ? compareCounts(count, exposure, t.referenceCount, t.referenceExposure) : null;
    if (comparison && comparison.verdict !== "ok") problems++;
    console.log(`  ${t.label.padEnd(17)} ${(count / seasons).toFixed(3).padStart(10)} ${t.nfl.toFixed(3).padStart(10)}   ` +
      `${count}/${exposure} vs ${t.referenceCount}/${t.referenceExposure} · ` +
      (comparison ? `p=${comparison.pValue.toPrecision(5)} · ${comparison.verdict}` : "UNMATCHED: combined NFL tackles; engine has no assists (diagnostic only)"));
  }
  return problems;
}

// ---------------------------------------------------------------------------

const gameCounts = GAME_THRESHOLDS.map(() => 0);
const seasonCounts = SEASON_THRESHOLDS.map(() => 0);
let seasonsRun = 0;
let gamesRun = 0;

const extremes = {
  passYds: 0, passTd: 0, rushYds: 0, rushTd: 0, recYds: 0, recTd: 0,
  sacks: 0, tackles: 0, ints: 0, longFg: 0,
  sPassYds: 0, sRushYds: 0, sRecYds: 0, sSacks: 0, sTackles: 0, sPassTd: 0,
};

function playSeason(st: GameState): void {
  advance(st);
  let g = 0;
  while (st.phase === "regular" && g++ < 40) advance(st);
}

let st = newGame({ seed: seedFor(918273) });

for (let s = 0; s < SEASONS; s++) {
  if (s > 0) {
    // A fresh generated league each season: this is not an aged-franchise census.
    st = newGame({ seed: seedFor(918273) + s * 7919 });
  }
  playSeason(st);
  seasonsRun++;
  const regular = st.games.filter(g => g.season === st.season && g.playoffRound === null);
  if (st.phase !== "playoffs" || !regular.length || regular.some(g => !g.played || !g.boxScore)) {
    throw new Error("milestones require complete REG box evidence before playoffs");
  }
  for (const gm of regular) {
    gamesRun++;
    for (const ps of gm.boxScore!.players) {
      const raw = ps;
      GAME_THRESHOLDS.forEach((t, i) => { if (t.test(raw)) gameCounts[i]++; });
      extremes.passYds = Math.max(extremes.passYds, ps.passYds);
      extremes.passTd = Math.max(extremes.passTd, ps.passTd);
      extremes.rushYds = Math.max(extremes.rushYds, ps.rushYds);
      extremes.rushTd = Math.max(extremes.rushTd, ps.rushTd);
      extremes.recYds = Math.max(extremes.recYds, ps.recYds);
      extremes.recTd = Math.max(extremes.recTd, ps.recTd);
      extremes.sacks = Math.max(extremes.sacks, ps.sacks);
      extremes.tackles = Math.max(extremes.tackles, ps.tackles);
      extremes.ints = Math.max(extremes.ints, ps.ints);
      extremes.longFg = Math.max(extremes.longFg, ps.longFg);
    }
  }

  const season = st.season;
  for (const p of st.players as Player[]) {
    const line = p.stats.find((x) => x.season === season);
    if (!line) continue;
    const raw = line;
    SEASON_THRESHOLDS.forEach((t, i) => { if (t.test(raw)) seasonCounts[i]++; });
    extremes.sPassYds = Math.max(extremes.sPassYds, line.passYds);
    extremes.sPassTd = Math.max(extremes.sPassTd, line.passTd);
    extremes.sRushYds = Math.max(extremes.sRushYds, line.rushYds);
    extremes.sRecYds = Math.max(extremes.sRecYds, line.recYds);
    extremes.sSacks = Math.max(extremes.sSacks, line.sacks);
    extremes.sTackles = Math.max(extremes.sTackles, line.tackles);
  }
  progress(`  season ${st.season} (${seasonsRun}/${SEASONS}) games=${gamesRun}`);
}

console.log(`\n=== Tail distribution: ${seasonsRun} seasons, ${gamesRun} games ===`);

const gp = report(
  "SINGLE GAME",
  GAME_THRESHOLDS.map((t, i) => ({ t, count: gameCounts[i] })),
  seasonsRun, gamesRun, "game"
);
const sp = report(
  "FULL SEASON",
  SEASON_THRESHOLDS.map((t, i) => ({ t, count: seasonCounts[i] })),
  seasonsRun, gamesRun, "season"
);

console.log(`\nBest single game seen (NFL record in brackets)`);
console.log(`  passing   ${extremes.passYds} yds [554] · ${extremes.passTd} TD [7]`);
console.log(`  rushing   ${extremes.rushYds} yds [296] · ${extremes.rushTd} TD [6]`);
console.log(`  receiving ${extremes.recYds} yds [336] · ${extremes.recTd} TD [5]`);
console.log(`  defense   ${extremes.sacks} sacks [7] · ${extremes.tackles} tackles [unmatched: no assists] · ${extremes.ints} INT [4]`);
console.log(`  kicking   ${extremes.longFg} yd FG [66]`);

console.log(`\nBest season seen (NFL record in brackets)`);
console.log(`  passing   ${extremes.sPassYds} yds [5,477] · ${extremes.sPassTd} TD [55]`);
console.log(`  rushing   ${extremes.sRushYds} yds [2,105]`);
console.log(`  receiving ${extremes.sRecYds} yds [1,964]`);
console.log(`  defense   ${extremes.sSacks} sacks [22.5] · ${extremes.sTackles} tackles [unmatched: no assists]`);

console.log(`\n${gp + sp === 0 ? "TAILS LOOK RIGHT" : `${gp + sp} comparable milestone frequencies are off`}`);

// --- machine-readable summary (see scripts/metrics.ts) -----------------------
emitAll({
  "tails.milestonesOff": gp + sp, "tails.gameMilestonesOff": gp, "tails.seasonMilestonesOff": sp,
  "tails.comparableCategories": [...GAME_THRESHOLDS, ...SEASON_THRESHOLDS].filter(t => t.comparable).length,
  "tails.unmatchedTackleCategories": [...GAME_THRESHOLDS, ...SEASON_THRESHOLDS].filter(t => !t.comparable).length,
  "tails.bestGamePassYds": extremes.passYds, "tails.bestGameRushYds": extremes.rushYds,
  "tails.bestGameRecYds": extremes.recYds, "tails.bestSeasonPassYds": extremes.sPassYds,
  "tails.bestSeasonRushYds": extremes.sRushYds, "tails.bestSeasonRecYds": extremes.sRecYds,
  "tails.bestSeasonSacks": extremes.sSacks,
});
