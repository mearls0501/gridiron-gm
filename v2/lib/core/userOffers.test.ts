/**
 * Free agency used to open with an empty inbox. Expiring deals leave the
 * shop with nobody the CPU posture will move, so the 24-draw pass returns
 * nothing. The inquiry walks the league on a child stream.
 *
 * A minimum-roster fixture forces the ordinary shop to exhaust its draw
 * budget, then verifies successful inquiries add no parent draws.
 * Seed 42, tag → FA. Roster sanity (emergency quarterbacks, practice-squad
 * parks, position ceiling) moves who plays from week 3, so the canary
 * moved: tag 2875380525, FA 3306901598, signed by Matt 2026-10-23.
 * Earlier: 1725353685 / 2028992364 (pro-rata salary, 2026-10-20),
 * 2282341061 / 3785709883 (trade valuation), 3967213056 / 3639016065
 * (trade cap accounting), 1599887382 / 2847491416 (end-of-half kick),
 * 823515333 / 1063212815 before that. Offer logic is unchanged.
 *
 * Run: npx tsx lib/core/userOffers.test.ts
 */
import assert from "node:assert/strict";
import { newGame } from "./newGame";
import { Rng } from "./rng";
import { advance } from "./season/engine";
import { advanceOffseason } from "./offseason";
import { checkTrade, dropSpentInboxOffers, generateUserOffers, isSpentPick, proposeTrade } from "./trades";
import { POSITION_MIN } from "./types";
import type { TradeAsset, TradeOffer } from "./types";

function giveKey(offer: TradeOffer): string {
  let players = 0;
  const rounds: number[] = [];
  for (const a of offer.give) {
    if (a.kind === "player") players++;
    else if (a.kind === "pick") rounds.push(a.round);
  }
  rounds.sort((a, b) => a - b);
  return `${players}p:${rounds.join(",")}`;
}

function isLateScrap(offer: TradeOffer): boolean {
  let picks = 0;
  for (const a of offer.give) {
    if (a.kind !== "pick") continue;
    if (a.round < 5) return false;
    picks++;
  }
  return picks >= 3;
}

function assertLivePicks(st: ReturnType<typeof newGame>, offer: TradeOffer): void {
  const sides: [number, TradeAsset[]][] = [
    [offer.fromTeamId, offer.give],
    [offer.toTeamId, offer.get],
  ];
  for (const [teamId, assets] of sides) {
    for (const a of assets) {
      if (a.kind !== "pick") continue;
      assert.equal(isSpentPick(st, a), false, `offer ${offer.id} names a used pick`);
      const row = (st.pickOwners ?? []).find(
        (p) => p.season === a.season && p.round === a.round && p.originalTeamId === a.originalTeamId,
      );
      assert.ok(row && row.teamId === teamId, `offer ${offer.id} names a pick that club does not hold`);
    }
  }
}

for (const seed of [11, 42, 99]) {
  const st = newGame({ seed });
  st.phase = "offseason-fa";
  st.week = 0;
  st.tradeOffers = [];
  // No surplus body can be shopped; inquiries can still ask about the roster.
  for (const pos of Object.keys(POSITION_MIN) as (keyof typeof POSITION_MIN)[]) {
    const group = st.players
      .filter((p) => p.teamId === st.userTeamId && p.pos === pos && !p.retired && !p.prospect)
      .sort((a, b) => b.ovr - a.ovr);
    for (const p of group.slice(POSITION_MIN[pos])) {
      p.teamId = null;
      p.contract = null;
    }
  }
  const ids = st.teams.map((t) => t.id).filter((id) => id !== st.userTeamId);
  for (const from of ids) {
    const probe = new Rng(123);
    assert.equal(proposeTrade(st, from, st.userTeamId, probe), null, "fixture has no ordinary shop target");
    assert.equal(probe.state, 123, "empty shop proposals take no draws");
  }
  const entry = st.rngState;
  const parent = new Rng(entry);
  const expected = new Rng(entry);
  // The ordinary shop still pays for its 24 club selections.
  for (let i = 0; i < 24; i++) expected.pick(ids);
  const offers = generateUserOffers(st, parent, 2);
  assert.ok(offers.length > 0, "exercise a successful inquiry after all 24 empty shop attempts");
  assert.equal(parent.state, expected.state, "inquiries add no parent draws beyond the ordinary shop");
  assert.equal(st.rngState, entry, "caller owns persistence of its parent stream");
  for (const offer of offers) {
    assert.equal(checkTrade(st, offer).ok, true);
    assertLivePicks(st, offer);
  }
}

console.log("ok    userOffers — successful inquiries add no parent RNG draws (seeds 11, 42, 99)");

