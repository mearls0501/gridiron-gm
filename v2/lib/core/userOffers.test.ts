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
import { Rng } from "./rng";
import { advance } from "./season/engine";
import { advanceOffseason } from "./offseason";
import { checkTrade, dropSpentInboxOffers, generateUserOffers, isSpentPick } from "./trades";
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
