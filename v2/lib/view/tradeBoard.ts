import { playerName, presentedOvr } from "../core/ratings";
import { knowsTrueRatings, userVeteranView, visibleOvr } from "../core/scouting";
import { describeAsset } from "../core/trades";
import { GameState, Player, TradeAsset } from "../core/types";

/**
 * /trades OVR column and package labels. Display only.
 *
 * A rival badge is `visibleOvr` — the same string the player page prints
 * when the department does not know the man. The user's own roster stays
 * a number, on the roster scale (`presentedOvr`), not a fogged band. A
 * rival column sorts on that same scale applied to `userVeteranView`.
 * Nothing here prices a deal. `describeAsset` stays on the stored grade.
 */

/** What the OVR badge may show. Own roster is the roster scale; everyone else is the scouted string. */
export function tradeBoardOvr(state: GameState, p: Player): number | string {
  if (knowsTrueRatings(state, p)) return presentedOvr(p.pos, p.ovr);
  return visibleOvr(state, p);
}

/** Column order. Own roster on the roster scale; a rival by the same scale on the scouted belief. */
export function tradeBoardOvrSort(state: GameState, p: Player): number {
  if (knowsTrueRatings(state, p)) return presentedOvr(p.pos, p.ovr);
  return presentedOvr(p.pos, userVeteranView(state, p).ovr);
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
