import reference from "../docs/milestone-reference.json";
import { PlayerGameStat, SeasonStatLine } from "../lib/core/types";

const KEYS = ["passYds", "passTd", "rushYds", "rushTd", "recYds", "recTd", "sacks", "ints", "tackles", "fgm", "longFg"] as const;
type StatKey = typeof KEYS[number];
export interface Threshold {
  readonly label: string;
  readonly key: StatKey;
  readonly atLeast: number;
  readonly referenceCount: number;
  readonly referenceExposure: number;
  readonly comparable: boolean;
  readonly nfl: number;
  readonly test: (p: PlayerGameStat | SeasonStatLine) => boolean;
}
export const REFERENCE_GAMES = reference.years.reduce((n, y) => n + y.games, 0);
export const REFERENCE_SEASONS = reference.years.length;
if (reference.version !== 1 || REFERENCE_SEASONS !== 4 ||
    reference.years.some((y, i) => y.season !== 2021 + i || !Number.isInteger(y.games) || y.games <= 0)) {
  throw new Error("invalid milestone reference years/exposure");
}
function thresholds(scope: "game" | "season"): readonly Threshold[] {
  const rows = reference.categories[scope];
  if (rows.length !== (scope === "game" ? 27 : 19) || new Set(rows.map((r) => r.label)).size !== rows.length) {
    throw new Error("missing or duplicate milestone reference categories");
  }
  return Object.freeze(rows.map((r) => {
    if (!KEYS.includes(r.key as StatKey) || !Number.isFinite(r.atLeast) || r.atLeast <= 0 ||
        r.counts.length !== REFERENCE_SEASONS || r.counts.some((n) => !Number.isInteger(n) || n < 0) ||
        r.comparable !== (r.key !== "tackles")) throw new Error(`invalid milestone reference ${r.label}`);
    const key = r.key as StatKey;
    const count = r.counts.reduce((n, x) => n + x, 0);
    const exposure = scope === "game" ? REFERENCE_GAMES : REFERENCE_SEASONS;
    return Object.freeze({ label: r.label, key, atLeast: r.atLeast, referenceCount: count,
      referenceExposure: exposure, comparable: r.comparable,
      nfl: count / exposure * (scope === "game" ? 272 : 1),
      test: (p: PlayerGameStat | SeasonStatLine) => p[key] >= r.atLeast });
  }));
}
export const GAME_THRESHOLDS = thresholds("game");
export const SEASON_THRESHOLDS = thresholds("season");

/** Exact two-sided conditional Poisson test, including finite-reference uncertainty. */
export function compareCounts(count: number, exposure: number, referenceCount: number, referenceExposure: number) {
  if (![count, referenceCount].every((x) => Number.isSafeInteger(x) && x >= 0) ||
      ![exposure, referenceExposure].every((x) => Number.isFinite(x) && x > 0)) {
    throw new Error("milestone comparison requires nonnegative integer counts and positive exposures");
  }
  const n = count + referenceCount;
  let pValue = 1;
  if (n > 0) {
    const p = exposure / (exposure + referenceExposure);
    if (!(p > 0 && p < 1)) throw new Error("invalid milestone exposure ratio");
    const mode = Math.min(n, Math.floor((n + 1) * p));
    const mass = new Float64Array(n + 1);
    mass[mode] = 1;
    for (let k = mode; k > 0; k--) mass[k - 1] = mass[k] * k / (n - k + 1) * (1 - p) / p;
    for (let k = mode; k < n; k++) mass[k + 1] = mass[k] * (n - k) / (k + 1) * p / (1 - p);
    let total = 0, tail = 0;
    for (const x of mass) {
      total += x;
      if (x <= mass[count] * (1 + 1e-10)) tail += x;
    }
    pValue = Math.min(1, tail / total);
  }
  const direction = count / exposure < referenceCount / referenceExposure ? "TOO RARE" : "TOO COMMON";
  return Object.freeze({ pValue, verdict: pValue < 0.05 ? direction : "ok" });
}
