/**
 * Kicking-game events, Stage 1. A blocked field goal or extra point is a
 * label on a kick the engine already missed. A punt fair catch is a label on
 * a punt the engine already did not return. The coins ride their own stream,
 * so no score, possession, stat or parent draw moves (nfl-reference.md §5.14).
 * The field-goal coin is the traced share of misses. The extra-point coin is
 * the traced rate per attempt, divided by that kick's miss probability.
 *
 * Stage 2, onside kicks. A trailing club in the fourth quarter attempts at
 * the §5.14 clock-by-deficit table. Recovery is 14/154. The spot is the
 * restraining line. The coins ride onsideRng, not the parent and not the
 * kick-event stream.
 *
 * Stage 2, blocked punts. 42/8587 of punts, on blockedPuntRng. The punter is
 * not charged. The ball is dead on the line. 3/42 are safeties. No return
 * and no touchdown. A miss does not move the parent.
 *
 * Run: npx tsx lib/core/sim/kickingEvents.test.ts
 */
import assert from "node:assert/strict";
import { newGame } from "../newGame";
import { Rng } from "../rng";
import {
  BLOCKED_PUNT, KICK_EVENT, ONSIDE_ATTEMPT, ONSIDE_KICK_SPOT, ONSIDE_RECOVERY, ONSIDE_RESTRAINING_YARDLINE,
  blockRateGivenMiss, blockedPuntRate, blockedPuntSafetyRate, blockedPuntSpot,
  kickEventRate, onsideRecoveryRate, simulateGame, trailingOnsideRate,
} from "./game";
import type { OnsideClockBin, OnsideDeficitBin } from "./game";
import { STARTERS } from "../types";
import type { DriveSummary, Game, GameState, PlayEvent } from "../types";
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

// The label comparison is kick events only. A blocked punt changes the play.
const savedBlock = { blocked: BLOCKED_PUNT.blocked, punts: BLOCKED_PUNT.punts, safeties: BLOCKED_PUNT.safeties };
const muteBlocks = () => { BLOCKED_PUNT.blocked = 0; BLOCKED_PUNT.safeties = 0; };
const restoreBlocks = () => {
  BLOCKED_PUNT.blocked = savedBlock.blocked;
  BLOCKED_PUNT.punts = savedBlock.punts;
  BLOCKED_PUNT.safeties = savedBlock.safeties;
};

// Rows at zero against rows filled, same seed, same games.
muteBlocks();
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
restoreBlocks();

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

// ---------------------------------------------------------------------------
// Stage 2 — onside kicks. The table is §5.14. The spot is §4.
// ---------------------------------------------------------------------------

function isOnside(e: PlayEvent): boolean {
  return e.kind === "kickoff" && (e.result === "gain" || e.result === "loss") && e.yards === 0 && e.playerId === undefined;
}

const CLOCKS: OnsideClockBin[] = ["15:00-5:01", "5:00-3:01", "3:00-2:01", "2:00-1:01", "1:00-0:00"];
const DEFS: OnsideDeficitBin[] = ["1-8", "9-16", "17+"];
const LATE: OnsideClockBin[] = ["5:00-3:01", "3:00-2:01", "2:00-1:01", "1:00-0:00"];

function cellSum(clocks: readonly OnsideClockBin[], defs: readonly OnsideDeficitBin[]) {
  let onsides = 0;
  let kickoffs = 0;
  for (const c of clocks) for (const d of defs) {
    onsides += ONSIDE_ATTEMPT[c][d].onsides;
    kickoffs += ONSIDE_ATTEMPT[c][d].kickoffs;
  }
  return { onsides, kickoffs };
}

