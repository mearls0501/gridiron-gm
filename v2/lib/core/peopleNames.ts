import { CoachRole, GameState } from "./types";

/**
 * Owners and coaches in one league do not share a full name.
 *
 * The draw that produced the name is unchanged. A collision gets a
 * suffix. Nothing here calls the RNG, so a child stream and the
 * parent fingerprint stay where they were.
 */

const ROLES: CoachRole[] = ["hc", "oc", "dc", "stc"];

function roman(n: number): string {
  const table: [number, string][] = [
    [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"],
  ];
  let out = "";
  let left = n;
  for (const [v, s] of table) {
    while (left >= v) {
      out += s;
      left -= v;
    }
  }
  return out || String(n);
}

function claim(name: string, used: Set<string>): string {
  if (!used.has(name)) {
    used.add(name);
    return name;
  }
  let n = 2;
  let next = `${name} ${roman(n)}`;
  while (used.has(next)) {
    n += 1;
    next = `${name} ${roman(n)}`;
  }
  used.add(next);
  return next;
}

function eachNamedPerson(state: GameState, visit: (person: { name: string }) => void): void {
  const teams = state.teams.slice().sort((a, b) => a.id - b.id);
  for (const team of teams) visit(team.coach);
  for (const team of teams) {
    for (const role of ROLES) {
      const person = team.coaches?.[role];
      if (!person) continue;
      if (role === "hc" && person.name === team.coach.name && person !== team.coach) continue;
      visit(person);
    }
  }
  for (const team of teams) {
    if (team.owner) visit(team.owner);
  }
  const market = (state.coachMarket ?? []).slice().sort((a, b) => a.id - b.id);
  for (const person of market) visit(person);
}

/**
 * Suffix one person's name if another owner or coach already has it.
 * Everyone else keeps the name they have.
 */
export function uniquifyPersonName(state: GameState, person: { name: string }): void {
  const used = new Set<string>();
  eachNamedPerson(state, (other) => {
    if (other !== person) used.add(other.name);
  });
  person.name = claim(person.name, used);
}

/**
 * Walk the league in a stable order and suffix duplicate full names.
 * Coaches are claimed before owners, so a later owner does not rename
 * a coach. A head coach who still carries `team.coach.name` is that
 * same person and keeps one name. Idempotent.
 */
export function dedupeOwnerAndCoachNames(state: GameState): void {
  const used = new Set<string>();
  const teams = state.teams.slice().sort((a, b) => a.id - b.id);

  for (const team of teams) {
    const raw = team.coach.name;
    const hc = team.coaches?.hc;
    const samePerson = !!hc && hc.name === raw;
    const next = claim(raw, used);
    team.coach.name = next;
    if (hc && samePerson) hc.name = next;
  }

  for (const team of teams) {
    for (const role of ROLES) {
      const person = team.coaches?.[role];
      if (!person) continue;
      if (role === "hc" && person.name === team.coach.name) continue;
      person.name = claim(person.name, used);
    }
  }

  for (const team of teams) {
    if (team.owner) team.owner.name = claim(team.owner.name, used);
  }

  const market = (state.coachMarket ?? []).slice().sort((a, b) => a.id - b.id);
  for (const person of market) person.name = claim(person.name, used);
}
