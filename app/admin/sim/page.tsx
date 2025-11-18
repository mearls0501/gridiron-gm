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
  const { currentWeek, currentSeason, setCurrentWeek, setCurrentSeason } =
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
    "week" | "next_week" | "playoffs" | "offseason"
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
  }, [season, week, mounted]);

  async function checkSeasonStatus() {
    try {
      const { data: seasonData, error } = await supabase
        .from("seasons")
        .select("phase, champion_team_id")
        .eq("year", season)
        .eq("is_active", true)
        .maybeSingle();

      // If no season record exists or error (but not a "not found" error), check playoff games
      if (error && error.code !== "PGRST116") {
        console.error("Error fetching season status:", error);
        // Continue to check playoff games as fallback
      }

      if (seasonData) {
        setSeasonPhase(seasonData.phase || "regular_season");
        setChampionCrowned(!!seasonData.champion_team_id);
      } else {
        // If no season record exists, check playoff games for champion
        const { data: superBowl, error: sbError } = await supabase
          .from("playoff_games")
          .select("winner_id, played")
          .eq("season", season)
          .eq("round", "super_bowl")
          .maybeSingle();

        if (sbError && sbError.code !== "PGRST116") {
          console.error("Error checking Super Bowl:", sbError);
        }

        if (superBowl?.played && superBowl?.winner_id) {
          setChampionCrowned(true);
          setSeasonPhase("playoffs");
        } else {
          // Default to regular season if nothing found
          setSeasonPhase("regular_season");
          setChampionCrowned(false);
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
        body: JSON.stringify({ season }),
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

  async function fetchGames() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("games")
        .select("*")
        .eq("season", season)
        .eq("week", week)
        .order("home_team_id", { ascending: true });

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
        body: JSON.stringify({ gameId }),
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
        body: JSON.stringify({ season, week }),
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
    advanceType: "next_week" | "playoffs" | "offseason"
  ) {
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
      const response = await fetch("/api/simulate-advance", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          season,
          currentWeek: week,
          advanceType,
        }),
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

                // Update week in store
                if (data.finalWeek) {
                  setWeek(data.finalWeek);
                  setCurrentWeek(data.finalWeek);
                }
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
    } catch (err) {
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
                  onClick={() => {
                    const newWeek = week + 1;
                    setWeek(newWeek);
                    setCurrentWeek(newWeek);
                  }}
                  className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors text-sm font-medium"
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
                                body: JSON.stringify({ season }),
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
