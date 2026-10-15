import assert from "node:assert/strict";
import { newGame } from "../newGame";
import { startRegularSeason } from "./engine";
import { Game, PlayerGameStat } from "../types";
import {
  applyGameStats, blankPlayerGameStat, blankSeasonLine, blankTeamGameStats,
  careerTotals, leaders,
} from "./stats";
import { careerRecords, franchiseCareerRecords, seasonRecords, teamSeasonStats } from "./records";
import { recordSeasonHistory } from "../offseason/progression";
import { presentSeasonReview } from "../../view/seasonReview";
import { decodeSave, encodeSave } from "../../store/codec";
import { migrate } from "../../store/save";
import { pruneNeverPlayed } from "../housekeeping";

const state = newGame({ seed: 42 });
startRegularSeason(state);
const qbs = state.players.filter((p) => p.teamId === 0 && p.pos === "QB");
const [a, b] = qbs;
const postseasonOnly = state.players.find((p) => p.teamId === 0 && p.pos === "RB")!;
assert.ok(a && b && postseasonOnly);
for (const game of state.games) {
  game.played = true;
  game.boxScore = {
    home: blankTeamGameStats(), away: blankTeamGameStats(),
    quarters: { home: [0, 0, 0, 0], away: [0, 0, 0, 0] }, scoringPlays: [], players: [],
  };
}
const regular = state.games.filter((g) => g.homeId === 0 || g.awayId === 0).slice(0, 2);
function line(playerId: number, yards: number, longest: number): PlayerGameStat {
  return {
    ...blankPlayerGameStat(playerId, 0, playerId === a.id),
    passAtt: 30, passCmp: 20, passYds: yards, passTd: 2, passLong: longest,
    rushAtt: 2, rushYds: 10, rushLong: 8, snaps: 60,
  };
}
regular[0].boxScore!.players = [line(a.id, 200, 80), line(b.id, 300, 60)];
regular[1].boxScore!.players = [line(a.id, 100, 40), line(b.id, 100, 30)];
for (const game of regular) applyGameStats(state, game);
const before = structuredClone(state.players.map((p) => p.stats));
const playoff: Game = {
  id: 999, season: state.season, week: 19, homeId: 0, awayId: 1,
  played: true, homeScore: 42, awayScore: 7, playoffRound: "WC",
  boxScore: {
    home: { ...blankTeamGameStats(), points: 42, passYards: 1000 },
    away: { ...blankTeamGameStats(), points: 7 },
    quarters: { home: [7, 7, 14, 14], away: [0, 0, 7, 0] }, scoringPlays: [],
    players: [line(a.id, 1000, 99), {
      ...blankPlayerGameStat(postseasonOnly.id, 0, true), rushYds: 200, rushLong: 90, snaps: 60,
    }],
  },
};
state.games.push(playoff);
state.phase = "offseason-recap";
const boxBefore = structuredClone(playoff);
applyGameStats(state, playoff);
assert.deepEqual(state.players.map((p) => p.stats), before,
  "every total, longest play, appearance, and start stays regular-season only");
assert.deepEqual(playoff, boxBefore, "the playoff score and individual box stay available");
assert.equal(postseasonOnly.stats.length, 0, "a playoff-only appearance creates no regular-season row");
assert.equal(postseasonOnly.playedPostseason, true);
assert.equal(leaders(state, "passYds")[0].player.id, b.id);
assert.equal(teamSeasonStats(state).get(0)!.games, 17);
assert.equal(teamSeasonStats(state).get(0)!.pointsFor, 0, "team regular-season totals exclude playoff points");
assert.equal(careerTotals(a).passYds, 300);
for (const table of [seasonRecords(state, "passYds"), careerRecords(state, "passYds"),
  franchiseCareerRecords(state, 0, "passYds")]) {
  assert.equal(table[0].player.id, b.id);
  assert.equal(table[0].value, 400);
}
const history = recordSeasonHistory(state);
assert.equal(history.leaders.passYds, b.id);
assert.equal(history.awards.mvp, b.id, "playoff heroics cannot change the season award");
state.history.push(history);
assert.equal(presentSeasonReview(state).leaders.find((l) => l.key === "passYds")?.value, "400");

const legacy = structuredClone(state);
legacy.history[0].leaders.passYds = a.id;
const legacyA = legacy.players.find((p) => p.id === a.id)!;
legacyA.stats[0].games++;
legacyA.stats[0].gamesStarted++;
legacyA.stats[0].passYds += 1000;
legacyA.stats[0].passLong = 99;
legacy.players.find((p) => p.id === postseasonOnly.id)!.stats = [{
  ...blankSeasonLine(state.season, 0), games: 1, gamesStarted: 1, rushYds: 200, rushLong: 90,
}];
const archived = { ...blankSeasonLine(state.season - 1, 0), games: 20, passYds: 5000 };
legacyA.stats.unshift(archived);
const incomplete = structuredClone(legacy);
incomplete.games[0].boxScore = null;
const incompleteStats = structuredClone(incomplete.players.map((p) => p.stats));
migrate(incomplete);
assert.deepEqual(incomplete.players.map((p) => p.stats), incompleteStats,
  "missing historical evidence must not erase or guess totals");
const gamesBefore = JSON.stringify(legacy.games);
const rngBefore = legacy.rngState;
migrate(legacy);
assert.equal(legacy.rngState, rngBefore);
assert.equal(JSON.stringify(legacy.games), gamesBefore);
assert.equal(legacyA.stats.find((s) => s.season === state.season)!.passYds, 300);
assert.equal(legacyA.stats.find((s) => s.season === state.season)!.passLong, 80);
assert.equal(legacy.history[0].leaders.passYds, b.id, "repair also corrects the archived leader identity");
assert.deepEqual(legacyA.stats.find((s) => s.season === archived.season), archived);
assert.equal(legacy.players.find((p) => p.id === postseasonOnly.id)!.stats.length, 0);
const repaired = JSON.stringify(legacy.players.map((p) => p.stats));
migrate(legacy);
assert.equal(JSON.stringify(legacy.players.map((p) => p.stats)), repaired, "repair is idempotent");
const loaded = decodeSave(JSON.parse(JSON.stringify(encodeSave(legacy))));
loaded.season++;
loaded.games = [];
loaded.players.find((p) => p.id === postseasonOnly.id)!.retired = true;
pruneNeverPlayed(loaded);
assert.ok(loaded.players.some((p) => p.id === postseasonOnly.id),
  "a playoff-only player remains available to historical box-score records after retirement");
assert.equal(leaders(loaded, "passYds", state.season)[0].value, 400,
  "regular-season totals survive save/reload and rollover after boxes are discarded");
console.log("ok    regular stats — playoffs, leaders, awards, records, legacy repair, and rollover");
