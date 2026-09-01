/**
 * Regression: closed trade window + leftover incoming offer.
 *
 * Playtest sit (GM Playtest year 0901, Boston, Week 10): banner said
 * nothing can be accepted or proposed; Propose was dead; Accept on the
 * Kansas City offer stayed a live-looking primary button.
 *
 * Run: npx tsx lib/view/tradeWindow.test.ts
 */
import assert from "node:assert/strict";
import { newGame } from "../core/newGame";
import { acceptOffer, rejectOffer, tradeWindowOpen } from "../core/trades";
import { TRADE_DEADLINE_WEEK, TradeOffer } from "../core/types";
import {
  CLOSED_WINDOW_ACTIONS,
  incomingOfferAccept,
  incomingOfferReject,
  proposeTradeControl,
} from "./tradeWindow";

function plantIncoming(st: ReturnType<typeof newGame>): {
  offer: TradeOffer;
  incomingId: number;
  outgoingId: number;
} {
  const user = st.userTeamId;
  const from = st.teams.find((t) => t.id !== user);
  assert.ok(from, "need a counterparty");
  const incoming = st.players.find(
    (p) => p.teamId === from.id && !p.prospect && !p.retired,
  );
  const outgoing = st.players.find(
    (p) => p.teamId === user && !p.prospect && !p.retired,
  );
  assert.ok(incoming && outgoing, "need a player on each side");
  const offer: TradeOffer = {
    id: 99,
    fromTeamId: from.id,
    toTeamId: user,
    give: [{ kind: "player", playerId: incoming.id }],
    get: [{ kind: "player", playerId: outgoing.id }],
    season: st.season,
    week: TRADE_DEADLINE_WEEK,
    rationale: "leftover from deadline week",
  };
  st.tradeOffers = [offer];
  return { offer, incomingId: incoming.id, outgoingId: outgoing.id };
}

assert.match(
  CLOSED_WINDOW_ACTIONS,
  /accepted/,
  "closed copy must say nothing can be accepted",
);
assert.match(
  CLOSED_WINDOW_ACTIONS,
  /proposed/,
  "closed copy must say nothing can be proposed",
);

// Open window: Accept is a live primary; Propose can be when a deal is ready.
{
  const accept = incomingOfferAccept(true);
  assert.equal(accept.enabled, true);
  assert.equal(accept.variant, "primary");
  const propose = proposeTradeControl(true, true);
  assert.equal(propose.enabled, true);
  assert.equal(propose.variant, "primary");
}

// Closed window: copy and controls agree. Accept is not a live trade.
{
  const accept = incomingOfferAccept(false);
  const reject = incomingOfferReject();
  const propose = proposeTradeControl(false, true);

  assert.equal(accept.enabled, false, "Accept must not be live after the deadline");
  assert.notEqual(accept.variant, "primary", "disabled primary still looks like a live Accept");
  assert.equal(accept.variant, "default");
  assert.equal(reject.enabled, true, "Reject may clear a stale offer");
  assert.equal(propose.enabled, false, "Propose stays disabled");
  assert.equal(propose.variant, "default");
  assert.ok(
    !accept.enabled && CLOSED_WINDOW_ACTIONS.includes("accepted"),
    "copy says nothing can be accepted and Accept is not a live control",
  );
  assert.ok(
    !propose.enabled && CLOSED_WINDOW_ACTIONS.includes("proposed"),
    "copy says nothing can be proposed and Propose is not a live control",
  );
}

// Click path: Week 10 leftover offer cannot complete; Reject clears it.
{
  const st = newGame({ seed: 1 });
  st.phase = "regular";
  st.week = TRADE_DEADLINE_WEEK + 1;
  assert.equal(st.week, 10, "sit is Week 10");
  assert.equal(tradeWindowOpen(st), false, "Week 10 is after the deadline");

  const { offer, incomingId, outgoingId } = plantIncoming(st);
  const beforeIn = st.players.find((p) => p.id === incomingId)!.teamId;
  const beforeOut = st.players.find((p) => p.id === outgoingId)!.teamId;

  const gate = incomingOfferAccept(tradeWindowOpen(st));
  assert.equal(gate.enabled, false);
  assert.notEqual(gate.variant, "primary");

  const res = acceptOffer(st, offer.id);
  assert.equal(res.ok, false);
  assert.match(res.reason ?? "", /closed/i);
  assert.equal(st.players.find((p) => p.id === incomingId)!.teamId, beforeIn);
  assert.equal(st.players.find((p) => p.id === outgoingId)!.teamId, beforeOut);
  assert.equal(st.tradeOffers?.some((o) => o.id === offer.id), true, "failed Accept leaves the offer");

  rejectOffer(st, offer.id);
  assert.equal(st.tradeOffers?.some((o) => o.id === offer.id), false, "Reject clears the stale offer");
}

// Deadline week itself is still open (do not move the week).
{
  const st = newGame({ seed: 1 });
  st.phase = "regular";
  st.week = TRADE_DEADLINE_WEEK;
  assert.equal(tradeWindowOpen(st), true);
  assert.equal(incomingOfferAccept(true).enabled, true);
}

console.log("ok    tradeWindow — closed-window incoming offer is not a live Accept");
