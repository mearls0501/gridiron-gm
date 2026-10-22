import { liveDraftSlot } from "../core/trades";
import { GameState, TradeAsset, TradeOffer } from "../core/types";
import { buildOfferReview, OfferReview } from "./tradeReview";

/**
 * Draft night: review a trade-down offer for the user's on-clock pick before
 * it commits. Display only.
 *
 * These offers are pick-for-pick (`buildMoveUpBundle` only bundles picks), so
 * cap and roster do not move. What the user needs is what goes, what comes
 * back, and where they pick next. The engine verdict is `buildOfferReview`'s
 * `checkTrade`, the same one `executeTrade` runs.
 */

export interface ClockOfferReview {
  review: OfferReview;
  /** Overall number of the pick being traded away. */
  givingPick: number | null;
  /** The user's next pick in this draft after the trade, or null if none. */
  nextPick: { pick: number; round: number } | null;
  /** Picks the user still holds in this draft, before and after. */
  picksLeft: { before: number; after: number };
}

function thisDraftPicks(state: GameState, assets: TradeAsset[]): number[] {
  const out: number[] = [];
  for (const a of assets) {
    if (a.kind !== "pick") continue;
    const slot = liveDraftSlot(state, a);
    if (slot && slot.playerId === null) out.push(slot.pick);
  }
  return out;
}

export function buildClockOfferReview(state: GameState, offer: TradeOffer): ClockOfferReview | null {
  const d = state.draft;
  if (!d || d.complete) return null;
  const me = state.userTeamId;
  const userProposes = offer.fromTeamId === me;
  const gets = userProposes ? offer.get : offer.give;
  const sends = userProposes ? offer.give : offer.get;

  const held = d.picks.filter((pk) => pk.teamId === me && pk.playerId === null).map((pk) => pk.pick);
  const leaving = new Set(thisDraftPicks(state, sends));
  const after = [...held.filter((n) => !leaving.has(n)), ...thisDraftPicks(state, gets)].sort((a, b) => a - b);
  const next = after[0];
  const nextRow = next === undefined ? undefined : d.picks.find((pk) => pk.pick === next);

  return {
    review: buildOfferReview(state, offer),
    givingPick: [...leaving].sort((a, b) => a - b)[0] ?? null,
    nextPick: nextRow ? { pick: nextRow.pick, round: nextRow.round } : null,
    picksLeft: { before: held.length, after: after.length },
  };
}
