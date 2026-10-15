/**
 * The draft held after season N is labeled "N+1 Draft".
 * Stored pick seasons and draft-class seasons stay N.
 */
export function draftYearLabel(storedSeason: number): string {
  return `${storedSeason + 1} Draft`;
}
