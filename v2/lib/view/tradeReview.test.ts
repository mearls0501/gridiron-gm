/**
 * Incoming-offer review before Accept commits.
 *
 * Repro: the offer card's only per-asset text is `tradeBoardAssetLabel`,
 * `Name (POS, OVR)`. An injured player and his cap hit never reached the
 * screen, and the offer stores no snapshot, so a call that aged a week
 * accepted blind. The review reads the live save and prices the cap the
 * way `executeTrade` posts it.
 *
 * Fixtures only; no sim, no RNG draws. Run: npx tsx lib/view/tradeReview.test.ts
 */
import assert from "node:assert/strict";
import { newGame } from "../core/newGame";
import { makeContract } from "../core/generate";
import { Rng } from "../core/rng";
import { acceptOffer, executeTrade, proposeFromUser, proposerStillWants } from "../core/trades";
import { capHit, formatMoney, rosterCount, teamCap } from "../core/select";
import type { GameState, Player, TradeOffer } from "../core/types";
import { tradeBoardAssetLabel } from "./tradeBoard";
import { buildOfferReview, ReviewPlayer } from "./tradeReview";

function ok(label: string) { console.log("ok   ", label); }

function rostered(st: GameState, teamId: number): Player[] {
  return st.players.filter((p) => p.teamId === teamId && !p.retired && !p.prospect && p.contract);
}

function fixture(seed = 42) {
  const st = newGame({ seed });
  st.phase = "preseason";
  st.week = 0;
  const cpuTeamId = st.teams.find((t) => t.id !== st.userTeamId)!.id;
  let user: Player | undefined;
  let cpu: Player | undefined;
  // A pair the club would really offer: Accept re-runs its own gain test.
  search: for (const u of rostered(st, st.userTeamId).sort((a, b) => b.ovr - a.ovr)) {
    for (const c of rostered(st, cpuTeamId).filter((p) => p.pos === u.pos).sort((a, b) => a.ovr - b.ovr)) {
      const was = [u.contract, c.contract];
      for (const p of [u, c]) { p.status = undefined; p.injuryWeeks = 0; p.injuryDesc = null; }
      u.contract = makeContract(new Rng(7), 12_000_000, 4, st.season, 2);
      c.contract = makeContract(new Rng(8), 6_000_000, 3, st.season, 0);
      const probe: TradeOffer = {
        id: 0, fromTeamId: cpuTeamId, toTeamId: st.userTeamId,
        give: [{ kind: "player", playerId: c.id }], get: [{ kind: "player", playerId: u.id }],
        season: st.season, week: st.week, rationale: "",
      };
      if (proposerStillWants(st, probe)) { user = u; cpu = c; break search; }
      [u.contract, c.contract] = was;
    }
  }
  assert.ok(user && cpu, "a pair the club would offer");
  for (const id of [st.userTeamId, cpuTeamId]) {
    st.teams[id].capCarryover = (st.teams[id].capCarryover ?? 0) + 200_000_000;
  }
  const offer: TradeOffer = {
    id: st.nextTradeId ?? 1, fromTeamId: cpuTeamId, toTeamId: st.userTeamId,
    give: [{ kind: "player", playerId: cpu.id }], get: [{ kind: "player", playerId: user.id }],
    season: st.season, week: st.week, rationale: "fixture",
  };
  st.tradeOffers = [offer];
  return { st, user, cpu, cpuTeamId, offer };
}

function player(lines: ReturnType<typeof buildOfferReview>["incoming"], id: number): ReviewPlayer {
  const l = lines.find((x) => x.kind === "player" && x.playerId === id);
  assert.ok(l && l.kind === "player");
  return l;
}

// (1) Repro: today's card label carries no injury and no cap.
{
  const { st, cpu, offer } = fixture();
  cpu.injuryWeeks = 6;
  cpu.injuryDesc = "Torn hamstring";
  const label = tradeBoardAssetLabel(st, offer.give[0]);
  assert.doesNotMatch(label, /hamstring|\bOut\b|\bwks?\b|\bIR\b/, "card label omits the injury");
  assert.doesNotMatch(label, /\$/, "card label omits the cap hit");
  assert.ok(!("injury" in offer) && !("cap" in offer), "offer stores no snapshot");
}
ok("repro: offer card shows neither injury nor cap");

// (2) The review shows injury, IR and cap from the live player.
{
  const { st, user, cpu, offer } = fixture();
  const fresh = buildOfferReview(st, offer);
  assert.equal(player(fresh.incoming, cpu.id).injury, null);
  assert.equal(fresh.warnings.some((w) => /hurt|injured reserve/.test(w)), false);

  // The call ages: he gets hurt, then goes on IR.
  cpu.injuryWeeks = 6;
  cpu.injuryDesc = "Torn hamstring";
  const hurt = buildOfferReview(st, offer);
  assert.equal(player(hurt.incoming, cpu.id).injury, "Out 6 wks · Torn hamstring");
  assert.ok(hurt.warnings.some((w) => w.includes("hurt") && w.includes("Torn hamstring")));
  cpu.status = "ir";
  const ir = buildOfferReview(st, offer);
  assert.equal(player(ir.incoming, cpu.id).ir, true);
  assert.ok(ir.warnings.some((w) => w.includes("injured reserve")));
  assert.equal(ir.roster.after, ir.roster.before - 1, "IR arrival is off the 53");

  const u = player(fresh.outgoing, user.id);
  assert.equal(u.capNow, capHit(user.contract));
  assert.ok(u.deadOnSender > 0, "sent contract accelerates its bonus");
  assert.equal(player(fresh.incoming, cpu.id).capAfter, cpu.contract!.baseSalary[0]);
}
ok("review reads injury, IR and cap from the live save");

