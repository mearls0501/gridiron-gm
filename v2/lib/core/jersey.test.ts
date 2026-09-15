/**
 * Jersey numbers: assignment uniqueness, migrate determinism, retire action.
 *
 * Child stream only — parent rngState must not move.
 *
 * Run: npx tsx lib/core/jersey.test.ts
 */
import assert from "node:assert/strict";
import { newGame } from "./newGame";
import { createNewGame } from "./generate";
import { decodeSave, encodeSave } from "../store/codec";
import { migrate } from "../store/save";
import { runRecap } from "./offseason";
import { blankSeasonLine } from "./season/stats";
import { GameState, Player } from "./types";
import {
  HOF_RETIRE_SEASONS,
  assignJerseyOnJoin,
  ensureJerseyNumbers,
  isLegalJersey,
  maybeRetireNumbersForHallOfFame,
  preferredJersey,
  retireUserNumber,
} from "./jersey";

function ok(label: string) { console.log("ok   ", label); }

function stripJerseys(state: GameState): GameState {
  const raw = JSON.parse(JSON.stringify(state)) as GameState;
  delete raw.jerseyRetireSeason;
  for (const p of raw.players) delete p.number;
  for (const t of raw.teams) delete t.retiredNumbers;
  return raw;
}

function clubNumbers(state: GameState, teamId: number): number[] {
  return state.players
    .filter((p) => p.teamId === teamId && typeof p.number === "number")
    .map((p) => p.number as number);
}

function snapshot(state: GameState): string {
  return JSON.stringify({
    players: state.players.map((p) => [p.id, p.number]),
    retired: state.teams.map((t) => [t.id, t.retiredNumbers ?? []]),
    rng: state.rngState,
  });
}

{
  const st = newGame({ seed: 21 });
  for (const t of st.teams) {
    const nums = clubNumbers(st, t.id);
    assert.equal(new Set(nums).size, nums.length, `${t.abbr} numbers are unique`);
    for (const p of st.players.filter((x) => x.teamId === t.id)) {
      assert.equal(typeof p.number, "number", `${p.id} has a number`);
      assert.equal(isLegalJersey(p.pos, p.number!), true, `${p.pos} #${p.number} is legal`);
    }
  }
  for (const p of st.players.filter((x) => x.teamId === null)) {
    assert.equal(typeof p.number, "number", `unrostered ${p.id} has a preferred number`);
    assert.equal(isLegalJersey(p.pos, p.number!), true);
  }
  ok("assignment is unique per club and position-legal");
}

{
  const a = createNewGame({ seed: 22 });
  const before = a.rngState;
  ensureJerseyNumbers(a);
  assert.equal(a.rngState, before, "ensure must not move the parent stream");
  const b = newGame({ seed: 22 });
  assert.equal(b.rngState, newGame({ seed: 22 }).rngState);
  ok("child stream does not move parent rngState");
}

{
  const live = newGame({ seed: 23 });
  const parent = live.rngState;
  const old = stripJerseys(decodeSave(encodeSave(live)));
  for (const p of old.players) assert.equal(p.number, undefined);
  const first = migrate(old);
  assert.equal(first.rngState, parent, "migrate does not touch parent RNG");
  const nums1 = snapshot(first);
  const old2 = stripJerseys(decodeSave(encodeSave(live)));
  old2.rngState = parent;
  const second = migrate(old2);
  assert.equal(snapshot(second), nums1, "migrate is deterministic");
  assert.equal(
    preferredJersey(live.seed, live.players[0]!.id, live.players[0]!.pos),
    preferredJersey(live.seed, live.players[0]!.id, live.players[0]!.pos),
  );
  ok("migrate assigns deterministically from (seed, jersey, playerId)");
}

