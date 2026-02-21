"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase-client";
import { useGameStore } from "@/lib/store/game-store";

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
  const { currentWeek, currentSeason, setCurrentWeek, setCurrentSeason, saveGameId } =
    useGameStore();
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
    results?: Array<{
      week: number;
      simulated: number;
      total: number;
      errors?: Array<{ gameId: string; error: string }>;
    }>;
    success?: boolean;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{
    current: number;
    total: number;
    message: string;
  } | null>(null);
  const [simulationType, setSimulationType] = useState<
    "week" | "next_week" | "regular_season" | "playoffs" | "offseason" | "preseason"
  >("week");
  const [teams, setTeams] = useState<
    Record<string, { name: string; abbreviation?: string }>
  >({});
  const [seasonPhase, setSeasonPhase] = useState<string>("regular_season");
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [season, week, mounted, saveGameId]);

  // Auto-generate schedule if needed (separate effect to avoid blocking)
  useEffect(() => {
    if (mounted && saveGameId && games.length === 0 && week >= 0 && week <= 18 && !loading) {
      const autoGenerateSchedule = async () => {
        try {
          console.log(`[Admin Sim] Auto-generating schedule for season ${season}...`);
          const { ensureScheduleExists } = await import("@/lib/utils/schedule");
          const scheduleResult = await ensureScheduleExists(season, saveGameId);
          if (scheduleResult.success) {
            if (scheduleResult.created) {
              console.log(`[Admin Sim] Successfully auto-generated schedule for season ${season}`);
            } else {
              console.log(`[Admin Sim] Schedule already exists for season ${season}`);
            }
            // Refresh games after schedule is generated
            await fetchGames();
          } else {
            console.error(`[Admin Sim] Failed to auto-generate schedule: ${scheduleResult.message}`);
            setError(`Failed to auto-generate schedule: ${scheduleResult.message}`);
          }
        } catch (scheduleErr) {
          console.error(`[Admin Sim] Error auto-generating schedule:`, scheduleErr);
          setError(`Error auto-generating schedule: ${scheduleErr instanceof Error ? scheduleErr.message : "Unknown error"}`);
        }
      };
      
      // Small delay to avoid race conditions
      const timeoutId = setTimeout(() => {
        autoGenerateSchedule();
      }, 500);
      
      return () => clearTimeout(timeoutId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, saveGameId, season, week, games.length, loading]);

  async function checkSeasonStatus() {
    try {
      // Filter by save_game_id to prevent cross-game data bleeding
      let seasonQuery = supabase
        .from("seasons")
        .select("phase, champion_team_id, current_week")
        .eq("year", season)
        .eq("is_active", true);
      
      if (saveGameId) {
        seasonQuery = seasonQuery.eq("save_game_id", saveGameId);
      } else {
        seasonQuery = seasonQuery.is("save_game_id", null);
      }
      
      const { data: seasonData, error } = await seasonQuery.maybeSingle();

      // If no season record exists or error (but not a "not found" error), check playoff games
      if (error && error.code !== "PGRST116") {
        console.error("Error fetching season status:", error);
        // Continue to check playoff games as fallback
      }

      if (seasonData) {
        setSeasonPhase(seasonData.phase || "regular_season");
        setChampionCrowned(!!seasonData.champion_team_id);
        // Update week if season data has current_week
        if (seasonData.current_week !== undefined && seasonData.current_week !== null) {
          setWeek(seasonData.current_week);
          setCurrentWeek(seasonData.current_week);
        }
      } else {
        // If no season record exists, check playoff games for champion - filter by save_game_id
        let superBowlQuery = supabase
          .from("playoff_games")
          .select("winner_id, played")
          .eq("season", season)
          .eq("round", "super_bowl");
        
        if (saveGameId) {
          superBowlQuery = superBowlQuery.eq("save_game_id", saveGameId);
        } else {
          superBowlQuery = superBowlQuery.is("save_game_id", null);
        }
        
        const { data: superBowl, error: sbError } = await superBowlQuery.maybeSingle();

        if (sbError && sbError.code !== "PGRST116") {
          console.error("Error checking Super Bowl:", sbError);
        }

        if (superBowl?.played && superBowl?.winner_id) {
          setChampionCrowned(true);
          setSeasonPhase("playoffs");
        } else {
          // Season doesn't exist for this save game - create it based on the selected week
          // Determine phase based on week
          let phase: "preseason" | "regular_season" | "playoffs" | "offseason" = "preseason";
          if (week === 0) {
            phase = "preseason";
          } else if (week >= 1 && week <= 18) {
            phase = "regular_season";
          } else if (week >= 19 && week <= 22) {
            phase = "playoffs";
          } else if (week === 23) {
            phase = "offseason";
          }
          
          // Try to create the season if saveGameId is available
          if (saveGameId) {
            try {
              const { getOrCreateSeason } = await import("@/lib/seasons/season-manager");
              const createResult = await getOrCreateSeason(season, saveGameId, {
                phase,
                currentWeek: week,
                isActive: true,
              });
              
              if (createResult.season) {
                setSeasonPhase(createResult.season.phase || phase);
                setChampionCrowned(!!createResult.season.champion_team_id);
                console.log(`[Sim Page] Created season ${season} with phase ${phase}, week ${week}`);
              } else {
                console.warn(`[Sim Page] Failed to create season ${season}:`, createResult.error);
                // Fall back to default
                setSeasonPhase(phase);
                setChampionCrowned(false);
              }
            } catch (createErr) {
              console.error(`[Sim Page] Error creating season ${season}:`, createErr);
              // Fall back to default
              setSeasonPhase(phase);
              setChampionCrowned(false);
            }
          } else {
            // No saveGameId - default based on week
            setSeasonPhase(phase);
            setChampionCrowned(false);
          }
        }
      }
    } catch (err) {
      console.error("Error checking season status:", err);
      // Set defaults on error
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

      // Redirect to offseason page after a short delay to show success message
      setTimeout(() => {
        window.location.href = "/offseason";
      }, 2000);
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
      const weekToFetch = weekOverride !== undefined ? weekOverride : week;
      let gamesQuery = supabase
        .from("games")
        .select("*")
        .eq("season", season)
        .eq("week", weekToFetch)
        .order("home_team_id", { ascending: true });
      
      // Filter by save_game_id if available
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
                setError(data.error || "Simulation error");
                setProgress(null);
                throw new Error(data.error || "Simulation error");
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
    advanceType: "next_week" | "regular_season" | "playoffs" | "offseason" | "preseason"
  ) {
    console.log('[simulateAdvance] Starting with advanceType:', advanceType, 'week:', week, 'season:', season, 'saveGameId:', saveGameId);
    setSimulating(true);
    setError(null);
    setResult(null);

    // Calculate target week for progress tracking
    const targetWeek =
      advanceType === "next_week"
        ? week + 1
        : advanceType === "regular_season"
          ? 1
          : advanceType === "playoffs"
            ? 19
            : advanceType === "offseason"
              ? 23
              : 0; // preseason
    const totalWeeks = Math.max(1, targetWeek - week);

    setProgress({
      current: 0,
      total: totalWeeks,
      message: `Starting simulation... (Week ${week} → Week ${targetWeek})`,
    });

    try {
      console.log('[simulateAdvance] Making API request to /api/simulate-advance with:', {
        season,
        currentWeek: week,
        advanceType,
        saveGameId,
      });
      
      const response = await fetch("/api/simulate-advance", {
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
      });

      console.log('[simulateAdvance] Response status:', response.status, 'ok:', response.ok);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[simulateAdvance] Response not OK:', errorText);
        throw new Error(`Failed to start simulation: ${response.status} ${errorText}`);
      }
      
      console.log('[simulateAdvance] Response OK, getting reader...');

      const reader = response.body?.getReader();

      if (!reader) {
        console.error('[simulateAdvance] No response stream available');
        throw new Error("No response stream available");
      }
      
      console.log('[simulateAdvance] Got reader, starting to read stream...');
      const decoder = new TextDecoder();
      let buffer = "";
      let hasReceivedData = false;
      let lastDataTime = Date.now();
      const STALL_TIMEOUT = 120000; // 2 minutes without data = stalled
      const heartbeatInterval = setInterval(() => {
        const timeSinceLastData = Date.now() - lastDataTime;
        if (timeSinceLastData > STALL_TIMEOUT && simulating) {
          console.error('[simulateAdvance] Stream appears stalled - no data for', timeSinceLastData, 'ms');
          setError(`Simulation appears to have stalled (no progress for ${Math.round(timeSinceLastData / 1000)}s). Please try again.`);
          setProgress(null);
          setSimulating(false);
          reader.cancel();
          clearInterval(heartbeatInterval);
        }
      }, 10000); // Check every 10 seconds

      while (true) {
        try {
          const { done, value } = await reader.read();
          
          if (done) {
            console.log('[simulateAdvance] Stream done, hasReceivedData:', hasReceivedData);
            clearInterval(heartbeatInterval);
            if (!hasReceivedData) {
              console.warn('[simulateAdvance] Stream closed without sending any data');
            }
            break;
          }
          
          hasReceivedData = true;
          lastDataTime = Date.now(); // Update last data time
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              try {
                const jsonStr = line.slice(6);
                console.log('[simulateAdvance] Received SSE data:', jsonStr.substring(0, 100));
                const data = JSON.parse(jsonStr);

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
                  results: data.results,
                  message: data.message,
                });

                // Update week, season, and phase in store FIRST before fetching games
                let newWeek = data.finalWeek;
                let newSeason = season;
                
                if (data.finalWeek !== undefined) {
                  setWeek(data.finalWeek);
                  setCurrentWeek(data.finalWeek);
                  newWeek = data.finalWeek;
                }
                
                // If advancing to preseason, update season
                if (advanceType === "preseason" && (data.finalWeek === 0 || data.finalSeason)) {
                  newSeason = data.finalSeason || season + 1;
                  setSeason(newSeason);
                  setCurrentSeason(newSeason);
                  setSeasonPhase("preseason");
                  const { useGameStore: gameStore } = await import("@/lib/store/game-store");
                  gameStore.getState().setSeasonPhase("preseason");
                } else if (advanceType === "regular_season") {
                  setSeasonPhase("regular_season");
                  const { useGameStore: gameStore } = await import("@/lib/store/game-store");
                  gameStore.getState().setSeasonPhase("regular_season");
                } else if (advanceType === "playoffs") {
                  setSeasonPhase("playoffs");
                  const { useGameStore: gameStore } = await import("@/lib/store/game-store");
                  gameStore.getState().setSeasonPhase("playoffs");
                } else if (advanceType === "offseason") {
                  setSeasonPhase("offseason");
                  const { useGameStore: gameStore } = await import("@/lib/store/game-store");
                  gameStore.getState().setSeasonPhase("offseason");
                }
                
                // Store the new week/season for use after state updates
                window.__pendingWeek = newWeek;
                window.__pendingSeason = newSeason;
              } else if (data.type === "error") {
                setError(data.error || "Simulation error");
                setProgress(null);
                throw new Error(data.error || "Simulation error");
              } else if (data.type === "warning") {
                // Log warnings but don't stop simulation
                console.warn('[simulateAdvance] Warning:', data.message || "Simulation warning");
              }
              } catch (parseError) {
                console.error("[simulateAdvance] Error parsing SSE data:", parseError, "Line:", line);
              }
            }
          }
        } catch (readError) {
          console.error("[simulateAdvance] Error reading from stream:", readError);
          throw readError;
        }
      }
      
      console.log('[simulateAdvance] Finished reading stream');

      // Refresh games list - add a small delay to ensure database updates are committed
      await new Promise((resolve) => setTimeout(resolve, 500));
      
      // If we have a pending week update, use it for fetching games
      const weekToFetch = (window as any).__pendingWeek !== undefined 
        ? (window as any).__pendingWeek 
        : week;
      const seasonToFetch = (window as any).__pendingSeason !== undefined 
        ? (window as any).__pendingSeason 
        : season;
      
      // Temporarily update week/season to ensure fetchGames uses correct values
      if (weekToFetch !== week) {
        setWeek(weekToFetch);
      }
      if (seasonToFetch !== season) {
        setSeason(seasonToFetch);
      }
      
      // Wait a bit for state to update, then fetch games and check season status
      await new Promise((resolve) => setTimeout(resolve, 200));
      await fetchGames();
      await checkSeasonStatus();
      
      // Clean up pending values
      delete (window as any).__pendingWeek;
      delete (window as any).__pendingSeason;
    } catch (err) {
      console.error('[simulateAdvance] Error in simulation:', err);
      setError(err instanceof Error ? err.message : "An error occurred");
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
                Week (0-23)
              </label>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    if (week > 0) {
                      const newWeek = week - 1;
                      setWeek(newWeek);
                      setCurrentWeek(newWeek);
                    }
                  }}
                  disabled={week <= 0}
                  className="px-3 py-2 border border-gray-300 rounded-md hover:bg-gray-50 disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed transition-colors"
                >
                  ← Prev
                </button>
                <input
                  id="week"
                  type="number"
                  min="0"
                  max="23"
                  value={week}
                  onChange={(e) => {
                    const newWeek = parseInt(e.target.value);
                    if (!isNaN(newWeek) && newWeek >= 0 && newWeek <= 23) {
                      setWeek(newWeek);
                      setCurrentWeek(newWeek);
                    }
                  }}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
                <button
                  onClick={() => {
                    if (week < 23) {
                      const newWeek = week + 1;
                      setWeek(newWeek);
                      setCurrentWeek(newWeek);
                    }
                  }}
                  disabled={week >= 23}
                  className="px-3 py-2 border border-gray-300 rounded-md hover:bg-gray-50 disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed transition-colors"
                >
                  Next →
                </button>
              </div>
            </div>
          </div>

          {games.length > 0 &&
            playedGames.length > 0 &&
            unplayedGames.length === 0 &&
            week < 23 && (
              <div className="bg-blue-50 border border-blue-200 rounded-md p-4 mb-4">
                <p className="text-gray-900 font-medium mb-2">
                  ✅ All games in Week {week} are complete!
                </p>
                <p className="text-sm text-gray-600 mb-3">
                  Ready to advance to Week {week + 1}?
                </p>
                <button
                  type="button"
                  onClick={async (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (!simulating && week < 23) {
                      const newWeek = week + 1;
                      
                      // Determine phase based on week
                      let phase: "preseason" | "regular_season" | "playoffs" | "offseason" = "regular_season";
                      if (newWeek === 0) {
                        phase = "preseason";
                      } else if (newWeek >= 19) {
                        phase = "playoffs";
                      } else if (newWeek >= 23) {
                        phase = "offseason";
                      } else {
                        phase = "regular_season";
                      }
                      
                      // Update season in database
                      try {
                        const { updateSeasonPhase } = await import("@/lib/seasons/season-manager");
                        const result = await updateSeasonPhase(season, saveGameId || null, phase, newWeek);
                        if (!result.success) {
                          console.error("Error updating season:", result.error);
                          setError(result.error || "Failed to advance week");
                          return;
                        }
                      } catch (err) {
                        console.error("Error updating season:", err);
                        setError(err instanceof Error ? err.message : "Failed to advance week");
                        return;
                      }
                      
                      // Clear games and results first to prevent showing advance button prematurely
                      setGames([]);
                      setResult(null);
                      
                      // Update local state - React will batch these updates
                      setWeek(newWeek);
                      setCurrentWeek(newWeek);
                      setSeasonPhase(phase);
                      
                      // Update game store
                      const { useGameStore: gameStore } = await import("@/lib/store/game-store");
                      gameStore.getState().setCurrentWeek(newWeek);
                      gameStore.getState().setSeasonPhase(phase);
                      
                      // Wait a moment for React to process state updates
                      await new Promise((resolve) => setTimeout(resolve, 100));
                      
                      // Explicitly fetch games for the new week (bypassing state to avoid stale closure)
                      await fetchGames(newWeek);
                      await checkSeasonStatus();
                      
                      // Force another refresh after useEffect has had time to run
                      // This ensures we have the latest data even if useEffect didn't trigger properly
                      setTimeout(async () => {
                        await fetchGames(newWeek);
                        await checkSeasonStatus();
                      }, 400);
                    }
                  }}
                  disabled={simulating || week >= 23}
                  className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:text-gray-700 disabled:cursor-not-allowed transition-colors text-sm font-medium"
                >
                  Advance to Week {week + 1} →
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
                      body: JSON.stringify({ season, saveGameId }),
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
                      | "regular_season"
                      | "playoffs"
                      | "offseason"
                      | "preseason"
                  )
                }
                disabled={simulating}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:text-gray-500"
              >
                <option value="week">Current Week Only</option>
                <option value="next_week">Simulate to Next Week</option>
                <option value="regular_season">Simulate to Regular Season</option>
                <option value="playoffs">Simulate to Playoffs</option>
                <option value="offseason">Simulate to Offseason</option>
                <option value="preseason">Simulate to Preseason</option>
              </select>
            </div>

            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log('[Sim Button] Clicked, simulationType:', simulationType, 'simulating:', simulating);
                if (simulationType === "week") {
                  console.log('[Sim Button] Calling simulateWeek()');
                  simulateWeek();
                } else {
                  console.log('[Sim Button] Calling simulateAdvance() with type:', simulationType);
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
                    : simulationType === "regular_season"
                      ? "Advance to Regular Season (Week 1)"
                      : simulationType === "playoffs"
                        ? "Simulate to Playoffs (Week 19)"
                        : simulationType === "offseason"
                          ? "Simulate to Offseason (Week 23)"
                          : "Advance to Preseason (Next Season)"}
            </button>
          </div>

          {/* Progress Bar / Loading Indicator */}
          {(progress || simulating) && (
            <div className="mb-4 bg-blue-50 border-2 border-blue-300 rounded-lg p-5 shadow-md">
              <div className="flex items-center justify-between mb-3">
                <span className="text-base font-semibold text-gray-900">
                  {progress?.message || "Simulating games..."}
                </span>
                {progress ? (
                  <span className="text-base font-semibold text-blue-700">
                    {Math.round((progress.current / progress.total) * 100)}% ({progress.current} / {progress.total})
                  </span>
                ) : (
                  <span className="text-base font-semibold text-blue-700 animate-pulse">
                    Processing...
                  </span>
                )}
              </div>
              <div className="w-full bg-gray-200 rounded-full h-4 overflow-hidden shadow-inner">
                {progress ? (
                  <div
                    className="bg-gradient-to-r from-blue-500 to-blue-600 h-4 rounded-full transition-all duration-500 ease-out flex items-center justify-end pr-2"
                    style={{
                      width: `${Math.min(100, (progress.current / progress.total) * 100)}%`,
                    }}
                  >
                    {progress.current > 0 && (
                      <span className="text-xs font-bold text-white">
                        {Math.round((progress.current / progress.total) * 100)}%
                      </span>
                    )}
                  </div>
                ) : (
                  <div className="bg-gradient-to-r from-blue-500 to-blue-600 h-4 rounded-full animate-pulse" style={{ width: "100%" }}></div>
                )}
              </div>
              {!progress && simulating && (
                <p className="mt-2 text-sm text-gray-600 text-center">
                  Please wait, simulation in progress...
                </p>
              )}
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-md p-4 mb-4">
              <p className="text-gray-900 font-medium">Error:</p>
              <p className="text-gray-900">{error}</p>
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
          {(championCrowned || seasonPhase === "playoffs") &&
            seasonPhase !== "offseason" && (
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

            {games.length === 0 && !loading && week >= 0 && week <= 18 && (
              <div className="bg-white rounded-lg shadow-md p-6 text-center">
                <p className="text-gray-900 mb-4">
                  No games found for Week {week} of Season {season}.
                </p>
                <p className="text-sm text-gray-700 mb-4">
                  The schedule should have been auto-generated. If this persists, please refresh the page.
                </p>
              </div>
            )}
            
            {games.length === 0 && !loading && week >= 19 && week <= 22 && (
              <div className="bg-white rounded-lg shadow-md p-6 text-center">
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
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
