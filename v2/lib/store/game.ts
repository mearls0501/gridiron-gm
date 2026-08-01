"use client";

import { create } from "zustand";
import { GameState, Position, STARTERS, TRADE_DEADLINE_WEEK, defaultSettings } from "../core/types";
import { newGame, NewGameOptions } from "../core/newGame";
import { advance as advanceSeason } from "../core/season/engine";
import { advanceOffseason } from "../core/offseason";
import { saveGame, loadGame, listSaves, lastSaveId, deleteSave } from "./save";

/**
 * Single store holding the whole franchise.
 *
 * Every mutation goes through `apply`, which runs the change against the live
 * state object, bumps a revision counter to trigger re-render, and persists.
 * Because the entire save is one document, a write is atomic — there is no way
 * to end up with a roster that saved but a schedule that didn't.
 */

export type SimTarget = "deadline" | "seasonEnd" | "champion";

interface Store {
  state: GameState | null;
  rev: number;
  busy: boolean;
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
  simTo: (target: SimTarget) => void;
  setToast: (t: string | null) => void;
  setError: (e: string | null) => void;
}

export const useGame = create<Store>((set, get) => ({
  state: null,
  rev: 0,
  busy: false,
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
    const s = get().state;
    if (!s) return;
    try {
      const msg = fn(s);
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
      if (s.phase.startsWith("offseason")) return advanceOffseason(s);
      return advanceSeason(s);
    });
  },

  simTo(target) {
    get().apply((s) => {
      // Multi-step simulation inside ONE apply: the save writes once at the
      // end instead of once per week. Never crosses into the offseason —
      // those stages want the user's decisions.
      const reached = (): boolean => {
        if (s.phase.startsWith("offseason")) return true;
        switch (target) {
          case "deadline":
            return s.phase !== "regular" || s.week >= TRADE_DEADLINE_WEEK;
          case "seasonEnd":
            return s.phase !== "regular";
          case "champion":
            return false; // runs until the playoffs hand off to the offseason
        }
      };

      // Sim-pause: settings gate what interrupts the loop, never what the
      // sim does — a paused-and-resumed run calls the exact same sequence of
      // advances as an uninterrupted one, so the league comes out identical.
      const pauseOn = s.settings?.pauseOn ?? defaultSettings().pauseOn;
      const team = () => s.teams[s.userTeamId];
      const starterSet = (): Set<number> => {
        const ids = new Set<number>();
        for (const pos of Object.keys(STARTERS) as Position[]) {
          for (const id of (team().depthChart[pos] ?? []).slice(0, STARTERS[pos])) ids.add(id);
        }
        return ids;
      };
      const hurt = () =>
        s.players.filter((p) => p.teamId === s.userTeamId && p.injuryWeeks > 0).map((p) => p.id);

      let last = "";
      let paused: string | null = null;
      let guard = 0;
      while (!reached() && guard++ < 40) {
        const offersBefore = (s.tradeOffers ?? []).length;
        const hurtBefore = new Set(hurt());
        const logBefore = s.log.length;

        last = advanceSeason(s);

        if (pauseOn.tradeOffer && (s.tradeOffers ?? []).length > offersBefore) {
          paused = "a club called with a trade offer";
          break;
        }
        if (pauseOn.injuredStarter) {
          const starters = starterSet();
          const newlyHurt = hurt().filter((id) => !hurtBefore.has(id) && starters.has(id));
          if (newlyHurt.length > 0) {
            paused = "a starter went down";
            break;
          }
        }
        if (pauseOn.milestone && s.log.slice(logBefore).some((e) => e.kind === "milestone")) {
          paused = "a milestone fell";
          break;
        }
      }
      if (paused) return `Simulation paused — ${paused}. (${last})`;
      switch (target) {
        case "deadline":
          return s.phase === "regular" ? `Simmed to Week ${s.week} — the trade deadline` : last;
        case "seasonEnd":
        case "champion":
          return last;
      }
    });
  },

  setToast: (t) => set({ toast: t }),
  setError: (e) => set({ error: e }),
}));

/** Convenience: the loaded state, or throw-free null. */
export function useStateOrNull(): GameState | null {
  return useGame((s) => s.state);
}
