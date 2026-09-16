/**
 * Scouting challenge audit — Claude's lane, Wave 3.9, plus the Wave 4.0
 * Packet 6 +2 probe. Not a tune. Not gate-registered.
 *
 * Question: can a user who plays the "solved line" (spend the private-visit
 * cap on the prospects around their own slot, run the cheap deterministic
 * medical / interview reveals on everyone, trade down when their board is
 * flat) draft materially better than CPU clubs draft — after the private
 * signal (#7/#21) and veteran beliefs (#24) went in?
 *
 * Arms, same seed, same league start:
 *   control  — user club auto-drafts through cpuPick (exactly what every
 *              headless harness does today). User FO is whatever
 *              `assignFrontOffices` already drew at generate.
 *   fo       — control, but the user's front office is re-rolled after
 *              `newGame` via `makeFrontOffice` from a random archetype, on
 *              a child stream (`plus2-fo`) so the parent RNG does not move.
 *              Staff stays even (q = 1.000). If the +2 vanishes, it was
 *              the FO dials.
 *   line     — the solved line as described above
 *   max      — the information ceiling: unlimited in-season film on the top
 *              of the consensus board (nothing caps film clicks), pro days
 *              on the same men, then the solved line on top
 *
 * Every arm also measures candidate (b): CPU picks stamped
 * `acquiredByClockTrade` in `tryCpuClockTrade` vs original-owner picks
 * (`teamId === originalTeamId` at pick time). Slot value of the clock
 * group against the original-owner neighbourhood. If it runs negative,
 * CPU move-ups are paying the winner's curse.
 *
 * Slot value is a draft-time number (true ovr + 0.5·room). It does not
 * need a four-year wait — a short seed still emits it on every drafted
 * class. Outcome labels still use the mature cutoff.
 *
 *   npx tsx scout-audit.ts <arm> <seasons> <seed>
 *
 * Studio (lock-grade, matches the 2026-09-14 audit):
 *   npx tsx scout-audit.ts control 14 12345
 *   npx tsx scout-audit.ts fo 14 12345
 * Cloud VM path-proof: 3 seasons is enough for (b) and a noisy (a).
 */
import { newGame } from "./lib/core/newGame";
import { Rng, clamp } from "./lib/core/rng";
import { advance } from "./lib/core/season/engine";
import {
  advanceOffseason, enterCampAfterDraft, enterDraft, isOffseason, openFaBidding,
  runAllFaWaves, runFreeAgencyOpen, runOffseasonTrades, simToUserPick,
} from "./lib/core/offseason";
import { cpuResign, spendToFloor, upgradeRoster, reconcileRoster } from "./lib/core/offseason/contracts";
import {
  acceptClockOffer, availableProspects, cpuTopOfBoard, isUserOnClock, makePick,
  signUdfa, UDFA_SIGNINGS_MAX, runFullDraft,
} from "./lib/core/offseason/draft";
import {
  advanceScoutingWindow, canAdvanceScoutingWindow, canRunScoutingMethod, consensusScore,
  cpuProspectView, ensureScouting, getIntel, runScoutingMethod, PRIVATE_VISIT_CAP,
  scoutQuality,
} from "./lib/core/scouting";
import { draftOrder } from "./lib/core/season/standings";
import { ARCHETYPES, REPLACEMENT_OVR, makeFrontOffice } from "./lib/core/frontOffice";
import { POSITION_VALUE } from "./lib/core/ratings";
import { rosterCount } from "./lib/core/select";
import { settleWaivers } from "./lib/core/waivers";
import { pruneStaleTradeInbox } from "./lib/core/trades";
import { GameState, Player, ROSTER_LIMIT, CAMP_ROSTER_LIMIT, STARTERS, POSITION_TARGET } from "./lib/core/types";
import {
  Career, ROOKIE_DEAL_YEARS, everStar, everElite, fullTimeSnapBaseline, isBust, isHit,
  isMultiYearStarter, positionRanks, snapshot, starterSeasons, careerLength,
} from "./lib/core/outcomes";

