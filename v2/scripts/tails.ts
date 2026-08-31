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
import { emitAll, seedFor } from "./metrics";

const SEASONS = Number(process.argv[2] ?? 12);

interface Threshold {
  label: string;
  /** Expected occurrences per 272-game season in the real NFL. */
  nfl: number;
  /** Real-world note: the all-time record, or how rare this is. */
  note: string;
  test: (p: Record<string, number>) => boolean;
}

// Frequencies are per season. Sources are modern-era NFL rates; "ever" items
// are converted to a per-season rate over roughly 60 seasons of the modern game.
const GAME_THRESHOLDS: Threshold[] = [
  { label: "400+ pass yds",  nfl: 11,    note: "common but notable",     test: (p) => p.passYds >= 400 },
  { label: "450+ pass yds",  nfl: 3.5,   note: "a few a year",           test: (p) => p.passYds >= 450 },
  { label: "500+ pass yds",  nfl: 0.5,   note: "~1 every 2 years",       test: (p) => p.passYds >= 500 },
  { label: "550+ pass yds",  nfl: 0.02,  note: "record 554, once ever",  test: (p) => p.passYds >= 550 },
  { label: "5+ pass TD",     nfl: 6,     note: "several a year",         test: (p) => p.passTd >= 5 },
  { label: "6+ pass TD",     nfl: 1.2,   note: "~1 a year",              test: (p) => p.passTd >= 6 },
  { label: "7+ pass TD",     nfl: 0.13,  note: "8 times ever",           test: (p) => p.passTd >= 7 },

  { label: "150+ rush yds",  nfl: 22,    note: "regular occurrence",     test: (p) => p.rushYds >= 150 },
  { label: "200+ rush yds",  nfl: 5,     note: "a handful a year",       test: (p) => p.rushYds >= 200 },
  { label: "250+ rush yds",  nfl: 0.4,   note: "~1 every 2-3 years",     test: (p) => p.rushYds >= 250 },
  { label: "300+ rush yds",  nfl: 0.02,  note: "record 296 — never",     test: (p) => p.rushYds >= 300 },
  { label: "4+ rush TD",     nfl: 2.5,   note: "a couple a year",        test: (p) => p.rushTd >= 4 },
  { label: "5+ rush TD",     nfl: 0.25,  note: "~1 every 4 years",       test: (p) => p.rushTd >= 5 },

  { label: "150+ rec yds",   nfl: 30,    note: "regular occurrence",     test: (p) => p.recYds >= 150 },
  { label: "200+ rec yds",   nfl: 6,     note: "a handful a year",       test: (p) => p.recYds >= 200 },
  { label: "250+ rec yds",   nfl: 0.6,   note: "~1 every 2 years",       test: (p) => p.recYds >= 250 },
  { label: "300+ rec yds",   nfl: 0.05,  note: "record 336, 5x ever",    test: (p) => p.recYds >= 300 },
  { label: "4+ rec TD",      nfl: 1.8,   note: "1-2 a year",             test: (p) => p.recTd >= 4 },

  { label: "3+ sacks",       nfl: 22,    note: "regular occurrence",     test: (p) => p.sacks >= 3 },
  { label: "4+ sacks",       nfl: 5,     note: "a handful a year",       test: (p) => p.sacks >= 4 },
  { label: "5+ sacks",       nfl: 1,     note: "~1 a year",              test: (p) => p.sacks >= 5 },
  { label: "6+ sacks",       nfl: 0.15,  note: "record 7, very rare",    test: (p) => p.sacks >= 6 },

  { label: "3+ INT",         nfl: 1.5,   note: "1-2 a year",             test: (p) => p.ints >= 3 },
  { label: "15+ tackles",    nfl: 30,    note: "regular occurrence",     test: (p) => p.tackles >= 15 },
  { label: "20+ tackles",    nfl: 3,     note: "a few a year",           test: (p) => p.tackles >= 20 },
  { label: "5+ FG made",     nfl: 6,     note: "several a year",         test: (p) => p.fgm >= 5 },
  { label: "60+ yd FG",      nfl: 1.5,   note: "1-2 a year now",         test: (p) => p.longFg >= 60 },
];

