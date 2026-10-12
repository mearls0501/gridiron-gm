import { makeCoachName } from "./names";
import { OWNER_MIN_SEASONS, ownerJudgment, tenureRows } from "./owner";
import { Rng, clamp } from "./rng";
import {
  Coach,
  CoachPerson,
  CoachRole,
  CoachingStaff,
  GameState,
  Team,
} from "./types";

/**
 * People-layer coaches: HC / OC / DC / STC with contracts and schemes.
 *
 * `Team.coach` is the existing seven-number dial object and is never rewritten
 * here. The head coach copies those dials. Coordinators draw their own on
 * first fill. A vacant OC, DC, or STC is priced on this same path: the
 * fallback rating minus `EMPTY_COORDINATOR_COST`.
 *
 * All draws come from a child stream keyed (seed, season, week, 'coaches').
 * `state.rngState` is not read or written.
 */

export const COACH_ROLES: CoachRole[] = ["hc", "oc", "dc", "stc"];

/** OC, DC, and STC. The head coach is not a coordinator chair. */
export const COORDINATOR_ROLES: readonly ("oc" | "dc" | "stc")[] = ["oc", "dc", "stc"];

/**
 * Rating points removed from the fallback when that coordinator chair is empty.
 *
 * OC and DC fall back to the head coach's rating for that side (else
 * `Team.coach`). STC has no special-teams dial on `Coach`; the fallback is
 * `COORD_RATING_CENTRE` (60), and the grade stored on the person is his
 * `offense` number.
 *
 * The play engine turns the gap into yards and kicks. It does not add a
 * second dial for a filled chair's own offense or defense grade — those
 * already move the field through pass bias (OC) and shadow tendency (DC).
 * A filled chair pays none of this cost.
 *
 *   OC vacant: −0.096 yards on each run and each completion
 *     (`COORD_YARDS_PER_POINT` 0.012 × 8)
 *   DC vacant: +0.096 yards allowed on each of those plays
 *   STC vacant: −0.012 field-goal make probability, −0.8 punt yards
 *     Kickoffs are not adjusted.
 */
export const EMPTY_COORDINATOR_COST = 8;
export const COORD_RATING_CENTRE = 60;
export const COORD_YARDS_PER_POINT = 0.012;
export const STC_FG_PER_POINT = 0.0015;
export const STC_PUNT_YARDS_PER_POINT = 0.1;

/** Proposed defaults — flag for Matt. Cash only; not a cap charge. */
export const COACH_CONTRACT = {
  hc: { yearsLo: 4, yearsHi: 6, salaryLo: 8_000_000, salaryHi: 16_000_000 },
  oc: { yearsLo: 3, yearsHi: 4, salaryLo: 2_500_000, salaryHi: 7_000_000 },
  dc: { yearsLo: 3, yearsHi: 4, salaryLo: 2_500_000, salaryHi: 6_500_000 },
  stc: { yearsLo: 2, yearsHi: 3, salaryLo: 1_000_000, salaryHi: 3_000_000 },
} as const;

const MARKET_SIZE = 8;
const FIRST_COACH_ID = 1000;

export function coachesChildRng(state: GameState): Rng {
  return childRng(state.seed, state.season, state.week, "coaches");
}

function childRng(seed: number, season: number, week: number, tag: string): Rng {
  let h = seed >>> 0;
  h = Math.imul(h ^ season, 0x9e3779b9);
  h = Math.imul(h ^ (week + 1), 0x85ebca6b);
  for (let i = 0; i < tag.length; i++) h = Math.imul(h ^ tag.charCodeAt(i), 0xc2b2ae35);
  return new Rng((h >>> 0) || 0x9e3779b9);
}

function nextId(state: GameState): number {
  const id = state.nextCoachId ?? FIRST_COACH_ID;
  state.nextCoachId = id + 1;
  return id;
}

function contractFor(role: CoachRole, rng: Rng, season: number): {
  years: number; yearsRemaining: number; salary: number; hiredSeason: number;
} {
  const band = COACH_CONTRACT[role];
  const years = rng.int(band.yearsLo, band.yearsHi);
  return {
    years,
    yearsRemaining: rng.int(1, years),
    salary: rng.int(band.salaryLo, band.salaryHi),
    hiredSeason: season,
  };
}

