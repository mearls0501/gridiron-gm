import { writeDraftClass, generateDraftClass, initialScoutingPass } from "./offseason/draft";
import { playerName, refreshOvr, relevantAttrs } from "./ratings";
import { consensusGrade, gradeContext } from "./scouting-reports";
import { Rng, clamp } from "./rng";
import {
  GameState,
  PICK_HORIZON,
  Player,
  Position,
  ProspectPipeline,
  REGULAR_SEASON_WEEKS,
  RiskGrade,
} from "./types";

/**
 * Future draft classes.
 *
 * The class the user scouts this year is still born the old way: one
 * parent draw at new game, and again at rollover when nothing is waiting.
 * Classes further out are born on a child stream keyed by
 * (seed, class season, "futureClass") and live on `state.players` with
 * a later `draftClassSeason`. Injuries and early declarations happen
 * on a per-player child stream. When the calendar rolls, that class is
 * the one that opens — not a fresh roll — and the parent still spends
 * the same two draws it always spent on generation and the public pass.
 *
 * Ids sit at 1_000_000 and up so `nextPlayerId` (street signings) does
 * not move. True `ceiling` is never written into a note.
 */

/** First id handed to a future-class prospect. */
export const FUTURE_ID_BASE = 1_000_000;

/**
 * Proposed defaults. Not an NFL rate — nfl-reference.md §4.
 * Spread across the 18-week regular season. A future class is not
 * scoutable; these only change who is in it later.
 */
export const FUTURE_CLASS_RATES = {
  injuryPerWeek: 0.045 / REGULAR_SEASON_WEEKS,
  knockoutGivenInjury: 0.12,
  declarePerWeek: 0.08 / REGULAR_SEASON_WEEKS,
  returnPerWeek: 0.05 / REGULAR_SEASON_WEEKS,
} as const;

const RISK_ORDER: RiskGrade[] = ["clean", "minor", "moderate", "major"];
const INJURY_PARTS = ["Knee", "Shoulder", "Ankle", "Hamstring", "Foot"] as const;

function childRng(seed: number, season: number, week: number, tag: string): Rng {
  let h = seed >>> 0;
  h = Math.imul(h ^ season, 0x9e3779b9);
  h = Math.imul(h ^ (week + 1), 0x85ebca6b);
  for (let i = 0; i < tag.length; i++) h = Math.imul(h ^ tag.charCodeAt(i), 0xc2b2ae35);
  return new Rng((h >>> 0) || 0x9e3779b9);
}

function futureId(state: GameState): number {
  const id = state.nextFuturePlayerId ?? FUTURE_ID_BASE;
  state.nextFuturePlayerId = id + 1;
  return id;
}

function pipelineOf(p: Player): ProspectPipeline {
  if (!p.pipeline) p.pipeline = { notes: [] };
  return p.pipeline;
}

function pushNote(p: Player, text: string): void {
  const pipe = pipelineOf(p);
  pipe.notes = [...pipe.notes, text].slice(-6);
}

export function isFutureProspect(state: GameState, p: Player): boolean {
  return !!p.prospect && !p.retired && p.draftClassSeason != null && p.draftClassSeason > state.season;
}

export function isCurrentProspect(state: GameState, p: Player): boolean {
  return !!p.prospect && !p.retired && (p.draftClassSeason ?? state.season) === state.season;
}

function boardExists(state: GameState, season: number): boolean {
  return state.players.some(
    (p) => p.prospect && !p.retired && p.draftClassSeason === season && !p.pipeline?.camp,
  );
}

/** Fill any missing class inside the pick horizon. No parent draw. */
export function ensureFutureClasses(state: GameState): void {
  for (let ahead = 1; ahead < PICK_HORIZON; ahead++) {
    const season = state.season + ahead;
    if (boardExists(state, season)) continue;
    const rng = childRng(state.seed, season, 0, "futureClass");
    writeDraftClass(state, rng, season, {
      board: true,
      camp: false,
      nextId: () => futureId(state),
    });
  }
}

