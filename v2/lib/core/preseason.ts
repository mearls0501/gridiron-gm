import { Rng } from "./rng";
import { simulateGame } from "./sim/game";
import { refreshDepthCharts } from "./generate";
import { healWeek } from "./season/injuries";
import {
  CampLine, Game, GameState, PRESEASON_WEEKS, PreseasonGame, PreseasonPlan, PreseasonState,
} from "./types";

/**
 * Preseason games: three weeks in camp (`offseason-final`) before the cut to 53.
 * Design and Matt's decisions: `docs/preseason-games-design-2026-10-20.md`.
 *
 * - The games never enter `state.games`, so no season stat line, standings,
 *   record, milestone or harness total can count them. Only a compact result
 *   and a per-player camp line are kept, and both are wiped at kickoff.
 * - Every game draws from its own child stream keyed (seed, season, week,
 *   game). The parent `rngState` never moves.
 * - Injuries are real, at the engine's own per-snap rates, and a week passes
 *   after each preseason week (`healWeek`), as after a regular-season week.
 * - The camp nudge on the cut (packet B) is not here: who is cut is unchanged.
 */

/** CPU clubs' default: starters play one series. The user picks per game. */
export const CPU_PRESEASON_PLAN: PreseasonPlan = "series";

function preseasonRng(seed: number, season: number, week: number, slot: number): Rng {
  let h = seed >>> 0;
  h = Math.imul(h ^ season, 0x9e3779b9);
  h = Math.imul(h ^ (week + 1), 0x85ebca6b);
  const tag = "preseason";
  for (let i = 0; i < tag.length; i++) h = Math.imul(h ^ tag.charCodeAt(i), 0xc2b2ae35);
  h = Math.imul(h ^ (slot + 1), 0x85ebca6b);
  return new Rng((h >>> 0) || 0x9e3779b9);
}

/** This camp's preseason, created on first use. Null outside camp. */
export function preseasonFor(state: GameState): PreseasonState | null {
  if (state.phase !== "offseason-final" && state.phase !== "preseason") return null;
  const season = state.phase === "offseason-final" ? state.season + 1 : state.season;
  const ps = state.preseason;
  return ps && ps.season === season ? ps : null;
}

function ensurePreseason(state: GameState): PreseasonState {
  const season = state.season + 1;
  if (!state.preseason || state.preseason.season !== season) {
    state.preseason = {
      season, week: 0, games: [], camp: {},
      userPlan: state.preseason?.userPlan ?? CPU_PRESEASON_PLAN,
    };
  }
  return state.preseason;
}

/** Preseason weeks still to play this camp. 0 outside camp or once all three are done. */
export function preseasonWeeksLeft(state: GameState): number {
  if (state.phase !== "offseason-final") return 0;
  const played = state.preseason?.season === state.season + 1 ? state.preseason.week : 0;
  return Math.max(0, PRESEASON_WEEKS - played);
}

export function setUserPreseasonPlan(state: GameState, plan: PreseasonPlan): void {
  ensurePreseason(state).userPlan = plan;
}

/** Pair every club once, avoiding a rematch from an earlier preseason week when possible. */
function slate(state: GameState, ps: PreseasonState, week: number): [number, number][] {
  const rng = preseasonRng(state.seed, ps.season, week, 0);
  const met = new Set(ps.games.flatMap((g) => [`${g.homeId}:${g.awayId}`, `${g.awayId}:${g.homeId}`]));
  let best: [number, number][] = [];
  let bestRepeats = Infinity;
  for (let attempt = 0; attempt < 20; attempt++) {
    const ids = rng.shuffle(state.teams.map((t) => t.id));
    const pairs: [number, number][] = [];
    let repeats = 0;
    for (let i = 0; i + 1 < ids.length; i += 2) {
      pairs.push([ids[i], ids[i + 1]]);
      if (met.has(`${ids[i]}:${ids[i + 1]}`)) repeats++;
    }
    if (repeats < bestRepeats) { best = pairs; bestRepeats = repeats; }
    if (repeats === 0) break;
  }
  return best;
}

const CAMP_FIELDS = [
  "passAtt", "passCmp", "passYds", "passTd", "passInt", "rushAtt", "rushYds", "rushTd",
  "rec", "recYds", "recTd", "tackles", "sacks", "ints", "passDef", "fgm", "fga",
] as const;

function foldCampLines(ps: PreseasonState, game: Game): void {
  for (const row of game.boxScore?.players ?? []) {
    const line: CampLine = ps.camp[row.playerId] ?? {};
    const snaps = Math.round(row.snaps ?? 0);
    if (snaps) line.snaps = (line.snaps ?? 0) + snaps;
    for (const f of CAMP_FIELDS) {
      const v = row[f] ?? 0;
      if (v) line[f] = (line[f] ?? 0) + v;
    }
    if (Object.keys(line).length) ps.camp[row.playerId] = line;
  }
}

/**
 * Play the next preseason week: every club once. Starters play per plan (the
 * user's choice for the user's club, one series for everyone else), the
 * second unit to halftime, the third unit after. Returns a hub toast.
 */
export function playPreseasonWeek(state: GameState): string {
  if (state.phase !== "offseason-final") return "";
  const ps = ensurePreseason(state);
  if (ps.week >= PRESEASON_WEEKS) return "";
  const week = ps.week + 1;

  refreshDepthCharts(state);
  const pairs = slate(state, ps, week);
  pairs.forEach(([homeId, awayId], i) => {
    const game: Game = {
      id: -(week * 100 + i + 1),
      season: ps.season,
      week: 0,
      homeId,
      awayId,
      played: false,
      homeScore: 0,
      awayScore: 0,
      playoffRound: null,
      boxScore: null,
    };
    const plans: Record<number, PreseasonPlan> = {
      [homeId]: homeId === state.userTeamId ? ps.userPlan : CPU_PRESEASON_PLAN,
      [awayId]: awayId === state.userTeamId ? ps.userPlan : CPU_PRESEASON_PLAN,
    };
    const res = simulateGame(state, game, preseasonRng(state.seed, ps.season, week, i + 1), {
      exhibition: { plans },
    });
    game.boxScore = res.box;
    foldCampLines(ps, game);
    const result: PreseasonGame = {
      week, homeId, awayId, homeScore: res.homeScore, awayScore: res.awayScore,
    };
    ps.games.push(result);
  });
  healWeek(state);
  ps.week = week;

  const mine = ps.games.find((g) => g.week === week && (g.homeId === state.userTeamId || g.awayId === state.userTeamId));
  if (!mine) return `Preseason week ${week} played`;
  const home = mine.homeId === state.userTeamId;
  const us = home ? mine.homeScore : mine.awayScore;
  const them = home ? mine.awayScore : mine.homeScore;
  const opp = state.teams[home ? mine.awayId : mine.homeId].abbr;
  const word = us > them ? "beat" : us < them ? "lost to" : "tied";
  return `Preseason week ${week}: ${word} ${opp} ${us}-${them}`;
}
