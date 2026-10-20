/**
 * What an incoming-offer review has to show, measured before the review exists.
 *
 * Cap, per docs/nfl-reference.md "Trade cap accounting": the sender's
 * uncharged signing bonus accelerates onto its cap (CBA Art. 13 §6(b)(ii));
 * the receiver takes on base salary and the guarantee on it. `checkTrade`
 * prices exactly what `executeTrade` posts. Until 2026-10-20 the check also
 * charged the sender the guaranteed base while execution charged it to
 * nobody; cases 1–3 are that gap, closed.
 *
 * Stale offers: an offer is priced when it is made and stores no injury or
 * cap snapshot, so the review reads the live player. At Accept the calling
 * club re-runs its own gain test (`proposerStillWants`), the way a physical
 * would: an injury it can live with still goes through; one that tips the
 * deal withdraws the offer. A refused Accept (`checkTrade`) leaves the save
 * byte-identical and the offer in the inbox; a withdrawal removes only the
 * offer.
 *
 * Fixtures only; no sim, no parent RNG draws. Run: npx tsx lib/core/tradeReview.test.ts
 */
import assert from "node:assert/strict";
import { newGame } from "./newGame";
import { makeContract } from "./generate";
import { Rng } from "./rng";
import { acceptOffer, checkTrade, generateUserOffers, proposerStillWants } from "./trades";
import { startRegularSeason } from "./season/engine";
import { capHit, deadMoney, remainingBonusProration, rosterCount, teamCap } from "./select";
import { TRADE_DEADLINE_WEEK } from "./types";
import type { GameState, Player, TradeAsset, TradeOffer } from "./types";

function ok(label: string) { console.log("ok   ", label); }

type St = GameState;

function rostered(st: St, teamId: number): Player[] {
  return st.players.filter((p) => p.teamId === teamId && !p.retired && !p.prospect && p.contract);
}

/**
 * A same-position 1-for-1 so roster counts and position minimums hold, with
 * the fixture contracts planted, that the calling club would really make:
 * `acceptOffer` re-runs its own gain test.
 */
function swapPair(st: St): { user: Player; cpu: Player; cpuTeamId: number } {
  for (const t of st.teams) {
    if (t.id === st.userTeamId) continue;
    for (const u of rostered(st, st.userTeamId).sort((a, b) => b.ovr - a.ovr)) {
      for (const c of rostered(st, t.id).filter((p) => p.pos === u.pos).sort((a, b) => a.ovr - b.ovr)) {
        const was = [u.contract, c.contract];
        u.contract = makeContract(new Rng(7), 12_000_000, 4, st.season, 2);
        c.contract = makeContract(new Rng(8), 6_000_000, 3, st.season, 0);
        const probe: TradeOffer = {
          id: 0, fromTeamId: t.id, toTeamId: st.userTeamId,
          give: [{ kind: "player", playerId: c.id }], get: [{ kind: "player", playerId: u.id }],
          season: st.season, week: st.week, rationale: "",
        };
        if (proposerStillWants(st, probe)) return { user: u, cpu: c, cpuTeamId: t.id };
        [u.contract, c.contract] = was;
      }
    }
  }
  throw new Error("no pair the club would offer");
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
  for (const p of st.players) {
    if (p.teamId === null || p.retired || p.prospect) continue;
    p.status = undefined;
    p.injuryWeeks = 0;
    p.injuryDesc = null;
  }
  const { user, cpu, cpuTeamId } = swapPair(st);
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
    /** The old check: full deadMoney on the sender. */
    oldChecked: deadMoney(uc) - capHit(uc) + incoming,
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

  // The sender posts the bonus only; the guarantee travels with the contract.
  const posted = (st.teams[st.userTeamId].deadCap ?? 0) - userDeadBefore;
  assert.ok(Math.abs(posted - userBonusLeft) <= 1, `seed ${seed}: sender posts bonus only (${posted} vs ${userBonusLeft})`);
  assert.equal(user.teamId, cpuTeamId, "player moved");
  assert.equal(user.contract!.guaranteedYears, 2, "receiver holds the guarantee");
  assert.equal(user.contract!.signingBonus, 0, "receiver holds no bonus");
  assert.equal(capHit(user.contract), user.contract!.baseSalary[0], "receiver's hit is base only");
  assert.equal(deadMoney(user.contract), want.guaranteedBase, "cutting him costs the receiver the guaranteed base");
  assert.equal((st.tradeOffers ?? []).length, 0, "accepted offer leaves the inbox");
}
ok("execution: sender's bonus accelerates; receiver takes base and the guarantee");

// (2) Closed gap: a deal that fits under the old check's over-charge now passes.
for (const seed of [11, 42, 99]) {
  const { st, user, cpu, offer } = fixture(seed);
  const want = userCharge(user, cpu);
  setUserSpace(st, want.actual + Math.floor(want.guaranteedBase / 2));
  assert.ok(teamCap(st, st.userTeamId).space < want.oldChecked, "the old check would have refused");
  const res = checkTrade(st, offer);
  assert.equal(res.ok, true, `seed ${seed}: check passes what execution fits (${res.reason})`);
  assert.equal(acceptOffer(st, offer.id).ok, true);
  assert.ok(teamCap(st, st.userTeamId).space >= 0, "and execution leaves the club legal");
}
ok("check passes what execution fits");