function schemeFor(team: Team, role: CoachRole): string {
  if (role === "dc") return team.defScheme ?? "fourman";
  return team.offScheme ?? "westcoast";
}

function copyDials(coach: Coach): Pick<
  CoachPerson,
  "offense" | "defense" | "development" | "aggression" | "passBias" | "shadowTendency"
> {
  return {
    offense: coach.offense,
    defense: coach.defense,
    development: coach.development,
    aggression: coach.aggression,
    passBias: coach.passBias,
    shadowTendency: coach.shadowTendency,
  };
}

function makeStaffCoach(
  state: GameState,
  team: Team,
  role: CoachRole,
  rng: Rng,
): CoachPerson {
  const name = role === "hc" ? team.coach.name : makeCoachName(rng);
  const dials = role === "hc" ? copyDials(team.coach) : randomDials(rng);
  return {
    id: nextId(state),
    name,
    role,
    teamId: team.id,
    ...dials,
    scheme: schemeFor(team, role),
    ...contractFor(role, rng, state.season),
  };
}

function randomDials(rng: Rng): Pick<
  CoachPerson,
  "offense" | "defense" | "development" | "aggression" | "passBias" | "shadowTendency"
> {
  return {
    offense: clamp(Math.round(rng.normal(60, 14)), 25, 95),
    defense: clamp(Math.round(rng.normal(60, 14)), 25, 95),
    development: clamp(Math.round(rng.normal(60, 14)), 25, 95),
    aggression: clamp(Math.round(rng.normal(50, 18)), 10, 95),
    passBias: clamp(rng.normal(0, 0.125), -0.30, 0.30),
    shadowTendency: clamp(rng.normal(0.42, 0.26), 0, 0.95),
  };
}

const MARKET_SCHEMES_OFF = ["vertical", "westcoast", "power", "spread"] as const;
const MARKET_SCHEMES_DEF = ["fourman", "blitz", "twogap", "zone"] as const;

function makeMarketCoach(state: GameState, role: CoachRole, rng: Rng): CoachPerson {
  const scheme = role === "dc"
    ? rng.pick(MARKET_SCHEMES_DEF)
    : rng.pick(MARKET_SCHEMES_OFF);
  return {
    id: nextId(state),
    name: makeCoachName(rng),
    role,
    teamId: null,
    ...randomDials(rng),
    scheme,
    ...contractFor(role, rng, state.season),
  };
}

export function staffSlot(team: Team, role: CoachRole): CoachPerson | undefined {
  return team.coaches?.[role];
}

function vacantSide(filled: number | undefined, fallback: number): number {
  if (filled != null) return filled;
  return clamp(fallback - EMPTY_COORDINATOR_COST, 0, 100);
}

/** Dials the people layer feeds `effectiveCoach`, or null if nobody is named. */
export function peopleCoachDials(team: Team): Coach | null {
  const c = team.coaches;
  if (!c?.hc && !c?.oc && !c?.dc && !c?.stc) return null;
  return {
    name: c.hc?.name ?? team.coach.name,
    offense: vacantSide(c.oc?.offense, c.hc?.offense ?? team.coach.offense),
    defense: vacantSide(c.dc?.defense, c.hc?.defense ?? team.coach.defense),
    development: c.hc?.development ?? team.coach.development,
    aggression: c.hc?.aggression ?? team.coach.aggression,
    passBias: c.oc?.passBias ?? team.coach.passBias,
    shadowTendency: c.dc?.shadowTendency ?? team.coach.shadowTendency,
  };
}

/**
 * Sides trial in `scripts/coherence.ts`. Zero the shadow the play engine
 * reads. With a DC named, that is his `shadowTendency`. The head coach's
 * dial is left alone. A club with no DC still plays `Team.coach`.
 */
export function zeroPlayedShadow(team: Team): void {
  const dc = team.coaches?.dc;
  if (dc) {
    dc.shadowTendency = 0;
    return;
  }
  team.coach.shadowTendency = 0;
}

