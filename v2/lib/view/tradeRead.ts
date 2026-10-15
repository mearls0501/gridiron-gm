/** Added when the other club's margin is at least 15% of the deal. */
export const OVERPAYING_LINE = "You're overpaying — try a smaller sweetener.";

/**
 * The other club's read, in the language a GM would actually get.
 *
 * `scale` is the total value of both packages in that club's currency,
 * so the margin is a share of the deal.
 */
export function readOfMargin(
  margin: number,
  scale: number,
): { text: string; tone: "good" | "warn" | "bad"; overpaying: boolean } {
  const r = scale > 0 ? margin / scale : 0;
  if (margin > 0) {
    if (r >= 0.15) return { text: "They would jump at this.", tone: "good", overpaying: true };
    if (r >= 0.05) return { text: "They like this. It gets done.", tone: "good", overpaying: false };
    return { text: "They would take it, but only just.", tone: "good", overpaying: false };
  }
  if (r >= -0.05) return { text: "Close, but they want a little more.", tone: "warn", overpaying: false };
  if (r >= -0.2) return { text: "Not close yet — they want considerably more.", tone: "bad", overpaying: false };
  return { text: "Not interested. This is nowhere near enough.", tone: "bad", overpaying: false };
}
