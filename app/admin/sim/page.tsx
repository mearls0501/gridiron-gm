"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase-client";
import { useGameStore } from "@/lib/store/game-store";
import SalaryCapWarning from "@/app/components/SalaryCapWarning";

// Extend Window interface for pending week update
declare global {
  interface Window {
    __pendingWeekUpdate?: number;
  }
}

interface Game {
  id: string;
  season: number;
  week: number;
  home_team_id: string;
  away_team_id: string;
  home_score: number | null;
  away_score: number | null;
  played: boolean;
  home_team?: { name: string; abbreviation?: string };
  away_team?: { name: string; abbreviation?: string };
}

export default function SimulateGamesPage() {
  const {
    currentWeek,
    currentSeason,
    setCurrentWeek,
    setCurrentSeason,
    setSeasonPhase,
    saveGameId,
  } = useGameStore();
  const [mounted, setMounted] = useState(false);
  const [season, setSeason] = useState<number>(2025);
  const [week, setWeek] = useState<number>(1);
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [result, setResult] = useState<{
    simulated?: number;
    total?: number;
    playoffsReady?: boolean;
    message?: string;
    champion?: { name: string };
    summary?: { totalGames: number; playoffGames: number };
    simulatedWeeks?: number;
    finalWeek?: number;
    finalSeason?: number;
    results?: Array<{
      week: number;
      simulated: number;
      total: number;
      errors?: Array<{ gameId: string; error: string }>;
    }>;
    success?: boolean;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rosterError, setRosterError] = useState<{
    message: string;
    invalidTeams: Array<{
      teamId: string;
      teamName: string;
      currentSize: number;
      needsPlayers: number;
      isUserTeam: boolean;
    }>;
  } | null>(null);
  const [progress, setProgress] = useState<{
    current: number;
    total: number;
    message: string;
  } | null>(null);
  const [simulationType, setSimulationType] = useState<
    "week" | "next_week" | "playoffs" | "offseason"
  >("week");
  const [teams, setTeams] = useState<
    Record<string, { name: string; abbreviation?: string }>
  >({});
  const [localSeasonPhase, setLocalSeasonPhase] =
    useState<string>("regular_season");
  const [championCrowned, setChampionCrowned] = useState(false);

  // Initialize from store after mount to avoid hydration mismatch
  useEffect(() => {
    setMounted(true);
    setSeason(currentSeason);
    setWeek(currentWeek);
  }, []);

  // Sync with game store after initial mount
  useEffect(() => {
    if (mounted) {
      setSeason(currentSeason);
      setWeek(currentWeek);
    }
  }, [currentSeason, currentWeek, mounted]);

  useEffect(() => {
    if (mounted) {
      fetchTeams();
      fetchGames();
      checkSeasonStatus();
    }
  }, [season, week, mounted, saveGameId]);

  async function checkSeasonStatus() {
    try {
      // CRITICAL: Query for the active season WITHOUT filtering by year first
      // This ensures we get the correct active season (2026) even if local state is stale (2025)
      let seasonQuery = supabase
        .from("seasons")
        .select("phase, champion_team_id, current_week, year")
        .eq("is_active", true)
        .order("year", { ascending: false }); // Get most recent active season first

      if (saveGameId) {
        seasonQuery = seasonQuery.eq("save_game_id", saveGameId);
      } else {
        seasonQuery = seasonQuery.is("save_game_id", null);
      }

      // Get the first (most recent) active season
      const { data: seasonData } = await seasonQuery.maybeSingle();

      console.log(
        "[Admin] Loaded season data:",
        seasonData,
        "for saveGameId:",
        saveGameId
      );

      // If no season record exists, use it to update all state
      if (seasonData) {
        const phase = seasonData.phase || "regular_season";
        setLocalSeasonPhase(phase);
        setSeasonPhase(phase);
        setChampionCrowned(!!seasonData.champion_team_id);

        // CRITICAL: Always sync season from database first - this ensures we're using the correct year
        if (seasonData.year !== undefined && seasonData.year !== season) {
          console.log(
            `[Admin] Syncing season from DB: ${season} -> ${seasonData.year}`
          );
          setSeason(seasonData.year);
          setCurrentSeason(seasonData.year);
        }

        // Sync week from database to ensure consistency
        if (
          seasonData.current_week !== undefined &&
          seasonData.current_week !== null
        ) {
          const dbWeek = seasonData.current_week;
          if (dbWeek !== week) {
            console.log(`[Admin] Syncing week from DB: ${week} -> ${dbWeek}`);
            setWeek(dbWeek);
            setCurrentWeek(dbWeek);
          }
        }

        // Use the season from database for playoff queries
        const activeSeason = seasonData.year;

        // Check playoff games for champion using the correct season
        let playoffQuery = supabase
          .from("playoff_games")
          .select("winner_id, played")
          .eq("season", activeSeason)
          .eq("round", "super_bowl");

        if (saveGameId) {
          playoffQuery = playoffQuery.eq("save_game_id", saveGameId);
        } else {
          playoffQuery = playoffQuery.is("save_game_id", null);
        }

        const { data: superBowl, error: sbError } =
          await playoffQuery.maybeSingle();

        if (sbError && sbError.code !== "PGRST116") {
          console.error("Error checking Super Bowl:", sbError);
        }

        if (superBowl?.played && superBowl?.winner_id) {
          setChampionCrowned(true);
        }
      } else {
        // If no season record exists, check playoff games for champion using local season as fallback
        let playoffQuery = supabase
          .from("playoff_games")
          .select("winner_id, played")
          .eq("season", season)
          .eq("round", "super_bowl");

        if (saveGameId) {
          playoffQuery = playoffQuery.eq("save_game_id", saveGameId);
        } else {
          playoffQuery = playoffQuery.is("save_game_id", null);
        }

        const { data: superBowl, error: sbError } =
          await playoffQuery.maybeSingle();

        if (sbError && sbError.code !== "PGRST116") {
          console.error("Error checking Super Bowl:", sbError);
        }

        if (superBowl?.played && superBowl?.winner_id) {
          setChampionCrowned(true);
          setLocalSeasonPhase("playoffs");
          setSeasonPhase("playoffs");
        } else {
          // Default to regular season if nothing found
          setLocalSeasonPhase("regular_season");
          setSeasonPhase("regular_season");
          setChampionCrowned(false);
        }
      }
    } catch (err) {
      console.error("Error checking season status:", err);
      // Set defaults on error
      setLocalSeasonPhase("regular_season");
      setSeasonPhase("regular_season");
      setChampionCrowned(false);
    }
  }

  async function advanceToOffseason() {
    setSimulating(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch("/api/offseason/advance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ season, saveGameId }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to advance to offseason");
      }

      setResult({
        message: data.message,
        summary: data.summary,
        champion: data.season.champion,
      });

      // Update state first
      setWeek(23);
      setCurrentWeek(23);
      setLocalSeasonPhase("offseason");
      setSeasonPhase("offseason");
      setChampionCrowned(!!data.season.champion);

      // Refresh games to show updated state
      await fetchGames();

      // Check season status (with error handling)
      try {
        await checkSeasonStatus();
      } catch (err) {
        // Silently handle errors from checkSeasonStatus after successful advance
        console.warn("Season status check after advance:", err);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to advance to offseason"
      );
    } finally {
      setSimulating(false);
    }
  }

  async function fetchTeams() {
    try {
      const { data, error } = await supabase
        .from("teams")
        .select("id, name, abbreviation");

      if (error) throw error;

      const teamsMap: Record<string, { name: string; abbreviation?: string }> =
        {};
      data?.forEach((team) => {
        teamsMap[team.id] = {
          name: team.name,
          abbreviation: team.abbreviation,
        };
      });
      setTeams(teamsMap);
    } catch (err) {
      console.error("Error fetching teams:", err);
    }
  }

  async function fetchGames(weekOverride?: number) {
    setLoading(true);
    try {
      // Use weekOverride if provided, otherwise use current week state
      const weekToUse = weekOverride !== undefined ? weekOverride : week;
      console.log(
        `[Admin] fetchGames called with week: ${weekToUse} (override: ${weekOverride}, state: ${week})`
      );

      // Build query - filter by save_game_id if available
      let gamesQuery = supabase
        .from("games")
        .select("*")
        .eq("season", season)
        .eq("week", weekToUse)
        .order("home_team_id", { ascending: true });

      if (saveGameId) {
        gamesQuery = gamesQuery.eq("save_game_id", saveGameId);
      } else {
        gamesQuery = gamesQuery.is("save_game_id", null);
      }

      const { data, error } = await gamesQuery;

      if (error) {
        // If table doesn't exist or no games, that's okay - we'll show a message
        if (
          error.code === "PGRST116" ||
          error.message.includes("does not exist")
        ) {
          setGames([]);
          setLoading(false);
          return;
        }
        throw error;
      }

      // Enrich with team names
      const enrichedGames = (data || []).map((game) => ({
        ...game,
        home_team: teams[game.home_team_id],
        away_team: teams[game.away_team_id],
      }));

      setGames(enrichedGames);
    } catch (err) {
      console.error("Error fetching games:", err);
      setError(err instanceof Error ? err.message : "Failed to fetch games");
      setGames([]);
    } finally {
      setLoading(false);
    }
  }

  async function simulateGame(gameId: string) {
    setSimulating(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch("/api/simulate-game", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ gameId, saveGameId }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to simulate game");
      }

      setResult(data);
      // Refresh games list
      await fetchGames();
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setSimulating(false);
    }
  }

  async function simulateWeek() {
    // Check for blocking tasks if not in auto mode
    const { settings, selectedTeamId } = useGameStore.getState();

    if (selectedTeamId) {
      try {
        const response = await fetch("/api/progression/status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            teamId: selectedTeamId,
            saveGameId,
            season,
            week,
            phase: "regular_season",
            settings,
          }),
        });

        const data = await response.json();
        if (data.progress?.blockingReason) {
          if (
            !confirm(
              `Blocking Task: ${data.progress.blockingReason}\n\nDo you want to simulate anyway? (Admin Override)`
            )
          ) {
            return;
          }
        }
      } catch (err) {
        console.error("Error checking progression status:", err);
      }
    }

    setSimulating(true);
    setError(null);
    setResult(null);
    setProgress({
      current: 0,
      total: unplayedGames.length || 1,
      message: `Simulating ${unplayedGames.length} games in Week ${week}...`,
    });

    try {
      const response = await fetch("/api/simulate-week-progress", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ season, week, saveGameId }),
      });

      if (!response.ok) {
        throw new Error("Failed to start simulation");
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error("No response stream available");
      }

      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();

        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));

              if (data.type === "start") {
                setProgress({
                  current: 0,
                  total: data.total,
                  message: `Simulating ${data.total} games in Week ${week}...`,
                });
              } else if (data.type === "progress") {
                setProgress({
                  current: data.completed,
                  total: data.total,
                  message: `Simulating game ${data.completed} of ${data.total} (${data.percentage}%)...`,
                });
              } else if (data.type === "complete") {
                setProgress({
                  current: data.completed,
                  total: data.total,
                  message: `Successfully simulated ${data.completed} games!`,
                });
                setResult({ simulated: data.completed, total: data.total });
              } else if (data.type === "error") {
                const errorMsg =
                  data.message || data.error || "Simulation error";
                setProgress(null);
                // If it's a roster validation error, show roster error modal
                if (data.error === "ROSTER_INVALID" && data.canAutoFix) {
                  console.error(
                    "Roster validation failed. Data received:",
                    JSON.stringify(data, null, 2)
                  );
                  console.log("Data keys:", Object.keys(data));
                  console.log("Has message:", !!data.message);
                  console.log("Has invalidTeams:", !!data.invalidTeams);
                  console.log(
                    "InvalidTeams length:",
                    data.invalidTeams?.length
                  );

                  // Ensure we have valid data before setting roster error
                  if (
                    data.message ||
                    (data.invalidTeams && data.invalidTeams.length > 0)
                  ) {
                    console.log("Setting roster error modal");
                    setRosterError({
                      message:
                        data.message ||
                        "Roster validation failed. Some teams don't have exactly 53 players.",
                      invalidTeams: data.invalidTeams || [],
                    });
                    setError(null); // Clear generic error
                  } else {
                    // Fallback if data is incomplete
                    console.error(
                      "Roster validation failed but no complete data provided. Keys:",
                      Object.keys(data)
                    );
                    setError(
                      "Roster validation failed. Please check that all teams have exactly 53 players."
                    );
                  }
                } else {
                  setError(errorMsg);
                  throw new Error(errorMsg);
                }
              } else if (data.type === "warning") {
                // Log warnings but don't stop simulation
                console.warn(data.message || "Simulation warning");
              }
            } catch (parseError) {
              console.error("Error parsing SSE data:", parseError);
            }
          }
        }
      }

      // Refresh games list - add a small delay to ensure database updates are committed
      await new Promise((resolve) => setTimeout(resolve, 500));
      await fetchGames();

      // Check if week 18 is complete and playoffs should be initialized
      if (week === 18 && unplayedGames.length === 0) {
        // Check if playoffs already exist
        try {
          const statusResponse = await fetch(
            `/api/playoffs/status?season=${season}`
          );
          const statusData = await statusResponse.json();

          if (!statusData.bracket || statusData.bracket.wildCard.length === 0) {
            // Playoffs not initialized - prompt user
            setResult({
              playoffsReady: true,
              message: `Week 18 complete! Ready to initialize playoffs.`,
            });
          }
        } catch (err) {
          console.error("Error checking playoff status:", err);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
      setProgress(null);
    } finally {
      setSimulating(false);
      // Keep progress for a moment to show completion
      setTimeout(() => setProgress(null), 3000);
    }
  }

  async function simulateAdvance(
    advanceType: "next_week" | "playoffs" | "offseason"
  ) {
    // Validate saveGameId before proceeding
    if (!saveGameId) {
      setError(
        "saveGameId is required. Please ensure you have a save game loaded."
      );
      return;
    }

    // Check for blocking tasks if not in auto mode
    const { settings, selectedTeamId } = useGameStore.getState();

    if (selectedTeamId) {
      try {
        // Determine phase based on advance type or current week
        let phaseToCheck = "regular_season";
        if (week >= 23) phaseToCheck = "offseason";
        else if (week >= 19) phaseToCheck = "playoffs";
        else if (week === 0) phaseToCheck = "preseason";

        const response = await fetch("/api/progression/status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            teamId: selectedTeamId,
            saveGameId,
            season,
            week,
            phase: phaseToCheck,
            settings,
          }),
        });

        const data = await response.json();
        if (data.progress?.blockingReason) {
          if (
            !confirm(
              `Blocking Task: ${data.progress.blockingReason}\n\nDo you want to simulate anyway? (Admin Override)`
            )
          ) {
            return;
          }
        }
      } catch (err) {
        console.error("Error checking progression status:", err);
      }
    }

    setSimulating(true);
    setError(null);
    setResult(null);

    // Calculate target week for progress tracking
    const targetWeek =
      advanceType === "next_week"
        ? week + 1
        : advanceType === "playoffs"
          ? 19
          : 23;
    const totalWeeks = Math.max(1, targetWeek - week);

    setProgress({
      current: 0,
      total: totalWeeks,
      message: `Starting simulation... (Week ${week} → Week ${targetWeek})`,
    });

    try {
      // Add timeout to fetch request
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 300000); // 5 minute timeout

      let response: Response;
      try {
        response = await fetch("/api/simulate-advance", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            season,
            currentWeek: week,
            advanceType,
            saveGameId,
          }),
          signal: controller.signal,
        });
      } catch (fetchError) {
        clearTimeout(timeoutId);
        if (fetchError instanceof Error && fetchError.name === "AbortError") {
          throw new Error(
            "Request timed out. The simulation may be taking too long."
          );
        }
        if (
          fetchError instanceof TypeError &&
          fetchError.message.includes("fetch")
        ) {
          throw new Error(
            "Network error: Unable to connect to server. Please check your connection and try again."
          );
        }
        throw fetchError;
      }
      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text().catch(() => "Unknown error");
        let errorMessage = "Failed to start simulation";
        try {
          const errorData = JSON.parse(errorText);
          errorMessage = errorData.error || errorMessage;
        } catch {
          errorMessage = errorText || errorMessage;
        }
        throw new Error(errorMessage);
      }

      const reader = response.body?.getReader();

      if (!reader) {
        throw new Error("No response stream available");
      }

      const decoder = new TextDecoder();
      let buffer = "";
      let streamError: Error | null = null;

      try {
        while (true) {
          const { done, value } = await reader.read();

          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              try {
                const data = JSON.parse(line.slice(6));

                if (data.type === "start") {
                  setProgress({
                    current: 0,
                    total: data.total,
                    message: data.message || `Starting simulation...`,
                  });
                } else if (data.type === "progress") {
                  setProgress({
                    current: data.current,
                    total: data.total,
                    message: data.message || `Simulating Week ${data.week}...`,
                  });
                } else if (data.type === "complete") {
                  setProgress({
                    current: data.current,
                    total: data.total,
                    message:
                      data.message ||
                      `Simulated ${data.simulatedWeeks || 0} week(s) successfully`,
                  });
                  setResult({
                    simulatedWeeks: data.simulatedWeeks,
                    finalWeek: data.finalWeek,
                    finalSeason: data.finalSeason,
                    results: data.results,
                    message: data.message,
                  });

                  // CRITICAL: Update season if it changed (e.g., advancing to new year)
                  if (data.finalSeason && data.finalSeason !== season) {
                    console.log(
                      `[Admin] Season advanced: ${season} -> ${data.finalSeason}`
                    );
                    setSeason(data.finalSeason);
                    setCurrentSeason(data.finalSeason);
                  }

                  // Update week and phase in store
                  if (data.finalWeek !== undefined && data.finalWeek !== null) {
                    console.log(
                      `[Admin] Updating week from ${week} to ${data.finalWeek}`
                    );
                    setWeek(data.finalWeek);
                    setCurrentWeek(data.finalWeek);

                    // Update phase based on week
                    let newPhase = "regular_season";
                    if (data.finalWeek >= 23) {
                      newPhase = "offseason";
                    } else if (data.finalWeek >= 19) {
                      newPhase = "playoffs";
                    } else if (data.finalWeek === 0) {
                      newPhase = "preseason";
                    }
                    setLocalSeasonPhase(newPhase);
                    setSeasonPhase(newPhase);

                    // Store finalWeek for use after simulation completes
                    window.__pendingWeekUpdate = data.finalWeek;
                  }
                } else if (data.type === "error") {
                  streamError = new Error(data.error || "Simulation error");
                  setError(data.error || "Simulation error");
                  setProgress(null);
                  break; // Exit the line processing loop
                } else if (data.type === "warning") {
                  // Log warnings but don't stop simulation
                  console.warn(data.message || "Simulation warning");
                }
              } catch (parseError) {
                console.error(
                  "Error parsing SSE data:",
                  parseError,
                  "Line:",
                  line
                );
              }
            }
          }

          // If we encountered an error, break out of the read loop
          if (streamError) {
            break;
          }
        }
      } catch (readError) {
        console.error("Error reading stream:", readError);
        if (readError instanceof Error) {
          if (
            readError.message.includes("network") ||
            readError.message.includes("fetch")
          ) {
            throw new Error(
              "Network error: Connection lost during simulation. Please try again."
            );
          }
          throw new Error(`Stream error: ${readError.message}`);
        }
        throw readError;
      } finally {
        reader.releaseLock();
      }

      // If we encountered a stream error, throw it now
      if (streamError) {
        throw streamError;
      }

      // Refresh season status first to ensure week is synced from database
      // Then fetch games for the updated week
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Check if we have a pending week update from the simulation
      let weekToFetch = week;
      const pendingWeek = window.__pendingWeekUpdate;
      if (pendingWeek !== undefined && pendingWeek !== null) {
        console.log(`[Admin] Using pending week update: ${pendingWeek}`);
        weekToFetch = pendingWeek;
        setWeek(pendingWeek);
        setCurrentWeek(pendingWeek);
        delete window.__pendingWeekUpdate;
      }

      // Check season status - this will sync week from database
      // We need to get the updated week value after this call
      await checkSeasonStatus(); // Refresh season data from database to ensure sync

      // After checkSeasonStatus, the week state should be updated
      // Wait a bit for state to propagate, then use the current week state
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Use the week from state (which should be updated by checkSeasonStatus)
      // But fall back to pendingWeek if state hasn't updated yet
      const finalWeekToFetch = week !== weekToFetch ? week : weekToFetch;
      console.log(
        `[Admin] Fetching games for week ${finalWeekToFetch} (state: ${week}, pending: ${weekToFetch}), season ${season}`
      );
      await fetchGames(finalWeekToFetch); // Fetch games for the updated week
    } catch (err) {
      console.error("[Admin] Simulation advance error:", err);
      let errorMessage = "An error occurred";

      if (err instanceof Error) {
        errorMessage = err.message;
        // Provide more helpful messages for common errors
        if (
          err.message.includes("timeout") ||
          err.message.includes("timed out")
        ) {
          errorMessage =
            "Simulation timed out. The operation may be taking too long. Please try again or simulate fewer weeks at once.";
        } else if (
          err.message.includes("network") ||
          err.message.includes("fetch") ||
          err.message.includes("Failed to fetch")
        ) {
          errorMessage =
            "Network error: Unable to connect to the server. Please check your connection and try again.";
        } else if (
          err.message.includes("aborted") ||
          err.message.includes("AbortError")
        ) {
          errorMessage = "Request was cancelled. Please try again.";
        }
      } else if (typeof err === "string") {
        errorMessage = err;
      }

      setError(errorMessage);
      setProgress(null);
    } finally {
      setSimulating(false);
      // Keep progress for a moment to show completion
      setTimeout(() => setProgress(null), 3000);
    }
  }

  const unplayedGames = games.filter((g) => !g.played);
  const playedGames = games.filter((g) => g.played);

  if (!mounted) {
    return (
      <div className="min-h-screen bg-gray-100 p-8">
        <div className="max-w-6xl mx-auto">
          <div className="bg-white rounded-lg shadow-md p-6">
            <p className="text-gray-900">Loading...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-6xl mx-auto">
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-6">
            Simulate Games
          </h1>

          {/* Salary Cap Warning */}
          <SalaryCapWarning />

          <div className="grid grid-cols-2 gap-4 mb-6">
            <div>
              <label
                htmlFor="season"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                Season
              </label>
              <input
                id="season"
                type="number"
                value={season}
                onChange={(e) => {
                  const newSeason = parseInt(e.target.value) || 2025;
                  setSeason(newSeason);
                  setCurrentSeason(newSeason);
                }}
                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div>
              <label
                htmlFor="week"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                Week (1-18)
              </label>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    if (week > 1) {
                      const newWeek = week - 1;
                      setWeek(newWeek);
                      setCurrentWeek(newWeek);
                    }
                  }}
                  disabled={week <= 1}
                  className="px-3 py-2 border border-gray-300 rounded-md hover:bg-gray-50 disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed transition-colors"
                >
                  ← Prev
                </button>
                <input
                  id="week"
                  type="number"
                  min="1"
                  max="18"
                  value={week}
                  onChange={(e) => {
                    const newWeek = parseInt(e.target.value) || 1;
                    setWeek(newWeek);
                    setCurrentWeek(newWeek);
                  }}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
                <button
                  onClick={() => {
                    if (week < 18) {
                      const newWeek = week + 1;
                      setWeek(newWeek);
                      setCurrentWeek(newWeek);
                    }
                  }}
                  disabled={week >= 18}
                  className="px-3 py-2 border border-gray-300 rounded-md hover:bg-gray-50 disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed transition-colors"
                >
                  Next →
                </button>
              </div>
            </div>
          </div>

          {playedGames.length > 0 &&
            unplayedGames.length === 0 &&
            week < 18 && (
              <div className="bg-blue-50 border border-blue-200 rounded-md p-4 mb-4">
                <p className="text-gray-900 font-medium mb-2">
                  ✅ All games in Week {week} are complete!
                </p>
                <button
                  onClick={async () => {
                    await simulateAdvance("next_week");
                  }}
                  disabled={simulating}
                  className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors text-sm font-medium flex items-center gap-2"
                >
                  {simulating ? (
                    <>
                      <span className="animate-spin">⏳</span> Advancing...
                    </>
                  ) : (
                    <>Advance to Week {week + 1} →</>
                  )}
                </button>
              </div>
            )}

          {result?.playoffsReady && (
            <div className="bg-green-50 border border-green-200 rounded-md p-4 mb-4">
              <p className="text-gray-900 font-medium mb-2">
                🏆{" "}
                {result.message ||
                  "Week 18 complete! Ready to initialize playoffs."}
              </p>
              <button
                onClick={async () => {
                  try {
                    setLoading(true);
                    const response = await fetch("/api/playoffs/initialize", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ season }),
                    });
                    const data = await response.json();
                    if (!response.ok) {
                      throw new Error(
                        data.error || "Failed to initialize playoffs"
                      );
                    }
                    setResult({
                      success: true,
                      message: data.message || "Playoffs initialized!",
                    });
                    // Redirect to playoffs page
                    window.location.href = `/league/playoffs?season=${season}`;
                  } catch (err) {
                    setError(
                      err instanceof Error
                        ? err.message
                        : "Failed to initialize playoffs"
                    );
                  } finally {
                    setLoading(false);
                  }
                }}
                className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 transition-colors text-sm font-medium"
              >
                Initialize Playoffs →
              </button>
            </div>
          )}

          {/* Simulation Options */}
          <div className="mb-4 space-y-3">
            <div className="flex items-center gap-3">
              <label className="text-sm font-medium text-gray-700 min-w-[120px]">
                Simulation Mode:
              </label>
              <select
                value={simulationType}
                onChange={(e) =>
                  setSimulationType(
                    e.target.value as
                      | "week"
                      | "next_week"
                      | "playoffs"
                      | "offseason"
                  )
                }
                disabled={simulating}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:text-gray-500"
              >
                <option value="week">Current Week Only</option>
                <option value="next_week">Simulate to Next Week</option>
                <option value="playoffs">Simulate to Playoffs</option>
                <option value="offseason">Simulate to Offseason</option>
              </select>
            </div>

            <button
              onClick={() => {
                if (simulationType === "week") {
                  simulateWeek();
                } else {
                  simulateAdvance(simulationType);
                }
              }}
              disabled={
                simulating ||
                (simulationType === "week" && unplayedGames.length === 0)
              }
              className="w-full bg-blue-600 text-white py-3 px-6 rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:text-gray-700 disabled:cursor-not-allowed transition-colors font-medium"
            >
              {simulating
                ? "Simulating..."
                : simulationType === "week"
                  ? `Simulate All Games in Week ${week} (${unplayedGames.length} unplayed)`
                  : simulationType === "next_week"
                    ? `Simulate to Week ${week + 1}`
                    : simulationType === "playoffs"
                      ? "Simulate to Playoffs (Week 19)"
                      : "Simulate to Offseason (Week 23)"}
            </button>
          </div>

          {/* Progress Bar / Loading Indicator */}
          {(progress || simulating) && (
            <div className="mb-4 bg-blue-50 border border-blue-200 rounded-md p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-900">
                  {progress?.message || "Simulating games..."}
                </span>
                {progress && (
                  <span className="text-sm font-medium text-gray-900">
                    {progress.current} / {progress.total}
                  </span>
                )}
              </div>
              <div className="w-full bg-blue-200 rounded-full h-2.5">
                {progress ? (
                  <div
                    className="bg-blue-600 h-2.5 rounded-full transition-all duration-300"
                    style={{
                      width: `${Math.min(100, (progress.current / progress.total) * 100)}%`,
                    }}
                  />
                ) : (
                  <div
                    className="bg-blue-600 h-2.5 rounded-full animate-pulse"
                    style={{ width: "100%" }}
                  />
                )}
              </div>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-md p-4 mb-4">
              <p className="text-gray-900 font-medium">Error:</p>
              <p className="text-gray-900">{error}</p>
            </div>
          )}

          {rosterError && (
            <div className="bg-yellow-50 border-2 border-yellow-400 rounded-lg p-6 mb-4">
              <div className="flex items-start mb-4">
                <div className="shrink-0">
                  <svg
                    className="h-6 w-6 text-yellow-600"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                    />
                  </svg>
                </div>
                <div className="ml-3 flex-1">
                  <h3 className="text-lg font-bold text-gray-900 mb-2">
                    ⚠️ Roster Validation Failed
                  </h3>
                  <div className="text-gray-900 mb-4 whitespace-pre-wrap">
                    {rosterError.message}
                  </div>
                  {rosterError.invalidTeams &&
                    rosterError.invalidTeams.length > 0 && (
                      <div className="bg-white rounded-md p-3 mb-4 max-h-48 overflow-y-auto">
                        <p className="font-medium text-sm mb-2">
                          Teams with invalid rosters:
                        </p>
                        <ul className="space-y-1 text-sm">
                          {rosterError.invalidTeams.map((team) => (
                            <li
                              key={team.teamId}
                              className={
                                team.isUserTeam
                                  ? "font-bold text-red-700"
                                  : "text-gray-700"
                              }
                            >
                              {team.isUserTeam && "👤 "}
                              {team.teamName}: {team.currentSize} players
                              {team.needsPlayers > 0 ? (
                                <span className="text-red-600">
                                  {" "}
                                  (need {team.needsPlayers} more)
                                </span>
                              ) : (
                                <span className="text-orange-600">
                                  {" "}
                                  (cut {Math.abs(team.needsPlayers)})
                                </span>
                              )}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  <div className="flex gap-3">
                    <button
                      onClick={async () => {
                        try {
                          console.log(
                            "[AutoFix] Button clicked, starting auto-fix..."
                          );
                          console.log("[AutoFix] Current state:", {
                            saveGameId,
                            season,
                            week,
                          });

                          setRosterError(null);
                          setSimulating(true);

                          const requestBody = {
                            saveGameId,
                            season,
                            week,
                            autoFix: true,
                          };

                          console.log("[AutoFix] Request body:", requestBody);

                          const response = await fetch(
                            "/api/roster-validate-and-fix",
                            {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify(requestBody),
                            }
                          );

                          console.log(
                            "[AutoFix] Response status:",
                            response.status,
                            response.statusText
                          );

                          if (!response.ok) {
                            const errorText = await response.text();
                            console.error(
                              "[AutoFix] Error response:",
                              errorText
                            );
                            throw new Error(
                              `Auto-fix request failed: ${response.status} ${errorText}`
                            );
                          }

                          const data = await response.json();
                          console.log("[AutoFix] Response data:", data);

                          if (data.success) {
                            const teamsFixed =
                              data.details?.filter(
                                (d: { playersAdded: number }) =>
                                  d.playersAdded > 0
                              ).length || 0;
                            const message = `✅ Auto-fixed! Added ${data.playersAdded} players to ${teamsFixed} teams. You can now simulate.`;
                            console.log("[AutoFix] Success!", message);
                            alert(message);
                          } else {
                            const errorMsg =
                              data.message || data.error || "Auto-fix failed";
                            console.error(
                              "[AutoFix] Auto-fix failed:",
                              errorMsg
                            );
                            setError(errorMsg);
                          }
                        } catch (err) {
                          console.error("[AutoFix] Exception caught:", err);
                          setError(
                            err instanceof Error
                              ? err.message
                              : "Auto-fix failed"
                          );
                        } finally {
                          console.log(
                            "[AutoFix] Cleaning up, setting simulating=false"
                          );
                          setSimulating(false);
                        }
                      }}
                      disabled={simulating}
                      className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 font-medium"
                    >
                      🤖 Auto-Fix All Rosters
                    </button>
                    <button
                      onClick={() => {
                        setRosterError(null);
                        // User will manually navigate to roster management
                      }}
                      className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 font-medium"
                    >
                      ✋ Fix Manually
                    </button>
                  </div>
                  <p className="text-xs text-gray-600 mt-3">
                    💡 Auto-fix will add minimum contract players to teams that
                    need more, or cut the lowest-rated players from teams that
                    are over 53.
                  </p>
                </div>
              </div>
            </div>
          )}

          {result && (
            <div className="bg-green-50 border border-green-200 rounded-md p-4 mb-4">
              <p className="text-gray-900 font-medium mb-2">Success!</p>
              <div className="text-gray-900">
                {result.simulated !== undefined ? (
                  <p>
                    Simulated {result.simulated} of {result.total} games
                  </p>
                ) : result.message ? (
                  <div>
                    <p className="font-semibold mb-2">{result.message}</p>
                    {result.champion && (
                      <p className="text-sm">
                        🏆 Champion: {result.champion.name}
                      </p>
                    )}
                    {result.summary && (
                      <div className="text-sm mt-2">
                        <p>📊 Total Games: {result.summary.totalGames}</p>
                        <p>🎯 Playoff Games: {result.summary.playoffGames}</p>
                      </div>
                    )}
                  </div>
                ) : (
                  <p>Game simulated successfully</p>
                )}
              </div>
            </div>
          )}

          {/* Show "Advance to Offseason" button if champion is crowned but not yet in offseason */}
          {/* Only show if we're past week 18 (playoffs/offseason territory) */}
          {(championCrowned || localSeasonPhase === "playoffs") &&
            localSeasonPhase !== "offseason" &&
            week >= 19 && (
              <div className="bg-purple-50 border border-purple-200 rounded-md p-4 mb-4">
                <div className="flex items-center justify-between flex-wrap gap-4">
                  <div className="flex-1 min-w-[300px]">
                    <p className="text-gray-900 font-medium mb-1">
                      {championCrowned
                        ? "🏆 Champion Crowned!"
                        : "🏈 Playoffs Complete"}
                    </p>
                    <p className="text-gray-700 text-sm">
                      {championCrowned
                        ? "The Super Bowl champion has been crowned. Finalize the season and advance to offseason to store historical data."
                        : "The playoffs are complete. If a champion has been crowned, you can finalize the season and advance to offseason."}
                    </p>
                  </div>
                  <button
                    onClick={advanceToOffseason}
                    disabled={simulating}
                    className="bg-purple-600 text-white px-6 py-2 rounded-md hover:bg-purple-700 disabled:bg-gray-400 disabled:text-gray-700 disabled:cursor-not-allowed transition-colors font-medium whitespace-nowrap"
                  >
                    {simulating ? "Advancing..." : "Advance to Offseason"}
                  </button>
                </div>
              </div>
            )}
        </div>

        {loading ? (
          <div className="bg-white rounded-lg shadow-md p-6 text-center">
            <p className="text-gray-900">Loading games...</p>
          </div>
        ) : (
          <>
            {unplayedGames.length > 0 && (
              <div className="bg-white rounded-lg shadow-md p-6 mb-6">
                <h2 className="text-2xl font-bold text-gray-900 mb-4">
                  Unplayed Games ({unplayedGames.length})
                </h2>
                <div className="space-y-2">
                  {unplayedGames.map((game) => (
                    <div
                      key={game.id}
                      className="flex items-center justify-between p-4 border border-gray-200 rounded-md hover:bg-gray-50"
                    >
                      <div className="flex-1">
                        <span className="font-medium text-gray-900">
                          {teams[game.away_team_id]?.name || game.away_team_id}
                        </span>
                        {" @ "}
                        <span className="font-medium text-gray-900">
                          {teams[game.home_team_id]?.name || game.home_team_id}
                        </span>
                      </div>
                      <button
                        onClick={() => simulateGame(game.id)}
                        disabled={simulating}
                        className="ml-4 bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 disabled:bg-gray-400 disabled:text-gray-700 disabled:cursor-not-allowed transition-colors text-sm"
                      >
                        Simulate
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {playedGames.length > 0 && (
              <div className="bg-white rounded-lg shadow-md p-6">
                <h2 className="text-2xl font-bold text-gray-900 mb-4">
                  Played Games ({playedGames.length})
                </h2>
                <div className="space-y-2">
                  {playedGames.map((game) => (
                    <div
                      key={game.id}
                      className="p-4 border border-gray-200 rounded-md bg-gray-50"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <span className="font-medium text-gray-900">
                            {teams[game.away_team_id]?.name ||
                              game.away_team_id}
                          </span>{" "}
                          <span className="text-gray-900 font-semibold">
                            {game.away_score}
                          </span>
                          {" @ "}
                          <span className="font-medium text-gray-900">
                            {teams[game.home_team_id]?.name ||
                              game.home_team_id}
                          </span>{" "}
                          <span className="text-gray-900 font-semibold">
                            {game.home_score}
                          </span>
                        </div>
                        <span className="text-sm text-gray-900 font-medium">
                          Week {game.week}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {games.length === 0 && !loading && (
              <div className="bg-white rounded-lg shadow-md p-6 text-center">
                {week >= 19 && week <= 22 ? (
                  <>
                    <p className="text-gray-900 mb-4 text-lg font-semibold">
                      🏆 Playoff Week {week}
                    </p>
                    <p className="text-gray-700 text-sm mb-4">
                      Regular season games are only played in weeks 1-18. Weeks
                      19-22 are playoff weeks.
                    </p>
                    <div className="bg-blue-50 border border-blue-200 rounded-md p-4 text-left">
                      <p className="text-gray-900 font-medium mb-2">
                        View Playoffs
                      </p>
                      <p className="text-gray-700 text-sm mb-4">
                        Navigate to the Playoffs page to view and simulate
                        playoff games.
                      </p>
                      <Link
                        href={`/league/playoffs?season=${season}`}
                        className="inline-block bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors text-sm font-medium"
                      >
                        Go to Playoffs →
                      </Link>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="text-gray-900 mb-4">
                      No games found for this week.
                    </p>
                    <p className="text-sm text-gray-700 mb-4">
                      Make sure you&apos;ve generated a schedule for season{" "}
                      {season}
                    </p>
                    <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4 text-left">
                      <p className="text-gray-900 font-medium mb-2">
                        ⚠️ Schedule Not in Database
                      </p>
                      <p className="text-gray-700 text-sm mb-3">
                        The schedule page generates games on-demand (in memory)
                        but doesn&apos;t save them to the database. To simulate
                        games, you need to save the schedule to the database
                        first.
                      </p>
                      <button
                        onClick={async () => {
                          setLoading(true);
                          try {
                            const response = await fetch(
                              "/api/generate-schedule",
                              {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ season, saveGameId }),
                              }
                            );
                            const data = await response.json();
                            if (response.ok) {
                              setResult({
                                success: true,
                                message: data.message,
                              });
                              await fetchGames();
                            } else {
                              setError(
                                data.error || "Failed to generate schedule"
                              );
                            }
                          } catch (err) {
                            setError(
                              err instanceof Error
                                ? err.message
                                : "Failed to generate schedule"
                            );
                          } finally {
                            setLoading(false);
                          }
                        }}
                        disabled={loading}
                        className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:text-gray-700 disabled:cursor-not-allowed transition-colors text-sm"
                      >
                        {loading
                          ? "Generating..."
                          : `Generate & Save Schedule for ${season}`}
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
