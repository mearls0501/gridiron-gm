import { newGame } from "../lib/core/newGame";
import { advance } from "../lib/core/season/engine";
import { teamSeasonStats } from "../lib/core/season/records";
import { simulateGame } from "../lib/core/sim/game";
import { Rng } from "../lib/core/rng";
import { Game } from "../lib/core/types";
import { emitAll } from "./metrics";

const state = newGame({ seed: 12345 });
const rng = new Rng(999);

let n = 0;
const acc = { pts:0, plays:0, pass:0, rush:0, patt:0, pcmp:0, pyds:0, ptd:0, pint:0,
  ratt:0, ryds:0, rtd:0, sacks:0, fgm:0, fga:0, punts:0, third:0, thirdC:0, to:0 };
let mismatches = 0;
let ties = 0;
const ext = { fd:0,pfd:0,rfd:0,penfd:0,pen:0,penYds:0,top:0,rzAtt:0,rzTd:0,fdAtt:0,fdConv:0,
  sackAll:0,fum:0,fumLost:0,qbRush:0,qbCar:0,kr:0,krYds:0,pr:0,prYds:0,defTd:0,retTd:0,saf:0,
  twoAtt:0,twoMade:0,in20:0 };

for (let i = 0; i < Number(process.argv[2] ?? 300); i++) {
  const g: Game = { id:i, season:2026, week:1, homeId:i%32, awayId:(i*7+3)%32,
    played:false, homeScore:0, awayScore:0, playoffRound:null, boxScore:null };
  if (g.homeId === g.awayId) continue;
  // This harness re-simulates one game object over and over without ever
  // advancing a week, so nothing heals on its own. Without this the rosters
  // progressively gut themselves — 36 of 53 players injured by n=1500 — and
  // every rate drifts. Not a game rule; a property of the loop.
  for (const p of state.players) { p.injuryWeeks = 0; p.injuryDesc = null; }
  const r = simulateGame(state, g, rng);
  n += 2;
  if (r.homeScore === r.awayScore) ties++;

  for (const side of [r.box.home, r.box.away]) {
    ext.fd += side.firstDowns; ext.pfd += side.passFirstDowns; ext.rfd += side.rushFirstDowns;
    ext.penfd += side.penaltyFirstDowns; ext.pen += side.penalties; ext.penYds += side.penaltyYards;
    ext.top += side.timeOfPossession; ext.rzAtt += side.redZoneAtt; ext.rzTd += side.redZoneTd;
    ext.fdAtt += side.fourthDownAtt; ext.fdConv += side.fourthDownConv; ext.sackAll += side.sacksAllowed;
    acc.pts += side.points; acc.plays += side.plays;
    acc.pass += side.passYards; acc.rush += side.rushYards;
    acc.third += side.thirdDownAtt; acc.thirdC += side.thirdDownConv;
    acc.to += side.turnovers;
  }
  for (const p of r.box.players) {
    ext.fum+=p.fumbles; ext.fumLost+=p.fumblesLost;
    ext.kr+=p.kr; ext.krYds+=p.krYds; ext.pr+=p.pr; ext.prYds+=p.prYds;
    ext.defTd+=p.defTd; ext.retTd+=p.krTd+p.prTd; ext.saf+=p.safeties;
    ext.twoAtt+=p.twoPtAtt; ext.twoMade+=p.twoPtMade; ext.in20+=p.puntsInside20;
    if (p.passAtt > 0) { ext.qbRush+=p.rushYds; ext.qbCar+=p.rushAtt; }
    acc.patt+=p.passAtt; acc.pcmp+=p.passCmp; acc.pyds+=p.passYds; acc.ptd+=p.passTd; acc.pint+=p.passInt;
    acc.ratt+=p.rushAtt; acc.ryds+=p.rushYds; acc.rtd+=p.rushTd; acc.sacks+=p.sacks;
    acc.fgm+=p.fgm; acc.fga+=p.fga; acc.punts+=p.punts;
  }
  // score reconciliation
  for (const [tid, score] of [[g.homeId,r.homeScore],[g.awayId,r.awayScore]] as [number,number][]) {
      let derived = 0;
      for (const p of r.box.players) {
        if (p.teamId !== tid) continue;
        // Every way a team can score, counted exactly once. recTd is deliberately
        // excluded: it is the same touchdown as the passer's passTd.
        derived += (p.passTd + p.rushTd + p.defTd + p.krTd + p.prTd) * 6;
        derived += p.xpm + p.twoPtMade * 2 + p.fgm * 3 + p.safeties * 2;
      }
      if (derived !== score) mismatches++;
  }
}

