import assert from "node:assert/strict";
import { newGame } from "../newGame";
import { Rng } from "../rng";
import { startRegularSeason } from "../season/engine";
import { GameState } from "../types";
import { MAX_SCRIMMAGE_SECONDS, takeLastKick } from "./clock";
import { openGameSim, simulateGame } from "./game";

for (const margin of [-30, -4, -3, 0, 1, 30]) {
  assert.equal(takeLastKick(2, 1, margin), true, "first-half points regardless of score");
  assert.equal(takeLastKick(2, MAX_SCRIMMAGE_SECONDS, margin), true);
  assert.equal(takeLastKick(2, MAX_SCRIMMAGE_SECONDS + 1, margin), false, "another full snap fits");
}
for (const quarter of [4, 5]) {
  for (const margin of [-3, -2, -1, 0]) assert.equal(takeLastKick(quarter, 10, margin), true);
  for (const margin of [-10, -4, 1, 7]) assert.equal(takeLastKick(quarter, 10, margin), false,
    "do not concede a required touchdown or replace victory formation");
}
for (const quarter of [1, 3]) assert.equal(takeLastKick(quarter, 1, 0), false);
for (const clock of [0, -1, 46, 900]) assert.equal(takeLastKick(2, clock, 0), false);

const clone = (s: GameState): GameState => JSON.parse(JSON.stringify(s));
let earlyKicks = 0;
let observedQuarterChanges = 0;
for (const seed of [1, 2, 3, 4, 5]) {
  const state = newGame({ seed });
  startRegularSeason(state);
  for (const game of state.games.filter(g => g.week === 1).slice(0, 8)) {
    const st = clone(state);
    const rng = new Rng(seed * 1000 + game.id);
    const result = simulateGame(st, game, rng);
    const plays = result.plays;
    for (let i = 1; i < plays.length; i++) {
      const e = plays[i], prev = plays[i - 1];
      if (prev.q !== e.q) observedQuarterChanges++;
      if (e.q !== 2 || prev.q !== 2 || prev.offenseId !== e.offenseId ||
          prev.clock <= 0 || prev.clock > MAX_SCRIMMAGE_SECONDS) continue;
      // A <=37-yard kick is inside even the weakest generated kicker's weather-adjusted range.
      if (e.yardLine >= 80) assert.ok(!["run", "pass", "sack"].includes(e.kind),
        `seed ${seed} game ${game.id}: no early-down clock expiration in comfortable range`);
      if (e.kind === "fg" && e.down < 4) earlyKicks++;
    }
    // The decision must use the normal scoring/stat path, including misses.
    for (const [teamId, points] of [[game.homeId, result.homeScore], [game.awayId, result.awayScore]]) {
      const score = result.box.players.filter(p => p.teamId === teamId).reduce((sum, p) =>
        sum + 6 * (p.passTd + p.rushTd + p.defTd + p.krTd + p.prTd) +
        p.xpm + 2 * p.twoPtMade + 3 * p.fgm + 2 * p.safeties, 0);
      assert.equal(score, points);
    }
  }
}
assert.ok(earlyKicks > 0, "fixtures exercise the new early-down kick, not just the policy helper");
assert.ok(observedQuarterChanges > 0);

// The automatic kick precedes live snap prompts and uses the same RNG/stat path for CPU games.
{
  const base = newGame({ seed: 3 });
  startRegularSeason(base);
  const game = base.games.find(g => g.week === 1)!;
  base.userTeamId = game.homeId;
  const bulkState = clone(base), liveState = clone(base), cpuState = clone(base);
  const bulkRng = new Rng(3000 + game.id), liveRng = new Rng(3000 + game.id), cpuRng = new Rng(3000 + game.id);
  const bulk = simulateGame(bulkState, game, bulkRng);
  const gen = openGameSim(liveState, game, liveRng);
  let step = gen.next();
  while (!step.done) step = gen.next("auto");
  assert.deepEqual(step.value, bulk);
  assert.deepEqual(liveState, bulkState);
  assert.equal(liveRng.state, bulkRng.state);
  cpuState.userTeamId = -1;
  const cpu = simulateGame(cpuState, game, cpuRng);
  assert.deepEqual(cpu.plays, bulk.plays);
  assert.equal(cpuRng.state, bulkRng.state);
}
console.log(`end-of-half clock: PASS (${earlyKicks} early-down first-half kicks)`);
