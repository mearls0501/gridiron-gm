import { Rng } from "../rng";
import { refreshDepthCharts } from "../generate";
import { clearDeadCap } from "../select";
import { GameState, Phase, ROSTER_LIMIT } from "../types";
import { foldPracticeSquad, resetSeasonRosterFlags } from "../rosterStatus";
import { settleWaivers } from "../waivers";
import { recordSeasonHistory, runProgression, OffseasonReport } from "./progression";
import { cpuResign, expireContracts, fillCampRosters, reconcileRoster, runCpuFifthYearOptions, runCpuFranchiseTags, runCpuTagExtensions, spendToFloor, upgradeRoster } from "./contracts";
import { FA_ROUNDS, openMarket, openCpuBidding, resolveFaWave } from "./freeAgency";
import { buildDraftPicks, convertUndrafted, initDraft, runDraftUntilUser, runFullDraft, runUdfaChase, generateDraftClass, initialScoutingPass } from "./draft";
import { ensureScouting, pruneScouting } from "../scouting";
import { ensurePickInventory, generateUserOffers, prunePickInventory, runCpuTrades, runDraftDayTrades } from "../trades";
import { runHousekeeping } from "../housekeeping";
import { refreshCpuStaff } from "../staff";

export * from "./contracts";
export * from "./draft";
export * from "./freeAgency";
export * from "./progression";

/**
 * Offseason orchestration.
 *
 * Five phases, each advanced by one call. Every phase leaves the save in a
 * valid, playable state — there is no half-completed rollover that can strand a
 * franchise with no active season.
 */

export interface OffseasonStep {
  phase: Phase;
  title: string;
  description: string;
  action: string;
}

export const OFFSEASON_STEPS: Record<string, OffseasonStep> = {
  "offseason-recap": {
    phase: "offseason-recap",
    title: "Season Review",
    description: "Awards, retirements, and player development for the year just finished.",
    action: "Continue to the Franchise Tag",
  },
  "offseason-tag": {
    phase: "offseason-tag",
    title: "Franchise Tag",
    description: "One exclusive tag this year. Tag him, or let the window close and he hits free agency.",
    action: "Continue to Free Agency",
  },
  "offseason-fa": {
    phase: "offseason-fa",
    title: "Free Agency",
    description: "Contracts have expired. Sign replacements before the draft.",
    action: "Continue to the Draft",
  },
  "offseason-draft": {
    phase: "offseason-draft",
    title: "The Draft",
    description: "Scout the class and make your picks.",
    action: "Finish the Draft",
  },
  "offseason-final": {
    phase: "offseason-final",
    title: "Roster Cutdown",
    description: "Fifth-year option and tagged-player extension on the desk, then get to 53 and under the cap.",
    action: "Start the Season",
  },
};

export interface OffseasonState {
  report: OffseasonReport | null;
  faRound: number;
}

/** Season review: history, awards, aging, development, retirement. */
export function runRecap(state: GameState): OffseasonReport {
  const rng = new Rng(state.rngState);

  const history = recordSeasonHistory(state);
  state.history.push(history);

  const report = runProgression(state, rng);

  for (const r of report.retirements) {
    state.log.push({
      season: state.season, week: 0, kind: "milestone",
      text: `${r.player.firstName} ${r.player.lastName} (${r.player.pos}, ${r.player.ovr} OVR) retires at ${r.age}.`,
    });
  }

  state.rngState = rng.state;
  state.phase = "offseason-tag";
  return report;
}

