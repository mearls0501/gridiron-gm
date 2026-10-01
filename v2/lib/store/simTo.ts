import { GameState, Position, STARTERS, TRADE_DEADLINE_WEEK, defaultSettings } from "../core/types";
import { advance as advanceSeason } from "../core/season/engine";
import { incomingOfferPausesSim } from "../view/tradeWindow";
import { formatSimPauseToast } from "./simToast";

export type SimTarget = "deadline" | "seasonEnd" | "champion";

export type SimToStep =
  | { done: false }
  | { done: true; message: string };

/**
 * Multi-step simulation used by Hub simTo. Extracted so the pause predicate
 * can be regression-tested without the zustand / IndexedDB store.
 *
 * One step is one `advance` (a week, or a playoff round). The stepper draws
 * no RNG of its own. `runSimTo` drains it synchronously. The Hub store yields
 * between steps so the tab can paint; the advances stay in this order.
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

  const pauseOn = s.settings?.pauseOn ?? defaultSettings().pauseOn;
  const team = () => s.teams[s.userTeamId];
  const starterSet = (): Set<number> => {
    const ids = new Set<number>();
    for (const pos of Object.keys(STARTERS) as Position[]) {
      for (const id of (team().depthChart[pos] ?? []).slice(0, STARTERS[pos])) ids.add(id);
    }
    return ids;
  };
  const hurt = () =>
    s.players.filter((p) => p.teamId === s.userTeamId && p.injuryWeeks > 0).map((p) => p.id);

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

    const offersBefore = (s.tradeOffers ?? []).length;
    const hurtBefore = new Set(hurt());
    const logBefore = s.log.length;

    last = advanceSeason(s);

    let paused: string | null = null;
    if (pauseOn.tradeOffer && incomingOfferPausesSim(s, offersBefore)) {
      paused = "a club called with a trade offer";
    } else if (pauseOn.injuredStarter) {
      const starters = starterSet();
      const newlyHurt = hurt().filter((id) => !hurtBefore.has(id) && starters.has(id));
      if (newlyHurt.length > 0) paused = "a starter went down";
    }
    if (!paused && pauseOn.milestone && s.log.slice(logBefore).some((e) => e.kind === "milestone")) {
      paused = "a milestone fell";
    }

    if (paused) {
      finished = { done: true, message: formatSimPauseToast(paused, last) };
      return finished;
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
