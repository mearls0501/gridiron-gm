import { Rng } from "../rng";
import { simulateGame } from "../sim/game";
import {
  Conference, Game, GameState, PlayoffRound, PlayoffSeed, PlayoffState,
} from "../types";
import { computeSeeds } from "./standings";
import { FRANCHISES } from "../names";
import { makeConditions } from "../weather";
import { applyGameStats } from "./stats";
import { recordGame } from "./records";
import { applyGameWear, healWeek, healthySet } from "./injuries";
import { fillCpuIrReplacements } from "../irFill";
import { freeActiveSlot } from "../offseason/contracts";
import { autoActivateFromIr, autoDesignateIr, tickIrGames } from "../rosterStatus";
import { clearInactives, declareGamedayInactives } from "../inactives";
import { clearCallSheets, userSimOpts } from "../callSheet";
import { resolveWaivers } from "../waivers";

/**
 * Postseason.
 *
 * Bracket rules, all asserted by the verification harness:
 *   - 7 seeds per conference; the 1 seed has a first-round bye
 *   - each round RESEEDS: the best remaining seed always plays the WORST
 *     remaining seed (the old build sorted ascending and matched 1-vs-2)
 *   - the higher seed hosts
 *   - playoff games cannot end tied — overtime repeats until someone wins
 */

const ROUND_ORDER: PlayoffRound[] = ["WC", "DIV", "CONF", "SB"];

export function roundLabel(r: PlayoffRound): string {
  switch (r) {
    case "WC": return "Wild Card";
    case "DIV": return "Divisional";
    case "CONF": return "Conference Championship";
    case "SB": return "Championship";
  }
}

export function playoffWeekFor(round: PlayoffRound): number {
  return 18 + ROUND_ORDER.indexOf(round) + 1; // 19..22
}

export function initPlayoffs(state: GameState): PlayoffState {
  const seeds = computeSeeds(state, state.season);
  return { seeds, round: "WC", complete: false, championId: null };
}

function seedOf(ps: PlayoffState, teamId: number): number {
  return ps.seeds.find((s) => s.teamId === teamId)?.seed ?? 99;
}

/** Teams still alive in a conference, ordered best seed first. */
export function survivors(state: GameState, conf: Conference): number[] {
  const ps = state.playoffs!;
  const eliminated = new Set<number>();

  for (const g of state.games) {
    if (g.season !== state.season || g.playoffRound === null || !g.played) continue;
    const loser = g.homeScore > g.awayScore ? g.awayId : g.homeId;
    eliminated.add(loser);
  }

  return ps.seeds
    .filter((s) => s.conference === conf && !eliminated.has(s.teamId))
    .sort((a, b) => a.seed - b.seed)
    .map((s) => s.teamId);
}

/** Build the matchups for the current round. Higher seed hosts. */
export function buildRoundGames(state: GameState): Game[] {
  const ps = state.playoffs!;
  const games: Game[] = [];
  const week = playoffWeekFor(ps.round);
  const rng = new Rng(state.rngState);

  const makeGame = (homeId: number, awayId: number): Game => ({
    id: state.nextGameId++,
    season: state.season,
    week,
    homeId,
    awayId,
    played: false,
    homeScore: 0,
    awayScore: 0,
    playoffRound: ps.round,
    boxScore: null,
    // January football: the championship is at a neutral warm-weather site.
    conditions: makeConditions(
      ps.round === "SB" ? "dome" : FRANCHISES[homeId].climate,
      Math.min(18, week), 7, 7, rng
    ),
  });

  if (ps.round === "SB") {
    const afc = survivors(state, "AFC");
    const nfc = survivors(state, "NFC");
    if (afc.length !== 1 || nfc.length !== 1) return [];
    // Neutral site; the better seed is nominally home.
    const a = afc[0];
    const n = nfc[0];
    const aSeed = seedOf(ps, a);
    const nSeed = seedOf(ps, n);
    games.push(aSeed <= nSeed ? makeGame(a, n) : makeGame(n, a));
    return games;
  }

  for (const conf of ["AFC", "NFC"] as Conference[]) {
    let alive = survivors(state, conf);

    if (ps.round === "WC") {
      // 1 seed rests. 2v7, 3v6, 4v5.
      alive = alive.slice(1);
    }

    // RESEED: best vs worst, working inward.
    let lo = 0;
    let hi = alive.length - 1;
    while (lo < hi) {
      games.push(makeGame(alive[lo], alive[hi]));
      lo++;
      hi--;
    }
  }

  return games;
}

