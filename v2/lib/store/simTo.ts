import { GameState, TRADE_DEADLINE_WEEK } from "../core/types";
import { advance as advanceSeason } from "../core/season/engine";

export type SimTarget = "deadline" | "seasonEnd" | "champion";

export type SimToStep =
  | { done: false }
  | { done: true; message: string };

/**
 * Multi-step simulation used by Hub simTo.
 *
 * One step is one `advance` (a week, or a playoff round). The stepper draws
 * no RNG of its own. `runSimTo` drains it synchronously. The Hub store yields
 * between steps so the tab can paint, and writes the save once at the end.
 *
 * The click's target is the end of the run. A starter injury or a trade call
 * used to finish the click after one to three weeks. Those events still
 * happen on the same advances; they do not stop the loop. The guard is only
 * a stuck-phase cap. A regular season plus the playoff rounds is under it.
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
    last = advanceSeason(s);
    return { done: false };
  };
}

export function runSimTo(s: GameState, target: SimTarget): string {
  const step = simToStepper(s, target);
  let result = step();
  while (!result.done) result = step();
  return result.message;
}
