"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase-client";
import { useGameStore } from "@/lib/store/game-store";
import { Calendar, Home, Plane, Trophy } from "lucide-react";
import Link from "next/link";

interface Team {
  id: string;
  name: string;
  abbreviation: string;
  conference: string;
  division: string;
}

interface Game {
  id?: string;
  week: number;
  season?: number;
  home_team_id: string;
  away_team_id: string;
  home_score?: number | null;
  away_score?: number | null;
  played?: boolean;
}

interface GameWithTeams extends Game {
  home_team: Team;
  away_team: Team;
  isHome: boolean;
  opponent: Team;
}

export default function TeamSchedulePage() {
  const { saveGameId } = useGameStore();
  const [team, setTeam] = useState<Team | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [myTeamGames, setMyTeamGames] = useState<GameWithTeams[]>([]);
  const [loading, setLoading] = useState(true);
  const [season, setSeason] = useState<number>(2025);
  const [selectedWeek, setSelectedWeek] = useState<string>("all");
  const router = useRouter();

  useEffect(() => {
    loadTeamAndSchedule();
  }, []);

  async function loadTeamAndSchedule() {
    try {
      // Get selected team from localStorage
      let selectedTeamId: string | null = null;
      if (typeof window !== "undefined") {
        selectedTeamId = localStorage.getItem("selectedTeamId");
      }

      if (!selectedTeamId) {
        const { useGameStore } = await import("@/lib/store/game-store");
        selectedTeamId = useGameStore.getState().selectedTeamId;
      }

      if (!selectedTeamId) {
        router.push("/");
        return;
      }

      // Fetch all teams
      const { data: teamsData, error: teamsError } = await supabase
        .from("teams")
        .select("*")
        .order("conference", { ascending: true })
        .order("division", { ascending: true })
        .order("name", { ascending: true });

      if (teamsError) {
        console.error("Error loading teams:", teamsError);
        return;
      }

      setTeams(teamsData || []);

      // Find user's team
      const userTeam = teamsData?.find((t) => t.id === selectedTeamId);
      if (!userTeam) {
        console.error("User team not found");
        return;
      }

      setTeam(userTeam);
    } catch (err) {
      console.error("Error loading schedule:", err);
    } finally {
      setLoading(false);
    }
  }

  // Load games from database for user's team
  const [dbGames, setDbGames] = useState<GameWithTeams[]>([]);
  const [loadingGames, setLoadingGames] = useState(false);

  useEffect(() => {
    async function loadGamesFromDatabase() {
      if (!team) return;

      setLoadingGames(true);
      try {
        // Load games from database where this team is involved
        let gamesQuery = supabase
          .from("games")
          .select("*")
          .eq("season", season)
          .or(`home_team_id.eq.${team.id},away_team_id.eq.${team.id}`)
          .order("week", { ascending: true });
        
        // Filter by save_game_id if available
        if (saveGameId) {
          gamesQuery = gamesQuery.eq("save_game_id", saveGameId);
        } else {
          gamesQuery = gamesQuery.is("save_game_id", null);
        }
        
        const { data: games, error } = await gamesQuery;

        if (error) {
          console.error("Error loading games:", error);
          // Fallback to generated schedule if DB fails
          return;
        }

        // Enrich with team data and deduplicate
        const enrichedGames = (games || [])
          .map((game) => {
            const homeTeam = teams.find((t) => t.id === game.home_team_id);
            const awayTeam = teams.find((t) => t.id === game.away_team_id);

            if (!homeTeam || !awayTeam) return null;

            const isHome = game.home_team_id === team.id;
            const opponent = isHome ? awayTeam : homeTeam;

            return {
              id: game.id,
              week: game.week,
              season: game.season,
              home_team_id: game.home_team_id,
              away_team_id: game.away_team_id,
              home_score: game.home_score,
              away_score: game.away_score,
              played: game.played,
              home_team: homeTeam,
              away_team: awayTeam,
              isHome,
              opponent,
            };
          })
          .filter((game) => game !== null) as GameWithTeams[];

        // Deduplicate games by week + teams combination (this is what makes a game unique)
        // Use a consistent key format: always use the smaller team ID first to handle home/away duplicates
        const seenGames = new Set<string>();
        let duplicateCount = 0;
        const deduplicatedGames = enrichedGames.filter((game) => {
          // Create a consistent key regardless of home/away order
          const team1 = game.home_team_id < game.away_team_id ? game.home_team_id : game.away_team_id;
          const team2 = game.home_team_id < game.away_team_id ? game.away_team_id : game.home_team_id;
          const key = `week:${game.week}:${team1}:${team2}`;
          if (seenGames.has(key)) {
            duplicateCount++;
            console.warn(`Duplicate game detected and removed: Week ${game.week}, ${game.home_team_id} vs ${game.away_team_id} (ID: ${game.id})`);
            return false;
          }
          seenGames.add(key);
          return true;
        });

        if (duplicateCount > 0) {
          console.log(`Removed ${duplicateCount} duplicate game(s). Original: ${enrichedGames.length}, Deduplicated: ${deduplicatedGames.length}`);
        }

        setDbGames(deduplicatedGames);
      } catch (err) {
        console.error("Error loading games:", err);
      } finally {
        setLoadingGames(false);
      }
    }

    if (team && teams.length > 0) {
      loadGamesFromDatabase();
    }
  }, [team, teams, season, saveGameId]);

  // Use database games only - schedule must be generated via API and stored in database
  const teamGames = useMemo(() => {
    // Only use games from database - no client-side generation
    // If schedule doesn't exist, it should be generated via /api/generate-schedule
    return dbGames;
  }, [dbGames]);

  // Filter games by selected week
  const filteredTeamGames = useMemo(() => {
    if (selectedWeek === "all") {
      return teamGames;
    } else {
      const weekNum = parseInt(selectedWeek, 10);
      return teamGames.filter((game) => game.week === weekNum);
    }
  }, [teamGames, selectedWeek]);

  useEffect(() => {
    setMyTeamGames(filteredTeamGames);
  }, [filteredTeamGames]);

  // Calculate stats
  const totalGames = teamGames.length;
  const homeGames = teamGames.filter((g) => g.isHome).length;
  const awayGames = teamGames.filter((g) => !g.isHome).length;

  // Find bye week
  const allWeeks = new Set(teamGames.map((g) => g.week));
  const byeWeek = Array.from({ length: 18 }, (_, i) => i + 1).find(
    (week) => !allWeeks.has(week)
  );

  // Group games by week
  const gamesByWeek: Record<number, GameWithTeams[]> = {};
  myTeamGames.forEach((game) => {
    if (!gamesByWeek[game.week]) {
      gamesByWeek[game.week] = [];
    }
    gamesByWeek[game.week].push(game);
  });

  if (loading) {
    return (
      <div className="ootp-container">
        <div className="text-center py-12">
          <p className="text-gray-600">Loading schedule...</p>
        </div>
      </div>
    );
  }

  if (!team) {
    return (
      <div className="ootp-container">
        <div className="text-center py-12">
          <p className="text-red-600 mb-4">Team not found</p>
          <Link href="/" className="text-blue-600 hover:underline">
            Go to Home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="ootp-container">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="ootp-page-title">{team.name} Schedule</h1>
            <div className="flex items-center gap-4 mt-2 text-sm text-gray-600">
              <span>
                {team.conference} {team.division}
              </span>
              <span>•</span>
              <span>Season {season}</span>
            </div>
          </div>
          <Link
            href="/teams/my-team"
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
          >
            Back to My Team
          </Link>
        </div>
        <div className="h-1 w-24 bg-gradient-to-r from-blue-600 to-blue-400"></div>
      </div>

      {/* Schedule Stats */}
      <div className="ootp-grid ootp-grid-4 mb-8">
        <div className="ootp-panel">
          <div className="ootp-panel-header">Total Games</div>
          <div className="ootp-panel-body">
            <div className="text-3xl font-bold text-gray-900">{totalGames}</div>
            <div className="text-sm text-gray-600">Regular Season</div>
          </div>
        </div>
        <div className="ootp-panel">
          <div className="ootp-panel-header">Home Games</div>
          <div className="ootp-panel-body">
            <div className="flex items-center gap-2">
              <Home className="w-6 h-6 text-blue-600" />
              <div>
                <div className="text-3xl font-bold text-gray-900">
                  {homeGames}
                </div>
                <div className="text-sm text-gray-600">Games</div>
              </div>
            </div>
          </div>
        </div>
        <div className="ootp-panel">
          <div className="ootp-panel-header">Away Games</div>
          <div className="ootp-panel-body">
            <div className="flex items-center gap-2">
              <Plane className="w-6 h-6 text-green-600" />
              <div>
                <div className="text-3xl font-bold text-gray-900">
                  {awayGames}
                </div>
                <div className="text-sm text-gray-600">Games</div>
              </div>
            </div>
          </div>
        </div>
        <div className="ootp-panel">
          <div className="ootp-panel-header">Bye Week</div>
          <div className="ootp-panel-body">
            <div className="flex items-center gap-2">
              <Calendar className="w-6 h-6 text-purple-600" />
              <div>
                <div className="text-3xl font-bold text-gray-900">
                  {byeWeek || "N/A"}
                </div>
                <div className="text-sm text-gray-600">Week</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Week Filter */}
      <div className="ootp-panel mb-8">
        <div className="ootp-panel-header">Filter by Week</div>
        <div className="ootp-panel-body">
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setSelectedWeek("all")}
              className={`px-4 py-2 rounded-lg transition-colors ${
                selectedWeek === "all"
                  ? "bg-blue-600 text-white"
                  : "bg-gray-200 text-gray-700 hover:bg-gray-300"
              }`}
            >
              All Weeks
            </button>
            {Array.from({ length: 18 }, (_, i) => i + 1).map((week) => (
              <button
                key={week}
                onClick={() => setSelectedWeek(week.toString())}
                className={`px-4 py-2 rounded-lg transition-colors ${
                  selectedWeek === week.toString()
                    ? "bg-blue-600 text-white"
                    : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                }`}
              >
                Week {week}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Schedule by Week */}
      <div className="space-y-6">
        {Object.keys(gamesByWeek)
          .sort((a, b) => parseInt(a, 10) - parseInt(b, 10))
          .map((weekStr) => {
            const week = parseInt(weekStr, 10);
            const weekGames = gamesByWeek[week];
            return (
              <div key={week} className="ootp-panel">
                <div className="ootp-panel-header flex items-center gap-2">
                  <Calendar className="w-5 h-5" />
                  Week {week}
                </div>
                <div className="ootp-panel-body">
                  {weekGames.map((game, index) => (
                    <div
                      key={game.id || `${game.week}-${game.home_team_id}-${game.away_team_id}-${index}`}
                      className={`p-4 rounded-lg border-2 ${
                        game.isHome
                          ? "bg-blue-50 border-blue-200"
                          : "bg-green-50 border-green-200"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4 flex-1">
                          {game.isHome ? (
                            <>
                              <div className="flex items-center gap-2">
                                <Home className="w-5 h-5 text-blue-600" />
                                <span className="font-bold text-lg text-gray-900">
                                  {team.abbreviation}
                                </span>
                              </div>
                              <span className="text-gray-400">vs</span>
                              <Link
                                href={`/teams/${game.opponent.id}`}
                                className="font-semibold text-blue-600 hover:text-blue-800"
                              >
                                {game.opponent.name} (
                                {game.opponent.abbreviation})
                              </Link>
                            </>
                          ) : (
                            <>
                              <div className="flex items-center gap-2">
                                <Plane className="w-5 h-5 text-green-600" />
                                <Link
                                  href={`/teams/${game.opponent.id}`}
                                  className="font-semibold text-blue-600 hover:text-blue-800"
                                >
                                  {game.opponent.name} (
                                  {game.opponent.abbreviation})
                                </Link>
                              </div>
                              <span className="text-gray-400">@</span>
                              <span className="font-bold text-lg text-gray-900">
                                {team.abbreviation}
                              </span>
                            </>
                          )}
                        </div>
                        <div className="text-right">
                          {game.played &&
                          (game.home_score ?? null) !== null &&
                          (game.away_score ?? null) !== null &&
                          game.id ? (
                            <Link
                              href={`/games/${game.id}`}
                              className="font-semibold text-gray-900 hover:text-blue-600 transition-colors"
                            >
                              {game.isHome ? (
                                <>
                                  <span
                                    className={
                                      (game.home_score ?? 0) > (game.away_score ?? 0)
                                        ? "text-green-600"
                                        : "text-gray-600"
                                    }
                                  >
                                    {game.home_score ?? 0}
                                  </span>
                                  {" - "}
                                  <span
                                    className={
                                      (game.away_score ?? 0) > (game.home_score ?? 0)
                                        ? "text-green-600"
                                        : "text-gray-600"
                                    }
                                  >
                                    {game.away_score ?? 0}
                                  </span>
                                </>
                              ) : (
                                <>
                                  <span
                                    className={
                                      (game.away_score ?? 0) > (game.home_score ?? 0)
                                        ? "text-green-600"
                                        : "text-gray-600"
                                    }
                                  >
                                    {game.away_score ?? 0}
                                  </span>
                                  {" - "}
                                  <span
                                    className={
                                      (game.home_score ?? 0) > (game.away_score ?? 0)
                                        ? "text-green-600"
                                        : "text-gray-600"
                                    }
                                  >
                                    {game.home_score ?? 0}
                                  </span>
                                </>
                              )}
                            </Link>
                          ) : (
                            <>
                              <div className="text-sm text-gray-600">
                                {game.opponent.conference}{" "}
                                {game.opponent.division}
                              </div>
                              <div
                                className={`text-xs font-medium mt-1 ${
                                  game.isHome
                                    ? "text-blue-600"
                                    : "text-green-600"
                                }`}
                              >
                                {game.isHome ? "HOME" : "AWAY"}
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

        {/* Show bye week if applicable */}
        {byeWeek && selectedWeek === "all" && (
          <div className="ootp-panel">
            <div className="ootp-panel-header flex items-center gap-2">
              <Calendar className="w-5 h-5" />
              Week {byeWeek} - Bye Week
            </div>
            <div className="ootp-panel-body">
              <div className="p-4 bg-purple-50 border-2 border-purple-200 rounded-lg text-center">
                <p className="text-purple-700 font-medium">
                  No game scheduled - Bye Week
                </p>
              </div>
            </div>
          </div>
        )}

        {myTeamGames.length === 0 && (
          <div className="ootp-panel">
            <div className="ootp-panel-body text-center py-12">
              <Calendar className="w-12 h-12 mx-auto mb-4 text-gray-400" />
              <p className="text-gray-600">
                No games found for the selected filter
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
