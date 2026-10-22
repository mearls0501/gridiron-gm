/**
 * Draft night: a trade-down offer for the user's on-clock pick is reviewed
 * before it commits (`clockOfferReview.ts`, `app/draft/page.tsx`).
 *
 * Fixtures only: a fresh league placed at the draft. Run:
 * npx tsx lib/view/clockOfferReview.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { newGame } from "../core/newGame";
import { enterDraft } from "../core/offseason";
import { acceptClockOffer, draftBoard, makePick, runDraftUntilUser } from "../core/offseason/draft";
import { Rng } from "../core/rng";
import { liveDraftSlot } from "../core/trades";
import { GameState } from "../core/types";
import { buildClockOfferReview } from "./clockOfferReview";

function ok(label: string) { console.log("ok   ", label); }

/** A league at the draft with the user on the clock holding at least one offer. */
function onClockWithOffer(): GameState {
  for (let seed = 1; seed < 60; seed++) {
    const st = newGame({ seed });
    st.phase = "offseason-draft";
    enterDraft(st);
    const d = st.draft!;
    for (let guard = 0; guard < 12 && !d.complete; guard++) {
      if ((d.clockOffers?.length ?? 0) > 0) return st;
      const top = draftBoard(st)[0];
      if (!top) break;
      const rng = new Rng(st.rngState);
      makePick(st, top.id, rng);
      runDraftUntilUser(st, rng);
      st.rngState = rng.state;
    }
  }
  throw new Error("no seed put an offer on the user's clock");
}

// (1) The review names the pick going out, what comes back, and the next pick.
{
  const st = onClockWithOffer();
  const d = st.draft!;
  const offer = d.clockOffers![0];
  const onClock = d.picks[d.onClock];
  const view = buildClockOfferReview(st, offer)!;
  assert.ok(view);
  assert.equal(view.givingPick, onClock.pick, "the on-clock pick is the one going out");
  assert.equal(view.review.outgoing.length, offer.get.length);
  assert.equal(view.review.incoming.length, offer.give.length);
  assert.ok(view.review.incoming.every((l) => l.kind === "pick"), "pick-for-pick");
  assert.equal(view.review.check.ok, true, view.review.check.reason ?? "check failed");

  const incomingNow = offer.give
    .map((a) => (a.kind === "pick" ? liveDraftSlot(st, a) : undefined))
    .filter((s) => s && s.playerId === null).map((s) => s!.pick);
  const held = d.picks.filter((pk) => pk.teamId === st.userTeamId && pk.playerId === null).map((pk) => pk.pick);
  const after = [...held.filter((n) => n !== onClock.pick), ...incomingNow].sort((a, b) => a - b);
  assert.equal(view.picksLeft.before, held.length);
  assert.equal(view.picksLeft.after, after.length);
  assert.equal(view.nextPick?.pick ?? null, after[0] ?? null);
  assert.ok(view.nextPick === null || view.nextPick.pick > onClock.pick, "the next pick comes after this one");
}
ok("review: pick out, picks in, next pick after the trade");

// (2) Building the review is read-only.
{
  const st = onClockWithOffer();
  const before = JSON.stringify(st);
  buildClockOfferReview(st, st.draft!.clockOffers![0]);
  assert.equal(JSON.stringify(st), before);
}
ok("review is read-only");

// (3) A stale offer shows Can't complete, and Confirm cannot push it through.
{
  const st = onClockWithOffer();
  const d = st.draft!;
  const offer = d.clockOffers![0];
  const named = offer.give.find((a) => a.kind === "pick")!;
  assert.ok(named && named.kind === "pick");
  // The buyer no longer owns a pick it offered (moved elsewhere behind the offer's back).
  const row = (st.pickOwners ?? []).find(
    (o) => o.season === named.season && o.round === named.round && o.originalTeamId === named.originalTeamId
  );
  assert.ok(row, "offered pick has an ownership row");
  row!.teamId = st.teams.find((t) => t.id !== offer.fromTeamId && t.id !== st.userTeamId)!.id;
  const slot = liveDraftSlot(st, named);
  if (slot) slot.teamId = row!.teamId;
  const view = buildClockOfferReview(st, offer)!;
  assert.equal(view.review.check.ok, false, "the engine verdict flags it");
  const rng = new Rng(st.rngState);
  assert.equal(acceptClockOffer(st, offer.id, rng), false, "Confirm cannot push it through");
}
ok("a stale offer reads Can't complete and does not execute");

// (4) The page commits only from the review panel's Confirm.
{
  const page = readFileSync(new URL("../../app/draft/page.tsx", import.meta.url), "utf8");
  assert.equal(page.includes("Accept and move down"), false, "no one-click accept");
  const calls = page.match(/acceptOffer\(o\.id\)/g) ?? [];
  assert.equal(calls.length, 1);
  assert.ok(page.includes("onConfirm={() => acceptOffer(o.id)}"), "accept runs from the panel's Confirm");
  assert.ok(page.includes("<ClockOfferPanel"));
}
ok("draft page: Review, then Confirm");

console.log("clockOfferReview: all passed");
