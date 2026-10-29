import { OWNER_WIN_TARGET, OwnerJobView, OwnerSeat, tenureRows } from "../core/owner";
import { computeRecords } from "../core/select";
import { GAMES_PER_TEAM, GameState } from "../core/types";

/**
 * In-season owner card. The live season is scored as a 17-game pace
 * against the bar the card already shows. Playoffs and Season Review
 * keep the actual record. This does not call `ownerJudgment`.
 *
 * Wins are the same figure the bar uses (a tie is half a win). Games
 * played are wins, losses, and ties. Zero games does not divide.
 */

/** `wins × 17 / games played`. Null when no game has been played. */
export function winPace(wins: number, gamesPlayed: number): number | null {
  if (gamesPlayed <= 0) return null;
  return (wins * GAMES_PER_TEAM) / gamesPlayed;
}

/** Nearest tenth. A whole number stays whole, so 8.5 does not become 9. */
export function roundPace(pace: number): number {
  return Math.round(pace * 10) / 10;
}

export function paceLabel(pace: number): string {
  const n = roundPace(pace);
  const text = Number.isInteger(n) ? String(n) : n.toFixed(1);
  return `on pace for ${text}`;
}

export interface OwnerCardPace {
  /** Set in the regular season once this club has a result. */
  label: string | null;
  /** Unrounded pace. The margin uses this, not {@link roundPace}. */
  pace: number | null;
  weightedWins: number;
  margin: number;
}

function actualPace(job: OwnerJobView): OwnerCardPace {
  return {
    label: null,
    pace: null,
    weightedWins: job.weightedWins,
    margin: job.margin,
  };
}

/**
 * Regular season: the live year's wins in the 60/40 (or the year itself,
 * when it is the only one) are the pace. The bar is the one the judgment
 * already computed. Every other phase returns that judgment unchanged.
 */
export function ownerCardPace(
  state: GameState,
  teamId: number,
  job: OwnerJobView,
): OwnerCardPace {
  if (state.phase !== "regular") return actualPace(job);
  if (state.history.some((h) => h.season === state.season)) return actualPace(job);
  const hired = state.teams[teamId]?.gmHiredSeason ?? state.season;
  if (state.season < hired) return actualPace(job);
  if (job.seasonsWithGm < 1 || job.recentWins == null) return actualPace(job);

  const rec = computeRecords(state, state.season).get(teamId);
  if (!rec) return actualPace(job);
  const gamesPlayed = rec.w + rec.l + rec.t;
  const wins = rec.w + rec.t * 0.5;
  const pace = winPace(wins, gamesPlayed);
  if (pace == null) return actualPace(job);

  const weightedWins = job.seasonsWithGm === 1
    ? pace
    : job.weightedWins + (pace - job.recentWins) * 0.6;
  return {
    label: paceLabel(pace),
    pace,
    weightedWins,
    margin: weightedWins - job.bar,
  };
}

/** Margin line on the owner card. The pace phrase is in-season only. */
export function ownerMarginSub(job: OwnerJobView, pace: OwnerCardPace): string {
  const line = `bar ${job.bar.toFixed(1)} · margin ${pace.margin.toFixed(1)}`;
  return pace.label ? `${line} · ${pace.label}` : line;
}

/**
 * Weeks 2–5 are a handful of games. A raw win total that small trips the
 * full-season firing line, and the card used to say the season was over.
 * Five games played is the last sample that stays early (a week-5 club
 * has played at most five). This does not call `ownerJudgment` and does
 * not change `job.wouldFire`.
 */
export const EARLY_VERDICT_GAMES = 5;

export function earlySeasonSample(state: GameState, teamId: number): boolean {
  if (state.phase !== "regular") return false;
  if (state.history.some((h) => h.season === state.season)) return false;
  const rec = computeRecords(state, state.season).get(teamId);
  if (!rec) return false;
  const played = rec.w + rec.l + rec.t;
  return played > 0 && played <= EARLY_VERDICT_GAMES;
}

export interface OwnerCardVerdict {
  /** Printed in the Would fire stat. `early` is withheld, not a yes. */
  wouldFire: "yes" | "no" | "early";
  /** Seat pill. `early` stands in for `fired` while the sample is short. */
  seat: OwnerSeat | "early";
  line: string;
}

/** Newest archived season under this GM. History only, so a live partial is not last season. */
export function archivedPriorWins(state: GameState, teamId: number): number | null {
  const hired = state.teams[teamId]?.gmHiredSeason ?? state.season;
  const rows = tenureRows(state, teamId, hired).filter((r) => r.season < state.season);
  return rows.length ? rows[rows.length - 1].wins : null;
}

function marginSeat(margin: number): OwnerSeat {
  if (margin <= 0) return "fired";
  if (margin <= 1) return "hot";
  if (margin <= 2.5) return "watched";
  return "safe";
}

export function ownerCardVerdict(
  state: GameState,
  teamId: number,
  job: OwnerJobView,
): OwnerCardVerdict {
  const regular =
    state.phase === "regular" &&
    !state.history.some((h) => h.season === state.season);
  if (job.firingEnabled && regular) {
    const pace = ownerCardPace(state, teamId, job);
    if (pace.pace != null) {
      const prior = archivedPriorWins(state, teamId);
      const keep =
        pace.pace > GAMES_PER_TEAM / 2 ||
        (prior != null && pace.pace - prior >= 3);
      const rebuildYear =
        job.seasonsWithGm <= 1 && job.expectedWins === OWNER_WIN_TARGET.rebuild;
      const paceFires = pace.margin <= 0 && !keep && !rebuildYear;
      if (earlySeasonSample(state, teamId) && (job.wouldFire || paceFires)) {
        return {
          wouldFire: "early",
          seat: "early",
          line: `${job.owner.name} reads a firing verdict after more than five games. This sample is still early.`,
        };
      }
      const band = marginSeat(pace.margin);
      const seat: OwnerSeat = paceFires ? "fired" : band === "fired" ? "hot" : band;
      const wouldFire = paceFires ? "yes" as const : "no" as const;
      const agrees =
        wouldFire === (job.wouldFire ? "yes" : "no") &&
        seat === job.seat &&
        wouldFire !== "yes";
      if (agrees) return { wouldFire, seat, line: job.line };
      const line = paceFires
        ? `${job.owner.name} would fire at this pace. The bar is ${job.bar.toFixed(1)}. ${paceLabel(pace.pace)}.`
        : `${job.owner.name} is counting this season at its pace. The bar is ${job.bar.toFixed(1)}. ${paceLabel(pace.pace)}.`;
      return { wouldFire, seat, line };
    }
  }
  if (!job.wouldFire || !earlySeasonSample(state, teamId)) {
    return {
      wouldFire: job.wouldFire ? "yes" : "no",
      seat: job.seat,
      line: job.line,
    };
  }
  return {
    wouldFire: "early",
    seat: "early",
    line: `${job.owner.name} reads a firing verdict after more than five games. This sample is still early.`,
  };
}
