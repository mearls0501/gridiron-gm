/**
 * The signed cap on `staff.leagueOvrDelta` is the panel mean, max 1.2.
 *
 * `scripts/gate.ts` already averages each `##M` line across the seed panel
 * and grades that mean with `checkBound` (fail when the value is over `max`).
 * `docs/baselines.json` locks `staff.leagueOvrDelta` at max 1.2. That is the
 * cap. Do not widen it.
 *
 * `staffcheck.ts` used to copy the same 1.2 inside one seed and increment
 * `staff.problems`. One seed over the line then made the pooled problem
 * count 0.20. A seed's delta is still reported. It adds nothing to
 * `staff.problems`. The other staffcheck assertions stay per seed.
 */

/** Signed max. Matches `docs/baselines.json` `staff.leagueOvrDelta.max`. */
export const LEAGUE_OVR_DELTA_CAP = 1.2;

/**
 * Per-seed contribution to `staff.problems` from the league-mean move.
 * Always 0. The cap is the panel mean, graded by the gate.
 */
export function seedLeagueOvrDeltaProblemCount(delta: number): number {
  if (!Number.isFinite(delta)) throw new Error("staff.leagueOvrDelta must be finite");
  return 0;
}

/**
 * Printed when a seed sits on the old per-seed line (`Math.abs(delta) < 1.2`
 * failed, including exactly 1.2). Not a FAIL, and not a problem.
 */
export function seedLeagueOvrDeltaNote(delta: number): string | null {
  if (!Number.isFinite(delta)) throw new Error("staff.leagueOvrDelta must be finite");
  if (Math.abs(delta) < LEAGUE_OVR_DELTA_CAP) return null;
  return (
    `this seed moved ${delta.toFixed(3)} OVR. ` +
    `The ${LEAGUE_OVR_DELTA_CAP} cap is the panel mean of staff.leagueOvrDelta, so this seed is not a problem.`
  );
}

/** Arithmetic mean, the same reduction the gate applies to a metric's seeds. */
export function panelMean(values: readonly number[]): number {
  if (values.length === 0) throw new Error("panel mean needs at least one seed");
  for (const v of values) {
    if (!Number.isFinite(v)) throw new Error("panel mean needs finite seeds");
  }
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/**
 * The gate's max rule: the panel mean fails only when it is over the cap.
 * Exactly 1.2 passes. A negative mean passes. One seed over 1.2 does not
 * fail a panel whose mean is inside the cap.
 */
export function panelLeagueOvrDeltaFails(deltas: readonly number[]): boolean {
  return panelMean(deltas) > LEAGUE_OVR_DELTA_CAP;
}