type Arm = "control" | "fo" | "line" | "max";
const ARM = (process.argv[2] ?? "control") as Arm;
const SEASONS = Number(process.argv[3] ?? 14);
const SEED = Number(process.argv[4] ?? 12345);

if (!["control", "fo", "line", "max"].includes(ARM)) {
  console.error(`unknown arm ${ARM} — use control | fo | line | max`);
  process.exit(2);
}

/** Child stream for the `fo` arm. Must not touch `state.rngState`. */
function plus2ChildRng(seed: number, tag: string): Rng {
  let h = seed >>> 0;
  h = Math.imul(h ^ 0x706c7332, 0x9e3779b9);
  for (let i = 0; i < tag.length; i++) h = Math.imul(h ^ tag.charCodeAt(i), 0xc2b2ae35);
  return new Rng((h >>> 0) || 0x9e3779b9);
}

const st = newGame({ seed: SEED });
const USER = st.userTeamId;

const foBefore = st.teams[USER].frontOffice;
if (ARM === "fo") {
  const rng = plus2ChildRng(SEED, "plus2-fo");
  st.teams[USER].frontOffice = makeFrontOffice(rng, rng.pick(ARCHETYPES));
}
const foAfter = st.teams[USER].frontOffice;
const startSeason = st.season;
const careers = new Map<number, Career>();
const tally = {
  visits: 0, film: 0, proDay: 0, medical: 0, interview: 0,
  tradeDowns: 0, offersSeen: 0, userPicks: 0, firings: 0, udfa: 0,
  clockTrades: 0, clockAcquired: 0, originalOwner: 0, otherTraded: 0,
};

/** How this man was sitting on the board when his name was called. */
type PickOrigin = "clock" | "original" | "other";
const pickOrigin = new Map<number, PickOrigin>();

function snapshotDraftOrigins(state: GameState): void {
  const d = state.draft;
  if (!d) return;
  tally.clockTrades += d.clockTrades ?? 0;
  for (const pk of d.picks) {
    if (pk.playerId == null) continue;
    let origin: PickOrigin;
    if (pk.acquiredByClockTrade) origin = "clock";
    else if (pk.teamId === pk.originalTeamId) origin = "original";
    else origin = "other";
    pickOrigin.set(pk.playerId, origin);
    if (origin === "clock") tally.clockAcquired++;
    else if (origin === "original") tally.originalOwner++;
    else tally.otherTraded++;
  }
}

const log = (s: string) => console.log(s);

// ---------------------------------------------------------------------------
// The user's private board — what the user actually sees
// ---------------------------------------------------------------------------

function belief(state: GameState, p: Player): { ovr: number; pot: number } {
  const i = getIntel(state, p);
  const ovr = (i.ovrLow + i.ovrHigh) / 2;
  const pot = Math.max(ovr, (i.potLow + i.potHigh) / 2);
  return { ovr, pot };
}

function incumbent(state: GameState, pos: Player["pos"]): number {
  const group = state.players
    .filter((p) => p.teamId === USER && p.pos === pos && !p.retired && !p.prospect)
    .map((p) => p.ovr)
    .sort((a, b) => b - a);
  const jobs = STARTERS[pos];
  if (group.length < jobs) return REPLACEMENT_OVR;
  return group[jobs - 1];
}

function count(state: GameState, pos: Player["pos"]): number {
  return state.players.filter((p) => p.teamId === USER && p.pos === pos && !p.retired && !p.prospect).length;
}

/** Same shape as the CPU board, priced on the user's belief instead of the club's. */
function userBoard(state: GameState): { p: Player; v: number }[] {
  const d = state.draft!;
  const pool = availableProspects(state, d.season);
  return pool
    .map((p) => {
      const b = belief(state, p);
      const inc = incumbent(state, p.pos);
      const startsHere = clamp((b.ovr - inc + 6) / 12, 0.25, 1);
      const thin = count(state, p.pos) < POSITION_TARGET[p.pos] ? 0.2 : 0;
      const above = Math.max(1, b.ovr + 0.5 * Math.max(0, b.pot - b.ovr) - REPLACEMENT_OVR);
      return { p, v: above * Math.sqrt(POSITION_VALUE[p.pos]) * startsHere * (1 + thin) };
    })
    .sort((a, b) => b.v - a.v || a.p.id - b.p.id);
}

