import { declareGamedayInactives } from "./inactives";
import { SnapInfo } from "./callSheet";
import { simulateGame, type SimResult } from "./sim/game";
import { Rng } from "./rng";
import { GameState, SnapCall } from "./types";

/**
 * Optional Play-the-Game session for the USER game only.
 *
 * Bulk-sim never enters here — it would freeze the league on snap clicks.
 * Each peek re-runs from a kickoff snapshot so in-game injuries do not stack.
 */

export class NeedSnapCall extends Error {
  readonly info: SnapInfo;
  constructor(info: SnapInfo) {
    super("need-snap-call");
    this.name = "NeedSnapCall";
    this.info = info;
  }
}

export type LiveView =
  | { done: false; info: SnapInfo; calls: SnapCall[] }
  | { done: true; result: SimResult; calls: SnapCall[] };

export function createLiveGame(state: GameState, gameId: number) {
  const kickoff = JSON.parse(JSON.stringify(state)) as GameState;
  const game = kickoff.games.find((g) => g.id === gameId);
  if (!game) throw new Error("No such game");
  declareGamedayInactives(kickoff, [game.homeId, game.awayId]);
  const rng0 = kickoff.rngState;
  const calls: SnapCall[] = [];

  const run = (rest: "throw" | "auto"): SimResult | SnapInfo => {
    const clone = JSON.parse(JSON.stringify(kickoff)) as GameState;
    const g = clone.games.find((x) => x.id === gameId)!;
    let i = 0;
    try {
      return simulateGame(clone, g, new Rng(rng0), {
        playCaller: (info) => {
          if (i < calls.length) return calls[i++];
          if (rest === "auto") return "auto";
          throw new NeedSnapCall(info);
        },
      });
    } catch (e) {
      if (e instanceof NeedSnapCall) return e.info;
      throw e;
    }
  };

  const peek = (): LiveView => {
    const out = run("throw");
    if ("box" in out) return { done: true, result: out, calls: calls.slice() };
    return { done: false, info: out, calls: calls.slice() };
  };

  return {
    call(choice: SnapCall): LiveView {
      calls.push(choice);
      return peek();
    },
    finishAuto(): LiveView {
      const result = run("auto");
      if (!("box" in result)) throw new Error("finishAuto still needs a snap");
      return { done: true, result, calls: calls.slice() };
    },
    peek,
    snaps: () => calls.slice(),
  };
}
