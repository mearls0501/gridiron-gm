/**
 * Long-horizon drift harness.
 *
 * `verify.ts` asserts that a franchise stays LEGAL. This one asserts that it
 * stays COHERENT over a career-length run — the class of failure that only
 * becomes visible around season 8-10 and that a 2-season sweep cannot see.
 *
 *   npx tsx scripts/drift.ts [seasons] [seeds...]
 *
 * Guards printed as `P1` are known-failing and are here as a target, not a
 * regression: they describe the franchise we want, not the one we have. Guards
 * printed as `ok` are live — they were failing, they were fixed, and they fail
 * the build if they ever come back.
 */
import { newGame } from "../lib/core/newGame";
import { advance } from "../lib/core/season/engine";
import { advanceOffseason, isOffseason } from "../lib/core/offseason";
import { leagueStandings } from "../lib/core/season/standings";
import { capHit } from "../lib/core/select";
import { GameState, Player, Position, salaryCap } from "../lib/core/types";
import { encodeSave } from "../lib/store/codec";
import { emitAll } from "./metrics";

const SEASONS = Number(process.argv[2] ?? 20);
const SEEDS = process.argv.slice(3).map(Number);
const seeds = SEEDS.length ? SEEDS : [12345];

let failures = 0;
function guard(ok: boolean, label: string, detail: string, p1 = false): void {
  if (ok) { console.log(`  ok    ${label} — ${detail}`); return; }
  if (p1) { console.log(`  P1    ${label} — ${detail}`); return; }
  failures++;
  console.log(`  FAIL  ${label} — ${detail}`);
}

const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const median = (a: number[]) => {
  if (!a.length) return 0;
  const b = [...a].sort((x, y) => x - y);
  return b[Math.floor(b.length / 2)];
};
const active = (s: GameState) =>
  s.players.filter((p) => !p.retired && !p.prospect && p.teamId !== null);

interface Snapshot {
  season: number; ovrMean: number; n85: number; n90: number;
  ageMean: number; ovrAt27: number; ovrAt34: number; fade: number[];
  passLead: number; rushLead: number; recLead: number;
  players: number; saveMB: number; playerWeeksLost: number;
  topCapPct: number; minPayrollPct: number; medPayrollPct: number; pick1FromBottom6: boolean;
  trades: number;
}

