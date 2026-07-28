/**
 * Outlier coherence.
 *
 * A simulation can produce the right NUMBER of 200-yard receiving games and
 * still be wrong, if the players having them are random. Before coverage
 * assignments existed, a 70-OVR receiver caught 19 balls from a 66-OVR
 * quarterback for 245 yards — the correct frequency, attached to nobody.
 *
 * This asks a different question: when a big game happens, is there a REASON?
 * Every outlier is checked against the things that actually explain one in real
 * football — the player is good, the opponent is bad, the game script demanded
 * volume, or the conditions were ideal.
 *
 *   npx tsx scripts/coherence.ts [seasons]
 */
import { newGame } from "../lib/core/newGame";
import { advance } from "../lib/core/season/engine";
import { GameState, Player } from "../lib/core/types";
import { Rng } from "../lib/core/rng";
import { simulateGame } from "../lib/core/sim/game";
import { autoSortDepthChart } from "../lib/core/generate";
import { emitAll } from "./metrics";

const SEASONS = Number(process.argv[2] ?? 5);

interface Case {
  kind: "receiving" | "rushing" | "passing";
  value: number;
  reasons: string[];
  /**
   * Reasons that are about TALENT — this player is good, or the opponent is
   * weak. Volume and game script are context, not explanation: "he threw it 50
   * times while losing" does not explain why a mediocre receiver dominated a
   * top secondary.
   */
  quality: string[];
  detail: string;
}

const cases: Case[] = [];

