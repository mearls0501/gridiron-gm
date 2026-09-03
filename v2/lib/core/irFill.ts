import { fillOpenActiveSlots } from "./offseason/contracts";
import { canElevateFromPs, elevateFromPs } from "./rosterStatus";
import { positionCount, rosterCount } from "./select";
import { GameState, POSITION_MIN, Position, rosterLimit } from "./types";
import { Rng } from "./rng";

/**
 * CPU IR replacement. Lives here so season/engine and playoffs can fill
 * without a contracts.ts ↔ rosterStatus.ts import cycle.
 *
 * Elevate from that club's PS first, then street-sign into the open 53.
 * Never cuts — IR already made the room. User club is skipped.
 */

function elevateBestPs(state: GameState, teamId: number): boolean {
  const need = (Object.keys(POSITION_MIN) as Position[]).find(
    (pos) => positionCount(state, teamId, pos) < POSITION_MIN[pos]
  );
  const pool = state.players.filter((p) => canElevateFromPs(state, p) && p.teamId === teamId);
  if (pool.length === 0) return false;
  pool.sort((a, b) => {
    const aNeed = need && a.pos === need ? 1 : 0;
    const bNeed = need && b.pos === need ? 1 : 0;
    if (aNeed !== bNeed) return bNeed - aNeed;
    return b.ovr - a.ovr || a.id - b.id;
  });
  return elevateFromPs(state, pool[0].id).ok;
}

export function fillCpuIrReplacements(state: GameState, rng: Rng): void {
  if (state.phase !== "regular" && state.phase !== "playoffs") return;
  const hold = rosterLimit(state.phase);
  for (const t of state.teams) {
    if (t.id === state.userTeamId) continue;
    let guard = 0;
    while (rosterCount(state, t.id) < hold && guard++ < 20) {
      if (!elevateBestPs(state, t.id)) break;
    }
    if (rosterCount(state, t.id) < hold) fillOpenActiveSlots(state, t.id, rng);
  }
}
