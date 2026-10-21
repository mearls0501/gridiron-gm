/**
 * In-season base salary is pro rata by regular-season week.
 * Design and decisions: docs/pro-rata-salary-design-2026-10-20.md.
 *
 * Base salary is paid in 18 weekly installments (CBA Art. 26 §5). A club
 * carries only the weeks it holds a contract; a trade or a cut leaves the
 * weeks already paid on the club he leaves (`salaryPaidOut`, not dead money);
 * a mid-season signing costs the weeks left; a playoff signing starts next
 * league year. Out of season nothing changes.
 *
 * Fixtures only: weeks are set by marking that week's games final, no sim.
 * Run: npx tsx lib/core/proRata.test.ts
 */
import assert from "node:assert/strict";
import { newGame } from "./newGame";
import { makeContract } from "./generate";
import { Rng } from "./rng";
import { startRegularSeason } from "./season/engine";
import {
  annualCapHit, capHit, clearDeadCap, deadMoney, expiresAtRollover, regularWeeksPaid,
  remainingBonusProration, teamCap,
} from "./select";
import { executeTrade, checkTrade, acceptOffer } from "./trades";
import {
  applyRestructure, cutPlayer, expireContracts, expiringPlayers, restructurePreview, signPlayer,
} from "./offseason/contracts";
import { buildOfferReview } from "../view/tradeReview";
import { GameState, LEAGUE_MINIMUM, Player, REGULAR_SEASON_WEEKS, TradeOffer } from "./types";

const W = REGULAR_SEASON_WEEKS;
function ok(label: string) { console.log("ok   ", label); }

/** Regular season with weeks 1..w final and the user between weeks. */
function atWeek(st: GameState, w: number): void {
  if (st.phase !== "regular") startRegularSeason(st);
  for (const g of st.games) {
    if (g.season === st.season && g.playoffRound === null && g.week <= w) g.played = true;
  }
  st.week = w + 1;
}

function rostered(st: GameState, teamId: number): Player[] {
  return st.players.filter((p) => p.teamId === teamId && !p.retired && !p.prospect && p.contract);
}

function fixture(seed = 42) {
  const st = newGame({ seed });
  const cpuTeamId = st.teams.find((t) => t.id !== st.userTeamId)!.id;
  for (const t of st.teams) t.capCarryover = (t.capCarryover ?? 0) + 200_000_000;
  let user: Player | undefined;
  let cpu: Player | undefined;
  for (const u of rostered(st, st.userTeamId).sort((a, b) => b.ovr - a.ovr)) {
    cpu = rostered(st, cpuTeamId).find((p) => p.pos === u.pos);
    if (cpu) { user = u; break; }
  }
  assert.ok(user && cpu);
  for (const p of [user, cpu]) { p.status = undefined; p.injuryWeeks = 0; }
  user.contract = makeContract(new Rng(7), 18_000_000, 4, st.season, 2);
  cpu.contract = makeContract(new Rng(8), 9_000_000, 3, st.season, 0);
  return { st, user, cpu, cpuTeamId };
}

const swap = (st: GameState, cpuTeamId: number, give: Player, get: Player): TradeOffer => ({
  id: st.nextTradeId ?? 1, fromTeamId: cpuTeamId, toTeamId: st.userTeamId,
  give: [{ kind: "player", playerId: give.id }], get: [{ kind: "player", playerId: get.id }],
  season: st.season, week: st.week, rationale: "fixture",
});

const near = (a: number, b: number, msg: string) => assert.ok(Math.abs(a - b) <= 2, `${msg}: ${a} vs ${b}`);

// (1) Weeks paid: 0 out of season, counts final weeks in season, 18 in the playoffs.
{
  const st = newGame({ seed: 42 });
  assert.equal(regularWeeksPaid(st), 0, "preseason");
  startRegularSeason(st);
  assert.equal(regularWeeksPaid(st), 0, "week 1 not yet played");
  atWeek(st, 8);
  assert.equal(regularWeeksPaid(st), 8, "between weeks: state.week is 9, eight weeks final");
  st.week = 8;
  assert.equal(regularWeeksPaid(st), 8, "inside simulateWeek: state.week is 8 and final");
  st.phase = "playoffs";
  assert.equal(regularWeeksPaid(st), W, "playoffs");
}
ok("weeks paid reads the same from inside a week and between weeks");

