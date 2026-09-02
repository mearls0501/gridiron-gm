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
import { acceptOffer, generateUserOffers, rejectOffer, tradeWindowOpen } from "../core/trades";
import { defaultSettings, TRADE_DEADLINE_WEEK, TradeOffer } from "../core/types";
import { startRegularSeason } from "../core/season/engine";
import { Rng } from "../core/rng";
import { runSimTo } from "../store/simTo";
import {
  CLOSED_WINDOW_ACTIONS,
  incomingOfferAccept,
  incomingOfferPausesSim,
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

function tradeOnlyPause(st: ReturnType<typeof newGame>): void {
  const cur = st.settings ?? defaultSettings();
  st.settings = {
    ...cur,
    pauseOn: { tradeOffer: true, injuredStarter: false, milestone: false },
  };
}

// After week 9, generateUserOffers must not grow the inbox. Leftover stays
// for Reject — do not auto-delete it here.
{
  const st = newGame({ seed: 1 });
  st.phase = "regular";
  st.week = TRADE_DEADLINE_WEEK + 1;
  const { offer } = plantIncoming(st);
  const before = (st.tradeOffers ?? []).length;
  assert.equal(before, 1);
  generateUserOffers(st, new Rng(1), 2);
  assert.equal((st.tradeOffers ?? []).length, before, "closed window must not append incoming offers");
  assert.equal(st.tradeOffers?.some((o) => o.id === offer.id), true, "leftover stays for Reject");
  assert.equal(incomingOfferPausesSim(st, before), false, "leftover is not a new Accept-able call");
  assert.equal(incomingOfferPausesSim(st, 0), false, "even a length bump after the deadline does not pause");
}

// Open window: a newly arrived offer still pauses bulk sim.
{
  const st = newGame({ seed: 1 });
  st.phase = "regular";
  st.week = 8;
  st.tradeOffers = [];
  generateUserOffers(st, new Rng(1), 1);
  assert.ok((st.tradeOffers?.length ?? 0) >= 1, "week 8 can still put an offer on the table");
  assert.equal(incomingOfferPausesSim(st, 0), true, "new offer during the window still pauses");
}

// Week 10 leftover + simTo seasonEnd: do not stop for that leftover, and
// do not wipe the inbox. Accept stays dead; Reject still clears.
{
  const st = newGame({ seed: 1 });
  startRegularSeason(st);
  st.week = TRADE_DEADLINE_WEEK + 1;
  tradeOnlyPause(st);
  const { offer } = plantIncoming(st);
  assert.equal(st.week, 10);
  assert.equal(incomingOfferPausesSim(st, (st.tradeOffers ?? []).length), false);

  const seasonEnd = runSimTo(st, "seasonEnd");
  assert.ok(
    !/trade offer/i.test(seasonEnd),
    `seasonEnd must not pause on leftover, got: ${seasonEnd}`,
  );
  assert.equal(st.phase, "playoffs", "seasonEnd lands on the playoff field");
  assert.equal(
    st.tradeOffers?.some((o) => o.id === offer.id),
    true,
    "bulk sim must leave the leftover on the table",
  );
  const accept = incomingOfferAccept(tradeWindowOpen(st));
  assert.equal(accept.enabled, false, "Accept stays dead after the deadline");
  const closed = acceptOffer(st, offer.id);
  assert.equal(closed.ok, false);
  rejectOffer(st, offer.id);
  assert.equal(
    st.tradeOffers?.some((o) => o.id === offer.id),
    false,
    "Reject still clears the leftover",
  );
}

{
  const st = newGame({ seed: 1 });
  startRegularSeason(st);
  st.week = TRADE_DEADLINE_WEEK + 1;
  tradeOnlyPause(st);
  plantIncoming(st);

  const champ = runSimTo(st, "champion");
  assert.ok(
    !/trade offer/i.test(champ),
    `champion must not pause on leftover, got: ${champ}`,
  );
  assert.ok(st.phase.startsWith("offseason"), "Through the Playoffs hands off to the offseason");
}

console.log("ok    tradeWindow — leftover after deadline does not pause bulk sim");
