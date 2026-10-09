import { teamOutlook, type Posture } from "./frontOffice";
import { makeCoachName } from "./names";
import { Rng, clamp } from "./rng";
import { ForcedMove, GameState, Owner } from "./types";
import { computeRecords, startSeason } from "./select";

/**
 * Club owners. Patience is generated once on a child stream keyed
 * (seed, season, week, 'owner'). The firing rule is a pure function of
 * the last two seasons under this coach, the locked win target, and
 * patience — no draws, no parent stream.
 *
 * Owners judge a coach on his last two seasons, weighted 60/40, against
 * a bar of 8.5 / 7.5 / 7.0 wins by expectation, moved by patience.
 * One-and-done only at four wins or fewer, and not when that season's
 * expected wins are the rebuild target. An expiring coach within a
 * win of the bar is not renewed (that clause lives on the coach tick).
 */

export const OWNER_PATIENCE = { lo: 0.35, hi: 0.80, mean: 0.55, sd: 0.12 } as const;

/** Wins the owner is paying this GM to produce, by `teamOutlook` posture. */
export const OWNER_WIN_TARGET: Record<Posture, number> = {
  contend: 10,
  retool: 8,
  rebuild: 6,
};

/**
 * The two-season weighted rule starts at this many completed seasons.
 * A shorter tenure is the one-and-done clause: one season fires only at
 * four wins or fewer, with the same patience shift as the bar.
 */
export const OWNER_MIN_SEASONS = 2;

/** One-and-done line before the patience shift. */
export const OWNER_ONE_AND_DONE_WINS = 4;

/** Typical patience. The bar moves by `4 × (patience − this)`. */
const TYPICAL_PATIENCE = 0.55;

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
  const hired = startSeason(state);
  for (const team of state.teams) {
    if (!team.owner) {
      team.owner = {
        name: makeCoachName(rng),
        patience: clamp(
          rng.normal(OWNER_PATIENCE.mean, OWNER_PATIENCE.sd),
          OWNER_PATIENCE.lo,
          OWNER_PATIENCE.hi,
        ),
      };
    }
    if (team.gmHiredSeason == null) team.gmHiredSeason = hired;
  }
}

export function gmHiredSeasonOf(state: GameState, teamId: number): number {
  return state.teams[teamId]?.gmHiredSeason ?? startSeason(state);
}

export function seasonsWithGm(state: GameState, teamId: number): number {
  const hired = gmHiredSeasonOf(state, teamId);
  return state.history.filter((h) => h.season >= hired).length;
}

export function isPendingForcedMove(state: GameState): boolean {
  return !!state.forcedMove && !state.forcedMove.resolved;
}

export type OwnerSeat = "safe" | "watched" | "hot" | "fired";

export interface OwnerJobView {
  owner: Owner;
  posture: Posture;
  expectedWins: number;
  recentWins: number | null;
  seasonsWithGm: number;
  margin: number;
  bar: number;
  weightedWins: number;
  firingEnabled: boolean;
  wouldFire: boolean;
  seat: OwnerSeat;
  line: string;
}

export interface OwnerJudgment {
  margin: number;
  bar: number;
  weightedWins: number;
  wouldFire: boolean;
  seat: OwnerSeat;
  seasons: number;
  rebuildRunway: boolean;
}

/**
 * Bar in wins. Expectation picks 8.5 / 7.5 / 7.0. Patience moves it by
 * `−4 × (patience − 0.55)`. A coach hired into a rebuild gets 1.0 off
 * at the two-year review only (`rebuildRunway`).
 */
export function ownerBar(expectedWins: number, patience: number, rebuildRunway: boolean): number {
  const base =
    expectedWins >= OWNER_WIN_TARGET.contend ? 8.5 :
    expectedWins >= OWNER_WIN_TARGET.retool ? 7.5 :
    7.0;
  const bar = base - 4 * (patience - TYPICAL_PATIENCE);
  return rebuildRunway ? bar - 1 : bar;
}

/** 60% of the newest season, 40% of the one before. A single season is itself. */
export function weightedWins(tenureSeasons: readonly number[]): number {
  const n = tenureSeasons.length;
  if (n === 0) return 0;
  if (n === 1) return tenureSeasons[0];
  const newer = tenureSeasons[n - 1];
  const older = tenureSeasons[n - 2];
  return newer * 0.6 + older * 0.4;
}

function oneAndDoneBar(patience: number): number {
  return OWNER_ONE_AND_DONE_WINS - 4 * (patience - TYPICAL_PATIENCE);
}

function seatFor(margin: number): OwnerSeat {
  if (margin <= 0) return "fired";
  if (margin <= 1) return "hot";
  if (margin <= 2.5) return "watched";
  return "safe";
}