/** Contracts expire, CPU teams re-sign their own, then the market opens. */
export function runFreeAgencyOpen(state: GameState): void {
  const rng = new Rng(state.rngState);

  clearDeadCap(state);
  const expiring = expireContracts(state);

  // CPU teams get first crack at retaining their own expiring players.
  const byTeam = new Map<number, typeof expiring>();
  for (const p of expiring) {
    // teamId was cleared by expireContracts; recover the last team from stats.
    const last = p.stats[p.stats.length - 1]?.teamId ?? null;
    if (last === null || last === state.userTeamId) continue;
    const arr = byTeam.get(last) ?? [];
    arr.push(p);
    byTeam.set(last, arr);
  }
  for (const [teamId, players] of byTeam) {
    cpuResign(state, teamId, players, rng);
  }

  // The board is open: from here the user bids and clubs bid back.
  // CPU opening bids are a separate step (`openFaBidding`) so a headless
  // advance still writes `FaBid`s onto `state.fa` the way PR #3 does.
  openMarket(state);

  state.rngState = rng.state;
  state.phase = "offseason-fa";
}

/** CPU clubs place the opening wave of bids. User club is not auto-bid for. */
export function openFaBidding(state: GameState): void {
  const rng = new Rng(state.rngState);
  openCpuBidding(state, rng);
  state.rngState = rng.state;
}

/**
 * Advance the market one wave.
 *
 * Resolves the user's outstanding bids against CPU counter-offers first, then
 * runs the ordinary offscreen wave. With no user bids outstanding — which is
 * every headless run — this is exactly the old `runCpuFaRound` call, so
 * `verify`, `drift` and `sweep` see unchanged behaviour.
 */
export function runFaWave(state: GameState, round: number) {
  const rng = new Rng(state.rngState);
  const outcome = resolveFaWave(state, rng, round);
  state.rngState = rng.state;
  return outcome;
}

/** Skip ahead: run every remaining CPU wave at once. */
export function runAllFaWaves(state: GameState): void {
  for (let r = 1; r <= FA_ROUNDS; r++) {
    if (state.fa?.complete) break;
    runFaWave(state, r);
  }
}

/** Clubs work the phones. Returns how many deals were struck. */
export function runOffseasonTrades(state: GameState): number {
  const rng = new Rng(state.rngState);
  const n = runCpuTrades(state, rng);
  generateUserOffers(state, rng);
  state.rngState = rng.state;
  return n;
}

export function enterDraft(state: GameState): void {
  const rng = new Rng(state.rngState);
  if (!state.draft || state.draft.season !== state.season) {
    state.draft = initDraft(state, rng);
  }
  // Draft weekend is the busiest trade window of the year — 31-48% of all
  // annual trade activity in three days (`docs/nfl-reference.md` §1.5). Clubs
  // move on the board before the first pick is in.
  //
  // Known limitation: this is one burst before the draft opens rather than
  // trades between picks, so a club cannot yet jump up for a specific player
  // it has fallen for. The volume and the round distribution are right; the
  // motivation is not.
  runDraftDayTrades(state, rng);
  if (state.draft) state.draft.picks = buildDraftPicks(state, state.draft.season);
  runDraftUntilUser(state, rng);
  state.rngState = rng.state;
  state.phase = "offseason-draft";
}

export function simToUserPick(state: GameState): void {
  const rng = new Rng(state.rngState);
  runDraftUntilUser(state, rng);
  state.rngState = rng.state;
}

export function simEntireDraft(state: GameState): void {
  const rng = new Rng(state.rngState);
  runFullDraft(state, rng);
  state.rngState = rng.state;
}

/**
 * Close the priority UDFA window and enter camp. Remaining undrafted
 * hit the street; every club fills toward 90. Board cap of 4 is unchanged.
 */
export function enterCampAfterDraft(state: GameState, rng: Rng): number {
  const n = runUdfaChase(state, rng);
  if (state.draft) convertUndrafted(state, state.draft.season);
  fillCampRosters(state, rng);
  state.phase = "offseason-final";
  runCpuFifthYearOptions(state);
  runCpuTagExtensions(state, rng);
  return n;
}

/**
 * Close out the offseason: undrafted players hit the pool, every roster is
 * brought to a legal 53 under the cap, and the calendar rolls to next season.
 */
