import { campusForty, isFutureProspect } from "../core/futureClass";
import { consensusGrade, gradeContext, slotShade } from "../core/scouting-reports";
import { calendarView, windowCeiling, windowFloor } from "../core/scouting";
import {
  CombineMetric,
  GameState,
  Player,
  Position,
  SCOUTING_WINDOWS,
  ScoutingWindow,
} from "../core/types";

/**
 * Public athletic testing. Display only.
 *
 * The sheet on the prospect is generated with the profile. This module
 * decides which of those numbers are on the board, and it never feeds a
 * CPU read. Campus forty is the #146 hand time. Combine invites are the
 * consensus shade through Priority UDFA — the line `slotShade` already
 * draws before "Camp invite" — not a new draw and not an NFL cutoff.
 * A blank on the verified sheet is a drill he did not run.
 */

export type TestingEra = "campus" | "combine" | "proDay";

export type ClassTestingPhase = "before" | "combine" | "after";

const DRILLS: {
  id: CombineMetric;
  label: string;
  higher: boolean;
  format: (n: number) => string;
  board: (n: number) => string;
}[] = [
  { id: "forty", label: "40-yard", higher: false, format: (n) => `${n.toFixed(2)}s`, board: (n) => n.toFixed(2) },
  { id: "tenSplit", label: "10-yd split", higher: false, format: (n) => `${n.toFixed(2)}s`, board: (n) => n.toFixed(2) },
  { id: "vertical", label: "Vertical", higher: true, format: (n) => `${n}"`, board: (n) => String(n) },
  { id: "broad", label: "Broad", higher: true, format: broadLabel, board: (n) => String(Math.round(n)) },
  { id: "threeCone", label: "3-cone", higher: false, format: (n) => `${n.toFixed(2)}s`, board: (n) => n.toFixed(2) },
  { id: "shortShuttle", label: "Shuttle", higher: false, format: (n) => `${n.toFixed(2)}s`, board: (n) => n.toFixed(2) },
  { id: "bench", label: "Bench", higher: true, format: (n) => `${n} reps`, board: (n) => String(n) },
];

function windowIndex(w: ScoutingWindow): number {
  return SCOUTING_WINDOWS.indexOf(w);
}

/** The window the calendar is in, including the phase floor, without writing the save. */
function clampedWindow(state: GameState): ScoutingWindow {
  const floor = windowFloor(state);
  const ceil = windowCeiling(state);
  let w = calendarView(state).window;
  if (windowIndex(w) < windowIndex(floor)) w = floor;
  if (windowIndex(w) > windowIndex(ceil)) w = ceil;
  return w;
}

/** Where this class is on the public testing calendar. */
export function testingPhase(state: GameState, season: number): ClassTestingPhase {
  if (season > state.season) return "before";
  if (season < state.season) return "after";
  const w = clampedWindow(state);
  if (windowIndex(w) < windowIndex("combine")) return "before";
  if (windowIndex(w) < windowIndex("proDays")) return "combine";
  return "after";
}

function eraOf(phase: ClassTestingPhase, invited: boolean): TestingEra {
  if (phase === "before" || (phase === "combine" && !invited)) return "campus";
  if (invited) return "combine";
  return "proDay";
}

export function eraLabel(era: TestingEra): string {
  if (era === "combine") return "Combine";
  if (era === "proDay") return "Pro day";
  return "Campus";
}

export function ordinal(n: number): string {
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  switch (n % 10) {
    case 1: return `${n}st`;
    case 2: return `${n}nd`;
    case 3: return `${n}rd`;
    default: return `${n}th`;
  }
}

function broadLabel(inches: number): string {
  const n = Math.round(inches);
  return `${Math.floor(n / 12)}'${n % 12}"`;
}

export function prospectSize(p: Player): string {
  const profile = p.profile;
  if (!profile) return "—";
  const ft = Math.floor(profile.heightIn / 12);
  const inch = profile.heightIn % 12;
  return `${ft}'${inch}" · ${profile.weightLb} lb`;
}

function classProspects(state: GameState, season: number): Player[] {
  return state.players.filter(
    (p) => p.prospect && !p.retired && !!p.profile && p.draftClassSeason === season,
  );
}