/**
 * Pure firing read. `tenureSeasons` is wins (ties as half) oldest-first,
 * only seasons under this coach or GM. `expectedWins` is parallel; the
 * bar uses the newest. Rebuild runway applies only when the tenure is
 * exactly two seasons and the first of them was a rebuild target.
 * A single season whose expected wins are the rebuild target does not
 * fire (Matt SIGNED 2026-10-09).
 */
export function ownerJudgment(
  patience: number,
  tenureSeasons: readonly number[],
  expectedWins: readonly number[],
  firingEnabled: boolean,
): OwnerJudgment {
  const seasons = tenureSeasons.length;
  if (seasons < OWNER_MIN_SEASONS) {
    const bar = oneAndDoneBar(patience);
    if (seasons === 0) {
      return {
        margin: 0,
        bar,
        weightedWins: 0,
        wouldFire: false,
        seat: "safe",
        seasons: 0,
        rebuildRunway: false,
      };
    }
    const w = weightedWins(tenureSeasons);
    const margin = w - bar;
    const seasonExpected = expectedWins.length
      ? expectedWins[Math.min(expectedWins.length, seasons) - 1]
      : undefined;
    // Rebuild target (6): the one-and-done clause does not fire.
    const rebuildSeason = seasonExpected === OWNER_WIN_TARGET.rebuild;
    return {
      margin,
      bar,
      weightedWins: w,
      wouldFire: firingEnabled && margin <= 0 && !rebuildSeason,
      seat: seatFor(margin),
      seasons,
      rebuildRunway: false,
    };
  }

  const newest = expectedWins.length
    ? expectedWins[Math.min(expectedWins.length, seasons) - 1]
    : OWNER_WIN_TARGET.retool;
  const rebuildRunway = seasons === 2 && expectedWins[0] === OWNER_WIN_TARGET.rebuild;
  const bar = ownerBar(newest, patience, rebuildRunway);
  const w = weightedWins(tenureSeasons);
  const margin = w - bar;
  return {
    margin,
    bar,
    weightedWins: w,
    wouldFire: firingEnabled && margin <= 0,
    seat: seatFor(margin),
    seasons,
    rebuildRunway,
  };
}

interface TenureRow {
  season: number;
  wins: number;
  expectedWins: number;
}

