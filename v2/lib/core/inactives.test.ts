/**
 * Regression: week-scoped gameday inactives (sit-him).
 *
 * The 53 is unchanged. Sat men take no snaps. Injured-on-53 count toward
 * the 47 / 48-with-8-OL cap. Missing `inactives` = nobody sat.
 *
 * Run: npx tsx lib/core/inactives.test.ts
 */
import assert from "node:assert/strict";
import { newGame } from "./newGame";
import { Rng } from "./rng";
import { rosterCount } from "./select";
import { simulateGame } from "./sim/game";
import { startRegularSeason, simulateWeek } from "./season/engine";
import {
  GAMEDAY_ACTIVE_LIMIT, GAMEDAY_ACTIVE_LIMIT_EIGHT_OL, GAMEDAY_OL_FOR_EXTRA,
  ROSTER_LIMIT,
} from "./types";
import { designateIr } from "./rosterStatus";
import {
  activateFromInactive, canSit, creditedInactives, declareGamedayInactives,
  gamedayActiveCap, gamedayInactiveView, inactiveRequirement, isSat, olOnActive53,
  sitPlayer, stillNeedToSit,
} from "./inactives";

function clubActive(st: ReturnType<typeof newGame>, teamId: number) {
  return st.players.filter(
    (p) => p.teamId === teamId && !p.retired && !p.prospect && p.status !== "ir" && p.status !== "ps"
  );
}

function userGame(st: ReturnType<typeof newGame>) {
  return st.games.find(
    (g) =>
      g.season === st.season &&
      g.week === st.week &&
      !g.played &&
      (g.homeId === st.userTeamId || g.awayId === st.userTeamId)
  );
}

// Constants and old-save shape.
{
  assert.equal(GAMEDAY_ACTIVE_LIMIT, 47);
  assert.equal(GAMEDAY_ACTIVE_LIMIT_EIGHT_OL, 48);
  assert.equal(GAMEDAY_OL_FOR_EXTRA, 8);
  const st = newGame({ seed: 1 });
  const t = st.teams[st.userTeamId];
  assert.equal(t.inactives, undefined);
  const raw = JSON.parse(JSON.stringify(st)) as typeof st;
  assert.equal(raw.teams[st.userTeamId].inactives, undefined);
  assert.equal(creditedInactives(raw, st.userTeamId), 0);
}

// 48-with-8-OL vs 47 when the 53 has fewer than 8 OL.
{
  const st = newGame({ seed: 2 });
  startRegularSeason(st);
  const tid = st.userTeamId;
  assert.ok(olOnActive53(st, tid) >= 8, "generated 53 has 8+ OL");
  assert.equal(gamedayActiveCap(st, tid), 48);
  assert.equal(inactiveRequirement(st, tid), rosterCount(st, tid) - 48);

  const ol = clubActive(st, tid).filter((p) => p.pos === "OT" || p.pos === "OG" || p.pos === "C");
  for (const p of ol.slice(0, ol.length - 7)) {
    p.injuryWeeks = 8;
    p.injuryDesc = "Torn ACL";
    assert.equal(designateIr(st, p.id).ok, true, `IR ${p.pos}`);
  }
  assert.ok(olOnActive53(st, tid) < 8, "IR leaves the 53 under 8 OL");
  assert.equal(gamedayActiveCap(st, tid), 47);
  assert.equal(inactiveRequirement(st, tid), Math.max(0, rosterCount(st, tid) - 47));
}

// Injured-on-53 count toward the requirement without a Sit click.
{
  const st = newGame({ seed: 3 });
  startRegularSeason(st);
  const tid = st.userTeamId;
  const need = inactiveRequirement(st, tid);
  const healthy = clubActive(st, tid).filter((p) => p.injuryWeeks <= 0);
  healthy.sort((a, b) => a.ovr - b.ovr);
  healthy[0].injuryWeeks = 1;
  healthy[0].injuryDesc = "Ankle";
  healthy[1].injuryWeeks = 1;
  healthy[1].injuryDesc = "Knee";
  assert.equal(rosterCount(st, tid), ROSTER_LIMIT);
  assert.equal(creditedInactives(st, tid), 2);
  assert.equal(stillNeedToSit(st, tid), Math.max(0, need - 2));
}

