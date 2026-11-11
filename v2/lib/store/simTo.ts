import { GameState, TRADE_DEADLINE_WEEK } from "../core/types";
import { advance as advanceSeason } from "../core/season/engine";
import { formatSimPauseToast } from "./simToast";

export type SimTarget = "deadline" | "seasonEnd" | "champion";

export type SimToStep =
  | { done: false }
  | { done: true; message: string };

/**
 * Weeks still on the user's QB1 that stop a Hub sim. The week has already
 * healed and rolled by the time a step returns, so this is the absence the
 * roster is carrying, not the raw roll.
 */
export const STARTING_QB_PAUSE_WEEKS = 8;

/**
 * True when this step left the user's starting quarterback newly out for
 * at least {@link STARTING_QB_PAUSE_WEEKS}. An absence that was already
 * that long does not stop again. The setting off never stops.
 */
export function startingQbShouldPause(
  enabled: boolean, weeksBefore: number, weeksAfter: number,
): boolean {
  return enabled
    && weeksBefore < STARTING_QB_PAUSE_WEEKS
    && weeksAfter >= STARTING_QB_PAUSE_WEEKS;
}

/** Missing setting is on. Older saves predate the field. */
export function pauseOnStartingQb(s: GameState): boolean {
  return s.settings?.pauseOnStartingQb !== false;
}

/**
 * QB1 after the step. The user's club is not auto-IR'd during a sim, so a
 * long injury stays on this player (injury weeks set, status not IR) and
 * the depth chart is still the kickoff order — refresh runs at the start
 * of the week, not after the games.
 */
function userStartingQb(s: GameState): { id: number; weeks: number } | null {
  const id = s.teams[s.userTeamId]?.depthChart.QB?.[0];
  if (typeof id !== "number") return null;
  const p = s.players.find((x) => x.id === id);
  if (!p || p.teamId !== s.userTeamId || p.pos !== "QB") return null;
  return { id, weeks: p.injuryWeeks };
}

/**
 * Multi-step simulation used by Hub simTo.
 *
 * One step is one `advance` (a week, or a playoff round). The stepper draws
 * no RNG of its own. `runSimTo` drains it synchronously. The Hub store yields
 * between steps so the tab can paint, and writes the save once at the end.
 *
 * The click's target is the end of the run. A trade call, a milestone, or
 * any injury but one does not stop it. The exception, on by default, is the
 * user's QB1 going out for 8 or more weeks. The guard is only a stuck-phase
 * cap. A regular season plus the playoff rounds is under it.
 */
export function simToStepper(s: GameState, target: SimTarget): () => SimToStep {
  const reached = (): boolean => {
    if (s.phase.startsWith("offseason")) return true;
    switch (target) {
      case "deadline":
        return s.phase !== "regular" || s.week >= TRADE_DEADLINE_WEEK;
      case "seasonEnd":
        return s.phase !== "regular";
      case "champion":
        return false;
    }
  };

  let last = "";
  let guard = 0;
  let finished: SimToStep | null = null;

  const message = (): string => {
    switch (target) {
      case "deadline":
        return s.phase === "regular" ? `Simmed to Week ${s.week} — the trade deadline` : last;
      case "seasonEnd":
      case "champion":
        return last;
    }
  };

  return () => {
    if (finished) return finished;
    if (reached() || guard >= 40) {
      finished = { done: true, message: message() };
      return finished;
    }
    guard++;
    const watch = pauseOnStartingQb(s);
    const weeksBefore = new Map<number, number>();
    if (watch) {
      for (const p of s.players) weeksBefore.set(p.id, p.injuryWeeks);
    }
    last = advanceSeason(s);
    if (watch) {
      const qb = userStartingQb(s);
      const before = qb ? weeksBefore.get(qb.id) ?? 0 : 0;
      if (qb && startingQbShouldPause(true, before, qb.weeks)) {
        const n = qb.weeks;
        finished = {
          done: true,
          message: formatSimPauseToast(
            `your starting quarterback is out ${n} week${n === 1 ? "" : "s"}`,
            last,
          ),
        };
        return finished;
      }
    }
    return { done: false };
  };
}

export function runSimTo(s: GameState, target: SimTarget): string {
  const step = simToStepper(s, target);
  let result = step();
  while (!result.done) result = step();
  return result.message;
}
