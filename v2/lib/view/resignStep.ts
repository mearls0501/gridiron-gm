import {
  comingYearCapHit, expiringPlayers, extensionAskingApy, isFranchiseTagged, isOfficeExtensionEligible,
  tagWindowCap,
} from "../core/offseason/contracts";
import { presentedOvr, presentedPot } from "../core/ratings";
import { capHit, teamCap, type CapSummary } from "../core/select";
import { GameState, Player } from "../core/types";

/**
 * The cap figure the header, Hub, /finances and /roster show. In the tag
 * window that is the coming league year (`tagWindowCap`); a re-sign then
 * costs its year-1 hit instead of crediting the expiring deal.
 */
export function screenCap(state: GameState, teamId = state.userTeamId): CapSummary {
  return state.phase === "offseason-tag" ? tagWindowCap(state, teamId) : teamCap(state, teamId);
}

/** One player's cap-hit cell, on the same year as `screenCap`. */
export function screenCapHit(state: GameState, p: Player): number {
  return state.phase === "offseason-tag" ? comingYearCapHit(state, p) : capHit(p.contract);
}

/**
 * User re-sign step on the franchise-tag window.
 *
 * The rows are the contract office: asking price is `extensionAskingApy`,
 * and Offer / Meet asking go through `submitOfficeOffer`. A player who
 * re-signs leaves this list. A franchise tag is not a re-sign: he is not
 * on this list, and he does not walk when Continue closes the window.
 * His multi-year extension is the July 15 desk in camp.
 */

export interface ResignStepRow {
  player: Player;
  asking: number;
  offerable: boolean;
}

export function resignStepRows(state: GameState, teamId = state.userTeamId): ResignStepRow[] {
  return expiringPlayers(state, teamId)
    .filter((p) => !isFranchiseTagged(state, p.id))
    .slice()
    .sort((a, b) => presentedOvr(b.pos, b.ovr) - presentedOvr(a.pos, a.ovr) || a.id - b.id)
    .map((player) => ({
      player,
      asking: extensionAskingApy(state, teamId, player),
      offerable: isOfficeExtensionEligible(state, player),
    }));
}

/** Expiring players Continue will put on the street. Tagged men stay. */
export function resignWalkCount(state: GameState, teamId = state.userTeamId): number {
  let n = 0;
  for (const p of expiringPlayers(state, teamId)) {
    if (isFranchiseTagged(state, p.id)) continue;
    n += 1;
  }
  return n;
}

/** Potential on the re-sign row. Blank once a player is older than 25. */
export function resignPot(p: Player): number | null {
  if (p.age > 25) return null;
  return presentedPot(p.pos, p.ovr, p.pot);
}

/** Hub line next to Continue. Null outside the tag window. */
export function hubResignWalkWarning(state: GameState): string | null {
  if (state.phase !== "offseason-tag") return null;
  const n = resignWalkCount(state, state.userTeamId);
  if (n === 0) return "No expiring players will walk if you Continue now.";
  if (n === 1) return "1 expiring player will walk if you Continue now.";
  return `${n} expiring players will walk if you Continue now.`;
}
