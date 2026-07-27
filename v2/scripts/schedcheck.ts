import { newGame } from "../lib/core/newGame";
import { generateSchedule } from "../lib/core/schedule";
import { Rng } from "../lib/core/rng";

let fails = 0;
for (let trial = 0; trial < 5; trial++) {
  const st = newGame({ seed: 1000 + trial });
  const rng = new Rng(st.rngState);
  let games;
  try { games = generateSchedule(st, rng); }
  catch (e) { console.log("trial", trial, "THREW", (e as Error).message); fails++; continue; }

  const home = new Map<number, number>(), away = new Map<number, number>();
  const weekly = new Map<string, number>();
  for (const t of st.teams) { home.set(t.id,0); away.set(t.id,0); }
  for (const g of games) {
    home.set(g.homeId, home.get(g.homeId)!+1);
    away.set(g.awayId, away.get(g.awayId)!+1);
    for (const id of [g.homeId,g.awayId]) {
      const k = `${g.week}:${id}`;
      weekly.set(k, (weekly.get(k)??0)+1);
    }
  }
  const dupes = [...weekly.values()].filter(v=>v>1).length;
  const totals = st.teams.map(t=>home.get(t.id)!+away.get(t.id)!);
  const homes  = st.teams.map(t=>home.get(t.id)!);
  const badTotal = totals.filter(v=>v!==17).length;
  const badHome  = homes.filter(v=>v<8||v>9).length;
  const byes = st.teams.map(t=>{
    let played=0; for(const g of games) if(g.homeId===t.id||g.awayId===t.id) played++;
    return 18-played;
  });
  const badBye = byes.filter(v=>v!==1).length;
  const ok = dupes===0 && badTotal===0 && badHome===0 && badBye===0;
  if(!ok) fails++;
  console.log(`trial ${trial}: games=${games.length} dupWeek=${dupes} bad17=${badTotal} badHome=${badHome} badBye=${badBye} homeRange=${Math.min(...homes)}-${Math.max(...homes)} ${ok?"OK":"*** FAIL ***"}`);
}
console.log(fails===0 ? "ALL SCHEDULE CHECKS PASSED" : `${fails} FAILURES`);
