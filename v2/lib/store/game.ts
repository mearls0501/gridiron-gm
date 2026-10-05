"use client";

import { create } from "zustand";
import { GameState } from "../core/types";
import { ensureJerseyNumbers, maybeRetireNumbersForHallOfFame } from "../core/jersey";
import { newGame, NewGameOptions } from "../core/newGame";
import { advance as advanceSeason } from "../core/season/engine";
import { advanceOffseason } from "../core/offseason";
import { saveGame, loadGame, listSaves, lastSaveId, deleteSave } from "./save";
import { simToStepper, type SimTarget } from "./simTo";
import { offseasonContinueStepper, openingOffseasonLabel } from "./offseasonContinue";
import { draftNightStepper, drainDraftNight, type DraftNightMode, type DraftNightStep } from "./draftNight";
import { isPendingForcedMove } from "../core/owner";
import {
  DRAFT_PACE_MS,
  moveUpAlert,
  moveUpAlertKey,
  type DraftPace,
  type DraftTapeItem,
  type MoveUpAlert,
} from "../view/draftNight";

export type { SimTarget };

/**
 * Let the browser paint between Hub sim units. rAF runs before the next
 * paint; the timeout queued from it runs after that paint. No clock is read.
 */
function yieldToPaint(): Promise<void> {
  return new Promise((resolve) => {
    const afterPaint = () => setTimeout(resolve, 0);
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(afterPaint);
    else afterPaint();
  });
}

/** Hold the draft room on a pick. The wait is the pace. The draft does not read it. */
function yieldForPace(pace: DraftPace): Promise<void> {
  const ms = DRAFT_PACE_MS[pace];
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => {
    const afterPaint = () => setTimeout(resolve, ms);
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(afterPaint);
    else afterPaint();
  });
}

/** Blocks other mutations while Hub simTo, offseason Continue, or a paced draft is between steps. Not save state. */
let simActive = false;

/** Prospects the room already warned about. Not save state. */
const ignoredDraftAlerts = new Set<string>();
/**
 * The paced run waiting on a move-up alert. The stepper stays so the next
 * pick draws the same stream an uninterrupted night would. Not save state.
 */
let pausedDraft: {
  mode: DraftNightMode;
  pace: DraftPace;
  step: () => DraftNightStep;
} | null = null;

function clearDraftSession(): void {
  ignoredDraftAlerts.clear();
  pausedDraft = null;
}

/**
 * Single store holding the whole franchise.
 *
 * Every mutation goes through `apply`, which runs the change against the live
 * state object, bumps a revision counter to trigger re-render, and persists.
 * Hub simTo steps the same save and commits once at the end, yielding between
 * weeks so the tab can paint. Free agency and the draft do the same between
 * waves, trade slices, and picks.
 * Because the entire save is one document, a write is atomic — there is no way
 * to end up with a roster that saved but a schedule that didn't.
 */

interface Store {
  state: GameState | null;
  rev: number;
  busy: boolean;
  /** True while Hub simTo or offseason Continue is yielding. Not part of the save. */
  simming: boolean;
  /** Progress copy while `simming`. Not part of the save. */
  simLabel: string | null;
  /** Picks and clock trades the draft room is reading. Not part of the save. */
  draftTape: DraftTapeItem[];
  /** A starred name the public board says will not last. Not part of the save. */
  draftAlert: MoveUpAlert | null;
  error: string | null;
  toast: string | null;
  hydrated: boolean;

