/**
 * Waiver clearing and the dead money on a cut
 * (`docs/waiver-clearing-design-2026-10-23.md`, Matt signed all five 2026-10-23).
 *
 * - The bonus books on the waiving club at the cut; a claim carries base and
 *   guarantee only.
 * - Unclaimed after one window: free agent, always; the guarantee lands then.
 * - A club cannot make a cut it cannot absorb; the user is told why.
 * - A CPU club is never left over the cap by a clear.
 * - Entries from before the rule clear once with no charge.
 *
 * Run: npx tsx lib/core/waiverClearing.test.ts
 */
import assert from "node:assert/strict";
import { newGame } from "./newGame";
import { advance } from "./season/engine";
import { advanceOffseason } from "./offseason";
import { cutAffordable, cutPlayer, cutRefusal } from "./offseason/contracts";
import { resolveWaivers } from "./waivers";
import { placeOnPs } from "./rosterStatus";
import { capHit, deadMoney, freeAgents, isOnWaivers, remainingBonusProration, teamCap } from "./select";
import { Contract, GameState, Player, PRACTICE_SQUAD_LIMIT } from "./types";

function ok(label: string) { console.log("ok   ", label); }

function unclaimable(p: Player): void {
  p.pos = "WR"; p.ovr = 20; p.pot = 20; p.ceiling = 20; p.age = 29; p.draftedRound = null;
}

/** Bonus 10M over 5 (+1 void), two guaranteed years of base. */
function fatDeal(season: number): Contract {
  return {
    years: 4, yearsRemaining: 4, baseSalary: [1_000_000, 2_000_000, 3_000_000, 4_000_000],
    signingBonus: 10_000_000, bonusProrationYears: 5, signedSeason: season, guaranteedYears: 2, voidYears: 1,
  };
}

function fillPs(st: GameState, teamId: number): Player[] {
  const extras = st.players.filter((p) => p.teamId === teamId && !p.retired && !p.prospect && !p.status);
  for (let i = 0; i < PRACTICE_SQUAD_LIMIT; i++) {
    extras[i].ovr = 80;
    assert.equal(placeOnPs(st, extras[i].id).ok, true);
  }
  return extras.slice(PRACTICE_SQUAD_LIMIT);
}

/** Leave the club `room` dollars of cap space. */
function squeeze(st: GameState, teamId: number, room: number): void {
  const t = st.teams[teamId];
  t.deadCap = (t.deadCap ?? 0) + teamCap(st, teamId).space - room;
}

// (1) No limbo: a club with no room still loses him to free agency after one window,
// and the guarantee is booked. A CPU club is brought back under by the backstop.
{
  const st = newGame({ seed: 61 });
  const cpu = st.teams.find((t) => t.id !== st.userTeamId)!.id;
  const [p] = fillPs(st, cpu);
  unclaimable(p);
  p.contract = fatDeal(st.season);
  const owed = deadMoney(p.contract);
  const bonus = Math.round(remainingBonusProration(p.contract));
  const before = st.teams[cpu].deadCap ?? 0;
  assert.equal(cutPlayer(st, p.id).ok, true);
  assert.equal(st.teams[cpu].deadCap, before + bonus, "bonus at the cut");
  squeeze(st, cpu, 0); // spent the room before he cleared: the old limbo case
  resolveWaivers(st);
  assert.equal(isOnWaivers(st, p.id), false, "never re-listed");
  assert.equal(p.contract, null);
  assert.ok(freeAgents(st).some((x) => x.id === p.id), "a free agent any club can sign");
  assert.ok(teamCap(st, cpu).space >= 0, "the backstop brings the CPU club back under");
  assert.ok((st.teams[cpu].deadCap ?? 0) >= before + owed - 2, "the guarantee landed on the waiving club");
}
ok("unclaimed: free agent after one window, guarantee booked, CPU club back under");

// (2) Old saves: an entry from before the rule clears once with no charge.
{
  const st = newGame({ seed: 62 });
  const cpu = st.teams.find((t) => t.id !== st.userTeamId)!.id;
  const [p] = fillPs(st, cpu);
  unclaimable(p);
  p.contract = fatDeal(st.season);
  // The pre-rule shape: off the books, contract whole, entry without bookedAtCut.
  p.teamId = null;
  st.waivers = [{ playerId: p.id, originalTeamId: cpu }];
  const before = st.teams[cpu].deadCap ?? 0;
  resolveWaivers(st);
  assert.equal(p.contract, null);
  assert.equal(isOnWaivers(st, p.id), false);
  assert.equal(st.teams[cpu].deadCap ?? 0, before, "amnesty: no charge for the backlog");
}
ok("old saves: the backlog clears once with no charge");

