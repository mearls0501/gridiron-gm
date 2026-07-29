/**
 * Stat integrity + realism.
 *   1. Do season lines equal the sum of that player's box scores? (persistence)
 *   2. Are season leaders and per-game lines in NFL territory? (realism)
 */
import { newGame } from "../lib/core/newGame";
import { advance } from "../lib/core/season/engine";
import { passerRating, cmpPct } from "../lib/core/season/stats";
import { Player } from "../lib/core/types";
import { emitAll, seedFor } from "./metrics";

const st = newGame({ seed: seedFor(8675309) });
advance(st);
let g = 0; while (st.phase === "regular" && g++ < 40) advance(st);

// ---- 1. Persistence: season line must equal the sum of the box scores -------
const KEYS = ["passAtt","passCmp","passYds","passTd","passInt","rushAtt","rushYds","rushTd",
  "targets","rec","recYds","recTd","tackles","sacks","ints","fgm","fga","xpm","xpa","punts"] as const;

const summed = new Map<number, Record<string, number>>();
const gamesPlayed = new Map<number, number>();
for (const gm of st.games) {
  if (!gm.played || !gm.boxScore) continue;
  for (const ps of gm.boxScore.players) {
    let acc = summed.get(ps.playerId);
    if (!acc) { acc = {}; for (const k of KEYS) acc[k] = 0; summed.set(ps.playerId, acc); }
    for (const k of KEYS) acc[k] += (ps as unknown as Record<string, number>)[k] ?? 0;
    gamesPlayed.set(ps.playerId, (gamesPlayed.get(ps.playerId) ?? 0) + 1);
  }
}

let drift = 0, gameDrift = 0, checked = 0;
for (const p of st.players) {
  const line = p.stats.find(s => s.season === st.season);
  const acc = summed.get(p.id);
  if (!acc) continue;
  if (!line) { drift++; continue; }
  checked++;
  for (const k of KEYS) {
    if ((line as unknown as Record<string, number>)[k] !== acc[k]) drift++;
  }
  if (line.games !== gamesPlayed.get(p.id)) gameDrift++;
}
console.log(`[persistence] ${checked} players with stats`);
console.log(`  season line vs summed box scores : ${drift === 0 ? "EXACT MATCH" : drift + " MISMATCHED FIELDS"}`);
console.log(`  games played counter             : ${gameDrift === 0 ? "exact" : gameDrift + " wrong"}`);

// ---- 2. Realism: season leaders ---------------------------------------------
const line = (p: Player) => p.stats.find(s => s.season === st.season)!;
const withStats = st.players.filter(p => p.stats.some(s => s.season === st.season));
const top = (k: string, n = 3) => withStats
  .filter(p => (line(p) as unknown as Record<string, number>)[k] > 0)
  .sort((a, b) => (line(b) as unknown as Record<string, number>)[k] - (line(a) as unknown as Record<string, number>)[k])
  .slice(0, n);

console.log(`\n[season leaders]  (real NFL leader in brackets)`);
const fmt = (p: Player, v: string) => `    ${p.firstName} ${p.lastName} (${p.pos}) ${v}`;
console.log(`  Passing yards  [~4,800]`);
for (const p of top("passYds")) console.log(fmt(p, `${line(p).passYds} yds, ${line(p).passTd} TD, ${line(p).passInt} INT, ${cmpPct(line(p))}%, ${passerRating(line(p))} rtg`));
console.log(`  Rushing yards  [~1,800]`);
for (const p of top("rushYds")) console.log(fmt(p, `${line(p).rushYds} yds on ${line(p).rushAtt} car, ${line(p).rushTd} TD`));
console.log(`  Receiving yards [~1,750]`);
for (const p of top("recYds")) console.log(fmt(p, `${line(p).rec} rec, ${line(p).recYds} yds, ${line(p).recTd} TD`));
console.log(`  Sacks  [~20]`);
for (const p of top("sacks")) console.log(fmt(p, `${line(p).sacks} sacks, ${line(p).tackles} tkl`));
console.log(`  Tackles  [~180]`);
for (const p of top("tackles")) console.log(fmt(p, `${line(p).tackles} tkl, ${line(p).ints} INT`));

// ---- 3. Realism: single-game extremes ---------------------------------------
let maxPass = 0, maxRush = 0, maxRec = 0, maxSack = 0, absurd = 0;
for (const gm of st.games) {
  if (!gm.boxScore) continue;
  for (const ps of gm.boxScore.players) {
    maxPass = Math.max(maxPass, ps.passYds);
    maxRush = Math.max(maxRush, ps.rushYds);
    maxRec  = Math.max(maxRec, ps.recYds);
    maxSack = Math.max(maxSack, ps.sacks);
    if (ps.passYds > 600 || ps.rushYds > 350 || ps.recYds > 350 || ps.sacks > 7) absurd++;
  }
}
console.log(`\n[single-game highs]  (NFL records in brackets)`);
console.log(`  passing  ${maxPass} yds   [554]`);
console.log(`  rushing  ${maxRush} yds   [296]`);
console.log(`  receiving ${maxRec} yds   [336]`);
console.log(`  sacks    ${maxSack}        [7]`);
console.log(`  implausible lines: ${absurd}`);

// ---- 4. Team scoring spread --------------------------------------------------
const scores: number[] = [];
for (const gm of st.games) if (gm.played) { scores.push(gm.homeScore, gm.awayScore); }
scores.sort((a, b) => a - b);
const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
console.log(`\n[team scores] n=${scores.length} mean ${mean.toFixed(1)} [NFL ~22.5]`);
console.log(`  min ${scores[0]} | p25 ${scores[Math.floor(scores.length*0.25)]} | median ${scores[Math.floor(scores.length*0.5)]} | p75 ${scores[Math.floor(scores.length*0.75)]} | max ${scores[scores.length-1]}`);
console.log(`  shutouts: ${scores.filter(s => s === 0).length} | 40+ point games: ${scores.filter(s => s >= 40).length}`);

// --- machine-readable summary (see scripts/metrics.ts) -----------------------
const gateLead = (k: string) => {
  const t = top(k, 1)[0];
  return t ? ((line(t) as unknown as Record<string, number>)[k] ?? 0) : 0;
};
emitAll({
  "statcheck.fieldMismatches": drift, "statcheck.gameCounterDrift": gameDrift,
  "statcheck.implausibleLines": absurd, "statcheck.playersWithStats": checked,
  "statcheck.maxGamePassYds": maxPass, "statcheck.maxGameRushYds": maxRush,
  "statcheck.maxGameRecYds": maxRec, "statcheck.maxGameSacks": maxSack,
  "statcheck.leadPassYds": gateLead("passYds"), "statcheck.leadRushYds": gateLead("rushYds"),
  "statcheck.leadRecYds": gateLead("recYds"), "statcheck.leadSacks": gateLead("sacks"),
  "statcheck.leadTackles": gateLead("tackles"), "statcheck.meanTeamScore": mean,
  "statcheck.shutouts": scores.filter((s) => s === 0).length,
  "statcheck.fortyPlusGames": scores.filter((s) => s >= 40).length,
});
