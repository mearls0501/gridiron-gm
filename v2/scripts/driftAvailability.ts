import { isActiveRoster } from "../lib/core/select";
import { GameState } from "../lib/core/types";

export interface RotationAvailability {
  readonly playerId: number;
  readonly teamId: number;
  readonly scheduledGames: number;
  readonly appearances: number;
  readonly snaps: number;
  readonly missedWeeks: number;
}

/** Freeze the completed regular season before playoff games can select a different roster. */
export function captureRegularAvailability(state: GameState) {
  if (state.phase !== "playoffs" || state.games.some((g) =>
    g.season === state.season && g.playoffRound !== null && g.played)) {
    throw new Error("availability must be captured at regular-season completion, before playoffs");
  }
  const games = state.games.filter((g) => g.season === state.season && g.playoffRound === null);
  if (!games.length || games.some((g) => !g.played || !g.boxScore)) {
    throw new Error("availability requires a complete regular season with every box score");
  }
  const scheduled = new Map<number, number>();
  const usage = new Map<number, { appearances: number; snaps: number }>();
  for (const game of games) {
    for (const teamId of [game.homeId, game.awayId]) {
      scheduled.set(teamId, (scheduled.get(teamId) ?? 0) + 1);
    }
    const appeared = new Set<number>();
    for (const row of game.boxScore!.players) {
      if (appeared.has(row.playerId)) throw new Error(`duplicate appearance for player ${row.playerId} in game ${game.id}`);
      appeared.add(row.playerId);
      const old = usage.get(row.playerId) ?? { appearances: 0, snaps: 0 };
      old.appearances++;
      old.snaps += row.snaps;
      usage.set(row.playerId, old);
    }
  }
  const rotation: RotationAvailability[] = [];
  for (const p of state.players) {
    if (p.retired || p.prospect || p.teamId === null || !isActiveRoster(p)) continue;
    const played = usage.get(p.id);
    if (!played || played.snaps <= 100) continue;
    const scheduledGames = scheduled.get(p.teamId);
    if (!scheduledGames) throw new Error(`no regular-season schedule for rotation player ${p.id}`);
    rotation.push(Object.freeze({
      playerId: p.id, teamId: p.teamId, scheduledGames,
      appearances: played.appearances, snaps: played.snaps,
      missedWeeks: Math.max(0, scheduledGames - played.appearances),
    }));
  }
  if (!rotation.length) throw new Error("availability has no regular-season rotation observations");
  return Object.freeze({
    season: state.season,
    rotation: Object.freeze(rotation),
    playerWeeksLost: rotation.reduce((n, p) => n + p.missedWeeks, 0),
  });
}