export function finalizeOffseason(state: GameState): void {
  const rng = new Rng(state.rngState);

  if (state.draft) {
    convertUndrafted(state, state.draft.season);
    // That class is spent; its pick rows can go.
    prunePickInventory(state, state.draft.season);
  }

  // CPU housekeeping first, then the user's team, so the user gets the last
  // word on their own roster but never starts a season with an illegal one.
  // Explicit 53: this call is the cutdown, and the phase is still
  // offseason-final (camp ceiling 90) until the calendar rolls below.
  for (const t of state.teams) {
    if (t.id === state.userTeamId) continue;
    foldPracticeSquad(state, t.id);
    reconcileRoster(state, t.id, rng, ROSTER_LIMIT, true);
    // Then spend up to the league floor. Deliberately not applied to the user's
    // club: how much of their own cap they use is their decision, not ours.
    spendToFloor(state, t.id, rng);
    // Then contest every roster spot against the open market — the cutdown.
    // Also not applied to the user, for the same reason: deciding who is worth
    // a place is the job, and doing it for them would be doing the job for
    // them. It does mean a headless run leaves the user's club stale, which is
    // the same known bias `checkParity` already corrects for.
    upgradeRoster(state, t.id, rng);
    reconcileRoster(state, t.id, rng, ROSTER_LIMIT, true);
  }
  foldPracticeSquad(state, state.userTeamId);
  reconcileRoster(state, state.userTeamId, rng, ROSTER_LIMIT, true);

  // Roll the calendar.
  state.season += 1;
  state.week = 0;
  state.phase = "preseason";
  resetSeasonRosterFlags(state);
  state.games = [];
  state.playoffs = null;
  state.draft = null;
  state.fa = null;
  // Intel and board notes on the class that was just drafted are dead weight.
  pruneScouting(state);
  // CPU clubs re-allocate their staff for the new year. The user's own
  // split is left alone — it is theirs until they change it. Visits reset
  // with the calendar the same way `ensureScouting` reseasons.
  refreshCpuStaff(state);
  ensureScouting(state);

  // Seed next year's class so the user can scout during the season.
  generateDraftClass(state, rng, state.season);
  initialScoutingPass(state, state.season, rng);

  refreshDepthCharts(state);
  // Roll the pick horizon forward so next year's class is tradeable too.
  ensurePickInventory(state);
  state.tradeOffers = [];
  state.rngState = rng.state;

  // Last, so the entry announcing the new season is never the one trimmed.
  runHousekeeping(state);

  state.log.push({
    season: state.season, week: 0, kind: "system",
    text: `${state.season} preseason begins.`,
  });

  // Cutdown extras already hit the wire above. Close that window and the
  // claim-cut chain in this advance so the preseason desk is not the
  // whole camp dump. Play Week stays one window.
  settleWaivers(state);
}

/**
 * One-call offseason advance used by the hub button and the headless harness.
 * Returns a human-readable description of what just happened.
 */
export function advanceOffseason(state: GameState): string {
  settleWaivers(state);
  switch (state.phase) {
    case "offseason-recap": {
      const rng = new Rng(state.rngState);
      runRecap(state);
      runCpuFranchiseTags(state, rng);
      state.rngState = rng.state;
      return "Season review complete — franchise tag window is open";
    }

    case "offseason-tag":
      runFreeAgencyOpen(state);
      runOffseasonTrades(state);
      openFaBidding(state);
      return "Franchise tag window closed — free agency is open";

    case "offseason-fa":
      runAllFaWaves(state);
      runOffseasonTrades(state);
      enterDraft(state);
      return "Free agency closed — the draft is on the clock";

    case "offseason-draft": {
      simEntireDraft(state);
      // Priority chase (CPU only, board cap of 4), then street-FA /
      // remaining-undrafted fill toward 90. User Sign on the board
      // stays at UDFA_SIGNINGS_MAX. Idempotent if the room already closed.
      const rng = new Rng(state.rngState);
      enterCampAfterDraft(state, rng);
      state.rngState = rng.state;
      return "Draft complete";
    }

    case "offseason-final":
      finalizeOffseason(state);
      return `${state.season} preseason begins`;

    default:
      return "";
  }
}

export function isOffseason(phase: Phase): boolean {
  return phase.startsWith("offseason");
}
