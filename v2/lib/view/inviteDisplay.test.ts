/**
 * Display leftovers: depth-chart copy, week-preview fog, draft-clock
 * offer strings, and the free-agency "Sug. Yrs" column.
 *
 * Sim paths stay on truth. `describeAsset`, `suggestedYears`, and
 * `negotiatedApy` are not the desk.
 *
 * Run: npx tsx lib/view/inviteDisplay.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { newGame } from "../core/newGame";
import { deskSuggestedYears, negotiatedApy, suggestedYears } from "../core/offseason/contracts";
import { playerName } from "../core/ratings";
import { teamRoster } from "../core/select";
import { userVeteranView, visibleOvr } from "../core/scouting";
import { briefingGroupOvr, buildBriefing } from "../core/season/briefing";
import { describeAsset } from "../core/trades";
import { Player, Position, STARTERS, TradeAsset } from "../core/types";
import { DEPTH_CHART_HELP, starterCountLabel } from "./depthChartCopy";
import { tradeBoardAssetLabel, tradeBoardOvr } from "./tradeBoard";

function ladder(age: number, ovr: number): number {
  if (age >= 33) return 1;
  if (age >= 30) return 2;
  if (ovr >= 80) return 5;
  if (ovr >= 72) return 4;
  return 3;
}

function startersAt(st: ReturnType<typeof newGame>, teamId: number, positions: readonly Position[]): Player[] {
  const byId = new Map(st.players.map((p) => [p.id, p]));
  const out: Player[] = [];
  const chart = st.teams[teamId].depthChart;
  for (const pos of positions) {
    for (const id of (chart[pos] ?? []).slice(0, STARTERS[pos])) {
      const p = byId.get(id);
      if (p) out.push(p);
    }
  }
  return out;
}

function mean(xs: number[]): number {
  return xs.reduce((s, n) => s + n, 0) / xs.length;
}

const GROUPS: { name: string; positions: Position[] }[] = [
  { name: "quarterback play", positions: ["QB"] },
  { name: "skill positions", positions: ["RB", "WR", "TE"] },
  { name: "offensive line", positions: ["OT", "OG", "C"] },
  { name: "defensive front", positions: ["EDGE", "DT", "LB"] },
  { name: "secondary", positions: ["CB", "S"] },
];

{
  assert.equal(starterCountLabel(1), "1 starter");
  assert.equal(starterCountLabel(2), "2 starters");
  assert.equal(starterCountLabel(3), "3 starters");
  assert.equal(DEPTH_CHART_HELP.includes("STARTERS"), false);
  assert.ok(DEPTH_CHART_HELP.includes("one at quarterback"));
  assert.ok(DEPTH_CHART_HELP.includes("three at wide receiver and corner"));
  const depth = readFileSync(new URL("../../app/depth-chart/page.tsx", import.meta.url), "utf8");
  assert.equal(depth.includes('"STARTERS[pos]"'), false);
  assert.equal(depth.includes("start${starters === 1 ? \"s\""), false);
  assert.ok(depth.includes("starterCountLabel"));
}

{
  const st = newGame({ seed: 42, userTeamId: 0 });
  const rngBefore = st.rngState;
  const rivalId = st.teams.find((t) => t.id !== st.userTeamId)!.id;
  st.phase = "regular";
  st.week = 1;
  st.games = [{
    id: 1,
    season: st.season,
    week: 1,
    homeId: st.userTeamId,
    awayId: rivalId,
    played: false,
    homeScore: 0,
    awayScore: 0,
    playoffRound: null,
    boxScore: null,
  }];

  for (const grp of GROUPS) {
    const own = startersAt(st, st.userTeamId, grp.positions);
    const opp = startersAt(st, rivalId, grp.positions);
    assert.ok(own.length > 0 && opp.length > 0, grp.name);
    assert.equal(briefingGroupOvr(st, st.userTeamId, grp.positions), mean(own.map((p) => p.ovr)));
    assert.equal(
      briefingGroupOvr(st, rivalId, grp.positions),
      mean(opp.map((p) => userVeteranView(st, p).ovr)),
    );
  }
  const qbTruth = mean(startersAt(st, rivalId, ["QB"]).map((p) => p.ovr));
  const qbBelief = briefingGroupOvr(st, rivalId, ["QB"]);
  assert.notEqual(qbBelief.toFixed(1), qbTruth.toFixed(1), "rival quarterback gap must not be the true tenth");

  const diffs = GROUPS.map((grp) => ({
    grp,
    diff: briefingGroupOvr(st, st.userTeamId, grp.positions) - briefingGroupOvr(st, rivalId, grp.positions),
    truth: mean(startersAt(st, st.userTeamId, grp.positions).map((p) => p.ovr))
      - mean(startersAt(st, rivalId, grp.positions).map((p) => p.ovr)),
  })).sort((a, b) => b.diff - a.diff);
  const best = diffs[0];
  const worst = diffs[diffs.length - 1];
  const expected: string[] = [];
  if (best.diff >= 2) expected.push(`You hold the edge in ${best.grp.name} (+${best.diff.toFixed(1)} OVR across the starters).`);
  if (worst.diff <= -2) expected.push(`They are stronger in ${worst.grp.name} (${worst.diff.toFixed(1)} OVR) — game-plan around it.`);
  if (expected.length === 0) expected.push("Evenly matched across every position group — this one comes down to execution.");
  assert.ok(
    diffs.some((d) => Math.abs(d.diff - d.truth) > 0.05),
    "at least one matchup line must move off the true starter-group gap",
  );

  const roster = st.players.filter((p) => p.teamId === rivalId && !p.prospect);
  const ranked = roster
    .slice()
    .sort((a, b) => userVeteranView(st, b).ovr - userVeteranView(st, a).ovr || a.id - b.id)
    .slice(0, 3);
  const hurt = roster.slice().sort((a, b) => b.ovr - a.ovr);
  hurt[0].injuryWeeks = 4;
  hurt[1].injuryWeeks = 2;
  hurt[0].injuryDesc = "ankle";

  const b = buildBriefing(st);
  assert.ok(b.opponent);
  assert.deepEqual(
    b.opponent.stars,
    ranked.map((p) => ({ name: playerName(p), pos: p.pos, ovr: visibleOvr(st, p) })),
  );
  assert.ok(
    b.opponent.stars.some((s) => {
      const p = ranked.find((x) => playerName(x) === s.name && x.pos === s.pos);
      return p && s.ovr !== String(p.ovr);
    }),
    "Their best must print a scouted band, not true overall",
  );
  assert.deepEqual(b.opponent.edges, expected);
  assert.deepEqual(
    b.opponent.out.map((row) => row.name),
    [playerName(hurt[0]), playerName(hurt[1])],
  );
  for (const row of b.opponent.out) {
    assert.equal("ovr" in row, false);
    assert.equal(JSON.stringify(row).includes("OVR"), false);
  }
  assert.equal(st.rngState, rngBefore, "week fog must not draw on the save RNG");
}

{
  const st = newGame({ seed: 42, userTeamId: 0 });
  const rngBefore = st.rngState;
  const rivals = teamRoster(st, st.teams.find((t) => t.id !== st.userTeamId)!.id);
  const own = teamRoster(st, st.userTeamId);
  const young = rivals.filter((p) => p.age < 30);
  assert.ok(young.length > 20);
  let moved = 0;
  for (const p of young) {
    assert.equal(suggestedYears(p), ladder(p.age, p.ovr));
    assert.equal(deskSuggestedYears(st, p), ladder(p.age, userVeteranView(st, p).ovr));
    if (suggestedYears(p) !== deskSuggestedYears(st, p)) moved++;
  }
  assert.ok(moved > 0, "belief must change suggested years for at least one young veteran");
  const mine = own.find((p) => p.age < 30);
  assert.ok(mine);
  assert.equal(deskSuggestedYears(st, mine), suggestedYears(mine));
  const priced = negotiatedApy(st, st.userTeamId, young[0], 1);
  assert.equal(typeof priced, "number");
  assert.ok(priced > 0);
  assert.equal(st.rngState, rngBefore);

  const fa = readFileSync(new URL("../../app/free-agency/page.tsx", import.meta.url), "utf8");
  assert.equal(fa.includes("suggestedYears("), false);
  assert.ok(fa.includes("deskSuggestedYears("));
}

{
  const st = newGame({ seed: 42, userTeamId: 0 });
  const rival = teamRoster(st, st.teams.find((t) => t.id !== st.userTeamId)!.id)[0];
  const asset: TradeAsset = { kind: "player", playerId: rival.id };
  assert.equal(describeAsset(st, asset), `${rival.firstName} ${rival.lastName} (${rival.pos}, ${rival.ovr})`);
  const fogged = tradeBoardAssetLabel(st, asset);
  assert.equal(fogged, `${rival.firstName} ${rival.lastName} (${rival.pos}, ${tradeBoardOvr(st, rival)})`);
  assert.notEqual(fogged, describeAsset(st, asset));
  const pick = (st.pickOwners ?? []).find((p) => p.teamId !== st.userTeamId);
  assert.ok(pick);
  const pickAsset: TradeAsset = {
    kind: "pick",
    season: pick.season,
    round: pick.round,
    originalTeamId: pick.originalTeamId,
  };
  assert.equal(tradeBoardAssetLabel(st, pickAsset), describeAsset(st, pickAsset));
  const draft = readFileSync(new URL("../../app/draft/page.tsx", import.meta.url), "utf8");
  assert.equal(draft.includes("describeAsset"), false);
  assert.ok(draft.includes("tradeBoardAssetLabel"));
}

console.log("ok    invite display — depth copy, week fog, clock offers, FA years");