function runOne(seed: number): Snapshot[] {
  const st = newGame({ seed });
  const out: Snapshot[] = [];
  // Career-peak OVR per player, so decline can be measured against the player
  // himself. Comparing the average 34-year-old to the average 27-year-old is
  // confounded by survivorship — the bad 34-year-olds have already retired.
  const peak = new Map<number, number>();

  for (let s = 0; s < SEASONS; s++) {
    const season = st.season;
    let g = 0;
    while (st.phase !== "offseason-recap" && g++ < 40) advance(st);

    const A = active(st);
    const ovrs = A.map((p) => p.ovr);
    for (const p of A) peak.set(p.id, Math.max(peak.get(p.id) ?? 0, p.ovr));
    const fade = A.filter((p) => p.age >= 33 && peak.has(p.id)).map((p) => p.ovr - peak.get(p.id)!);
    const line = (p: Player) => p.stats.find((x) => x.season === season);
    const lead = (k: string) =>
      Math.max(0, ...st.players.map((p) => {
        const l = line(p) as unknown as Record<string, number> | undefined;
        return l?.[k] ?? 0;
      }));
    const ovrAtAge = (a: number) => mean(A.filter((p) => p.age === a).map((p) => p.ovr));

    // Games a rostered player was unavailable for: 17 minus what he played,
    // counted only for players good enough to have been in the rotation.
    const rotation = A.filter((p) => (line(p)?.snaps ?? 0) > 100);
    const playerWeeksLost = rotation.reduce((n, p) => n + Math.max(0, 17 - (line(p)?.games ?? 0)), 0);

    const cap = salaryCap(season, season - st.history.length);
    // The user's club is excluded for the same reason checkParity excludes it:
    // headlessly nobody works that roster, and nothing forces a human to spend.
    const payrolls = st.teams
      .filter((t) => t.id !== st.userTeamId)
      .map((t) => {
        let sum = 0;
        for (const p of A) if (p.teamId === t.id) sum += capHit(p.contract);
        return sum + (t.deadCap ?? 0);
      });
    const topCap = Math.max(...A.map((p) => capHit(p.contract)));

    const table = leagueStandings(st, season);
    const bottom6 = new Set(table.slice(-6).map((r) => r.teamId));
    let pick1Ok = false;
    let o = 0;
    while (isOffseason(st.phase) && o++ < 12) {
      const before = st.phase;
      advanceOffseason(st);
      if (before === "offseason-fa" && st.draft) pick1Ok = bottom6.has(st.draft.picks[0].teamId);
    }

    out.push({
      season, ovrMean: mean(ovrs),
      n85: ovrs.filter((v) => v >= 85).length,
      n90: ovrs.filter((v) => v >= 90).length,
      ageMean: mean(A.map((p) => p.age)),
      ovrAt27: ovrAtAge(27), ovrAt34: ovrAtAge(34), fade,
      passLead: lead("passYds"), rushLead: lead("rushYds"), recLead: lead("recYds"),
      players: st.players.length,
      // What actually lands in IndexedDB, not the in-memory object: the save
      // codec drops the zero fields out of stat rows on the way to disk, and
      // the number that matters to a player's browser quota is the encoded one.
      saveMB: JSON.stringify(encodeSave(st)).length / 1048576,
      playerWeeksLost,
      topCapPct: (topCap / cap) * 100,
      minPayrollPct: (Math.min(...payrolls) / cap) * 100,
      medPayrollPct: (median(payrolls) / cap) * 100,
      pick1FromBottom6: pick1Ok,
      // Counted by the season stamped on the entry, not as a delta on a running
      // total: the log is trimmed at each rollover, so a cumulative counter is
      // no longer monotonic. This also reads correctly — a league-year's trades
      // are the in-season ones plus the offseason that follows, and both carry
      // that season on the entry.
      trades: st.log.filter((l) => l.season === season && l.text.startsWith("Trade:")).length,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------

const all: Snapshot[][] = [];
for (const seed of seeds) {
  console.log(`\n=== seed ${seed}, ${SEASONS} seasons ===`);
  const snaps = runOne(seed);
  all.push(snaps);
  console.log("  season  ovrMean  85+  90+  age  ovr@27  ovr@34  passLd  rushLd  recLd  lost  topCap%  pay min/med  players  saveMB");
  for (const r of snaps) {
    console.log(
      `  ${r.season}    ${r.ovrMean.toFixed(1).padStart(5)}  ${String(r.n85).padStart(3)}  ${String(r.n90).padStart(3)}  ` +
      `${r.ageMean.toFixed(1)}  ${r.ovrAt27.toFixed(1).padStart(5)}   ${r.ovrAt34.toFixed(1).padStart(5)}   ` +
      `${String(r.passLead).padStart(5)}   ${String(r.rushLead).padStart(5)}  ${String(r.recLead).padStart(5)}  ` +
      `${String(r.playerWeeksLost).padStart(4)}  ${r.topCapPct.toFixed(1).padStart(6)}  ${r.minPayrollPct.toFixed(0).padStart(6)}  ` +
      `${String(r.players).padStart(6)}  ${r.saveMB.toFixed(1)}`
    );
  }
}

const flat = all.flat();
const first = all.map((s) => s[0]);
const last = all.map((s) => s[s.length - 1]);

console.log("\n=== guards ===");

// P0 — fixed, must stay fixed.
const pick1 = flat.filter((r) => r.pick1FromBottom6).length;
guard(pick1 === flat.length, "draft order tracks the standings",
  `${pick1}/${flat.length} first picks came from the bottom six`);

// P1 — the franchise arc.
const ovrDrift = mean(last.map((r) => r.ovrMean)) - mean(first.map((r) => r.ovrMean));
guard(Math.abs(ovrDrift) < 1.5, "league OVR does not inflate",
  `mean OVR moved ${ovrDrift >= 0 ? "+" : ""}${ovrDrift.toFixed(1)} over ${SEASONS} seasons`);

const eliteGrowth = mean(last.map((r) => r.n85)) / Math.max(1, mean(first.map((r) => r.n85)));
guard(eliteGrowth < 1.6, "the elite population is stable",
  `85+ players grew ${eliteGrowth.toFixed(1)}x`);

const agedWorse = flat.filter((r) => r.ovrAt34 < r.ovrAt27).length;
guard(agedWorse > flat.length * 0.8, "34-year-olds rate below 27-year-olds",
  `${agedWorse}/${flat.length} seasons`);

const fades = flat.flatMap((r) => r.fade);
const meanFade = mean(fades);
guard(meanFade < -5, "players decline measurably from their own peak",
  `a 33+ player is ${meanFade.toFixed(1)} OVR off his career best (n=${fades.length})`);

const capBust = flat.filter((r) => r.topCapPct > 28).length;
guard(capBust === 0, "no contract exceeds 28% of the cap",
  `${capBust}/${flat.length} seasons had one, peak ${Math.max(...flat.map((r) => r.topCapPct)).toFixed(0)}%`);

// Two guards, because one number cannot say this honestly.
//
// A club's payroll is bounded by its own roster: 53 replacement-level players
// are not WORTH 78% of the cap, and paying them that would just be printing
// money. So the floor a bad team can actually reach is lower than the target,
// and that is correct. What must never happen again is a franchise parked at
// 20-30% for twenty straight seasons, fielding minimum contracts and losing
// without ever choosing to — hence a low absolute floor, plus a separate check
// that the typical club is spending like a real one.
const poorHouse = flat.filter((r) => r.minPayrollPct < 55).length;
guard(poorHouse === 0, "no CPU team parks at replacement-level payroll",
  `${poorHouse}/${flat.length} seasons had one below 55%, lowest ${Math.min(...flat.map((r) => r.minPayrollPct)).toFixed(0)}%`);

// A league where nothing moves is as wrong as one where a third of the rosters
// change hands. Both sides of a trade have to come out ahead in their own
// currency, so the volume is a direct read on whether the front offices
// actually disagree with each other about anything.
const trades = mean(flat.map((r) => r.trades));
guard(trades >= 2 && trades <= 20, "clubs trade with each other",
  `${trades.toFixed(1)} trades per season`);

const medPay = mean(flat.map((r) => r.medPayrollPct));
guard(medPay > 82, "the median club spends like a real one",
  `median payroll ${medPay.toFixed(0)}% of cap`);

// Real NFL single-season marks: 5,477 pass / 2,105 rush / 1,964 rec.
const overPass = flat.filter((r) => r.passLead > 5477).length;
guard(overPass < flat.length * 0.15, "the passing record is not broken every year",
  `${overPass}/${flat.length} seasons exceeded 5,477 yards`, true);

// A band, not a floor. Too few and injuries are decoration; too many and depth
// stops being depth and every season is decided by attrition.
const injuryLoad = mean(flat.map((r) => r.playerWeeksLost));
guard(injuryLoad > 1500 && injuryLoad < 4000, "injuries cost a realistic amount of playing time",
  `${injuryLoad.toFixed(0)} rotation player-weeks lost league-wide per season`);

const growth = mean(all.map((s) => (s[s.length - 1].saveMB - s[0].saveMB) / (SEASONS - 1)));
guard(growth < 0.4, "save growth is bounded",
  `+${growth.toFixed(2)} MB per season, ending at ${mean(last.map((r) => r.saveMB)).toFixed(1)} MB`);

// A franchise that has to be abandoned because the browser refuses to store it
// is a lost save, so the ceiling is a guard in its own right and not just a
// consequence of the growth rate.
guard(mean(last.map((r) => r.saveMB)) < 20, "save stays inside a sane quota",
  `${mean(last.map((r) => r.saveMB)).toFixed(1)} MB after ${SEASONS} seasons`);

emitAll({
  "drift.p0Failures": failures,
  "drift.saveGrowthMbPerSeason": growth,
  "drift.saveMbAtEnd": mean(last.map((r) => r.saveMB)),
  "drift.tradesPerSeason": trades,
  "drift.medianPayrollPct": medPay,
  "drift.minPayrollSeasonsUnder55": poorHouse,
  "drift.capBustSeasons": capBust,
  "drift.passRecordSeasons": overPass,
  "drift.playerWeeksLost": injuryLoad,
  "drift.ovrDrift": ovrDrift,
  "drift.eliteGrowthRatio": eliteGrowth,
});
console.log(failures === 0 ? "\nno P0 regressions" : `\n${failures} P0 REGRESSIONS`);
process.exit(failures > 0 ? 1 : 0);