const SEASON_THRESHOLDS: Threshold[] = [
  { label: "4,500+ pass yds", nfl: 5,    note: "several a year",         test: (l) => l.passYds >= 4500 },
  { label: "5,000+ pass yds", nfl: 0.35, note: "12 times ever",          test: (l) => l.passYds >= 5000 },
  { label: "5,500+ pass yds", nfl: 0.02, note: "record 5,477 — never",   test: (l) => l.passYds >= 5500 },
  { label: "40+ pass TD",     nfl: 1.6,  note: "1-2 a year",             test: (l) => l.passTd >= 40 },
  { label: "50+ pass TD",     nfl: 0.05, note: "3 times ever",           test: (l) => l.passTd >= 50 },

  { label: "1,500+ rush yds", nfl: 2.5,  note: "a couple a year",        test: (l) => l.rushYds >= 1500 },
  { label: "1,800+ rush yds", nfl: 0.5,  note: "~1 every 2 years",       test: (l) => l.rushYds >= 1800 },
  { label: "2,000+ rush yds", nfl: 0.13, note: "8 times ever",           test: (l) => l.rushYds >= 2000 },
  { label: "20+ rush TD",     nfl: 0.7,  note: "~1 every year or two",   test: (l) => l.rushTd >= 20 },

  { label: "1,400+ rec yds",  nfl: 4,    note: "several a year",         test: (l) => l.recYds >= 1400 },
  { label: "1,700+ rec yds",  nfl: 0.4,  note: "~1 every 2-3 years",     test: (l) => l.recYds >= 1700 },
  { label: "1,900+ rec yds",  nfl: 0.05, note: "record 1,964 — 2x ever", test: (l) => l.recYds >= 1900 },
  { label: "15+ rec TD",      nfl: 1.5,  note: "1-2 a year",             test: (l) => l.recTd >= 15 },

  { label: "15+ sacks",       nfl: 3.5,  note: "a few a year",           test: (l) => l.sacks >= 15 },
  { label: "20+ sacks",       nfl: 0.4,  note: "~1 every 2-3 years",     test: (l) => l.sacks >= 20 },
  { label: "23+ sacks",       nfl: 0.02, note: "record 22.5 — never",    test: (l) => l.sacks >= 23 },

  { label: "10+ INT",         nfl: 0.2,  note: "rare, record 14",        test: (l) => l.ints >= 10 },
  { label: "150+ tackles",    nfl: 4,    note: "several a year",         test: (l) => l.tackles >= 150 },
  { label: "180+ tackles",    nfl: 0.3,  note: "~1 every 3 years",       test: (l) => l.tackles >= 180 },
];

/**
 * Central 95% Poisson interval for a COUNT.
 *
 * The old verdict compared RATES, and at 16 seasons the finest nonzero rate
 * expressible is 1/16 = 0.0625 — above the 0.06 pass line seven categories
 * used. One occurrence in the entire run flipped them to TOO COMMON, and
 * nothing between "never" and "fails" was representable. A correctly
 * calibrated sim failed them by construction: at nfl 0.02 over 16 seasons
 * lambda = 0.32 and P(>=1) is 27%; at 0.05, lambda = 0.8 and P(>=1) is 55%.
 * Roughly 2.75 of the reported failures per seed were arithmetic.
 *
 * Counting instead of rating fixes it. At lambda 0.32 the interval is [0, 2],
 * so a single occurrence is inside it, which is the honest answer: one event
 * is this guard's resolution limit and carries no information.
 */
function poissonInterval(lambda: number): [number, number] {
  if (lambda <= 0) return [0, 0];
  let lo = -1, hi = -1;
  let cdf = 0, term = Math.exp(-lambda);
  for (let k = 0; k < 100000; k++) {
    if (k > 0) term *= lambda / k;
    cdf += term;
    if (lo < 0 && cdf >= 0.025) lo = k;
    if (cdf >= 0.975) { hi = k; break; }
  }
  return [Math.max(0, lo), hi < 0 ? Math.ceil(lambda * 3) : hi];
}

/**
 * Verdict on a raw count over `seasons`.
 *
 * Poisson-interval OR the old ratio band — deliberately a union, not a
 * replacement. A pure Poisson test treats the NFL rate as known exactly and
 * assumes the only variation is sampling; at lambda 480 its interval is +/-9%,
 * far tighter than the +/-60% the ratio band allows, and real per-season rates
 * are overdispersed relative to Poisson. Swapping outright would trade seven
 * fictional failures for a batch of new ones on the COMMON categories. The
 * union removes the quantization failures and changes nothing else, so this
 * repair can only move `milestonesOff` down.
 */
function verdict(count: number, expected: number, seasons: number): string {
  const lambda = expected * seasons;
  const [lo, hi] = poissonInterval(lambda);
  if (count >= lo && count <= hi) return "ok";

  const actual = count / seasons;
  if (expected <= 0.05) return "TOO COMMON";
  const ratio = actual / expected;
  if (ratio > 2.5) return "TOO COMMON";
  if (ratio < 0.4) return "TOO RARE";
  if (ratio > 1.6 || ratio < 0.62) return "off";
  return "ok";
}

