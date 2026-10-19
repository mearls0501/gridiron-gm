import { isActiveRoster } from "../lib/core/select";
import { isHoldoutInactive } from "../lib/core/psychology";
import { Game, GameState } from "../lib/core/types";

export interface RotationAvailability {
  readonly playerId: number;
  readonly teamId: number;
  readonly scheduledGames: number;
  readonly appearances: number;
  readonly snaps: number;
  readonly missedWeeks: number;
}

/** Freeze the completed regular season before playoff games can select a different roster. */
export function captureRotationNonappearance(state: GameState) {
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
    nonappearanceWeeks: rotation.reduce((n, p) => n + p.missedWeeks, 0),
  });
}

interface KickoffPlayer {
  readonly teamId: number | null;
  readonly status: string;
  readonly injuryWeeks: number;
  readonly sat: boolean;
  readonly holdout: boolean;
}
interface KickoffWeek {
  readonly games: ReadonlySet<number>;
  readonly teams: ReadonlySet<number>;
  readonly players: ReadonlyMap<number, KickoffPlayer>;
}

export interface AvailabilityMeasurement {
  readonly observedWeeks: number;
  readonly rosteredGameOpportunities: number;
  readonly injuredActiveWeeks: number;
  readonly injuredIrWeeks: number;
  readonly healthyIrWeeks: number;
  readonly injuryIrMissedWeeks: number;
  readonly rotationPlayers: number;
  readonly rotationNonappearanceWeeks: number;
  readonly rotationInjuryIrWeeks: number;
  readonly rotationHealthyScratchWeeks: number;
  readonly rotationHealthyNoRowWeeks: number;
  readonly rotationBenchWeeks: number;
  readonly rotationChurnWeeks: number;
  readonly rotationHoldoutWeeks: number;
  readonly rotationCalendarAdjustment: number;
}

/** The ledger lives in the harness, never on a save. Every observation copies primitives. */
export class RegularAvailabilityTracker {
  private readonly weeks = new Map<number, KickoffWeek>();
  constructor(private readonly season: number) {}

  readonly observeKickoff = (state: Readonly<GameState>, games: readonly Game[]): void => {
    if (state.season !== this.season || state.phase !== "regular" || !games.length ||
        games.some((g) => g.season !== this.season || g.week !== state.week || g.playoffRound !== null || g.played)) {
      throw new Error("availability requires a regular-season kickoff observation before games");
    }
    if (this.weeks.has(state.week)) throw new Error(`duplicate availability kickoff for week ${state.week}`);
    const gameIds = new Set<number>(), teams = new Set<number>();
    for (const g of games) {
      if (gameIds.has(g.id) || teams.has(g.homeId) || teams.has(g.awayId)) {
        throw new Error(`duplicate game/team at availability kickoff week ${state.week}`);
      }
      gameIds.add(g.id); teams.add(g.homeId); teams.add(g.awayId);
    }
    const players = new Map<number, KickoffPlayer>();
    for (const p of state.players) {
      if (p.retired || p.prospect) continue;
      if (players.has(p.id) || !Number.isFinite(p.injuryWeeks) || p.injuryWeeks < 0) {
        throw new Error(`invalid availability player ${p.id}`);
      }
      players.set(p.id, Object.freeze({
        teamId: p.teamId, status: p.status ?? "active", injuryWeeks: p.injuryWeeks,
        sat: p.teamId !== null && !!state.teams[p.teamId].inactives?.includes(p.id),
        holdout: isHoldoutInactive(state, p),
      }));
    }
    this.weeks.set(state.week, { games: gameIds, teams, players });
  };