{
  const st = newGame({ seed: 24 });
  const p = st.players.find((x) => x.teamId === st.userTeamId && !x.retired && !x.prospect);
  assert.ok(p, "need a rostered player");
  const worn = p.number;
  assert.equal(typeof worn, "number");
  const res = retireUserNumber(st, p.id);
  assert.equal(res.ok, true);
  if (res.ok) assert.equal(res.number, worn);
  const wall = st.teams[st.userTeamId].retiredNumbers ?? [];
  assert.equal(wall.some((r) => r.number === worn && r.playerId === p.id && r.reason === "user"), true);
  assert.equal(st.jerseyRetireSeason, st.season);
  assert.notEqual(p.number, worn, "wearer is reassigned off the retired number");
  assert.equal(clubNumbers(st, st.userTeamId).includes(worn!), false);

  const other = st.players.find(
    (x) => x.teamId === st.userTeamId && x.id !== p.id && !x.retired && !x.prospect
  );
  assert.ok(other);
  const again = retireUserNumber(st, other.id);
  assert.equal(again.ok, false);
  assert.equal(again.ok === false && again.reason.includes("one number per season"), true);
  ok("user retire writes the wall and is one per season");
}

{
  const st = newGame({ seed: 25 });
  const before = (st.teams[st.userTeamId].retiredNumbers ?? []).length;
  maybeRetireNumbersForHallOfFame(st);
  assert.equal((st.teams[st.userTeamId].retiredNumbers ?? []).length, before, "no-op without hallOfFame");

  const p = st.players.find((x) => x.teamId === st.userTeamId && x.pos === "QB" && !x.prospect)!;
  const lines = [];
  for (let i = 0; i < HOF_RETIRE_SEASONS; i++) {
    const line = blankSeasonLine(st.season - HOF_RETIRE_SEASONS + i, st.userTeamId);
    line.games = 16;
    lines.push(line);
  }
  p.stats = lines;
  const n = p.number;
  st.hallOfFame = [{
    playerId: p.id,
    inductedSeason: st.season,
    teamId: st.userTeamId,
    seasons: HOF_RETIRE_SEASONS,
    firstSeason: lines[0]!.season,
    lastSeason: lines[lines.length - 1]!.season,
    championships: 0,
  }];
  maybeRetireNumbersForHallOfFame(st);
  const wall = st.teams[st.userTeamId].retiredNumbers ?? [];
  assert.equal(wall.some((r) => r.number === n && r.reason === "hof"), true);
  ok("HOF hook no-ops until hallOfFame is present, then retires at 8 seasons");
}

{
  const st = newGame({ seed: 28 });
  st.phase = "offseason-recap";
  st.season = 2032;
  const p = st.players.find((x) => x.teamId === st.userTeamId && !x.prospect && !x.retired)!;
  const n = p.number;
  const years = [2020, 2021, 2022, 2023, 2024, 2025, 2026, 2027];
  p.stats = years.map((season) => {
    const line = blankSeasonLine(season, st.userTeamId);
    line.games = 16;
    line.gamesStarted = 16;
    return line;
  });
  p.retired = true;
  p.teamId = null;
  p.prospect = false;
  p.retiredSeason = 2027;
  p.starSeasons = 3;
  p.number = n;
  runRecap(st);
  assert.equal((st.hallOfFame ?? []).some((e) => e.playerId === p.id), true, "recap inducts");
  const wall = st.teams[st.userTeamId].retiredNumbers ?? [];
  assert.equal(wall.some((r) => r.number === n && r.playerId === p.id && r.reason === "hof"), true);
  ok("runRecap induction retires the number at a club with 8 seasons");
}

{
  const st = newGame({ seed: 26 });
  const fa = st.players.find((x) => x.teamId === null && !x.retired && !x.prospect);
  assert.ok(fa);
  const club = st.userTeamId;
  const taken = new Set(clubNumbers(st, club));
  fa.teamId = club;
  assignJerseyOnJoin(st, fa);
  assert.equal(typeof fa.number, "number");
  assert.equal(isLegalJersey(fa.pos, fa.number!), true);
  assert.equal(taken.has(fa.number!), false, "join does not collide");
  ok("assign on join is unique against the live club");
}

{
  const a = newGame({ seed: 27 });
  const b = newGame({ seed: 27 });
  assert.deepEqual(
    a.players.map((p: Player) => p.number),
    b.players.map((p: Player) => p.number),
  );
  ok("same seed same numbers");
}
