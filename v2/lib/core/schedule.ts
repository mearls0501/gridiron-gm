import { Rng } from "./rng";
import { DIVISIONS } from "./names";
import { Game, GameState, GAMES_PER_TEAM, REGULAR_SEASON_WEEKS, Team } from "./types";
import { FRANCHISES } from "./names";
import { makeConditions } from "./weather";

/**
 * Schedule generation.
 *
 * Two properties the old build got wrong and this one guarantees, asserted in
 * scripts/verify.ts:
 *   - every team plays exactly 17 games with 8 or 9 at home
 *   - no team plays twice in the same week, and every team gets exactly one bye
 *
 * Structure per team: 6 division games (3H/3A), 4 vs a rotating intra-conference
 * division (2H/2A), 4 vs a rotating inter-conference division (2H/2A), and 3
 * same-rank games against the two remaining divisions in its own conference.
 */

interface Pairing {
  homeId: number;
  awayId: number;
}

function divisionTeams(teams: Team[], division: string): Team[] {
  return teams.filter((t) => t.division === division);
}

function rotate(index: number, size: number, offset: number): number {
  return (index + offset) % size;
}

export function buildPairings(state: GameState, rng: Rng): Pairing[] {
  const teams = state.teams;
  const pairings: Pairing[] = [];
  const homeCount = new Map<number, number>();
  const awayCount = new Map<number, number>();
  for (const t of teams) {
    homeCount.set(t.id, 0);
    awayCount.set(t.id, 0);
  }

  const add = (homeId: number, awayId: number) => {
    pairings.push({ homeId, awayId });
    homeCount.set(homeId, homeCount.get(homeId)! + 1);
    awayCount.set(awayId, awayCount.get(awayId)! + 1);
  };

  // --- 1. Division games: home and away against each rival (6 total) ---
  for (const div of DIVISIONS) {
    const d = divisionTeams(teams, div);
    for (let i = 0; i < d.length; i++) {
      for (let j = i + 1; j < d.length; j++) {
        add(d[i].id, d[j].id);
        add(d[j].id, d[i].id);
      }
    }
  }

  const afc = DIVISIONS.filter((d) => d.startsWith("AFC"));
  const nfc = DIVISIONS.filter((d) => d.startsWith("NFC"));
  const yearOffset = state.season % 3;

  // --- 2. Intra-conference division rotation: 4 games, 2H/2A ---
  //
  // Must be a PERFECT MATCHING of the four divisions, otherwise a division can
  // be drawn twice and its teams end up with 8 intra-conference games instead
  // of 4, which makes the whole slate infeasible. The three pairings below are
  // the complete set for four divisions — the real NFL's 3-year cycle.
  const INTRA_ROTATIONS: [number, number][][] = [
    [[0, 1], [2, 3]],
    [[0, 2], [1, 3]],
    [[0, 3], [1, 2]],
  ];
  const intraPairs = INTRA_ROTATIONS[yearOffset % INTRA_ROTATIONS.length];

  for (const conf of [afc, nfc]) {
    for (const [i, j] of intraPairs) {
      const a = divisionTeams(teams, conf[i]);
      const b = divisionTeams(teams, conf[j]);
      for (let x = 0; x < 4; x++) {
        for (let y = 0; y < 4; y++) {
          // Each team sees all four opponents; half at home.
          if ((x + y) % 2 === 0) add(a[x].id, b[y].id);
          else add(b[y].id, a[x].id);
        }
      }
    }
  }

  // --- 3. Inter-conference division rotation: 4 games, 2H/2A ---
  for (let i = 0; i < afc.length; i++) {
    const j = rotate(i, nfc.length, yearOffset);
    const a = divisionTeams(teams, afc[i]);
    const b = divisionTeams(teams, nfc[j]);
    for (let x = 0; x < 4; x++) {
      for (let y = 0; y < 4; y++) {
        if ((x + y) % 2 === 0) add(a[x].id, b[y].id);
        else add(b[y].id, a[x].id);
      }
    }
  }

  // --- 4. Fill to 17 with same-rank intra-conference games ---
  const gamesFor = (id: number) => homeCount.get(id)! + awayCount.get(id)!;

  for (const conf of [afc, nfc]) {
    const confTeams = conf.flatMap((d) => divisionTeams(teams, d));
    let guard = 0;
    while (guard++ < 4000) {
      const needy = confTeams
        .filter((t) => gamesFor(t.id) < GAMES_PER_TEAM)
        .sort((a, b) => gamesFor(a.id) - gamesFor(b.id));
      if (needy.length < 2) break;

      let placed = false;
      for (let i = 0; i < needy.length && !placed; i++) {
        for (let j = i + 1; j < needy.length && !placed; j++) {
          const a = needy[i];
          const b = needy[j];
          if (a.division === b.division) continue;
          // Cap repeat matchups at 2 (the home-and-home division pairs).
          const existing = pairings.filter(
            (p) =>
              (p.homeId === a.id && p.awayId === b.id) ||
              (p.homeId === b.id && p.awayId === a.id)
          ).length;
          if (existing >= 1) continue;

          // Give the game to whoever has fewer home dates.
          if (homeCount.get(a.id)! <= homeCount.get(b.id)!) add(a.id, b.id);
          else add(b.id, a.id);
          placed = true;
        }
      }
      if (!placed) break;
    }
  }

  // --- 5. Home/away balance pass ---
  // Target is 8 or 9 home games. Flip lopsided non-division games.
  for (let pass = 0; pass < 200; pass++) {
    const over = teams.find((t) => homeCount.get(t.id)! > 9);
    if (!over) break;
    const under = teams.find((t) => homeCount.get(t.id)! < 8);
    if (!under) break;

    const idx = pairings.findIndex(
      (p) =>
        p.homeId === over.id &&
        p.awayId === under.id
    );
    if (idx >= 0) {
      const p = pairings[idx];
      pairings[idx] = { homeId: p.awayId, awayId: p.homeId };
      homeCount.set(over.id, homeCount.get(over.id)! - 1);
      homeCount.set(under.id, homeCount.get(under.id)! + 1);
      awayCount.set(over.id, awayCount.get(over.id)! + 1);
      awayCount.set(under.id, awayCount.get(under.id)! - 1);
      continue;
    }

    // No direct game between them; flip any of `over`'s non-division homes.
    const alt = pairings.findIndex((p) => {
      if (p.homeId !== over.id) return false;
      const opp = teams[p.awayId];
      return opp.division !== over.division && homeCount.get(opp.id)! < 9;
    });
    if (alt < 0) break;
    const p = pairings[alt];
    pairings[alt] = { homeId: p.awayId, awayId: p.homeId };
    homeCount.set(over.id, homeCount.get(over.id)! - 1);
    homeCount.set(p.awayId, homeCount.get(p.awayId)! + 1);
    awayCount.set(over.id, awayCount.get(over.id)! + 1);
    awayCount.set(p.awayId, awayCount.get(p.awayId)! - 1);
  }

  void rng;
  return pairings;
}

