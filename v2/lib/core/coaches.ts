import { makeCoachName } from "./names";
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
 * People-layer coaches: HC / OC / DC with contracts and schemes.
 *
 * `Team.coach` is the existing seven-number dial object and is never rewritten
 * here. New people copy those dials on first fill so `effectiveCoach` matches
 * the generated club until a hire or a poach actually replaces someone.
 *
 * All draws come from a child stream keyed (seed, season, week, 'coaches').
 * `state.rngState` is not read or written.
 */

export const COACH_ROLES: CoachRole[] = ["hc", "oc", "dc"];

/** Proposed defaults — flag for Matt. Cash only; not a cap charge. */
export const COACH_CONTRACT = {
  hc: { yearsLo: 4, yearsHi: 6, salaryLo: 8_000_000, salaryHi: 16_000_000 },
  oc: { yearsLo: 3, yearsHi: 4, salaryLo: 2_500_000, salaryHi: 7_000_000 },
  dc: { yearsLo: 3, yearsHi: 4, salaryLo: 2_500_000, salaryHi: 6_500_000 },
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
  return {
    id: nextId(state),
    name,
    role,
    teamId: team.id,
    ...copyDials(team.coach),
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

/** Dials the people layer would feed `effectiveCoach`, or null if nobody is named. */
export function peopleCoachDials(team: Team): Coach | null {
  const c = team.coaches;
  if (!c?.hc && !c?.oc && !c?.dc) return null;
  return {
    name: c.hc?.name ?? team.coach.name,
    offense: c.oc?.offense ?? c.hc?.offense ?? team.coach.offense,
    defense: c.dc?.defense ?? c.hc?.defense ?? team.coach.defense,
    development: c.hc?.development ?? team.coach.development,
    aggression: c.hc?.aggression ?? team.coach.aggression,
    passBias: c.oc?.passBias ?? team.coach.passBias,
    shadowTendency: c.dc?.shadowTendency ?? team.coach.shadowTendency,
  };
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

export function fireCoach(
  state: GameState, teamId: number, role: CoachRole,
): { ok: boolean; reason?: string } {
  if (teamId !== state.userTeamId) {
    return { ok: false, reason: "Only your own staff can be fired from this desk." };
  }
  const team = state.teams[teamId];
  const staff = team?.coaches;
  const person = staff?.[role];
  if (!team || !staff || !person) return { ok: false, reason: "That chair is already empty." };
  person.teamId = null;
  if (!state.coachMarket) state.coachMarket = [];
  state.coachMarket.push(person);
  delete staff[role];
  state.log.push({
    season: state.season, week: state.week, kind: "transaction",
    text: `The ${team.city} ${team.name} fired ${roleLabel(role)} ${person.name}.`,
  });
  return { ok: true };
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
  person.hiredSeason = state.season;
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
  return "defensive coordinator";
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
    for (const role of ["oc", "dc"] as CoachRole[]) {
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
  oc.hiredSeason = state.season;
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
  person.hiredSeason = state.season;
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
