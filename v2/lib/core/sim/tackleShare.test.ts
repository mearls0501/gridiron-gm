/**
 * Signed 2026-11-10. A sim tackle is the stop the player makes himself.
 * The weighted draw bends past the §5.13 primary-tackle tails. No assist,
 * no combined total.
 *
 * Run: npx tsx lib/core/sim/tackleShare.test.ts
 */
import assert from "node:assert/strict";
import { newGame } from "../newGame";
import { advance } from "../season/engine";
import {
  GAME_TACKLE_SHARE_KNEE,
  GAME_TACKLE_SHARE_LAMBDA,
  SEASON_TACKLE_SHARE_KNEE,
  SEASON_TACKLE_SHARE_LAMBDA,
  TACKLE_CREDIT,
  creditsTackle,
  priorCountingStats,
  shareSaturation,
  tackleCreditRate,
} from "./game";
import type { Game, GameState } from "../types";

const E = Math.E;

assert.equal(GAME_TACKLE_SHARE_KNEE, 0.212);
assert.equal(SEASON_TACKLE_SHARE_KNEE, 0.171);
assert.ok(Math.abs(GAME_TACKLE_SHARE_LAMBDA - (1 / (11 - 0.212 * 31))) < 1e-12);
assert.ok(Math.abs(SEASON_TACKLE_SHARE_LAMBDA - (1 / ((0.171 - 0.139) * 748))) < 1e-12);

// The traced center, 16% of a game, is under the p90 knee.
assert.equal(shareSaturation(10, 60, GAME_TACKLE_SHARE_KNEE, GAME_TACKLE_SHARE_LAMBDA), 1);
// Baun, 11 of 31, is one e-fold. Not a zero.
const baun = shareSaturation(11, 31, GAME_TACKLE_SHARE_KNEE, GAME_TACKLE_SHARE_LAMBDA);
assert.ok(Math.abs(baun - 1 / E) < 1e-9, `baun multiplier ${baun}`);
// Oluokun, 128 of 748, is the season knee.
const oluokun = shareSaturation(128, 748, SEASON_TACKLE_SHARE_KNEE, SEASON_TACKLE_SHARE_LAMBDA);
assert.ok(Math.abs(oluokun - 1) < 0.005, `oluokun multiplier ${oluokun}`);
const pastSeason = shareSaturation(0.203 * 748, 748, SEASON_TACKLE_SHARE_KNEE, SEASON_TACKLE_SHARE_LAMBDA);
assert.ok(Math.abs(pastSeason - 1 / E) < 1e-6, `season e-fold ${pastSeason}`);
assert.ok(shareSaturation(40, 40, GAME_TACKLE_SHARE_KNEE, GAME_TACKLE_SHARE_LAMBDA) > 0);

function expectedCount(rawShare: number, tackles: number, knee: number, lambda: number): number {
  let mine = 0;
  for (let made = 0; made < tackles; made++) {
    const sat = shareSaturation(mine, made, knee, lambda);
    const w = rawShare * sat;
    const p = w / (w + (1 - rawShare));
    mine += p;
  }
  return mine;
}

assert.equal(creditsTackle(true, "run", 0), false);
assert.equal(creditsTackle(true, "catch", 0), false);
assert.equal(creditsTackle(true, "sack", 0), false);
assert.equal(creditsTackle(false, "run", 0), true);
assert.equal(creditsTackle(false, "run", tackleCreditRate("run")), false);
assert.ok(Math.abs(tackleCreditRate("run") - (41275 / 55037)) < 1e-12);
assert.ok(Math.abs(tackleCreditRate("catch") - (38002 / 43993)) < 1e-12);
assert.ok(Math.abs(tackleCreditRate("sack") - (4594 / 5213)) < 1e-12);
assert.ok(tackleCreditRate("run") < tackleCreditRate("catch") && tackleCreditRate("catch") < tackleCreditRate("sack"));
assert.equal(TACKLE_CREDIT.run.plays, 55037);