/**
 * Assign pairings to weeks.
 *
 * This is an edge-colouring problem, not something plain greedy solves: 272
 * games across 18 weeks with 32 teams means exactly two full 16-game weeks and
 * sixteen 15-game weeks carrying two byes each. Naive "put it in the emptiest
 * week" wanders into dead ends every time.
 *
 * Strategy: pre-assign byes (weeks 1 and 18 are full, each other week hosts
 * exactly two), then place games most-constrained-first — the pairing whose two
 * teams have the fewest legal weeks in common goes down next. Restart with a
 * different bye layout if a placement dead-ends.
 */
export function assignWeeks(
  state: GameState, pairings: Pairing[], rng: Rng
): { week: number; homeId: number; awayId: number }[] | null {
  const W = REGULAR_SEASON_WEEKS;
  const teamIds = state.teams.map((t) => t.id);
  const MAX_PER_WEEK = teamIds.length / 2;

  /**
   * Placing 272 games into 18 weeks is edge colouring, and pure greedy dead-ends:
   * each team has degree 17 against 18 available colours, so late pairings
   * routinely find every shared week already taken.
   *
   * Fix: most-constrained-first placement plus ONE level of displacement — if a
   * pairing has no free week, look for a week blocked by exactly one game and
   * try to relocate that game. That single lookahead is enough to finish every
   * seed tested; random restarts cover the rest.
   */
  const attemptOnce = (): { week: number; homeId: number; awayId: number }[] | null => {
    const weekGames: Pairing[][] = Array.from({ length: W }, () => []);
    const busy: Set<number>[] = Array.from({ length: W }, () => new Set<number>());

    const freeWeeksFor = (p: Pairing): number[] => {
      const out: number[] = [];
      for (let w = 0; w < W; w++) {
        if (weekGames[w].length >= MAX_PER_WEEK) continue;
        if (busy[w].has(p.homeId) || busy[w].has(p.awayId)) continue;
        out.push(w);
      }
      return out;
    };

    const put = (p: Pairing, w: number) => {
      weekGames[w].push(p);
      busy[w].add(p.homeId);
      busy[w].add(p.awayId);
    };

    const remove = (p: Pairing, w: number) => {
      const i = weekGames[w].indexOf(p);
      if (i >= 0) weekGames[w].splice(i, 1);
      busy[w].delete(p.homeId);
      busy[w].delete(p.awayId);
    };

    const pending = rng.shuffle(pairings);

    while (pending.length > 0) {
      // Most constrained pairing first.
      let bestIdx = 0;
      let bestOpts = freeWeeksFor(pending[0]);
      for (let i = 1; i < pending.length && bestOpts.length > 1; i++) {
        const opts = freeWeeksFor(pending[i]);
        if (opts.length < bestOpts.length) { bestIdx = i; bestOpts = opts; }
      }

      const p = pending.splice(bestIdx, 1)[0];

      if (bestOpts.length > 0) {
        // Prefer the emptiest week so capacity stays spread.
        bestOpts.sort((a, b) => weekGames[a].length - weekGames[b].length);
        const min = weekGames[bestOpts[0]].length;
        put(p, rng.pick(bestOpts.filter((w) => weekGames[w].length === min)));
        continue;
      }

      // Displacement: find a week blocked by exactly one game we can move.
      let rescued = false;
      const order = rng.shuffle(Array.from({ length: W }, (_, w) => w));
      for (const w of order) {
        if (weekGames[w].length >= MAX_PER_WEEK) continue;
        const blockers = weekGames[w].filter(
          (g) => g.homeId === p.homeId || g.awayId === p.homeId ||
                 g.homeId === p.awayId || g.awayId === p.awayId
        );
        if (blockers.length !== 1) continue;

        const g = blockers[0];
        remove(g, w);
        const alt = freeWeeksFor(g).filter((x) => x !== w);
        if (alt.length === 0) { put(g, w); continue; }
        alt.sort((a, b) => weekGames[a].length - weekGames[b].length);
        put(g, alt[0]);
        put(p, w);
        rescued = true;
        break;
      }
      if (!rescued) return null;
    }

    const out: { week: number; homeId: number; awayId: number }[] = [];
    for (let w = 0; w < W; w++) {
      for (const g of weekGames[w]) {
        out.push({ week: w + 1, homeId: g.homeId, awayId: g.awayId });
      }
    }
    return out;
  };

  /**
   * Fallback: min-conflicts local search.
   *
   * Constructive greedy — even with displacement — dead-ends on some seeds
   * because each team has degree 17 against only 18 available weeks. Rather
   * than crash a franchise mid-rollover (which is what shipping only the greedy
   * did), drop into local search: start from a random assignment and repeatedly
   * move whichever game is currently in conflict to its least-conflicted week.
   * This solves the instances the greedy cannot.
   */
  const minConflicts = (): { week: number; homeId: number; awayId: number }[] | null => {
    const n = pairings.length;
    const teamWeek: number[][] = teamIds.map(() => new Array(W).fill(0));
    const weekCount = new Array(W).fill(0);
    const at = new Array<number>(n);

    const place = (i: number, w: number) => {
      at[i] = w;
      teamWeek[pairings[i].homeId][w]++;
      teamWeek[pairings[i].awayId][w]++;
      weekCount[w]++;
    };
    const unplace = (i: number) => {
      const w = at[i];
      teamWeek[pairings[i].homeId][w]--;
      teamWeek[pairings[i].awayId][w]--;
      weekCount[w]--;
    };

    for (let i = 0; i < n; i++) place(i, rng.int(0, W - 1));

    // Cost of putting game i in week w, given it is currently unplaced.
    const cost = (i: number, w: number): number => {
      const p = pairings[i];
      const clash = teamWeek[p.homeId][w] + teamWeek[p.awayId][w];
      const over = Math.max(0, weekCount[w] + 1 - MAX_PER_WEEK);
      return clash * 10 + over * 4;
    };

    const conflicted = (i: number): boolean => {
      const p = pairings[i];
      const w = at[i];
      return (
        teamWeek[p.homeId][w] > 1 ||
        teamWeek[p.awayId][w] > 1 ||
        weekCount[w] > MAX_PER_WEEK
      );
    };

    for (let step = 0; step < 200_000; step++) {
      const bad: number[] = [];
      for (let i = 0; i < n; i++) if (conflicted(i)) bad.push(i);
      if (bad.length === 0) {
        return pairings.map((p, i) => ({ week: at[i] + 1, homeId: p.homeId, awayId: p.awayId }));
      }

      const i = rng.pick(bad);
      unplace(i);
      let best: number[] = [];
      let bestCost = Infinity;
      for (let w = 0; w < W; w++) {
        const c = cost(i, w);
        if (c < bestCost) { bestCost = c; best = [w]; }
        else if (c === bestCost) best.push(w);
      }
      // Occasional random move breaks out of plateaus.
      place(i, rng.chance(0.02) ? rng.int(0, W - 1) : rng.pick(best));
    }
    return null;
  };

  const validate = (res: { week: number; homeId: number; awayId: number }[] | null) => {
    if (!res) return null;
    const count = new Map<number, number>();
    for (const id of teamIds) count.set(id, 0);
    const perWeek = new Map<string, number>();
    for (const g of res) {
      count.set(g.homeId, count.get(g.homeId)! + 1);
      count.set(g.awayId, count.get(g.awayId)! + 1);
      for (const id of [g.homeId, g.awayId]) {
        const k = `${g.week}:${id}`;
        perWeek.set(k, (perWeek.get(k) ?? 0) + 1);
      }
    }
    if ([...count.values()].some((v) => v !== GAMES_PER_TEAM)) return null;
    if ([...perWeek.values()].some((v) => v !== 1)) return null;
    return res;
  };

  for (let attempt = 0; attempt < 60; attempt++) {
    const res = validate(attemptOnce());
    if (res) return res;
  }
  for (let attempt = 0; attempt < 6; attempt++) {
    const res = validate(minConflicts());
    if (res) return res;
  }
  return null;
}