{
  const lateOne = cellSum(LATE, ["1-8", "9-16"]);
  assert.deepEqual(lateOne, { onsides: 113, kickoffs: 202 });
  const underTwo = cellSum(["2:00-1:01", "1:00-0:00"], ["1-8"]);
  assert.deepEqual(underTwo, { onsides: 58, kickoffs: 60 });
  const twoScore = cellSum(LATE, ["9-16"]);
  assert.deepEqual(twoScore, { onsides: 46, kickoffs: 58 });
  const deep = cellSum(LATE, ["17+"]);
  assert.deepEqual(deep, { onsides: 12, kickoffs: 33 });
  assert.equal(cellSum(CLOCKS, DEFS).onsides, 141);
  assert.equal(ONSIDE_KICK_SPOT, 35);
  assert.equal(ONSIDE_RESTRAINING_YARDLINE, 45);
  assert.equal(100 - ONSIDE_RESTRAINING_YARDLINE, 55);
  assert.deepEqual(ONSIDE_RECOVERY, { recovered: 14, attempts: 154 });
  assert.equal(onsideRecoveryRate(), 14 / 154);

  assert.equal(trailingOnsideRate(4, false, 900, 4), 0);
  assert.equal(trailingOnsideRate(4, false, 301, 4), 0);
  assert.equal(trailingOnsideRate(4, false, 300, 4), 1 / 58);
  assert.equal(trailingOnsideRate(4, false, 181, 8), 1 / 58);
  assert.equal(trailingOnsideRate(4, false, 180, 8), 8 / 26);
  assert.equal(trailingOnsideRate(4, false, 121, 8), 8 / 26);
  assert.equal(trailingOnsideRate(4, false, 120, 8), 28 / 29);
  assert.equal(trailingOnsideRate(4, false, 61, 8), 28 / 29);
  assert.equal(trailingOnsideRate(4, false, 60, 8), 30 / 31);
  assert.equal(trailingOnsideRate(4, false, 0, 8), 30 / 31);
  assert.equal(trailingOnsideRate(4, false, -5, 8), 30 / 31);
  assert.equal(trailingOnsideRate(4, false, 900, 9), 6 / 89);
  assert.equal(trailingOnsideRate(4, false, 250, 9), 18 / 26);
  assert.equal(trailingOnsideRate(4, false, 250, 16), 18 / 26);
  assert.equal(trailingOnsideRate(4, false, 250, 17), 6 / 11);
  assert.equal(trailingOnsideRate(4, false, 100, 12), 1);
  assert.equal(trailingOnsideRate(4, false, 140, 10), 1);
  assert.equal(trailingOnsideRate(4, false, 250, 0), 0);
  assert.equal(trailingOnsideRate(4, false, 250, -3), 0);
  assert.equal(trailingOnsideRate(3, false, 60, 7), 0);
  assert.equal(trailingOnsideRate(1, false, 30, 7), 0);
  assert.equal(trailingOnsideRate(5, true, 60, 7), 0);
  assert.equal(trailingOnsideRate(4, true, 60, 7), 0);
  assert.equal(trailingOnsideRate(4, false, 901, 7), 0);
  console.log("ok    kickingEvents — onside table is the §5.14 cells, recovery 14/154, spot 45");
}

const savedAttempt = JSON.parse(JSON.stringify(ONSIDE_ATTEMPT)) as typeof ONSIDE_ATTEMPT;
const savedRecovery = { recovered: ONSIDE_RECOVERY.recovered, attempts: ONSIDE_RECOVERY.attempts };

function restoreOnside() {
  for (const c of CLOCKS) for (const d of DEFS) {
    ONSIDE_ATTEMPT[c][d].onsides = savedAttempt[c][d].onsides;
    ONSIDE_ATTEMPT[c][d].kickoffs = savedAttempt[c][d].kickoffs;
  }
  ONSIDE_RECOVERY.recovered = savedRecovery.recovered;
  ONSIDE_RECOVERY.attempts = savedRecovery.attempts;
}

function setAttempt(onsides: number, kickoffs: number) {
  for (const c of CLOCKS) for (const d of DEFS) {
    ONSIDE_ATTEMPT[c][d].onsides = onsides;
    ONSIDE_ATTEMPT[c][d].kickoffs = kickoffs;
  }
}

function runIsolated(n: number, idBase: number) {
  const frozen = JSON.stringify(newGame({ seed: 12345 }));
  const out: (NonNullable<ReturnType<typeof play>> | null)[] = [];
  for (let i = 0; i < n; i++) {
    const st = JSON.parse(frozen) as GameState;
    out.push(play(st, i, idBase + i));
  }
  return out;
}

const onsideCount = (rows: { r: { plays: PlayEvent[] } }[]) =>
  rows.reduce((n, x) => n + x.r.plays.filter(isOnside).length, 0);

