import assert from "node:assert/strict";
import { newGame } from "../lib/core/newGame";
import { advance, startRegularSeason } from "../lib/core/season/engine";
import { blankPlayerGameStat, blankSeasonLine, blankTeamGameStats } from "../lib/core/season/stats";
import { Game } from "../lib/core/types";
import { captureRotationNonappearance, RegularAvailabilityTracker } from "./driftAvailability";

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
const captured = captureRotationNonappearance(state);
assert.deepEqual(state, before, "observing availability must not change game state or RNG");
assert.equal(captured.nonappearanceWeeks, 17, "four starter absences plus thirteen fringe non-appearances");
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
assert.deepEqual(captureRotationNonappearance(state), captured,
  "postseason workload cannot reduce missed weeks or promote a <=100 REG-snap player");

const playoff: Game = {
  ...structuredClone(regular[0]), id: 99999, week: 19, playoffRound: "WC", played: false,
};
state.games.push(playoff);
assert.deepEqual(captureRotationNonappearance(state), captured, "future playoff games do not enter the denominator");
playoff.played = true;
playoff.boxScore!.players.push({ ...blankPlayerGameStat(threshold.id, 0, true), snaps: 200 });
starter.status = "ir";
fullSeason.teamId = null;
fringe.retired = true;
state.phase = "offseason-recap";
assert.equal(captured.nonappearanceWeeks, 17, "playoff injuries, releases and retirement cannot rewrite a frozen season");
assert.equal(captured.rotation[0].appearances, 13);
assert.equal(captured.rotation[0].teamId, 0);
assert.throws(() => captureRotationNonappearance(state), /before playoffs/,
  "a late sample must fail instead of silently using a postseason roster");

const incomplete = structuredClone(before);
incomplete.games[0].played = false;
assert.throws(() => captureRotationNonappearance(incomplete), /complete regular season/);
incomplete.games[0].played = true;
incomplete.games[0].boxScore = null;
assert.throws(() => captureRotationNonappearance(incomplete), /every box score/);
const empty = structuredClone(before);
empty.players = [];
assert.throws(() => captureRotationNonappearance(empty), /no regular-season rotation/);
const duplicate = structuredClone(before);
const first = duplicate.games.find((g) => g.boxScore!.players.length > 0)!;
first.boxScore!.players.push(first.boxScore!.players[0]);
assert.throws(() => captureRotationNonappearance(duplicate), /duplicate appearance/);
console.log("ok    drift availability — frozen REG rotation, appearances, byes, playoff isolation, missing evidence");

