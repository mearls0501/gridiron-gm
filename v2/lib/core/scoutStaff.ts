import { Rng } from "./rng";
import {
  GameState,
  NamedScout,
  Player,
  Position,
  ScoutCredit,
  ScoutLean,
} from "./types";
import {
  Career,
  ROOKIE_DEAL_YEARS,
  everStar,
  fullTimeSnapBaseline,
  isBust,
  isHit,
  positionRanks,
  snapshot,
  starterSeasons,
} from "./outcomes";

/**
 * The user's college department.
 *
 * Five people: three area scouts split across the same region list the
 * class is generated from, one national scout, one college director.
 * Names, lenses, and leans are a pure hash of (seed, user club), so
 * they survive a season and a reload without a parent-stream draw.
 * CPU clubs get none of this and store no board.
 *
 * A lens is where the miss gets smaller. A lean is which way it points.
 * Neither is a tier, and nothing here has an accuracy. Quality stays
 * `scoutQuality` in scouting.ts, which is the scouting share of the
 * staff budget. At an even split that factor is 1, the class-mean lean
 * is removed, and the lens scales are normalised to unit mean square,
 * so the class-average error of a work sample matches the sample the
 * department already took.
 *
 * Lean points and the raw lens scales are design noise, not an NFL
 * rate. Ungated. See nfl-reference.md §4.
 */

/** College towns. The prospect generator picks schools from this list. */
export const COLLEGE_REGIONS = [
  "Northport", "Caldwell", "Ridgemont", "Lakewood", "Harrison", "Delmar",
  "Fairbank", "Stone Valley", "Crestline", "Weston", "Millbrook", "Ashford",
  "Kingsley", "Redmond", "Alcott", "Brier", "Dunmore", "Eastvale", "Galloway",
  "Holloway", "Ironwood", "Juniper", "Kessler", "Loxley", "Marlowe",
] as const;

/** How many names the focus list holds. */
export const FOCUS_CAP = 12;

/** Focus names the desk puts on film in one regular-season week. */
export const FOCUS_FILM_PER_WEEK = 3;

/**
 * Points a lean pulls a sample, before the class mean is subtracted.
 * Design noise. Not a scout grade.
 */
const LEAN_POINTS = 2.2;

/** National lens, before the class is normalised to unit mean square. */
const LENS_ON = 0.78;
const LENS_OFF = 1.16;

const SCOUT_FIRST = [
  "Helen", "Marcus", "Ruth", "Owen", "Claire", "Victor",
  "Nadia", "Earl", "Pauline", "Glenn", "Ida", "Seth",
];
const SCOUT_LAST = [
  "Cho", "Ivers", "Lang", "Okoye", "Pryor", "Shah",
  "Vogel", "Ward", "Yeung", "Adler", "Boone", "Crowe",
];

const POSITION_LENSES: { label: string; positions: Position[] }[] = [
  { label: "quarterbacks", positions: ["QB"] },
  { label: "skill", positions: ["RB", "WR", "TE"] },
  { label: "offensive line", positions: ["OT", "OG", "C"] },
  { label: "front seven", positions: ["EDGE", "DT", "LB"] },
  { label: "coverage", positions: ["CB", "S"] },
];

function hash32(a: number, b: number, c: number): number {
  let h = (a ^ 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ b, 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ c, 0xc2b2ae35) >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d) >>> 0;
  h ^= h >>> 15;
  return h >>> 0;
}

function leanSign(lean: ScoutLean): number {
  return lean === "high" ? 1 : -1;
}

export function leanWord(lean: ScoutLean): string {
  return lean === "high" ? "optimistic" : "cautious";
}

/** Where this scout is sharper. Regions for an area scout, a position group otherwise. */
export function lensWord(scout: NamedScout): string {
  if (scout.role === "area") return scout.regions.join(", ");
  return scout.lensLabel;
}

export function roleWord(scout: NamedScout): string {
  if (scout.role === "director") return "college director";
  if (scout.role === "national") return "national scout";
  return "area scout";
}

