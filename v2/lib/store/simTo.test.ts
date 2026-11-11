/**
 * Hub simTo scheduling. Yielding between steps must not move the save.
 * The one early stop is the user's QB1 out 8 or more weeks, on by default.
 * A trade call or any other injury does not end the click. Turning the
 * stop off and finishing the run matches a league that never stopped.
 *
 * Run: npx tsx lib/store/simTo.test.ts
 */
import assert from "node:assert/strict";
import { newGame } from "../core/newGame";
import { advance } from "../core/season/engine";
import { defaultSettings, type GameState } from "../core/types";
import { formatSimPauseToast } from "./simToast";
import {
  pauseOnStartingQb,
  runSimTo,
  simToStepper,
  startingQbShouldPause,
  STARTING_QB_PAUSE_WEEKS,
  type SimTarget,
} from "./simTo";

function strip(s: GameState): string {
  const copy = { ...s } as Record<string, unknown>;
  delete copy.createdAt;
  delete copy.updatedAt;
  return JSON.stringify(copy);
}

/** The stop is a setting. Weeks that did run must match a run that did not stop. */
function league(s: GameState): string {
  const copy = { ...s } as Record<string, unknown>;
  delete copy.createdAt;
  delete copy.updatedAt;
  delete copy.settings;
  return JSON.stringify(copy);
}

function kickoff(seed: number, stop = true): GameState {
  const st = newGame({ seed });
  st.settings = defaultSettings();
  st.settings.pauseOnStartingQb = stop;
  advance(st);
  return st;
}

function clone(s: GameState): GameState {
  return JSON.parse(JSON.stringify(s)) as GameState;
}

function startingQb(s: GameState) {
  const id = s.teams[s.userTeamId].depthChart.QB?.[0];
  const p = s.players.find((x) => x.id === id);
  assert.ok(p && p.pos === "QB" && p.teamId === s.userTeamId, "QB1");
  return p;
}

async function drainYielding(s: GameState, target: SimTarget): Promise<{ message: string; steps: number }> {
  const step = simToStepper(s, target);
  let steps = 0;
  let result = step();
  while (!result.done) {
    steps++;
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    result = step();
  }
  return { message: result.message, steps };
}

async function main(): Promise<void> {
  assert.equal(defaultSettings().pauseOnStartingQb, true);
  assert.equal(pauseOnStartingQb(kickoff(1, true)), true);
  assert.equal(startingQbShouldPause(true, 0, STARTING_QB_PAUSE_WEEKS - 1), false);
  assert.equal(startingQbShouldPause(true, 0, STARTING_QB_PAUSE_WEEKS), true);
  assert.equal(startingQbShouldPause(true, 7, 12), true);
  assert.equal(startingQbShouldPause(true, STARTING_QB_PAUSE_WEEKS, 18), false, "already out that long");
  assert.equal(startingQbShouldPause(true, 10, 9), false, "healing is not a new injury");
  assert.equal(startingQbShouldPause(false, 0, 18), false);

  {
    const base = kickoff(42, false);
    const syncState = clone(base);
    const yieldState = clone(base);
    const syncMsg = runSimTo(syncState, "champion");
    const yielded = await drainYielding(yieldState, "champion");
    assert.equal(yielded.message, syncMsg);
    assert.equal(yielded.message, "Champion crowned");
    assert.equal(strip(yieldState), strip(syncState));
    assert.ok(yielded.steps >= 18, `champion should yield across weeks, got ${yielded.steps}`);
    assert.ok(yieldState.phase.startsWith("offseason"));
  }

  {
    const base = kickoff(1, true);
    const syncState = clone(base);
    const yieldState = clone(base);
    const syncMsg = runSimTo(syncState, "deadline");
    const yielded = await drainYielding(yieldState, "deadline");
    assert.equal(yielded.message, syncMsg);
    assert.equal(strip(yieldState), strip(syncState));
    assert.equal(/paused/i.test(syncMsg), false, syncMsg);
    assert.ok(syncMsg.length > 0);
  }

  // Seed 1's starting quarterback does not cross 8 weeks in the regular
  // season. Trade calls and every other injury still happen. The click
  // reaches the playoffs, and it matches a run with the stop turned off.
  {
    const stopped = kickoff(1, true);
    const open = kickoff(1, false);
    const week = stopped.week;
    const stoppedMsg = runSimTo(stopped, "seasonEnd");
    const openMsg = runSimTo(open, "seasonEnd");
    assert.equal(stopped.phase, "playoffs");
    assert.equal(open.phase, "playoffs");
    assert.ok(stopped.week - week >= 17, `one click should cross the regular season, week ${week} -> ${stopped.week}`);
    assert.equal(stoppedMsg, openMsg);
    assert.equal(/paused/i.test(stoppedMsg), false, stoppedMsg);
    assert.equal(stopped.rngState, open.rngState);
    assert.equal(league(stopped), league(open));
  }

  // Seed 4, week 1: the user's QB1 (still not auto-IR'd) is out 18 weeks.
  {
    const stopped = kickoff(4, true);
    const open = kickoff(4, false);
    const yieldState = clone(stopped);
    const msg = runSimTo(stopped, "seasonEnd");
    const yielded = await drainYielding(yieldState, "seasonEnd");
    const qb = startingQb(stopped);
    assert.equal(qb.injuryWeeks, 18);
    assert.notEqual(qb.status, "ir", "the user's club is not auto-IR'd");
    assert.equal(stopped.phase, "regular");
    assert.equal(stopped.week, 2);
    assert.equal(
      msg,
      formatSimPauseToast("your starting quarterback is out 18 weeks", "Week 1 complete"),
    );
    assert.equal(yielded.message, msg);
    assert.equal(league(yieldState), league(stopped));

    const deadline = kickoff(4, true);
    assert.equal(runSimTo(deadline, "deadline"), msg, "every Hub target shares the stop");

    const resumed = clone(stopped);
    resumed.settings = { ...(resumed.settings ?? defaultSettings()), pauseOnStartingQb: false };
    const resumeMsg = runSimTo(resumed, "seasonEnd");
    const openMsg = runSimTo(open, "seasonEnd");
    assert.equal(resumed.phase, "playoffs");
    assert.equal(resumeMsg, openMsg);
    assert.equal(resumed.rngState, open.rngState);
    assert.equal(league(resumed), league(open));
  }

  {
    const paused = kickoff(11, false);
    const open = kickoff(11, false);
    const yieldState = clone(paused);
    const pausedMsg = runSimTo(paused, "champion");
    const openMsg = runSimTo(open, "champion");
    const yielded = await drainYielding(yieldState, "champion");
    assert.equal(pausedMsg, "Champion crowned");
    assert.equal(openMsg, pausedMsg);
    assert.equal(yielded.message, pausedMsg);
    assert.ok(paused.phase.startsWith("offseason"));
    assert.ok(yielded.steps >= 18, `champion click should yield across the season, got ${yielded.steps}`);
    assert.equal(paused.rngState, open.rngState);
    assert.equal(league(paused), league(open));
    assert.equal(league(yieldState), league(open));
  }

  console.log("ok    simTo — yielded steps match a synchronous drain");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
