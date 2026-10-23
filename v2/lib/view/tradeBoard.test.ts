/**
 * Regression: the trade desk printed true overall for every club.
 *
 * The player page already fogs a rival through `visibleOvr`. The board
 * has to print that same string, and keep the user's own number exact.
 * `describeAsset` stays on truth — the trade log still records it.
 *
 * Run: npx tsx lib/view/tradeBoard.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { newGame } from "../core/newGame";
import { COMP_PICK_ORIGIN } from "../core/offseason/draft";
import { teamRoster } from "../core/select";
import { presentedOvr } from "../core/ratings";
import { knowsTrueRatings, userVeteranView, visibleOvr } from "../core/scouting";
import { describeAsset, picksOwnedBy } from "../core/trades";
import { Player, TradeAsset } from "../core/types";
import { draftYearLabel, presentNewsText } from "./draftYear";
import { OVERPAYING_LINE, readOfMargin } from "./tradeRead";
import {
  draftPickDeskLabel,
  pickSlotFromLabel,
  tradeBoardAssetLabel,
  tradeBoardOvr,
  tradeBoardOvrSort,
} from "./tradeBoard";

function roster(st: ReturnType<typeof newGame>, teamId: number): Player[] {
  return teamRoster(st, teamId);
}

const st = newGame({ seed: 42, userTeamId: 0 });
const rngBefore = st.rngState;
const own = roster(st, st.userTeamId);
const rivalId = st.teams.find((t) => t.id !== st.userTeamId)!.id;
const rivals = roster(st, rivalId);
assert.ok(own.length > 10 && rivals.length > 10, "need both rosters");

{
  let collapsed = 0;
  for (const p of rivals) {
    const shown = tradeBoardOvr(st, p);
    const page = knowsTrueRatings(st, p) ? presentedOvr(p.pos, p.ovr) : visibleOvr(st, p);
    assert.equal(shown, page, `${p.lastName} badge must match the player page`);
    assert.equal(typeof shown, "string");
    assert.equal(tradeBoardOvrSort(st, p), presentedOvr(p.pos, userVeteranView(st, p).ovr));
    if (shown === String(p.ovr)) collapsed++;
    const asset: TradeAsset = { kind: "player", playerId: p.id };
    const label = tradeBoardAssetLabel(st, asset);
    assert.equal(label, `${p.firstName} ${p.lastName} (${p.pos}, ${shown})`);
    assert.equal(describeAsset(st, asset), `${p.firstName} ${p.lastName} (${p.pos}, ${p.ovr})`);
    if (shown !== String(p.ovr)) {
      assert.notEqual(label, describeAsset(st, asset));
    }
  }
  assert.ok(
    collapsed < rivals.length * 0.25,
    `rival column collapsed to truth ${collapsed}/${rivals.length}`,
  );
}

{
  for (const p of own) {
    const shown = presentedOvr(p.pos, p.ovr);
    assert.equal(tradeBoardOvr(st, p), shown);
    assert.equal(typeof tradeBoardOvr(st, p), "number");
    assert.equal(tradeBoardOvrSort(st, p), shown);
    const asset: TradeAsset = { kind: "player", playerId: p.id };
    const label = `${p.firstName} ${p.lastName} (${p.pos}, ${shown})`;
    assert.equal(tradeBoardAssetLabel(st, asset), label);
    assert.equal(describeAsset(st, asset), `${p.firstName} ${p.lastName} (${p.pos}, ${p.ovr})`);
    if (p.pos === "K" || p.pos === "P") assert.notEqual(label, describeAsset(st, asset));
    else assert.equal(label, describeAsset(st, asset));
  }
}

{
  const byTruth = rivals.slice().sort((a, b) => b.ovr - a.ovr || a.id - b.id);
  const byScout = rivals
    .slice()
    .sort((a, b) => tradeBoardOvrSort(st, b) - tradeBoardOvrSort(st, a) || a.id - b.id);
  assert.ok(
    byTruth.some((p, i) => p.id !== byScout[i].id),
    "scouted column order must not be the true-overall ranking",
  );
}

{
  const pick = (st.pickOwners ?? []).find((p) => p.teamId === rivalId);
  assert.ok(pick, "rival owns a pick");
  const asset: TradeAsset = {
    kind: "pick",
    season: pick.season,
    round: pick.round,
    originalTeamId: pick.originalTeamId,
  };
  const truth = describeAsset(st, asset);
  const desk = tradeBoardAssetLabel(st, asset);
  assert.ok(truth.startsWith(String(pick.season)), `log stays on the stored year, got ${truth}`);
  assert.ok(desk.startsWith(draftYearLabel(pick.season)), `desk shows the draft after that season, got ${desk}`);
  assert.equal(desk, draftPickDeskLabel(st, asset));
  assert.equal(desk.replace(draftYearLabel(pick.season), String(pick.season)), truth);
  assert.notEqual(desk, truth);
  assert.equal(presentNewsText(truth), desk, "news uses the same draft-year label as the offer");
}

assert.equal(st.rngState, rngBefore, "display fog must not draw on the save RNG");

const missing: TradeAsset = { kind: "player", playerId: -1 };
assert.equal(tradeBoardAssetLabel(st, missing), "a player");

{
  const jump = readOfMargin(20, 100);
  assert.equal(jump.text, "They would jump at this.");
  assert.equal(jump.tone, "good");
  assert.equal(jump.overpaying, true);
  assert.equal(readOfMargin(15, 100).overpaying, true, "15% of the deal is the line");
  assert.equal(readOfMargin(14.9, 100).overpaying, false);
  assert.equal(readOfMargin(10, 100).text, "They like this. It gets done.");
  assert.equal(readOfMargin(10, 100).overpaying, false);
  assert.equal(readOfMargin(10, 0).overpaying, false, "an empty scale is not a lopsided win");
  assert.equal(readOfMargin(-20, 100).overpaying, false);
  assert.equal(OVERPAYING_LINE, "You're overpaying — try a smaller sweetener.");
}

console.log("ok    tradeBoard — rival OVR matches the scouted player page");

// Compensatory picks use originalTeamId >= 1000. The desk used to read
// teams[id].abbr and crash /trades for the whole draft.
{
  const page = readFileSync(new URL("../../app/trades/page.tsx", import.meta.url), "utf8");
  assert.equal(page.includes("origin.abbr"), false, "the pick list must not read abbr off a missing club");
  assert.ok(page.includes("pickSlotFromLabel"), "the pick list labels compensatory rows through the helper");

  if (!st.pickOwners) st.pickOwners = [];
  st.pickOwners.push({
    season: st.season,
    round: 3,
    originalTeamId: COMP_PICK_ORIGIN,
    teamId: st.userTeamId,
    compensatory: true,
  });
  const owned = picksOwnedBy(st, st.userTeamId);
  const comp = owned.find((p) => p.originalTeamId === COMP_PICK_ORIGIN);
  assert.ok(comp, "a compensatory pick is tradeable inventory");
  assert.equal(st.teams[COMP_PICK_ORIGIN], undefined, "comp origin is not a club");
  assert.equal(pickSlotFromLabel(st, comp!, st.userTeamId), "Comp");
  assert.equal(pickSlotFromLabel(st, { originalTeamId: COMP_PICK_ORIGIN }, rivalId), "Comp");
  assert.equal(
    pickSlotFromLabel(st, { originalTeamId: st.userTeamId, compensatory: true }, st.userTeamId),
    "Comp",
    "the compensatory flag wins over Own",
  );

  const asset: TradeAsset = {
    kind: "pick",
    season: st.season,
    round: 3,
    originalTeamId: COMP_PICK_ORIGIN,
  };
  const desk = draftPickDeskLabel(st, asset);
  assert.match(desk, /\(Comp\)/, `desk labels a comp pick, got ${desk}`);
  assert.equal(desk.includes("undefined"), false);
  const truth = describeAsset(st, asset);
  assert.equal(truth.includes("undefined"), false, "the trade log must not throw or print undefined");
  assert.equal(tradeBoardAssetLabel(st, asset), desk);

  const own = (st.pickOwners ?? []).find((p) => p.teamId === st.userTeamId && p.originalTeamId === st.userTeamId);
  assert.ok(own);
  assert.equal(pickSlotFromLabel(st, own!, st.userTeamId), "Own");
  const rivalPick = (st.pickOwners ?? []).find((p) => p.originalTeamId === rivalId);
  assert.ok(rivalPick);
  assert.equal(pickSlotFromLabel(st, rivalPick!, st.userTeamId), st.teams[rivalId].abbr);
}

console.log("ok    tradeBoard — compensatory pick labels as Comp and does not crash");
