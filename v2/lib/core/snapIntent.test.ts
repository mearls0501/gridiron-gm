/**
 * /play snap intents. Each one resolves to run, pass, or auto.
 * The play loop is not involved. A resolved call replayed through
 * the live game is the same snap the engine already had.
 *
 * Run: npx tsx lib/core/snapIntent.test.ts
 */
import assert from "node:assert/strict";
import { SnapInfo } from "./callSheet";
import { createLiveGame, resumeLiveGame } from "./liveGame";
import { setCallSheet } from "./callSheet";
import { newGame } from "./newGame";
import { advance, startRegularSeason } from "./season/engine";
import {
  SNAP_INTENT_CHOICES,
  SnapIntent,
  offenseMargin,
  resolveSnapIntent,
  snapSendWord,
} from "./snapIntent";

const INTENTS: SnapIntent[] = ["schedule", "ground", "air", "score"];

function info(over: Partial<SnapInfo> = {}): SnapInfo {
  return {
    down: 1,
    toGo: 10,
    yardLine: 25,
    quarter: 1,
    clock: 900,
    homeScore: 0,
    awayScore: 0,
    offenseIsHome: true,
    ...over,
  };
}

function call(intent: SnapIntent, over: Partial<SnapInfo> = {}) {
  return resolveSnapIntent(intent, info(over));
}

{
  assert.deepEqual(
    SNAP_INTENT_CHOICES.map((c) => c.id),
    INTENTS,
  );
  assert.deepEqual(
    SNAP_INTENT_CHOICES.map((c) => c.label),
    ["Stay on schedule", "Lean on the ground", "Open it up", "Play the score"],
  );
  assert.deepEqual(
    SNAP_INTENT_CHOICES.map((c) => c.rule),
    [
      "Third or fourth and five or more is a pass. Third or fourth and two or fewer is a run. Second and eight or more is a pass. Two yards or fewer, or inside the two, is a run. Every other down is the coach.",
      "Third or fourth and seven or more is a pass. Every other down is a run.",
      "Two yards or fewer, or inside the three, is a run. Every other down is a pass.",
      "A lead of nine or more from the fourth quarter on, or fifteen or more in the third, is a run. Any lead with under five minutes left from the fourth on is a run. A deficit of nine or more from the fourth on, or any deficit with under five minutes left then, is a pass. Every other spot is the coach.",
    ],
  );
}

// Opening snap: the four policies are not two buttons.
{
  const spot = info();
  assert.equal(call("schedule").call, "auto");
  assert.equal(call("schedule").because, "A manageable down stays with the coach.");
  assert.equal(call("ground").call, "run");
  assert.equal(call("ground").because, "On the ground.");
  assert.equal(call("air").call, "pass");
  assert.equal(call("air").because, "In the air.");
  assert.equal(call("score").call, "auto");
  assert.equal(call("score").because, "The score stays with the coach.");
  assert.equal(offenseMargin(spot), 0);
}

// Down and distance moves schedule and the ground/air pair apart.
{
  assert.equal(call("schedule", { down: 3, toGo: 8 }).call, "pass");
  assert.equal(call("schedule", { down: 3, toGo: 8 }).because, "Third or fourth and five or more.");
  assert.equal(call("ground", { down: 3, toGo: 8 }).call, "pass");
  assert.equal(call("air", { down: 3, toGo: 8 }).call, "pass");
  assert.equal(call("score", { down: 3, toGo: 8 }).call, "auto");

  assert.equal(call("schedule", { down: 3, toGo: 6 }).call, "pass");
  assert.equal(call("ground", { down: 3, toGo: 6 }).call, "run");
  assert.equal(call("ground", { down: 3, toGo: 6 }).because, "On the ground.");

  assert.equal(call("schedule", { down: 3, toGo: 1 }).call, "run");
  assert.equal(call("schedule", { down: 3, toGo: 1 }).because, "Third or fourth and two or fewer.");
  assert.equal(call("air", { down: 3, toGo: 1 }).call, "run");
  assert.equal(call("air", { down: 3, toGo: 1 }).because, "Two yards or fewer.");

  assert.equal(call("schedule", { down: 2, toGo: 9 }).call, "pass");
  assert.equal(call("schedule", { down: 2, toGo: 9 }).because, "Second and eight or more.");
  assert.equal(call("ground", { down: 2, toGo: 9 }).call, "run");
  assert.equal(call("schedule", { down: 2, toGo: 7 }).call, "auto");

  assert.equal(call("schedule", { down: 1, toGo: 2 }).call, "run");
  assert.equal(call("schedule", { down: 1, toGo: 2 }).because, "Two yards or fewer.");
  assert.equal(call("schedule", { down: 4, toGo: 2 }).call, "run");
  assert.equal(call("schedule", { down: 4, toGo: 6 }).call, "pass");
  assert.equal(call("ground", { down: 4, toGo: 7 }).call, "pass");
  assert.equal(call("ground", { down: 4, toGo: 7 }).because, "Third or fourth and seven or more.");
}

