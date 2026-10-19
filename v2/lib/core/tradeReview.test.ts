/**
 * What an incoming-offer review has to show, measured before the review exists.
 *
 * Cap: `checkTrade` and `executeTrade` price a departing contract differently.
 * The check charges the sender full `deadMoney` (uncharged bonus plus remaining
 * guaranteed base). `moveAsset` posts only the uncharged bonus, and the
 * receiver's copy has `guaranteedYears` 0, so the guaranteed base is charged
 * to nobody. The review must print what Accept actually does. These cases pin
 * both numbers and the gap; when the accounting is unified, flip the KNOWN GAP
 * assertions on purpose.
 *
 * Stale offers: an offer is priced when it is made. `acceptOffer` re-runs only
 * `checkTrade`, never `evaluateOffer`, so an injury or IR move after the call
 * still goes through. The offer stores no injury or cap snapshot, so the
 * review has to read the live player. A refused Accept leaves the save
 * byte-identical and the offer in the inbox.
 *
 * Fixtures only; no sim, no parent RNG draws. Run: npx tsx lib/core/tradeReview.test.ts
 */
import assert from "node:assert/strict";
import { newGame } from "./newGame";
import { makeContract } from "./generate";
import { Rng } from "./rng";
import { acceptOffer, checkTrade } from "./trades";
import { capHit, deadMoney, remainingBonusProration, rosterCount, teamCap } from "./select";
import type { GameState, Player, TradeAsset, TradeOffer } from "./types";

function ok(label: string) { console.log("ok   ", label); }

type St = GameState;

function rostered(st: St, teamId: number): Player[] {
  return st.players.filter((p) => p.teamId === teamId && !p.retired && !p.prospect && p.contract);
}

/** A same-position 1-for-1 so roster counts and position minimums hold. */
function swapPair(st: St): { user: Player; cpu: Player; cpuTeamId: number } {
  const cpuTeamId = st.teams.find((t) => t.id !== st.userTeamId)!.id;
  for (const u of rostered(st, st.userTeamId).sort((a, b) => b.ovr - a.ovr)) {
    const c = rostered(st, cpuTeamId).find((p) => p.pos === u.pos);
    if (c) return { user: u, cpu: c, cpuTeamId };
  }
  throw new Error("no same-position pair");
}

function offerFor(st: St, cpuTeamId: number, give: TradeAsset[], get: TradeAsset[]): TradeOffer {
  const offer: TradeOffer = {
    id: st.nextTradeId ?? 1,
    fromTeamId: cpuTeamId,
    toTeamId: st.userTeamId,
    give,
    get,
    season: st.season,
    week: st.week,
    rationale: "fixture",
  };
  st.tradeOffers = [offer];
  return offer;
}

/** Fresh preseason club pair: user sends a guaranteed deal, CPU sends a plain one. */
function fixture(seed: number) {
  const st = newGame({ seed });
  st.phase = "preseason";
  st.week = 0;
  st.tradeOffers = [];
  const { user, cpu, cpuTeamId } = swapPair(st);
  user.status = undefined;
  cpu.status = undefined;
  user.injuryWeeks = 0;
  cpu.injuryWeeks = 0;
  user.contract = makeContract(new Rng(7), 12_000_000, 4, st.season, 2);
  cpu.contract = makeContract(new Rng(8), 6_000_000, 3, st.season, 0);
  // Room on both sides; cases that test the cap set the user's space exactly.
  st.teams[cpuTeamId].capCarryover = (st.teams[cpuTeamId].capCarryover ?? 0) + 200_000_000;
  st.teams[st.userTeamId].capCarryover = (st.teams[st.userTeamId].capCarryover ?? 0) + 200_000_000;
  const offer = offerFor(st, cpuTeamId, [{ kind: "player", playerId: cpu.id }], [{ kind: "player", playerId: user.id }]);
  return { st, user, cpu, cpuTeamId, offer };
}

/** What the check charges the user, and what execution actually charges. */
function userCharge(user: Player, cpu: Player) {
  const uc = user.contract!;
  const guaranteedBase = deadMoney(uc) - Math.round(remainingBonusProration(uc));
  const incoming = cpu.contract!.baseSalary[0] ?? 0;
  return {
    checked: deadMoney(uc) - capHit(uc) + incoming,
    actual: Math.round(remainingBonusProration(uc)) - capHit(uc) + incoming,
    guaranteedBase,
  };
}

function setUserSpace(st: St, target: number): void {
  const t = st.teams[st.userTeamId];
  t.capCarryover = 0;
  const base = teamCap(st, st.userTeamId).space;
  if (target >= base) t.capCarryover = target - base;
  else t.deadCap = (t.deadCap ?? 0) + (base - target);
  assert.equal(Math.round(teamCap(st, st.userTeamId).space), Math.round(target));
}

