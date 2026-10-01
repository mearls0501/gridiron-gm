import { playerName } from "../core/ratings";
import { knowsTrueRatings, userVeteranView, visibleOvr } from "../core/scouting";
import { describeAsset } from "../core/trades";
import { GameState, Player, TradeAsset } from "../core/types";

/**
 * /trades OVR column and package labels. Display only.
 *
 * A rival badge is `visibleOvr` — the same string the player page prints
 * when the department does not know the man. The user's own roster stays
 * the true number so the tier color matches. A rival column sorts on
 * `userVeteranView`, the belief that band is centered on (the free-agency
 * board already ranks that way). Nothing here prices a deal.
 */

/** What the OVR badge may show. Own roster is the number; everyone else is the scouted string. */
export function tradeBoardOvr(state: GameState, p: Player): number | string {
  if (knowsTrueRatings(state, p)) return p.ovr;
  return visibleOvr(state, p);
}

/** Column order. Own roster by true overall; a rival by the scouted belief. */
export function tradeBoardOvrSort(state: GameState, p: Player): number {
  if (knowsTrueRatings(state, p)) return p.ovr;
  return userVeteranView(state, p).ovr;
}

/**
 * Package line on the trade desk. Picks stay `describeAsset`. A player
 * line uses the badge value instead of true overall.
 */
export function tradeBoardAssetLabel(state: GameState, a: TradeAsset): string {
  if (a.kind !== "player") return describeAsset(state, a);
  const p = state.players.find((x) => x.id === a.playerId);
  if (!p) return describeAsset(state, a);
  return `${playerName(p)} (${p.pos}, ${tradeBoardOvr(state, p)})`;
}
