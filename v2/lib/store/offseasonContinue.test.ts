/**
 * Hub offseason Continue scheduling. Yielding between steps must not move the save.
 *
 * Run: npx tsx lib/store/offseasonContinue.test.ts
 */
import assert from "node:assert/strict";
import { newGame } from "../core/newGame";
import { advance } from "../core/season/engine";
import { advanceOffseason } from "../core/offseason";
import type { GameState } from "../core/types";
import {
  offseasonContinueStepper,
  openingOffseasonLabel,
  runOffseasonContinue,
} from "./offseasonContinue";

function strip(s: GameState): string {
  const copy = { ...s } as Record<string, unknown>;
  delete copy.createdAt;
  delete copy.updatedAt;
  return JSON.stringify(copy);
}

function clone(s: GameState): GameState {
  return JSON.parse(JSON.stringify(s)) as GameState;
}

function toFreeAgency(seed: number): GameState {
  const st = newGame({ seed });
  advance(st);
  let g = 0;
  while (st.phase === "regular" && g++ < 40) advance(st);
  g = 0;
  while (st.phase === "playoffs" && g++ < 12) advance(st);
  assert.equal(st.phase, "offseason-recap");
  advanceOffseason(st);
  advanceOffseason(st);
  assert.equal(st.phase, "offseason-fa");
  return st;
}

async function drain(s: GameState): Promise<{ message: string; steps: number; labels: string[] }> {
  const labels = [openingOffseasonLabel(s)];
  const step = offseasonContinueStepper(s);
  let steps = 0;
  let result = step();
  while (!result.done) {
    steps++;
    labels.push(result.label);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    result = step();
  }
  return { message: result.message, steps, labels };
}

async function main(): Promise<void> {
  const atFa = toFreeAgency(42);

  {
    const syncState = clone(atFa);
    const directState = clone(atFa);
    const yieldState = clone(atFa);
    const syncMsg = advanceOffseason(syncState);
    const directMsg = runOffseasonContinue(directState);
    const yielded = await drain(yieldState);

    assert.equal(directMsg, syncMsg);
    assert.equal(yielded.message, syncMsg);
    assert.equal(syncMsg, "Free agency closed — the draft is on the clock");
    assert.equal(strip(directState), strip(syncState));
    assert.equal(strip(yieldState), strip(syncState));
    assert.equal(yieldState.phase, "offseason-draft");
    assert.ok(yielded.steps >= 8, `free agency should yield across waves and picks, got ${yielded.steps}`);
    assert.ok(
      yielded.labels.some((label) => /Free Agency wave \d+/.test(label)),
      `expected a free agency wave label, got ${yielded.labels.slice(0, 6).join(" | ")}`,
    );
    assert.ok(
      yielded.labels.some((label) => /Pick \d+/.test(label)),
      `expected a draft pick label, got ${yielded.labels.slice(-6).join(" | ")}`,
    );

    const atDraft = clone(syncState);
    const syncDraft = clone(atDraft);
    const directDraft = clone(atDraft);
    const yieldDraft = clone(atDraft);
    const syncDraftMsg = advanceOffseason(syncDraft);
    const directDraftMsg = runOffseasonContinue(directDraft);
    const yieldedDraft = await drain(yieldDraft);

    assert.equal(directDraftMsg, syncDraftMsg);
    assert.equal(yieldedDraft.message, syncDraftMsg);
    assert.equal(syncDraftMsg, "Draft complete");
    assert.equal(strip(directDraft), strip(syncDraft));
    assert.equal(strip(yieldDraft), strip(syncDraft));
    assert.equal(yieldDraft.phase, "offseason-final");
    assert.ok(yieldedDraft.steps >= 32, `finish-the-draft should yield across picks, got ${yieldedDraft.steps}`);
    assert.ok(
      yieldedDraft.labels.some((label) => /Pick \d+/.test(label)),
      "expected draft pick progress",
    );
    assert.ok(yieldedDraft.labels.includes("Simming… Camp"));
  }

  console.log("ok    offseasonContinue — yielded steps match advanceOffseason");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