/** The region a school name was built from, or null. */
export function collegeRegion(college: string): string | null {
  const ordered = [...COLLEGE_REGIONS].sort((a, b) => b.length - a.length);
  for (const region of ordered) {
    if (college === region || college.startsWith(`${region} `)) return region;
  }
  return null;
}

function scoutName(seed: number, teamId: number, slot: number, used: Set<string>): string {
  let n = 0;
  for (;;) {
    const h = hash32(seed, teamId, 0x5c00 + slot * 17 + n);
    const name = `${SCOUT_FIRST[h % SCOUT_FIRST.length]} ${SCOUT_LAST[(h >>> 8) % SCOUT_LAST.length]}`;
    if (!used.has(name)) {
      used.add(name);
      return name;
    }
    n++;
  }
}

/** The five people, from the franchise hash. No draw. */
export function buildScoutStaff(seed: number, userTeamId: number): NamedScout[] {
  const used = new Set<string>();
  const rot = hash32(seed, userTeamId, 0x51a7) % COLLEGE_REGIONS.length;
  const ordered = COLLEGE_REGIONS.map((_, i) => COLLEGE_REGIONS[(i + rot) % COLLEGE_REGIONS.length]);
  const cuts = [0, 9, 17, 25];
  const leanHash = hash32(seed, userTeamId, 0x1eaf);
  const areaLeans: ScoutLean[] = [
    (leanHash & 1) !== 0 ? "high" : "low",
    (leanHash & 1) !== 0 ? "low" : "high",
    (leanHash & 2) !== 0 ? "high" : "low",
  ];
  const nationalLean: ScoutLean = (leanHash & 4) !== 0 ? "high" : "low";
  const directorLean: ScoutLean = nationalLean === "high" ? "low" : "high";
  const nIdx = hash32(seed, userTeamId, 0x10c5) % POSITION_LENSES.length;
  let dIdx = hash32(seed, userTeamId, 0x10c6) % POSITION_LENSES.length;
  if (dIdx === nIdx) dIdx = (dIdx + 1) % POSITION_LENSES.length;
  const nationalLens = POSITION_LENSES[nIdx];
  const directorLens = POSITION_LENSES[dIdx];

  const staff: NamedScout[] = [];
  for (let i = 0; i < 3; i++) {
    staff.push({
      id: `area-${i}`,
      name: scoutName(seed, userTeamId, i, used),
      role: "area",
      regions: ordered.slice(cuts[i], cuts[i + 1]),
      positions: [],
      lensLabel: "",
      lean: areaLeans[i],
    });
  }
  staff.push({
    id: "national",
    name: scoutName(seed, userTeamId, 3, used),
    role: "national",
    regions: [],
    positions: nationalLens.positions.slice(),
    lensLabel: nationalLens.label,
    lean: nationalLean,
  });
  staff.push({
    id: "director",
    name: scoutName(seed, userTeamId, 4, used),
    role: "director",
    regions: [],
    positions: directorLens.positions.slice(),
    lensLabel: directorLens.label,
    lean: directorLean,
  });
  return staff;
}

/** Stored staff, or the hash if the save has not been backfilled yet. */
export function userScouts(state: GameState): NamedScout[] {
  if (state.scoutStaff && state.scoutStaff.length === 5) return state.scoutStaff;
  return buildScoutStaff(state.seed, state.userTeamId);
}

/** Write the department onto the save once. No draw. */
export function ensureScoutStaff(state: GameState): NamedScout[] {
  if (!state.scoutStaff || state.scoutStaff.length !== 5) {
    state.scoutStaff = buildScoutStaff(state.seed, state.userTeamId);
  }
  return state.scoutStaff;
}

function findRole(staff: NamedScout[], role: NamedScout["role"]): NamedScout {
  const scout = staff.find((s) => s.role === role);
  if (!scout) throw new Error(`college department is missing its ${role}`);
  return scout;
}

/** Area scout whose regions include this school. Director if the school is unknown. */
export function coveringScout(state: GameState, p: Player): NamedScout {
  const staff = userScouts(state);
  const region = collegeRegion(p.profile?.college ?? "");
  if (region) {
    const area = staff.find((s) => s.role === "area" && s.regions.includes(region));
    if (area) return area;
  }
  return findRole(staff, "director");
}