export interface AthleticClass {
  season: number;
  phase: ClassTestingPhase;
  invite: ReadonlySet<number>;
  /** `${playerId}|${drill}` → percentile, higher meaning a better result. */
  pct: ReadonlyMap<string, number>;
}

function inviteSet(state: GameState, pool: Player[]): Set<number> {
  const ctx = gradeContext(state, pool);
  const ids = new Set<number>();
  for (const p of pool) {
    if (slotShade(consensusGrade(state, p, ctx).slot) !== "Camp invite") ids.add(p.id);
  }
  return ids;
}

interface Sample {
  id: number;
  drill: CombineMetric;
  source: "campus" | "verified";
  value: number;
}

function publishedValue(
  p: Player,
  phase: ClassTestingPhase,
  invited: boolean,
  drill: CombineMetric,
): { source: "campus" | "verified"; value: number | null } | null {
  const era = eraOf(phase, invited);
  if (era === "campus") {
    if (drill !== "forty") return null;
    return { source: "campus", value: campusForty(p) };
  }
  const raw = p.profile?.combine[drill];
  return { source: "verified", value: raw ?? null };
}

/** Percent of this group with a worse or equal result. Best is 100. */
function percentile(value: number, values: number[], higherBetter: boolean): number | null {
  const n = values.length;
  if (n < 2) return null;
  let atLeastAsGood = 0;
  for (const v of values) {
    if (higherBetter ? value >= v : value <= v) atLeastAsGood++;
  }
  return Math.round((100 * atLeastAsGood) / n);
}

/**
 * One pass over the class. Consensus rank decides the invite list.
 * Percentiles compare a public number only to the same clock at the
 * same position — a campus forty is not ranked against a combine forty.
 */
export function athleticClass(state: GameState, season: number): AthleticClass {
  const pool = classProspects(state, season);
  const phase = testingPhase(state, season);
  const invite = inviteSet(state, pool);
  const groups = new Map<string, Sample[]>();
  for (const p of pool) {
    const invited = invite.has(p.id);
    for (const drill of DRILLS) {
      const pub = publishedValue(p, phase, invited, drill.id);
      if (!pub || pub.value == null) continue;
      const key = `${p.pos}|${drill.id}|${pub.source}`;
      const list = groups.get(key);
      const sample: Sample = { id: p.id, drill: drill.id, source: pub.source, value: pub.value };
      if (list) list.push(sample);
      else groups.set(key, [sample]);
    }
  }
  const pct = new Map<string, number>();
  for (const list of groups.values()) {
    const spec = DRILLS.find((d) => d.id === list[0].drill)!;
    const values = list.map((s) => s.value);
    for (const sample of list) {
      const rank = percentile(sample.value, values, spec.higher);
      if (rank != null) pct.set(`${sample.id}|${sample.drill}`, rank);
    }
  }
  return { season, phase, invite, pct };
}

export interface DrillRead {
  /** Bare number (`4.52`, `33`, `22`), or null when nothing is public. */
  text: string | null;
  skipped: boolean;
  percentile: number | null;
}

export interface AthleticSheet {
  era: TestingEra;
  eraLabel: string;
  size: string;
  forty: DrillRead;
  bench: DrillRead;
  vertical: DrillRead;
  rows: { label: string; value: string; percentile: number | null }[];
}

function emptyRead(): DrillRead {
  return { text: null, skipped: false, percentile: null };
}

function campusSheet(p: Player): AthleticSheet {
  const forty = campusForty(p);
  const read: DrillRead = {
    text: forty != null ? forty.toFixed(2) : null,
    skipped: false,
    percentile: null,
  };
  const rows = [{ label: "Ht / Wt", value: prospectSize(p), percentile: null }];
  if (read.text != null) rows.push({ label: "40-yard", value: `${read.text}s`, percentile: null });
  return {
    era: "campus",
    eraLabel: eraLabel("campus"),
    size: prospectSize(p),
    forty: read,
    bench: emptyRead(),
    vertical: emptyRead(),
    rows,
  };
}

