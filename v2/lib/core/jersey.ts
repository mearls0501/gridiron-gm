import { Rng } from "./rng";
import { GameState, HofEntry, Player, Position, Team } from "./types";

/**
 * Jersey numbers and retired numbers.
 *
 * Display state. Every draw is a child stream keyed (seed, "jersey", playerId).
 * `state.rngState` is not read or written — calibrate / statcheck stay
 * byte-identical to a league that never assigned numbers.
 *
 * Ranges are the published NFL numbering rule (2021 expansion, 2023 zero):
 * Rule 5, Section 1, Article 2. See `docs/nfl-reference.md` §4.
 *
 * Hall-of-Fame auto-retire is a defensive hook: it reads `state.hallOfFame`
 * if Packet 3 has written it and otherwise no-ops. It does not induct.
 */

export const HOF_RETIRE_SEASONS = 8;

export const JERSEY_RANGES: Record<Position, ReadonlyArray<readonly [number, number]>> = {
  QB: [[0, 19]],
  RB: [[0, 49], [80, 89]],
  WR: [[0, 49], [80, 89]],
  TE: [[0, 49], [80, 89]],
  OT: [[50, 79]],
  OG: [[50, 79]],
  C: [[50, 79]],
  EDGE: [[50, 79], [90, 99]],
  DT: [[50, 79], [90, 99]],
  LB: [[0, 59], [90, 99]],
  CB: [[0, 49]],
  S: [[0, 49]],
  K: [[0, 49], [90, 99]],
  P: [[0, 49], [90, 99]],
};

const LEGAL: Record<Position, number[]> = (Object.keys(JERSEY_RANGES) as Position[]).reduce(
  (acc, pos) => {
    const nums: number[] = [];
    for (const [lo, hi] of JERSEY_RANGES[pos]) {
      for (let n = lo; n <= hi; n++) nums.push(n);
    }
    acc[pos] = nums;
    return acc;
  },
  {} as Record<Position, number[]>,
);

export function legalJerseyNumbers(pos: Position): readonly number[] {
  return LEGAL[pos];
}

export function isLegalJersey(pos: Position, n: number): boolean {
  return LEGAL[pos].includes(n);
}

export function formatJersey(n: number | undefined): string {
  return typeof n === "number" ? `#${n}` : "";
}

/** Child stream keyed (seed, "jersey", playerId). Does not touch the parent. */
export function jerseyChildRng(seed: number, playerId: number): Rng {
  let h = seed >>> 0;
  const tag = "jersey";
  for (let i = 0; i < tag.length; i++) h = Math.imul(h ^ tag.charCodeAt(i), 0xc2b2ae35);
  h = Math.imul(h ^ (playerId + 1), 0x85ebca6b);
  return new Rng((h >>> 0) || 0x9e3779b9);
}

export function preferredJersey(seed: number, playerId: number, pos: Position): number {
  const legal = LEGAL[pos];
  const rng = jerseyChildRng(seed, playerId);
  return legal[rng.int(0, legal.length - 1)];
}

function pickAvailable(
  seed: number,
  p: Player,
  blocked: Set<number>,
): number {
  const legal = LEGAL[p.pos];
  const rng = jerseyChildRng(seed, p.id);
  const start = rng.int(0, legal.length - 1);
  for (let i = 0; i < legal.length; i++) {
    const n = legal[(start + i) % legal.length];
    if (!blocked.has(n)) return n;
  }
  for (let n = 0; n <= 99; n++) {
    if (!blocked.has(n)) return n;
  }
  return preferredJersey(seed, p.id, p.pos);
}

function clubSeasons(p: Player, teamId: number): number {
  let n = 0;
  for (const row of p.stats) {
    if (row.teamId === teamId && row.games > 0) n++;
  }
  return n;
}

function playedForClub(p: Player, teamId: number): boolean {
  if (p.teamId === teamId) return true;
  return p.stats.some((row) => row.teamId === teamId && row.games > 0);
}

function retiredSet(team: Team): Set<number> {
  const out = new Set<number>();
  for (const row of team.retiredNumbers ?? []) out.add(row.number);
  return out;
}

/**
 * Assign a unique, position-legal number on this club.
 * Keeps the existing number when it is still legal and free.
 */
export function assignJerseyOnJoin(state: GameState, p: Player): void {
  if (p.teamId === null) {
    if (typeof p.number !== "number") {
      p.number = preferredJersey(state.seed, p.id, p.pos);
    }
    return;
  }
  const team = state.teams[p.teamId];
  if (!team) return;
  const blocked = retiredSet(team);
  for (const q of state.players) {
    if (q.id === p.id || q.teamId !== p.teamId) continue;
    if (typeof q.number === "number") blocked.add(q.number);
  }
  if (
    typeof p.number === "number" &&
    isLegalJersey(p.pos, p.number) &&
    !blocked.has(p.number)
  ) {
    return;
  }
  p.number = pickAvailable(state.seed, p, blocked);
}

/**
 * Fill missing numbers and repair collisions. Parent RNG is not moved.
 * Order is by player id so migrate is deterministic.
 */