export function simulatePlayoffRound(state: GameState, rng: Rng): void {
  resolveWaivers(state);
  const ps = state.playoffs;
  if (!ps || ps.complete) return;

  let games = state.games.filter(
    (g) => g.season === state.season && g.playoffRound === ps.round
  );

  if (games.length === 0) {
    games = buildRoundGames(state);
    state.games.push(...games);
  }

  // The postseason used to have neither injuries nor healing: nobody got hurt
  // in January and nobody recovered between week 18 and the final.
  const healthyBefore = healthySet(state);

  const dressing = new Set<number>();
  for (const g of games) {
    if (g.played) continue;
    dressing.add(g.homeId);
    dressing.add(g.awayId);
  }
  declareGamedayInactives(state, dressing);

  for (const g of games) {
    if (g.played) continue;

    // A replayed game must not leave its injuries or its news behind. Snapshot
    // both, and roll back before each retry — otherwise a tie in the divisional
    // round quietly maimed a roster with games that never happened.
    const snapshot = new Map<number, { weeks: number; desc: string | null }>();
    for (const p of state.players) snapshot.set(p.id, { weeks: p.injuryWeeks, desc: p.injuryDesc });
    const logMark = state.log.length;
    const restore = () => {
      for (const p of state.players) {
        const s0 = snapshot.get(p.id);
        if (s0) { p.injuryWeeks = s0.weeks; p.injuryDesc = s0.desc; }
      }
      state.log.length = logMark;
    };

    let result = simulateGame(state, g, rng, userSimOpts(state, g));

    // Playoff games cannot tie. Replay until decided — the old build threw here
    // and deadlocked the bracket with no recovery path.
    let guard = 0;
    while (result.homeScore === result.awayScore && guard++ < 20) {
      restore();
      result = simulateGame(state, g, rng, userSimOpts(state, g));
    }
    if (result.homeScore === result.awayScore) {
      // Astronomically unlikely; break the tie deterministically by seed.
      const hs = seedOf(ps, g.homeId);
      const as = seedOf(ps, g.awayId);
      if (hs <= as) result.homeScore += 3;
      else result.awayScore += 3;
    }

    g.homeScore = result.homeScore;
    g.awayScore = result.awayScore;
    g.boxScore = result.box;
    g.played = true;
    applyGameStats(state, g);
    recordGame(state, g);

    const winner = g.homeScore > g.awayScore ? g.homeId : g.awayId;
    const loser = g.homeScore > g.awayScore ? g.awayId : g.homeId;
    state.log.push({
      season: state.season,
      week: g.week,
      kind: "result",
      text: `${roundLabel(ps.round)}: ${state.teams[winner].name} beat ${state.teams[loser].name} ${Math.max(g.homeScore, g.awayScore)}-${Math.min(g.homeScore, g.awayScore)}`,
    });
  }

  // A postseason round is a week: charge the wear, then heal one week. No new
  // non-contact injuries — only fourteen clubs are playing and the rest of the
  // league is already home.
  applyGameWear(state, healthyBefore, rng);
  healWeek(state);
  const played = new Set<number>();
  for (const g of games) {
    if (!g.played) continue;
    played.add(g.homeId);
    played.add(g.awayId);
  }
  const fillRng = new Rng(rng.int(1, 0x7ffffffe));
  autoDesignateIr(state);
  fillCpuIrReplacements(state, fillRng);
  tickIrGames(state, played);
  autoActivateFromIr(state, (teamId) => freeActiveSlot(state, teamId));
  clearInactives(state);
  clearCallSheets(state);

  // Advance the bracket.
  if (ps.round === "SB") {
    const final = games[0];
    if (final && final.played) {
      ps.championId = final.homeScore > final.awayScore ? final.homeId : final.awayId;
      ps.complete = true;
      const t = state.teams[ps.championId];
      state.log.push({
        season: state.season, week: final.week, kind: "milestone",
        text: `${t.city} ${t.name} win the championship!`,
      });
    }
    return;
  }

  const idx = ROUND_ORDER.indexOf(ps.round);
  ps.round = ROUND_ORDER[idx + 1];
}

export function playoffGames(state: GameState, round?: PlayoffRound): Game[] {
  return state.games.filter(
    (g) =>
      g.season === state.season &&
      g.playoffRound !== null &&
      (round === undefined || g.playoffRound === round)
  );
}

export function bracketRounds(state: GameState): { round: PlayoffRound; games: Game[] }[] {
  return ROUND_ORDER.map((r) => ({ round: r, games: playoffGames(state, r) }));
}

export function seedsFor(state: GameState, conf: Conference): PlayoffSeed[] {
  if (!state.playoffs) return [];
  return state.playoffs.seeds
    .filter((s) => s.conference === conf)
    .sort((a, b) => a.seed - b.seed);
}