function refusedUnchanged(st: St, offerId: number, reason: RegExp, label: string): void {
  const before = JSON.stringify(st);
  const res = acceptOffer(st, offerId);
  assert.equal(res.ok, false, `${label}: accept refused`);
  assert.match(res.reason ?? "", reason, `${label}: reason`);
  assert.equal(JSON.stringify(st), before, `${label}: refused accept mutates nothing`);
  assert.ok((st.tradeOffers ?? []).some((o) => o.id === offerId), `${label}: offer stays in the inbox`);
}

// (1) Execution ground truth: what Accept moves on both caps.
for (const seed of [11, 42, 99]) {
  const { st, user, cpu, cpuTeamId, offer } = fixture(seed);
  const want = userCharge(user, cpu);
  assert.ok(want.guaranteedBase > 0, "fixture deal carries guaranteed base");
  const cpuCheckedIn = user.contract!.baseSalary[0];
  const cpuOut = Math.round(remainingBonusProration(cpu.contract!)) - capHit(cpu.contract!);
  const userBefore = teamCap(st, st.userTeamId);
  const cpuBefore = teamCap(st, cpuTeamId);
  const userDeadBefore = st.teams[st.userTeamId].deadCap ?? 0;
  const userBonusLeft = Math.round(remainingBonusProration(user.contract!));

  const c0 = checkTrade(st, offer);
  assert.equal(c0.ok, true, `roomy fixture passes the check: ${c0.reason}`);
  assert.equal(acceptOffer(st, offer.id).ok, true, "accept executes");

  const userDelta = userBefore.space - teamCap(st, st.userTeamId).space;
  const cpuDelta = cpuBefore.space - teamCap(st, cpuTeamId).space;
  assert.ok(Math.abs(userDelta - want.actual) <= 2, `seed ${seed}: user space moved ${userDelta}, expected ${want.actual}`);
  assert.ok(Math.abs(cpuDelta - (cpuOut + cpuCheckedIn)) <= 2, `seed ${seed}: CPU space moved ${cpuDelta}`);

  // KNOWN GAP: the check over-charges by exactly the guaranteed base.
  assert.ok(Math.abs(want.checked - want.actual - want.guaranteedBase) <= 1, "gap is the guaranteed base");

  // KNOWN GAP: the guaranteed base is posted to nobody.
  const posted = (st.teams[st.userTeamId].deadCap ?? 0) - userDeadBefore;
  assert.ok(Math.abs(posted - userBonusLeft) <= 1, `seed ${seed}: sender posts bonus only (${posted} vs ${userBonusLeft})`);
  assert.equal(user.teamId, cpuTeamId, "player moved");
  assert.equal(user.contract!.guaranteedYears, 0, "receiver holds no guarantee");
  assert.equal(user.contract!.signingBonus, 0, "receiver holds no bonus");
  assert.equal(capHit(user.contract), user.contract!.baseSalary[0], "receiver's hit is base only");
  assert.equal(deadMoney(user.contract), 0, "receiver can cut him for free");
  assert.equal((st.tradeOffers ?? []).length, 0, "accepted offer leaves the inbox");
}
ok("execution moves both caps by bonus acceleration and incoming base, not the guarantee");

// (2) KNOWN GAP: the check refuses a deal that execution would fit.
for (const seed of [11, 42, 99]) {
  const { st, user, cpu, offer } = fixture(seed);
  const want = userCharge(user, cpu);
  setUserSpace(st, want.actual + Math.floor(want.guaranteedBase / 2));
  const res = checkTrade(st, offer);
  assert.equal(res.ok, false, `seed ${seed}: check refuses`);
  assert.match(res.reason ?? "", /cannot fit the contracts/);
  assert.ok(teamCap(st, st.userTeamId).space - want.actual > 0, "execution would leave room");
  refusedUnchanged(st, offer.id, /cannot fit/, `seed ${seed} cap gap`);
}
ok("KNOWN GAP: check refuses a deal that would fit; refusal mutates nothing");

// (3) Above and below the checked figure the check agrees with itself.
{
  const { st, user, cpu, offer } = fixture(42);
  const want = userCharge(user, cpu);
  setUserSpace(st, want.checked);
  assert.equal(checkTrade(st, offer).ok, true, "exactly the checked charge fits");
  setUserSpace(st, want.checked - 1);
  assert.equal(checkTrade(st, offer).ok, false, "one dollar short is refused");
}
ok("checked charge is the refusal boundary");