// Goal line. toGo can still be longer than the field when the spot is inside the three.
{
  assert.equal(call("air", { down: 1, toGo: 3, yardLine: 97 }).call, "run");
  assert.equal(call("air", { down: 1, toGo: 3, yardLine: 97 }).because, "Inside the three.");
  assert.equal(call("schedule", { down: 1, toGo: 3, yardLine: 97 }).call, "auto");
  assert.equal(call("schedule", { down: 1, toGo: 10, yardLine: 99 }).call, "run");
  assert.equal(call("schedule", { down: 1, toGo: 10, yardLine: 99 }).because, "Inside the two.");
  assert.equal(call("ground", { down: 1, toGo: 3, yardLine: 97 }).call, "run");
}

// The score ignores the down. A late lead runs on third and long.
{
  const upBig = { down: 3, toGo: 12, quarter: 4, clock: 700, homeScore: 24, awayScore: 10 };
  assert.equal(call("score", upBig).call, "run");
  assert.equal(call("score", upBig).because, "Up nine or more from the fourth on.");
  assert.equal(call("schedule", upBig).call, "pass");
  assert.equal(call("ground", upBig).call, "pass");
  assert.equal(call("air", upBig).call, "pass");

  const upFifteenQ3 = { quarter: 3, clock: 800, homeScore: 21, awayScore: 6 };
  assert.equal(call("score", upFifteenQ3).call, "run");
  assert.equal(call("score", upFifteenQ3).because, "Up fifteen or more in the third.");
  assert.equal(call("score", { quarter: 3, homeScore: 17, awayScore: 7 }).call, "auto");

  const leadLate = { quarter: 4, clock: 200, homeScore: 10, awayScore: 7 };
  assert.equal(call("score", leadLate).call, "run");
  assert.equal(call("score", leadLate).because, "Leading, under five minutes.");
  assert.equal(call("score", { quarter: 4, clock: 400, homeScore: 10, awayScore: 7 }).call, "auto");

  const downBig = { quarter: 4, clock: 700, homeScore: 7, awayScore: 20 };
  assert.equal(call("score", downBig).call, "pass");
  assert.equal(call("score", downBig).because, "Down nine or more from the fourth on.");
  assert.equal(call("ground", downBig).call, "run");

  const trailLate = { quarter: 4, clock: 180, homeScore: 14, awayScore: 17 };
  assert.equal(call("score", trailLate).call, "pass");
  assert.equal(call("score", trailLate).because, "Trailing, under five minutes.");
  assert.equal(call("score", { quarter: 2, clock: 120, homeScore: 0, awayScore: 21 }).call, "auto");

  const ot = { quarter: 5, clock: 200, homeScore: 20, awayScore: 23, offenseIsHome: true };
  assert.equal(call("score", ot).call, "pass");
  assert.equal(call("score", { ...ot, clock: 500 }).call, "auto");
}

// Margin is the offense's, including when the user is the away club.
{
  const awayUp = info({
    offenseIsHome: false,
    homeScore: 3,
    awayScore: 13,
    quarter: 4,
    clock: 800,
  });
  assert.equal(offenseMargin(awayUp), 10);
  assert.equal(resolveSnapIntent("score", awayUp).call, "run");
  const awayDown = info({
    offenseIsHome: false,
    homeScore: 21,
    awayScore: 10,
    quarter: 4,
  });
  assert.equal(offenseMargin(awayDown), -11);
  assert.equal(resolveSnapIntent("score", awayDown).call, "pass");
}

