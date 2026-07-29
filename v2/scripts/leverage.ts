/**
 * Attribute leverage.
 *
 * Season-long correlations between an attribute and production are misleading
 * here: `generateAttrs` builds every position-relevant attribute around the same
 * target, so they all co-vary. Awareness correlated with quarterback passing
 * yards at r=0.51 while the engine never read it once.
 *
 * The only honest test is a controlled one — clone a league, change exactly one
 * attribute, hold everything else fixed, and simulate the same matchup many
 * times. That is what this does.
 *
 *   npx tsx scripts/leverage.ts [gamesPerTrial]
 */
import { newGame } from "../lib/core/newGame";
import { Rng } from "../lib/core/rng";
import { simulateGame } from "../lib/core/sim/game";
import { autoSortDepthChart } from "../lib/core/generate";
import { AttrKey, Game, GameState, Player, Position } from "../lib/core/types";
import { POSITION_WEIGHTS } from "../lib/core/ratings";
import { emitAll, seedFor } from "./metrics";

const N = Number(process.argv[2] ?? 160);
const LOW = 30;
const HIGH = 90;

const base = newGame({ seed: seedFor(4321) });
const TEAM = 0;
const OPP = 1;

interface Measures {
  wr1RecYds: number;
  teamPassYds: number;
  teamRushYds: number;
  points: number;
  pointsAllowed: number;
  sacksTaken: number;
  sacksMade: number;
  intsThrown: number;
  intsMade: number;
  penalties: number;
  fgPct: number;
  fumblesLost: number;
}

function run(mutate: (st: GameState) => void): Measures {
  const st = JSON.parse(JSON.stringify(base)) as GameState;
  mutate(st);
  for (const t of st.teams) autoSortDepthChart(st, t);

  const m: Measures = {
    wr1RecYds: 0, teamPassYds: 0, teamRushYds: 0, points: 0, pointsAllowed: 0,
    sacksTaken: 0, sacksMade: 0, intsThrown: 0, intsMade: 0, penalties: 0, fgPct: 0,
    fumblesLost: 0,
  };
  let fgm = 0;
  let fga = 0;
  const wr1 = st.teams[TEAM].depthChart.WR[0];

  for (let i = 0; i < N; i++) {
    // A fresh RNG per game, seeded by the game index. Sharing one stream meant
    // the two trials diverged after the first differing outcome, so a 4% swing
    // could be noise rather than signal. Per-game seeding makes the comparison
    // properly paired: game i faces the identical random sequence in both runs.
    // Injuries persist on the state, and this loop never advances a week, so
    // without this the probed player gets hurt around game 20 and every
    // measurement after that is noise. calibrate.ts carries the same fix.
    for (const pl of st.players) { pl.injuryWeeks = 0; pl.injuryDesc = null; }
    const rng = new Rng(31337 + i * 7919);
    const game: Game = {
      id: 1, season: st.season, week: 1, homeId: TEAM, awayId: OPP,
      played: false, homeScore: 0, awayScore: 0, playoffRound: null, boxScore: null,
    };
    const r = simulateGame(st, game, rng);
    m.points += r.homeScore;
    m.pointsAllowed += r.awayScore;
    m.teamPassYds += r.box.home.passYards;
    m.teamRushYds += r.box.home.rushYards;
    m.penalties += r.box.home.penalties;
    m.sacksTaken += r.box.home.sacksAllowed;
    m.sacksMade += r.box.away.sacksAllowed;
    for (const ps of r.box.players) {
      if (ps.playerId === wr1) m.wr1RecYds += ps.recYds;
      if (ps.teamId === TEAM) {
        m.intsThrown += ps.passInt;
        m.fumblesLost += ps.fumblesLost;
        m.intsMade += ps.ints;
        fgm += ps.fgm;
        fga += ps.fga;
      }
    }
  }
  for (const k of Object.keys(m) as (keyof Measures)[]) m[k] /= N;
  m.fgPct = fga > 0 ? (fgm / fga) * 100 : 0;
  return m;
}