for (let s = 0; s < SEASONS; s++) {
  const st: GameState = newGame({ seed: 24680 + s * 1013 });
  advance(st);
  let g = 0;
  while (st.phase === "regular" && g++ < 40) advance(st);

  const byId = new Map(st.players.map((p) => [p.id, p]));

  // League-wide baselines for "is this player good" and "is that unit bad".
  const posAvg = new Map<string, number>();
  const posSd = new Map<string, number>();
  for (const pos of ["QB", "RB", "WR", "TE", "CB", "S", "EDGE", "DT", "LB"]) {
    const vals = st.players
      .filter((p) => p.pos === pos && p.teamId !== null && !p.prospect)
      .map((p) => p.ovr);
    const mean = vals.reduce((a, b) => a + b, 0) / Math.max(1, vals.length);
    const sd = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, vals.length));
    posAvg.set(pos, mean);
    posSd.set(pos, sd || 1);
  }
  const z = (p: Player) => (p.ovr - (posAvg.get(p.pos) ?? 65)) / (posSd.get(p.pos) ?? 1);

  /** Average coverage rating of a defence's top corners and safeties. */
  const secondary = (teamId: number) => {
    const dbs = st.players
      .filter((p) => p.teamId === teamId && (p.pos === "CB" || p.pos === "S") && !p.prospect)
      .sort((a, b) => b.ovr - a.ovr)
      .slice(0, 5);
    return dbs.reduce((a, p) => a + p.attrs.cov, 0) / Math.max(1, dbs.length);
  };
  const front = (teamId: number) => {
    const ps = st.players
      .filter((p) => p.teamId === teamId && (p.pos === "DT" || p.pos === "EDGE" || p.pos === "LB") && !p.prospect)
      .sort((a, b) => b.ovr - a.ovr)
      .slice(0, 7);
    return ps.reduce((a, p) => a + (p.attrs.tkl + p.attrs.pur) / 2, 0) / Math.max(1, ps.length);
  };

  const allSecondary = st.teams.map((t) => secondary(t.id));
  const secMean = allSecondary.reduce((a, b) => a + b, 0) / allSecondary.length;
  const allFront = st.teams.map((t) => front(t.id));
  const frontMean = allFront.reduce((a, b) => a + b, 0) / allFront.length;

  for (const gm of st.games) {
    if (!gm.played || !gm.boxScore || gm.playoffRound !== null) continue;

    for (const ps of gm.boxScore.players) {
      const p = byId.get(ps.playerId);
      if (!p) continue;
      const oppId = ps.teamId === gm.homeId ? gm.awayId : gm.homeId;
      const ownScore = ps.teamId === gm.homeId ? gm.homeScore : gm.awayScore;
      const oppScore = ps.teamId === gm.homeId ? gm.awayScore : gm.homeScore;
      const trailed = oppScore - ownScore >= 7;
      const w = gm.conditions?.weather;
      const goodConditions = !w || w.dome || (w.temp >= 45 && w.wind < 12 && w.precip === "none");

      const teamPassAtt = gm.boxScore.players
        .filter((x) => x.teamId === ps.teamId)
        .reduce((a, x) => a + x.passAtt, 0);
      const teamRushAtt = gm.boxScore.players
        .filter((x) => x.teamId === ps.teamId)
        .reduce((a, x) => a + x.rushAtt, 0);

      const qb = gm.boxScore.players
        .filter((x) => x.teamId === ps.teamId && x.passAtt > 0)
        .sort((a, b) => b.passAtt - a.passAtt)[0];
      const qbP = qb ? byId.get(qb.playerId) : undefined;

      // --- 200+ receiving -------------------------------------------------
      if (ps.recYds >= 200) {
        const reasons: string[] = [];
        if (z(p) >= 0.6) reasons.push("elite receiver");
        if (qbP && z(qbP) >= 0.4) reasons.push("good QB");
        if (secondary(oppId) <= secMean - 2.5) reasons.push("weak secondary");
        if (teamPassAtt >= 40) reasons.push("high volume");
        if (trailed) reasons.push("trailing");
        if (goodConditions) reasons.push("clean conditions");
        cases.push({
          kind: "receiving", value: ps.recYds, reasons,
          quality: reasons.filter((r) => r === "elite receiver" || r === "weak secondary" || r === "good QB"),
          detail: `${p.lastName} (${p.pos} ${p.ovr}) ${ps.recYds} yds on ${ps.rec}/${ps.targets}` +
            ` · QB ${qbP?.ovr ?? "?"} · opp DB cov ${secondary(oppId).toFixed(0)} (lg ${secMean.toFixed(0)})` +
            ` · ${teamPassAtt} att`,
        });
      }

      // --- 150+ rushing ---------------------------------------------------
      if (ps.rushYds >= 150 && p.pos === "RB") {
        const reasons: string[] = [];
        if (z(p) >= 0.6) reasons.push("elite back");
        if (front(oppId) <= frontMean - 2.5) reasons.push("weak front seven");
        if (teamRushAtt >= 30) reasons.push("high volume");
        if (ownScore - oppScore >= 7) reasons.push("leading");
        if (w && !w.dome && (w.wind >= 18 || w.precip !== "none" || w.temp <= 30)) {
          reasons.push("run-friendly weather");
        }
        cases.push({
          kind: "rushing", value: ps.rushYds, reasons,
          quality: reasons.filter((r) => r === "elite back" || r === "weak front seven"),
          detail: `${p.lastName} (RB ${p.ovr}) ${ps.rushYds} yds on ${ps.rushAtt} car` +
            ` · opp front ${front(oppId).toFixed(0)} (lg ${frontMean.toFixed(0)})` +
            ` · ${teamRushAtt} team carries`,
        });
      }

      // --- 400+ passing ---------------------------------------------------
      if (ps.passYds >= 400) {
        const reasons: string[] = [];
        if (z(p) >= 0.5) reasons.push("elite QB");
        if (secondary(oppId) <= secMean - 2.5) reasons.push("weak secondary");
        if (ps.passAtt >= 42) reasons.push("high volume");
        if (trailed) reasons.push("trailing");
        if (goodConditions) reasons.push("clean conditions");
        cases.push({
          kind: "passing", value: ps.passYds, reasons,
          quality: reasons.filter((r) => r === "elite QB" || r === "weak secondary"),
          detail: `${p.lastName} (QB ${p.ovr}) ${ps.passYds} yds on ${ps.passCmp}/${ps.passAtt}` +
            ` · opp DB cov ${secondary(oppId).toFixed(0)} (lg ${secMean.toFixed(0)})`,
        });
      }
    }
  }
}

