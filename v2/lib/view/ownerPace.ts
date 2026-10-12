import { OwnerJobView } from "../core/owner";
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