// ---------------------------------------------------------------------------
// Scouting policy
// ---------------------------------------------------------------------------

function classPool(state: GameState): Player[] {
  return state.players
    .filter((p) => p.prospect && !p.retired && p.teamId === null && p.draftClassSeason === state.season)
    .sort((a, b) => consensusScore(state, b) - consensusScore(state, a));
}

function withRng<T>(state: GameState, f: (rng: Rng) => T): T {
  const rng = new Rng(state.rngState);
  const out = f(rng);
  state.rngState = rng.state;
  return out;
}

function runMethod(state: GameState, p: Player, method: Parameters<typeof runScoutingMethod>[2]): boolean {
  if (!canRunScoutingMethod(state, method)) return false;
  const ok = withRng(state, (rng) => runScoutingMethod(state, p.id, method, rng));
  if (ok) tally[method === "privateWorkout" ? "visits" : method]++;
  return ok;
}

/** In-season: the `max` arm films the top of the board until the band is tight. */
function inSeasonScouting(state: GameState): void {
  if (ARM !== "max") return;
  if (state.week !== 1) return;
  ensureScouting(state);
  const top = classPool(state).slice(0, 160);
  for (const p of top) {
    let n = 0;
    while (getIntel(state, p).effort < 95 && n++ < 8) {
      if (!runMethod(state, p, "film")) break;
    }
  }
}

/** All-star window (recap / tag phases): interviews. */
function allStarScouting(state: GameState): void {
  if (ARM === "control" || ARM === "fo") return;
  ensureScouting(state);
  for (const p of classPool(state).slice(0, 140)) runMethod(state, p, "interview");
}

/** The user's projected slots in the coming draft, from the standings. */
function projectedSlots(state: GameState): number[] {
  const order = draftOrder(state, state.season);
  const slot = order.indexOf(USER) + 1;
  return [slot, 32 + slot];
}

/** Combine → pro days → private visits, in the FA phase. */
function preDraftScouting(state: GameState): void {
  if (ARM === "control" || ARM === "fo") return;
  ensureScouting(state);
  const pool = classPool(state);
  // combine: medical on everyone worth a pick
  while (ensureScouting(state).window !== "combine" && canAdvanceScoutingWindow(state)) advanceScoutingWindow(state);
  for (const p of pool.slice(0, 140)) runMethod(state, p, "medical");
  // pro days: max arm only — unlimited, like film
  if (canAdvanceScoutingWindow(state)) advanceScoutingWindow(state);
  if (ARM === "max") {
    for (const p of pool.slice(0, 100)) {
      let n = 0;
      while (getIntel(state, p).effort < 100 && n++ < 3) if (!runMethod(state, p, "proDay")) break;
    }
  }
  // private visits: the slot neighbourhood — 20 around the R1 pick, 10 around the R2 pick
  if (canAdvanceScoutingWindow(state)) advanceScoutingWindow(state);
  const [s1, s2] = projectedSlots(state);
  const targets: Player[] = [];
  const take = (from: number, to: number, n: number) => {
    for (const p of pool.slice(Math.max(0, from), to)) {
      if (targets.length >= n) break;
      if (!targets.includes(p)) targets.push(p);
    }
  };
  take(s1 - 8, s1 + 24, 20);
  take(s2 - 6, s2 + 16, PRIVATE_VISIT_CAP);
  for (const p of targets) runMethod(state, p, "privateWorkout");
}

// ---------------------------------------------------------------------------
// The draft
// ---------------------------------------------------------------------------

function slotIndexOfPick(state: GameState, a: { season: number; round: number; originalTeamId: number }): number {
  const d = state.draft!;
  return d.picks.findIndex((pk) => pk.round === a.round && pk.originalTeamId === a.originalTeamId && pk.playerId === null);
}