function report(kind: Case["kind"], label: string): { pct: number; n: number } {
  const list = cases.filter((c) => c.kind === kind);
  if (list.length === 0) {
    console.log(`\n${label}: none occurred`);
    return { pct: 100, n: 0 };
  }
  // A talent reason AND a second factor of any kind.
  const explained = list.filter((c) => c.quality.length >= 1 && c.reasons.length >= 2);
  const pct = (explained.length / list.length) * 100;

  console.log(`\n${label} — ${list.length} games, ${pct.toFixed(0)}% explicable`);
  const unexplained = list.filter((c) => !(c.quality.length >= 1 && c.reasons.length >= 2))
    .sort((a, b) => b.value - a.value);
  if (unexplained.length > 0) {
    console.log(`  unexplained (no talent reason):`);
    for (const c of unexplained.slice(0, 4)) {
      console.log(`    ${c.detail}   [${c.reasons.join(", ") || "nothing"}]`);
    }
  }
  const best = list.slice().sort((a, b) => b.value - a.value)[0];
  console.log(`  biggest: ${best.detail}`);
  console.log(`           reasons: ${best.reasons.join(", ") || "NONE"}`);
  return { pct, n: list.length };
}

console.log(`\n=== Outlier coherence across ${SEASONS} seasons ===`);
const rec = report("receiving", "200+ receiving yards");
const rush = report("rushing", "150+ rushing yards");
const pass = report("passing", "400+ passing yards");

const weighted =
  (rec.pct * rec.n + rush.pct * rush.n + pass.pct * pass.n) /
  Math.max(1, rec.n + rush.n + pass.n);

// ---------------------------------------------------------------------------
// Does shadow coverage actually erase a number one receiver?
// ---------------------------------------------------------------------------
{
  const base = newGame({ seed: 8899 });

  const trial = (label: string, cbCov: number, shadow: number) => {
    const st = JSON.parse(JSON.stringify(base)) as GameState;
    // Give the defence a corner of the given quality and a shadow tendency.
    const cbs = st.players
      .filter((p) => p.teamId === 1 && p.pos === "CB" && !p.prospect)
      .sort((a, b) => b.ovr - a.ovr);
    if (cbs[0]) cbs[0].attrs.cov = cbCov;
    for (const c of cbs.slice(1)) c.attrs.cov = 55;
    st.teams[1].coach.shadowTendency = shadow;
    for (const t of st.teams) autoSortDepthChart(st, t);

    const wr1 = st.teams[0].depthChart.WR[0];
    const wr2 = st.teams[0].depthChart.WR[1];
    let y1 = 0;
    let y2 = 0;
    const N = 240;
    for (let i = 0; i < N; i++) {
      const rng = new Rng(4242 + i * 7919);
      const r = simulateGame(st, {
        id: 1, season: st.season, week: 1, homeId: 0, awayId: 1,
        played: false, homeScore: 0, awayScore: 0, playoffRound: null, boxScore: null,
      }, rng);
      for (const ps of r.box.players) {
        if (ps.playerId === wr1) y1 += ps.recYds;
        if (ps.playerId === wr2) y2 += ps.recYds;
      }
    }
    console.log(`  ${label.padEnd(38)} WR1 ${(y1 / N).toFixed(1)} yds   WR2 ${(y2 / N).toFixed(1)} yds`);
    return { wr1: y1 / N, wr2: y2 / N };
  };

  console.log(`\n=== does a shutdown corner erase a number one receiver? ===`);
  const weak = trial("weak CB1 (cov 45), plays sides", 45, 0);
  const eliteSides = trial("elite CB1 (cov 95), plays sides", 95, 0);
  const eliteShadow = trial("elite CB1 (cov 95), shadows WR1", 95, 1);

  const sidesDrop = weak.wr1 - eliteSides.wr1;
  const shadowDrop = weak.wr1 - eliteShadow.wr1;
  console.log(`  elite corner playing sides costs WR1  ${sidesDrop.toFixed(1)} yds/game`);
  console.log(`  the same corner shadowing costs him   ${shadowDrop.toFixed(1)} yds/game`);
  emitAll({
    "coherence.eliteCbSidesDrop": sidesDrop,
    "coherence.eliteCbShadowDrop": shadowDrop,
  });
  console.log(
    shadowDrop > sidesDrop + 1
      ? "  shadowing is meaningfully worse for the receiver than side coverage"
      : "  *** shadowing does not distinguish itself from side coverage ***"
  );
}

console.log(`\noverall: ${weighted.toFixed(1)}% of outlier games have at least two explaining factors`);
const THRESHOLD = 85;
console.log(weighted >= THRESHOLD ? "COHERENT" : `BELOW TARGET (${THRESHOLD}%)`);
emitAll({ "coherence.outlierExplainedPct": weighted });
process.exit(weighted >= THRESHOLD ? 0 : 1);