const per = (v:number)=> (v/n).toFixed(2);
console.log("games:", n/2, "team-games:", n);
console.log("PTS/g       ", per(acc.pts),   " NFL ~22.5");
console.log("Plays/g     ", per(acc.plays), " NFL ~63");
console.log("PassYds/g   ", per(acc.pass),  " NFL ~230");
console.log("RushYds/g   ", per(acc.rush),  " NFL ~115");
console.log("PassAtt/g   ", per(acc.patt),  " NFL ~34");
console.log("Cmp%        ", (acc.pcmp/acc.patt*100).toFixed(1), " NFL ~65");
console.log("PassTD/g    ", per(acc.ptd),   " NFL ~1.5");
console.log("INT/g       ", per(acc.pint),  " NFL ~0.8");
console.log("RushAtt/g   ", per(acc.ratt),  " NFL ~26");
console.log("YPC         ", (acc.ryds/acc.ratt).toFixed(2), " NFL ~4.3");
console.log("RushTD/g    ", per(acc.rtd),   " NFL ~0.9");
console.log("Sacks/g     ", per(acc.sacks), " NFL ~2.4");
console.log("FG%         ", acc.fga? (acc.fgm/acc.fga*100).toFixed(1):"-", " NFL ~85  (att/g", per(acc.fga),")");
console.log("Punts/g     ", per(acc.punts), " NFL ~4.2");
console.log("3rd down%   ", acc.third? (acc.thirdC/acc.third*100).toFixed(1):"-", " NFL ~39");
console.log("TO/g        ", per(acc.to),    " NFL ~1.3");
console.log("Tie rate    ", (ties/(n/2)*100).toFixed(1)+"%", " NFL ~0.6%");
console.log("SCORE MISMATCHES:", mismatches, mismatches===0?"OK":"*** BUG ***");

console.log("\n--- extended stats (per team-game) ---");
console.log("First downs  ", per(ext.fd),      " NFL ~20.5   (pass", per(ext.pfd), "rush", per(ext.rfd), "pen", per(ext.penfd) + ")");
console.log("Penalties    ", per(ext.pen),     " NFL ~6.2    (" + per(ext.penYds), "yards)");
console.log("Time of poss ", (ext.top/n/60).toFixed(1)+" min", " NFL 30.0");
console.log("Red zone TD% ", ext.rzAtt? (ext.rzTd/ext.rzAtt*100).toFixed(1):"-", " NFL ~55    (" + per(ext.rzAtt), "trips)");
console.log("4th down     ", per(ext.fdAtt), "att,", ext.fdAtt? (ext.fdConv/ext.fdAtt*100).toFixed(0):"-", "% NFL ~1.9 att, ~50%");
console.log("Sacks allowed", per(ext.sackAll), " NFL ~2.4");
console.log("Fumbles      ", per(ext.fum), "(" + per(ext.fumLost), "lost)  NFL ~1.3 / ~0.6");
console.log("QB rush yds  ", per(ext.qbRush),  " NFL ~13     (" + per(ext.qbCar), "carries)");
console.log("Kick returns ", per(ext.kr), "for", ext.kr? (ext.krYds/ext.kr).toFixed(1):"-", "avg  NFL ~1.5 / 23.0");
console.log("Punt returns ", per(ext.pr), "for", ext.pr? (ext.prYds/ext.pr).toFixed(1):"-", "avg  NFL ~1.4 / 9.0");
console.log("Defensive TD ", per(ext.defTd),   " NFL ~0.17");
console.log("Return TD    ", per(ext.retTd),   " NFL ~0.04");
console.log("Safeties     ", per(ext.saf),     " NFL ~0.03");
console.log("2-pt         ", per(ext.twoAtt), "att,", ext.twoAtt? (ext.twoMade/ext.twoAtt*100).toFixed(0):"-", "% NFL ~0.2 att, ~48%");
console.log("Punts in 20  ", per(ext.in20),    " NFL ~1.5");


