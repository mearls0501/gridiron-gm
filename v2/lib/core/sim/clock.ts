/** The longest existing scrimmage runoff (a sack), including between-play time. */
export const MAX_SCRIMMAGE_SECONDS = 45;

/** No timeout/hurry-up model exists: bank the kick before another snap can expire the clock. */
export function takeLastKick(quarter: number, clock: number, margin: number): boolean {
  if (clock <= 0 || clock > MAX_SCRIMMAGE_SECONDS) return false;
  return quarter === 2 || (quarter >= 4 && margin >= -3 && margin <= 0);
}
