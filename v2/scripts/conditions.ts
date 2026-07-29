/**
 * Do game-day conditions actually change games?
 *
 * Home field, weather and rest are only worth having if they show up in the
 * results. This plays real seasons and splits the box scores by condition.
 *
 *   npx tsx scripts/conditions.ts [seasons]
 */
import { newGame } from "../lib/core/newGame";
import { advance } from "../lib/core/season/engine";
import { GameState, isHarsh } from "../lib/core/types";
import { emitAll, seedFor } from "./metrics";

const SEASONS = Number(process.argv[2] ?? 6);

interface Bucket {
  n: number;
  points: number;
  passYds: number;
  rushYds: number;
  fga: number;
  fgm: number;
  fgDist: number;
  fgMax: number;
  fumbles: number;
  passAtt: number;
  rushAtt: number;
  puntYds: number;
  punts: number;
}

const mk = (): Bucket => ({
  n: 0, points: 0, passYds: 0, rushYds: 0, fga: 0, fgm: 0, fgDist: 0, fgMax: 0,
  fumbles: 0, passAtt: 0, rushAtt: 0, puntYds: 0, punts: 0,
});

const dome = mk();
const mild = mk();      // outdoors, 45F+, calm
const cold = mk();      // 30F or below
const windy = mk();     // 20mph+
const snowy = mk();

function addTeamGame(b: Bucket, pts: number, box: { passYards: number; rushYards: number }, players: {
  teamId: number; fga: number; fgm: number; longFg: number; fumbles: number;
  passAtt: number; rushAtt: number; punts: number; puntYds: number;
}[], teamId: number) {
  b.n++;
  b.points += pts;
  b.passYds += box.passYards;
  b.rushYds += box.rushYards;
  for (const p of players) {
    if (p.teamId !== teamId) continue;
    b.fga += p.fga; b.fgm += p.fgm; b.fgDist += p.longFg;
    b.fgMax = Math.max(b.fgMax, p.longFg);
    b.fumbles += p.fumbles;
    b.passAtt += p.passAtt; b.rushAtt += p.rushAtt;
    b.punts += p.punts; b.puntYds += p.puntYds;
  }
}

let homeWins = 0;
let awayWins = 0;
let homePts = 0;
let awayPts = 0;
let games = 0;
let byeWins = 0;
let byeGames = 0;

for (let s = 0; s < SEASONS; s++) {
  const st: GameState = newGame({ seed: seedFor(5150) + s * 977 });
  advance(st);
  let g = 0;
  while (st.phase === "regular" && g++ < 40) advance(st);

  for (const gm of st.games) {
    if (!gm.played || !gm.boxScore || gm.playoffRound !== null) continue;
    games++;
    homePts += gm.homeScore;
    awayPts += gm.awayScore;
    if (gm.homeScore > gm.awayScore) homeWins++;
    else if (gm.awayScore > gm.homeScore) awayWins++;

    const c = gm.conditions;
    if (c) {
      // Rest advantage: did the team coming off a bye win?
      if (c.homeRest >= 13 && c.awayRest < 13) { byeGames++; if (gm.homeScore > gm.awayScore) byeWins++; }
      if (c.awayRest >= 13 && c.homeRest < 13) { byeGames++; if (gm.awayScore > gm.homeScore) byeWins++; }
    }

    const w = c?.weather;
    const pick = (): Bucket[] => {
      if (!w || w.dome) return [dome];
      const out: Bucket[] = [];
      if (w.temp <= 30) out.push(cold);
      if (w.wind >= 20) out.push(windy);
      if (w.precip === "snow") out.push(snowy);
      if (w.temp >= 45 && w.wind < 12 && w.precip === "none") out.push(mild);
      return out;
    };
    for (const b of pick()) {
      addTeamGame(b, gm.homeScore, gm.boxScore.home, gm.boxScore.players, gm.homeId);
      addTeamGame(b, gm.awayScore, gm.boxScore.away, gm.boxScore.players, gm.awayId);
    }
  }
}

