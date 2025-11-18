import { create } from "zustand";

interface GameState {
  currentWeek: number;
  currentSeason: number;
  seasonPhase: string | null;
  selectedTeamId: string | null;
  setCurrentWeek: (week: number) => void;
  setCurrentSeason: (season: number) => void;
  setSeasonPhase: (phase: string | null) => void;
  setSelectedTeam: (teamId: string | null) => void;
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
    };
  }

  const storedTeamId = localStorage.getItem("selectedTeamId");
  const storedWeek = localStorage.getItem("currentWeek");
  const storedSeason = localStorage.getItem("currentSeason");

  const storedPhase = localStorage.getItem("seasonPhase");

  return {
    currentWeek: storedWeek ? parseInt(storedWeek, 10) : 1,
    currentSeason: storedSeason ? parseInt(storedSeason, 10) : 2025,
    seasonPhase: storedPhase,
    selectedTeamId: storedTeamId,
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
  initializeFromStorage: () => {
    const initialState = getInitialState();
    set(initialState);
  },
}));
