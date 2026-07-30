/**
 * Scouting-system harness.
 *
 * The scouting build makes four claims, and each one has already been false
 * once in this codebase's history:
 *
 *   1. NOBODY READS THE ANSWER KEY.  No rendered surface can reconstruct a
 *      prospect's true rating (the attribute panel used to hand it over via
 *      position weights), and the CPU's read of a prospect contains genuine
 *      error on BOTH ovr and potential (it used to read true `pot` directly).
 *
 *   2. BELIEFS ARE PRIVATE AND DURABLE.  A club's opinion of a prospect is
 *      stable across calls (no per-call jitter — a war room holds a view),
 *      differs from other clubs', and is untouched by the user's spending
 *      (the old shared band meant user scouting sharpened all 31 rivals).
 *
 *   3. WORK BUYS INFORMATION.  User methods tighten the user's bands, cost
 *      points, and reveal what they claim to reveal — and nothing reveals
 *      `ceiling`, ever.
 *
 *   4. THE DRAFT MARKET IS ALIVE.  A headless draft completes legally, clubs
 *      trade on the clock, and the priority-UDFA chase signs real numbers.
 *
 *   npx tsx scripts/scoutcheck.ts
 */
import { emitAll, seedFor } from "./metrics";
import { newGame } from "../lib/core/newGame";
import { Rng } from "../lib/core/rng";
import { GameState, Player } from "../lib/core/types";
import { POSITION_WEIGHTS } from "../lib/core/ratings";
import {
  attrBand, cpuProspectView, getIntel, runScoutingMethod, scoutQuality,
} from "../lib/core/scouting";
import { initDraft, runFullDraft, runUdfaChase } from "../lib/core/offseason/draft";
import { evenBudget } from "../lib/core/staff";

const SEED = seedFor(90210);

const bar = (s: string) => console.log(`\n${s}\n${"─".repeat(s.length)}`);
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