/**
 * Shadow trial in `scripts/coherence.ts`. Set the shadow the play engine
 * reads to 1. With a DC named, that is his `shadowTendency`. The head coach's
 * dial is left alone. A club with no DC still plays `Team.coach`.
 */
export function setPlayedShadow(team: Team): void {
  const dc = team.coaches?.dc;
  if (dc) {
    dc.shadowTendency = 1;
    return;
  }
  team.coach.shadowTendency = 1;
}

/**
 * Yards added on a run or a completion from vacant coordinators.
 * Negative when the offense has no OC. Positive when the defense has no DC.
 * A filled chair, or a club with no people layer, contributes 0.
 */
export function coordinatorPlayYards(offense: Team, defense: Team): number {
  return vacantOcYards(offense) + vacantDcYards(defense);
}

export function vacantOcYards(team: Team): number {
  if (!team.coaches || team.coaches.oc) return 0;
  const fallback = team.coaches.hc?.offense ?? team.coach.offense;
  const rated = peopleCoachDials(team)?.offense ?? fallback;
  return (rated - fallback) * COORD_YARDS_PER_POINT;
}

export function vacantDcYards(team: Team): number {
  if (!team.coaches || team.coaches.dc) return 0;
  const fallback = team.coaches.hc?.defense ?? team.coach.defense;
  const rated = peopleCoachDials(team)?.defense ?? fallback;
  return (fallback - rated) * COORD_YARDS_PER_POINT;
}

/**
 * Special-teams grade. A filled STC keeps his own `offense` rating.
 * A vacant chair is the centre minus `EMPTY_COORDINATOR_COST`.
 * No people layer is the centre, so an old save before backfill is not taxed.
 */
export function specialTeamsRating(team: Team): number {
  if (!team.coaches) return COORD_RATING_CENTRE;
  if (team.coaches.stc) return team.coaches.stc.offense;
  return clamp(COORD_RATING_CENTRE - EMPTY_COORDINATOR_COST, 0, 100);
}

/** Field-goal make-probability added for a vacant STC. Filled is 0. */
export function vacantStcFgDelta(team: Team): number {
  if (!team.coaches || team.coaches.stc) return 0;
  return (specialTeamsRating(team) - COORD_RATING_CENTRE) * STC_FG_PER_POINT;
}

/** Punt yards added for a vacant STC. Filled is 0. */
export function vacantStcPuntDelta(team: Team): number {
  if (!team.coaches || team.coaches.stc) return 0;
  return (specialTeamsRating(team) - COORD_RATING_CENTRE) * STC_PUNT_YARDS_PER_POINT;
}

const CHAIR_NAME = {
  oc: "Offensive coordinator",
  dc: "Defensive coordinator",
  stc: "Special teams coordinator",
} as const;

export interface CoordinatorChairFlag {
  role: "oc" | "dc" | "stc";
  message: string;
  detail: string;
  href: "/staff";
}

/** Hub flags for empty coordinator chairs. No people layer means nothing to flag. */
export function emptyCoordinatorFlags(team: Team): CoordinatorChairFlag[] {
  if (!team.coaches) return [];
  const flags: CoordinatorChairFlag[] = [];
  for (const role of COORDINATOR_ROLES) {
    if (team.coaches[role]) continue;
    flags.push({
      role,
      message: `${CHAIR_NAME[role]} chair is empty`,
      detail: "That vacancy costs the club on the field until the chair is filled.",
      href: "/staff",
    });
  }
  return flags;
}

export function sameCoachDials(a: Coach, b: Coach): boolean {
  return (
    a.offense === b.offense &&
    a.defense === b.defense &&
    a.development === b.development &&
    a.aggression === b.aggression &&
    a.passBias === b.passBias &&
    a.shadowTendency === b.shadowTendency
  );
}

function restockMarket(state: GameState, rng: Rng): void {
  if (!state.coachMarket) state.coachMarket = [];
  while (state.coachMarket.length < MARKET_SIZE) {
    const role = rng.pick(COACH_ROLES);
    state.coachMarket.push(makeMarketCoach(state, role, rng));
  }
}

