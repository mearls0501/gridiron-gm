/**
 * Regression: rookie slot scale and compensatory picks (Lane C).
 *
 * Rookie deals were flat per round (pick 1 = pick 32). The draft was 224
 * (7×32) with no compensatory awards. Both are published CBA-shaped rules,
 * ungated — see docs/nfl-reference.md §4.
 *
 * Run: npx tsx lib/core/draftRules.test.ts
 */
import assert from "node:assert/strict";
import { newGame } from "./newGame";
import { makeContract } from "./generate";
import { Rng } from "./rng";
import { blankSeasonLine } from "./season/stats";
import { LEAGUE_MINIMUM, PickOwnership, Player } from "./types";
import {
  awardCompensatoryPicks,
  buildDraftPicks,
  COMP_PICK_ORIGIN,
  computeCompensatoryAwards,
  initDraft,
  qualifyingUfaMoves,
  rookieContract,
  rookieSlotApy,
  rookieSlotShare,
} from "./offseason/draft";
import { enterDraft } from "./offseason";

function plantUfa(
  st: ReturnType<typeof newGame>,
  fromId: number,
  toId: number,
  apy: number,
  games = 16,
  skip: Set<number> = new Set(),
): Player {
  const p = st.players.find(
    (x) =>
      x.teamId === fromId &&
      !x.retired &&
      !x.prospect &&
      x.contract &&
      !skip.has(x.id)
  );
  assert.ok(p, "need a rostered player to plant");
  const line = blankSeasonLine(st.season, fromId);
  line.games = games;
  p.stats = p.stats.filter((s) => s.season !== st.season);
  p.stats.push(line);
  p.teamId = toId;
  p.prospect = false;
  p.retired = false;
  p.draftClassSeason = st.season - 4;
  p.yearsPro = 4;
  p.contract = makeContract(new Rng(1), apy, 4, st.season, 2);
  return p;
}

// (1) Pick 1 rookie APY is above pick 32 in the same round.
{
  const st = newGame({ seed: 1 });
  const pick1 = rookieSlotApy(st, 1);
  const pick32 = rookieSlotApy(st, 32);
  const pick33 = rookieSlotApy(st, 33);
  assert.ok(pick1 > pick32, `pick 1 ${pick1} must beat pick 32 ${pick32}`);
  assert.ok(pick32 > pick33, `R1 last ${pick32} sits above R2 first ${pick33}`);
  assert.ok(rookieSlotShare(1) > rookieSlotShare(32));
  assert.ok(pick1 >= LEAGUE_MINIMUM);
  assert.ok(pick32 >= LEAGUE_MINIMUM);

  const c1 = rookieContract(st, 1, new Rng(1), 1);
  const c32 = rookieContract(st, 1, new Rng(1), 32);
  const apy = (c: typeof c1) =>
    Math.round((c.baseSalary.reduce((a, b) => a + b, 0) + c.signingBonus) / c.years);
  assert.ok(apy(c1) > apy(c32), "signed pick-1 deal is richer than pick 32");
  assert.equal(c1.years, 4);
  assert.equal(c32.years, 4);
}

// (2) No UFA history → 224 regular slots. A net UFA loss grows the board.
{
  const fresh = newGame({ seed: 2 });
  const baseline = buildDraftPicks(fresh, fresh.season);
  assert.equal(baseline.length, 224, "year-0 / no-FA draft stays 7×32");
  assert.equal(baseline.filter((p) => p.compensatory).length, 0);

  const st = newGame({ seed: 3 });
  const from = st.teams.find((t) => t.id !== st.userTeamId)!.id;
  const to = st.teams.find((t) => t.id !== st.userTeamId && t.id !== from)!.id;
  plantUfa(st, from, to, 15_000_000, 16);
  const awards = computeCompensatoryAwards(st);
  assert.ok(awards.length >= 1, "a qualifying UFA loss produces an award");
  assert.equal(awards[0].teamId, from);
  assert.ok(awards[0].round >= 3 && awards[0].round <= 7);

  const picks = buildDraftPicks(st, st.season);
  assert.ok(picks.length > 224, `board grew to ${picks.length}`);
  assert.ok(picks.some((p) => p.compensatory), "live board carries comp slots");
  const comps = (st.pickOwners ?? []).filter((p) => p.season === st.season && p.compensatory);
  assert.ok(comps.length >= 1);
  assert.ok(comps[0].originalTeamId >= COMP_PICK_ORIGIN);
  assert.equal(comps[0].teamId, from);
}

// (3) Incoming UFA of equal-or-better tier cancels a loss. Cuts do not count.
{
  const st = newGame({ seed: 4 });
  const a = st.teams.find((t) => t.id !== st.userTeamId)!.id;
  const b = st.teams.find((t) => t.id !== st.userTeamId && t.id !== a)!.id;
  const lost = plantUfa(st, a, b, 15_000_000, 16);
  plantUfa(st, b, a, 15_000_000, 16, new Set([lost.id]));
  assert.equal(computeCompensatoryAwards(st).length, 0, "matched UFAs cancel");

  const cut = newGame({ seed: 5 });
  const from = cut.teams.find((t) => t.id !== cut.userTeamId)!.id;
  const to = cut.teams.find((t) => t.id !== cut.userTeamId && t.id !== from)!.id;
  const p = plantUfa(cut, from, to, 15_000_000, 16);
  cut.log.push({
    season: cut.season, week: 0, kind: "transaction",
    text: `${cut.teams[from].abbr} waived ${p.firstName} ${p.lastName} (${p.pos})`,
  });
  assert.equal(qualifyingUfaMoves(cut).length, 0, "a cut is not a UFA loss");
  assert.equal(computeCompensatoryAwards(cut).length, 0);
}

// (4) Award is deterministic and idempotent. Old save without comps still loads.
{
  const st = newGame({ seed: 6 });
  const from = 1;
  const to = 2;
  plantUfa(st, from, to, 12_000_000, 16);
  const first = computeCompensatoryAwards(st);
  const second = computeCompensatoryAwards(st);
  assert.deepEqual(first, second);

  awardCompensatoryPicks(st, st.season);
  const n = (st.pickOwners ?? []).filter((p) => p.compensatory).length;
  awardCompensatoryPicks(st, st.season);
  assert.equal((st.pickOwners ?? []).filter((p) => p.compensatory).length, n);

  const raw = JSON.parse(JSON.stringify(newGame({ seed: 7 }))) as ReturnType<typeof newGame>;
  raw.pickOwners = undefined;
  const picks = buildDraftPicks(raw, raw.season);
  const owners: PickOwnership[] = raw.pickOwners ?? [];
  assert.equal(picks.length, 224);
  assert.ok(owners.length >= 224);
  assert.equal(owners.filter((p) => p.compensatory).length, 0);
}

// (5) enterDraft from a fresh league (no FA) still opens, 224 slots.
{
  const st = newGame({ seed: 8 });
  st.phase = "offseason-draft";
  enterDraft(st);
  assert.ok(st.draft);
  assert.equal(st.draft.picks.length, 224);
  initDraft(st, new Rng(st.rngState));
  assert.equal(st.draft.picks.length, 224);
}

console.log("ok    draftRules — slot scale + compensatory picks");
