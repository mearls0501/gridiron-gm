import { activateFromInactive, isSat } from "./inactives";
import { freeActiveSlot } from "./offseason/contracts";
import { elevationsLeft, elevateForGameday, elevateFromPs } from "./rosterStatus";
import { isActiveRoster, rosterCount } from "./select";
import { GameState, Player, Team, rosterLimit } from "./types";

/**
 * Quarterback emergency.
 *
 * A hurt quarterback room used to hand the snaps to the highest-overall
 * healthy body, which is a punter. An available quarterback plays first.
 *
 * NFL rule (2023 emergency third quarterback, kept by the 2024 NFLPA veto):
 * an inactive quarterback on the 53 may enter once the first two are out, so
 * a sat healthy quarterback is unsat, in the game too. A practice-squad
 * quarterback plays only if he was elevated before kickoff
 * (`dressEmergencyQuarterbacks`); nobody is elevated mid-game.
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
  return null;
}

function hasHealthyActiveQuarterback(state: GameState, team: Team): boolean {
  return state.players.some(
    (p) => healthyQuarterback(p, team.id, new Set()) && isActiveRoster(p) && !isSat(team, p.id),
  );
}

/**
 * Before kickoff. CPU clubs free a roster spot when that is what it takes
 * to elevate a practice-squad quarterback. The user club is never cut: a
 * full 53 uses a game-day elevation instead, which reverts after the games
 * (`revertGamedayElevations`). So does a CPU club that cannot free a spot.
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
      if (teamId === state.userTeamId || !freeActiveSlot(state, teamId)) {
        elevateForGameday(state, qb.id);
        continue;
      }
    }
    elevateFromPs(state, qb.id);
  }
}
