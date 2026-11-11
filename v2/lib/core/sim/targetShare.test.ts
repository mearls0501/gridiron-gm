/**
 * Signed 2026-11-10. Soft target-share saturation, and one tackle on a
 * fumble play. Shape anchors: docs/nfl-reference.md §5.13 and
 * docs/playtest-1029-records.md.
 *
 * Run: npx tsx lib/core/sim/targetShare.test.ts
 */
import assert from "node:assert/strict";
import { newGame } from "../newGame";
import { Rng } from "../rng";
import { advance } from "../season/engine";
import type { GameState, PlayEvent } from "../types";
import {
  GAME_TARGET_SHARE_KNEE,
  GAME_TARGET_SHARE_LAMBDA,
  SEASON_TARGET_SHARE_KNEE,
  SEASON_TARGET_SHARE_LAMBDA,
  simulateGame,
  targetShareSaturation,
} from "./game";

const E = Math.E;

assert.equal(GAME_TARGET_SHARE_KNEE, 0.486);
assert.equal(SEASON_TARGET_SHARE_KNEE, 0.331);
// One e-fold from the single-game p99.9 to Nabers, 18 of 27.
assert.ok(Math.abs(GAME_TARGET_SHARE_LAMBDA - (1 / (18 - 0.486 * 27))) < 1e-12);
// One e-fold across the club-#1 p90-to-max gap, on Thomas's 559 targets.
assert.ok(Math.abs(SEASON_TARGET_SHARE_LAMBDA - (1 / ((0.331 - 0.288) * 559))) < 1e-12);

assert.equal(targetShareSaturation(0, 0, GAME_TARGET_SHARE_KNEE, GAME_TARGET_SHARE_LAMBDA), 1);
assert.equal(targetShareSaturation(1, 0, GAME_TARGET_SHARE_KNEE, GAME_TARGET_SHARE_LAMBDA), 1);
// Below the knee the weight is unchanged. 12 of 40 is 30%, the all-player p95.
assert.equal(targetShareSaturation(12, 40, GAME_TARGET_SHARE_KNEE, GAME_TARGET_SHARE_LAMBDA), 1);
// Exactly at the knee.
const atKnee = 0.486 * 40;
assert.equal(targetShareSaturation(atKnee, 40, GAME_TARGET_SHARE_KNEE, GAME_TARGET_SHARE_LAMBDA), 1);
// Nabers's row is one e-fold, not a zero.
const nabers = targetShareSaturation(18, 27, GAME_TARGET_SHARE_KNEE, GAME_TARGET_SHARE_LAMBDA);
assert.ok(Math.abs(nabers - 1 / E) < 1e-9, `nabers multiplier ${nabers}`);
// Thomas is the season knee. One e-fold past him is still a positive weight.
assert.equal(targetShareSaturation(185, 559, SEASON_TARGET_SHARE_KNEE, SEASON_TARGET_SHARE_LAMBDA), 1);
const pastMax = targetShareSaturation(0.374 * 559, 559, SEASON_TARGET_SHARE_KNEE, SEASON_TARGET_SHARE_LAMBDA);
assert.ok(Math.abs(pastMax - 1 / E) < 1e-6, `season e-fold ${pastMax}`);
// A whole game of targets does not hit a wall.
const buried = targetShareSaturation(40, 40, GAME_TARGET_SHARE_KNEE, GAME_TARGET_SHARE_LAMBDA);
assert.ok(buried > 0 && buried < nabers, `buried ${buried}`);
// One more target above the knee strictly lowers the weight.
const justOver = targetShareSaturation(atKnee + 1, 40, GAME_TARGET_SHARE_KNEE, GAME_TARGET_SHARE_LAMBDA);
const twoOver = targetShareSaturation(atKnee + 2, 40, GAME_TARGET_SHARE_KNEE, GAME_TARGET_SHARE_LAMBDA);
assert.ok(justOver < 1 && twoOver < justOver);

/**
 * Expected share if each throw is taken with probability proportional to a
 * fixed raw weight, times the saturation of the targets already in hand.
 * A share inside the body stays put. A 75% raw share bends and does not run
 * away, and it does not collapse to zero.
 */
function expectedShare(
  rawShare: number,
  attempts: number,
  knee: number,
  lambda: number,
): number {
  let mine = 0;
  for (let thrown = 0; thrown < attempts; thrown++) {
    const sat = targetShareSaturation(mine, thrown, knee, lambda);
    const w = rawShare * sat;
    const p = w / (w + (1 - rawShare));
    mine += p;
  }
  return mine / attempts;
}

