import { GameState } from "../core/types";
import { Rng } from "../core/rng";
import { settleWaivers } from "../core/waivers";
import { FA_ROUNDS, runFaWave, runOffseasonTrades, enterCampAfterDraft } from "../core/offseason";
import {
  DRAFT_UNTIL_USER_LIMIT,
  FULL_DRAFT_PICK_GUARD,
  buildDraftPicks,
  initDraft,
  stepDraftUntilUser,
  stepFullDraft,
} from "../core/offseason/draft";
import {
  DRAFT_DAY_TRADE_ATTEMPTS,
  ensurePickInventory,
  pruneStaleTradeInbox,
  runDraftDayTradeAttempts,
} from "../core/trades";

export type ContinueStep =
  | { done: false; label: string }
  | { done: true; message: string };

/**
 * Hub Continue for free agency and the draft.
 *
 * One step is one wave, one slice of the pre-draft trade search, or one
 * draft slot. `runOffseasonContinue` drains it synchronously and must match
 * `advanceOffseason`. The store yields between steps. No new RNG draws.
 */

/** Draft-weekend search is ~1.7s in one call. Slice it so a paint fits under a second. */
const DRAFT_TRADE_SLICE = 40;

const FA_TRADES = "Simming… Free agency trades";
const DRAFT_TRADES = "Simming… Draft day trades";
const CAMP = "Simming… Camp";

export function freeAgencyWaveLabel(round: number): string {
  return `Simming… Free Agency wave ${round}`;
}

export function draftPickLabel(state: GameState): string {
  const d = state.draft;
  const pick = d && !d.complete ? d.picks[d.onClock] : undefined;
  if (!pick) return "Simming… Draft";
  return `Simming… Round ${pick.round}, Pick ${pick.pick}`;
}

/** Label for the paint before the first step. */
export function openingOffseasonLabel(state: GameState): string {
  if (state.phase === "offseason-draft") return draftPickLabel(state);
  if (state.fa?.complete) return FA_TRADES;
  const round = state.fa && state.fa.round >= 1 ? state.fa.round : 1;
  return freeAgencyWaveLabel(round);
}

type Stage =
  | "prelude"
  | "waves"
  | "fa-trades"
  | "draft-open"
  | "draft-trades"
  | "until-user"
  | "full-pick"
  | "camp";

export function offseasonContinueStepper(s: GameState): () => ContinueStep {
  if (s.forcedMove?.retired) {
    const done: ContinueStep = { done: true, message: "You retired from the chair. The save remains." };
    return () => done;
  }

  const phase = s.phase;
  let stage: Stage = "prelude";
  let wave = 1;
  let draftRng: Rng | null = null;
  let tradeLeft = 0;
  let pickGuard = 0;
  let finished: ContinueStep | null = null;

  const finish = (message: string): ContinueStep => {
    finished = { done: true, message };
    return finished;
  };

  return () => {
    if (finished) return finished;

    if (phase === "offseason-fa") {
      if (stage === "prelude") {
        settleWaivers(s);
        pruneStaleTradeInbox(s);
        stage = "waves";
      }

      if (stage === "waves") {
        if (!s.fa?.complete && wave <= FA_ROUNDS) {
          wave += 1;
          runFaWave(s, wave - 1);
          const more = !s.fa?.complete && wave <= FA_ROUNDS;
          return { done: false, label: more ? freeAgencyWaveLabel(wave) : FA_TRADES };
        }
        stage = "fa-trades";
      }

      if (stage === "fa-trades") {
        runOffseasonTrades(s);
        stage = "draft-open";
        return { done: false, label: DRAFT_TRADES };
      }

      if (stage === "draft-open") {
        draftRng = new Rng(s.rngState);
        if (!s.draft || s.draft.season !== s.season) {
          s.draft = initDraft(s, draftRng);
        }
        ensurePickInventory(s);
        tradeLeft = DRAFT_DAY_TRADE_ATTEMPTS;
        stage = "draft-trades";
      }

      if (stage === "draft-trades") {
        const rng = draftRng!;
        const n = Math.min(DRAFT_TRADE_SLICE, tradeLeft);
        if (n > 0) {
          runDraftDayTradeAttempts(s, rng, n);
          tradeLeft -= n;
          if (tradeLeft > 0) return { done: false, label: DRAFT_TRADES };
        }
        if (s.draft) s.draft.picks = buildDraftPicks(s, s.draft.season);
        stage = "until-user";
        return { done: false, label: draftPickLabel(s) };
      }

      if (stage === "until-user") {
        const rng = draftRng!;
        if (pickGuard < DRAFT_UNTIL_USER_LIMIT) {
          pickGuard += 1;
          if (stepDraftUntilUser(s, rng) === "picked") {
            return { done: false, label: draftPickLabel(s) };
          }
        }
        s.rngState = rng.state;
        s.phase = "offseason-draft";
        return finish("Free agency closed — the draft is on the clock");
      }
    }

    if (phase === "offseason-draft") {
      if (stage === "prelude") {
        settleWaivers(s);
        pruneStaleTradeInbox(s);
        draftRng = new Rng(s.rngState);
        stage = "full-pick";
      }

      if (stage === "full-pick") {
        const rng = draftRng!;
        const d = s.draft;
        if (d && !d.complete && pickGuard < FULL_DRAFT_PICK_GUARD) {
          pickGuard += 1;
          if (stepFullDraft(s, rng) && s.draft && !s.draft.complete && s.draft.picks[s.draft.onClock]) {
            return { done: false, label: draftPickLabel(s) };
          }
        }
        if (s.draft) s.draft.complete = true;
        s.rngState = rng.state;
        stage = "camp";
        return { done: false, label: CAMP };
      }

      if (stage === "camp") {
        const rng = new Rng(s.rngState);
        enterCampAfterDraft(s, rng);
        s.rngState = rng.state;
        return finish("Draft complete");
      }
    }

    return finish("");
  };
}

export function runOffseasonContinue(s: GameState): string {
  const step = offseasonContinueStepper(s);
  let result = step();
  while (!result.done) result = step();
  return result.message;
}
