import { Rng } from "../rng";
import { simulateGame } from "../sim/game";
import { refreshDepthCharts } from "../generate";
import { generateSchedule } from "../schedule";
import { GameState, Player, REGULAR_SEASON_WEEKS, TRADE_DEADLINE_WEEK } from "../types";
import { applyGameStats } from "./stats";
import { recordGame } from "./records";
import { initPlayoffs, simulatePlayoffRound } from "./playoffs";
import { applyGameWear, healWeek, healthySet, rollWeeklyInjuries } from "./injuries";
import { generateUserOffers, runCpuTrades } from "../trades";
import { freeActiveSlot } from "../offseason/contracts";
import { autoActivateFromIr, autoDesignateIr, tickIrGames } from "../rosterStatus";

/**
 * Share of in-season trade activity by distance from the deadline, derived
 * from nflverse trades.csv 2018-2025 (docs/nfl-reference.md §1.3b, n=128):
 * deadline week ~40%, the week before ~18%, then a fast falloff into a
 * September floor of ~3-4% per week. Index = weeks until the deadline.
 */
const TRADE_WEEK_WEIGHTS = [0.40, 0.18, 0.11, 0.07, 0.06, 0.05, 0.045, 0.04, 0.035];

/**
 * Week-by-week engine.
 *
 * One entry point — `advance(state)` — moves the franchise forward by exactly
 * one step, whatever that step happens to be for the current phase. Every
 * transition the game can make is reachable from it, so there is no state the
 * UI can get into with no way out.
 */

export function startRegularSeason(state: GameState): void {
  const rng = new Rng(state.rngState);
  state.games = generateSchedule(state, rng);
  state.phase = "regular";
  state.week = 1;
  state.playoffs = null;
  refreshDepthCharts(state);
  applyCpuIrAndFill(state);
  state.rngState = rng.state;
  state.log.push({
    season: state.season, week: 1, kind: "system",
    text: `The ${state.season} season is underway.`,
  });
}

/** Simulate every unplayed game in the current week. */
export function simulateWeek(state: GameState): void {
  const rng = new Rng(state.rngState);
  refreshDepthCharts(state);

  const games = state.games.filter(
    (g) => g.season === state.season && g.week === state.week && !g.played && g.playoffRound === null
  );

  // Who was fit at kickoff, so anything that turns serious during the games can
  // be charged against the player's durability afterwards.
  const healthyBefore = healthySet(state);

  for (const g of games) {
    const result = simulateGame(state, g, rng);
    g.homeScore = result.homeScore;
    g.awayScore = result.awayScore;
    g.boxScore = result.box;
    g.played = true;
    applyGameStats(state, g);
    recordGame(state, g);
  }

  // Log the user's result prominently.
  const userGame = games.find(
    (g) => g.homeId === state.userTeamId || g.awayId === state.userTeamId
  );
  if (userGame) {
    const isHome = userGame.homeId === state.userTeamId;
    const us = isHome ? userGame.homeScore : userGame.awayScore;
    const them = isHome ? userGame.awayScore : userGame.homeScore;
    const opp = state.teams[isHome ? userGame.awayId : userGame.homeId];
    const verb = us > them ? "beat" : us < them ? "lost to" : "tied";
    state.log.push({
      season: state.season, week: state.week, kind: "result",
      text: `Week ${state.week}: You ${verb} ${opp.city} ${opp.name} ${us}-${them}`,
    });
  }

  // Heal first: everyone carrying an injury has now missed this week's game.
  // Then take the durability hit for anything serious that happened in it, and
  // only then roll the week's non-contact injuries — which cost their full
  // stated duration because nothing decrements them again until next week.
  applyGameWear(state, healthyBefore, rng);
  healWeek(state);
  rollWeeklyInjuries(state, games, rng);
  const played = new Set<number>();
  for (const g of games) {
    played.add(g.homeId);
    played.add(g.awayId);
  }
  applyCpuIrAndFill(state, played);

  // The phones stay on until the deadline, but September is quiet and the
  // deadline week is a frenzy: real in-season trades put ~3-4% of the year's
  // activity in each of weeks 1-4 and ~40% in the deadline week itself
  // (docs/nfl-reference.md §1.3b, nflverse trades.csv 2018-2025, n=128).
  // Attempt volume follows that shape; total in-season volume is unchanged.
  //
  // The whole trade block runs on a CHILD stream from one parent draw, so the
  // week's attempt count can never move the season's RNG stream — same
  // pattern as generateDraftClass, for the same reason.
  if (state.week <= TRADE_DEADLINE_WEEK) {
    const tradeRng = new Rng(rng.int(1, 0x7ffffffe));
    const d = TRADE_DEADLINE_WEEK - state.week; // weeks until the deadline
    const weight = TRADE_WEEK_WEIGHTS[Math.min(d, TRADE_WEEK_WEIGHTS.length - 1)];
    // 185 total weekly attempts across the window lands on the real ~16
    // in-season trades a year now that every in-season proposal is a player
    // deal (player deals clear ~2x as often per attempt as pick swaps did).
    runCpuTrades(state, tradeRng, Math.max(3, Math.round(185 * weight)));
    // A GM's phone follows the same calendar: an offer most weeks was noise.
    if (tradeRng.next() < Math.min(1, 3.6 * weight)) {
      generateUserOffers(state, tradeRng, 1);
    }
  } else if (state.week === TRADE_DEADLINE_WEEK + 1) {
    state.tradeOffers = [];
    state.log.push({
      season: state.season, week: state.week, kind: "system",
      text: "The trade deadline has passed.",
    });
  }

  state.rngState = rng.state;
}