const ordinary = expectedShare(0.30, 40, GAME_TARGET_SHARE_KNEE, GAME_TARGET_SHARE_LAMBDA);
assert.ok(Math.abs(ordinary - 0.30) < 0.005, `ordinary game share moved to ${ordinary}`);
const hot = expectedShare(0.75, 40, GAME_TARGET_SHARE_KNEE, GAME_TARGET_SHARE_LAMBDA);
assert.ok(hot > GAME_TARGET_SHARE_KNEE && hot < 0.62, `hot game share ${hot}`);
const seasonHot = expectedShare(0.45, 560, SEASON_TARGET_SHARE_KNEE, SEASON_TARGET_SHARE_LAMBDA);
assert.ok(seasonHot > 0.28 && seasonHot < 0.374, `hot season share ${seasonHot}`);

console.log(
  `target share shape: ordinary ${ordinary.toFixed(3)}, hot game ${hot.toFixed(3)}, hot season ${seasonHot.toFixed(3)}`,
);

function sum(
  rows: readonly {
    rushAtt: number; rushTd: number; rec: number; recTd: number;
    sacked: number; tackles: number; fumbles: number; fumblesLost: number;
  }[],
  key: "rushAtt" | "rushTd" | "rec" | "recTd" | "sacked" | "tackles" | "fumbles" | "fumblesLost",
): number {
  let n = 0;
  for (const row of rows) n += row[key];
  return n;
}

function kneelsByOffense(plays: PlayEvent[]): Map<number, number> {
  const out = new Map<number, number>();
  for (const e of plays) {
    if (e.kind !== "kneel") continue;
    out.set(e.offenseId, (out.get(e.offenseId) ?? 0) + 1);
  }
  return out;
}

/**
 * A stop is a rush (kneels are not stops), a reception, or a sack.
 * A scoring rush or catch credits no tackle. A kept fumble is still one
 * stop, not two. Non-scoring stops credit at the traced rate, so tackles
 * sit under the non-scoring stops and do not match them one for one.
 */
function tackleGap(st: GameState, seed: number): {
  overStops: number; overLive: number; tackles: number; liveStops: number; kept: number; games: number;
} {
  let overStops = 0;
  let overLive = 0;
  let tackles = 0;
  let liveStops = 0;
  let kept = 0;
  let games = 0;
  for (const game of st.games.filter((g) => g.week === 1)) {
    const copy = JSON.parse(JSON.stringify(st)) as GameState;
    const result = simulateGame(copy, game, new Rng(seed * 1000 + game.id));
    const kneels = kneelsByOffense(result.plays);
    for (const [offId, defId] of [[game.homeId, game.awayId], [game.awayId, game.homeId]] as const) {
      const off = result.box.players.filter((p) => p.teamId === offId);
      const def = result.box.players.filter((p) => p.teamId === defId);
      const stops = sum(off, "rushAtt") - (kneels.get(offId) ?? 0) + sum(off, "rec") + sum(off, "sacked");
      const scores = sum(off, "rushTd") + sum(off, "recTd");
      const credited = sum(def, "tackles");
      if (credited > stops) overStops += credited - stops;
      if (credited > stops - scores) overLive += credited - (stops - scores);
      tackles += credited;
      liveStops += stops - scores;
      kept += sum(off, "fumbles") - sum(off, "fumblesLost");
    }
    games++;
  }
  return { overStops, overLive, tackles, liveStops, kept, games };
}

let keptFumbles = 0;
let fumbleGames = 0;
let credited = 0;
let liveStops = 0;
for (const seed of [1, 7, 42]) {
  const st = newGame({ seed });
  advance(st);
  const row = tackleGap(st, seed);
  assert.equal(row.overStops, 0, `seed ${seed}: tackles exceed stops by ${row.overStops}`);
  assert.equal(row.overLive, 0, `seed ${seed}: a score or a second fumble credit added ${row.overLive}`);
  keptFumbles += row.kept;
  fumbleGames += row.games;
  credited += row.tackles;
  liveStops += row.liveStops;
}
assert.ok(keptFumbles > 0, "week 1 produced a kept fumble, so the regression is not vacuous");
const rate = credited / liveStops;
assert.ok(rate > 0.6 && rate < 0.95, `credit rate ${rate} (${credited}/${liveStops})`);
console.log(
  `fumble tackle: PASS (${fumbleGames} week-1 games, ${keptFumbles} kept fumbles, ` +
  `credit ${credited}/${liveStops} = ${rate.toFixed(3)})`,
);

function quantile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  const i = Math.min(sorted.length - 1, Math.round((sorted.length - 1) * p));
  return sorted[i];
}

interface ShareRow { share: number; targets: number; teamTargets: number; rec: number; yds: number }

