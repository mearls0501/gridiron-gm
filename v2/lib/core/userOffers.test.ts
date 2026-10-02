/**
 * Free agency used to open with an empty inbox. Expiring deals leave the
 * shop with nobody the CPU posture will move, so the 24-draw pass returns
 * nothing. The inquiry walks the league on a child stream.
 *
 * Seed 42, tag → FA, before this packet: 0 offers, rngState 485912630.
 * That rng lock is the proof the parent stream did not move.
 *
 * Run: npx tsx lib/core/userOffers.test.ts
 */
import assert from "node:assert/strict";
import { newGame } from "./newGame";
import { advance } from "./season/engine";
import { advanceOffseason } from "./offseason";
import { checkTrade } from "./trades";

{
  const st = newGame({ seed: 42 });
  let guard = 0;
  while (st.phase !== "offseason-tag" && guard++ < 90) {
    if (st.phase.startsWith("offseason")) advanceOffseason(st);
    else advance(st);
  }
  assert.equal(st.phase, "offseason-tag");
  assert.equal(st.rngState, 4285417656);

  advanceOffseason(st);
  assert.equal(st.phase, "offseason-fa");
  assert.equal(st.rngState, 485912630, "inquiry must not move the parent stream");

  const offers = st.tradeOffers ?? [];
  assert.ok(offers.length >= 1, `free agency opened with no calls (${offers.length})`);
  assert.ok(offers.length <= 2, `inbox is a couple, got ${offers.length}`);
  for (const offer of offers) {
    assert.equal(offer.toTeamId, st.userTeamId);
    assert.notEqual(offer.fromTeamId, st.userTeamId);
    assert.ok(offer.get.some((a) => a.kind === "player"), "a call asks for a player");
    assert.equal(checkTrade(st, offer).ok, true, "a call on the table is legal");
  }
}

console.log("ok    userOffers — free agency opens with a legal call, parent rng unchanged");
