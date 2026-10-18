import baselines from "../docs/baselines.json";
import { GameState } from "../lib/core/types";

export interface Bound { target?: number; tol?: number; min?: number; max?: number }
export function bandLimits(bound: Bound): { lo: number; hi: number } {
  if (Object.values(bound).some((v) => !Number.isFinite(v)) ||
      (bound.target === undefined) !== (bound.tol === undefined) ||
      (bound.tol !== undefined && bound.tol < 0)) throw new Error("invalid locked band");
  let lo = bound.min ?? -Infinity, hi = bound.max ?? Infinity;
  if (bound.target !== undefined && bound.tol !== undefined) {
    lo = Math.max(lo, bound.target - bound.tol); hi = Math.min(hi, bound.target + bound.tol);
  }
  if (lo > hi || (lo === -Infinity && hi === Infinity)) throw new Error("missing or inconsistent locked band");
  return { lo, hi };
}
export function lockedBand(name: string): { lo: number; hi: number } {
  const bounds: Record<string, Bound> = baselines.metrics;
  const b = bounds[name];
  if (!b) throw new Error(`missing locked baseline ${name}`);
  // Only bound fields; NFL provenance and notes are not limits.
  return bandLimits({ ...("target" in b ? { target: b.target } : {}), ...("tol" in b ? { tol: b.tol } : {}),
    ...("min" in b ? { min: b.min } : {}), ...("max" in b ? { max: b.max } : {}) });
}
export function insideBand(value: number, band: { lo: number; hi: number }): boolean {
  return Number.isFinite(value) && value >= band.lo && value <= band.hi;
}

// Fixed diagnostic expansion: preserve the original five and include every ID through 100.
export const RB_PANEL = Object.freeze(Array.from({ length: 100 }, (_, i) => i + 1));
export function rushingPanelMean(samples: readonly { panel: number; yards: number }[]): number {
  if (samples.length !== RB_PANEL.length || new Set(samples.map((s) => s.panel)).size !== RB_PANEL.length ||
      samples.some((s) => !RB_PANEL.includes(s.panel) || !Number.isFinite(s.yards) || s.yards < 0)) {
    throw new Error("RB guard requires each standard panel seed exactly once");
  }
  return samples.reduce((n, s) => n + s.yards, 0) / RB_PANEL.length;
}

/** Independent REG box evidence, captured before any playoff game. */
export function captureRushingRank5(state: GameState): number {
  const current = state.games.filter((g) => g.season === state.season);
  const regular = current.filter((g) => g.playoffRound === null);
  if (state.phase !== "playoffs" || !regular.length || regular.some((g) => !g.played || !g.boxScore) ||
      current.some((g) => g.playoffRound !== null && g.played)) throw new Error("RB panel requires complete REG boxes before playoffs");
  const yards = new Map<number, number>();
  for (const g of regular) {
    const seen = new Set<number>();
    for (const row of g.boxScore!.players) {
      if (seen.has(row.playerId) || !Number.isFinite(row.rushYds)) throw new Error("invalid or duplicate REG rushing row");
      seen.add(row.playerId);
      yards.set(row.playerId, (yards.get(row.playerId) ?? 0) + row.rushYds);
    }
  }
  const ranked = [...yards.values()].filter((v) => v > 0).sort((a, b) => b - a);
  if (ranked.length < 5) throw new Error("RB panel has fewer than five rushing observations");
  return ranked[4];
}