/**
 * Advance the franchise one step. Returns a short description of what happened
 * so the UI can surface it without re-deriving the phase.
 */
export function advance(state: GameState): string {
  switch (state.phase) {
    case "preseason": {
      startRegularSeason(state);
      return `${state.season} season started`;
    }

    case "regular": {
      simulateWeek(state);
      if (state.week >= REGULAR_SEASON_WEEKS) {
        state.phase = "playoffs";
        state.playoffs = initPlayoffs(state);
        state.week = 19;
        return "Regular season complete — playoff field set";
      }
      state.week += 1;
      return `Week ${state.week - 1} complete`;
    }

    case "playoffs": {
      const rng = new Rng(state.rngState);
      const before = state.playoffs?.round;
      simulatePlayoffRound(state, rng);
      state.rngState = rng.state;

      if (state.playoffs?.complete) {
        state.phase = "offseason-recap";
        return "Champion crowned";
      }
      state.week += 1;
      return `${before} round complete`;
    }

    default:
      // Offseason phases are driven by lib/core/offseason.
      return "";
  }
}

/** Games for a given week, sorted so the user's game is first. */
export function weekGames(state: GameState, week = state.week) {
  return state.games
    .filter((g) => g.season === state.season && g.week === week)
    .sort((a, b) => {
      const aUser = a.homeId === state.userTeamId || a.awayId === state.userTeamId ? 0 : 1;
      const bUser = b.homeId === state.userTeamId || b.awayId === state.userTeamId ? 0 : 1;
      return aUser - bUser || a.id - b.id;
    });
}

export function userNextGame(state: GameState) {
  return state.games.find(
    (g) =>
      g.season === state.season &&
      !g.played &&
      (g.homeId === state.userTeamId || g.awayId === state.userTeamId)
  );
}

export function isOnBye(state: GameState, teamId: number, week = state.week): boolean {
  if (state.phase !== "regular") return false;
  return !state.games.some(
    (g) => g.season === state.season && g.week === week && (g.homeId === teamId || g.awayId === teamId)
  );
}

export function injuredPlayers(state: GameState, teamId: number): Player[] {
  return state.players
    .filter((p) => p.teamId === teamId && p.injuryWeeks > 0 && !p.retired && p.status !== "ir" && p.status !== "ps")
    .sort((a, b) => b.injuryWeeks - a.injuryWeeks);
}

function applyCpuIrAndFill(state: GameState, played?: Set<number>): void {
  autoDesignateIr(state);
  if (played) tickIrGames(state, played);
  autoActivateFromIr(state, (teamId) => freeActiveSlot(state, teamId));
}
