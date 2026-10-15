import { playerName, presentedOvr } from "../core/ratings";
import { knowsTrueRatings, userVeteranView, visibleOvr } from "../core/scouting";
import { describeAsset, isSpentPick, liveDraftSlot } from "../core/trades";
import { GameState, Player, TradeAsset } from "../core/types";
import { draftYearLabel } from "./draftYear";

/**
 * /trades OVR column and package labels. Display only.
 *
 * A rival badge is `visibleOvr` — the same string the player page prints
 * when the department does not know the man. The user's own roster stays
 * a number, on the roster scale (`presentedOvr`), not a fogged band. A
 * rival column sorts on that same scale applied to `userVeteranView`.
 * Nothing here prices a deal. `describeAsset` stays on the stored grade
 * and the stored pick season. The desk label for a pick is one year later.
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
 * Pick line on the desk. The stored season is the class year. The label
 * is the draft held after that season. `describeAsset` stays on the
 * stored year for the trade log.
 */
export function draftPickDeskLabel(state: GameState, a: Extract<TradeAsset, { kind: "pick" }>): string {
  const owner = state.teams[a.originalTeamId];
  const origin = owner ? ` (${owner.abbr})` : "";
  const year = draftYearLabel(a.season);
  if (isSpentPick(state, a)) return `${year} R${a.round}${origin} (used)`;
  const slot = liveDraftSlot(state, a);
  if (slot && slot.playerId === null) return `${year} #${slot.pick}${origin}`;
  return `${year} R${a.round}${origin}`;
}

/**
 * Package line on the trade desk. A player line uses the badge value
 * instead of true overall. A pick uses the display draft year.
 */
export function tradeBoardAssetLabel(state: GameState, a: TradeAsset): string {
  if (a.kind === "pick") return draftPickDeskLabel(state, a);
  const p = state.players.find((x) => x.id === a.playerId);
  if (!p) return describeAsset(state, a);
  return `${playerName(p)} (${p.pos}, ${tradeBoardOvr(state, p)})`;
}
