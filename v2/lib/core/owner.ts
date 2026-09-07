import { teamOutlook, type Posture } from "./frontOffice";
import { makeCoachName } from "./names";
import { Rng, clamp } from "./rng";
import { GameState, Owner } from "./types";
import { computeRecords } from "./select";

/**
 * Club owners. Patience is generated once on a child stream keyed
 * (seed, season, week, 'owner'). Job heat is a pure function of posture,
 * recent wins, and that dial — no draws, no parent stream.
 *
 * Proposed defaults (flag for Matt): conservative NFL-shaped. A typical
 * chair gets two full seasons before a firing is even legal, contend
 * clubs are judged against ~10 wins, rebuilds against ~6, and an
 * impatient owner still needs a pair of genuinely bad years.
 */

export const OWNER_PATIENCE = { lo: 0.35, hi: 0.80, mean: 0.55, sd: 0.12 } as const;

/** Wins the owner is paying this GM to produce, by `teamOutlook` posture. */
export const OWNER_WIN_TARGET: Record<Posture, number> = {
  contend: 10,
  retool: 8,
  rebuild: 6,
};

/** Nobody is fired after a single season. */
export const OWNER_MIN_SEASONS = 2;

/**
 * Heat at which `firingEnabled` would cost the chair.
 * impatient (0.35) → 72; typical (0.55) → 77; patient (0.80) → 84.
 */
export function fireHeatThreshold(patience: number): number {
  return 62 + clamp(patience, 0, 1) * 28;
}

export function ownerChildRng(state: GameState): Rng {
  let h = state.seed >>> 0;
  h = Math.imul(h ^ state.season, 0x9e3779b9);
  h = Math.imul(h ^ (state.week + 1), 0x85ebca6b);
  const tag = "owner";
  for (let i = 0; i < tag.length; i++) h = Math.imul(h ^ tag.charCodeAt(i), 0xc2b2ae35);
  return new Rng((h >>> 0) || 0x9e3779b9);
}

export function ensureOwners(state: GameState): void {
  const rng = ownerChildRng(state);
  for (const team of state.teams) {
    if (team.owner) continue;
    team.owner = {
      name: makeCoachName(rng),
      patience: clamp(
        rng.normal(OWNER_PATIENCE.mean, OWNER_PATIENCE.sd),
        OWNER_PATIENCE.lo,
        OWNER_PATIENCE.hi,
      ),
    };
  }
}

export interface OwnerJobView {
  owner: Owner;
  posture: Posture;
  expectedWins: number;
  recentWins: number | null;
  seasonsWithGm: number;
  heat: number;
  threshold: number;
  firingEnabled: boolean;
  wouldFire: boolean;
  seat: "safe" | "watched" | "hot" | "fired";
  line: string;
}

function lastSeasonWins(state: GameState, teamId: number): number | null {
  const hist = state.history[state.history.length - 1];
  if (hist) {
    const row = hist.standings.find((r) => r.teamId === teamId);
    if (row) return row.w + row.t * 0.5;
  }
  const recs = computeRecords(state);
  const rec = recs.get(teamId);
  if (!rec) return null;
  const played = rec.w + rec.l + rec.t;
  if (played === 0) return null;
  return rec.w + rec.t * 0.5;
}

export function ownerHeatFor(
  patience: number,
  posture: Posture,
  seasonWins: number[],
): number {
  const target = OWNER_WIN_TARGET[posture];
  let heat = 0;
  const foPatience = 1.2 - patience * 0.6;
  const cool = 0.4 + patience * 0.4;
  for (let i = 0; i < seasonWins.length; i++) {
    const wins = seasonWins[i];
    const rebuildGrace = posture === "rebuild" && i <= 1;
    if (rebuildGrace && wins < target) {
      heat += (target - wins) * foPatience * 3;
    } else if (wins < target) {
      heat += (target - wins) * foPatience * 8;
    } else {
      heat -= (wins - target + 1) * cool * 6;
    }
    heat = clamp(heat, 0, 100);
  }
  return heat;
}

function heatFromSeasons(state: GameState, teamId: number, patience: number): number {
  const { posture } = teamOutlook(state, teamId);
  const wins: number[] = [];
  for (const year of state.history) {
    const row = year.standings.find((r) => r.teamId === teamId);
    if (row) wins.push(row.w + row.t * 0.5);
  }
  return ownerHeatFor(patience, posture, wins);
}

export function ownerJobView(state: GameState, teamId: number): OwnerJobView | null {
  const team = state.teams[teamId];
  if (!team?.owner) return null;
  const { posture } = teamOutlook(state, teamId);
  const expectedWins = OWNER_WIN_TARGET[posture];
  const recentWins = lastSeasonWins(state, teamId);
  const seasonsWithGm = state.history.length;
  const heat = heatFromSeasons(state, teamId, team.owner.patience);
  const threshold = fireHeatThreshold(team.owner.patience);
  const firingEnabled = state.settings?.firingEnabled ?? true;
  const wouldFire = firingEnabled && seasonsWithGm >= OWNER_MIN_SEASONS && heat >= threshold;

  let seat: OwnerJobView["seat"] = "safe";
  if (wouldFire) seat = "fired";
  else if (heat >= threshold - 8) seat = "hot";
  else if (heat >= threshold * 0.55) seat = "watched";

  const patienceWord =
    team.owner.patience >= 0.68 ? "patient" : team.owner.patience <= 0.42 ? "impatient" : "typical";

  let line: string;
  if (!firingEnabled) {
    line = "Firing is off — the chair is guaranteed, whatever the record.";
  } else if (seasonsWithGm < OWNER_MIN_SEASONS) {
    line = `${team.owner.name} is ${patienceWord}. The first two seasons are a look, not a verdict.`;
  } else if (wouldFire) {
    line = `${team.owner.name} has seen enough. If the orchestrator wires the recap hook, you are out.`;
  } else if (seat === "hot") {
    line = `${team.owner.name} is ${patienceWord} and the seat is hot. Another year like the last one ends it.`;
  } else if (seat === "watched") {
    line = `${team.owner.name} expected about ${expectedWins} wins from a ${posture} club. You are on notice.`;
  } else {
    line = `${team.owner.name} is ${patienceWord}. A ${posture} club is supposed to win about ${expectedWins}.`;
  }

  return {
    owner: team.owner,
    posture,
    expectedWins,
    recentWins,
    seasonsWithGm,
    heat,
    threshold,
    firingEnabled,
    wouldFire,
    seat,
    line,
  };
}
