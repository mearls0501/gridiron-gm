import {
  GameRecordKey, GAME_RECORD_KEYS, Game, GameState, Player, RecordBook,
  RecordEntry, SeasonStatLine, TeamRecordEntry,
} from "../types";
import { careerTotals } from "./stats";

/**
 * The record book.
 *
 * Split deliberately by what can and cannot be recomputed:
 *
 *   - SINGLE-GAME records are captured as games finish. Box scores only exist
 *     for the current season (past seasons are summarised), so a leaderboard
 *     derived at display time would silently forget every earlier year.
 *   - SEASON and CAREER records are derived on demand from each player's own
 *     stat lines, which are kept forever. Nothing to drift out of sync.
 */

const KEEP = 5;

export function blankRecordBook(): RecordBook {
  const game = {} as Record<GameRecordKey, RecordEntry[]>;
  for (const k of GAME_RECORD_KEYS) game[k] = [];
  return {
    game,
    team: { mostPoints: [], mostYards: [], biggestMargin: [] },
  };
}

function insert<T extends { value: number }>(list: T[], entry: T): void {
  list.push(entry);
  list.sort((a, b) => b.value - a.value);
  list.length = Math.min(list.length, KEEP);
}

/** Fold one finished game into the all-time single-game record lists. */
export function recordGame(state: GameState, game: Game): void {
  if (!game.boxScore) return;
  if (!state.records) state.records = blankRecordBook();

  const byId = new Map<number, Player>();
  for (const p of state.players) byId.set(p.id, p);

  for (const gs of game.boxScore.players) {
    const p = byId.get(gs.playerId);
    if (!p) continue;
    const raw = gs as unknown as Record<string, number>;

    for (const key of GAME_RECORD_KEYS) {
      const value = raw[key] ?? 0;
      if (value <= 0) continue;
      insert(state.records.game[key], {
        playerId: p.id,
        playerName: `${p.firstName} ${p.lastName}`,
        pos: p.pos,
        teamId: gs.teamId,
        season: game.season,
        week: game.week,
        value,
        detail: describe(key, gs as unknown as Record<string, unknown>),
      });
    }
  }

  const sides: [number, number, number][] = [
    [game.homeId, game.homeScore, game.boxScore.home.totalYards],
    [game.awayId, game.awayScore, game.boxScore.away.totalYards],
  ];
  const margin = Math.abs(game.homeScore - game.awayScore);
  const winner = game.homeScore >= game.awayScore ? game.homeId : game.awayId;

  for (const [teamId, points, yards] of sides) {
    const base = { teamId, season: game.season, week: game.week };
    insert(state.records.team.mostPoints, { ...base, value: points, detail: `${points} points` });
    insert(state.records.team.mostYards, { ...base, value: yards, detail: `${yards} total yards` });
  }
  insert(state.records.team.biggestMargin, {
    teamId: winner, season: game.season, week: game.week,
    value: margin,
    detail: `${Math.max(game.homeScore, game.awayScore)}-${Math.min(game.homeScore, game.awayScore)}`,
  });
}

function describe(key: GameRecordKey, gs: Record<string, unknown>): string {
  const n = (k: string) => (gs[k] as number) ?? 0;
  switch (key) {
    case "passYds": return `${n("passCmp")}/${n("passAtt")}, ${n("passYds")} yds, ${n("passTd")} TD`;
    case "passTd": return `${n("passTd")} TD, ${n("passYds")} yds`;
    case "rushYds": return `${n("rushAtt")} car, ${n("rushYds")} yds, ${n("rushTd")} TD`;
    case "rushTd": return `${n("rushTd")} TD on ${n("rushAtt")} carries`;
    case "recYds": return `${n("rec")} rec, ${n("recYds")} yds, ${n("recTd")} TD`;
    case "recTd": return `${n("recTd")} TD on ${n("rec")} catches`;
    case "rec": return `${n("rec")} rec, ${n("recYds")} yds`;
    case "tackles": return `${n("tackles")} tackles, ${n("tfl")} TFL`;
    case "sacks": return `${n("sacks")} sacks, ${n("tackles")} tackles`;
    case "ints": return `${n("ints")} INT, ${n("intYds")} return yards`;
    case "fgm": return `${n("fgm")}/${n("fga")} FG`;
    case "longFg": return `${n("longFg")} yards`;
  }
}

// ---------------------------------------------------------------------------
// Derived: season and career
// ---------------------------------------------------------------------------

export type CareerKey =
  | "passYds" | "passTd" | "rushYds" | "rushTd" | "recYds" | "recTd" | "rec"
  | "tackles" | "sacks" | "ints" | "fgm" | "games";

export const CAREER_KEYS: CareerKey[] = [
  "passYds", "passTd", "rushYds", "rushTd", "recYds", "recTd", "rec",
  "tackles", "sacks", "ints", "fgm", "games",
];

export const CAREER_LABEL: Record<CareerKey, string> = {
  passYds: "Passing yards", passTd: "Passing touchdowns",
  rushYds: "Rushing yards", rushTd: "Rushing touchdowns",
  recYds: "Receiving yards", recTd: "Receiving touchdowns",
  rec: "Receptions", tackles: "Tackles", sacks: "Sacks",
  ints: "Interceptions", fgm: "Field goals made", games: "Games played",
};

export interface LeaderEntry {
  player: Player;
  value: number;
  season?: number;
  teamId: number | null;
}

/** Best single SEASON in league history for a category. */
export function seasonRecords(
  state: GameState, key: CareerKey, limit = KEEP
): LeaderEntry[] {
  const rows: LeaderEntry[] = [];
  for (const p of state.players) {
    for (const line of p.stats) {
      const value = (line as unknown as Record<string, number>)[key] ?? 0;
      if (value <= 0) continue;
      rows.push({ player: p, value, season: line.season, teamId: line.teamId });
    }
  }
  rows.sort((a, b) => b.value - a.value || a.player.id - b.player.id);
  return rows.slice(0, limit);
}