export function nationalScout(state: GameState): NamedScout {
  return findRole(userScouts(state), "national");
}

function currentClass(state: GameState): Player[] {
  return state.players
    .filter((p) => p.prospect && !p.retired && (p.draftClassSeason ?? state.season) === state.season)
    .sort((a, b) => a.id - b.id);
}

function rawShift(staff: NamedScout[], p: Player): number {
  const region = collegeRegion(p.profile?.college ?? "");
  const area = region
    ? staff.find((s) => s.role === "area" && s.regions.includes(region))
    : undefined;
  const national = findRole(staff, "national");
  const director = findRole(staff, "director");
  let shift = 0;
  if (area) shift += leanSign(area.lean) * LEAN_POINTS;
  if (national.positions.includes(p.pos)) shift += leanSign(national.lean) * LEAN_POINTS;
  if (director.positions.includes(p.pos)) shift += leanSign(director.lean) * LEAN_POINTS;
  return shift;
}

function rawScale(staff: NamedScout[], p: Player): number {
  const national = findRole(staff, "national");
  return national.positions.includes(p.pos) ? LENS_ON : LENS_OFF;
}

/**
 * Zero-sum lean and unit-mean-square lens for one prospect.
 *
 * Sum of `shift` over the current class is 0. Mean of `scale` squared
 * over the class is 1. Callers multiply the existing error sd by
 * `scale` and, at an even budget, by `scoutQuality` === 1.
 */
export function prospectReadAdjust(state: GameState, p: Player): { shift: number; scale: number } {
  const staff = userScouts(state);
  const pool = currentClass(state);
  if (!pool.length) return { shift: 0, scale: 1 };
  let sumShift = 0;
  let sumSq = 0;
  for (const q of pool) {
    sumShift += rawShift(staff, q);
    const scale = rawScale(staff, q);
    sumSq += scale * scale;
  }
  const meanShift = sumShift / pool.length;
  const rms = Math.sqrt(sumSq / pool.length) || 1;
  return {
    shift: rawShift(staff, p) - meanShift,
    scale: rawScale(staff, p) / rms,
  };
}

/**
 * Credit a pick the user's club just made. CPU picks are not passed here.
 * The director is on every user pick. The area scout is on his region.
 * The national scout is on his position lens only.
 */
export function creditUserDraft(state: GameState, p: Player, round: number): void {
  const staff = ensureScoutStaff(state);
  const ids: string[] = [];
  const region = collegeRegion(p.profile?.college ?? "");
  const area = region
    ? staff.find((s) => s.role === "area" && s.regions.includes(region))
    : undefined;
  if (area) ids.push(area.id);
  const national = findRole(staff, "national");
  if (national.positions.includes(p.pos)) ids.push(national.id);
  ids.push(findRole(staff, "director").id);
  const list = state.scoutCredits ?? [];
  if (list.some((c) => c.playerId === p.id)) return;
  const row: ScoutCredit = { playerId: p.id, season: state.season, round, scoutIds: ids };
  list.push(row);
  state.scoutCredits = list;
}

/** Derived. Not stored. Never a rating. */
export interface ScoutRecord {
  scoutId: string;
  drafted: number;
  hits: number;
  busts: number;
  starterSeasons: number;
  stars: number;
}

function careerOf(
  state: GameState,
  p: Player,
  credit: ScoutCredit,
  baselines: Map<number, ReturnType<typeof fullTimeSnapBaseline>>,
  ranks: Map<number, Map<number, number>>,
): Career {
  const draftSeason = p.draftClassSeason ?? credit.season;
  const seasons = [];
  for (let y = draftSeason; y < state.season; y++) {
    const baseline = baselines.get(y);
    const rank = ranks.get(y);
    if (!baseline || !rank) continue;
    seasons.push(snapshot(p, y, draftSeason, baseline, rank));
  }
  return {
    playerId: p.id,
    pos: p.pos,
    round: p.draftedRound,
    pick: p.draftedPick,
    draftSeason,
    draftAge: p.age,
    trueOvrAtDraft: 0,
    truePotAtDraft: 0,
    draftTeamId: state.userTeamId,
    seasons,
    retiredSeason: p.retired ? state.season : null,
    secondContract: "unresolved",
  };
}

