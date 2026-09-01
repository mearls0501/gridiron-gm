/**
 * Regression for the Hub bulk-sim silent first abort.
 *
 * Run: npx tsx lib/store/simToast.test.ts
 */
import assert from "node:assert/strict";
import { formatSimPauseToast, toastDismissApplies } from "./simToast";

const REASON = "a starter went down";

// Empty last from advance() must still leave GM-readable pause copy.
// apply() treats a falsy return as toast:null — that is the silent abort.
const emptyLast = formatSimPauseToast(REASON, "");
assert.equal(emptyLast, "Simulation paused — a starter went down.");
assert.ok(emptyLast);
const applyEmpty = typeof emptyLast === "string" && emptyLast ? emptyLast : null;
assert.equal(applyEmpty, emptyLast);

const withLast = formatSimPauseToast(REASON, "Week 1 complete");
assert.equal(withLast, "Simulation paused — a starter went down. (Week 1 complete)");
const applyWithLast = typeof withLast === "string" && withLast ? withLast : null;
assert.equal(applyWithLast, withLast);

// The old `last && \`Simulation paused — ${reason}. (${last})\`` footgun:
// week-1 last === "" produced "" and apply wrote toast:null.
const emptyFromAdvance: string = "";
const oldEmpty = emptyFromAdvance && `Simulation paused — ${REASON}. (${emptyFromAdvance})`;
assert.equal(oldEmpty, "");
const oldApply = typeof oldEmpty === "string" && oldEmpty ? oldEmpty : null;
assert.equal(oldApply, null);

// Stale 2600ms dismiss from "season started" must not wipe the pause toast
// that simTo wrote while the main thread was blocked.
let toast: string | null = "2026 season started";
const staleShown = toast;
toast = formatSimPauseToast(REASON, "Week 1 complete");
if (toastDismissApplies(staleShown, toast)) toast = null;
assert.equal(toast, "Simulation paused — a starter went down. (Week 1 complete)");

// The unguarded timer (setToast(null) unconditionally) would have silenced it.
toast = "2026 season started";
const unguardedShown = toast;
toast = formatSimPauseToast(REASON, "Week 1 complete");
toast = null; // what the old Shell timer did on fire
assert.equal(toast, null, "documents the unguarded dismiss");
void unguardedShown;

// A timer armed for the current toast may still dismiss it.
toast = withLast;
if (toastDismissApplies(withLast, toast)) toast = null;
assert.equal(toast, null);

console.log("ok    simToast — empty last keeps pause copy; stale dismiss does not wipe");