// (2) Trade after week 8: the year splits 8/18 to the sender, 10/18 to the receiver.
{
  const { st, user, cpu, cpuTeamId } = fixture();
  atWeek(st, 8);
  const B = user.contract!.baseSalary[0];
  const bonusLeft = Math.round(remainingBonusProration(user.contract!));
  const before = teamCap(st, st.userTeamId);
  const hitBefore = capHit(user.contract);
  const cpuB = cpu.contract!.baseSalary[0];
  const offer = swap(st, cpuTeamId, cpu, user);
  assert.equal(checkTrade(st, offer).ok, true);
  assert.equal(executeTrade(st, offer).ok, true);
  near(st.teams[st.userTeamId].salaryPaidOut ?? 0, B * 8 / W, "sender keeps the 8 paid weeks");
  near(capHit(user.contract), B * 10 / W, "receiver carries the 10 weeks left, no bonus");
  near((st.teams[st.userTeamId].salaryPaidOut ?? 0) + capHit(user.contract), B, "the year adds up to one base");
  assert.equal(user.contract!.weeksBefore, 8);
  assert.equal(annualCapHit(user.contract), B, "annual rate is the base once the bonus stayed behind");
  // Sender's room: drops the hit it carried, keeps the bonus and the paid
  // weeks, and takes on the arrival's 10 weeks.
  const after = teamCap(st, st.userTeamId);
  near(before.space - after.space, bonusLeft + B * 8 / W - hitBefore + cpuB * 10 / W, "sender's space change");
}
ok("a week-8 trade splits the year 8/18 and 10/18");

// (3) Traded twice: three clubs, three shares, one base.
{
  const { st, user, cpu, cpuTeamId } = fixture();
  const B = user.contract!.baseSalary[0];
  const cpuB = cpu.contract!.baseSalary[0];
  atWeek(st, 3);
  assert.equal(executeTrade(st, swap(st, cpuTeamId, cpu, user)).ok, true);
  const third = st.teams.find((t) => t.id !== st.userTeamId && t.id !== cpuTeamId)!.id;
  const back = rostered(st, third).find((p) => p.pos === user.pos)!;
  back.status = undefined;
  atWeek(st, 8);
  const offer2: TradeOffer = {
    id: (st.nextTradeId ?? 1), fromTeamId: third, toTeamId: cpuTeamId,
    give: [{ kind: "player", playerId: back.id }], get: [{ kind: "player", playerId: user.id }],
    season: st.season, week: st.week, rationale: "fixture",
  };
  assert.equal(executeTrade(st, offer2).ok, true, checkTrade(st, offer2).reason ?? "");
  near(st.teams[st.userTeamId].salaryPaidOut ?? 0, B * 3 / W, "first club: weeks 1-3");
  // The second club also sent its own player away in the first deal.
  near(st.teams[cpuTeamId].salaryPaidOut ?? 0, B * 5 / W + cpuB * 3 / W, "second club: weeks 4-8, plus its man's 1-3");
  near(capHit(user.contract), B * 10 / W, "third club: weeks 9-18");
}
ok("a player traded twice splits the year three ways");

// (4) Cut after week 11: paid weeks stay; a claimant or a clear sees only the rest.
{
  const { st, user } = fixture();
  atWeek(st, 11);
  const B = user.contract!.baseSalary[0];
  const bonus = Math.round(remainingBonusProration(user.contract!));
  const res = cutPlayer(st, user.id);
  assert.equal(res.ok, true);
  near(st.teams[st.userTeamId].salaryPaidOut ?? 0, B * 11 / W, "11 paid weeks stay on the club");
  assert.equal(st.teams[st.userTeamId].deadCap, 0, "paid weeks are not dead money");
  // A claimant takes the contract as it stands: 7 weeks of base.
  near(capHit({ ...user.contract!, signingBonus: 0 }), B * 7 / W, "claimant's base share is 7/18");
  // A clear charges the guaranteed remainder: 7/18 of this year, all of next, plus the bonus.
  const next = user.contract!.baseSalary[1];
  near(deadMoney(user.contract), bonus + B * 7 / W + next, "a clear charges what is still owed");
}
ok("a week-11 cut keeps 11 weeks and passes on 7");

// (5) A week-16 street signing costs 2/18 of base.
{
  const st = newGame({ seed: 42 });
  atWeek(st, 16);
  const fa = st.players.find((p) => p.teamId === null && !p.retired && !p.prospect && p.ovr > 55)!;
  const cut = rostered(st, st.userTeamId).sort((a, b) => a.ovr - b.ovr)[0];
  assert.equal(cutPlayer(st, cut.id).ok, true);
  st.teams[st.userTeamId].capCarryover = (st.teams[st.userTeamId].capCarryover ?? 0) + 100_000_000;
  const r = signPlayer(st, fa.id, st.userTeamId, 2, 30_000_000, new Rng(3));
  assert.equal(r.ok, true, r.reason ?? "");
  const c = fa.contract!;
  assert.equal(c.weeksBefore, 16);
  near(capHit({ ...c, signingBonus: 0 }), c.baseSalary[0] * 2 / W, "two weeks of base");
  assert.equal(annualCapHit(c) >= c.baseSalary[0], true);
}
ok("a week-16 signing costs two weeks of base");