function regularSeason(seed: number): {
  games: ShareRow[];
  seasons: ShareRow[];
  leaderShares: number[];
  club1: number[];
} {
  const st = newGame({ seed });
  let guard = 0;
  while (st.phase !== "regular" && guard++ < 8) advance(st);
  while (st.phase === "regular" && guard++ < 40) advance(st);
  const games: ShareRow[] = [];
  const leader = new Map<string, number>();
  for (const g of st.games) {
    if (!g.played || g.playoffRound !== null || !g.boxScore) continue;
    for (const teamId of [g.homeId, g.awayId]) {
      const players = g.boxScore.players.filter((p) => p.teamId === teamId);
      const teamTargets = players.reduce((s, p) => s + p.targets, 0);
      if (teamTargets < 20) continue;
      let best = 0;
      for (const p of players) {
        if (p.targets <= 0) continue;
        const share = p.targets / teamTargets;
        games.push({ share, targets: p.targets, teamTargets, rec: p.rec, yds: p.recYds });
        if (share > best) best = share;
      }
      leader.set(`${g.week}:${teamId}`, best);
    }
  }
  const teamTargets = new Map<number, number>();
  const lines: { teamId: number; targets: number; rec: number; yds: number }[] = [];
  for (const p of st.players) {
    const line = p.stats.find((s) => s.season === st.season && s.teamId !== null && s.targets > 0);
    if (!line || line.teamId === null) continue;
    teamTargets.set(line.teamId, (teamTargets.get(line.teamId) ?? 0) + line.targets);
    lines.push({ teamId: line.teamId, targets: line.targets, rec: line.rec, yds: line.recYds });
  }
  const seasons: ShareRow[] = [];
  const club1 = new Map<number, number>();
  for (const line of lines) {
    const team = teamTargets.get(line.teamId) ?? 0;
    if (team < 400) continue;
    const share = line.targets / team;
    seasons.push({ share, targets: line.targets, teamTargets: team, rec: line.rec, yds: line.yds });
    club1.set(line.teamId, Math.max(club1.get(line.teamId) ?? 0, share));
  }
  return { games, seasons, leaderShares: [...leader.values()], club1: [...club1.values()] };
}

for (const seed of [42, 7]) {
  const row = regularSeason(seed);
  const shares = row.games.map((g) => g.share).sort((a, b) => a - b);
  const leaders = [...row.leaderShares].sort((a, b) => a - b);
  const maxGame = shares.at(-1) ?? 0;
  const maxSeason = Math.max(0, ...row.seasons.map((s) => s.share));
  const meanClub = row.club1.reduce((s, x) => s + x, 0) / row.club1.length;
  const hot = [...row.games].sort((a, b) => b.share - a.share)[0];
  console.log(
    `seed ${seed}: game max ${(100 * maxGame).toFixed(1)}% (${hot?.targets}/${hot?.teamTargets}), ` +
    `leader p50 ${(100 * quantile(leaders, 0.5)).toFixed(1)}% p95 ${(100 * quantile(leaders, 0.95)).toFixed(1)}%, ` +
    `all-player p95 ${(100 * quantile(shares, 0.95)).toFixed(1)}%, ` +
    `season max ${(100 * maxSeason).toFixed(1)}%, club #1 mean ${(100 * meanClub).toFixed(1)}%`,
  );
  // NFL single-game maximum is 66.7% (Nabers, 18 of 27). The bend is not a
  // cap; this is the published maximum the long sample is not allowed past.
  assert.ok(maxGame <= 0.667, `seed ${seed} game share ${(100 * maxGame).toFixed(1)}% exceeds 66.7%`);
  // One e-fold past the club-#1 maximum (33.1% + the 4.3-point p90-to-max gap).
  // Thomas's 33.1% is the knee, so a season can step past it. 37.4% is that
  // step. The playtest's 38% seasons are on the other side of it.
  assert.ok(maxSeason <= 0.374, `seed ${seed} season share ${(100 * maxSeason).toFixed(1)}% exceeds 37.4%`);
  // Body of the distribution, §5.13. Leader median is 28.1%. Club-#1 mean is
  // 23.2%. Crushing either means the knee was put on ordinary weeks.
  assert.ok(quantile(leaders, 0.5) >= 0.22 && quantile(leaders, 0.5) <= 0.36,
    `leader median ${quantile(leaders, 0.5)}`);
  assert.ok(quantile(shares, 0.95) >= 0.24 && quantile(shares, 0.95) <= 0.40,
    `all-player p95 ${quantile(shares, 0.95)}`);
  assert.ok(meanClub >= 0.18 && meanClub <= 0.30, `club #1 mean ${meanClub}`);
  assert.ok(row.club1.length >= 30, `clubs ${row.club1.length}`);
}

console.log("target share saturation: PASS");
