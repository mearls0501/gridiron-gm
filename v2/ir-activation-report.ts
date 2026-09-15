/**
 * IR headcount / activation report — Wave 3.9 Packet 6. READ-ONLY on the engine.
 *
 * Not gate-registered. Does not edit baselines.json, scripts/, or lib/.
 * Counts designations and activations by diffing the IR set after every
 * `advance()` — do not scan `state.log` (trimLog is a measurement trap).
 *
 *   npx tsx ir-activation-report.ts [seasons] [seed]
 *
 * Cloud VM: 2 seasons is enough to prove the path. Mac Studio: 12 seasons
 * on seed 12345, then a 5-seed panel if the lead wants a lock-grade number.
 */
import { newGame } from "./lib/core/newGame";
import { advance } from "./lib/core/season/engine";
import { advanceOffseason, isOffseason } from "./lib/core/offseason";
import { capHit } from "./lib/core/select";
import { GameState, IR_RETURN_DESIGNATIONS, Player, salaryCap } from "./lib/core/types";

const SEASONS = Number(process.argv[2] ?? 2);
const SEED = Number(process.argv[3] ?? 12345);

const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const pct = (n: number, d: number) => (d > 0 ? (100 * n) / d : 0);

function emit(name: string, value: number): void {
  const v = Number.isFinite(value) ? (Number.isInteger(value) ? String(value) : value.toFixed(2)) : "NaN";
  console.log(`##M ${name} ${v}`);
}

function irPlayers(st: GameState, teamId?: number): Player[] {
  return st.players.filter((p) => {
    if (p.status !== "ir" || p.retired || p.prospect || p.teamId === null) return false;
    if (teamId !== undefined && p.teamId !== teamId) return false;
    return true;
  });
}

function irKey(st: GameState): Map<number, { teamId: number; status: Player["status"] }> {
  const m = new Map<number, { teamId: number; status: Player["status"] }>();
  for (const p of st.players) {
    if (p.retired || p.prospect || p.teamId === null) continue;
    m.set(p.id, { teamId: p.teamId, status: p.status });
  }
  return m;
}

interface SeasonRow {
  season: number;
  designations: number;
  activations: number;
  otherExits: number;
  cpuDesignations: number;
  cpuActivations: number;
  userDesignations: number;
  sameSeasonReturns: number;
  leftoverActivations: number;
  weekHeadcountCpu: number[];
  recapHeadcountCpu: number;
  recapHeadcountLeague: number;
  recapReturnsUsedCpu: number[];
  clubsAtReturnCap: number;
  irCapPct: number;
  recapIrHitMean: number;
  recapIrOvrMean: number;
  recapStillInjured: number;
  recapHealthyOnIr: number;
  maxClubWeekHeadcount: number;
}