let problems = 0;
function check(ok: boolean, label: string, detail: string): void {
  if (!ok) problems++;
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${label} — ${detail}`);
}

function prospects(state: GameState): Player[] {
  return state.players.filter((p) => p.prospect && !p.retired);
}

/** True OVR as the attribute panel could reconstruct it: weighted band mids. */
function panelOvr(state: GameState, p: Player): number {
  const w = POSITION_WEIGHTS[p.pos];
  let total = 0;
  for (const [k, weight] of Object.entries(w)) {
    const band = attrBand(state, p, k as keyof typeof w);
    total += ((band.low + band.high) / 2) * (weight ?? 0);
  }
  return total;
}

const state = newGame({ seed: SEED });
const pool = prospects(state);

bar("1. Profiles are complete and physically sane");
{
  const missing = pool.filter((p) => !p.profile).length;
  check(missing === 0, "every prospect has a profile", `${missing} missing of ${pool.length}`);

  const forty = (ps: Player[]) =>
    mean(ps.map((p) => p.profile?.combine.forty ?? NaN).filter((x) => Number.isFinite(x)));
  const wr = forty(pool.filter((p) => p.pos === "WR"));
  const ot = forty(pool.filter((p) => p.pos === "OT"));
  check(ot - wr > 0.12, "mass costs speed", `OT mean 40 ${ot.toFixed(2)} vs WR ${wr.toFixed(2)}`);
}

bar("2. Beliefs are private, durable, and wrong in private ways");
{
  const sample = pool.slice(0, 60);
  let unstable = 0;
  const spreads: number[] = [];
  const potErr: number[] = [];
  for (const p of sample) {
    const a = cpuProspectView(state, 3, p);
    const b = cpuProspectView(state, 3, p);
    if (a.ovr !== b.ovr || a.pot !== b.pot) unstable++;
    const reads = [0, 1, 2, 3, 4, 5, 6, 7].map((t) => cpuProspectView(state, t, p).ovr);
    const m = mean(reads);
    spreads.push(Math.sqrt(mean(reads.map((r) => (r - m) ** 2))));
    potErr.push(Math.abs(cpuProspectView(state, 5, p).pot - p.pot));
  }
  check(unstable === 0, "a club's read is stable across calls", `${unstable} unstable`);
  const spread = mean(spreads);
  check(spread > 1.2, "clubs disagree", `cross-club ovr sd ${spread.toFixed(2)}`);
  const potMae = mean(potErr);
  check(potMae > 1.5, "potential is no longer read off the answer key", `CPU pot MAE ${potMae.toFixed(2)}`);

  // The user's spending must not sharpen anyone else's board.
  const target = sample[0];
  const before = cpuProspectView(state, 9, target);
  state.teams[state.userTeamId].scoutingPoints = 999;
  const rng = new Rng(1234);
  runScoutingMethod(state, target.id, "film", rng);
  runScoutingMethod(state, target.id, "privateWorkout", rng);
  const after = cpuProspectView(state, 9, target);
  check(
    before.ovr === after.ovr && before.pot === after.pot,
    "user scouting does not leak to CPU boards",
    `club 9 read ${before.ovr.toFixed(1)}/${before.pot.toFixed(1)} -> ${after.ovr.toFixed(1)}/${after.pot.toFixed(1)}`
  );
}

bar("3. Invariant 6 — an even staff budget changes nothing");
{
  for (const t of state.teams) t.staff = evenBudget();
  const qs = state.teams.map((t) => scoutQuality(state, t.id));
  const off = qs.filter((q) => q !== 1).length;
  check(off === 0, "scout quality is exactly 1.0 at an even split", `${off} clubs off neutral`);
}

bar("4. The attribute panel cannot reconstruct the truth");
{
  const errs = pool.slice(0, 120).map((p) => Math.abs(panelOvr(state, p) - p.ovr));
  const leakMae = mean(errs);
  check(leakMae > 1.8, "panel-reconstructed OVR is genuinely wrong", `MAE ${leakMae.toFixed(2)} pts`);
  emitAll({ "scout.leakMae": Number(leakMae.toFixed(2)) });
}

bar("5. Work buys information");
{
  const rng = new Rng(777);
  state.teams[state.userTeamId].scoutingPoints = 999;
  const widthDrops: number[] = [];
  const potDrops: number[] = [];
  for (const p of pool.slice(10, 30)) {
    const w0 = getIntel(state, p);
    const width0 = w0.ovrHigh - w0.ovrLow;
    const pot0 = w0.potHigh - w0.potLow;
    runScoutingMethod(state, p.id, "film", rng);
    runScoutingMethod(state, p.id, "film", rng);
    runScoutingMethod(state, p.id, "privateWorkout", rng);
    runScoutingMethod(state, p.id, "medical", rng);
    runScoutingMethod(state, p.id, "interview", rng);
    const w1 = getIntel(state, p);
    widthDrops.push(width0 - (w1.ovrHigh - w1.ovrLow));
    potDrops.push(pot0 - (w1.potHigh - w1.potLow));
    if (w1.medical === null || w1.character === null) {
      check(false, "checks reveal risk grades", `player ${p.id} still unknown`);
    }
  }
  const drop = mean(widthDrops);
  const potDrop = mean(potDrops);
  check(drop >= 3, "a workup tightens the OVR band", `mean width drop ${drop.toFixed(1)} pts`);
  check(potDrop >= 2, "a workup tightens the potential band", `mean pot-width drop ${potDrop.toFixed(1)} pts`);
  emitAll({ "scout.filmWidthDrop": Number(drop.toFixed(2)) });
}

bar("6. The draft market is alive");
{
  // A fresh league so the spends above cannot contaminate the measurement.
  const st = newGame({ seed: SEED + 1 });
  const rng = new Rng(st.rngState);
  st.draft = initDraft(st, rng);
  runFullDraft(st, rng);
  const udfa = runUdfaChase(st, rng);

  const made = st.draft.picks.filter((p) => p.playerId !== null).length;
  check(made >= 215, "the draft completes", `${made} of ${st.draft.picks.length} picks made`);
  const clockTrades = st.draft.clockTrades ?? 0;
  check(clockTrades >= 3, "clubs trade on the clock", `${clockTrades} clock trades`);
  check(udfa >= 15 && udfa <= 400, "the UDFA chase signs real numbers", `${udfa} priority signings`);

  const rookies = st.players.filter((p) => p.draftedRound !== null && p.draftClassSeason === st.season);
  const noDeal = rookies.filter((p) => !p.contract).length;
  check(noDeal === 0, "every drafted man has a rookie deal", `${noDeal} without contracts`);

  emitAll({
    "scout.clockTrades": clockTrades,
    "scout.udfaSignings": udfa,
  });
}

bar("Result");
if (problems > 0) {
  console.log(`  ${problems} problem${problems === 1 ? "" : "s"}.`);
  process.exit(1);
}
console.log("  All checks passed.");
