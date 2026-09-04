import {
  Game, GameState, Player, PlayerGameStat, Position, SeasonStatLine, TeamGameStats,
} from "../types";

/**
 * Season stat accumulation.
 *
 * Stats are added incrementally to the player's own season line the moment a
 * game is marked played, inside the same function call. There is no separate
 * "aggregate the season" job that deletes and rebuilds rows — that pattern is
 * what produced played-games-with-no-stats and half-wiped seasons.
 *
 * This module is also the single authority on the SHAPE of a stat row. The
 * three blank constructors below are the only places the field lists are
 * written down, which is what lets `lib/store/codec.ts` drop zero fields on
 * save and put them back on load without the two ever drifting apart.
 */

const STAT_KEYS = [
  "passAtt", "passCmp", "passYds", "passTd", "passInt", "sacked", "sackYds",
  "rushAtt", "rushYds", "rushTd", "fumbles", "fumblesLost",
  "targets", "rec", "recYds", "recTd",
  "tackles", "tfl", "sacks", "ints", "intYds", "passDef", "ff", "fr", "defTd", "safeties",
  "fgm", "fga", "xpm", "xpa",
  "punts", "puntYds", "puntsInside20",
  "kr", "krYds", "krTd", "pr", "prYds", "prTd",
  "twoPtAtt", "twoPtMade",
  "snaps",
] as const;

/** Season-long "longest" fields take a max, not a sum. */
const MAX_KEYS = ["passLong", "rushLong", "recLong", "puntLong", "krLong", "prLong", "longFg"] as const;

export function blankSeasonLine(season: number, teamId: number | null): SeasonStatLine {
  const line = { season, teamId, games: 0, gamesStarted: 0 } as SeasonStatLine;
  for (const k of STAT_KEYS) (line as unknown as Record<string, number>)[k] = 0;
  for (const k of MAX_KEYS) (line as unknown as Record<string, number>)[k] = 0;
  return line;
}

/**
 * A player's line for one game. Everything a season line carries except the
 * four fields that only make sense once the season is aggregated.
 */
export function blankPlayerGameStat(
  playerId: number, teamId: number, started: boolean
): PlayerGameStat {
  const line = { playerId, teamId, started } as unknown as Record<string, unknown>;
  for (const k of STAT_KEYS) line[k] = 0;
  for (const k of MAX_KEYS) line[k] = 0;
  return line as unknown as PlayerGameStat;
}

export function blankTeamGameStats(): TeamGameStats {
  return {
    points: 0, totalYards: 0, passYards: 0, rushYards: 0,
    firstDowns: 0, passFirstDowns: 0, rushFirstDowns: 0, penaltyFirstDowns: 0,
    turnovers: 0, giveaways: 0, takeaways: 0,
    plays: 0, possessions: 0,
    thirdDownAtt: 0, thirdDownConv: 0, fourthDownAtt: 0, fourthDownConv: 0,
    redZoneAtt: 0, redZoneTd: 0,
    sacksAllowed: 0, sackYardsAllowed: 0,
    penalties: 0, penaltyYards: 0,
    timeOfPossession: 0,
  };
}

export function seasonLine(p: Player, season: number, teamId: number | null): SeasonStatLine {
  let line = p.stats.find((s) => s.season === season);
  if (!line) {
    line = blankSeasonLine(season, teamId);
    p.stats.push(line);
  }
  if (teamId !== null) line.teamId = teamId;
  return line;
}

/** Fold a finished game's box score into every involved player's season line. */
export function applyGameStats(state: GameState, game: Game): void {
  if (!game.boxScore) return;
  const byId = new Map<number, Player>();
  for (const p of state.players) byId.set(p.id, p);

  for (const gs of game.boxScore.players) {
    const player = byId.get(gs.playerId);
    if (!player) continue;
    const line = seasonLine(player, game.season, gs.teamId);
    line.games += 1;
    if (gs.started) line.gamesStarted += 1;
    for (const k of STAT_KEYS) {
      (line as unknown as Record<string, number>)[k] +=
        (gs as unknown as Record<string, number>)[k] ?? 0;
    }
    for (const k of MAX_KEYS) {
      const rec = line as unknown as Record<string, number>;
      rec[k] = Math.max(rec[k] ?? 0, (gs as unknown as Record<string, number>)[k] ?? 0);
    }
  }
}

// ---------------------------------------------------------------------------
// Derived stats
// ---------------------------------------------------------------------------

export function passerRating(l: SeasonStatLine): number {
  if (l.passAtt === 0) return 0;
  const a = clampRating((l.passCmp / l.passAtt - 0.3) * 5);
  const b = clampRating((l.passYds / l.passAtt - 3) * 0.25);
  const c = clampRating((l.passTd / l.passAtt) * 20);
  const d = clampRating(2.375 - (l.passInt / l.passAtt) * 25);
  return Math.round(((a + b + c + d) / 6) * 100 * 10) / 10;
}

