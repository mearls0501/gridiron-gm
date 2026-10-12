import { COACH_ROLES, roleLabel } from "../core/coaches";
import { CoachRole, GameState } from "../core/types";

/**
 * Franchise-tag hub: this offseason's head-coach and coordinator
 * firings and hires. The carousel already wrote the sentences onto
 * `state.log`. This reads them. It does not hire, fire, or draw.
 *
 * A contract expiry is not a firing. Those lines stay off the block.
 */

export interface CoachingCarouselMove {
  action: "fired" | "hired";
  role: CoachRole;
  chair: string;
  club: string;
  coach: string;
  /** Set when the hire was a poach. */
  fromClub: string | null;
}

const ROLE_PHRASE = COACH_ROLES.map((role) => roleLabel(role)).join("|");
const FIRED_RE = new RegExp(`^The (.+) fired (${ROLE_PHRASE}) (.+)\\.$`);
const HIRED_RE = new RegExp(
  `^The (.+) hired (.+) as (${ROLE_PHRASE})(?:, poaching him from the (.+))?\\.$`,
);

function roleFromLabel(label: string): CoachRole | null {
  for (const role of COACH_ROLES) {
    if (roleLabel(role) === label) return role;
  }
  return null;
}

function chairLabel(role: CoachRole): string {
  const label = roleLabel(role);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function parseMove(text: string): CoachingCarouselMove | null {
  const fired = FIRED_RE.exec(text);
  if (fired) {
    const role = roleFromLabel(fired[2]);
    if (!role) return null;
    return {
      action: "fired",
      role,
      chair: chairLabel(role),
      club: fired[1],
      coach: fired[3],
      fromClub: null,
    };
  }
  const hired = HIRED_RE.exec(text);
  if (hired) {
    const role = roleFromLabel(hired[3]);
    if (!role) return null;
    return {
      action: "hired",
      role,
      chair: chairLabel(role),
      club: hired[1],
      coach: hired[2],
      fromClub: hired[4] ?? null,
    };
  }
  return null;
}

/**
 * Moves from this offseason only: the log rows the carousel wrote at
 * the week the tag hub is still on. Null outside that window.
 */
export function coachingCarouselMoves(state: GameState): CoachingCarouselMove[] | null {
  if (state.phase !== "offseason-tag") return null;
  const moves: CoachingCarouselMove[] = [];
  for (const entry of state.log) {
    if (entry.kind !== "transaction") continue;
    if (entry.season !== state.season || entry.week !== state.week) continue;
    const move = parseMove(entry.text);
    if (move) moves.push(move);
  }
  return moves;
}
