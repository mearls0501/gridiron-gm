/**
 * Depth-chart help and card counts. Display only.
 *
 * The starter count is a position, not one number, so the paragraph names
 * the counts in words. Card subtitles agree with that count.
 */

export function starterCountLabel(count: number): string {
  const n = Math.max(0, Math.trunc(count));
  return `${n} starter${n === 1 ? "" : "s"}`;
}

export const DEPTH_CHART_HELP =
  "This chart drives the simulation. Before each play the engine walks every position list from the top and fields the healthy starters a normal snap needs — one at quarterback, running back, tight end, center, kicker, and punter; two at offensive tackle, guard, edge, defensive tackle, linebacker, and safety; three at wide receiver and corner — so the order below is literally who takes the snap. Injured players are skipped and the next man up plays; if a list runs short, the best remaining healthy body on the roster fills in.";