/** Set one attribute on the top `count` players at a position on a team. */
function setAttr(pos: Position, k: AttrKey, v: number, teamId: number, count: number) {
  return (st: GameState) => {
    const ps = st.players
      .filter((p) => p.teamId === teamId && p.pos === pos && !p.prospect && !p.retired)
      .sort((a, b) => b.ovr - a.ovr)
      .slice(0, count);
    for (const p of ps as Player[]) p.attrs[k] = v;
  };
}

interface Probe {
  pos: Position;
  attr: AttrKey;
  /** Which side of the ball to mutate. */
  team: "own" | "opp";
  count: number;
  /** The measure this attribute is supposed to move. */
  metric: keyof Measures;
  /** Expected sign of (HIGH - LOW). */
  sign: 1 | -1;
}

const PROBES: Probe[] = [
  // Quarterback
  { pos: "QB", attr: "tha", team: "own", count: 1, metric: "teamPassYds", sign: 1 },
  { pos: "QB", attr: "thp", team: "own", count: 1, metric: "teamPassYds", sign: 1 },
  { pos: "QB", attr: "dec", team: "own", count: 1, metric: "intsThrown", sign: -1 },
  { pos: "QB", attr: "awr", team: "own", count: 1, metric: "sacksTaken", sign: -1 },
  { pos: "QB", attr: "agi", team: "own", count: 1, metric: "sacksTaken", sign: -1 },
  { pos: "OT", attr: "sta", team: "own", count: 2, metric: "sacksTaken", sign: -1 },

  // Receivers
  { pos: "WR", attr: "rte", team: "own", count: 1, metric: "wr1RecYds", sign: 1 },
  { pos: "WR", attr: "cth", team: "own", count: 1, metric: "wr1RecYds", sign: 1 },
  { pos: "WR", attr: "spd", team: "own", count: 1, metric: "wr1RecYds", sign: 1 },
  { pos: "WR", attr: "elu", team: "own", count: 1, metric: "wr1RecYds", sign: 1 },
  { pos: "WR", attr: "jmp", team: "own", count: 1, metric: "wr1RecYds", sign: 1 },

  // Backs
  { pos: "RB", attr: "elu", team: "own", count: 1, metric: "teamRushYds", sign: 1 },
  { pos: "RB", attr: "spd", team: "own", count: 1, metric: "teamRushYds", sign: 1 },
  { pos: "RB", attr: "car", team: "own", count: 3, metric: "fumblesLost", sign: -1 },

  // Line
  { pos: "OT", attr: "pbk", team: "own", count: 2, metric: "sacksTaken", sign: -1 },
  { pos: "OG", attr: "rbk", team: "own", count: 2, metric: "teamRushYds", sign: 1 },
  // Awareness on the line is a unit property (line calls, snap counts), so it
  // has to be probed across the unit rather than on one centre.
  { pos: "OT", attr: "awr", team: "own", count: 2, metric: "penalties", sign: -1 },
  { pos: "OG", attr: "awr", team: "own", count: 2, metric: "penalties", sign: -1 },
  { pos: "OT", attr: "dsc", team: "own", count: 2, metric: "penalties", sign: -1 },

  // Defense — mutate the OPPONENT and watch our offense suffer
  { pos: "CB", attr: "cov", team: "opp", count: 3, metric: "wr1RecYds", sign: -1 },
  { pos: "CB", attr: "spd", team: "opp", count: 3, metric: "teamPassYds", sign: -1 },
  { pos: "S", attr: "cov", team: "opp", count: 2, metric: "teamPassYds", sign: -1 },
  { pos: "S", attr: "awr", team: "opp", count: 2, metric: "teamPassYds", sign: -1 },
  { pos: "EDGE", attr: "prs", team: "opp", count: 3, metric: "points", sign: -1 },
  { pos: "DT", attr: "str", team: "opp", count: 3, metric: "teamRushYds", sign: -1 },
  { pos: "LB", attr: "tkl", team: "opp", count: 3, metric: "teamRushYds", sign: -1 },
  { pos: "LB", attr: "pur", team: "opp", count: 3, metric: "teamRushYds", sign: -1 },
  { pos: "LB", attr: "awr", team: "opp", count: 3, metric: "teamRushYds", sign: -1 },

  // Specialists
  { pos: "K", attr: "kac", team: "own", count: 1, metric: "fgPct", sign: 1 },
  { pos: "K", attr: "kpw", team: "own", count: 1, metric: "points", sign: 1 },
];

