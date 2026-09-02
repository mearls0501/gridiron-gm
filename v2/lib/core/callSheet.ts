import { BoxScore, CallSheet, Coach, Game, GameState, SnapCall, Team } from "./types";

/**
 * This-week call sheet and Play-the-Game snap list.
 *
 * Coach passBias / aggression already drive Auto. The hole is GM-facing:
 * a sheet on the user club, applied when simulateGame runs that game.
 * CPU clubs never write one. Missing = older save, coach dials unchanged.
 */

export const PASS_LEAN_RUN = -1;
export const PASS_LEAN_PASS = 1;
/** Inside the generated coach band (10–95). Not an NFL rate. */
export const AGGRESSION_CONSERVATIVE = 15;
export const AGGRESSION_AGGRESSIVE = 90;

export interface SnapInfo {
  down: number;
  toGo: number;
  yardLine: number;
  quarter: number;
  clock: number;
  homeScore: number;
  awayScore: number;
  offenseIsHome: boolean;
}

export interface SimOpts {
  /**
   * User-club offensive snaps only. Bulk-sim / Play Week omit this.
   * `"auto"` (or a short list) falls through to choosePass.
   */
  playCaller?: (info: SnapInfo) => SnapCall;
}

export function effectiveCoach(team: Team): Coach {
  const sheet = team.callSheet;
  if (!sheet || (sheet.passLean == null && sheet.aggression == null)) return team.coach;
  return {
    ...team.coach,
    passBias: sheet.passLean ?? team.coach.passBias,
    aggression: sheet.aggression ?? team.coach.aggression,
  };
}

export function setCallSheet(state: GameState, patch: Partial<CallSheet>): void {
  const team = state.teams[state.userTeamId];
  const next: CallSheet = { ...(team.callSheet ?? {}) };
  if ("passLean" in patch) {
    if (patch.passLean == null) delete next.passLean;
    else next.passLean = patch.passLean;
  }
  if ("aggression" in patch) {
    if (patch.aggression == null) delete next.aggression;
    else next.aggression = patch.aggression;
  }
  if ("snaps" in patch) {
    if (!patch.snaps || patch.snaps.length === 0) delete next.snaps;
    else next.snaps = patch.snaps;
  }
  if (next.passLean == null && next.aggression == null && !next.snaps) {
    delete team.callSheet;
  } else {
    team.callSheet = next;
  }
}

export function clearCallSheets(state: GameState): void {
  for (const t of state.teams) {
    if (t.callSheet) delete t.callSheet;
  }
}

/** Fresh closure so a playoff replay does not reuse a spent snap index. */
export function userSimOpts(state: GameState, game: Game): SimOpts | undefined {
  const userIn = game.homeId === state.userTeamId || game.awayId === state.userTeamId;
  if (!userIn) return undefined;
  const snaps = state.teams[state.userTeamId].callSheet?.snaps;
  if (!snaps || snaps.length === 0) return undefined;
  let i = 0;
  return { playCaller: () => snaps[i++] ?? "auto" };
}

export function boxAttempts(box: BoxScore, teamId: number): { passAtt: number; rushAtt: number } {
  let passAtt = 0, rushAtt = 0;
  for (const s of box.players) {
    if (s.teamId !== teamId) continue;
    passAtt += s.passAtt;
    rushAtt += s.rushAtt;
  }
  return { passAtt, rushAtt };
}

export function callSheetView(team: Team) {
  const sheet = team.callSheet;
  return {
    passLean: sheet?.passLean,
    aggression: sheet?.aggression,
    hasSnaps: (sheet?.snaps?.length ?? 0) > 0,
    coachPassBias: team.coach.passBias,
    coachAggression: team.coach.aggression,
  };
}