assert.equal(onsideCount(on), onsideCount(off), "an onside coin does not share the kick-event stream");

{
  let attempts = 0;
  let recovered = 0;
  for (const x of on) {
    assert.equal(x.r.plays[0].result, "touchback", "the opening kick is the stub, not an onside");
    let kr = 0;
    for (const line of x.r.box.players) kr += line.kr;
    const krPlays = x.r.plays.filter((e) =>
      e.kind === "kickoff" && e.playerId !== undefined && (e.result === "return" || e.result === "td")).length;
    assert.equal(kr, krPlays, "an onside writes no kick-return line");
    for (let j = 0; j < x.r.plays.length; j++) {
      const e = x.r.plays[j];
      if (e.kind === "kickoff" && e.q !== 4) assert.ok(!isOnside(e), "no onside before the fourth quarter");
      if (!isOnside(e)) continue;
      attempts++;
      assert.equal(e.q, 4);
      assert.ok(e.kickerId !== undefined, "the kickoff names the kicker");
      const kicker = roster.get(e.kickerId!)!;
      assert.equal(kicker.pos, "K");
      const kickHome = kicker.teamId === x.g.homeId;
      const kickPts = kickHome ? e.homeScore : e.awayScore;
      const recvPts = kickHome ? e.awayScore : e.homeScore;
      const deficit = recvPts - kickPts;
      assert.ok(deficit >= 1, "the kicking club is trailing");
      assert.ok(trailingOnsideRate(4, false, e.clock, deficit) > 0, "the logged clock is a cell that attempts");
      if (e.result === "gain") {
        recovered++;
        assert.equal(e.yardLine, ONSIDE_RESTRAINING_YARDLINE);
        assert.equal(e.offenseId, kicker.teamId, "a recovery belongs to the kicking club");
      } else {
        assert.equal(e.result, "loss");
        assert.equal(e.yardLine, 100 - ONSIDE_RESTRAINING_YARDLINE);
        assert.notEqual(e.offenseId, kicker.teamId, "a failed onside belongs to the receiving club");
      }
      const prev: PlayEvent | undefined = x.r.plays[j - 1];
      assert.ok(prev);
      assert.equal(prev.homeScore, e.homeScore);
      assert.equal(prev.awayScore, e.awayScore, "an onside does not score");
      const next: PlayEvent | undefined = x.r.plays[j + 1];
      if (next) {
        assert.equal(next.offenseId, e.offenseId, "the next play is the club that came up with the ball");
        assert.equal(next.yardLine, e.yardLine);
      }
      const drive = (x.r.box.drives ?? []).find((d) => d.from === j);
      assert.ok(drive, "the onside opens a drive");
      assert.equal(drive!.offenseId, e.offenseId);
      assert.equal(drive!.startYl, e.yardLine);
      assert.ok(!x.r.box.scoringPlays.some((s) => /onside/i.test(s.desc)));
    }
  }
  assert.ok(attempts > 0, "the sample attempts an onside");
  console.log(
    `ok    kickingEvents — ${attempts} onsides in the label sample, ${recovered} recovered, ` +
    `no return, no score, spot on the restraining line`,
  );
}