// (4) Stale: injury after the offer. No re-evaluation; the offer has no snapshot.
{
  const { st, user, cpuTeamId, offer } = fixture(42);
  assert.deepEqual(
    Object.keys(offer).sort(),
    ["fromTeamId", "get", "give", "id", "rationale", "season", "toTeamId", "week"],
    "offer carries no injury or cap snapshot",
  );
  user.injuryWeeks = 6;
  user.injuryDesc = "Torn hamstring";
  assert.equal(acceptOffer(st, offer.id).ok, true, "CPU still takes an injured player");
  assert.equal(user.teamId, cpuTeamId);
  assert.equal(user.injuryWeeks, 6, "injury travels with him");
}
ok("stale injury: accept still executes; review must read the live player");

// (5) Stale: IR move after the offer. IR is off the 53 on both sides, so the
// user's count rises by one; at 53 that turns a legal call into a refusal.
{
  const { st, user, cpuTeamId, offer } = fixture(42);
  user.status = "ir";
  const userN = rosterCount(st, st.userTeamId);
  const cpuN = rosterCount(st, cpuTeamId);
  assert.ok(userN < 53, `fixture user roster has room (${userN})`);
  assert.equal(acceptOffer(st, offer.id).ok, true, "IR player still traded");
  assert.equal(rosterCount(st, st.userTeamId), userN + 1, "user: active player arrives, IR leaves uncounted");
  assert.equal(rosterCount(st, cpuTeamId), cpuN - 1, "CPU: active leaves, IR arrives uncounted");
  assert.equal(user.status, "ir", "IR status travels");
}
{
  const { st, user, offer } = fixture(42);
  user.status = "ir";
  // Fill the user's 53 with street bodies so the arriving player is the 54th.
  const spare = st.players.filter((p) => p.teamId === null && !p.retired && !p.prospect);
  let i = 0;
  while (rosterCount(st, st.userTeamId) < 53) {
    const p = spare[i++];
    assert.ok(p, "enough street players to fill 53");
    p.teamId = st.userTeamId;
    p.status = undefined;
  }
  refusedUnchanged(st, offer.id, /would be at 54 players/, "IR at a full 53");
}
ok("stale IR: counts treat IR as off the 53; a full roster refuses");

// (6) Stale: refusals leave the save and the inbox untouched.
{
  const { st, user, offer } = fixture(42);
  user.teamId = null;
  refusedUnchanged(st, offer.id, /is not on that roster/, "released");
}
{
  const { st, cpu, offer } = fixture(42);
  cpu.retired = true;
  refusedUnchanged(st, offer.id, /cannot be traded/, "retired");
}
{
  const { st, offer } = fixture(42);
  st.phase = "regular";
  st.week = 10;
  refusedUnchanged(st, offer.id, /window is closed/, "deadline passed");
}
{
  const { st, offer } = fixture(42);
  st.teams[st.userTeamId].deadCap = (st.teams[st.userTeamId].deadCap ?? 0) + 500_000_000;
  refusedUnchanged(st, offer.id, /cannot fit/, "cap moved");
}
{
  const { st, offer } = fixture(42);
  const before = JSON.stringify(st);
  const res = acceptOffer(st, offer.id + 1000);
  assert.equal(res.ok, false);
  assert.match(res.reason ?? "", /no longer on the table/);
  assert.equal(JSON.stringify(st), before, "missing offer mutates nothing");
}
ok("stale refusals: released, retired, closed window, cap, missing");

// (7) Stale picks: used after the call, or moved to a third club.
{
  const { st, cpuTeamId } = fixture(42);
  const pick = (st.pickOwners ?? []).find((p) => p.teamId === cpuTeamId && p.season === st.season);
  assert.ok(pick, "CPU holds a current-season pick");
  const asset: TradeAsset = { kind: "pick", season: pick.season, round: pick.round, originalTeamId: pick.originalTeamId };
  const offer = offerFor(st, cpuTeamId, [asset], []);
  assert.equal(checkTrade(st, offer).ok, true, "live pick passes");
  const draftBefore = st.draft;
  st.draft = { ...(st.draft ?? {}), season: pick.season, complete: true } as St["draft"];
  refusedUnchanged(st, offer.id, /already been used/, "used pick");
  st.draft = draftBefore;
  const third = st.teams.find((t) => t.id !== cpuTeamId && t.id !== st.userTeamId)!.id;
  pick.teamId = third;
  refusedUnchanged(st, offer.id, /belongs to someone else/, "moved pick");
}
ok("stale picks: used and moved picks refused without mutation");

console.log("tradeReview: all passed");