function drillRead(
  p: Player,
  ax: AthleticClass,
  invited: boolean,
  id: CombineMetric,
): DrillRead {
  const spec = DRILLS.find((d) => d.id === id)!;
  const pub = publishedValue(p, ax.phase, invited, id);
  if (!pub) return emptyRead();
  if (pub.value == null) return { text: null, skipped: pub.source === "verified", percentile: null };
  return {
    text: spec.board(pub.value),
    skipped: false,
    percentile: ax.pct.get(`${p.id}|${id}`) ?? null,
  };
}

/** Public sheet for one prospect. A future class is campus forty only. */
export function athleticSheet(state: GameState, p: Player, prepared?: AthleticClass): AthleticSheet {
  const season = p.draftClassSeason ?? state.season;
  if (!p.profile || isFutureProspect(state, p) || season > state.season) return campusSheet(p);
  const ax = prepared && prepared.season === season ? prepared : athleticClass(state, season);
  const invited = ax.invite.has(p.id);
  const era = eraOf(ax.phase, invited);
  const forty = drillRead(p, ax, invited, "forty");
  const bench = drillRead(p, ax, invited, "bench");
  const vertical = drillRead(p, ax, invited, "vertical");
  const rows: AthleticSheet["rows"] = [{ label: "Ht / Wt", value: prospectSize(p), percentile: null }];
  const shown = era === "campus" ? DRILLS.filter((d) => d.id === "forty") : DRILLS;
  for (const spec of shown) {
    const read =
      spec.id === "forty" ? forty
      : spec.id === "bench" ? bench
      : spec.id === "vertical" ? vertical
      : drillRead(p, ax, invited, spec.id);
    if (era === "campus" && read.text == null) continue;
    rows.push({
      label: spec.label,
      value: rowValue(p, spec, read, era),
      percentile: read.percentile,
    });
  }
  return {
    era,
    eraLabel: eraLabel(era),
    size: prospectSize(p),
    forty,
    bench,
    vertical,
    rows,
  };
}

function rowValue(
  p: Player,
  spec: (typeof DRILLS)[number],
  read: DrillRead,
  era: TestingEra,
): string {
  if (read.text == null) return "—";
  if (era === "campus") return `${read.text}s`;
  const raw = p.profile?.combine[spec.id];
  if (raw == null) return "—";
  return spec.format(raw);
}

export interface BoardTesting {
  size: string;
  forty: string;
  fortyPct: string | null;
  fortyTitle: string;
  bench: string;
  benchPct: string | null;
  benchTitle: string;
  vertical: string;
  verticalPct: string | null;
  verticalTitle: string;
}

function cellTitle(era: TestingEra, label: string, pos: Position, read: DrillRead): string {
  const clock = eraLabel(era);
  if (read.skipped) return `${clock} — did not run the ${label.toLowerCase()}`;
  if (read.text == null) return clock;
  if (read.percentile == null) return `${clock} ${label.toLowerCase()}`;
  return `${clock} ${label.toLowerCase()}, ${ordinal(read.percentile)} percentile at ${pos} in this class`;
}

function cellText(read: DrillRead, decorate: (text: string) => string): string {
  if (read.text == null) return "—";
  return decorate(read.text);
}

/** Board columns: size, forty, bench, vertical, and the class percentile. */
export function boardTesting(sheet: AthleticSheet, pos: Position): BoardTesting {
  return {
    size: sheet.size,
    forty: cellText(sheet.forty, (t) => `${t}s`),
    fortyPct: sheet.forty.percentile != null ? ordinal(sheet.forty.percentile) : null,
    fortyTitle: cellTitle(sheet.era, "40-yard", pos, sheet.forty),
    bench: cellText(sheet.bench, (t) => t),
    benchPct: sheet.bench.percentile != null ? ordinal(sheet.bench.percentile) : null,
    benchTitle: cellTitle(sheet.era, "Bench", pos, sheet.bench),
    vertical: cellText(sheet.vertical, (t) => `${t}"`),
    verticalPct: sheet.vertical.percentile != null ? ordinal(sheet.vertical.percentile) : null,
    verticalTitle: cellTitle(sheet.era, "Vertical", pos, sheet.vertical),
  };
}