// (3) Review cap equals what Accept actually moves.
for (const seed of [11, 42, 99]) {
  const { st, offer } = fixture(seed);
  const r = buildOfferReview(st, offer);
  assert.equal(r.check.ok, true);
  const before = teamCap(st, st.userTeamId).space;
  const deadBefore = st.teams[st.userTeamId].deadCap ?? 0;
  assert.equal(r.cap.spaceBefore, before);
  assert.equal(acceptOffer(st, offer.id).ok, true);
  const after = teamCap(st, st.userTeamId).space;
  assert.ok(Math.abs(after - r.cap.spaceAfter) <= 2, `seed ${seed}: review ${r.cap.spaceAfter} vs actual ${after}`);
  assert.ok(Math.abs((st.teams[st.userTeamId].deadCap ?? 0) - deadBefore - r.cap.deadAdded) <= 1);
  assert.equal(rosterCount(st, st.userTeamId), r.roster.after);
  assert.ok(r.warnings.some((w) => w.includes(formatMoney(r.cap.deadAdded))), "dead money is spelled out");
}
ok("review cap and roster match the executed trade");

// (4) Building a review is read-only.
{
  const { st, offer } = fixture();
  const before = JSON.stringify(st);
  buildOfferReview(st, offer);
  buildOfferReview(st, offer);
  assert.equal(JSON.stringify(st), before, "opening a review mutates nothing");
}
ok("review is pure");

// (5) Refusals surface before Confirm, with the engine's reason.
{
  const { st, user, offer } = fixture();
  user.teamId = null;
  const r = buildOfferReview(st, offer);
  assert.equal(r.check.ok, false);
  assert.match(r.check.reason ?? "", /not on that roster/);
}
{
  const { st, offer } = fixture();
  st.phase = "regular";
  st.week = 10;
  assert.match(buildOfferReview(st, offer).check.reason ?? "", /window is closed/);
}
{
  const { st, cpu, offer } = fixture();
  cpu.retired = true;
  st.players = st.players.filter((p) => p.id !== cpu.id);
  const r = buildOfferReview(st, offer);
  assert.equal(r.incoming[0].kind, "missing");
  assert.equal(r.check.ok, false);
}
ok("refusals and missing players show before Confirm");

// (6) Offseason: over 53 is a note, not a block.
{
  const { st, user, offer } = fixture();
  st.phase = "offseason-fa";
  user.status = "ir";
  const spare = st.players.filter((p) => p.teamId === null && !p.retired && !p.prospect);
  let i = 0;
  while (rosterCount(st, st.userTeamId) < 53) {
    const p = spare[i++];
    p.teamId = st.userTeamId;
    p.status = undefined;
  }
  const r = buildOfferReview(st, offer);
  assert.equal(r.roster.after, 54);
  assert.equal(r.check.ok, true);
  assert.ok(r.warnings.some((w) => w.includes("Cutdown")));
}
ok("offseason over-53 is noted, not blocked");

// (7) The user's own proposal reads from the user's side and matches execution.
for (const seed of [11, 42, 99]) {
  const { st, user, cpu, cpuTeamId } = fixture(seed);
  st.tradeOffers = [];
  const before = JSON.stringify(st);
  const prop = proposeFromUser(
    st, cpuTeamId, [{ kind: "player", playerId: user.id }], [{ kind: "player", playerId: cpu.id }],
  );
  const r = buildOfferReview(st, prop.offer);
  assert.equal(JSON.stringify(st), before, "proposal review mutates nothing");
  assert.equal(r.partnerTeamId, cpuTeamId);
  assert.equal(player(r.incoming, cpu.id).capAfter, cpu.contract!.baseSalary[0], "arrival on the user's side");
  assert.ok(player(r.outgoing, user.id).deadOnSender > 0, "departure on the user's side");
  assert.equal(r.check.ok, prop.check.ok);
  const idBefore = st.nextTradeId ?? 1;
  assert.equal(prop.offer.id, idBefore, "a proposal takes the next trade id");
  assert.equal(executeTrade(st, prop.offer).ok, true);
  // /trades no longer adds a second bump; inquiry streams key on this id.
  assert.equal(st.nextTradeId, idBefore + 1, "a completed proposal uses exactly one id");
  assert.ok(Math.abs(teamCap(st, st.userTeamId).space - r.cap.spaceAfter) <= 2, `seed ${seed}: proposal cap`);
  assert.equal(rosterCount(st, st.userTeamId), r.roster.after);
}
ok("proposal review reads the user's side and matches execution");

console.log("tradeReview view: all passed");
