import { declareGamedayInactives } from "./inactives";
import { SnapInfo } from "./callSheet";
import { simulateGame, type SimResult } from "./sim/game";
import { buildDrives, lastCalledSnap, onPlayEvent } from "./sim/events";
import { Rng } from "./rng";
import { DriveSummary, GameState, PlayEvent, SnapCall } from "./types";

/**
 * Optional Play-the-Game session for the USER game only.
 *
 * Bulk-sim never enters here — it would freeze the league on snap clicks.
 * The kickoff snapshot is cloned once. Peek returns the last computed view
 * so a re-render does not re-run the game. call() / finishAuto() re-run from
 * that snapshot so in-game injuries do not stack across peeks.
 */

export class NeedSnapCall extends Error {
  readonly info: SnapInfo;
  plays: PlayEvent[] = [];
  constructor(info: SnapInfo) {
    super("need-snap-call");
    this.name = "NeedSnapCall";
    this.info = info;
  }
}

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
  const rng0 = kickoff.rngState;
  const calls: SnapCall[] = [];
  let cached: LiveView | null = null;

  const pack = (
    plays: PlayEvent[],
    extra: { done: false; info: SnapInfo } | { done: true; result: SimResult },
  ): LiveView => {
    const lastSnap = lastCalledSnap(plays, state.userTeamId, calls.length);
    const shared = {
      calls: calls.slice(),
      plays,
      lastSnap,
      drives: buildDrives(plays),
    };
    return extra.done ? { ...extra, ...shared } : { ...extra, ...shared };
  };

  const run = (rest: "throw" | "auto"): { info?: SnapInfo; result?: SimResult; plays: PlayEvent[] } => {
    const clone = JSON.parse(JSON.stringify(kickoff)) as GameState;
    const g = clone.games.find((x) => x.id === gameId)!;
    let i = 0;
    const plays: PlayEvent[] = [];
    const stop = onPlayEvent((e) => plays.push(e));
    try {
      const result = simulateGame(clone, g, new Rng(rng0), {
        playCaller: (info) => {
          if (i < calls.length) return calls[i++];
          if (rest === "auto") return "auto";
          throw new NeedSnapCall(info);
        },
      });
      return { result, plays: result.plays.length ? result.plays : plays };
    } catch (e) {
      if (e instanceof NeedSnapCall) return { info: e.info, plays };
      throw e;
    } finally {
      stop();
    }
  };

  const compute = (): LiveView => {
    const out = run("throw");
    if (out.result) {
      return pack(out.plays, { done: true, result: out.result });
    }
    return pack(out.plays, { done: false, info: out.info! });
  };

  const peek = (): LiveView => {
    if (cached) return cached;
    cached = compute();
    return cached;
  };

  return {
    call(choice: SnapCall): LiveView {
      calls.push(choice);
      cached = null;
      return peek();
    },
    finishAuto(): LiveView {
      const out = run("auto");
      if (!out.result) throw new Error("finishAuto still needs a snap");
      cached = pack(out.plays, { done: true, result: out.result });
      return cached;
    },
    peek,
    snaps: () => calls.slice(),
  };
}
