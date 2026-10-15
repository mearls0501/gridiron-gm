/**
 * The draft held after season N is labeled "N+1 Draft".
 * Stored pick seasons and draft-class seasons stay N.
 */
export function draftYearLabel(storedSeason: number): string {
  return `${storedSeason + 1} Draft`;
}

/**
 * News lines are stored with `describeAsset`, which keeps the class year.
 * A pick written as "2026 R1" or "2026 #12" reads as the draft held after
 * that season. Other sentences are left alone.
 */
export function presentNewsText(text: string): string {
  return text.replace(/\b(\d{4}) (?=R\d|#\d+)/g, (_, year: string) => `${Number(year) + 1} Draft `);
}
