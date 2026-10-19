import { isActiveRoster } from "../lib/core/select";
import { Player, Position, POSITIONS } from "../lib/core/types";

export interface AgingSnapshot {
  readonly id: number;
  readonly pos: Position;
  readonly age: number;
  readonly peakAge: number;
  readonly ovr: number;
  readonly active: boolean;
  readonly retired: boolean;
}

function freezePlayer(p: Player): AgingSnapshot {
  return Object.freeze({
    id: p.id, pos: p.pos, age: p.age, peakAge: p.peakAge, ovr: p.ovr,
    active: !p.retired && p.teamId !== null && isActiveRoster(p), retired: p.retired,
  });
}

/** Capture primitives before progression can change ages, ratings or roster membership. */
export function captureAging(players: readonly Player[]): readonly AgingSnapshot[] {
  return Object.freeze(players.filter((p) => !p.retired && !p.prospect).map(freezePlayer));
}

export interface AgingPair {
  readonly before: AgingSnapshot;
  readonly after: AgingSnapshot;
  readonly yearsPastPeak: number;
  readonly delta: number;
}

export interface AgingMeasurement {
  readonly compared: number;
  readonly pairs: readonly AgingPair[];
  readonly errors: readonly string[];
}

/** Match the same people immediately after progression, including newly retired players. */
export function measureAging(
  before: readonly AgingSnapshot[], players: readonly Player[],
): AgingMeasurement {
  const byId = new Map(players.map((p) => [p.id, p]));
  const pairs: AgingPair[] = [];
  const errors: string[] = [];
  for (const old of before) {
    const player = byId.get(old.id);
    if (!player) {
      errors.push(`player ${old.id} missing after progression`);
      continue;
    }
    const after = freezePlayer(player);
    if (after.age !== old.age + 1) {
      errors.push(`player ${old.id} aged ${old.age} -> ${after.age}, expected ${old.age + 1}`);
      continue;
    }
    if (!Number.isFinite(old.ovr) || !Number.isFinite(after.ovr)) {
      errors.push(`player ${old.id} has a non-finite rating`);
      continue;
    }
    const yearsPastPeak = old.age + 1 - old.peakAge;
    if (yearsPastPeak <= 0) continue;
    pairs.push(Object.freeze({ before: old, after, yearsPastPeak, delta: after.ovr - old.ovr }));
  }
  return Object.freeze({ compared: before.length, pairs: Object.freeze(pairs), errors: Object.freeze(errors) });
}

export function summarizePostPeak(pairs: readonly AgingPair[]) {
  return POSITIONS.map((pos) => {
    const group = pairs.filter((p) => p.before.pos === pos);
    return {
      pos, n: group.length,
      meanDelta: group.length ? group.reduce((n, p) => n + p.delta, 0) / group.length : null,
    };
  });
}

export function postPeakProblems(pairs: readonly AgingPair[]): string[] {
  return summarizePostPeak(pairs).flatMap((g) =>
    g.meanDelta === null ? [`${g.pos}: no post-peak observations`]
      : g.meanDelta >= 0 ? [`${g.pos}: mean change ${g.meanDelta.toFixed(3)} (n=${g.n})`] : []);
}
