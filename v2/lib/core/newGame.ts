import { Rng } from "./rng";
import { createNewGame, NewGameOptions, refreshDepthCharts } from "./generate";
import { reconcileRoster } from "./offseason/contracts";
import { generateDraftClass, initialScoutingPass } from "./offseason/draft";
import { ensureScouting } from "./scouting";
import { GameState } from "./types";
import { ensurePickInventory } from "./trades";

/**
 * Composition root for a new franchise.
 *
 * Kept separate from `generate.ts` so that module never has to import the
 * offseason layer — a circular import between roster generation and cap
 * enforcement would be a load-order landmine under the bundler.
 */
export function newGame(opts: NewGameOptions = {}): GameState {
  const state = createNewGame(opts);
  const rng = new Rng(state.rngState);

  // Generated contracts can collectively exceed the cap; balance every team
  // before the franchise is handed to the player.
  for (const t of state.teams) reconcileRoster(state, t.id, rng);

  // Seed the first draft class so scouting is available from day one.
  generateDraftClass(state, rng, state.season);
  initialScoutingPass(state, state.season, rng);
  ensureScouting(state);

  ensurePickInventory(state);
  state.tradeOffers = [];
  state.nextTradeId = 1;

  refreshDepthCharts(state, true);
  state.rngState = rng.state;
  return state;
}

export type { NewGameOptions };
