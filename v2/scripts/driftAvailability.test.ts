import assert from "node:assert/strict";
import { newGame } from "../lib/core/newGame";
import { startRegularSeason } from "../lib/core/season/engine";
import { blankPlayerGameStat, blankSeasonLine, blankTeamGameStats } from "../lib/core/season/stats";
import { Game } from "../lib/core/types";
import { captureRegularAvailability } from "./driftAvailability";

const state = newGame({ seed: 42 });
startRegularSeason(state);
const regular = state.games.filter((g) => g.homeId === 0 || g.awayId === 0);
assert.equal(regular.length, 17, "the bye is not an eighteenth missed game");
const [starter, fullSeason, fringe, threshold, ir, ps, released, retired, prospect] =
  state.players.filter((p) => p.teamId === 0).slice(0, 9);
for (const p of [starter, fullSeason, fringe, threshold, ir, ps, released, retired, prospect]) {
  p.status = undefined; p.retired = false; p.prospect = false;
}
ir.status = "ir";
ps.status = "ps";
released.teamId = null;
retired.retired = true;
prospect.prospect = true;
for (const game of state.games) {
  game.played = true;
  game.boxScore = {
    home: blankTeamGameStats(), away: blankTeamGameStats(),
    quarters: { home: [], away: [] }, scoringPlays: [], players: [],
  };
}
function add(playerId: number, games: number, snaps: number): void {
  for (const game of regular.slice(0, games)) {
    game.boxScore!.players.push({ ...blankPlayerGameStat(playerId, 0, true), snaps });
  }
}
add(starter.id, 13, 60);
add(fullSeason.id, 17, 60);
add(fringe.id, 4, 30);
add(threshold.id, 2, 50);
for (const p of [ir, ps, released, retired, prospect]) add(p.id, 2, 60);
state.phase = "playoffs";

const before = structuredClone(state);
const captured = captureRegularAvailability(state);
assert.deepEqual(state, before, "observing availability must not change game state or RNG");
assert.equal(captured.playerWeeksLost, 17, "four starter absences plus thirteen fringe non-appearances");
assert.deepEqual(captured.rotation.map((p) => p.playerId), [starter.id, fullSeason.id, fringe.id]);
assert.deepEqual(captured.rotation.map((p) => p.missedWeeks), [4, 0, 13]);
assert.ok(Object.isFrozen(captured) && Object.isFrozen(captured.rotation) && captured.rotation.every(Object.isFrozen));
assert.equal(captured.rotation[0].scheduledGames, 17);
assert.equal(captured.rotation[0].appearances, 13);
assert.equal(captured.rotation[0].snaps, 780);

// Prior years and even legacy combined season rows cannot change REG box evidence.
const prior = structuredClone(regular[0]);
prior.season--;
state.games.push(prior);
for (const p of [starter, threshold]) {
  p.stats = [{ ...blankSeasonLine(state.season, 0), games: 21, snaps: 1200 }];
  p.postseasonUsage = [{ season: state.season, teamId: 0, snaps: 200 }];
}
assert.deepEqual(captureRegularAvailability(state), captured,
  "postseason workload cannot reduce missed weeks or promote a <=100 REG-snap player");

const playoff: Game = {
  ...structuredClone(regular[0]), id: 99999, week: 19, playoffRound: "WC", played: false,
};
state.games.push(playoff);
assert.deepEqual(captureRegularAvailability(state), captured, "future playoff games do not enter the denominator");
playoff.played = true;
playoff.boxScore!.players.push({ ...blankPlayerGameStat(threshold.id, 0, true), snaps: 200 });
starter.status = "ir";
fullSeason.teamId = null;
fringe.retired = true;
state.phase = "offseason-recap";
assert.equal(captured.playerWeeksLost, 17, "playoff injuries, releases and retirement cannot rewrite a frozen season");
assert.equal(captured.rotation[0].appearances, 13);
assert.equal(captured.rotation[0].teamId, 0);
assert.throws(() => captureRegularAvailability(state), /before playoffs/,
  "a late sample must fail instead of silently using a postseason roster");

const incomplete = structuredClone(before);
incomplete.games[0].played = false;
assert.throws(() => captureRegularAvailability(incomplete), /complete regular season/);
incomplete.games[0].played = true;
incomplete.games[0].boxScore = null;
assert.throws(() => captureRegularAvailability(incomplete), /every box score/);
const empty = structuredClone(before);
empty.players = [];
assert.throws(() => captureRegularAvailability(empty), /no regular-season rotation/);
const duplicate = structuredClone(before);
const first = duplicate.games.find((g) => g.boxScore!.players.length > 0)!;
first.boxScore!.players.push(first.boxScore!.players[0]);
assert.throws(() => captureRegularAvailability(duplicate), /duplicate appearance/);
console.log("ok    drift availability — frozen REG rotation, appearances, byes, playoff isolation, missing evidence");
