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

  console.log("ok    simTo — yielded steps match a synchronous drain");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