try {
  const N = 80;
  const quiet = runIsolated(N, 11000);
  setAttempt(0, 1);
  const zeroed = runIsolated(N, 11000);
  restoreOnside();
  let tried = 0;
  let held = 0;
  for (let i = 0; i < quiet.length; i++) {
    const a = quiet[i];
    const b = zeroed[i];
    assert.equal(a === null, b === null);
    if (!a || !b) continue;
    assert.equal(b.r.plays.filter(isOnside).length, 0, "a zero table attempts nothing");
    if (a.r.plays.some(isOnside)) {
      tried++;
      continue;
    }
    held++;
    assert.equal(a.rngState, b.rngState, "a kickoff that is not an onside does not move the parent");
    assert.equal(a.r.homeScore, b.r.homeScore);
    assert.equal(a.r.awayScore, b.r.awayScore);
  }
  assert.ok(tried > 0, "the isolated sample attempts an onside");
  assert.ok(held > 0, "the isolated sample has games with no onside");

  setAttempt(1, 1_000_000_000);
  const rare = runIsolated(N, 11000);
  let leaks = 0;
  let rareOnsides = 0;
  for (let i = 0; i < rare.length; i++) {
    const a = rare[i];
    const b = zeroed[i];
    if (!a || !b) continue;
    rareOnsides += a.r.plays.filter(isOnside).length;
    if (a.r.plays.some(isOnside)) continue;
    if (a.rngState !== b.rngState) leaks++;
  }
  assert.equal(rareOnsides, 0, "a one-in-a-billion cell does not attempt");
  assert.equal(leaks, 0, "a declined onside draws on the side stream, not the parent");

  setAttempt(1, 1);
  ONSIDE_RECOVERY.recovered = ONSIDE_RECOVERY.attempts;
  const kept = runIsolated(40, 21000);
  ONSIDE_RECOVERY.recovered = 0;
  const lost = runIsolated(40, 21000);
  let keeps = 0;
  let losses = 0;
  for (const x of kept) {
    if (!x) continue;
    for (const e of x.r.plays) {
      if (!isOnside(e)) continue;
      keeps++;
      assert.equal(e.result, "gain");
      assert.equal(e.yardLine, 45);
      assert.equal(e.offenseId, roster.get(e.kickerId!)!.teamId);
    }
  }
  for (const x of lost) {
    if (!x) continue;
    for (const e of x.r.plays) {
      if (!isOnside(e)) continue;
      losses++;
      assert.equal(e.result, "loss");
      assert.equal(e.yardLine, 55);
      assert.notEqual(e.offenseId, roster.get(e.kickerId!)!.teamId);
    }
  }
  assert.ok(keeps > 0, "a forced recovery gives the ball to the kicking club at its 45");
  assert.ok(losses > 0, "a forced failure gives the ball to the receiving club at its 55");

  const sequence = (id: number) => {
    const rows = runIsolated(24, id);
    return rows.map((x) => x ? x.r.plays.filter(isOnside).map((e) => e.result).join(",") : "").join("|");
  };
  ONSIDE_RECOVERY.recovered = 1;
  ONSIDE_RECOVERY.attempts = 2;
  const first = sequence(30000);
  assert.equal(sequence(30000), first, "one game id gives one onside sequence");
  assert.notEqual(sequence(80000), first, "another game id gives another onside sequence");
  assert.ok(first.includes("gain") || first.includes("loss"), "the key sample attempts");
  console.log(
    `ok    kickingEvents — onside stream is not the parent ` +
    `(${tried} games attempted, ${held} did not; forced ${keeps} recoveries and ${losses} failures)`,
  );
} finally {
  restoreOnside();
}

// ---------------------------------------------------------------------------
// Stage 2 — blocked punts. The rate is §5.14. The charge and the spot are §4.
// ---------------------------------------------------------------------------

assert.equal(BLOCKED_PUNT.blocked, 42);
assert.equal(BLOCKED_PUNT.punts, 8587);
assert.equal(BLOCKED_PUNT.safeties, 3);
assert.equal(blockedPuntRate(), 42 / 8587);
assert.equal(blockedPuntSafetyRate(), 3 / 42);
assert.equal(blockedPuntSpot(30), 70);
assert.equal(blockedPuntSpot(1), 99);
assert.equal(blockedPuntSpot(99), 1);
console.log("ok    kickingEvents — blocked punt is 42/8587, safety 3/42, dead on the line");

function otherTeam(g: Game, id: number): number {
  return id === g.homeId ? g.awayId : g.homeId;
}

function pointsFromBox(x: NonNullable<ReturnType<typeof play>>, teamId: number): number {
  let n = 0;
  for (const p of x.r.box.players) {
    if (p.teamId !== teamId) continue;
    n += (p.passTd + p.rushTd + p.defTd + p.krTd + p.prTd) * 6;
    n += p.xpm + p.twoPtMade * 2 + p.fgm * 3 + p.safeties * 2;
  }
  return n;
}

function isBlockedPunt(e: PlayEvent): boolean {
  return e.kind === "punt" && e.result === "blocked";
}