/** Completed seasons at or after `sinceSeason`, oldest first. */
export function tenureRows(state: GameState, teamId: number, sinceSeason: number): TenureRow[] {
  const fallback = OWNER_WIN_TARGET[teamOutlook(state, teamId).posture];
  const rows: TenureRow[] = [];
  for (const year of state.history) {
    if (year.season < sinceSeason) continue;
    const row = year.standings.find((r) => r.teamId === teamId);
    if (!row) continue;
    rows.push({
      season: year.season,
      wins: row.w + row.t * 0.5,
      expectedWins: row.expectedWins ?? fallback,
    });
  }
  rows.sort((a, b) => a.season - b.season);
  return rows;
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

function postureOf(expected: number): Posture {
  if (expected >= OWNER_WIN_TARGET.contend) return "contend";
  if (expected >= OWNER_WIN_TARGET.retool) return "retool";
  return "rebuild";
}

/**
 * Lock this year's win target from the preseason outlook. Call when
 * `phase` is preseason and this year's games are not on the state yet,
 * so `teamOutlook` reads last year's archived record.
 */
export function stampSeasonExpectedWins(state: GameState): void {
  for (const team of state.teams) {
    const { posture } = teamOutlook(state, team.id);
    team.seasonExpectedWins = OWNER_WIN_TARGET[posture];
  }
}

export function ownerJobView(state: GameState, teamId: number): OwnerJobView | null {
  const team = state.teams[teamId];
  if (!team?.owner) return null;
  const outlook = teamOutlook(state, teamId);
  const rows = tenureRows(state, teamId, gmHiredSeasonOf(state, teamId));
  const firingEnabled = state.settings?.firingEnabled ?? true;
  const judged = ownerJudgment(
    team.owner.patience,
    rows.map((r) => r.wins),
    rows.map((r) => r.expectedWins),
    firingEnabled,
  );
  const expectedWins = rows.length
    ? rows[rows.length - 1].expectedWins
    : OWNER_WIN_TARGET[outlook.posture];
  const posture = rows.length ? postureOf(expectedWins) : outlook.posture;
  const recentWins = lastSeasonWins(state, teamId);

  const patienceWord =
    team.owner.patience >= 0.68 ? "patient" : team.owner.patience <= 0.42 ? "impatient" : "typical";
  const counted =
    judged.seasons === 0
      ? "No completed season is being counted yet."
      : judged.seasons === 1
        ? "He is counting this season alone."
        : "He is counting the last two seasons, weighted 60/40.";
  const runway = judged.rebuildRunway ? " Hired into a rebuild, so the bar is a win lower." : "";

  let line: string;
  if (!firingEnabled) {
    line = `Firing is off — the chair is guaranteed, whatever the record. ${counted}`;
  } else if (judged.wouldFire) {
    line = `${team.owner.name} has seen enough. ${counted}${runway} The season is over — take an open chair or retire the save.`;
  } else if (judged.seasons < OWNER_MIN_SEASONS) {
    line = `${team.owner.name} is ${patienceWord}. ${counted} One-and-done is ${judged.bar.toFixed(1)} wins or fewer.`;
  } else {
    line = `${team.owner.name} is ${patienceWord}. ${counted} The bar is ${judged.bar.toFixed(1)}.${runway}`;
  }

  return {
    owner: team.owner,
    posture,
    expectedWins,
    recentWins,
    seasonsWithGm: judged.seasons,
    margin: judged.margin,
    bar: judged.bar,
    weightedWins: judged.weightedWins,
    firingEnabled,
    wouldFire: judged.wouldFire,
    seat: judged.seat,
    line,
  };
}

function nextSeasonCoaching(state: GameState): number {
  if (
    state.phase === "offseason-recap" ||
    state.phase === "offseason-tag" ||
    state.phase === "offseason-fa" ||
    state.phase === "offseason-draft"
  ) {
    return state.season + 1;
  }
  return state.season;
}

function worstCpuChairs(state: GameState, n: number): number[] {
  const rows = state.history[state.history.length - 1]?.standings ?? [];
  return rows
    .filter((r) => r.teamId !== state.userTeamId)
    .slice()
    .sort((a, b) => (a.w + a.t * 0.5) - (b.w + b.t * 0.5) || a.teamId - b.teamId)
    .slice(0, n)
    .map((r) => r.teamId);
}

/** CPU clubs whose owner would have fired that GM — open chairs for a forced move. */
export function openGmChairs(state: GameState): number[] {
  const chairs: number[] = [];
  for (const team of state.teams) {
    if (team.id === state.userTeamId) continue;
    const job = ownerJobView(state, team.id);
    if (job?.wouldFire) chairs.push(team.id);
  }
  if (chairs.length > 0) return chairs.sort((a, b) => a - b);
  return worstCpuChairs(state, 3);
}

/**
 * After recap history is written: if the user's owner has had enough,
 * end the season for the user and offer open CPU chairs. Not game over.
 * Same `wouldFire` as a CPU head coach in term.
 */
export function applyUserGmFiring(state: GameState): ForcedMove | null {
  if (isPendingForcedMove(state)) return state.forcedMove ?? null;
  const job = ownerJobView(state, state.userTeamId);
  if (!job?.wouldFire) return null;
  const from = state.teams[state.userTeamId];
  const openChairs = openGmChairs(state);
  state.forcedMove = {
    fromTeamId: state.userTeamId,
    season: state.season,
    openChairs,
  };
  state.log.push({
    season: state.season,
    week: state.week,
    kind: "milestone",
    text: `${from.owner?.name ?? "The owner"} fired the ${from.city} ${from.name} general manager. The season is over — take an open chair or retire.`,
  });
  return state.forcedMove;
}

export function acceptGmChair(
  state: GameState, teamId: number,
): { ok: boolean; reason?: string } {
  if (!isPendingForcedMove(state)) {
    return { ok: false, reason: "You still have a chair." };
  }
  if (state.forcedMove!.retired) {
    return { ok: false, reason: "This franchise has already retired." };
  }
  if (!state.forcedMove!.openChairs.includes(teamId)) {
    return { ok: false, reason: "That chair is not open." };
  }
  const team = state.teams[teamId];
  if (!team) return { ok: false, reason: "No such club." };
  const start = nextSeasonCoaching(state);
  state.userTeamId = teamId;
  team.gmHiredSeason = start;
  team.forcedRebuildUntil = start + 1;
  state.forcedMove!.resolved = true;
  state.forcedMove!.toTeamId = teamId;
  state.log.push({
    season: state.season,
    week: state.week,
    kind: "milestone",
    text: `Hired as general manager of the ${team.city} ${team.name}. Rebuild clock starts; patience is ${team.owner?.name ?? "the new owner"}'s.`,
  });
  return { ok: true };
}

export function retireFromLeague(state: GameState): { ok: boolean; reason?: string } {
  if (!isPendingForcedMove(state)) {
    return { ok: false, reason: "You still have a chair." };
  }
  state.forcedMove!.resolved = true;
  state.forcedMove!.retired = true;
  const from = state.teams[state.forcedMove!.fromTeamId];
  state.log.push({
    season: state.season,
    week: state.week,
    kind: "milestone",
    text: `Retired from the ${from.city} ${from.name} chair. The save remains.`,
  });
  return { ok: true };
}