/**
 * Hits, busts, and starter seasons from `outcomes.ts`.
 * Star years are counted the same way and are not a rating.
 * A bust is withheld until the four-year window has closed.
 */
export function scoutRecords(state: GameState): ScoutRecord[] {
  const staff = userScouts(state);
  const credits = state.scoutCredits ?? [];
  const byId = new Map(state.players.map((p) => [p.id, p]));
  const years = new Set<number>();
  for (const c of credits) {
    const p = byId.get(c.playerId);
    const draftSeason = p?.draftClassSeason ?? c.season;
    for (let y = draftSeason; y < state.season; y++) years.add(y);
  }
  const baselines = new Map<number, ReturnType<typeof fullTimeSnapBaseline>>();
  const ranks = new Map<number, Map<number, number>>();
  for (const y of years) {
    baselines.set(y, fullTimeSnapBaseline(state, y));
    ranks.set(y, positionRanks(state, y));
  }
  return staff.map((scout) => {
    let drafted = 0;
    let hits = 0;
    let busts = 0;
    let starters = 0;
    let stars = 0;
    for (const credit of credits) {
      if (!credit.scoutIds.includes(scout.id)) continue;
      drafted++;
      const p = byId.get(credit.playerId);
      if (!p) continue;
      const career = careerOf(state, p, credit, baselines, ranks);
      if (isHit(career)) hits++;
      const closed = state.season >= credit.season + ROOKIE_DEAL_YEARS || p.retired;
      if (closed && isBust(career)) busts++;
      starters += starterSeasons(career);
      if (everStar(career)) stars++;
    }
    return { scoutId: scout.id, drafted, hits, busts, starterSeasons: starters, stars };
  });
}

/** One line for the staff page. No rating, no accuracy. */
export function scoutRecordText(record: ScoutRecord): string {
  if (record.drafted === 0) return "No draft picks on file.";
  if (record.hits === 0 && record.busts === 0 && record.starterSeasons === 0 && record.stars === 0) {
    return `${record.drafted} drafted. Too early to call a hit or a bust.`;
  }
  const hit = `${record.hits} hit${record.hits === 1 ? "" : "s"}`;
  const bust = `${record.busts} bust${record.busts === 1 ? "" : "s"}`;
  const starter = `${record.starterSeasons} starter season${record.starterSeasons === 1 ? "" : "s"}`;
  return `${record.drafted} drafted · ${hit} · ${bust} · ${starter}`;
}

/** Child stream. Same shape as the future-class week stream. */
export function focusChildRng(seed: number, season: number, week: number, tag: string): Rng {
  let h = seed >>> 0;
  h = Math.imul(h ^ season, 0x9e3779b9);
  h = Math.imul(h ^ (week + 1), 0x85ebca6b);
  for (let i = 0; i < tag.length; i++) h = Math.imul(h ^ tag.charCodeAt(i), 0xc2b2ae35);
  return new Rng((h >>> 0) || 0x9e3779b9);
}

export function focusPickRng(state: GameState, week: number): Rng {
  return focusChildRng(state.seed, state.season, week, "focusFilm");
}

export function focusStudyRng(state: GameState, week: number, playerId: number): Rng {
  return focusChildRng(state.seed, state.season, week, `focusFilm:${playerId}`);
}

/**
 * Hub copy for the week just played. Empty when the desk watched nobody.
 * Past tense. Not a list of work to do.
 */
export function focusFilmLines(state: GameState): { week: number; playerId: number; text: string }[] {
  const log = state.scouting?.focusFilm;
  if (!log || log.season !== state.season || log.week !== state.week - 1 || log.lines.length === 0) return [];
  const staff = userScouts(state);
  return log.lines.map((line) => {
    const p = state.players.find((x) => x.id === line.playerId);
    const scout = staff.find((s) => s.id === line.scoutId);
    const who = p ? `${p.firstName} ${p.lastName} (${p.pos})` : "a prospect";
    const by = scout ? `${scout.name}, ${roleWord(scout)}` : "The desk";
    return { week: log.week, playerId: line.playerId, text: `${by} watched ${who}.` };
  });
}
