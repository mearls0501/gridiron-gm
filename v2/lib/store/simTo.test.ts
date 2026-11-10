/**
 * Hub simTo scheduling. Yielding between steps must not move the save.
 *
 * Run: npx tsx lib/store/simTo.test.ts
 */
import assert from "node:assert/strict";
import { newGame } from "../core/newGame";
import { advance } from "../core/season/engine";
import { defaultSettings, type GameState } from "../core/types";
import { runSimTo, simToStepper, type SimTarget } from "./simTo";

function strip(s: GameState): string {
  const copy = { ...s } as Record<string, unknown>;
  delete copy.createdAt;
  delete copy.updatedAt;
  return JSON.stringify(copy);
}

/** Pause flags are save settings. They must not change the league a click produces. */
function league(s: GameState): string {
  const copy = { ...s } as Record<string, unknown>;
  delete copy.createdAt;
  delete copy.updatedAt;
  delete copy.settings;
  return JSON.stringify(copy);
}

function kickoff(seed: number, pauses: boolean): GameState {
  const st = newGame({ seed });
  st.settings = defaultSettings();
  if (!pauses) {
    st.settings.pauseOn.tradeOffer = false;
    st.settings.pauseOn.injuredStarter = false;
    st.settings.pauseOn.milestone = false;
  }
  advance(st);
  return st;
}

function clone(s: GameState): GameState {
  return JSON.parse(JSON.stringify(s)) as GameState;
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
    assert.ok(syncMsg.length > 0);
  }

  {
    const paused = kickoff(42, true);
    const open = kickoff(42, false);
    const week = paused.week;
    const pausedMsg = runSimTo(paused, "seasonEnd");
    const openMsg = runSimTo(open, "seasonEnd");
    assert.equal(paused.phase, "playoffs");
    assert.equal(open.phase, "playoffs");
    assert.ok(paused.week - week >= 17, `one click should cross the regular season, week ${week} -> ${paused.week}`);
    assert.equal(pausedMsg, openMsg);
    assert.equal(/paused/i.test(pausedMsg), false, pausedMsg);
    assert.equal(paused.rngState, open.rngState);
    assert.equal(league(paused), league(open));
  }

  {
    const paused = kickoff(11, true);
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
