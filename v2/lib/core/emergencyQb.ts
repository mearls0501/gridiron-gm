import { activateFromInactive, isSat } from "./inactives";
import { freeActiveSlot } from "./offseason/contracts";
import { elevationsLeft, elevateFromPs } from "./rosterStatus";
import { isActiveRoster, rosterCount } from "./select";
import { GameState, Player, Team, rosterLimit } from "./types";

/**
 * Quarterback emergency.
 *
 * A hurt quarterback room used to hand the snaps to the highest-overall
 * healthy body, which is a punter. An available quarterback plays first:
 * a sat healthy quarterback is unsat, then a practice-squad quarterback.
 * Elevation happens when the roster has an open slot. This does not cut.
 * When it cannot elevate, it still returns the practice-squad quarterback
 * so the lineup can field him for this game.
 */

function healthyQuarterback(p: Player, teamId: number, skip: ReadonlySet<number>): boolean {
  return p.teamId === teamId && p.pos === "QB" && !p.retired && !p.prospect &&
    p.injuryWeeks <= 0 && !skip.has(p.id);
}

function byOvr(a: Player, b: Player): number {
  return b.ovr - a.ovr || a.id - b.id;
}

export function emergencyQuarterback(
  state: GameState, team: Team, skip: ReadonlySet<number>,
): Player | null {
  const sat = state.players
    .filter((p) => healthyQuarterback(p, team.id, skip) && isActiveRoster(p) && isSat(team, p.id))
    .sort(byOvr);
  if (sat[0] && activateFromInactive(state, sat[0].id).ok) return sat[0];

  const squad = state.players
    .filter((p) => healthyQuarterback(p, team.id, skip) && p.status === "ps")
    .sort((a, b) => {
      const ae = elevationsLeft(a) > 0 ? 1 : 0;
      const be = elevationsLeft(b) > 0 ? 1 : 0;
      if (ae !== be) return be - ae;
      return byOvr(a, b);
    });
  const qb = squad[0];
  if (!qb) return null;
  if (elevationsLeft(qb) > 0 && rosterCount(state, team.id) < rosterLimit(state.phase)) {
    if (elevateFromPs(state, qb.id).ok) return qb;
  }
  return qb;
}

function hasHealthyActiveQuarterback(state: GameState, team: Team): boolean {
  return state.players.some(
    (p) => healthyQuarterback(p, team.id, new Set()) && isActiveRoster(p) && !isSat(team, p.id),
  );
}

/**
 * Before kickoff. CPU clubs free a roster spot when that is what it takes
 * to elevate a practice-squad quarterback. The user club is never cut;
 * the lineup fallback still fields his practice-squad quarterback.
 */
export function dressEmergencyQuarterbacks(state: GameState, teamIds: Iterable<number>): void {
  for (const teamId of teamIds) {
    const team = state.teams[teamId];
    if (!team || hasHealthyActiveQuarterback(state, team)) continue;
    const sat = state.players
      .filter((p) => healthyQuarterback(p, teamId, new Set()) && isActiveRoster(p) && isSat(team, p.id))
      .sort(byOvr)[0];
    if (sat && activateFromInactive(state, sat.id).ok) continue;

    const qb = state.players
      .filter((p) => healthyQuarterback(p, teamId, new Set()) && p.status === "ps" && elevationsLeft(p) > 0)
      .sort(byOvr)[0];
    if (!qb) continue;
    if (rosterCount(state, teamId) >= rosterLimit(state.phase)) {
      if (teamId === state.userTeamId) continue;
      if (!freeActiveSlot(state, teamId)) continue;
    }
    elevateFromPs(state, qb.id);
  }
}
