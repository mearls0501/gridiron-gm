/**
 * Seeded, serializable PRNG.
 *
 * Every random decision in the game goes through one of these. The state is a
 * single uint32 stored on GameState, so a save file fully determines the
 * future of the league — which makes bugs reproducible instead of "happens
 * sometimes". Never call Math.random() anywhere in lib/core.
 */
export class Rng {
  private s: number;

  constructor(seed: number) {
    // Avoid the zero fixed point.
    this.s = (seed >>> 0) || 0x9e3779b9;
  }

  /** Current state, for persisting into the save. */
  get state(): number {
    return this.s >>> 0;
  }

  /** mulberry32 — small, fast, good enough distribution for a sim. */
  next(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Uniform float in [min, max). */
  float(min = 0, max = 1): number {
    return min + this.next() * (max - min);
  }

  /** Uniform integer in [min, max] inclusive. */
  int(min: number, max: number): number {
    if (max < min) return min;
    return min + Math.floor(this.next() * (max - min + 1));
  }

  /** True with probability p. */
  chance(p: number): boolean {
    return this.next() < p;
  }

  /** Approximately normal via sum of uniforms (Irwin–Hall, n=4). */
  normal(mean = 0, sd = 1): number {
    const u = this.next() + this.next() + this.next() + this.next();
    // Irwin-Hall(4) has mean 2, variance 1/3 -> sd 0.5773
    return mean + ((u - 2) / 0.5773502692) * sd;
  }

  /** Normal, clamped to [lo, hi]. */
  normalClamped(mean: number, sd: number, lo: number, hi: number): number {
    return clamp(this.normal(mean, sd), lo, hi);
  }

  pick<T>(arr: readonly T[]): T {
    return arr[this.int(0, arr.length - 1)];
  }

  /** Weighted pick. Weights need not sum to 1; non-positive weights are skipped. */
  weighted<T>(items: readonly T[], weight: (item: T, i: number) => number): T {
    let total = 0;
    for (let i = 0; i < items.length; i++) {
      const w = weight(items[i], i);
      if (w > 0) total += w;
    }
    if (total <= 0) return items[this.int(0, items.length - 1)];

    let r = this.next() * total;
    for (let i = 0; i < items.length; i++) {
      const w = weight(items[i], i);
      if (w <= 0) continue;
      r -= w;
      if (r <= 0) return items[i];
    }
    return items[items.length - 1];
  }

  /** Fisher-Yates. Returns a new array; does not mutate the input. */
  shuffle<T>(arr: readonly T[]): T[] {
    const out = arr.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = this.int(0, i);
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Round to `dp` decimal places. Guards against float drift in displayed stats. */
export function round(v: number, dp = 0): number {
  const m = Math.pow(10, dp);
  return Math.round(v * m) / m;
}