// ---------------------------------------------------------------------------
// Season-level check.
//
// The synthetic matchups above pair arbitrary teams and can hide effects that
// only show up over a real 272-game slate — league parity in particular. This
// plays actual seasons and reports the spread.
// ---------------------------------------------------------------------------

console.log("\n--- full seasons (league-wide) ---");
const seasonPfg: number[] = [];
const seasonYds: number[] = [];
const seasonSpread: number[] = [];
for (const seed of [11, 22, 33]) {
  const season = newGame({ seed });
  advance(season);
  let w = 0;
  while (season.phase === "regular" && w++ < 40) advance(season);
  const agg = [...teamSeasonStats(season, season.season).values()].filter((a) => a.games > 0);
  const avg = (f: (a: (typeof agg)[0]) => number) =>
    agg.reduce((sum, a) => sum + f(a), 0) / agg.length;
  const pfs = agg.map((a) => a.pointsFor / a.games).sort((x, y) => x - y);
  seasonPfg.push(avg((a) => a.pointsFor / a.games));
  seasonYds.push(avg((a) => a.totalYards / a.games));
  seasonSpread.push(pfs[pfs.length - 1] - pfs[0]);
  console.log(
    `  seed ${seed}: PF/G ${avg((a) => a.pointsFor / a.games).toFixed(1)}` +
    ` (spread ${pfs[0].toFixed(1)}-${pfs[pfs.length - 1].toFixed(1)})` +
    ` | Yds/G ${avg((a) => a.totalYards / a.games).toFixed(0)}` +
    ` | 3rd ${(avg((a) => a.thirdDownConv) / avg((a) => a.thirdDownAtt) * 100).toFixed(1)}%` +
    ` | RZ ${(avg((a) => a.redZoneTd) / avg((a) => a.redZoneAtt) * 100).toFixed(1)}%`
  );
}
console.log("  NFL:      PF/G 22.5 (spread ~15-30)      | Yds/G 340 | 3rd 39.0% | RZ 55.0%");

// --- machine-readable summary (see scripts/metrics.ts) -----------------------
const gateMean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
emitAll({
  "calibrate.scoreMismatches": mismatches,
  "calibrate.pts": acc.pts / n, "calibrate.plays": acc.plays / n,
  "calibrate.passYds": acc.pass / n, "calibrate.rushYds": acc.rush / n,
  "calibrate.passAtt": acc.patt / n, "calibrate.cmpPct": (acc.pcmp / acc.patt) * 100,
  "calibrate.passTd": acc.ptd / n, "calibrate.int": acc.pint / n,
  "calibrate.rushAtt": acc.ratt / n, "calibrate.ypc": acc.ryds / acc.ratt,
  "calibrate.rushTd": acc.rtd / n, "calibrate.sacks": acc.sacks / n,
  "calibrate.fgPct": acc.fga ? (acc.fgm / acc.fga) * 100 : 0,
  "calibrate.punts": acc.punts / n,
  "calibrate.thirdDownPct": acc.third ? (acc.thirdC / acc.third) * 100 : 0,
  "calibrate.turnovers": acc.to / n, "calibrate.tieRatePct": (ties / (n / 2)) * 100,
  "calibrate.firstDowns": ext.fd / n, "calibrate.penalties": ext.pen / n,
  "calibrate.topMinutes": ext.top / n / 60,
  "calibrate.redZoneTdPct": ext.rzAtt ? (ext.rzTd / ext.rzAtt) * 100 : 0,
  "calibrate.fourthDownAtt": ext.fdAtt / n, "calibrate.fumbles": ext.fum / n,
  "calibrate.qbRushYds": ext.qbRush / n,
  "calibrate.seasonPfg": gateMean(seasonPfg),
  "calibrate.seasonYdsPerGame": gateMean(seasonYds),
  "calibrate.seasonPfgSpread": gateMean(seasonSpread),
});