  finish(state: GameState): AvailabilityMeasurement {
    if (state.season !== this.season) throw new Error("availability season changed before completion");
    const rotation = captureRotationNonappearance(state);
    const games = state.games.filter((g) => g.season === this.season && g.playoffRound === null);
    const expectedWeeks = new Set(games.map((g) => g.week));
    if (expectedWeeks.size !== this.weeks.size) throw new Error("availability is missing regular-season kickoff observations");
    const appearances = new Map<number, Set<number>>();
    for (const g of games) {
      const kickoff = this.weeks.get(g.week);
      if (!kickoff?.games.has(g.id)) throw new Error(`availability is missing kickoff for game ${g.id}`);
      if (!appearances.has(g.week)) appearances.set(g.week, new Set());
      const appeared = appearances.get(g.week)!;
      for (const row of g.boxScore!.players) {
        const p = kickoff.players.get(row.playerId);
        if (!p || p.teamId !== row.teamId || ![g.homeId, g.awayId].includes(row.teamId) ||
            p.status === "ps" || p.status === "ir" || p.injuryWeeks > 0 || p.sat) {
          throw new Error(`unavailable player ${row.playerId} appeared in game ${g.id}`);
        }
        if (appeared.has(row.playerId)) throw new Error(`duplicate weekly appearance for player ${row.playerId}`);
        appeared.add(row.playerId);
      }
    }
    let opportunities = 0, injuredActive = 0, injuredIr = 0, healthyIr = 0;
    for (const kickoff of this.weeks.values()) {
      for (const p of kickoff.players.values()) {
        if (p.teamId === null || !kickoff.teams.has(p.teamId) || p.status === "ps") continue;
        opportunities++;
        if (p.status === "ir") {
          if (p.injuryWeeks > 0) injuredIr++;
          else healthyIr++;
        } else if (p.injuryWeeks > 0) injuredActive++;
      }
    }
    if (!opportunities) throw new Error("availability has no rostered game opportunities");

    // Preserve the old rotation cohort solely to explain its nonappearance total.
    let rotationInjuryIr = 0, scratch = 0, noRow = 0, churn = 0, holdout = 0, calendar = 0;
    for (const row of rotation.rotation) {
      let gp = 0, expected = 0, missing = 0;
      for (const [week, kickoff] of this.weeks) {
        const p = kickoff.players.get(row.playerId);
        if (appearances.get(week)!.has(row.playerId)) { gp++; expected++; continue; }
        const hasGame = p?.teamId != null ? kickoff.teams.has(p.teamId) : kickoff.teams.has(row.teamId);
        if (!hasGame) continue;
        expected++; missing++;
        if (!p || p.teamId === null || p.status === "ps") churn++;
        else if (p.injuryWeeks > 0 || p.status === "ir") rotationInjuryIr++;
        else if (p.holdout) holdout++;
        else if (p.sat) scratch++;
        else noRow++;
      }
      const adjustment = row.scheduledGames - expected + Math.max(0, gp - row.scheduledGames);
      if (gp !== row.appearances || missing + adjustment !== row.missedWeeks) {
        throw new Error(`availability rotation does not reconcile for player ${row.playerId}`);
      }
      calendar += adjustment;
    }
    if (rotationInjuryIr + scratch + noRow + churn + holdout + calendar !== rotation.nonappearanceWeeks) {
      throw new Error("availability rotation diagnostics do not reconcile");
    }
    return Object.freeze({
      observedWeeks: this.weeks.size, rosteredGameOpportunities: opportunities,
      injuredActiveWeeks: injuredActive, injuredIrWeeks: injuredIr, healthyIrWeeks: healthyIr,
      injuryIrMissedWeeks: injuredActive + injuredIr + healthyIr,
      rotationPlayers: rotation.rotation.length, rotationNonappearanceWeeks: rotation.nonappearanceWeeks,
      rotationInjuryIrWeeks: rotationInjuryIr, rotationHealthyScratchWeeks: scratch,
      rotationHealthyNoRowWeeks: noRow, rotationBenchWeeks: scratch + noRow,
      rotationChurnWeeks: churn, rotationHoldoutWeeks: holdout, rotationCalendarAdjustment: calendar,
    });
  }
}
