/**
 * Special-teams tackles. A live, non-scoring kick or punt return credits one
 * coverage man on the kicking club at the traced own-tackle rate
 * (nfl-reference.md §5.14). The credit rides its own stream and lands on the
 * depth-chart backups at LB, S and CB.
 *
 * Run: npx tsx lib/core/sim/coverageTackle.test.ts
 */
import assert from "node:assert/strict";
import { newGame } from "../newGame";
import { Rng } from "../rng";
import {
  COVERAGE_TACKLE_CREDIT,
  coverageCreditRate,
  creditsCoverage,
  simulateGame,
} from "./game";
import { STARTERS } from "../types";
import type { Game, GameState } from "../types";

// The §5.14 counts, exactly.
assert.deepEqual(COVERAGE_TACKLE_CREDIT.kickoff, { credited: 2740, plays: 3585 });
assert.deepEqual(COVERAGE_TACKLE_CREDIT.punt, { credited: 2935, plays: 3656 });
assert.equal(coverageCreditRate("kickoff"), 2740 / 3585);
assert.equal(coverageCreditRate("punt"), 2935 / 3656);

// A return touchdown credits nobody, whatever the roll.
for (const kind of ["kickoff", "punt"] as const) {
  assert.equal(creditsCoverage(true, kind, 0), false);
  assert.equal(creditsCoverage(false, kind, 0), true);
  assert.equal(creditsCoverage(false, kind, coverageCreditRate(kind)), false);
  assert.equal(creditsCoverage(false, kind, 0.9999), false);
}
console.log("ok    coverageTackle — the §5.14 rows; a return touchdown credits nobody");

type Credit = { teamId: number; playerId: number; kind: "kickoff" | "punt" };

function play(st: GameState, i: number) {
  const g = {
    id: 9000 + i, season: st.season, week: 1, homeId: i % 32, awayId: (i * 7 + 3) % 32,
    played: false, homeScore: 0, awayScore: 0, playoffRound: null, boxScore: null,
  } as unknown as Game;
  if (g.homeId === g.awayId) return null;
  for (const p of st.players) { p.injuryWeeks = 0; p.injuryDesc = null; }
  const credits: Credit[] = [];
  const r = simulateGame(st, g, new Rng(5000 + i), {
    onCoverageTackle: (teamId, playerId, kind) => credits.push({ teamId, playerId, kind }),
  });
  return { g, r, credits };
}

function teamTackles(r: ReturnType<typeof simulateGame>, teamId: number) {
  let n = 0;
  for (const l of r.box.players) if (l.teamId === teamId) n += l.tackles;
  return n;
}

const GAMES = 96;
const saved = {
  kickoff: { ...COVERAGE_TACKLE_CREDIT.kickoff },
  punt: { ...COVERAGE_TACKLE_CREDIT.punt },
};

// Rows at zero: nothing is drawn and nobody is credited. That run is the
// engine without coverage tackles, and the reference for what follows.
const st = newGame({ seed: 12345 });
COVERAGE_TACKLE_CREDIT.kickoff.credited = 0;
COVERAGE_TACKLE_CREDIT.punt.credited = 0;
const off: ReturnType<typeof play>[] = [];
for (let i = 0; i < GAMES; i++) {
  const x = play(st, i);
  off.push(x);
  if (x) assert.equal(x.credits.length, 0, "a zero row credits nobody");
}
Object.assign(COVERAGE_TACKLE_CREDIT.kickoff, saved.kickoff);
Object.assign(COVERAGE_TACKLE_CREDIT.punt, saved.punt);
console.log("ok    coverageTackle — zero rows credit nobody");