function run(seasons: number, seed: number): SeasonRow[] {
  const st = newGame({ seed });
  const USER = st.userTeamId;
  const rows: SeasonRow[] = [];
  let prev = irKey(st);
  let designatedThisSeason = new Set<number>();
  let leftoverAtOpen = new Set<number>();
  let row: SeasonRow | null = null;
  let lastClosed: SeasonRow | null = null;
  let weekSamples: number[] = [];

  const openSeason = (season: number): SeasonRow => {
    designatedThisSeason = new Set();
    leftoverAtOpen = new Set(irPlayers(st).map((p) => p.id));
    weekSamples = [];
    row = {
      season,
      designations: 0,
      activations: 0,
      otherExits: 0,
      cpuDesignations: 0,
      cpuActivations: 0,
      userDesignations: 0,
      sameSeasonReturns: 0,
      leftoverActivations: 0,
      weekHeadcountCpu: weekSamples,
      recapHeadcountCpu: 0,
      recapHeadcountLeague: 0,
      recapReturnsUsedCpu: [],
      clubsAtReturnCap: 0,
      irCapPct: 0,
      recapIrHitMean: 0,
      recapIrOvrMean: 0,
      recapStillInjured: 0,
      recapHealthyOnIr: 0,
      maxClubWeekHeadcount: 0,
    };
    return row;
  };

  const noteStep = () => {
    const target = row ?? lastClosed;
    if (!target) return;
    const now = irKey(st);
    const prevIr = [...prev.entries()].filter(([, v]) => v.status === "ir");
    const nowIrIds = new Set(
      [...now.entries()].filter(([, v]) => v.status === "ir").map(([id]) => id)
    );
    for (const [id, was] of prevIr) {
      const cur = now.get(id);
      if (cur?.status === "ir") continue;
      // Missing status is active (Player.status?: "ir" | "ps"). After the IR
      // continue, status is "ps" | undefined — compare only against "ps".
      const activated = cur !== undefined && cur.status !== "ps" && cur.teamId === was.teamId;
      if (activated) {
        target.activations++;
        if (was.teamId !== USER) target.cpuActivations++;
        if (designatedThisSeason.has(id)) target.sameSeasonReturns++;
        else if (leftoverAtOpen.has(id)) target.leftoverActivations++;
      } else {
        target.otherExits++;
      }
    }
    for (const [id, cur] of now) {
      if (cur.status !== "ir") continue;
      const was = prev.get(id);
      if (was?.status === "ir") continue;
      if (!row) continue;
      row.designations++;
      designatedThisSeason.add(id);
      if (cur.teamId === USER) row.userDesignations++;
      else row.cpuDesignations++;
    }
    prev = now;
    if (row && (st.phase === "regular" || st.phase === "playoffs")) {
      let cpuN = 0;
      let cpuClubs = 0;
      for (const t of st.teams) {
        if (t.id === USER) continue;
        const n = irPlayers(st, t.id).length;
        cpuN += n;
        cpuClubs++;
        if (n > row.maxClubWeekHeadcount) row.maxClubWeekHeadcount = n;
      }
      weekSamples.push(cpuClubs > 0 ? cpuN / cpuClubs : 0);
    }
  };

  const closeRecap = () => {
    if (!row) return;
    const cpu = st.teams.filter((t) => t.id !== USER);
    const recapCpu = cpu.map((t) => irPlayers(st, t.id));
    row.recapHeadcountCpu = mean(recapCpu.map((xs) => xs.length));
    row.recapHeadcountLeague = irPlayers(st).length;
    row.recapReturnsUsedCpu = cpu.map((t) => t.irReturnsUsed ?? 0);
    row.clubsAtReturnCap = row.recapReturnsUsedCpu.filter((n) => n >= IR_RETURN_DESIGNATIONS).length;
    const cap = salaryCap(st.season, st.season - st.history.length);
    const ir = irPlayers(st);
    const hits = ir.map((p) => capHit(p.contract));
    row.irCapPct = st.teams.length > 0 ? (hits.reduce((n, x) => n + x, 0) / (st.teams.length * cap)) * 100 : 0;
    row.recapIrHitMean = mean(hits);
    row.recapIrOvrMean = mean(ir.map((p) => p.ovr));
    row.recapStillInjured = ir.filter((p) => p.injuryWeeks > 0).length;
    row.recapHealthyOnIr = ir.filter((p) => p.injuryWeeks <= 0).length;
    rows.push(row);
    lastClosed = row;
    row = null;
  };

  row = openSeason(st.season);
  for (let s = 0; s < seasons; s++) {
    let g = 0;
    while (st.phase !== "offseason-recap" && g++ < 50) {
      if (!row || row.season !== st.season) row = openSeason(st.season);
      advance(st);
      noteStep();
    }
    if (st.phase === "offseason-recap") closeRecap();
    let o = 0;
    while (isOffseason(st.phase) && o++ < 12) {
      advanceOffseason(st);
      noteStep();
    }
    if (!row) row = openSeason(st.season);
  }
  return rows;
}

const rows = run(SEASONS, SEED);
const cpuClubs = 31;

