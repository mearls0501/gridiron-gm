import { GameState, Position, STARTERS, TRADE_DEADLINE_WEEK, defaultSettings } from "../core/types";
import { advance as advanceSeason } from "../core/season/engine";
import { incomingOfferPausesSim } from "../view/tradeWindow";
import { formatSimPauseToast } from "./simToast";

export type SimTarget = "deadline" | "seasonEnd" | "champion";

/**
 * Multi-step simulation used by Hub simTo. Extracted so the pause predicate
 * can be regression-tested without the zustand / IndexedDB store.
 */
export function runSimTo(s: GameState, target: SimTarget): string {
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
  let paused: string | null = null;
  let guard = 0;
  while (!reached() && guard++ < 40) {
    const offersBefore = (s.tradeOffers ?? []).length;
    const hurtBefore = new Set(hurt());
    const logBefore = s.log.length;

    last = advanceSeason(s);

    if (pauseOn.tradeOffer && incomingOfferPausesSim(s, offersBefore)) {
      paused = "a club called with a trade offer";
      break;
    }
    if (pauseOn.injuredStarter) {
      const starters = starterSet();
      const newlyHurt = hurt().filter((id) => !hurtBefore.has(id) && starters.has(id));
      if (newlyHurt.length > 0) {
        paused = "a starter went down";
        break;
      }
    }
    if (pauseOn.milestone && s.log.slice(logBefore).some((e) => e.kind === "milestone")) {
      paused = "a milestone fell";
      break;
    }
  }
  if (paused) return formatSimPauseToast(paused, last);
  switch (target) {
    case "deadline":
      return s.phase === "regular" ? `Simmed to Week ${s.week} — the trade deadline` : last;
    case "seasonEnd":
    case "champion":
      return last;
  }
}
