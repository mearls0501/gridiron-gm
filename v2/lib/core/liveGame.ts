import { declareGamedayInactives } from "./inactives";
import { SnapInfo } from "./callSheet";
import { openGameSim, type LiveSnap, type SimResult } from "./sim/game";
import { buildDrives, lastCalledSnap } from "./sim/events";
import { Rng } from "./rng";
import { DriveSummary, GameState, PlayEvent, SnapCall } from "./types";

/**
 * Optional Play-the-Game session for the USER game only.
 *
 * Bulk-sim never enters here — it would freeze the league on snap clicks.
 * The kickoff snapshot is cloned once and the sim stays on that clone.
 * Peek returns the last computed view so a re-render does not re-run the game.
 * call() / finishAuto() resume the paused play loop — they do not re-sim from
 * kickoff. Injuries apply once, on the live clone, not on the save.
 * Views are built from the engine playLog yielded at each pause — no module
 * listener, so a CPU sim cannot leak plays into an open session.
 * The in-progress list is the user club's callSheet.snaps. resumeLiveGame
 * replays that list on a new generator. The save's RNG is not advanced.
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
  const gen = openGameSim(kickoff, game, new Rng(kickoff.rngState));
  let step: IteratorResult<LiveSnap, SimResult> = gen.next();
  let cached: LiveView | null = null;

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
  };
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