function row(label: string, b: Bucket, ref?: Bucket) {
  if (b.n === 0) { console.log(`  ${label.padEnd(22)} (no games)`); return; }
  const per = (v: number) => v / b.n;
  const delta = ref && ref.n > 0
    ? `   pts ${(per(b.points) - ref.points / ref.n >= 0 ? "+" : "")}${(per(b.points) - ref.points / ref.n).toFixed(1)}`
    : "";
  console.log(
    `  ${label.padEnd(22)} n=${String(b.n).padStart(5)}  ` +
    `${per(b.points).toFixed(1)} pts  ` +
    `${per(b.passYds).toFixed(0)} pass  ` +
    `${per(b.rushYds).toFixed(0)} rush  ` +
    `${(b.passAtt / Math.max(1, b.passAtt + b.rushAtt) * 100).toFixed(0)}% pass  ` +
    `FG ${b.fga ? (b.fgm / b.fga * 100).toFixed(0) : "--"}% lng${b.fgMax}  ` +
    `fum ${per(b.fumbles).toFixed(2)}  ` +
    `punt ${b.punts ? (b.puntYds / b.punts).toFixed(1) : "--"}` +
    delta
  );
}

console.log(`\n=== Conditions across ${SEASONS} seasons (${games} games) ===\n`);
console.log("By weather (per team-game):");
row("dome", dome);
row("outdoor, mild", mild, dome);
row("cold (<=30F)", cold, dome);
row("windy (>=20mph)", windy, dome);
row("snow", snowy, dome);

console.log(`\nHome field:`);
console.log(`  win rate      ${(homeWins / (homeWins + awayWins) * 100).toFixed(1)}%     NFL ~55%`);
console.log(`  scoring edge  ${((homePts - awayPts) / games).toFixed(2)} pts     NFL ~+2.0`);

console.log(`\nRest:`);
console.log(
  byeGames > 0
    ? `  off a bye vs a normal week: ${(byeWins / byeGames * 100).toFixed(1)}% win rate (n=${byeGames})   NFL ~55%`
    : `  no bye-mismatch games found`
);

// Sanity assertions
const problems: string[] = [];
const hw = homeWins / (homeWins + awayWins) * 100;
if (hw < 52 || hw > 58) problems.push(`home win rate ${hw.toFixed(1)}% outside 52-58%`);
if (cold.n > 50 && dome.n > 50) {
  const d = cold.points / cold.n - dome.points / dome.n;
  if (d > -0.5) problems.push(`cold games should score less than dome games (delta ${d.toFixed(1)})`);
}
if (windy.n > 30 && dome.n > 50) {
  // Raw FG% is the wrong measure: wind shortens a kicker's usable range, so
  // teams simply stop attempting the long ones and the made percentage holds up.
  // What must be true is that the kicks they DO attempt are shorter.
  if (windy.fgMax >= dome.fgMax) {
    problems.push(`wind should shorten kicking range (longest kick ${windy.fgMax} vs ${dome.fgMax} in a dome)`);
  }
}
if (windy.n > 30 && dome.n > 50) {
  const wp = windy.passAtt / (windy.passAtt + windy.rushAtt);
  const dp = dome.passAtt / (dome.passAtt + dome.rushAtt);
  if (wp >= dp) problems.push(`wind should push teams toward the run (${(wp*100).toFixed(0)}% vs ${(dp*100).toFixed(0)}%)`);
}

const dl = (b: typeof cold) => (b.n && dome.n ? b.points / b.n - dome.points / dome.n : 0);
const pRate = (b: typeof cold) => (b.passAtt + b.rushAtt ? (b.passAtt / (b.passAtt + b.rushAtt)) * 100 : 0);
emitAll({
  "conditions.problems": problems.length,
  "conditions.homeWinPct": (homeWins / (homeWins + awayWins)) * 100,
  "conditions.homeScoringEdge": (homePts - awayPts) / games,
  "conditions.byeWinPct": byeGames > 0 ? (byeWins / byeGames) * 100 : 0,
  "conditions.byeGames": byeGames,
  "conditions.coldPointsDelta": dl(cold), "conditions.windPointsDelta": dl(windy),
  "conditions.snowPointsDelta": dl(snowy),
  "conditions.domePassRatePct": pRate(dome), "conditions.windPassRatePct": pRate(windy),
  "conditions.domeLongestFg": dome.fgMax, "conditions.windLongestFg": windy.fgMax,
});
console.log(`\n${problems.length === 0 ? "CONDITIONS BEHAVE AS EXPECTED" : "PROBLEMS:"}`);
for (const p of problems) console.log(`  - ${p}`);
process.exit(problems.length === 0 ? 0 : 1);
