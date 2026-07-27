import { GameState, TeamRecord, Conference, PlayoffSeed } from "../types";
import { computeRecords, winPct } from "../select";
import { DIVISIONS } from "../names";

/**
 * Standings and playoff seeding.
 *
 * Seeding is computed from actual game results every time it is asked for.
 * There is no cached standings table that can drift out of sync — the old build
 * seeded a zeroed table at the season rollover, never updated it, and every
 * tiebreak fell through to a coin flip.
 */

export interface SortedTeam {
  rec: TeamRecord;
  pct: number;
}

function headToHead(state: GameState, a: number, b: number, season: number): number {
  let aw = 0;
  let bw = 0;
  for (const g of state.games) {
    if (g.season !== season || !g.played || g.playoffRound !== null) continue;
    const involves =
      (g.homeId === a && g.awayId === b) || (g.homeId === b && g.awayId === a);
    if (!involves) continue;
    if (g.homeScore === g.awayScore) continue;
    const winner = g.homeScore > g.awayScore ? g.homeId : g.awayId;
    if (winner === a) aw++;
    else bw++;
  }
  return aw - bw;
}

function divPct(r: TeamRecord): number {
  const n = r.divW + r.divL + r.divT;
  return n === 0 ? 0 : (r.divW + r.divT * 0.5) / n;
}

function confPct(r: TeamRecord): number {
  const n = r.confW + r.confL + r.confT;
  return n === 0 ? 0 : (r.confW + r.confT * 0.5) / n;
}

/**
 * NFL-style tiebreakers, applied in order:
 * win pct -> head to head -> division record -> conference record -> point
 * differential -> points for -> team id (stable, never random).
 */
export function compareTeams(
  state: GameState, a: TeamRecord, b: TeamRecord, season: number, sameDivision: boolean
): number {
  return compareTeamsCore(state, a, b, season, sameDivision) || (a.teamId - b.teamId);
}

/**
 * The tiebreak chain WITHOUT the team-id fallback — returns 0 when two teams
 * are genuinely indistinguishable. Standings need a stable final answer, so
 * `compareTeams` appends the id. The draft order must not: sorting descending
 * meant team 0 lost every single tie for twenty years running, which is a real
 * (if small) structural penalty on one franchise.
 */
export function compareTeamsCore(
  state: GameState, a: TeamRecord, b: TeamRecord, season: number, sameDivision: boolean
): number {
  const pa = winPct(a);
  const pb = winPct(b);
  if (pa !== pb) return pb - pa;

  const h2h = headToHead(state, a.teamId, b.teamId, season);
  if (h2h !== 0) return -h2h;

  if (sameDivision) {
    const da = divPct(a);
    const db = divPct(b);
    if (da !== db) return db - da;
  }

  const ca = confPct(a);
  const cb = confPct(b);
  if (ca !== cb) return cb - ca;

  const diffA = a.pf - a.pa;
  const diffB = b.pf - b.pa;
  if (diffA !== diffB) return diffB - diffA;

  if (a.pf !== b.pf) return b.pf - a.pf;

  return 0;
}

/**
 * Deterministic, season-varying tiebreak. Never Math.random(), but it must not
 * be a constant either or the same franchise is punished every year.
 */
function coinToss(season: number, teamId: number): number {
  let h = (Math.imul(season, 2654435761) + Math.imul(teamId + 1, 40503)) >>> 0;
  h ^= h >>> 15;
  h = Math.imul(h, 2246822519);
  h ^= h >>> 13;
  return h >>> 0;
}

export function divisionStandings(
  state: GameState, division: string, season = state.season
): TeamRecord[] {
  const recs = computeRecords(state, season);
  const teams = state.teams.filter((t) => t.division === division);
  return teams
    .map((t) => recs.get(t.id)!)
    .sort((a, b) => compareTeams(state, a, b, season, true));
}

export function conferenceStandings(
  state: GameState, conf: Conference, season = state.season
): TeamRecord[] {
  const recs = computeRecords(state, season);
  return state.teams
    .filter((t) => t.conference === conf)
    .map((t) => recs.get(t.id)!)
    .sort((a, b) => compareTeams(state, a, b, season, false));
}

export function leagueStandings(state: GameState, season = state.season): TeamRecord[] {
  const recs = computeRecords(state, season);
  return state.teams
    .map((t) => recs.get(t.id)!)
    .sort((a, b) => compareTeams(state, a, b, season, false));
}

/**
 * Seven seeds per conference: four division winners ordered by record, then the
 * three best remaining teams.
 */
export function computeSeeds(state: GameState, season = state.season): PlayoffSeed[] {
  const out: PlayoffSeed[] = [];

  for (const conf of ["AFC", "NFC"] as Conference[]) {
    const divs = DIVISIONS.filter((d) => d.startsWith(conf));
    const winners: TeamRecord[] = [];
    const winnerIds = new Set<number>();

    for (const d of divs) {
      const s = divisionStandings(state, d, season);
      if (s.length > 0) {
        winners.push(s[0]);
        winnerIds.add(s[0].teamId);
      }
    }
    winners.sort((a, b) => compareTeams(state, a, b, season, false));

    const rest = conferenceStandings(state, conf, season).filter(
      (r) => !winnerIds.has(r.teamId)
    );
    const wildcards = rest.slice(0, 3);

    [...winners, ...wildcards].forEach((r, i) => {
      out.push({ teamId: r.teamId, seed: i + 1, conference: conf });
    });
  }

  return out;
}

/** Reverse standings order — worst team picks first. */
export function draftOrder(state: GameState, season: number): number[] {
  const champion = state.history.find((h) => h.season === season)?.championId ?? null;
  const runnerUp = state.history.find((h) => h.season === season)?.runnerUpId ?? null;

  const ordered = leagueStandings(state, season)
    .slice()
    .sort(
      (a, b) =>
        compareTeamsCore(state, b, a, season, false) || // ascending = worst first
        coinToss(season, a.teamId) - coinToss(season, b.teamId)
    );

  const ids = ordered.map((r) => r.teamId);

  // The Super Bowl participants always pick last, regardless of record.
  const withoutFinalists = ids.filter((id) => id !== champion && id !== runnerUp);
  if (runnerUp != null) withoutFinalists.push(runnerUp);
  if (champion != null) withoutFinalists.push(champion);
  return withoutFinalists;
}