// A complete kickoff stream distinguishes injury/IR from healthy bench and churn.
const weekly = newGame({ seed: 91 });
startRegularSeason(weekly);
const [rotation, hurt, reserve, practice, street] = weekly.players.filter((p) => p.teamId === 0).slice(0, 5);
weekly.players = [rotation, hurt, reserve, practice, street];
for (const p of weekly.players) {
  p.retired = false; p.prospect = false; p.status = undefined; p.injuryWeeks = 0;
  delete p.psychology;
}
hurt.injuryWeeks = 40; // No snaps all year: must still count.
reserve.status = "ir"; reserve.injuryWeeks = 8;
practice.status = "ps"; practice.injuryWeeks = 40;
street.teamId = null; street.injuryWeeks = 40;
const tracker = new RegularAvailabilityTracker(weekly.season);
const missing = new RegularAvailabilityTracker(weekly.season);
let clubGame = 0;
for (let week = 1; week <= 18; week++) {
  weekly.week = week;
  const games = weekly.games.filter((g) => g.week === week);
  const own = games.find((g) => g.homeId === 0 || g.awayId === 0);
  weekly.teams[0].inactives = [];
  rotation.teamId = 0; rotation.status = undefined; rotation.injuryWeeks = 0;
  if (own) {
    clubGame++;
    if (clubGame >= 3 && clubGame <= 4) rotation.injuryWeeks = 1;
    if (clubGame >= 5 && clubGame <= 6) rotation.status = "ir";
    if (clubGame >= 7 && clubGame <= 8) rotation.status = "ps";
    if (clubGame >= 9 && clubGame <= 10) rotation.teamId = null;
    if (clubGame >= 11 && clubGame <= 12) weekly.teams[0].inactives = [rotation.id];
    reserve.injuryWeeks = clubGame <= 8 ? 1 : 0;
  }
  tracker.observeKickoff(weekly, games);
  if (week !== 1) missing.observeKickoff(weekly, games);
  if (week === 1) assert.throws(() => tracker.observeKickoff(weekly, games), /duplicate availability kickoff/);
  // Later healing/activation cannot change any captured kickoff.
  hurt.injuryWeeks = 0;
  reserve.status = undefined;
  for (const game of games) {
    game.played = true;
    game.boxScore = {
      home: blankTeamGameStats(), away: blankTeamGameStats(),
      quarters: { home: [], away: [] }, scoringPlays: [], players: [],
    };
  }
  if (own && clubGame <= 2) own.boxScore!.players.push({ ...blankPlayerGameStat(rotation.id, 0, own.homeId === 0), snaps: 60 });
  hurt.injuryWeeks = 40;
  reserve.status = "ir";
}
weekly.phase = "playoffs";
const measured = tracker.finish(weekly);
assert.ok(Object.isFrozen(measured));
assert.equal(measured.observedWeeks, 18);
assert.equal(measured.injuredActiveWeeks, 19, "17 zero-snap injuries plus two rotation injuries; no bye or PS/FA time");
assert.equal(measured.injuredIrWeeks, 8);
assert.equal(measured.healthyIrWeeks, 11, "IR restrictions persist after healing and count without double counting injury");
assert.equal(measured.injuryIrMissedWeeks, 38);
assert.equal(measured.rotationNonappearanceWeeks, 15);
assert.equal(measured.rotationInjuryIrWeeks, 4);
assert.equal(measured.rotationChurnWeeks, 4);
assert.equal(measured.rotationHealthyScratchWeeks, 2);
assert.equal(measured.rotationHealthyNoRowWeeks, 5);
assert.equal(measured.rotationBenchWeeks, 7);
assert.equal(measured.rotationCalendarAdjustment, 0);
assert.throws(() => missing.finish(weekly), /missing regular-season kickoff/);
hurt.injuryWeeks = 0; reserve.status = undefined;
assert.deepEqual(tracker.finish(weekly), measured, "later mutable injury/IR fields cannot rewrite the frozen ledger");
const impossible = structuredClone(weekly);
const hurtGame = impossible.games.find((g) => g.week === 1)!;
hurtGame.boxScore!.players.push({ ...blankPlayerGameStat(hurt.id, 0, true), snaps: 1 });
assert.throws(() => tracker.finish(impossible), /unavailable player/);
assert.throws(() => tracker.observeKickoff(weekly, weekly.games.slice(0, 1)), /before games/);

// Exercise the real engine path: observation consumes no draws and changes no save bytes.
const unobserved = newGame({ seed: 12345 });
const observed = structuredClone(unobserved);
const actual = new RegularAvailabilityTracker(observed.season);
let callbacks = 0;
const observe: typeof actual.observeKickoff = (s, games) => {
  callbacks++;
  assert.ok(games.every((g) => !g.played));
  actual.observeKickoff(s, games);
};
advance(unobserved); advance(observed, observe);
assert.equal(callbacks, 0, "starting REG is not a kickoff");
advance(unobserved); advance(observed, observe);
assert.equal(callbacks, 1);
assert.deepEqual(observed, unobserved, "optional kickoff observer preserves the complete seeded game state");
console.log("ok    drift injury/IR — kickoff timing, zero-snap injury, year-end IR, byes, bench/churn separation, frozen evidence, deterministic engine");
