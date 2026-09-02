import {
  GameState, IR_MIN_GAMES, IR_RETURN_DESIGNATIONS, PRACTICE_SQUAD_LIMIT,
  PS_ELEVATIONS_PER_PLAYER, Player, rosterLimit,
} from "./types";
import { irCount, isActiveRoster, practiceSquadCount, rosterCount } from "./select";

export interface RosterMoveResult {
  ok: boolean;
  reason?: string;
}

export function irReturnsRemaining(state: GameState, teamId: number): number {
  return Math.max(0, IR_RETURN_DESIGNATIONS - (state.teams[teamId]?.irReturnsUsed ?? 0));
}

export function elevationsLeft(p: Player): number {
  return Math.max(0, PS_ELEVATIONS_PER_PLAYER - (p.psElevations ?? 0));
}

export function canDesignateIr(p: Player): boolean {
  return p.teamId !== null && !p.retired && !p.prospect && isActiveRoster(p) && p.injuryWeeks >= IR_MIN_GAMES;
}

export function canActivateFromIr(state: GameState, p: Player): boolean {
  if (p.teamId === null || p.status !== "ir") return false;
  if (p.injuryWeeks > 0) return false;
  if ((p.irGames ?? 0) < IR_MIN_GAMES) return false;
  if (irReturnsRemaining(state, p.teamId) <= 0) return false;
  return rosterCount(state, p.teamId) < rosterLimit(state.phase);
}

export function canPlaceOnPs(state: GameState, p: Player): boolean {
  return (
    p.teamId !== null &&
    !p.retired &&
    !p.prospect &&
    isActiveRoster(p) &&
    practiceSquadCount(state, p.teamId) < PRACTICE_SQUAD_LIMIT
  );
}

export function canElevateFromPs(state: GameState, p: Player): boolean {
  if (p.teamId === null || p.status !== "ps") return false;
  if (elevationsLeft(p) <= 0) return false;
  return rosterCount(state, p.teamId) < rosterLimit(state.phase);
}

export function clearRosterSlot(p: Player): void {
  delete p.status;
  delete p.irGames;
}

export function designateIr(state: GameState, playerId: number): RosterMoveResult {
  const p = state.players.find((x) => x.id === playerId);
  if (!p) return { ok: false, reason: "No such player" };
  if (!canDesignateIr(p)) {
    return { ok: false, reason: "Only an injured active player out at least 4 games can go on IR." };
  }
  const teamId = p.teamId!;
  p.status = "ir";
  p.irGames = 0;
  state.log.push({
    season: state.season,
    week: state.week,
    kind: "transaction",
    text: `${state.teams[teamId].abbr} placed ${p.firstName} ${p.lastName} (${p.pos}) on injured reserve`,
  });
  return { ok: true };
}

export function activateFromIr(state: GameState, playerId: number): RosterMoveResult {
  const p = state.players.find((x) => x.id === playerId);
  if (!p) return { ok: false, reason: "No such player" };
  if (p.status !== "ir" || p.teamId === null) return { ok: false, reason: "Player is not on IR." };
  if (p.injuryWeeks > 0) return { ok: false, reason: "Still injured — cannot activate yet." };
  if ((p.irGames ?? 0) < IR_MIN_GAMES) {
    return { ok: false, reason: `Must miss ${IR_MIN_GAMES} games on IR before returning.` };
  }
  if (irReturnsRemaining(state, p.teamId) <= 0) {
    return { ok: false, reason: "No IR return designations left this season." };
  }
  const hold = rosterLimit(state.phase);
  if (rosterCount(state, p.teamId) >= hold) {
    return { ok: false, reason: `No open ${hold}-man roster slot.` };
  }
  const teamId = p.teamId;
  const t = state.teams[teamId];
  t.irReturnsUsed = (t.irReturnsUsed ?? 0) + 1;
  clearRosterSlot(p);
  state.log.push({
    season: state.season,
    week: state.week,
    kind: "transaction",
    text: `${t.abbr} activated ${p.firstName} ${p.lastName} (${p.pos}) from injured reserve`,
  });
  return { ok: true };
}