function userDraft(state: GameState): void {
  const d = state.draft!;
  let guard = 0;
  while (!d.complete && guard++ < 400) {
    if (!isUserOnClock(state)) {
      simToUserPick(state);
      if (d.complete) break;
      if (!isUserOnClock(state)) break;
    }
    const board = userBoard(state);
    if (!board.length) { simToUserPick(state); continue; }

    // Trade down when the board is flat over the gap the buyer is asking us to drop.
    const offers = d.clockOffers ?? [];
    tally.offersSeen += offers.length;
    let traded = false;
    for (const o of offers) {
      const primary = o.give.find((a) => a.kind === "pick" && a.season === d.season);
      if (!primary || primary.kind !== "pick") continue;
      const idx = slotIndexOfPick(state, primary);
      if (idx < 0) continue;
      const gap = idx - d.onClock;
      const drop = board[0].v - (board[Math.min(gap, board.length - 1)]?.v ?? 0);
      const flat = drop < board[0].v * (o.give.length >= 2 ? 0.25 : 0.15);
      if (!flat) continue;
      const ok = withRng(state, (rng) => acceptClockOffer(state, o.id, rng));
      if (ok) { tally.tradeDowns++; traded = true; break; }
    }
    if (traded) continue;

    const ok = withRng(state, (rng) => makePick(state, board[0].p.id, rng));
    if (ok) tally.userPicks++;
    else simToUserPick(state);
  }
  if (!d.complete) withRng(state, (rng) => runFullDraft(state, rng));
}

/** The CPU's priority chase, run for the user club with the same rule. */
function userUdfa(state: GameState): void {
  const d = state.draft!;
  const pool = () => availableProspects(state, d.season);
  for (let i = 0; i < UDFA_SIGNINGS_MAX; i++) {
    if (rosterCount(state, USER) >= CAMP_ROSTER_LIMIT) break;
    const best = cpuTopOfBoard(state, USER, pool(), 60);
    if (!best) break;
    const view = cpuProspectView(state, USER, best.p);
    if (Math.max(view.ovr, view.pot - 6) < REPLACEMENT_OVR + 1) break;
    if (withRng(state, (rng) => signUdfa(state, USER, best.p.id, rng))) tally.udfa++;
  }
}

// ---------------------------------------------------------------------------
// Offseason — `advanceOffseason` with the user club housekept like a CPU club
// ---------------------------------------------------------------------------

function asCpu<T>(state: GameState, f: () => T): T {
  const keep = state.userTeamId;
  state.userTeamId = -1;
  try { return f(); } finally { state.userTeamId = keep; }
}

function offseasonStep(state: GameState): void {
  switch (state.phase) {
    case "offseason-recap": {
      advanceOffseason(state);
      if (state.forcedMove && !state.forcedMove.resolved) {
        // Headless: the owner fired the GM. Stay in the chair so the club is
        // still "the user" for the audit; count it.
        state.forcedMove.resolved = true;
        tally.firings++;
      }
      allStarScouting(state);
      return;
    }
    case "offseason-tag": {
      settleWaivers(state);
      pruneStaleTradeInbox(state);
      asCpu(state, () => runFreeAgencyOpen(state));   // cpuResign for the user club too
      runOffseasonTrades(state);
      asCpu(state, () => openFaBidding(state));
      return;
    }
    case "offseason-fa": {
      settleWaivers(state);
      pruneStaleTradeInbox(state);
      asCpu(state, () => runAllFaWaves(state));
      runOffseasonTrades(state);
      preDraftScouting(state);
      enterDraft(state);
      return;
    }
    case "offseason-draft": {
      settleWaivers(state);
      pruneStaleTradeInbox(state);
      if (ARM === "control" || ARM === "fo") withRng(state, (rng) => runFullDraft(state, rng));
      else userDraft(state);
      snapshotDraftOrigins(state);
      userUdfa(state);
      withRng(state, (rng) => enterCampAfterDraft(state, rng));
      return;
    }
    case "offseason-final": {
      withRng(state, (rng) => {
        reconcileRoster(state, USER, rng, ROSTER_LIMIT, true);
        spendToFloor(state, USER, rng);
        upgradeRoster(state, USER, rng);
      });
      advanceOffseason(state);
      return;
    }
  }
}

