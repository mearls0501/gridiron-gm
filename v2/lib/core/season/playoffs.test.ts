/**
 * Playoff matchups are drawn when a round opens, not when it is simmed.
 *
 * Run: npx tsx lib/core/season/playoffs.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { newGame } from "../newGame";
import { advance, userNextGame } from "./engine";
import { buildBriefing } from "./briefing";
import { ensureCurrentRoundGames } from "./playoffs";
import { migrate } from "../../store/save";
import { Conference, Game, GameState, PlayoffRound } from "../types";

function ok(label: string) { console.log("ok   ", label); }

function markThrough(st: GameState, throughWeek: number): void {
  for (const g of st.games) {
    if (g.playoffRound !== null || g.week > throughWeek) continue;
    g.played = true;
    g.homeScore = 21;
    g.awayScore = 14;
  }
  st.week = throughWeek;
}

function roundGames(st: GameState, round: PlayoffRound): Game[] {
  return st.games.filter((g) => g.season === st.season && g.playoffRound === round);
}

function fingerprint(st: GameState): string {
  return st.games
    .filter((g) => g.playoffRound !== null)
    .slice()
    .sort((a, b) => a.id - b.id)
    .map((g) =>
      `${g.id}:${g.playoffRound}:${g.week}:${g.homeId}-${g.awayId}:${g.played}:${g.homeScore}-${g.awayScore}:${JSON.stringify(g.conditions)}`
    )
    .join("|");
}

function openPlayoffs(seed: number): GameState {
  const st = newGame({ seed });
  advance(st);
  markThrough(st, 17);
  st.week = 18;
  const msg = advance(st);
  assert.equal(msg, "Regular season complete — playoff field set");
  assert.equal(st.phase, "playoffs");
  assert.equal(st.playoffs?.round, "WC");
  assert.equal(st.week, 19);
  return st;
}

function assertWildCard(st: GameState): void {
  const games = roundGames(st, "WC");
  assert.equal(games.length, 6, "six wild-card games");
  assert.ok(games.every((g) => !g.played && g.week === 19));
  const ps = st.playoffs!;
  for (const conf of ["AFC", "NFC"] as Conference[]) {
    const bySeed = new Map(
      ps.seeds.filter((s) => s.conference === conf).map((s) => [s.seed, s.teamId]),
    );
    for (const [homeSeed, awaySeed] of [[2, 7], [3, 6], [4, 5]] as const) {
      const home = bySeed.get(homeSeed)!;
      const away = bySeed.get(awaySeed)!;
      assert.ok(
        games.some((g) => g.homeId === home && g.awayId === away),
        `${conf} ${homeSeed} hosts ${awaySeed}`,
      );
    }
    const bye = bySeed.get(1)!;
    assert.equal(
      games.some((g) => g.homeId === bye || g.awayId === bye),
      false,
      `${conf} 1 seed rests`,
    );
  }
}

{
  const st = openPlayoffs(20260420);
  assertWildCard(st);
  const rng = st.rngState;
  const nextId = st.nextGameId;
  const again = ensureCurrentRoundGames(st);
  assert.equal(again.length, 6);
  assert.equal(roundGames(st, "WC").length, 6, "a second draw does not duplicate");
  assert.equal(st.rngState, rng, "drawing does not move rngState");
  assert.equal(st.nextGameId, nextId);

  const userGame = roundGames(st, "WC").find(
    (g) => g.homeId === st.userTeamId || g.awayId === st.userTeamId,
  );
  const next = userNextGame(st);
  if (userGame) {
    assert.equal(next?.id, userGame.id, "hub and /play see the wild-card game");
    assert.equal(next?.played, false);
    const brief = buildBriefing(st);
    assert.ok(brief.opponent, "/week has a next opponent once the round is drawn");
  } else {
    assert.equal(next, undefined);
    assert.equal(buildBriefing(st).opponent, null);
  }

  const legacy = JSON.parse(JSON.stringify(st)) as GameState;
  const firstId = Math.min(...roundGames(legacy, "WC").map((g) => g.id));
  legacy.games = legacy.games.filter((g) => g.playoffRound === null);
  legacy.nextGameId = firstId;
  assert.equal(roundGames(legacy, "WC").length, 0);
  const loaded = migrate(JSON.parse(JSON.stringify(legacy)) as GameState);
  assert.equal(loaded.rngState, legacy.rngState, "load does not move rngState");
  assertWildCard(loaded);
  assert.equal(
    roundGames(loaded, "WC").map((g) => `${g.homeId}-${g.awayId}:${JSON.stringify(g.conditions)}`).sort().join("|"),
    roundGames(st, "WC").map((g) => `${g.homeId}-${g.awayId}:${JSON.stringify(g.conditions)}`).sort().join("|"),
    "a loaded undrawn round matches the round drawn at the open",
  );

  const drawn = JSON.parse(JSON.stringify(st)) as GameState;
  const undrawn = JSON.parse(JSON.stringify(legacy)) as GameState;

  const expectOpen: { round: PlayoffRound; n: number }[] = [
    { round: "DIV", n: 4 },
    { round: "CONF", n: 2 },
    { round: "SB", n: 1 },
  ];
  for (const step of expectOpen) {
    const before = drawn.playoffs?.round;
    advance(drawn);
    assert.equal(drawn.playoffs?.round, step.round, `${before} advance opens ${step.round}`);
    const games = roundGames(drawn, step.round);
    assert.equal(games.length, step.n);
    assert.ok(games.every((g) => !g.played), `${step.round} is visible before the next Sim`);
  }
  advance(drawn);
  assert.equal(drawn.phase, "offseason-recap");
  assert.equal(drawn.playoffs?.complete, true);
  assert.equal(drawn.games.filter((g) => g.playoffRound !== null).length, 13);
  assert.ok(drawn.games.filter((g) => g.playoffRound !== null).every((g) => g.played));

  let guard = 0;
  while (undrawn.phase === "playoffs" && guard++ < 8) advance(undrawn);
  assert.equal(undrawn.phase, "offseason-recap");
  assert.equal(fingerprint(drawn), fingerprint(undrawn), "pre-drawing the round matches draw-on-sim");
  assert.equal(drawn.rngState, undrawn.rngState);
  assert.equal(drawn.playoffs?.championId, undrawn.playoffs?.championId);
  ok("wild card is drawn when the regular season ends; later rounds open before Sim");
}

{
  const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
  const hub = readFileSync(join(root, "app/page.tsx"), "utf8");
  assert.match(
    hub,
    /state\.phase === "regular" \|\| state\.phase === "playoffs"\) && \(\s*<Link href="\/play">/,
  );
  const bracket = readFileSync(join(root, "app/playoffs/page.tsx"), "utf8");
  assert.match(bracket, /href="\/play"/);
  assert.match(bracket, /Call plays/);
  const brief = readFileSync(join(root, "lib/core/season/briefing.ts"), "utf8");
  assert.match(brief, /state\.phase === "playoffs"/);
  ok("hub, /week, and the bracket can open the drawn game");
}

console.log("ok    playoff draw");