export function ensureCoaches(state: GameState): void {
  const rng = coachesChildRng(state);
  if (state.nextCoachId == null) state.nextCoachId = FIRST_COACH_ID;

  for (const team of state.teams) {
    if (team.coaches) continue;
    team.coaches = {};
    for (const role of COACH_ROLES) {
      team.coaches[role] = makeStaffCoach(state, team, role, rng);
    }
  }

  // Staff that predates the STC chair. A vacancy after this stays empty.
  if (!state.stcSeeded) {
    for (const team of state.teams) {
      if (!team.coaches) team.coaches = {};
      if (!team.coaches.stc) {
        team.coaches.stc = makeStaffCoach(state, team, "stc", rng);
      }
    }
    state.stcSeeded = true;
  }

  if (state.coachMarket == null) restockMarket(state, rng);
}

/** Restock the unemployed pool. Child stream only. */
export function ensureCoachMarket(state: GameState): void {
  if (state.nextCoachId == null) state.nextCoachId = FIRST_COACH_ID;
  restockMarket(state, coachesChildRng(state));
}

function takeFromMarket(state: GameState, id: number): CoachPerson | null {
  const market = state.coachMarket ?? [];
  const i = market.findIndex((c) => c.id === id);
  if (i < 0) return null;
  const [person] = market.splice(i, 1);
  return person ?? null;
}