// ---------------------------------------------------------------------------
// Careers bookkeeping (mirrors scripts/careers.ts)
// ---------------------------------------------------------------------------

function enrol(state: GameState, season: number): void {
  for (const p of state.players) {
    if (p.prospect || careers.has(p.id)) continue;
    if (p.draftClassSeason !== season) continue;
    careers.set(p.id, {
      playerId: p.id, pos: p.pos, round: p.draftedRound, pick: p.draftedPick,
      draftSeason: state.season, draftAge: p.age, trueOvrAtDraft: p.ovr, truePotAtDraft: p.pot,
      draftTeamId: p.teamId ?? -1, seasons: [], retiredSeason: null, secondContract: "unresolved",
    });
  }
}

function record(state: GameState, season: number): void {
  const baseline = fullTimeSnapBaseline(state, season);
  const ranks = positionRanks(state, season);
  const byId = new Map<number, Player>();
  for (const p of state.players) byId.set(p.id, p);
  for (const c of careers.values()) {
    if (c.retiredSeason !== null) continue;
    const p = byId.get(c.playerId);
    if (!p) continue;
    c.seasons.push(snapshot(p, season, c.draftSeason, baseline, ranks));
    if (p.retired) c.retiredSeason = season;
    if (season - c.draftSeason === ROOKIE_DEAL_YEARS && c.secondContract === "unresolved") {
      if (p.retired || p.teamId === null) c.secondContract = "none";
      else if (p.teamId === c.draftTeamId) c.secondContract = "drafting-team";
      else c.secondContract = "elsewhere";
    }
  }
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

const userWins: number[] = [];
for (let s = 0; s < SEASONS; s++) {
  const season = st.season;
  let g = 0;
  while (st.phase !== "offseason-recap" && g++ < 40) {
    if (st.phase === "regular") inSeasonScouting(st);
    advance(st);
  }
  const rec = st.teams[USER];
  const w = st.games.filter((x) => x.played && (x.homeId === USER || x.awayId === USER))
    .filter((x) => (x.homeId === USER ? x.homeScore > x.awayScore : x.awayScore > x.homeScore)).length;
  userWins.push(w);
  record(st, season);
  let o = 0;
  while (isOffseason(st.phase) && o++ < 40) offseasonStep(st);
  enrol(st, season);
  console.error(`  [${ARM} ${SEED}] season ${season} (${s + 1}/${SEASONS}) careers=${careers.size} wins=${w} visits=${tally.visits} td=${tally.tradeDowns} clock=${tally.clockAcquired} ${rec.abbr}`);
}

const CUTOFF = st.season - ROOKIE_DEAL_YEARS - 1;
const drafted = [...careers.values()].filter((c) => c.round !== null);
const mature = drafted.filter((c) => c.draftSeason <= CUTOFF);
const user = mature.filter((c) => c.draftTeamId === USER);
const cpu = mature.filter((c) => c.draftTeamId !== USER);
const draftedUser = drafted.filter((c) => c.draftTeamId === USER);
const draftedCpu = drafted.filter((c) => c.draftTeamId !== USER);
const clockCpu = draftedCpu.filter((c) => pickOrigin.get(c.playerId) === "clock");
const originalCpu = draftedCpu.filter((c) => pickOrigin.get(c.playerId) === "original");
const otherCpu = draftedCpu.filter((c) => pickOrigin.get(c.playerId) === "other");

const pct = (n: number, d: number) => (d ? (100 * n) / d : 0);
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const trueVal = (c: Career) => c.trueOvrAtDraft + 0.5 * (c.truePotAtDraft - c.trueOvrAtDraft);

function summarise(g: Career[]) {
  return {
    n: g.length,
    hit: pct(g.filter(isHit).length, g.length),
    bust: pct(g.filter((c) => (c.round ?? 9) <= 2).filter(isBust).length, g.filter((c) => (c.round ?? 9) <= 2).length),
    starter4: pct(g.filter(isMultiYearStarter).length, g.length),
    star: pct(g.filter(everStar).length, g.length),
    elite: pct(g.filter(everElite).length, g.length),
    starterSeasons: avg(g.map(starterSeasons)),
    careerLen: avg(g.map(careerLength)),
    ovrAtDraft: avg(g.map((c) => c.trueOvrAtDraft)),
    potAtDraft: avg(g.map((c) => c.truePotAtDraft)),
    ceilGap: avg(g.map((c) => c.truePotAtDraft - c.trueOvrAtDraft)),
  };
}

/** True OVR at draft relative to the league mean at the same pick band (±8 picks). */
function slotValue(g: Career[], peers: Career[]): { n: number; value: number } {
  const vals: number[] = [];
  for (const c of g) {
    const neighbourhood = peers.filter((x) =>
      x.playerId !== c.playerId && x.pick !== null && c.pick !== null && Math.abs(x.pick - c.pick) <= 8
    );
    if (neighbourhood.length < 5) continue;
    vals.push(trueVal(c) - avg(neighbourhood.map(trueVal)));
  }
  return { n: vals.length, value: avg(vals) };
}

const bands: [string, (c: Career) => boolean][] = [
  ["all", () => true],
  ["r1-2", (c) => (c.round ?? 9) <= 2],
  ["r3-4", (c) => (c.round ?? 9) >= 3 && (c.round ?? 9) <= 4],
  ["r5-7", (c) => (c.round ?? 9) >= 5],
];

function foSnap(fo: typeof foAfter) {
  if (!fo) return null;
  return { name: fo.name, risk: +fo.risk.toFixed(3), bpaBias: +fo.bpaBias.toFixed(3), winNow: +fo.winNow.toFixed(3) };
}

const out = {
  arm: ARM, seed: SEED, seasons: SEASONS, userTeam: st.teams[USER].abbr,
  cutoffSeason: CUTOFF, tally, userWins,
  userFrontOffice: {
    before: foSnap(foBefore),
    after: foSnap(foAfter),
    scoutQuality: +scoutQuality(st, USER).toFixed(3),
  },
  /**
   * Draft-time slot value on every drafted class (no mature cutoff).
   * This is the +2 probe number. Peers for the user are CPU picks;
   * peers for a clock move-up are original-owner CPU picks.
   */
  plus2: {
    userVsCpu: slotValue(draftedUser, draftedCpu),
    cpuVsCpu: slotValue(draftedCpu, draftedCpu),
    clockVsOriginal: slotValue(clockCpu, originalCpu),
    originalVsOriginal: slotValue(originalCpu, originalCpu),
    otherVsOriginal: slotValue(otherCpu, originalCpu),
    n: { user: draftedUser.length, cpu: draftedCpu.length, clock: clockCpu.length, original: originalCpu.length, other: otherCpu.length },
    trueValue: {
      user: avg(draftedUser.map(trueVal)),
      cpu: avg(draftedCpu.map(trueVal)),
      clock: avg(clockCpu.map(trueVal)),
      original: avg(originalCpu.map(trueVal)),
      other: avg(otherCpu.map(trueVal)),
    },
    bands: Object.fromEntries(bands.map(([k, f]) => [k, {
      userVsCpu: slotValue(draftedUser.filter(f), draftedCpu.filter(f)),
      clockVsOriginal: slotValue(clockCpu.filter(f), originalCpu.filter(f)),
      n: { user: draftedUser.filter(f).length, clock: clockCpu.filter(f).length, original: originalCpu.filter(f).length },
    }])),
  },
  bands: Object.fromEntries(bands.map(([k, f]) => [k, {
    user: summarise(user.filter(f)), cpu: summarise(cpu.filter(f)),
    userSlotValue: slotValue(user.filter(f), mature.filter((c) => c.draftTeamId !== USER)).value,
    cpuSlotValue: slotValue(cpu.filter(f), mature.filter((c) => c.draftTeamId !== USER)).value,
  }])),
  userPicksByRound: [1, 2, 3, 4, 5, 6, 7].map((r) => user.filter((c) => c.round === r).length),
};
log(JSON.stringify(out));