let credited = 0;
let returns = 0;
let samePlays = 0;
let played = 0;
let fromBackups = 0;
const byPos = new Map<string, number>();
for (let i = 0; i < GAMES; i++) {
  const on = play(st, i);
  const base = off[i];
  if (!on || !base) continue;
  played++;
  const { g, r, credits } = on;

  // No more credits than live, non-scoring returns the club covered.
  for (const teamId of [g.homeId, g.awayId]) {
    for (const kind of ["kickoff", "punt"] as const) {
      const covered = r.plays.filter((e) =>
        e.kind === kind && e.result === "return" && e.playerId !== undefined &&
        // A kickoff row carries the receiving club. A punt row carries the punting club.
        (kind === "kickoff" ? e.offenseId !== teamId : e.offenseId === teamId)).length;
      const got = credits.filter((c) => c.teamId === teamId && c.kind === kind).length;
      assert.ok(got <= covered, `${kind} credits ${got} over ${covered} returns`);
      returns += covered;
      credited += got;
    }
  }

  // The stop goes to a linebacker, safety or corner on the kicking club, and
  // to a depth-chart backup when one is dressed.
  for (const c of credits) {
    const p = st.players.find((x) => x.id === c.playerId)!;
    assert.equal(p.teamId, c.teamId, "the tackler plays for the kicking club");
    byPos.set(p.pos, (byPos.get(p.pos) ?? 0) + 1);
    const chart = st.teams.find((t) => t.id === c.teamId)!.depthChart;
    const slot = (chart[p.pos] ?? []).indexOf(p.id);
    if ((p.pos === "LB" || p.pos === "S" || p.pos === "CB") && slot >= STARTERS[p.pos]) fromBackups++;
  }

  // The coverage coin is not a draw on the play stream. When the snaps are
  // the same snaps, the only new tackles are the coverage credits.
  const same = JSON.stringify(r.plays) === JSON.stringify(base.r.plays);
  if (same) {
    samePlays++;
    assert.equal(r.homeScore, base.r.homeScore);
    assert.equal(r.awayScore, base.r.awayScore);
    for (const teamId of [g.homeId, g.awayId]) {
      const cover = credits.filter((c) => c.teamId === teamId).length;
      const scrimmage = teamTackles(base.r, teamId);
      assert.equal(teamTackles(r, teamId), scrimmage + cover, "team tackles are scrimmage credits plus coverage credits");
    }
  }
}

assert.ok(credited > 0 && returns > 0, "the sample has coverage tackles");
const share = credited / returns;
assert.ok(share > 0.70 && share < 0.86, `credit share ${share.toFixed(3)} is near the traced 0.76–0.80`);
assert.ok(fromBackups / credited > 0.9, `depth-chart backups make the stops (${fromBackups} of ${credited})`);
assert.ok(samePlays / played > 0.5, `most games keep their snaps (${samePlays} of ${played})`);
console.log(
  `ok    coverageTackle — ${credited} credits on ${returns} returns (${share.toFixed(3)}); ` +
  `${fromBackups} from depth-chart backups; ${samePlays} of ${played} games keep every snap; ` +
  [...byPos].map(([k, v]) => `${k} ${v}`).join(", "),
);

// The depth chart decides who covers. Move a starting linebacker to the third
// slot and he makes coverage stops. In the first slot he made none.
{
  const a = newGame({ seed: 777 });
  const b = newGame({ seed: 777 });
  const teamId = 0;
  const chartB = b.teams.find((t) => t.id === teamId)!.depthChart.LB;
  assert.ok(chartB.length >= 3, "the club has a third linebacker");
  const starter = chartB[0];
  [chartB[0], chartB[2]] = [chartB[2], chartB[0]];
  let asStarter = 0;
  let asBackup = 0;
  for (const [stx, bump] of [[a, () => { asStarter++; }], [b, () => { asBackup++; }]] as const) {
    for (let i = 0; i < 40; i++) {
      const g = {
        id: 7000 + i, season: stx.season, week: 1, homeId: teamId, awayId: 1 + (i % 31),
        played: false, homeScore: 0, awayScore: 0, playoffRound: null, boxScore: null,
      } as unknown as Game;
      for (const p of stx.players) { p.injuryWeeks = 0; p.injuryDesc = null; }
      simulateGame(stx, g, new Rng(8000 + i), {
        onCoverageTackle: (_t, playerId) => { if (playerId === starter) bump(); },
      });
    }
  }
  assert.equal(asStarter, 0, "a starting linebacker with backups dressed covers no kicks");
  assert.ok(asBackup > 0, "the same man in the third slot does");
  console.log(`ok    coverageTackle — the depth chart picks the coverage unit (0 as LB1, ${asBackup} as LB3)`);
}