console.log(`\n=== Attribute leverage (${N} games per trial, ${LOW} vs ${HIGH}) ===\n`);
console.log(
  `  ${"attribute".padEnd(12)} ${"metric".padEnd(14)} ${"low".padStart(8)} ${"high".padStart(8)} ${"swing".padStart(9)}   verdict`
);

let dead = 0;
let wrongSign = 0;
const results: { probe: Probe; swing: number; lo: number; hi: number }[] = [];

for (const probe of PROBES) {
  const teamId = probe.team === "own" ? TEAM : OPP;
  const lo = run(setAttr(probe.pos, probe.attr, LOW, teamId, probe.count));
  const hi = run(setAttr(probe.pos, probe.attr, HIGH, teamId, probe.count));
  const loV = lo[probe.metric];
  const hiV = hi[probe.metric];
  const swing = hiV - loV;
  results.push({ probe, swing, lo: loV, hi: hiV });

  // Noise floor: repeated runs of the same state are identical (seeded), so any
  // real effect shows up. Treat sub-1% relative movement as no effect.
  const rel = Math.abs(swing) / Math.max(0.5, Math.abs(loV));
  let verdict: string;
  if (rel < 0.01) { verdict = "NO EFFECT"; dead++; }
  else if (Math.sign(swing) !== probe.sign) { verdict = "WRONG SIGN"; wrongSign++; }
  else if (rel < 0.04) verdict = "weak";
  else verdict = "ok";

  console.log(
    `  ${(probe.pos + "." + probe.attr).padEnd(12)} ${probe.metric.padEnd(14)}` +
    ` ${loV.toFixed(1).padStart(8)} ${hiV.toFixed(1).padStart(8)}` +
    ` ${(swing >= 0 ? "+" : "") + swing.toFixed(1)}`.padStart(10) +
    `   ${verdict}`
  );
}

// Any attribute that contributes to a player's OVR must do something.
console.log(`\n=== attributes weighted into OVR but never measurable ===`);
const graded = new Set(PROBES.filter((p) => {
  const r = results.find((x) => x.probe === p)!;
  return Math.abs(r.swing) / Math.max(0.5, Math.abs(r.lo)) >= 0.01;
}).map((p) => `${p.pos}.${p.attr}`));

let unbacked = 0;
for (const pos of Object.keys(POSITION_WEIGHTS) as Position[]) {
  for (const attr of Object.keys(POSITION_WEIGHTS[pos]) as AttrKey[]) {
    const weight = POSITION_WEIGHTS[pos][attr] ?? 0;
    if (weight < 0.08) continue; // only meaningful contributors
    const probed = PROBES.some((p) => p.pos === pos && p.attr === attr);
    if (!probed) continue;
    if (!graded.has(`${pos}.${attr}`)) {
      console.log(`  ${pos}.${attr} is ${(weight * 100).toFixed(0)}% of OVR but has no measurable effect`);
      unbacked++;
    }
  }
}
if (unbacked === 0) console.log("  none — every probed OVR contributor moves its metric");

console.log(
  `\n${dead} probes with no effect, ${wrongSign} with the wrong sign, ${unbacked} unbacked OVR contributors`
);
emitAll({
  "leverage.wrongSign": wrongSign,
  "leverage.noEffect": dead,
  "leverage.unbackedOvr": unbacked,
});
process.exit(dead + wrongSign + unbacked > 0 ? 1 : 0);