function driveCovering(rows: DriveSummary[] | undefined, index: number): DriveSummary | undefined {
  for (const row of rows ?? []) {
    if (index >= row.from && index < row.to) return row;
  }
  return undefined;
}

const fgEvents = KICK_EVENT.fgBlocked.events;
const xpEvents = KICK_EVENT.xpBlocked.events;
try {
  BLOCKED_PUNT.blocked = 0;
  BLOCKED_PUNT.safeties = 0;
  const quiet = runIsolated(48, 51000);
  BLOCKED_PUNT.blocked = 1;
  BLOCKED_PUNT.punts = 1_000_000_000;
  const rare = runIsolated(48, 51000);
  let rareBlocks = 0;
  for (let i = 0; i < quiet.length; i++) {
    const a = quiet[i];
    const b = rare[i];
    assert.equal(a === null, b === null);
    if (!a || !b) continue;
    rareBlocks += b.r.plays.filter(isBlockedPunt).length;
    assert.equal(b.rngState, a.rngState, "a declined block draws on the side stream, not the parent");
    assert.deepEqual(b.r.plays, a.r.plays, "a declined block does not change the game");
  }
  assert.equal(rareBlocks, 0, "a one-in-a-billion row does not block");

  restoreBlocks();
  const live = runIsolated(48, 51000);
  let held = 0;
  for (let i = 0; i < quiet.length; i++) {
    const a = quiet[i];
    const b = live[i];
    if (!a || !b) continue;
    if (b.r.plays.some(isBlockedPunt)) continue;
    held++;
    assert.equal(b.rngState, a.rngState, "no block, so the parent stays");
    assert.deepEqual(b.r.plays, a.r.plays, "no block, so the plays stay");
  }
  assert.ok(held > 0, "the live sample has a game with no blocked punt");

  // Every punt is blocked. None is a safety. Kick-event blocks are off, so
  // `blk` is the punt blocks only.
  BLOCKED_PUNT.blocked = savedBlock.punts;
  BLOCKED_PUNT.punts = savedBlock.punts;
  BLOCKED_PUNT.safeties = 0;
  KICK_EVENT.fgBlocked.events = 0;
  KICK_EVENT.xpBlocked.events = 0;
  const dead = runIsolated(16, 61000);
  let deadPunts = 0;
  for (const x of dead) {
    if (!x) continue;
    assert.equal(pointsFromBox(x, x.g.homeId), x.r.homeScore, "the box is the home score");
    assert.equal(pointsFromBox(x, x.g.awayId), x.r.awayScore, "the box is the away score");
    let punts = 0, puntYds = 0, pr = 0, prTd = 0, blk = 0, safeties = 0;
    for (const line of x.r.box.players) {
      punts += line.punts;
      puntYds += line.puntYds;
      pr += line.pr;
      prTd += line.prTd;
      blk += line.blk;
      safeties += line.safeties;
    }
    const plays = x.r.plays;
    const blocked = plays.filter(isBlockedPunt);
    assert.ok(blocked.length > 0, "a forced block produces a punt");
    deadPunts += blocked.length;
    assert.equal(plays.filter((e) => e.kind === "punt").length, blocked.length, "every punt is blocked");
    assert.equal(punts, 0, "the punter is not charged with the punt");
    assert.equal(puntYds, 0, "no yardage is credited");
    assert.equal(pr, 0, "a block is not a punt return");
    assert.equal(prTd, 0, "no return touchdown");
    assert.equal(safeties, 0, "a zero safety row is not a safety");
    assert.equal(blk, blocked.length, "one blk credit a blocked punt");
    const turnPlays = plays.filter((e) => e.result === "int" || e.result === "fumble").length;
    assert.equal(x.r.box.home.turnovers + x.r.box.away.turnovers, turnPlays, "a block is not a turnover");
    for (const c of x.blocks) {
      const p = roster.get(c.playerId)!;
      assert.ok(p.pos === "DT" || p.pos === "EDGE" || p.pos === "LB", `${p.pos} credited on a blocked punt`);
    }
    for (let j = 0; j < plays.length; j++) {
      const e = plays[j];
      if (!isBlockedPunt(e)) continue;
      const prev = plays[j - 1];
      if (prev && prev.q === e.q) assert.equal(e.clock, prev.clock, "a blocked punt takes no clock");
      assert.equal(e.yards, 0);
      const recv = otherTeam(x.g, e.offenseId);
      const nxt = plays[j + 1];
      assert.ok(nxt, "the receiving club takes the ball");
      assert.notEqual(nxt.kind, "safety");
      assert.equal(nxt.offenseId, recv, "the defence takes the ball");
      assert.equal(nxt.yardLine, blockedPuntSpot(e.yardLine), "dead on the line of scrimmage");
      assert.equal(nxt.down, 1);
      if (prev) {
        assert.equal(e.homeScore, prev.homeScore);
        assert.equal(e.awayScore, prev.awayScore, "a non-safety block does not score");
      }
      assert.equal(driveCovering(x.r.box.drives, j)?.result, "punt");
    }
  }
  assert.ok(deadPunts > 0);

  BLOCKED_PUNT.safeties = BLOCKED_PUNT.blocked;
  const safes = runIsolated(12, 71000);
  let safePunts = 0;
  for (const x of safes) {
    if (!x) continue;
    assert.equal(pointsFromBox(x, x.g.homeId), x.r.homeScore);
    assert.equal(pointsFromBox(x, x.g.awayId), x.r.awayScore);
    let safeties = 0, prTd = 0;
    for (const line of x.r.box.players) {
      safeties += line.safeties;
      prTd += line.prTd;
    }
    const plays = x.r.plays;
    const blocked = plays.filter(isBlockedPunt);
    const safetyPlays = plays.filter((e) => e.kind === "safety");
    assert.equal(safetyPlays.length, blocked.length, "every forced block is a safety");
    assert.equal(safeties, blocked.length, "the safety is on a player's line");
    safePunts += blocked.length;
    assert.equal(prTd, 0);
    assert.equal(plays.filter((e) => e.kind === "punt" && e.result === "td").length, 0);
    for (let j = 0; j < plays.length; j++) {
      const e = plays[j];
      if (!isBlockedPunt(e)) continue;
      const nxt = plays[j + 1];
      assert.ok(nxt && nxt.kind === "safety");
      assert.equal(nxt.offenseId, e.offenseId, "the safety is the kicking club's ball, dead");
      const recv = otherTeam(x.g, e.offenseId);
      const recvBefore: number = recv === x.g.homeId ? e.homeScore : e.awayScore;
      const recvAfter: number = recv === x.g.homeId ? nxt.homeScore : nxt.awayScore;
      assert.equal(recvAfter, recvBefore + 2, "the safety is two points");
      const after = plays[j + 2];
      if (after && after.kind !== "kickoff") {
        assert.equal(after.offenseId, recv, "the club that scored takes over");
        assert.equal(after.yardLine, 45);
        assert.equal(after.down, 1);
      }
      assert.equal(driveCovering(x.r.box.drives, j)?.result, "punt");
      assert.equal(driveCovering(x.r.box.drives, j + 1)?.result, "safety");
    }
  }
  assert.ok(safePunts > 0, "the safety sample blocks a punt");

  const signature = (id: number) => {
    const rows = runIsolated(8, id);
    return rows.map((x) => x
      ? x.r.plays.filter((e) => e.kind === "punt" || e.kind === "safety").map((e) => e.kind === "safety" ? "S" : "B").join("")
      : "").join("|");
  };
  BLOCKED_PUNT.blocked = savedBlock.punts;
  BLOCKED_PUNT.punts = savedBlock.punts;
  BLOCKED_PUNT.safeties = Math.floor(savedBlock.punts / 2);
  const same = signature(81000);
  assert.equal(signature(81000), same, "one game id gives one blocked-punt sequence");
  assert.notEqual(signature(91000), same, "another game id gives another sequence");
  assert.ok(same.includes("B") && same.includes("S"), "the key sample has both endings");
  console.log(
    `ok    kickingEvents — blocked punts stay off the parent ` +
    `(${held} games had none; ${deadPunts} dead-ball blocks, ${safePunts} safeties)`,
  );
} finally {
  restoreBlocks();
  KICK_EVENT.fgBlocked.events = fgEvents;
  KICK_EVENT.xpBlocked.events = xpEvents;
}