function worsen(grade: RiskGrade): RiskGrade {
  const i = RISK_ORDER.indexOf(grade);
  return RISK_ORDER[Math.min(RISK_ORDER.length - 1, Math.max(0, i) + 1)];
}

function logLine(state: GameState, week: number, p: Player, kind: "injury" | "system", text: string): void {
  state.log.push({
    season: state.season,
    week,
    kind,
    text: `${playerName(p)} (${p.pos}, ${p.draftClassSeason} class): ${text}`,
    playerId: p.id,
  });
}

function applyInjury(state: GameState, p: Player, rng: Rng, week: number): void {
  const pipe = pipelineOf(p);
  if (pipe.injurySeason === state.season) return;
  if (!rng.chance(FUTURE_CLASS_RATES.injuryPerWeek)) return;
  pipe.injurySeason = state.season;
  const part = rng.pick(INJURY_PARTS);
  const out = rng.chance(FUTURE_CLASS_RATES.knockoutGivenInjury);
  if (p.profile) p.profile.medicalRisk = worsen(p.profile.medicalRisk);
  p.durability = clamp(p.durability - rng.int(6, 14), 1, 99);
  const keys = relevantAttrs(p.pos);
  if (keys.length > 0) {
    const key = rng.pick(keys);
    p.attrs[key] = clamp(p.attrs[key] - rng.int(2, 5), 20, 99);
    refreshOvr(p);
  }
  if (out) {
    const text = `${part} injury — out of the draft.`;
    pushNote(p, text);
    logLine(state, week, p, "injury", text);
    p.retired = true;
    p.teamId = null;
    return;
  }
  const text = `${part} injury — the public medical file got worse.`;
  pushNote(p, text);
  logLine(state, week, p, "injury", text);
}

function underclass(p: Player): boolean {
  const y = p.profile?.classYear;
  return y === "SO" || y === "JR";
}

function applyMove(state: GameState, p: Player, rng: Rng, week: number): void {
  if (p.retired || p.draftClassSeason == null) return;
  const pipe = pipelineOf(p);
  if (pipe.moveSeason === state.season) return;
  if (!underclass(p)) return;
  // Nearest future class can go back to school. Farther classes can
  // declare. Neither move is allowed to enter the class being scouted.
  if (p.draftClassSeason === state.season + 1) {
    if (!rng.chance(FUTURE_CLASS_RATES.returnPerWeek)) return;
    pipe.moveSeason = state.season;
    p.draftClassSeason += 1;
    const text = `Staying in school. Now in the ${p.draftClassSeason} class.`;
    pushNote(p, text);
    logLine(state, week, p, "system", text);
    return;
  }
  if (p.draftClassSeason >= state.season + 2) {
    if (!rng.chance(FUTURE_CLASS_RATES.declarePerWeek)) return;
    pipe.moveSeason = state.season;
    p.draftClassSeason -= 1;
    const text = `Declared early. Now in the ${p.draftClassSeason} class.`;
    pushNote(p, text);
    logLine(state, week, p, "system", text);
  }
}

function applyWeek(state: GameState, week: number): void {
  const pool = state.players
    .filter((p) => isFutureProspect(state, p) && !p.pipeline?.camp)
    .sort((a, b) => a.id - b.id);
  for (const p of pool) {
    const rng = childRng(state.seed, state.season, week, `futureClass:${p.id}`);
    applyInjury(state, p, rng, week);
    applyMove(state, p, rng, week);
  }
}

/**
 * Resolve one regular-season week of college news. No parent draw.
 * A second call for the same week does nothing.
 */
export function tickFutureClasses(state: GameState, week = state.week): void {
  if (week < 1) return;
  const tick = state.futureClassTick;
  if (tick && tick.season === state.season && tick.week >= week) return;
  ensureFutureClasses(state);
  applyWeek(state, week);
  state.futureClassTick = { season: state.season, week };
}

/**
 * Old saves missed the weeks already played. Catch those up without
 * touching the week that has not been simulated yet, and without
 * reading the parent RNG.
 */