function report(title: string, rows: { t: Threshold; count: number }[], seasons: number): number {
  console.log(`\n${title}   (per season, ${seasons} simulated)`);
  console.log(`  ${"milestone".padEnd(17)} ${"sim".padStart(7)} ${"NFL".padStart(7)} ${"n".padStart(5)} ${"95% band".padStart(10)}   verdict`);
  let problems = 0;
  for (const { t, count } of rows) {
    const per = count / seasons;
    const [lo, hi] = poissonInterval(t.nfl * seasons);
    const v = verdict(count, t.nfl, seasons);
    if (v !== "ok") problems++;
    const flag = v === "ok" ? "" : `  <- ${v}`;
    console.log(
      `  ${t.label.padEnd(17)} ${per.toFixed(2).padStart(7)} ${t.nfl.toFixed(2).padStart(7)} ` +
      `${String(count).padStart(5)} ${`${lo}-${hi}`.padStart(10)}   ${t.note}${flag}`
    );
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
    // Fresh league every few seasons so results are not one franchise's arc.
    st = newGame({ seed: seedFor(918273) + s * 7919 });
  }
  playSeason(st);
  seasonsRun++;

  for (const gm of st.games) {
    if (!gm.played || !gm.boxScore || gm.playoffRound !== null) continue;
    gamesRun++;
    for (const ps of gm.boxScore.players) {
      const raw = ps as unknown as Record<string, number>;
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
    const raw = line as unknown as Record<string, number>;
    SEASON_THRESHOLDS.forEach((t, i) => { if (t.test(raw)) seasonCounts[i]++; });
    extremes.sPassYds = Math.max(extremes.sPassYds, line.passYds);
    extremes.sPassTd = Math.max(extremes.sPassTd, line.passTd);
    extremes.sRushYds = Math.max(extremes.sRushYds, line.rushYds);
    extremes.sRecYds = Math.max(extremes.sRecYds, line.recYds);
    extremes.sSacks = Math.max(extremes.sSacks, line.sacks);
    extremes.sTackles = Math.max(extremes.sTackles, line.tackles);
  }
}

console.log(`\n=== Tail distribution: ${seasonsRun} seasons, ${gamesRun} games ===`);

const gp = report(
  "SINGLE GAME",
  GAME_THRESHOLDS.map((t, i) => ({ t, count: gameCounts[i] })),
  seasonsRun
);
const sp = report(
  "FULL SEASON",
  SEASON_THRESHOLDS.map((t, i) => ({ t, count: seasonCounts[i] })),
  seasonsRun
);

console.log(`\nBest single game seen (NFL record in brackets)`);
console.log(`  passing   ${extremes.passYds} yds [554] · ${extremes.passTd} TD [7]`);
console.log(`  rushing   ${extremes.rushYds} yds [296] · ${extremes.rushTd} TD [6]`);
console.log(`  receiving ${extremes.recYds} yds [336] · ${extremes.recTd} TD [5]`);
console.log(`  defense   ${extremes.sacks} sacks [7] · ${extremes.tackles} tackles [~25] · ${extremes.ints} INT [4]`);
console.log(`  kicking   ${extremes.longFg} yd FG [66]`);

console.log(`\nBest season seen (NFL record in brackets)`);
console.log(`  passing   ${extremes.sPassYds} yds [5,477] · ${extremes.sPassTd} TD [55]`);
console.log(`  rushing   ${extremes.sRushYds} yds [2,105]`);
console.log(`  receiving ${extremes.sRecYds} yds [1,964]`);
console.log(`  defense   ${extremes.sSacks} sacks [22.5] · ${extremes.sTackles} tackles [~184]`);

console.log(`\n${gp + sp === 0 ? "TAILS LOOK RIGHT" : `${gp + sp} milestone frequencies are off`}`);

// --- machine-readable summary (see scripts/metrics.ts) -----------------------
emitAll({
  "tails.milestonesOff": gp + sp, "tails.gameMilestonesOff": gp, "tails.seasonMilestonesOff": sp,
  "tails.bestGamePassYds": extremes.passYds, "tails.bestGameRushYds": extremes.rushYds,
  "tails.bestGameRecYds": extremes.recYds, "tails.bestSeasonPassYds": extremes.sPassYds,
  "tails.bestSeasonRushYds": extremes.sRushYds, "tails.bestSeasonRecYds": extremes.sRecYds,
  "tails.bestSeasonSacks": extremes.sSacks,
});