export function placeOnPs(state: GameState, playerId: number): RosterMoveResult {
  const p = state.players.find((x) => x.id === playerId);
  if (!p) return { ok: false, reason: "No such player" };
  if (p.teamId === null || p.retired || p.prospect) {
    return { ok: false, reason: "Player is not on a roster." };
  }
  if (!isActiveRoster(p)) return { ok: false, reason: "Player is not on the active roster." };
  if (practiceSquadCount(state, p.teamId) >= PRACTICE_SQUAD_LIMIT) {
    return { ok: false, reason: `Practice squad is full (${PRACTICE_SQUAD_LIMIT}).` };
  }
  const teamId = p.teamId;
  p.status = "ps";
  delete p.irGames;
  state.log.push({
    season: state.season,
    week: state.week,
    kind: "transaction",
    text: `${state.teams[teamId].abbr} placed ${p.firstName} ${p.lastName} (${p.pos}) on the practice squad`,
  });
  return { ok: true };
}

export function elevateFromPs(state: GameState, playerId: number): RosterMoveResult {
  const p = state.players.find((x) => x.id === playerId);
  if (!p) return { ok: false, reason: "No such player" };
  if (p.status !== "ps" || p.teamId === null) {
    return { ok: false, reason: "Player is not on the practice squad." };
  }
  if (elevationsLeft(p) <= 0) {
    return { ok: false, reason: `Already elevated ${PS_ELEVATIONS_PER_PLAYER} times this season.` };
  }
  const hold = rosterLimit(state.phase);
  if (rosterCount(state, p.teamId) >= hold) {
    return { ok: false, reason: `No open ${hold}-man roster slot.` };
  }
  const teamId = p.teamId;
  p.psElevations = (p.psElevations ?? 0) + 1;
  clearRosterSlot(p);
  state.log.push({
    season: state.season,
    week: state.week,
    kind: "transaction",
    text: `${state.teams[teamId].abbr} elevated ${p.firstName} ${p.lastName} (${p.pos}) from the practice squad`,
  });
  return { ok: true };
}

/** Last year's PS compete for the 53; leftovers are re-stashed at cutdown. */
export function foldPracticeSquad(state: GameState, teamId: number): void {
  for (const p of state.players) {
    if (p.teamId === teamId && p.status === "ps") {
      delete p.status;
      delete p.irGames;
    }
  }
}

export function resetSeasonRosterFlags(state: GameState): void {
  for (const t of state.teams) delete t.irReturnsUsed;
  for (const p of state.players) {
    if (p.psElevations) delete p.psElevations;
  }
}

/** Credit a missed game to every IR player whose club played. */
export function tickIrGames(state: GameState, teamIds: Iterable<number>): void {
  const played = new Set(teamIds);
  for (const p of state.players) {
    if (p.status !== "ir" || p.teamId === null || !played.has(p.teamId)) continue;
    p.irGames = (p.irGames ?? 0) + 1;
  }
}

/**
 * CPU clubs only. User IR is a /roster decision. Requires remaining
 * injuryWeeks at the 4-game minimum and a return designation left.
 */
export function autoDesignateIr(state: GameState): void {
  if (state.phase !== "regular" && state.phase !== "playoffs") return;
  for (const p of state.players) {
    if (p.teamId === null || p.teamId === state.userTeamId) continue;
    if (!canDesignateIr(p)) continue;
    if (irReturnsRemaining(state, p.teamId) <= 0) continue;
    designateIr(state, p.id);
  }
}

export function rosterSlotLabel(p: Player): string {
  if (p.status === "ir") return "IR";
  if (p.status === "ps") return "PS";
  return "Active";
}

export { irCount, practiceSquadCount };
