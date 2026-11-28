/**
 * Kicking-game events, Stage 1. A blocked field goal or extra point is a
 * label on a kick the engine already missed. A punt fair catch is a label on
 * a punt the engine already did not return. The coins ride their own stream,
 * so no score, possession, stat or parent draw moves (nfl-reference.md §5.14).
 * The field-goal coin is the traced share of misses. The extra-point coin is
 * the traced rate per attempt, divided by that kick's miss probability.
 *
 * Run: npx tsx lib/core/sim/kickingEvents.test.ts
 */
import assert from "node:assert/strict";
import { newGame } from "../newGame";
import { Rng } from "../rng";
import { KICK_EVENT, blockRateGivenMiss, kickEventRate, simulateGame } from "./game";
import { STARTERS } from "../types";
import type { Game, GameState, PlayEvent } from "../types";
import { formatPlay } from "../../view/playByPlay";

// The §5.14 counts, exactly.
assert.deepEqual(KICK_EVENT.fgBlocked, { events: 78, plays: 639 });
assert.deepEqual(KICK_EVENT.xpBlocked, { events: 31, plays: 247, attempts: 4854 });
assert.deepEqual(KICK_EVENT.puntFairCatch, { events: 2352, plays: 4255 });
assert.equal(kickEventRate("fgBlocked"), 78 / 639);
assert.equal(kickEventRate("xpBlocked"), 31 / 247);
assert.equal(kickEventRate("puntFairCatch"), 2352 / 4255);
// At the league's own miss rate the attempt coin is the share of misses.
{
  const atLeagueMiss = blockRateGivenMiss("xpBlocked", 247 / 4854);
  assert.ok(Math.abs(atLeagueMiss - 31 / 247) < 1e-12, `league miss coin ${atLeagueMiss}`);
}
// A miss chance above the league's lowers the coin so blocks per attempt stay 31/4854.
assert.equal(blockRateGivenMiss("xpBlocked", 0.09), (31 / 4854) / 0.09);
assert.equal(blockRateGivenMiss("xpBlocked", 0.001), 1);
assert.equal(blockRateGivenMiss("xpBlocked", 0), 0);
console.log("ok    kickingEvents — the §5.14 rows");

type Block = { teamId: number; playerId: number };

function play(st: GameState, i: number, id = 9000 + i) {
  const g = {
    id, season: st.season, week: 1, homeId: i % 32, awayId: (i * 7 + 3) % 32,
    played: false, homeScore: 0, awayScore: 0, playoffRound: null, boxScore: null,
  } as unknown as Game;
  if (g.homeId === g.awayId) return null;
  for (const p of st.players) { p.injuryWeeks = 0; p.injuryDesc = null; }
  const blocks: Block[] = [];
  const rng = new Rng(5000 + i);
  const r = simulateGame(st, g, rng, {
    onKickBlock: (teamId, playerId) => blocks.push({ teamId, playerId }),
  });
  return { g, r, blocks, rngState: rng.state };
}

/** A play row with the two new labels folded back into what they were carved from. */
function unlabelled(e: PlayEvent): PlayEvent {
  if (e.result === "blocked") return { ...e, result: "miss" };
  if (e.result === "fair_catch") return { ...e, result: "gain" };
  return e;
}

const GAMES = 120;
const saved = {
  fgBlocked: { ...KICK_EVENT.fgBlocked },
  xpBlocked: { ...KICK_EVENT.xpBlocked },
  puntFairCatch: { ...KICK_EVENT.puntFairCatch },
};
const zero = () => {
  for (const k of Object.keys(saved) as (keyof typeof saved)[]) KICK_EVENT[k] = { ...saved[k], events: 0 };
};
const fill = () => {
  for (const k of Object.keys(saved) as (keyof typeof saved)[]) KICK_EVENT[k] = { ...saved[k] };
};

// Rows at zero against rows filled, same seed, same games.
zero();
const off: NonNullable<ReturnType<typeof play>>[] = [];
{
  const st = newGame({ seed: 12345 });
  for (let i = 0; i < GAMES; i++) { const x = play(st, i); if (x) off.push(x); }
}
fill();
const on: NonNullable<ReturnType<typeof play>>[] = [];
{
  const st = newGame({ seed: 12345 });
  for (let i = 0; i < GAMES; i++) { const x = play(st, i); if (x) on.push(x); }
}
assert.equal(on.length, off.length);

