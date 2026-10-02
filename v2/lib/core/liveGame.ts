import { declareGamedayInactives } from "./inactives";
import { SnapInfo } from "./callSheet";
import { openGameSim, type LiveSnap, type SimResult } from "./sim/game";
import { buildDrives, lastCalledSnap } from "./sim/events";
import { Rng } from "./rng";
import {
  DriveSummary, GameState, PlayEvent, SealedLiveGame, SealedLiveInjury, SnapCall,
} from "./types";

/**
 * Optional Play-the-Game session for the USER game only.
 *
 * Bulk-sim never enters here — it would freeze the league on snap clicks.
 * The kickoff snapshot is cloned once and the sim stays on that clone.
 * Peek returns the last computed view so a re-render does not re-run the game.
 * call() / finishAuto() resume the paused play loop — they do not re-sim from
 * kickoff. Injuries land on the live clone. seal() records that result so
 * Play Week can commit it; the save RNG is not advanced here.
 * Views are built from the engine playLog yielded at each pause — no module
 * listener, so a CPU sim cannot leak plays into an open session.
 * The in-progress list is the user club's callSheet.snaps. resumeLiveGame
 * replays that list on a new generator.
 * finishAuto appends "auto" for each remaining user snap on that same list.
 */

export type LiveView =
  | {
      done: false;
      info: SnapInfo;
      calls: SnapCall[];
      plays: PlayEvent[];
      lastSnap: PlayEvent | null;
      drives: DriveSummary[];
    }
  | {
      done: true;
      result: SimResult;
      calls: SnapCall[];
      plays: PlayEvent[];
      lastSnap: PlayEvent | null;
      drives: DriveSummary[];
    };

export function createLiveGame(state: GameState, gameId: number) {
  const kickoff = JSON.parse(JSON.stringify(state)) as GameState;
  const game = kickoff.games.find((g) => g.id === gameId);
  if (!game) throw new Error("No such game");
  declareGamedayInactives(kickoff, [game.homeId, game.awayId]);
  const calls: SnapCall[] = [];
  const logAtKickoff = kickoff.log.length;
  const injuryAtKickoff = new Map<number, { weeks: number; desc: string | null }>();
  for (const p of kickoff.players) {
    injuryAtKickoff.set(p.id, { weeks: p.injuryWeeks, desc: p.injuryDesc });
  }
  const gen = openGameSim(kickoff, game, new Rng(kickoff.rngState));
  let step: IteratorResult<LiveSnap, SimResult> = gen.next();
  let cached: LiveView | null = null;

  const seal = (): SealedLiveGame | null => {
    if (!step.done) return null;
    const injuries: SealedLiveInjury[] = [];
    for (const p of kickoff.players) {
      const before = injuryAtKickoff.get(p.id);
      if (!before) continue;
      if (p.injuryWeeks === before.weeks && p.injuryDesc === before.desc) continue;
      injuries.push({
        playerId: p.id,
        injuryWeeks: p.injuryWeeks,
        injuryDesc: p.injuryDesc,
      });
    }
    const result = step.value;
    return {
      gameId,
      homeScore: result.homeScore,
      awayScore: result.awayScore,
      box: result.box,
      injuries,
      log: kickoff.log.slice(logAtKickoff),
    };
  };

  const pack = (
    log: PlayEvent[],
    extra: { done: false; info: SnapInfo } | { done: true; result: SimResult },
  ): LiveView => {
    const lastSnap = lastCalledSnap(log, state.userTeamId, calls.length);
    const shared = {
      calls: calls.slice(),
      plays: log,
      lastSnap,
      drives: buildDrives(log),
    };
    return extra.done ? { ...extra, ...shared } : { ...extra, ...shared };
  };

  const viewOf = (): LiveView => {
    if (step.done) {
      const result = step.value;
      return pack(result.plays, { done: true, result });
    }
    return pack(step.value.plays, { done: false, info: step.value.info });
  };

  const peek = (): LiveView => {
    if (cached) return cached;
    cached = viewOf();
    return cached;
  };

  return {
    call(choice: SnapCall): LiveView {
      if (step.done) return peek();
      calls.push(choice);
      cached = null;
      step = gen.next(choice);
      return peek();
    },
    finishAuto(): LiveView {
      while (!step.done) {
        calls.push("auto");
        step = gen.next("auto");
      }
      cached = viewOf();
      return cached;
    },
    peek,
    snaps: () => calls.slice(),
    seal,
  };
}

/** Store a finished live game on the save. Replaces any previous seal. */
export function writeSealedLive(state: GameState, seal: SealedLiveGame): void {
  state.sealedLive = JSON.parse(JSON.stringify(seal)) as SealedLiveGame;
}

/**
 * If this game is the sealed live result, copy its box, injuries, and
 * injury log onto the save and consume the seal. Any other game returns
 * null and leaves the seal in place.
 */
export function applySealedLive(state: GameState, gameId: number): SimResult | null {
  const seal = state.sealedLive;
  if (!seal || seal.gameId !== gameId) return null;
  for (const row of seal.injuries) {
    const p = state.players.find((x) => x.id === row.playerId);
    if (!p) continue;
    p.injuryWeeks = row.injuryWeeks;
    p.injuryDesc = row.injuryDesc;
  }
  for (const line of seal.log) state.log.push(line);
  const result: SimResult = {
    homeScore: seal.homeScore,
    awayScore: seal.awayScore,
    box: seal.box,
    plays: seal.box.plays ?? [],
  };
  delete state.sealedLive;
  return result;
}

export function clearSealedLive(state: GameState): void {
  if (state.sealedLive) delete state.sealedLive;
}

/**
 * Replay callSheet.snaps on a fresh live session. Missing snaps (an older
 * save, or a week not yet called) starts at the opening kickoff. Does not
 * write the save and does not draw on the save RNG.
 */
export function resumeLiveGame(state: GameState, gameId: number) {
  const live = createLiveGame(state, gameId);
  const snaps = state.teams[state.userTeamId].callSheet?.snaps;
  if (!snaps || snaps.length === 0) return live;
  let view = live.peek();
  for (const choice of snaps) {
    if (view.done) break;
    view = live.call(choice);
  }
  return live;
}