// (3) A claim carries base and guarantee, not the bonus.
{
  const st = newGame({ seed: 63 });
  const cpu = st.teams.find((t) => t.id !== st.userTeamId)!.id;
  const p = st.players.find((x) => x.teamId === st.userTeamId && !x.status && x.pos === "QB")!;
  p.contract = fatDeal(st.season);
  p.ovr = 85;
  const bonus = Math.round(remainingBonusProration(p.contract));
  const userBefore = st.teams[st.userTeamId].deadCap ?? 0;
  st.teams[st.userTeamId].capCarryover = (st.teams[st.userTeamId].capCarryover ?? 0) + 50_000_000;
  assert.equal(cutPlayer(st, p.id).ok, true);
  const hit = capHit(p.contract);
  resolveWaivers(st);
  assert.notEqual(p.teamId, null, "an 85 QB is claimed");
  assert.notEqual(p.teamId, st.userTeamId);
  assert.equal(remainingBonusProration(p.contract), 0, "no bonus on the claimant's copy");
  assert.equal(capHit(p.contract), hit, "the claimant carries base only");
  assert.equal(st.teams[st.userTeamId].deadCap ?? 0, userBefore + bonus, "the waiving club keeps only the bonus");
  void cpu;
}
ok("a claim carries base and guarantee; the bonus stays with the waiving club");

// (4) The user cannot make a cut the club cannot absorb, and is told why.
{
  const st = newGame({ seed: 64 });
  const me = st.userTeamId;
  const p = st.players.find((x) => x.teamId === me && !x.status && !x.retired)!;
  p.contract = { ...fatDeal(st.season), baseSalary: [500_000, 2_000_000, 3_000_000, 4_000_000] };
  squeeze(st, me, 1_000_000);
  assert.ok(capHit(p.contract) < deadMoney(p.contract), "a cut that costs room");
  assert.equal(cutAffordable(st, p), false);
  const why = cutRefusal(st, p)!;
  assert.match(why, /dead money/);
  assert.match(why, /Clear cap space first/);
  // With room, the same cut is fine.
  squeeze(st, me, 60_000_000);
  assert.equal(cutRefusal(st, p), null);
  // A cut that saves room is always allowed, even over the cap.
  const cheap = st.players.find((x) => x.teamId === me && x !== p && !x.status && x.contract
    && capHit(x.contract) > deadMoney(x.contract))!;
  squeeze(st, me, -5_000_000);
  assert.equal(cutAffordable(st, cheap), true);
}
ok("an unaffordable user cut is refused with the dead money named");

// (5) A season and a camp, headless: the wire never carries a name from an
// earlier window, and in season a CPU club over the cap is back under by the
// next window. (Camp is not checked: clubs carry 90 there and get under at the
// cut, which this packet does not change.)
{
  const st = newGame({ seed: 42 });
  let worst = 0, overCpu = 0, g = 0, seasons = 0;
  let lastOver = new Set<number>();
  const check = () => {
    for (const w of st.waivers ?? []) assert.equal(w.bookedAtCut, true, "every entry is under the new rule");
    worst = Math.max(worst, (st.waivers ?? []).length);
    if (st.phase !== "regular" && st.phase !== "playoffs") { lastOver = new Set(); return; }
    const now = new Set(st.teams.filter((t) => t.id !== st.userTeamId && teamCap(st, t.id).space < 0).map((t) => t.id));
    for (const id of now) if (lastOver.has(id)) overCpu++;
    lastOver = now;
  };
  while (seasons < 1 && g++ < 400) {
    if (st.phase === "regular" || st.phase === "playoffs" || st.phase === "preseason") advance(st);
    else { const f = st.phase === "offseason-final"; advanceOffseason(st); if (f && (st.phase as string) === "preseason") seasons++; }
    check();
  }
  advance(st); // kickoff of year two
  check();
  assert.equal(overCpu, 0, "no CPU club stays over the cap for a second window");
  assert.ok(worst < 120, `the wire is one window's cuts, not a pile (${worst})`);
}
ok("a season and a camp: no pile; a CPU club over the cap is back under by the next window");

console.log("waiverClearing: all passed");
