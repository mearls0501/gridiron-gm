/**
 * Machine-readable metric emission.
 *
 * The harnesses print prose for a human reading them directly. That prose is
 * unusable to an automated gate — and to a small model looking at the output
 * and trying to decide whether it just broke the game. So every harness also
 * emits its headline numbers in one fixed format:
 *
 *     ##M <name> <value>
 *
 * `scripts/gate.ts` reads those lines and compares them against the locked
 * numbers in `docs/baselines.json`. Nothing else parses harness output.
 *
 * Adding a metric here is additive and safe. REMOVING one, or renaming one,
 * breaks the gate — the gate fails loudly on a missing metric rather than
 * silently skipping it, which is the whole point.
 */
export function emit(name: string, value: number): void {
  console.log(`##M ${name} ${Number.isFinite(value) ? value : "NaN"}`);
}

/** Emit several at once. */
export function emitAll(values: Record<string, number>): void {
  for (const [k, v] of Object.entries(values)) emit(k, v);
}
