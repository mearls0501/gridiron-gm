import { GameState, Player, Position, POSITIONS, STARTERS } from "./types";

/**
 * Career outcome taxonomy.
 *
 * The point of this module is to answer one question honestly: does a
 * simulated career look like a real NFL career? Every claim the design makes
 * about scouting, the draft and development is unfalsifiable without it —
 * "the draft feels right" is not a measurement.
 *
 * So this defines the labels, and `scripts/careers.ts` checks the distribution
 * of those labels against real NFL rates. The definitions here deliberately
 * mirror the ones used in the published research, because a label we invented
 * could not be compared to anything:
 *
 *   - "hit"          PFF's bar: reached two thirds of a full-time starter's
 *                    snap share within the first four seasons.
 *   - "starter year" started at least 9 games — half a season.
 *   - "star year"    a Pro Bowl stand-in: roughly the top 15% of the starters
 *                    at that position league wide (see `starRank`).
 *   - "elite year"   an All-Pro stand-in: the top 5% of starters.
 *   - "bust"         a first or second round pick who never started half a
 *                    season in his first four years.
 *
 * Star and elite are graded on OVR rather than production on purpose. The
 * research is full of warnings that observed production over 17 games is a
 * noisy read on ability, and that noise is something the game models
 * deliberately — measuring outcomes through it would make this harness a
 * measure of the noise rather than of the career.
 */

/** Seasons of a rookie contract; the second-contract question is asked here. */
export const ROOKIE_DEAL_YEARS = 4;

/** Games started that count a season as a starting season. */
export const STARTER_GAMES = 9;

/**
 * Pro Bowl and All-Pro stand-ins, as a rank at the position league wide.
 *
 * A flat top-6 was wrong: it is ~19% of the 32 men who start at quarterback
 * but only ~6% of the 96 who start at receiver, so it silently held receivers
 * to three times the standard. Real Pro Bowl rosters run about 15% of the
 * starters at a position (3 QBs and 4 WRs per conference against 1 and 3
 * starting jobs per club), so the rank scales with the number of jobs.
 */
export function starRank(pos: Position): number {
  return Math.max(4, Math.round(STARTERS[pos] * 32 * 0.15));
}

export function eliteRank(pos: Position): number {
  return Math.max(1, Math.round(STARTERS[pos] * 32 * 0.05));
}

/** Share of a full-time starter's snaps that counts as a hit. */
export const HIT_SNAP_SHARE = 2 / 3;

export interface SeasonSnapshot {
  season: number;
  /** Seasons since he was drafted, 0 for his rookie year. */
  yearsIn: number;
  teamId: number | null;
  ovr: number;
  snaps: number;
  gamesStarted: number;
  starter: boolean;
  star: boolean;
  elite: boolean;
  /** Reached two thirds of a full-time starter's snaps at his position. */
  fullTime: boolean;
  rostered: boolean;
}

export interface Career {
  playerId: number;
  pos: Position;
  round: number | null;      // null = undrafted
  pick: number | null;
  draftSeason: number;
  draftAge: number;
  /** True ability the club never sees — the yardstick scouting is graded on. */
  trueOvrAtDraft: number;
  truePotAtDraft: number;
  draftTeamId: number;
  seasons: SeasonSnapshot[];
  /** Set when the career ends inside the observation window. */
  retiredSeason: number | null;
  secondContract: "drafting-team" | "elsewhere" | "none" | "unresolved";
}

// ---------------------------------------------------------------------------
// Per-season league context
// ---------------------------------------------------------------------------

/**
 * How many snaps a full-time starter at each position actually played this
 * season, taken from the league rather than assumed. The count of full-time
 * jobs at a position is `STARTERS[pos] * 32`, and the median snap total inside
 * that group is the baseline.
 */