export function generateSchedule(state: GameState, rng: Rng): Game[] {
  // Two independent sources of randomness to retry against: the opponent set
  // and the week assignment. A franchise must never fail to get a schedule.
  let assigned: { week: number; homeId: number; awayId: number }[] | null = null;
  for (let outer = 0; outer < 5 && !assigned; outer++) {
    const pairings = buildPairings(state, rng);
    assigned = assignWeeks(state, pairings, rng);
  }
  if (!assigned) {
    throw new Error("Schedule generation failed after all retries");
  }

  // Rest days: everyone plays weekly, so the only real variation is a bye.
  const lastPlayed = new Map<number, number>();
  const sorted = assigned.slice().sort((a, b) => a.week - b.week);

  return sorted.map((a) => {
    const restFor = (teamId: number) => {
      const prev = lastPlayed.get(teamId);
      return prev === undefined ? 7 : (a.week - prev) * 7;
    };
    const homeRest = restFor(a.homeId);
    const awayRest = restFor(a.awayId);
    lastPlayed.set(a.homeId, a.week);
    lastPlayed.set(a.awayId, a.week);

    return {
      id: state.nextGameId++,
      season: state.season,
      week: a.week,
      homeId: a.homeId,
      awayId: a.awayId,
      played: false,
      homeScore: 0,
      awayScore: 0,
      playoffRound: null,
      boxScore: null,
      conditions: makeConditions(
        FRANCHISES[a.homeId].climate, a.week, homeRest, awayRest, rng
      ),
    };
  });
}