const roster = new Map(newGame({ seed: 12345 }).players.map((p) => [p.id, p]));
let fgBlocked = 0, fgMiss = 0, xpBlocked = 0, xpMiss = 0, fair = 0, plain = 0, blockCredits = 0;
for (let n = 0; n < on.length; n++) {
  const a = off[n];
  const b = on[n];
  // Zero rows label nothing and credit nobody.
  assert.equal(a.blocks.length, 0);
  assert.ok(a.r.plays.every((e) => e.result !== "blocked" && e.result !== "fair_catch"));
  assert.ok(a.r.box.players.every((l) => l.blk === 0));

  // The parent stream, the score and every play are where they were.
  assert.equal(b.rngState, a.rngState, "the parent stream does not move");
  assert.equal(b.r.homeScore, a.r.homeScore);
  assert.equal(b.r.awayScore, a.r.awayScore);
  assert.deepEqual(b.r.plays.map(unlabelled), a.r.plays, "only labels moved");
  assert.deepEqual(b.r.box.drives, a.r.box.drives, "no drive summary moved");

  // The box is the same but for `blk`, and no row was added.
  assert.deepEqual(b.r.box.players.map((l) => ({ ...l, blk: 0 })), a.r.box.players);

  for (const e of b.r.plays) {
    if (e.kind === "fg" && e.result === "blocked") fgBlocked++;
    if (e.kind === "fg" && e.result === "miss") fgMiss++;
    if (e.kind === "xp" && e.result === "blocked") xpBlocked++;
    if (e.kind === "xp" && e.result === "miss") xpMiss++;
    if (e.kind === "punt" && e.result === "fair_catch") fair++;
    if (e.kind === "punt" && e.result === "gain") plain++;
  }

  // Every credit is a DT, EDGE or LB starter on the defending club with a snap and a box row.
  let boxBlk = 0;
  for (const l of b.r.box.players) boxBlk += l.blk;
  assert.equal(boxBlk, b.blocks.length, "the box carries every credit");
  for (const c of b.blocks) {
    blockCredits++;
    const p = roster.get(c.playerId)!;
    assert.ok(p.pos === "DT" || p.pos === "EDGE" || p.pos === "LB", `${p.pos} credited with a block`);
    const row = b.r.box.players.find((l) => l.playerId === c.playerId)!;
    assert.ok(row, "the blocker has a box row");
    assert.ok(row.snaps > 0, "the blocker took a snap");
    assert.equal(row.teamId, c.teamId);
    assert.ok(b.g.homeId === c.teamId || b.g.awayId === c.teamId);
  }
}
const blocks = fgBlocked + xpBlocked;
assert.ok(blocks > 0 && fair > 0, "the sample holds blocks and fair catches");
assert.ok(blockCredits <= blocks, "at most one credit a block");
const fgShare = fgBlocked / (fgBlocked + fgMiss);
const xpShare = xpBlocked / (xpBlocked + xpMiss);
const fairShare = fair / (fair + plain);
// Wide on purpose: about 70 kicks a row. The coins themselves are pinned above.
// The extra-point sample is a handful of blocks, so it only checks the coin
// did not revert to a double-digit share of misses.
assert.ok(fgShare > 0.03 && fgShare < 0.25, `FG block share ${fgShare}`);
assert.ok(xpShare < 0.11, `XP block share ${xpShare}`);
assert.ok(fairShare > 0.47 && fairShare < 0.63, `fair-catch share ${fairShare}`);
console.log(
  `ok    kickingEvents — ${on.length} games play the same with the rows filled: ` +
  `FG ${fgBlocked} blocked of ${fgBlocked + fgMiss} not made, XP ${xpBlocked} of ${xpBlocked + xpMiss}, ` +
  `fair catch ${fair} of ${fair + plain} unreturned (${fairShare.toFixed(3)}); ${blockCredits} block credits`,
);

// The stream is keyed by seed and game id: one id repeats, another does not.
{
  const labels = (id: number) => {
    const st = newGame({ seed: 12345 });
    const out: string[] = [];
    for (let i = 0; i < 24; i++) {
      const x = play(st, i, id + i);
      if (x) out.push(x.r.plays.filter((e) => e.kind === "punt").map((e) => e.result).join(","));
    }
    return out.join("|");
  };
  const first = labels(9000);
  assert.equal(labels(9000), first, "one game id gives one sequence");
  assert.notEqual(labels(40000), first, "another game id gives another");
  console.log("ok    kickingEvents — the labels follow (seed, game id), not the parent stream");
}

// The depth chart picks the blocker: a starter is eligible, the same man below the starters is not.
{
  const teamId = 0;
  const a = newGame({ seed: 777 });
  const b = newGame({ seed: 777 });
  const chartB = b.teams.find((t) => t.id === teamId)!.depthChart.DT;
  assert.ok(chartB.length > STARTERS.DT, "the club has a backup tackle");
  const starter = chartB[0];
  const last = chartB.length - 1;
  [chartB[0], chartB[last]] = [chartB[last], chartB[0]];
  let asStarter = 0;
  let asBackup = 0;
  for (const [stx, bump] of [[a, () => { asStarter++; }], [b, () => { asBackup++; }]] as const) {
    for (let i = 0; i < 400; i++) {
      const g = {
        id: 7000 + i, season: stx.season, week: 1, homeId: teamId, awayId: 1 + (i % 31),
        played: false, homeScore: 0, awayScore: 0, playoffRound: null, boxScore: null,
      } as unknown as Game;
      for (const p of stx.players) { p.injuryWeeks = 0; p.injuryDesc = null; }
      simulateGame(stx, g, new Rng(8000 + i), {
        onKickBlock: (_t, playerId) => { if (playerId === starter) bump(); },
      });
    }
  }
  assert.ok(asStarter > 0, "a starting tackle blocks kicks");
  assert.equal(asBackup, 0, "the same man at the bottom of the chart does not");
  console.log(`ok    kickingEvents — the depth chart picks the blocker (${asStarter} as DT1, 0 at the bottom)`);
}

// Display strings.
{
  const base = { q: 2, clock: 300, down: 4, toGo: 5, yardLine: 70, offenseId: 1, yards: 47, homeScore: 0, awayScore: 0 };
  assert.match(formatPlay({ ...base, kind: "fg", result: "blocked" } as PlayEvent, () => ""), /field goal is BLOCKED$/);
  assert.equal(formatPlay({ ...base, kind: "xp", result: "blocked", yards: 0 } as PlayEvent, () => ""), "Extra point BLOCKED");
  assert.equal(formatPlay({ ...base, kind: "punt", result: "fair_catch" } as PlayEvent, () => ""), "Punt 47 yds — fair catch");
  assert.equal(formatPlay({ ...base, kind: "punt", result: "gain" } as PlayEvent, () => ""), "Punt 47 yds");
  console.log("ok    kickingEvents — the play-by-play rows read BLOCKED and fair catch");
}