function clampRating(v: number): number {
  return Math.max(0, Math.min(2.375, v));
}

export function ypc(l: SeasonStatLine): number {
  return l.rushAtt === 0 ? 0 : Math.round((l.rushYds / l.rushAtt) * 10) / 10;
}

export function ypr(l: SeasonStatLine): number {
  return l.rec === 0 ? 0 : Math.round((l.recYds / l.rec) * 10) / 10;
}

export function cmpPct(l: SeasonStatLine): number {
  return l.passAtt === 0 ? 0 : Math.round((l.passCmp / l.passAtt) * 1000) / 10;
}

export function fgPct(l: SeasonStatLine): number {
  return l.fga === 0 ? 0 : Math.round((l.fgm / l.fga) * 1000) / 10;
}

/** Current-season line for a player, or a zeroed line if they haven't played. */
export function currentLine(p: Player, season: number): SeasonStatLine {
  return p.stats.find((s) => s.season === season) ?? blankSeasonLine(season, p.teamId);
}

export function careerTotals(p: Player): SeasonStatLine {
  const total = blankSeasonLine(0, null);
  for (const s of p.stats) {
    total.games += s.games;
    total.gamesStarted += s.gamesStarted;
    for (const k of STAT_KEYS) {
      (total as unknown as Record<string, number>)[k] +=
        (s as unknown as Record<string, number>)[k] ?? 0;
    }
    for (const k of MAX_KEYS) {
      const rec = total as unknown as Record<string, number>;
      rec[k] = Math.max(rec[k] ?? 0, (s as unknown as Record<string, number>)[k] ?? 0);
    }
  }
  return total;
}

// ---------------------------------------------------------------------------
// League leaders
// ---------------------------------------------------------------------------

export type LeaderKey =
  | "passYds" | "passTd" | "rushYds" | "rushTd" | "recYds" | "recTd"
  | "sacks" | "ints" | "tackles";

/** WR/TE/RB — same skill group briefing.ts uses. Receiving boards only. */
export const RECEIVING_LEADER_POS: readonly Position[] = ["WR", "TE", "RB"];

export function isReceivingLeaderPos(pos: Position): boolean {
  return pos === "WR" || pos === "TE" || pos === "RB";
}

export interface LeaderRow {
  player: Player;
  value: number;
  line: SeasonStatLine;
}

export function leaders(
  state: GameState, key: LeaderKey, season = state.season, limit = 10
): LeaderRow[] {
  const receiving = key === "recYds" || key === "recTd";
  const rows: LeaderRow[] = [];
  for (const p of state.players) {
    if (p.prospect) continue;
    if (receiving && !isReceivingLeaderPos(p.pos)) continue;
    const line = p.stats.find((s) => s.season === season);
    if (!line) continue;
    const value = (line as unknown as Record<string, number>)[key] ?? 0;
    if (value <= 0) continue;
    rows.push({ player: p, value, line });
  }
  rows.sort((a, b) => b.value - a.value || a.player.id - b.player.id);
  return rows.slice(0, limit);
}

// ---------------------------------------------------------------------------
// More derived stats
// ---------------------------------------------------------------------------

/** Yards per attempt, the cleanest single measure of passing efficiency. */
export function yardsPerAttempt(l: SeasonStatLine): number {
  return l.passAtt === 0 ? 0 : Math.round((l.passYds / l.passAtt) * 10) / 10;
}

export function catchRate(l: SeasonStatLine): number {
  return l.targets === 0 ? 0 : Math.round((l.rec / l.targets) * 1000) / 10;
}

export function yardsFromScrimmage(l: SeasonStatLine): number {
  return l.rushYds + l.recYds;
}

export function allPurposeYards(l: SeasonStatLine): number {
  return l.rushYds + l.recYds + l.krYds + l.prYds;
}

export function totalTouchdowns(l: SeasonStatLine): number {
  return l.rushTd + l.recTd + l.krTd + l.prTd + l.defTd;
}

export function puntAverage(l: SeasonStatLine): number {
  return l.punts === 0 ? 0 : Math.round((l.puntYds / l.punts) * 10) / 10;
}

export function krAverage(l: SeasonStatLine): number {
  return l.kr === 0 ? 0 : Math.round((l.krYds / l.kr) * 10) / 10;
}

export function prAverage(l: SeasonStatLine): number {
  return l.pr === 0 ? 0 : Math.round((l.prYds / l.pr) * 10) / 10;
}

/** "MM:SS" from a seconds count, for time of possession. */
export function clockString(seconds: number): string {
  const m = Math.floor(Math.max(0, seconds) / 60);
  const s = Math.round(Math.max(0, seconds) % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}
