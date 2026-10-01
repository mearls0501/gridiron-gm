"use client";

import { create } from "zustand";
import { GameState } from "../core/types";
import { ensureJerseyNumbers, maybeRetireNumbersForHallOfFame } from "../core/jersey";
import { newGame, NewGameOptions } from "../core/newGame";
import { advance as advanceSeason } from "../core/season/engine";
import { advanceOffseason } from "../core/offseason";
import { saveGame, loadGame, listSaves, lastSaveId, deleteSave } from "./save";
import { simToStepper, type SimTarget } from "./simTo";
import { isPendingForcedMove } from "../core/owner";

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

/** Blocks other mutations while a Hub simTo is between weeks. Not save state. */
let simActive = false;

/**
 * Single store holding the whole franchise.
 *
 * Every mutation goes through `apply`, which runs the change against the live
 * state object, bumps a revision counter to trigger re-render, and persists.
 * Hub simTo steps the same save and commits once at the end, yielding between
 * weeks so the tab can paint.
 * Because the entire save is one document, a write is atomic — there is no way
 * to end up with a roster that saved but a schedule that didn't.
 */

interface Store {
  state: GameState | null;
  rev: number;
  busy: boolean;
  /** True while Hub simTo is yielding between weeks. Not part of the save. */
  simming: boolean;
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
  setToast: (t: string | null) => void;
  setError: (e: string | null) => void;
}

export const useGame = create<Store>((set, get) => ({
  state: null,
  rev: 0,
  busy: false,
  simming: false,
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
      const s = newGame(opts);
      await saveGame(s);
      set({ state: s, rev: get().rev + 1, busy: false, toast: "Franchise created" });
    } catch (e) {
      set({ busy: false, error: e instanceof Error ? e.message : "Could not create the franchise." });
    }
  },

  async load(id) {
    set({ busy: true, error: null });
    try {
      const s = await loadGame(id);
      if (!s) throw new Error("That save could not be found.");
      await saveGame(s);
      set({ state: s, rev: get().rev + 1, busy: false, toast: "Franchise loaded" });
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
    set({ simming: true, busy: true });
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
      });
      closed = true;
    } finally {
      simActive = false;
      if (!closed) set({ simming: false, busy: false });
    }
  },

  setToast: (t) => set({ toast: t }),
  setError: (e) => set({ error: e }),
}));

/** Convenience: the loaded state, or throw-free null. */
export function useStateOrNull(): GameState | null {
  return useGame((s) => s.state);
}