// (3) The refusal boundary is the executed charge.
{
  const { st, user, cpu, offer } = fixture(42);
  const want = userCharge(user, cpu);
  setUserSpace(st, want.actual);
  assert.equal(checkTrade(st, offer).ok, true, "exactly the executed charge fits");
  setUserSpace(st, want.actual - 1);
  assert.equal(checkTrade(st, offer).ok, false, "one dollar short is refused");
  refusedUnchanged(st, offer.id, /cannot fit/, "one dollar short");
}
ok("executed charge is the refusal boundary");

// (4) Stale: injury after the offer. A short one is priced in and the deal stands.
{
  const { st, user, cpuTeamId, offer } = fixture(42);
  assert.deepEqual(
    Object.keys(offer).sort(),
    ["fromTeamId", "get", "give", "id", "rationale", "season", "toTeamId", "week"],
    "offer carries no injury or cap snapshot",
  );
  user.injuryWeeks = 6;
  user.injuryDesc = "Torn hamstring";
  assert.equal(proposerStillWants(st, offer), true, "a six-week injury on this player is still worth it");
  assert.equal(acceptOffer(st, offer.id).ok, true, "CPU still takes an injured player");
  assert.equal(user.teamId, cpuTeamId);
  assert.equal(user.injuryWeeks, 6, "injury travels with him");
}
ok("stale injury: accept still executes; review must read the live player");

// (4b) Stale: an injury that tips the deal. The club pulls the offer at Accept.
{
  let found = false;
  for (const seed of [11, 42, 99]) {
    const st = newGame({ seed });
    st.phase = "preseason";
    st.week = 0;
    for (const t of st.teams) t.capCarryover = (t.capCarryover ?? 0) + 200_000_000;
    // A healthy-wanted, hurt-unwanted pair: the margin case a physical exists for.
    for (const t of st.teams) {
      if (t.id === st.userTeamId || found) continue;
      for (const u of rostered(st, st.userTeamId)) {
        if (found) break;
        for (const c of rostered(st, t.id).filter((p) => p.pos === u.pos)) {
          for (const p of [u, c]) { p.status = undefined; p.injuryWeeks = 0; p.injuryDesc = null; }
          const offer: TradeOffer = {
            id: st.nextTradeId ?? 1, fromTeamId: t.id, toTeamId: st.userTeamId,
            give: [{ kind: "player", playerId: c.id }], get: [{ kind: "player", playerId: u.id }],
            season: st.season, week: st.week, rationale: "fixture",
          };
          if (!proposerStillWants(st, offer) || !checkTrade(st, offer).ok) continue;
          u.injuryWeeks = 16;
          u.injuryDesc = "Torn ACL";
          if (proposerStillWants(st, offer)) { u.injuryWeeks = 0; u.injuryDesc = null; continue; }

          st.tradeOffers = [offer, { ...offer, id: offer.id + 1 }];
          const players = JSON.stringify(st.players);
          const teams = JSON.stringify(st.teams);
          const res = acceptOffer(st, offer.id);
          assert.equal(res.ok, false, "club withdraws");
          assert.match(res.reason ?? "", new RegExp(`${t.abbr} pulled the offer after ${u.firstName} ${u.lastName}'s physical`));
          assert.equal(JSON.stringify(st.players), players, "nobody moves");
          assert.equal(JSON.stringify(st.teams), teams, "no cap moves");
          assert.deepEqual(st.tradeOffers.map((o) => o.id), [offer.id + 1], "only that offer leaves the inbox");
          assert.equal(acceptOffer(st, offer.id).reason, "That offer is no longer on the table.");
          found = true;
          break;
        }
      }
    }
    if (found) break;
  }
  assert.ok(found, "a seed has a margin deal that a long injury tips");
}
ok("stale injury that tips the deal: club withdraws, nothing else moves");

// (4c) An offer nothing has touched is never pulled: the re-check is the
// same test every user-offer path ran when it made the call.
{
  let n = 0;
  for (const seed of [11, 42, 99]) {
    for (const phase of ["offseason-fa", "preseason", "regular"] as const) {
      const st = newGame({ seed });
      if (phase === "regular") { startRegularSeason(st); st.week = TRADE_DEADLINE_WEEK; }
      else { st.phase = phase; st.week = 0; }
      for (let k = 0; k < 3; k++) {
        st.tradeOffers = [];
        for (const o of generateUserOffers(st, new Rng(seed * 100 + k), 2)) {
          n++;
          assert.equal(proposerStillWants(st, o), true, `seed ${seed} ${phase}: fresh offer ${o.id} still wanted`);
        }
      }
    }
  }
  assert.ok(n >= 20, `enough fresh offers checked (${n})`);
}
ok("fresh offers survive the re-check");

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