// Sit a starter: 0 snaps, backup plays, 53 unchanged. Refuse last healthy K.
{
  const st = newGame({ seed: 4 });
  startRegularSeason(st);
  const tid = st.userTeamId;
  const before = rosterCount(st, tid);
  assert.equal(before, ROSTER_LIMIT);

  const kickers = clubActive(st, tid).filter((p) => p.pos === "K" && p.injuryWeeks <= 0);
  assert.ok(kickers.length >= 1);
  if (kickers.length === 1) {
    assert.equal(canSit(st, kickers[0]), false);
    const refused = sitPlayer(st, kickers[0].id);
    assert.equal(refused.ok, false);
    assert.match(refused.reason ?? "", /no healthy active K/);
  }

  const qb1id = st.teams[tid].depthChart.QB[0];
  const qb2id = st.teams[tid].depthChart.QB[1];
  assert.ok(qb1id && qb2id && qb1id !== qb2id);
  const sat = sitPlayer(st, qb1id);
  assert.equal(sat.ok, true, sat.reason ?? "sit QB1");
  assert.equal(rosterCount(st, tid), before);
  assert.equal(isSat(st.teams[tid], qb1id), true);

  const g = userGame(st);
  assert.ok(g, "user has a week-1 game");
  declareGamedayInactives(st, [g.homeId, g.awayId]);
  const rng = new Rng(st.rngState);
  const result = simulateGame(st, g, rng);
  const satRow = result.box.players.find((s) => s.playerId === qb1id);
  assert.ok(!satRow || satRow.snaps === 0, "sat starter has 0 snaps");
  const backup = result.box.players.find((s) => s.playerId === qb2id);
  assert.ok(backup && backup.snaps > 0, "depth-chart next QB plays");
  assert.ok(result.box.inactives?.includes(qb1id));
  assert.equal(rosterCount(st, tid), before);
}

// List clears after the week; CPU clubs declare to the cap.
{
  const st = newGame({ seed: 5 });
  startRegularSeason(st);
  const tid = st.userTeamId;
  const qb1id = st.teams[tid].depthChart.QB[0];
  assert.equal(sitPlayer(st, qb1id).ok, true);

  const weekGames = st.games.filter(
    (g) => g.season === st.season && g.week === st.week && !g.played && g.playoffRound === null
  );
  const playing = new Set<number>();
  for (const g of weekGames) {
    playing.add(g.homeId);
    playing.add(g.awayId);
  }
  declareGamedayInactives(st, playing);
  for (const id of playing) {
    const v = gamedayInactiveView(st, id);
    assert.ok(v.credited >= v.need, `${st.teams[id].abbr} short of the ${v.cap} cap`);
    const healthyLive = clubActive(st, id).filter(
      (p) => p.injuryWeeks <= 0 && !isSat(st.teams[id], p.id)
    );
    assert.ok(healthyLive.length <= v.cap, `${st.teams[id].abbr} dressed ${healthyLive.length} > ${v.cap}`);
    if (id !== tid) {
      assert.ok((st.teams[id].inactives ?? []).length > 0 || v.injured >= v.need,
        `${st.teams[id].abbr} CPU did not declare`);
    }
  }

  simulateWeek(st);
  for (const t of st.teams) {
    assert.equal(t.inactives, undefined, `${t.abbr} sit list should clear`);
  }
  const played = st.games.find(
    (g) => g.played && (g.homeId === tid || g.awayId === tid) && g.week === 1
  );
  assert.ok(played?.boxScore);
  const satRow = played!.boxScore!.players.find((s) => s.playerId === qb1id);
  assert.ok(!satRow || satRow.snaps === 0);
  assert.equal(st.teams[tid].inactives, undefined, "next week starts with nobody sat");
}

// Activate undoes a sit; sitting more than the floor is allowed.
{
  const st = newGame({ seed: 6 });
  startRegularSeason(st);
  const tid = st.userTeamId;
  const extras = clubActive(st, tid)
    .filter((p) => p.injuryWeeks <= 0 && canSit(st, p))
    .sort((a, b) => a.ovr - b.ovr);
  const need = inactiveRequirement(st, tid);
  assert.ok(extras.length > need + 1);
  for (let i = 0; i < need + 1; i++) {
    assert.equal(sitPlayer(st, extras[i].id).ok, true);
  }
  assert.equal(stillNeedToSit(st, tid), 0);
  assert.ok((st.teams[tid].inactives ?? []).length > need || creditedInactives(st, tid) > need);
  assert.equal(activateFromInactive(st, extras[0].id).ok, true);
  assert.equal(isSat(st.teams[tid], extras[0].id), false);
  assert.equal(rosterCount(st, tid), ROSTER_LIMIT);
}

console.log("ok    inactives");
