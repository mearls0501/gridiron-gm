import { create } from "zustand";

export interface GameSettings {
  autoScouting: boolean;
  autoDepthChart: boolean;
  autoRosterMoves: boolean; // covers injuries, cuts, signings
  autoTraining: boolean;
}

export const DEFAULT_SETTINGS: GameSettings = {
  autoScouting: false,
  autoDepthChart: false,
  autoRosterMoves: false,
  autoTraining: false,
};

interface GameState {
  currentWeek: number;
  currentSeason: number;
  seasonPhase: string | null;
  selectedTeamId: string | null;
  saveGameId: string | null;
  settings: GameSettings;
  
  setCurrentWeek: (week: number) => void;
  setCurrentSeason: (season: number) => void;
  setSeasonPhase: (phase: string | null) => void;
  setSelectedTeam: (teamId: string | null) => void;
  setSaveGameId: (saveGameId: string | null) => void;
  updateSettings: (settings: Partial<GameSettings>) => void;
  initializeFromStorage: () => void;
}

// Initialize from localStorage if available
function getInitialState() {
  // Always return default values on server to avoid hydration mismatch
  if (typeof window === "undefined") {
    return {
      currentWeek: 1,
      currentSeason: 2025,
      seasonPhase: null,
      selectedTeamId: null,
      saveGameId: null,
      settings: DEFAULT_SETTINGS,
    };
  }

  const storedTeamId = localStorage.getItem("selectedTeamId");
  const storedWeek = localStorage.getItem("currentWeek");
  const storedSeason = localStorage.getItem("currentSeason");
  const storedPhase = localStorage.getItem("seasonPhase");
  const storedSaveGameId = localStorage.getItem("saveGameId");
  const storedSettings = localStorage.getItem("gameSettings");

  return {
    currentWeek: storedWeek ? parseInt(storedWeek, 10) : 1,
    currentSeason: storedSeason ? parseInt(storedSeason, 10) : 2025,
    seasonPhase: storedPhase,
    selectedTeamId: storedTeamId,
    saveGameId: storedSaveGameId,
    settings: storedSettings ? { ...DEFAULT_SETTINGS, ...JSON.parse(storedSettings) } : DEFAULT_SETTINGS,
  };
}

export const useGameStore = create<GameState>((set) => ({
  ...getInitialState(),
  setCurrentWeek: (week) => {
    set({ currentWeek: week });
    if (typeof window !== "undefined") {
      localStorage.setItem("currentWeek", week.toString());
    }
  },
  setCurrentSeason: (season) => {
    set({ currentSeason: season });
    if (typeof window !== "undefined") {
      localStorage.setItem("currentSeason", season.toString());
    }
  },
  setSeasonPhase: (phase) => {
    set({ seasonPhase: phase });
    if (typeof window !== "undefined") {
      if (phase) {
        localStorage.setItem("seasonPhase", phase);
      } else {
        localStorage.removeItem("seasonPhase");
      }
    }
  },
  setSelectedTeam: (teamId) => {
    set({ selectedTeamId: teamId });
    if (typeof window !== "undefined") {
      if (teamId) {
        localStorage.setItem("selectedTeamId", teamId);
      } else {
        localStorage.removeItem("selectedTeamId");
      }
    }
  },
  setSaveGameId: (saveGameId) => {
    set({ saveGameId });
    if (typeof window !== "undefined") {
      if (saveGameId) {
        localStorage.setItem("saveGameId", saveGameId);
      } else {
        localStorage.removeItem("saveGameId");
      }
    }
  },
  updateSettings: (newSettings) => {
    set((state) => {
      const updated = { ...state.settings, ...newSettings };
      if (typeof window !== "undefined") {
        localStorage.setItem("gameSettings", JSON.stringify(updated));
      }
      return { settings: updated };
    });
  },
  initializeFromStorage: () => {
    const initialState = getInitialState();
    set(initialState);
  },
}));