/** First season this person will actually coach. Recap hires start next year. */
export function firstSeasonCoaching(state: GameState): number {
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

export function releaseCoach(
  state: GameState, teamId: number, role: CoachRole, kind: "fired" | "expired",
): { ok: boolean; reason?: string } {
  const team = state.teams[teamId];
  const staff = team?.coaches;
  const person = staff?.[role];
  if (!team || !staff || !person) return { ok: false, reason: "That chair is already empty." };
  person.teamId = null;
  if (!state.coachMarket) state.coachMarket = [];
  state.coachMarket.push(person);
  delete staff[role];
  const verb = kind === "expired" ? "let" : "fired";
  const tail = kind === "expired" ? "'s contract expire." : ".";
  state.log.push({
    season: state.season, week: state.week, kind: "transaction",
    text: `The ${team.city} ${team.name} ${verb} ${roleLabel(role)} ${person.name}${tail}`,
  });
  return { ok: true };
}

export function fireCoach(
  state: GameState, teamId: number, role: CoachRole,
): { ok: boolean; reason?: string } {
  if (teamId !== state.userTeamId) {
    return { ok: false, reason: "Only your own staff can be fired from this desk." };
  }
  return releaseCoach(state, teamId, role, "fired");
}

export function hireCoach(
  state: GameState, teamId: number, coachId: number, role: CoachRole,
): { ok: boolean; reason?: string } {
  if (teamId !== state.userTeamId) {
    return { ok: false, reason: "Only your own staff can be hired from this desk." };
  }
  const team = state.teams[teamId];
  if (!team) return { ok: false, reason: "No such club." };
  if (team.coaches?.[role]) {
    return { ok: false, reason: "That chair is filled. Fire them first." };
  }
  if ((state.coachMarket?.length ?? 0) === 0) ensureCoachMarket(state);
  const person = takeFromMarket(state, coachId);
  if (!person) return { ok: false, reason: "That coach is no longer available." };
  person.role = role;
  person.teamId = teamId;
  person.hiredSeason = firstSeasonCoaching(state);
  const band = COACH_CONTRACT[role];
  if (person.yearsRemaining < 1) person.yearsRemaining = band.yearsLo;
  if (!team.coaches) team.coaches = {};
  team.coaches[role] = person;
  state.log.push({
    season: state.season, week: state.week, kind: "transaction",
    text: `The ${team.city} ${team.name} hired ${person.name} as ${roleLabel(role)}.`,
  });
  return { ok: true };
}

export function roleLabel(role: CoachRole): string {
  if (role === "hc") return "head coach";
  if (role === "oc") return "offensive coordinator";
  if (role === "dc") return "defensive coordinator";
  return "special teams coordinator";
}

export interface CarouselEvent {
  kind: "poach" | "hire";
  teamId: number;
  role: CoachRole;
  coachName: string;
  fromTeamId?: number;
}

/**
 * CPU offseason carousel. User club is interactive-only: a CPU HC vacancy
 * may poach the user's OC, and that chair stays empty for the GM to fill.
 *
 * Orchestrator hook: call from `offseason/index.ts` during `offseason-recap`
 * (after history is written) or `offseason-tag`. Do not call from this
 * module on a timer — there is no phase hook in the files this lane owns.
 */
export function tickCoachContracts(state: GameState): CoachPerson[] {
  ensureCoaches(state);
  const expired: CoachPerson[] = [];
  for (const team of state.teams) {
    if (!team.coaches) continue;
    for (const role of COACH_ROLES) {
      const person = team.coaches[role];
      if (!person) continue;
      person.yearsRemaining -= 1;
      if (person.yearsRemaining > 0) continue;
      expired.push(person);
      const cpuHc = role === "hc" && team.id !== state.userTeamId;
      releaseCoach(state, team.id, role, "expired");
      if (cpuHc) {
        if (!state.seasonCounters) state.seasonCounters = {};
        state.seasonCounters.hcExpiries = (state.seasonCounters.hcExpiries ?? 0) + 1;
      }
    }
  }
  return expired;
}

function recordFiredHcTenure(state: GameState, teamId: number, hiredSeason: number): void {
  let wins = 0;
  let seasons = 0;
  for (const year of state.history) {
    if (year.season < hiredSeason) continue;
    const row = year.standings.find((r) => r.teamId === teamId);
    if (!row) continue;
    wins += row.w + row.t * 0.5;
    seasons += 1;
  }
  if (seasons === 0) return;
  if (!state.seasonCounters) state.seasonCounters = {};
  const c = state.seasonCounters;
  c.hcFireTenureWins = (c.hcFireTenureWins ?? 0) + wins;
  c.hcFireTenureSeasons = (c.hcFireTenureSeasons ?? 0) + seasons;
}

/**
 * Extend an expiring CPU HC so the following contract tick leaves a full
 * minimum term. No draw — the coaches child stream stays where it is.
 */
function extendCpuHeadCoach(person: CoachPerson): void {
  const term = COACH_CONTRACT.hc.yearsLo;
  person.years = term;
  person.yearsRemaining = term + 1;
}

/**
 * Two-season rule fires CPU head coaches. Same judgment as the GM chair
 * (`ownerJudgment` / `wouldFire`). Wins are only the seasons since
 * `hc.hiredSeason`, each carrying that row's `expectedWins`.
 * `firingEnabled` does not gate this — settings must not change the sim.
 *
 * An expiring deal (one year left, so the next tick would empty the
 * chair) is decided here: within 1.0 win of the bar (margin ≤ 1) is
 * not renewed and counts as a fire; otherwise the deal is extended.
 * Call before `tickCoachContracts`.
 */
export function fireCpuHeadCoaches(state: GameState): number {
  ensureCoaches(state);
  let n = 0;
  for (const team of state.teams) {
    if (team.id === state.userTeamId) continue;
    const hc = team.coaches?.hc;
    if (!hc || !team.owner) continue;
    const rows = tenureRows(state, team.id, hc.hiredSeason);
    const judged = ownerJudgment(
      team.owner.patience,
      rows.map((r) => r.wins),
      rows.map((r) => r.expectedWins),
      true,
    );
    const expiring = hc.yearsRemaining <= 1;
    // In term, `wouldFire` is weighted wins ≤ bar (one-and-done at four
    // or fewer, except a rebuild-target first season, and except a
    // winning season or a gain of three wins on the year before). An
    // expiring coach is also not renewed within a win of that same bar,
    // unless that same keep applies. A coach who is kept is extended.
    const wouldFire = expiring
      ? rows.length > 0 && judged.margin <= 1 && !judged.recordKeep
      : judged.wouldFire;

    const dismiss = (): boolean => {
      const hiredSeason = hc.hiredSeason;
      const r = releaseCoach(state, team.id, "hc", "fired");
      if (!r.ok) return false;
      n++;
      if (!state.seasonCounters) state.seasonCounters = {};
      const c = state.seasonCounters;
      c.hcFires = (c.hcFires ?? 0) + 1;
      const last = rows.length ? rows[rows.length - 1].wins : 0;
      c.hcFiredLastSeasonWins = (c.hcFiredLastSeasonWins ?? 0) + last;
      if (rows.length < OWNER_MIN_SEASONS) c.hcOneAndDone = (c.hcOneAndDone ?? 0) + 1;
      recordFiredHcTenure(state, team.id, hiredSeason);
      return true;
    };

    if (expiring && !wouldFire) extendCpuHeadCoach(hc);
    if (wouldFire) dismiss();
  }
  return n;
}

export function runCoachCarousel(state: GameState): CarouselEvent[] {
  const rng = coachesChildRng(state);
  ensureCoaches(state);
  const events: CarouselEvent[] = [];

  for (const team of state.teams) {
    if (team.id === state.userTeamId) continue;
    if (team.coaches?.hc) continue;
    const poached = poachUserOc(state, team, rng);
    if (poached) {
      events.push(poached);
      continue;
    }
    const hired = fillCpuChair(state, team, "hc", rng);
    if (hired) events.push(hired);
  }

  for (const team of state.teams) {
    if (team.id === state.userTeamId) continue;
    for (const role of COORDINATOR_ROLES) {
      if (team.coaches?.[role]) continue;
      const hired = fillCpuChair(state, team, role, rng);
      if (hired) events.push(hired);
    }
  }

  return events;
}

function poachUserOc(state: GameState, hiring: Team, rng: Rng): CarouselEvent | null {
  const user = state.teams[state.userTeamId];
  const oc = user?.coaches?.oc;
  if (!oc) return null;
  if (oc.offense < 58) return null;
  if (!rng.chance(0.55 + (oc.offense - 60) / 120)) return null;

  delete user.coaches!.oc;
  oc.role = "hc";
  oc.teamId = hiring.id;
  oc.hiredSeason = firstSeasonCoaching(state);
  oc.years = COACH_CONTRACT.hc.yearsLo;
  oc.yearsRemaining = COACH_CONTRACT.hc.yearsLo;
  oc.salary = Math.max(oc.salary, COACH_CONTRACT.hc.salaryLo);
  if (!hiring.coaches) hiring.coaches = {};
  hiring.coaches.hc = oc;
  state.log.push({
    season: state.season, week: state.week, kind: "transaction",
    text: `The ${hiring.city} ${hiring.name} hired ${oc.name} as head coach, poaching him from the ${user.city} ${user.name}.`,
  });
  return {
    kind: "poach",
    teamId: hiring.id,
    role: "hc",
    coachName: oc.name,
    fromTeamId: user.id,
  };
}

function fillCpuChair(
  state: GameState, team: Team, role: CoachRole, rng: Rng,
): CarouselEvent | null {
  const market = state.coachMarket ?? [];
  const i = market.findIndex((c) => c.role === role || role === "hc");
  let person: CoachPerson;
  if (i >= 0) {
    person = market.splice(i, 1)[0];
  } else {
    person = makeMarketCoach(state, role, rng);
  }
  person.role = role;
  person.teamId = team.id;
  person.hiredSeason = firstSeasonCoaching(state);
  const band = COACH_CONTRACT[role];
  if (person.yearsRemaining < 1) {
    person.years = band.yearsLo;
    person.yearsRemaining = band.yearsLo;
  }
  if (!team.coaches) team.coaches = {};
  team.coaches[role] = person;
  state.log.push({
    season: state.season, week: state.week, kind: "transaction",
    text: `The ${team.city} ${team.name} hired ${person.name} as ${roleLabel(role)}.`,
  });
  return { kind: "hire", teamId: team.id, role, coachName: person.name };
}

export function coachingStaffOf(team: Team): CoachingStaff {
  return team.coaches ?? {};
}
