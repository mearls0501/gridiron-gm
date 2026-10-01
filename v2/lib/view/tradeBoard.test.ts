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
import { newGame } from "../core/newGame";
import { teamRoster } from "../core/select";
import { knowsTrueRatings, userVeteranView, visibleOvr } from "../core/scouting";
import { describeAsset } from "../core/trades";
import { Player, TradeAsset } from "../core/types";
import {
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
    const page = knowsTrueRatings(st, p) ? p.ovr : visibleOvr(st, p);
    assert.equal(shown, page, `${p.lastName} badge must match the player page`);
    assert.equal(typeof shown, "string");
    assert.equal(tradeBoardOvrSort(st, p), userVeteranView(st, p).ovr);
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
    assert.equal(tradeBoardOvr(st, p), p.ovr);
    assert.equal(typeof tradeBoardOvr(st, p), "number");
    assert.equal(tradeBoardOvrSort(st, p), p.ovr);
    const asset: TradeAsset = { kind: "player", playerId: p.id };
    assert.equal(tradeBoardAssetLabel(st, asset), describeAsset(st, asset));
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
  assert.equal(tradeBoardAssetLabel(st, asset), describeAsset(st, asset));
}

assert.equal(st.rngState, rngBefore, "display fog must not draw on the save RNG");

const missing: TradeAsset = { kind: "player", playerId: -1 };
assert.equal(tradeBoardAssetLabel(st, missing), "a player");

console.log("ok    tradeBoard — rival OVR matches the scouted player page");