// The grid stays inside run / pass / auto. Schedule and the score can
// hand a snap to the coach. Ground and air always pick a side, and
// they do not pick the same side as each other or as a constant button.
{
  const downs = [1, 2, 3, 4];
  const distances = [1, 2, 3, 6, 7, 8, 10, 15];
  const quarters = [1, 2, 3, 4, 5];
  const margins = [-14, -9, -3, 0, 3, 9, 15];
  const clocks = [120, 400, 800];
  const spots = [1, 3, 25, 80, 98];
  const seen: Record<SnapIntent, Set<string>> = {
    schedule: new Set(),
    ground: new Set(),
    air: new Set(),
    score: new Set(),
  };
  const sig: Record<SnapIntent, string[]> = {
    schedule: [],
    ground: [],
    air: [],
    score: [],
  };
  for (const down of downs) {
    for (const toGo of distances) {
      for (const quarter of quarters) {
        for (const margin of margins) {
          for (const clock of clocks) {
            for (const yardLine of spots) {
              const spot = info({
                down,
                toGo,
                quarter,
                clock,
                yardLine,
                homeScore: margin > 0 ? margin : 0,
                awayScore: margin < 0 ? -margin : 0,
              });
              for (const intent of INTENTS) {
                const resolved = resolveSnapIntent(intent, spot);
                assert.ok(
                  resolved.call === "run" || resolved.call === "pass" || resolved.call === "auto",
                  resolved.call,
                );
                assert.ok(resolved.because.length > 0);
                seen[intent].add(resolved.call);
                sig[intent].push(resolved.call);
              }
            }
          }
        }
      }
    }
  }
  assert.deepEqual([...seen.schedule].sort(), ["auto", "pass", "run"]);
  assert.deepEqual([...seen.score].sort(), ["auto", "pass", "run"]);
  assert.deepEqual([...seen.ground].sort(), ["pass", "run"]);
  assert.deepEqual([...seen.air].sort(), ["pass", "run"]);
  for (let i = 0; i < INTENTS.length; i++) {
    for (let j = i + 1; j < INTENTS.length; j++) {
      assert.notEqual(sig[INTENTS[i]].join(""), sig[INTENTS[j]].join(""), `${INTENTS[i]} vs ${INTENTS[j]}`);
    }
  }
}

assert.equal(snapSendWord("run"), "Run");
assert.equal(snapSendWord("pass"), "Pass");
assert.equal(snapSendWord("auto"), "Coach");

// A drive of intents stores ordinary snaps. Reload replays those snaps.
{
  const st = newGame({ seed: 90 });
  startRegularSeason(st);
  let guard = 0;
  const userGame = () =>
    st.games.find(
      (g) =>
        g.season === st.season &&
        g.week === st.week &&
        !g.played &&
        (g.homeId === st.userTeamId || g.awayId === st.userTeamId),
    );
  while (!userGame() && guard++ < 18) advance(st);
  const g = userGame();
  assert.ok(g, "user has a game");
  const live = createLiveGame(st, g.id);
  const plan: SnapIntent[] = ["schedule", "ground", "air", "score", "ground", "air"];
  const calls: Array<"run" | "pass" | "auto"> = [];
  let view = live.peek();
  for (const intent of plan) {
    if (view.done) break;
    const resolved = resolveSnapIntent(intent, view.info);
    calls.push(resolved.call);
    view = live.call(resolved.call);
  }
  assert.ok(calls.length >= 4, "the drive took several snaps");
  assert.ok(calls.some((c) => c === "run"));
  assert.ok(calls.some((c) => c === "pass"));
  assert.ok(calls.some((c) => c === "auto"));
  setCallSheet(st, { snaps: calls });
  const resumed = resumeLiveGame(st, g.id).peek();
  assert.deepEqual(resumed.calls, calls);
  assert.equal(resumed.done, view.done);
  if (!view.done && !resumed.done) {
    assert.deepEqual(resumed.plays, view.plays);
    assert.deepEqual(resumed.info, view.info);
  } else if (view.done && resumed.done) {
    assert.deepEqual(resumed.plays, view.plays);
    assert.equal(resumed.result.homeScore, view.result.homeScore);
    assert.equal(resumed.result.awayScore, view.result.awayScore);
  } else {
    assert.fail("reload did not land on the same snap");
  }
}

console.log("ok    snapIntent — four policies, three paths");
