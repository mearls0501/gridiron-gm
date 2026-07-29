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

/**
 * The base seed for this run.
 *
 * Every harness has its own hardcoded seed, which made each one a SINGLE
 * sample. `Rng` is mulberry32, whose state advance is a pure counter, so any
 * change to how many values league generation draws lands the whole simulation
 * on a different stream — and a single-sample metric moves with it. That is how
 * `statcheck.leadRushYds` came to read exactly 1554 across three completely
 * different draft models: all three drew the same COUNT, so all three ran the
 * same season.
 *
 * With `GG_SEED` set, the gate sweeps a panel of seeds and averages, so every
 * metric has a real sampling distribution and a red number means a regression
 * rather than a reshuffle. Unset, this returns the harness's own seed and
 * behaviour is exactly as it was.
 *
 * The mix keeps harnesses independent of each other within a panel entry —
 * otherwise every harness would simulate the same league on seed N.
 */
export function seedFor(fallback: number): number {
  const panel = Number(process.env.GG_SEED);
  if (!Number.isFinite(panel) || panel <= 0) return fallback;
  return ((fallback ^ Math.imul(panel, 2654435761)) >>> 0) % 2147483647 || fallback;
}