export function catchUpFutureClasses(state: GameState): void {
  ensureFutureClasses(state);
  const last =
    state.phase === "regular"
      ? Math.max(0, state.week - 1)
      : state.phase === "preseason"
        ? 0
        : REGULAR_SEASON_WEEKS;
  for (let w = 1; w <= last; w++) tickFutureClasses(state, w);
}

function campExists(state: GameState, season: number): boolean {
  return state.players.some(
    (p) => p.prospect && p.draftClassSeason === season && p.pipeline?.camp === true,
  );
}

/**
 * Open the class for `state.season`.
 *
 * A living board (seeded while it was still in the future) is kept.
 * The parent spends the same two integers `generateDraftClass` and
 * `initialScoutingPass` always spent, then the public 12% pass runs
 * on whoever is actually in the class. Camp bodies, which were never
 * on the future board, are added on a child stream.
 *
 * No living board — a new game, or a save from before this pipeline —
 * falls through to the old generator.
 */
export function promoteDraftClass(state: GameState, parent: Rng): void {
  const season = state.season;
  if (!boardExists(state, season)) {
    generateDraftClass(state, parent, season);
    initialScoutingPass(state, season, parent);
    return;
  }
  parent.int(1, 0x7ffffffe);
  if (!campExists(state, season)) {
    const rng = childRng(state.seed, season, 0, "futureCamp");
    writeDraftClass(state, rng, season, {
      board: false,
      camp: true,
      markCamp: true,
      nextId: () => futureId(state),
    });
  }
  initialScoutingPass(state, season, parent);
}

export interface FutureClassRow {
  id: number;
  name: string;
  pos: Position;
  college: string;
  classYear: string;
  size: string;
  forty: string | null;
  consensus: string;
  slot: number;
  notes: string[];
}

export function futureSeasons(state: GameState): number[] {
  const out: number[] = [];
  for (let ahead = 1; ahead < PICK_HORIZON; ahead++) out.push(state.season + ahead);
  return out;
}

function classYearLabel(year: string | undefined): string {
  if (year === "RS_SR") return "RS Senior";
  if (year === "SR") return "Senior";
  if (year === "JR") return "Junior";
  if (year === "SO") return "Sophomore";
  return year ?? "—";
}

function sizeLabel(p: Player): string {
  const profile = p.profile;
  if (!profile) return "—";
  const ft = Math.floor(profile.heightIn / 12);
  const inch = profile.heightIn % 12;
  return `${ft}'${inch}" · ${profile.weightLb} lb`;
}

/** Public sheet for one future class. No overall, no potential, no ceiling. */
export function futureClassRows(state: GameState, season: number): FutureClassRow[] {
  const pool = state.players.filter(
    (p) => p.prospect && !p.retired && p.draftClassSeason === season && !p.pipeline?.camp,
  );
  const ctx = gradeContext(state, pool);
  const rows = pool.map((p) => {
    const grade = consensusGrade(state, p, ctx);
    const forty = p.profile?.combine.forty;
    return {
      id: p.id,
      name: playerName(p),
      pos: p.pos,
      college: p.profile?.college ?? "—",
      classYear: classYearLabel(p.profile?.classYear),
      size: sizeLabel(p),
      forty: forty != null ? forty.toFixed(2) : null,
      consensus: grade.label,
      slot: grade.slot,
      notes: p.pipeline?.notes ?? [],
    };
  });
  rows.sort((a, b) => a.slot - b.slot || a.id - b.id);
  return rows;
}

export function futureClassCounts(rows: FutureClassRow[]): {
  names: number;
  injuries: number;
  declared: number;
  returned: number;
} {
  let injuries = 0;
  let declared = 0;
  let returned = 0;
  for (const row of rows) {
    for (const note of row.notes) {
      if (note.includes("injury")) injuries++;
      else if (note.startsWith("Declared")) declared++;
      else if (note.startsWith("Staying")) returned++;
    }
  }
  return { names: rows.length, injuries, declared, returned };
}