/** Career totals across every season a player has recorded. */
export function careerRecords(
  state: GameState, key: CareerKey, limit = KEEP
): LeaderEntry[] {
  const rows: LeaderEntry[] = [];
  for (const p of state.players) {
    if (p.stats.length === 0) continue;
    const total = careerTotals(p);
    const value = (total as unknown as Record<string, number>)[key] ?? 0;
    if (value <= 0) continue;
    rows.push({ player: p, value, teamId: p.teamId });
  }
  rows.sort((a, b) => b.value - a.value || a.player.id - b.player.id);
  return rows.slice(0, limit);
}

/** Franchise-scoped version of the career list, for a team's own record page. */
export function franchiseCareerRecords(
  state: GameState, teamId: number, key: CareerKey, limit = KEEP
): LeaderEntry[] {
  const rows: LeaderEntry[] = [];
  for (const p of state.players) {
    let value = 0;
    let played = false;
    for (const line of p.stats) {
      if (line.teamId !== teamId) continue;
      played = true;
      value += (line as unknown as Record<string, number>)[key] ?? 0;
    }
    if (!played || value <= 0) continue;
    rows.push({ player: p, value, teamId });
  }
  rows.sort((a, b) => b.value - a.value || a.player.id - b.player.id);
  return rows.slice(0, limit);
}

// ---------------------------------------------------------------------------
// Team season aggregates
// ---------------------------------------------------------------------------

export interface TeamSeasonStats {
  teamId: number;
  games: number;
  pointsFor: number;
  pointsAgainst: number;
  totalYards: number;
  passYards: number;
  rushYards: number;
  yardsAllowed: number;
  firstDowns: number;
  turnovers: number;
  takeaways: number;
  sacks: number;
  sacksAllowed: number;
  thirdDownAtt: number;
  thirdDownConv: number;
  fourthDownAtt: number;
  fourthDownConv: number;
  redZoneAtt: number;
  redZoneTd: number;
  penalties: number;
  penaltyYards: number;
  timeOfPossession: number;
}

function blankTeamSeason(teamId: number): TeamSeasonStats {
  return {
    teamId, games: 0, pointsFor: 0, pointsAgainst: 0,
    totalYards: 0, passYards: 0, rushYards: 0, yardsAllowed: 0,
    firstDowns: 0, turnovers: 0, takeaways: 0, sacks: 0, sacksAllowed: 0,
    thirdDownAtt: 0, thirdDownConv: 0, fourthDownAtt: 0, fourthDownConv: 0,
    redZoneAtt: 0, redZoneTd: 0, penalties: 0, penaltyYards: 0,
    timeOfPossession: 0,
  };
}

/**
 * Team stats for a season, summed from the box scores of games actually played.
 * Nothing is stored, so these can never disagree with the games they came from.
 */
export function teamSeasonStats(
  state: GameState, season = state.season
): Map<number, TeamSeasonStats> {
  const out = new Map<number, TeamSeasonStats>();
  for (const t of state.teams) out.set(t.id, blankTeamSeason(t.id));

  for (const g of state.games) {
    if (!g.played || !g.boxScore || g.season !== season) continue;

    const pairs: [number, typeof g.boxScore.home, typeof g.boxScore.away, number, number][] = [
      [g.homeId, g.boxScore.home, g.boxScore.away, g.homeScore, g.awayScore],
      [g.awayId, g.boxScore.away, g.boxScore.home, g.awayScore, g.homeScore],
    ];

    for (const [teamId, mine, theirs, pf, pa] of pairs) {
      const s = out.get(teamId);
      if (!s) continue;
      s.games++;
      s.pointsFor += pf;
      s.pointsAgainst += pa;
      s.totalYards += mine.totalYards;
      s.passYards += mine.passYards;
      s.rushYards += mine.rushYards;
      s.yardsAllowed += theirs.totalYards;
      s.firstDowns += mine.firstDowns;
      s.turnovers += mine.giveaways;
      s.takeaways += mine.takeaways;
      s.sacksAllowed += mine.sacksAllowed;
      s.thirdDownAtt += mine.thirdDownAtt;
      s.thirdDownConv += mine.thirdDownConv;
      s.fourthDownAtt += mine.fourthDownAtt;
      s.fourthDownConv += mine.fourthDownConv;
      s.redZoneAtt += mine.redZoneAtt;
      s.redZoneTd += mine.redZoneTd;
      s.penalties += mine.penalties;
      s.penaltyYards += mine.penaltyYards;
      s.timeOfPossession += mine.timeOfPossession;
      // Sacks recorded by this team's defence = sacks the opponent allowed.
      s.sacks += theirs.sacksAllowed;
    }
  }
  return out;
}

export function perGame(v: number, games: number): number {
  return games === 0 ? 0 : Math.round((v / games) * 10) / 10;
}

export function pct(made: number, att: number): number {
  return att === 0 ? 0 : Math.round((made / att) * 1000) / 10;
}

/** Rank of a team in a category, 1 = best. `lowerIsBetter` for defence. */
export function rankOf(
  stats: Map<number, TeamSeasonStats>,
  teamId: number,
  pick: (s: TeamSeasonStats) => number,
  lowerIsBetter = false
): number {
  const arr = [...stats.values()].filter((s) => s.games > 0);
  if (arr.length === 0) return 0;
  arr.sort((a, b) => (lowerIsBetter ? pick(a) - pick(b) : pick(b) - pick(a)));
  return arr.findIndex((s) => s.teamId === teamId) + 1;
}

export type { SeasonStatLine, TeamRecordEntry };