  bootstrap: () => Promise<void>;
  startNew: (opts: NewGameOptions) => Promise<void>;
  load: (id: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  saves: () => Promise<GameState[]>;

  apply: (fn: (s: GameState) => string | void) => void;
  advance: () => void;
  simTo: (target: SimTarget) => Promise<void>;
  simDraft: (mode: DraftNightMode, pace: DraftPace) => Promise<void>;
  dismissDraftAlert: () => void;
  cancelDraftRun: () => void;
  pushDraftTape: (item: DraftTapeItem) => void;
  setToast: (t: string | null) => void;
  setError: (e: string | null) => void;
}

async function continueOffseason(
  set: (partial: Partial<Store>) => void,
  get: () => Store,
): Promise<void> {
  if (simActive) return;
  const s = get().state;
  if (!s) return;
  if (s.phase !== "offseason-fa" && s.phase !== "offseason-draft") return;

  simActive = true;
  set({ simming: true, busy: true, simLabel: openingOffseasonLabel(s) });
  let closed = false;
  try {
    await yieldToPaint();
    const step = offseasonContinueStepper(s);
    let result = step();
    while (!result.done) {
      set({ state: { ...s }, rev: get().rev + 1, simLabel: result.label });
      await yieldToPaint();
      result = step();
    }
    ensureJerseyNumbers(s);
    maybeRetireNumbersForHallOfFame(s);
    const message = result.message;
    set({
      state: { ...s },
      rev: get().rev + 1,
      toast: message ? message : null,
      error: null,
      busy: false,
      simming: false,
      simLabel: null,
    });
    closed = true;
    void saveGame(s).catch((e) =>
      set({ error: e instanceof Error ? e.message : "Could not save. Your progress may be lost." })
    );
  } catch (e) {
    set({
      state: { ...s },
      rev: get().rev + 1,
      error: e instanceof Error ? e.message : "Something went wrong.",
      busy: false,
      simming: false,
      simLabel: null,
    });
    closed = true;
  } finally {
    simActive = false;
    if (!closed) set({ simming: false, busy: false, simLabel: null });
  }
}

async function simDraftNight(
  set: (partial: Partial<Store>) => void,
  get: () => Store,
  mode: DraftNightMode,
  pace: DraftPace,
  resume?: () => DraftNightStep,
): Promise<void> {
  if (simActive) return;
  const s = get().state;
  if (!s?.draft || s.draft.complete) return;

  simActive = true;
  if (!resume) pausedDraft = null;
  set({ simming: true, busy: true, simLabel: "The draft is on the clock", draftAlert: null });
  let closed = false;
  const tape = () => get().draftTape;
  const remember = (events: DraftTapeItem[]) => {
    if (events.length === 0) return tape();
    return [...tape(), ...events].slice(-8);
  };
  try {
    if (pace === "instant") {
      const drained = drainDraftNight(s, mode);
      ensureJerseyNumbers(s);
      maybeRetireNumbersForHallOfFame(s);
      set({
        state: { ...s },
        rev: get().rev + 1,
        toast: drained.message ? drained.message : null,
        error: null,
        busy: false,
        simming: false,
        simLabel: null,
        draftAlert: null,
        draftTape: drained.events.slice(-8),
      });
      closed = true;
      void saveGame(s).catch((e) =>
        set({ error: e instanceof Error ? e.message : "Could not save. Your progress may be lost." })
      );
      return;
    }

    await yieldToPaint();
    const step = resume ?? draftNightStepper(s, mode);
    while (true) {
      const alert = moveUpAlert(s, ignoredDraftAlerts);
      if (alert) {
        pausedDraft = { mode, pace, step };
        ensureJerseyNumbers(s);
        maybeRetireNumbersForHallOfFame(s);
        set({
          state: { ...s },
          rev: get().rev + 1,
          draftAlert: alert,
          busy: false,
          simming: false,
          simLabel: null,
          error: null,
        });
        closed = true;
        void saveGame(s).catch((e) =>
          set({ error: e instanceof Error ? e.message : "Could not save. Your progress may be lost." })
        );
        return;
      }
      const result = step();
      const nextTape = remember(result.events);
      if (result.done) {
        ensureJerseyNumbers(s);
        maybeRetireNumbersForHallOfFame(s);
        set({
          state: { ...s },
          rev: get().rev + 1,
          toast: result.message ? result.message : null,
          error: null,
          busy: false,
          simming: false,
          simLabel: null,
          draftAlert: null,
          draftTape: nextTape,
        });
        closed = true;
        void saveGame(s).catch((e) =>
          set({ error: e instanceof Error ? e.message : "Could not save. Your progress may be lost." })
        );
        return;
      }
      set({
        state: { ...s },
        rev: get().rev + 1,
        simLabel: result.label,
        draftTape: nextTape,
      });
      await yieldForPace(pace);
    }
  } catch (e) {
    set({
      state: { ...s },
      rev: get().rev + 1,
      error: e instanceof Error ? e.message : "Something went wrong.",
      busy: false,
      simming: false,
      simLabel: null,
    });
    closed = true;
  } finally {
    simActive = false;
    if (!closed) set({ simming: false, busy: false, simLabel: null });
  }
}

export const useGame = create<Store>((set, get) => ({
  state: null,
  rev: 0,
  busy: false,
  simming: false,
  simLabel: null,
  draftTape: [],
  draftAlert: null,
  error: null,
  toast: null,
  hydrated: false,

  async bootstrap() {
    try {
      const id = await lastSaveId();
      if (id) {
        const s = await loadGame(id);
        if (s) {
          set({ state: s, rev: get().rev + 1, hydrated: true });
          return;
        }
      }
      set({ hydrated: true });
    } catch (e) {
      set({ hydrated: true, error: e instanceof Error ? e.message : "Could not load saved games." });
    }
  },

  async startNew(opts) {
    set({ busy: true, error: null });
    try {
      clearDraftSession();
      const s = newGame(opts);
      await saveGame(s);
      set({
        state: s,
        rev: get().rev + 1,
        busy: false,
        toast: "Franchise created",
        draftTape: [],
        draftAlert: null,
      });
    } catch (e) {
      set({ busy: false, error: e instanceof Error ? e.message : "Could not create the franchise." });
    }
  },

  async load(id) {
    set({ busy: true, error: null });
    try {
      const s = await loadGame(id);
      if (!s) throw new Error("That save could not be found.");
      clearDraftSession();
      await saveGame(s);
      set({
        state: s,
        rev: get().rev + 1,
        busy: false,
        toast: "Franchise loaded",
        draftTape: [],
        draftAlert: null,
      });
    } catch (e) {
      set({ busy: false, error: e instanceof Error ? e.message : "Could not load that save." });
    }
  },

  async remove(id) {
    await deleteSave(id);
    if (get().state?.id === id) set({ state: null });
    set({ rev: get().rev + 1 });
  },

  saves: () => listSaves(),

  apply(fn) {
    if (simActive) return;
    const s = get().state;
    if (!s) return;
    try {
      const msg = fn(s);
      ensureJerseyNumbers(s);
      maybeRetireNumbersForHallOfFame(s);
      // Core mutates GameState in place for speed (a league is ~2,000 players,
      // so structural sharing per action would be wasteful). A shallow clone of
      // the root is enough to change identity, so `useGame(s => s.state)`
      // re-renders normally instead of every screen having to subscribe to a
      // revision counter and remember why.
      set({
        state: { ...s },
        rev: get().rev + 1,
        toast: typeof msg === "string" && msg ? msg : null,
        error: null,
      });
      void saveGame(s).catch((e) =>
        set({ error: e instanceof Error ? e.message : "Could not save. Your progress may be lost." })
      );
    } catch (e) {
      set({ error: e instanceof Error ? e.message : "Something went wrong." });
    }
  },

  advance() {
    const live = get().state;
    if (
      live &&
      !simActive &&
      !isPendingForcedMove(live) &&
      !live.forcedMove?.retired &&
      (live.phase === "offseason-fa" || live.phase === "offseason-draft")
    ) {
      void continueOffseason(set, get);
      return;
    }
    get().apply((s) => {
      if (isPendingForcedMove(s)) {
        return "The owner has ended your time here. Take an open chair or retire the save.";
      }
      if (s.forcedMove?.retired) return "You retired from the chair. The save remains.";
      if (s.phase.startsWith("offseason")) return advanceOffseason(s);
      return advanceSeason(s);
    });
  },

  async simTo(target) {
    if (simActive) return;
    const s = get().state;
    if (!s) return;
    if (isPendingForcedMove(s) || s.forcedMove?.retired) {
      get().apply((st) => {
        if (isPendingForcedMove(st)) {
          return "The owner has ended your time here. Take an open chair or retire the save.";
        }
        return "You retired from the chair. The save remains.";
      });
      return;
    }

    simActive = true;
    set({ simming: true, busy: true, simLabel: null });
    let closed = false;
    try {
      await yieldToPaint();
      const step = simToStepper(s, target);
      let result = step();
      while (!result.done) {
        set({ state: { ...s }, rev: get().rev + 1 });
        await yieldToPaint();
        result = step();
      }
      ensureJerseyNumbers(s);
      maybeRetireNumbersForHallOfFame(s);
      const message = result.message;
      set({
        state: { ...s },
        rev: get().rev + 1,
        toast: message ? message : null,
        error: null,
        busy: false,
        simming: false,
        simLabel: null,
      });
      closed = true;
      void saveGame(s).catch((e) =>
        set({ error: e instanceof Error ? e.message : "Could not save. Your progress may be lost." })
      );
    } catch (e) {
      set({
        state: { ...s },
        rev: get().rev + 1,
        error: e instanceof Error ? e.message : "Something went wrong.",
        busy: false,
        simming: false,
        simLabel: null,
      });
      closed = true;
    } finally {
      simActive = false;
      if (!closed) set({ simming: false, busy: false, simLabel: null });
    }
  },

  async simDraft(mode, pace) {
    await simDraftNight(set, get, mode, pace);
  },

  dismissDraftAlert() {
    const alert = get().draftAlert;
    if (alert) ignoredDraftAlerts.add(moveUpAlertKey(alert.season, alert.playerId));
    const run = pausedDraft;
    pausedDraft = null;
    set({ draftAlert: null });
    if (run) void simDraftNight(set, get, run.mode, run.pace, run.step);
  },

  cancelDraftRun() {
    if (simActive) return;
    pausedDraft = null;
    set({ draftAlert: null, simming: false, busy: false, simLabel: null });
  },

  pushDraftTape(item) {
    set({ draftTape: [...get().draftTape, item].slice(-8) });
  },

  setToast: (t) => set({ toast: t }),
  setError: (e) => set({ error: e }),
}));

/** Convenience: the loaded state, or throw-free null. */
export function useStateOrNull(): GameState | null {
  return useGame((s) => s.state);
}