// (6) The trade review prices exactly what execution posts, in season.
for (const seed of [11, 42, 99]) {
  const { st, user, cpu, cpuTeamId } = fixture(seed);
  atWeek(st, 6);
  const offer = swap(st, cpuTeamId, cpu, user);
  st.tradeOffers = [offer];
  const r = buildOfferReview(st, offer);
  assert.equal(r.check.ok, true);
  // Accept may be withdrawn by the club's own re-check; execute directly for the cap read.
  assert.equal(executeTrade(st, offer).ok, true);
  near(teamCap(st, st.userTeamId).space, r.cap.spaceAfter, `seed ${seed}: review matches execution`);
  void acceptOffer;
}
ok("in-season review matches execution");

// (7) Restructure in season converts only unpaid base.
{
  const { st, user } = fixture();
  atWeek(st, 9);
  const B = user.contract!.baseSalary[0];
  const pre = restructurePreview(st, st.userTeamId, user);
  assert.equal(pre.ok, true, pre.reason ?? "");
  near(pre.convert, (B - LEAGUE_MINIMUM) * 9 / W, "half the season's excess is unpaid");
  const hitBefore = capHit(user.contract);
  assert.equal(applyRestructure(st, st.userTeamId, user.id).ok, true);
  near(hitBefore - capHit(user.contract), pre.savings, "applied savings equal the preview");
  near(capHit({ ...user.contract!, signingBonus: 0 }), B - pre.convert, "paid weeks keep their rate");
}
ok("an in-season restructure converts only unpaid base");

// (8) Playoff signings start next league year; the roll consumes nothing.
{
  const st = newGame({ seed: 42 });
  atWeek(st, W);
  st.phase = "playoffs";
  const fa = st.players.find((p) => p.teamId === null && !p.retired && !p.prospect && p.ovr > 55)!;
  const cut = rostered(st, st.userTeamId).sort((a, b) => a.ovr - b.ovr)[0];
  st.phase = "regular";
  assert.equal(cutPlayer(st, cut.id).ok, true);
  st.phase = "playoffs";
  const r = signPlayer(st, fa.id, st.userTeamId, 1, LEAGUE_MINIMUM * 2, new Rng(4));
  assert.equal(r.ok, true, r.reason ?? "");
  const c = fa.contract!;
  assert.equal(c.startsNextLeagueYear, true);
  assert.equal(capHit(c), 0, "nothing this league year");
  assert.equal(expiresAtRollover(c), false, "a one-year playoff deal is not expiring");
  assert.equal(expiringPlayers(st, st.userTeamId).some((p) => p.id === fa.id), false);
  const base = c.baseSalary[0];
  expireContracts(st);
  assert.equal(fa.teamId, st.userTeamId, "still under contract after the roll");
  assert.equal(c.startsNextLeagueYear, undefined);
  assert.equal(c.yearsRemaining, 1);
  assert.equal(capHit(c), annualCapHit(c));
  assert.equal(c.baseSalary[0], base, "the roll consumed no year");
}
ok("a playoff signing starts next league year");

// (9) The roll and FA open clear the season's bookkeeping.
{
  const { st, user } = fixture();
  atWeek(st, 5);
  assert.equal(cutPlayer(st, user.id).ok, true);
  assert.ok((st.teams[st.userTeamId].salaryPaidOut ?? 0) > 0);
  user.teamId = st.userTeamId;
  expireContracts(st);
  assert.equal(user.contract!.weeksBefore, undefined, "weeksBefore resets with the year");
  clearDeadCap(st);
  assert.equal(st.teams[st.userTeamId].salaryPaidOut, undefined, "FA open wipes paid-out salary");
}
ok("year roll and FA open reset weeksBefore and salaryPaidOut");

// (10) Out of season nothing changes: no new fields on any contract or club.
{
  const st = newGame({ seed: 42 });
  const before = JSON.stringify(st);
  const fa = st.players.find((p) => p.teamId === null && !p.retired && !p.prospect && p.ovr > 55)!;
  st.teams[st.userTeamId].capCarryover = (st.teams[st.userTeamId].capCarryover ?? 0) + 100_000_000;
  const cut = rostered(st, st.userTeamId).sort((a, b) => a.ovr - b.ovr)[0];
  cutPlayer(st, cut.id);
  signPlayer(st, fa.id, st.userTeamId, 2, 20_000_000, new Rng(5));
  const text = JSON.stringify(st);
  assert.equal(text.includes("weeksBefore"), false);
  assert.equal(text.includes("startsNextLeagueYear"), false);
  assert.equal(text.includes("salaryPaidOut"), false);
  assert.notEqual(text, before);
}
ok("preseason cuts and signings carry no pro-rata fields");

console.log("proRata: all passed");