export function fullTimeSnapBaseline(
  state: GameState, season: number
): Record<Position, number> {
  const out = {} as Record<Position, number>;
  for (const pos of POSITIONS) {
    const snaps: number[] = [];
    for (const p of state.players) {
      if (p.pos !== pos || p.prospect) continue;
      const line = p.stats.find((s) => s.season === season);
      if (line && line.snaps > 0) snaps.push(line.snaps);
    }
    if (!snaps.length) { out[pos] = 0; continue; }
    snaps.sort((a, b) => b - a);
    const jobs = Math.min(snaps.length, STARTERS[pos] * 32);
    const starters = snaps.slice(0, jobs);
    out[pos] = starters[Math.floor(starters.length / 2)] ?? 0;
  }
  return out;
}

/**
 * Player ids ranked at their position by OVR, best first, restricted to men
 * who actually played. A backup does not make the Pro Bowl.
 */
export function positionRanks(
  state: GameState, season: number
): Map<number, number> {
  const rank = new Map<number, number>();
  for (const pos of POSITIONS) {
    const group = state.players
      .filter((p) => {
        if (p.pos !== pos || p.prospect || p.retired || p.teamId === null) return false;
        const line = p.stats.find((s) => s.season === season);
        return !!line && line.snaps > 0;
      })
      .sort((a, b) => b.ovr - a.ovr);
    group.forEach((p, i) => rank.set(p.id, i + 1));
  }
  return rank;
}

/** Snapshot one player's season. Call once per player per season. */
export function snapshot(
  p: Player,
  season: number,
  draftSeason: number,
  baseline: Record<Position, number>,
  ranks: Map<number, number>
): SeasonSnapshot {
  const line = p.stats.find((s) => s.season === season);
  const snaps = line?.snaps ?? 0;
  const gamesStarted = line?.gamesStarted ?? 0;
  const r = ranks.get(p.id) ?? Infinity;
  const starAt = starRank(p.pos);
  const eliteAt = eliteRank(p.pos);
  const base = baseline[p.pos] || 0;
  return {
    season,
    yearsIn: season - draftSeason,
    teamId: p.teamId,
    ovr: p.ovr,
    snaps,
    gamesStarted,
    starter: gamesStarted >= STARTER_GAMES,
    star: r <= starAt,
    elite: r <= eliteAt,
    fullTime: base > 0 && snaps >= base * HIT_SNAP_SHARE,
    rostered: !p.retired && p.teamId !== null,
  };
}

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------

const firstN = (c: Career, n: number) => c.seasons.filter((s) => s.yearsIn < n);

/** PFF's bar: two thirds of a full-time starter's snaps inside four years. */
export function isHit(c: Career): boolean {
  return firstN(c, ROOKIE_DEAL_YEARS).some((s) => s.fullTime);
}

/** A first or second rounder who never started half a season in four years. */
export function isBust(c: Career): boolean {
  if (c.round === null || c.round > 2) return false;
  return !firstN(c, ROOKIE_DEAL_YEARS).some((s) => s.starter);
}

export function starterSeasons(c: Career): number {
  return c.seasons.filter((s) => s.starter).length;
}

/** The 4+ year starter bar the round-by-round research uses. */
export function isMultiYearStarter(c: Career): boolean {
  return starterSeasons(c) >= 4;
}

/** Season index of his first star year, or null. The breakout clock. */
export function yearsToFirstStar(c: Career): number | null {
  const hit = c.seasons.filter((s) => s.star).sort((a, b) => a.yearsIn - b.yearsIn)[0];
  return hit ? hit.yearsIn : null;
}

export function everStar(c: Career): boolean {
  return c.seasons.some((s) => s.star);
}

export function everElite(c: Career): boolean {
  return c.seasons.some((s) => s.elite);
}

/** Was he on any roster in the season `n` years after being drafted? */
export function rosteredInYear(c: Career, n: number): boolean {
  const s = c.seasons.find((x) => x.yearsIn === n);
  return !!s && s.rostered;
}

/** Was he still with the club that drafted him, `n` years in? */
export function withDrafterInYear(c: Career, n: number): boolean {
  const s = c.seasons.find((x) => x.yearsIn === n);
  return !!s && s.rostered && s.teamId === c.draftTeamId;
}

/** Seasons on a roster, from the draft until he was gone. */
export function careerLength(c: Career): number {
  return c.seasons.filter((s) => s.rostered).length;
}