console.log(`IR activation report  seasons=${SEASONS}  seed=${SEED}  base=read-only`);
console.log("");
console.log("season  desig  act  same%  leftoverAct  otherX  cpuDes/club  recapHd  weekHd  retUsed  @cap8  irCap%  irOVR");
for (const r of rows) {
  const samePct = pct(r.sameSeasonReturns, r.cpuDesignations + r.userDesignations);
  console.log(
    [
      String(r.season).padStart(6),
      String(r.designations).padStart(6),
      String(r.activations).padStart(4),
      samePct.toFixed(0).padStart(5) + "%",
      String(r.leftoverActivations).padStart(12),
      String(r.otherExits).padStart(7),
      (r.cpuDesignations / cpuClubs).toFixed(2).padStart(12),
      r.recapHeadcountCpu.toFixed(2).padStart(8),
      mean(r.weekHeadcountCpu).toFixed(2).padStart(7),
      mean(r.recapReturnsUsedCpu).toFixed(2).padStart(8),
      String(r.clubsAtReturnCap).padStart(6),
      r.irCapPct.toFixed(2).padStart(7),
      r.recapIrOvrMean.toFixed(1).padStart(6),
    ].join(" ")
  );
}

const designations = rows.map((r) => r.designations);
const activations = rows.map((r) => r.activations);
const same = rows.map((r) => pct(r.sameSeasonReturns, r.designations));
const cpuDes = rows.map((r) => r.cpuDesignations / cpuClubs);
const weekHd = rows.map((r) => mean(r.weekHeadcountCpu));
const recapHd = rows.map((r) => r.recapHeadcountCpu);
const retUsed = rows.map((r) => mean(r.recapReturnsUsedCpu));
const atCap = rows.map((r) => r.clubsAtReturnCap);
const irCap = rows.map((r) => r.irCapPct);
const leftover = rows.map((r) => r.leftoverActivations);
const otherX = rows.map((r) => r.otherExits);
const userDes = rows.map((r) => r.userDesignations);
const stillHurt = rows.map((r) => r.recapStillInjured);
const healthyParked = rows.map((r) => r.recapHealthyOnIr);
const maxClub = rows.map((r) => r.maxClubWeekHeadcount);
const irOvr = rows.map((r) => r.recapIrOvrMean);
const irHit = rows.map((r) => r.recapIrHitMean);

console.log("");
console.log("means");
console.log(`  designations / season (league)     ${mean(designations).toFixed(1)}`);
console.log(`  activations / season (league)      ${mean(activations).toFixed(1)}`);
console.log(`  same-season return %               ${mean(same).toFixed(1)}`);
console.log(`  leftover (prior-year) activations  ${mean(leftover).toFixed(1)}`);
console.log(`  other IR exits (cut/expire/retire) ${mean(otherX).toFixed(1)}`);
console.log(`  CPU designations / club            ${mean(cpuDes).toFixed(2)}`);
console.log(`  CPU weekly IR headcount / club     ${mean(weekHd).toFixed(2)}`);
console.log(`  CPU recap IR headcount / club      ${mean(recapHd).toFixed(2)}`);
console.log(`  CPU return designations used       ${mean(retUsed).toFixed(2)} / ${IR_RETURN_DESIGNATIONS}`);
console.log(`  CPU clubs at 8-return cap          ${mean(atCap).toFixed(2)}`);
console.log(`  user-club designations (headless)  ${mean(userDes).toFixed(2)}`);
console.log(`  recap still-injured IR (league)    ${mean(stillHurt).toFixed(1)}`);
console.log(`  recap healthy-on-IR (league)       ${mean(healthyParked).toFixed(1)}`);
console.log(`  max CPU club IR headcount (week)   ${Math.max(...maxClub)}`);
console.log(`  recap IR OVR                       ${mean(irOvr).toFixed(1)}`);
console.log(`  recap IR cap hit $                 ${mean(irHit).toFixed(0)}`);
console.log(`  drift.irCapPctMean (same formula)  ${mean(irCap).toFixed(2)}`);

console.log("");
emit("ir.designationsPerSeason", mean(designations));
emit("ir.activationsPerSeason", mean(activations));
emit("ir.sameSeasonReturnPct", mean(same));
emit("ir.cpuDesignationsPerClub", mean(cpuDes));
emit("ir.cpuWeekHeadcountMean", mean(weekHd));
emit("ir.cpuRecapHeadcountMean", mean(recapHd));
emit("ir.cpuReturnsUsedMean", mean(retUsed));
emit("ir.cpuClubsAtReturnCap", mean(atCap));
emit("ir.userDesignationsPerSeason", mean(userDes));
emit("ir.recapHealthyOnIr", mean(healthyParked));
emit("ir.maxClubWeekHeadcount", Math.max(...maxClub));
emit("ir.irCapPctMean", mean(irCap));