function planted(playoffRound: Game["playoffRound"], week: number): { state: GameState; game: Game } {
  const state = {
    players: [{
      id: 7,
      stats: [{ season: 2026, teamId: 3, tackles: 140, targets: 90 }],
    }],
    games: [{
      id: 1,
      season: 2026,
      week: 19,
      playoffRound: "WC",
      played: true,
      boxScore: { players: [{ playerId: 7, teamId: 3, tackles: 6, targets: 4 }] },
    }, {
      id: 2,
      season: 2026,
      week: 20,
      playoffRound: "DIV",
      played: true,
      boxScore: { players: [{ playerId: 7, teamId: 3, tackles: 5, targets: 2 }] },
    }],
  } as unknown as GameState;
  const game = { id: 9, season: 2026, week, playoffRound } as Game;
  return { state, game };
}

const regularPrior = planted(null, 8);
const regTackles = priorCountingStats(regularPrior.state, regularPrior.game, 3, "tackles");
const regTargets = priorCountingStats(regularPrior.state, regularPrior.game, 3, "targets");
assert.equal(regTackles.team, 140);
assert.equal(regTackles.byPlayer.get(7), 140);
assert.equal(regTargets.team, 90);

const wildCard = planted("WC", 19);
assert.equal(priorCountingStats(wildCard.state, wildCard.game, 3, "tackles").team, 0);
assert.equal(priorCountingStats(wildCard.state, wildCard.game, 3, "targets").team, 0);

const divisional = planted("DIV", 20);
const divTackles = priorCountingStats(divisional.state, divisional.game, 3, "tackles");
const divTargets = priorCountingStats(divisional.state, divisional.game, 3, "targets");
assert.equal(divTackles.team, 6, "a playoff game does not read the regular-season tackle line");
assert.equal(divTargets.team, 4);

const conference = planted("CONF", 21);
assert.equal(priorCountingStats(conference.state, conference.game, 3, "tackles").team, 11);
assert.equal(priorCountingStats(conference.state, conference.game, 3, "targets").team, 6);
assert.equal(priorCountingStats(conference.state, conference.game, 4, "tackles").team, 0);

const ordinary = expectedCount(0.164, 60, GAME_TACKLE_SHARE_KNEE, GAME_TACKLE_SHARE_LAMBDA);
assert.ok(Math.abs(ordinary / 60 - 0.164) < 0.01, `ordinary game moved to ${ordinary}`);
const hot = expectedCount(0.70, 80, GAME_TACKLE_SHARE_KNEE, GAME_TACKLE_SHARE_LAMBDA);
assert.ok(hot < 30 && hot > GAME_TACKLE_SHARE_KNEE * 80, `hot game ${hot}`);
console.log(`tackle shape: ordinary ${ordinary.toFixed(1)}, hot game ${hot.toFixed(1)}`);

function regularMax(seed: number): { max: number; leaderMedian: number; games: number } {
  const st = newGame({ seed });
  let guard = 0;
  while (st.phase !== "regular" && guard++ < 8) advance(st);
  while (st.phase === "regular" && guard++ < 40) advance(st);
  let max = 0;
  const leaders: number[] = [];
  let games = 0;
  for (const g of st.games) {
    if (!g.played || g.playoffRound !== null || !g.boxScore) continue;
    for (const teamId of [g.homeId, g.awayId]) {
      const players = g.boxScore.players.filter((p) => p.teamId === teamId);
      const team = players.reduce((s, p) => s + p.tackles, 0);
      if (team <= 0) continue;
      games++;
      let best = 0;
      for (const p of players) {
        if (p.tackles > max) max = p.tackles;
        if (p.tackles > best) best = p.tackles;
      }
      leaders.push(best / team);
    }
  }
  leaders.sort((a, b) => a - b);
  return { max, leaderMedian: leaders[Math.floor(leaders.length / 2)] ?? 0, games };
}

for (const seed of [1, 42]) {
  const row = regularMax(seed);
  console.log(
    `seed ${seed}: max game tackles ${row.max}, leader median ${(100 * row.leaderMedian).toFixed(1)}% ` +
    `(${row.games} team-games)`,
  );
  assert.ok(row.max < 30, `seed ${seed} still has a ${row.max}-tackle game`);
  // §5.13 leader median is 15.9%. A bend that flattens the draw fails this floor.
  assert.ok(row.leaderMedian >= 0.12 && row.leaderMedian <= 0.28, `leader median ${row.leaderMedian}`);
  assert.ok(row.games >= 400, `team-games ${row.games}`);
}

console.log("tackle share saturation: PASS");
