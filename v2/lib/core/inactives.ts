import {
  GAMEDAY_ACTIVE_LIMIT, GAMEDAY_ACTIVE_LIMIT_EIGHT_OL, GAMEDAY_OL_FOR_EXTRA,
  GameState, POSITION_GROUP, Player, ROTATION, Team,
} from "./types";
import { isActiveRoster, rosterCount } from "./select";
import { RosterMoveResult } from "./rosterStatus";

export function isSat(team: Team, playerId: number): boolean {
  const list = team.inactives;
  return !!list && list.includes(playerId);
}

export function isGamedayOl(p: Player): boolean {
  return POSITION_GROUP[p.pos] === "OL";
}

export function olOnActive53(state: GameState, teamId: number): number {
  let n = 0;
  for (const p of state.players) {
    if (p.teamId === teamId && !p.retired && !p.prospect && isActiveRoster(p) && isGamedayOl(p)) n++;
  }
  return n;
}

export function gamedayActiveCap(state: GameState, teamId: number): number {
  return olOnActive53(state, teamId) >= GAMEDAY_OL_FOR_EXTRA
    ? GAMEDAY_ACTIVE_LIMIT_EIGHT_OL
    : GAMEDAY_ACTIVE_LIMIT;
}

export function inactiveRequirement(state: GameState, teamId: number): number {
  return Math.max(0, rosterCount(state, teamId) - gamedayActiveCap(state, teamId));
}

/** Injured-on-53 already miss the game and count toward the sit requirement. */
export function injuredOnActive53(state: GameState, teamId: number): Player[] {
  return state.players.filter(
    (p) =>
      p.teamId === teamId && !p.retired && !p.prospect && isActiveRoster(p) && p.injuryWeeks > 0
  );
}

export function creditedInactives(state: GameState, teamId: number): number {
  const ids = new Set<number>();
  for (const p of injuredOnActive53(state, teamId)) ids.add(p.id);
  for (const id of state.teams[teamId].inactives ?? []) ids.add(id);
  return ids.size;
}

export function stillNeedToSit(state: GameState, teamId: number): number {
  return Math.max(0, inactiveRequirement(state, teamId) - creditedInactives(state, teamId));
}

export function gamedayInactiveView(state: GameState, teamId: number) {
  const ol = olOnActive53(state, teamId);
  const eightOl = ol >= GAMEDAY_OL_FOR_EXTRA;
  return {
    cap: gamedayActiveCap(state, teamId),
    need: inactiveRequirement(state, teamId),
    injured: injuredOnActive53(state, teamId).length,
    sat: (state.teams[teamId].inactives ?? []).length,
    credited: creditedInactives(state, teamId),
    stillNeed: stillNeedToSit(state, teamId),
    ol,
    eightOl,
  };
}

function healthyActiveAtPos(
  state: GameState, teamId: number, pos: Player["pos"], extraSat?: number
): Player[] {
  const team = state.teams[teamId];
  return state.players.filter(
    (p) =>
      p.teamId === teamId &&
      p.pos === pos &&
      !p.retired &&
      !p.prospect &&
      isActiveRoster(p) &&
      p.injuryWeeks <= 0 &&
      !isSat(team, p.id) &&
      p.id !== extraSat
  );
}

export function canSit(state: GameState, p: Player): boolean {
  if (p.teamId === null || p.retired || p.prospect || !isActiveRoster(p)) return false;
  if (isSat(state.teams[p.teamId], p.id)) return false;
  if (p.injuryWeeks > 0) return true;
  return healthyActiveAtPos(state, p.teamId, p.pos, p.id).length > 0;
}

export function sitPlayer(state: GameState, playerId: number): RosterMoveResult {
  const p = state.players.find((x) => x.id === playerId);
  if (!p) return { ok: false, reason: "No such player" };
  if (p.teamId === null || p.retired || p.prospect) {
    return { ok: false, reason: "Player is not on a roster." };
  }
  if (!isActiveRoster(p)) return { ok: false, reason: "Player is not on the active roster." };
  const team = state.teams[p.teamId];
  if (isSat(team, p.id)) return { ok: false, reason: "Already inactive this week." };
  if (p.injuryWeeks <= 0 && healthyActiveAtPos(state, p.teamId, p.pos, p.id).length === 0) {
    return { ok: false, reason: `Sitting ${p.firstName} ${p.lastName} would leave no healthy active ${p.pos} to play.` };
  }
  if (!team.inactives) team.inactives = [];
  team.inactives.push(p.id);
  return { ok: true };
}

export function activateFromInactive(state: GameState, playerId: number): RosterMoveResult {
  const p = state.players.find((x) => x.id === playerId);
  if (!p || p.teamId === null) return { ok: false, reason: "No such player" };
  const team = state.teams[p.teamId];
  if (!isSat(team, p.id)) return { ok: false, reason: "Player is not inactive." };
  team.inactives = team.inactives!.filter((id) => id !== p.id);
  if (team.inactives.length === 0) delete team.inactives;
  return { ok: true };
}

export function clearInactives(state: GameState): void {
  for (const t of state.teams) {
    if (t.inactives) delete t.inactives;
  }
}

function nextCpuScratch(state: GameState, teamId: number): Player | undefined {
  const team = state.teams[teamId];
  const chartRank = (p: Player): number => {
    const chart = team.depthChart[p.pos] ?? [];
    const i = chart.indexOf(p.id);
    return i < 0 ? 99 : i;
  };
  const candidates: Player[] = [];
  for (const p of state.players) {
    if (p.teamId !== teamId || p.retired || p.prospect || !isActiveRoster(p)) continue;
    if (p.injuryWeeks > 0) continue;
    if (isSat(team, p.id)) continue;
    if (!canSit(state, p)) continue;
    candidates.push(p);
  }
  candidates.sort((a, b) => {
    const aDeep = chartRank(a) >= ROTATION[a.pos] ? 1 : 0;
    const bDeep = chartRank(b) >= ROTATION[b.pos] ? 1 : 0;
    if (aDeep !== bDeep) return bDeep - aDeep;
    if (a.ovr !== b.ovr) return a.ovr - b.ovr;
    return a.id - b.id;
  });
  return candidates[0];
}

/** Sit remaining extras so the club is at the 47/48 gameday cap. */
export function fillGamedayInactives(state: GameState, teamId: number): void {
  if (state.phase !== "regular" && state.phase !== "playoffs") return;
  while (stillNeedToSit(state, teamId) > 0) {
    const pick = nextCpuScratch(state, teamId);
    if (!pick) break;
    const res = sitPlayer(state, pick.id);
    if (!res.ok) break;
  }
}

export function declareGamedayInactives(state: GameState, teamIds: Iterable<number>): void {
  for (const id of teamIds) fillGamedayInactives(state, id);
}