{
  const st = newGame({ seed: 42 });
  const seen = new Map<number, string>();
  let scrap = 0;
  let guard = 0;
  while (st.phase !== "offseason-tag" && guard++ < 90) {
    if (st.phase.startsWith("offseason")) advanceOffseason(st);
    else advance(st);
    for (const offer of st.tradeOffers ?? []) {
      if (seen.has(offer.id)) continue;
      seen.set(offer.id, giveKey(offer));
      if (isLateScrap(offer)) scrap++;
      assertLivePicks(st, offer);
      assert.ok(offer.get.some((a) => a.kind === "player"), "a call asks for a player");
    }
  }
  assert.equal(st.phase, "offseason-tag");
  assert.equal(st.rngState, 2875380525);

  advanceOffseason(st);
  assert.equal(st.phase, "offseason-fa");
  assert.equal(st.rngState, 3306901598, "inquiry must not move the parent stream");

  const offers = st.tradeOffers ?? [];
  assert.ok(offers.length >= 1, `free agency opened with no calls (${offers.length})`);
  assert.ok(offers.length <= 2, `inbox is a couple, got ${offers.length}`);
  for (const offer of offers) {
    assert.equal(offer.toTeamId, st.userTeamId);
    assert.notEqual(offer.fromTeamId, st.userTeamId);
    assert.ok(offer.get.some((a) => a.kind === "player"), "a call asks for a player");
    assert.equal(checkTrade(st, offer).ok, true, "a call on the table is legal");
    assertLivePicks(st, offer);
    if (!seen.has(offer.id)) {
      seen.set(offer.id, giveKey(offer));
      if (isLateScrap(offer)) scrap++;
    }
  }

  const shapes = new Set(seen.values());
  assert.ok(seen.size >= 2, `season produced one call shape (${[...shapes].join(" ")})`);
  assert.ok(shapes.size >= 2, `calls were one template (${[...shapes].join(" ")})`);
  assert.ok(scrap < seen.size, `every call was three late picks (${scrap}/${seen.size})`);

  advanceOffseason(st);
  assert.equal(st.phase, "offseason-draft");
  advanceOffseason(st);
  assert.equal(st.phase, "offseason-final", "draft advance lands in camp");
  for (const offer of st.tradeOffers ?? []) assertLivePicks(st, offer);
}

console.log("ok    userOffers — free agency opens with a legal call, parent rng unchanged");

{
  let n = 0;
  let scrap = 0;
  const shapes = new Set<string>();
  for (const seed of [1, 7, 42, 99, 123]) {
    for (const [phase, week] of [
      ["regular", 6],
      ["offseason-fa", 0],
    ] as const) {
      const st = newGame({ seed });
      st.phase = phase;
      st.week = week;
      generateUserOffers(st, new Rng(seed + 3), 2);
      for (const offer of st.tradeOffers ?? []) {
        n++;
        shapes.add(giveKey(offer));
        if (isLateScrap(offer)) scrap++;
        assert.ok(offer.get.some((a) => a.kind === "player"));
        assert.equal(checkTrade(st, offer).ok, true, `${phase} offer must be legal when it arrives`);
        assertLivePicks(st, offer);
      }
    }
  }
  assert.ok(n >= 8, `expected a pile of calls, got ${n}`);
  assert.ok(shapes.size >= 4, `shapes collapsed (${[...shapes].join(" ")})`);
  assert.ok(scrap * 2 < n, `late-pick template was the call (${scrap}/${n})`);
}

console.log("ok    userOffers — incoming calls are not one late-pick template");

{
  const st = newGame({ seed: 5 });
  st.phase = "offseason-draft";
  const from = st.teams.find((t) => t.id !== st.userTeamId)!;
  const used = (st.pickOwners ?? []).find((p) => p.teamId === from.id && p.season === st.season && p.round === 4);
  const future = (st.pickOwners ?? []).find((p) => p.teamId === from.id && p.season === st.season + 1 && p.round === 2);
  const target = st.players.find((p) => p.teamId === st.userTeamId && p.contract && !p.retired);
  assert.ok(used && future && target);
  st.draft = {
    season: st.season,
    onClock: 1,
    complete: false,
    picks: [{
      round: used.round,
      pick: 40,
      teamId: from.id,
      originalTeamId: used.originalTeamId,
      playerId: target.id,
    }],
  };
  const live: TradeOffer = {
    id: 2,
    fromTeamId: from.id,
    toTeamId: st.userTeamId,
    give: [{ kind: "pick", season: future.season, round: future.round, originalTeamId: future.originalTeamId }],
    get: [{ kind: "player", playerId: target.id }],
    season: st.season,
    week: st.week,
    rationale: "",
  };
  const usedAsset = {
    kind: "pick" as const,
    season: used.season,
    round: used.round,
    originalTeamId: used.originalTeamId,
  };
  st.tradeOffers = [
    {
      id: 1,
      fromTeamId: from.id,
      toTeamId: st.userTeamId,
      give: [usedAsset],
      get: [{ kind: "player", playerId: target.id }],
      season: st.season,
      week: st.week,
      rationale: "",
    },
    live,
  ];
  assert.equal(isSpentPick(st, usedAsset), true);
  dropSpentInboxOffers(st);
  assert.deepEqual((st.tradeOffers ?? []).map((o) => o.id), [2], "a used pick leaves the inbox; a future pick stays");

  future.teamId = st.userTeamId;
  dropSpentInboxOffers(st);
  assert.equal((st.tradeOffers ?? []).length, 0, "a pick the club already moved is not still offered");
}

console.log("ok    userOffers — a used or moved pick is not left on the table");

{
  const st = newGame({ seed: 11 });
  st.phase = "regular";
  st.week = 4;
  generateUserOffers(st, new Rng(99), 2);
  const first = (st.tradeOffers ?? []).slice();
  assert.ok(first.length >= 1, "week 4 put a call on the table");
  for (const o of first) assert.equal(o.week, 4);
  st.week = 6;
  generateUserOffers(st, new Rng(100), 2);
  const atSix = (st.tradeOffers ?? []).map((o) => o.id);
  for (const o of first) {
    assert.equal(atSix.includes(o.id), true, `week-4 offer ${o.id} still lives two weeks later`);
  }
  st.week = 7;
  const parent = st.rngState;
  generateUserOffers(st, new Rng(101), 2);
  const atSeven = st.tradeOffers ?? [];
  for (const o of first) {
    assert.equal(
      atSeven.some((x) => x.id === o.id),
      false,
      `offer from week ${o.week} expired at week 7`,
    );
  }
  assert.ok(atSeven.length >= 1, "an expired inbox fills again");
  assert.equal(st.rngState, parent, "topping up uses the rng it was given");
}

console.log("ok    userOffers — an offer expires after two weeks and the inbox fills");