export function ensureJerseyNumbers(state: GameState): void {
  for (const t of state.teams) {
    if (!t.retiredNumbers) t.retiredNumbers = [];
  }

  for (const p of state.players) {
    if (p.teamId === null && typeof p.number !== "number") {
      p.number = preferredJersey(state.seed, p.id, p.pos);
    }
  }

  for (const team of state.teams) {
    const retired = retiredSet(team);
    const roster = state.players
      .filter((p) => p.teamId === team.id)
      .sort((a, b) => a.id - b.id);
    const keep = new Set<number>();
    for (const p of roster) {
      if (
        typeof p.number === "number" &&
        isLegalJersey(p.pos, p.number) &&
        !retired.has(p.number) &&
        !keep.has(p.number)
      ) {
        keep.add(p.number);
      }
    }
    const blocked = new Set<number>(retired);
    for (const n of keep) blocked.add(n);
    for (const p of roster) {
      if (typeof p.number === "number" && keep.has(p.number)) continue;
      p.number = pickAvailable(state.seed, p, blocked);
      blocked.add(p.number);
    }
  }
}

function alreadyRetired(team: Team, number: number): boolean {
  return (team.retiredNumbers ?? []).some((r) => r.number === number);
}

function writeRetired(
  state: GameState,
  team: Team,
  p: Player,
  number: number,
  reason: "hof" | "user",
): void {
  if (alreadyRetired(team, number)) return;
  if (!team.retiredNumbers) team.retiredNumbers = [];
  team.retiredNumbers.push({
    number,
    playerId: p.id,
    firstName: p.firstName,
    lastName: p.lastName,
    pos: p.pos,
    season: state.season,
    reason,
  });
  team.retiredNumbers.sort((a, b) => a.number - b.number || a.playerId - b.playerId);
  for (const q of state.players) {
    if (q.teamId === team.id && q.number === number) q.number = undefined;
  }
  ensureJerseyNumbers(state);
}

export function canRetireUserNumber(state: GameState, playerId: number): { ok: true } | { ok: false; reason: string } {
  if (state.jerseyRetireSeason === state.season) {
    return { ok: false, reason: "This club may retire one number per season." };
  }
  const p = state.players.find((x) => x.id === playerId);
  if (!p) return { ok: false, reason: "No such player." };
  if (!playedForClub(p, state.userTeamId)) {
    return { ok: false, reason: "That player did not play for this club." };
  }
  if (typeof p.number !== "number") {
    p.number = preferredJersey(state.seed, p.id, p.pos);
  }
  const team = state.teams[state.userTeamId];
  if (alreadyRetired(team, p.number)) {
    return { ok: false, reason: `${formatJersey(p.number)} is already retired.` };
  }
  return { ok: true };
}

export function retireUserNumber(state: GameState, playerId: number): { ok: true; number: number } | { ok: false; reason: string } {
  const gate = canRetireUserNumber(state, playerId);
  if (!gate.ok) return gate;
  const p = state.players.find((x) => x.id === playerId)!;
  if (typeof p.number !== "number") {
    p.number = preferredJersey(state.seed, p.id, p.pos);
  }
  const team = state.teams[state.userTeamId];
  const number = p.number;
  writeRetired(state, team, p, number, "user");
  state.jerseyRetireSeason = state.season;
  state.log.push({
    season: state.season,
    week: state.week,
    kind: "system",
    text: `${team.abbr} retire ${formatJersey(number)} — ${p.firstName} ${p.lastName}, ${p.pos}.`,
  });
  return { ok: true, number };
}

export function userRetireCandidates(state: GameState): Player[] {
  const teamId = state.userTeamId;
  const retired = retiredSet(state.teams[teamId]);
  const seen = new Set<number>();
  const out: Player[] = [];
  for (const p of state.players) {
    if (seen.has(p.id) || !playedForClub(p, teamId)) continue;
    if (typeof p.number !== "number") continue;
    if (retired.has(p.number)) continue;
    seen.add(p.id);
    out.push(p);
  }
  out.sort((a, b) => (a.number ?? 0) - (b.number ?? 0) || a.id - b.id);
  return out;
}

/**
 * Retire an inductee's number at every club where they played ≥ 8 seasons.
 * Reads `state.hallOfFame` (Packet 3). Missing / empty → no-op.
 * Does not write induction records.
 */
export function maybeRetireNumbersForHallOfFame(state: GameState): void {
  const hall: HofEntry[] = state.hallOfFame ?? [];
  if (hall.length === 0) return;

  for (const entry of hall) {
    if (typeof entry.playerId !== "number") continue;
    const p = state.players.find((x) => x.id === entry.playerId);
    if (!p) continue;
    if (typeof p.number !== "number") {
      p.number = preferredJersey(state.seed, p.id, p.pos);
    }
    const number = p.number;
    for (const team of state.teams) {
      if (clubSeasons(p, team.id) < HOF_RETIRE_SEASONS) continue;
      if (alreadyRetired(team, number)) continue;
      writeRetired(state, team, p, number, "hof");
    }
  }
}
