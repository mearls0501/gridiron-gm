"use client";

import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/lib/supabase-client";
import Link from "next/link";
// Removed generateSchedule import - we only use database games

interface Team {
  id: string;
  name: string;
  abbreviation: string;
  conference: string;
  division: string;
}

interface Game {
  id: string;
  week: number;
  season: number;
  home_team_id: string;
  away_team_id: string;
  home_score: number | null;
  away_score: number | null;
  played: boolean;
}

interface GameWithTeams extends Game {
  home_team: Team;
  away_team: Team;
}

export default function SchedulePage() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [games, setGames] = useState<GameWithTeams[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<string>("all");
  const [selectedWeek, setSelectedWeek] = useState<string>("all");
  const [season, setSeason] = useState<number>(2025);
  const [loading, setLoading] = useState(true);
  const [teamGameCounts, setTeamGameCounts] = useState<Record<string, number>>(
    {}
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchTeams();
  }, []);

  // Teams are loaded in the first useEffect, schedule is generated in useMemo

  async function fetchTeams() {
    try {
      const { data, error } = await supabase
        .from("teams")
        .select("*")
        .order("conference", { ascending: true })
        .order("division", { ascending: true })
        .order("name", { ascending: true });

      if (error) throw error;
      setTeams(data || []);
    } catch (error) {
      console.error("Error fetching teams:", error);
    }
  }

  // Load games from database
  const [dbGames, setDbGames] = useState<GameWithTeams[]>([]);
  const [loadingGames, setLoadingGames] = useState(false);

  useEffect(() => {
    async function loadGamesFromDatabase() {
      setLoadingGames(true);
      try {
        const { data: games, error } = await supabase
          .from("games")
          .select("*")
          .eq("season", season)
          .order("week", { ascending: true })
          .order("home_team_id", { ascending: true });

        if (error) {
          console.error("Error loading games:", error);
          setDbGames([]);
          return;
        }

        // Enrich with team data
        const enrichedGames: GameWithTeams[] = (games || [])
          .map((game) => {
            const homeTeam = teams.find((t) => t.id === game.home_team_id);
            const awayTeam = teams.find((t) => t.id === game.away_team_id);

            if (!homeTeam || !awayTeam) return null;

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
            };
          })
          .filter((game): game is GameWithTeams => game !== null);

        setDbGames(enrichedGames);
      } catch (err) {
        console.error("Error loading games:", err);
        setDbGames([]);
      } finally {
        setLoadingGames(false);
      }
    }

    if (teams.length > 0) {
      loadGamesFromDatabase();
    }
  }, [teams, season]);

  // ONLY use database games - no fallback generation
  // Schedule must be generated via /api/generate-schedule and stored in database
  const gamesToDisplay = useMemo(() => {
    return dbGames;
  }, [dbGames]);

  useEffect(() => {
    if (teams.length > 0) {
      setLoading(true);
      try {
        // Only use database games - no generation
        if (gamesToDisplay.length === 0) {
          setError(
            `No schedule found in database for season ${season}. Please generate a schedule first using the Admin → Generate Schedule page.`
          );
          setGames([]);
          setTeamGameCounts({});
          setLoading(false);
          return;
        }

        setGames(gamesToDisplay);

        // Calculate game counts per team
        const counts: Record<string, number> = {};
        teams.forEach((team) => {
          counts[team.id] = 0;
        });

        gamesToDisplay.forEach((game) => {
          counts[game.home_team_id] = (counts[game.home_team_id] || 0) + 1;
          counts[game.away_team_id] = (counts[game.away_team_id] || 0) + 1;
        });

        setTeamGameCounts(counts);
        setError(null);
      } catch (error) {
        console.error("Error processing schedule:", error);
        setError(
          error instanceof Error ? error.message : "Failed to load schedule"
        );
        setGames([]);
        setTeamGameCounts({});
      } finally {
        setLoading(false);
      }
    } else if (teams.length === 0) {
      // Teams are still loading
      setLoading(true);
    }
  }, [gamesToDisplay, teams, season]);

  // Filter games based on selected team and week
  const filteredGames = games.filter((game) => {
    const teamMatch =
      selectedTeamId === "all" ||
      game.home_team_id === selectedTeamId ||
      game.away_team_id === selectedTeamId;

    const weekMatch =
      selectedWeek === "all" || game.week === parseInt(selectedWeek);

    return teamMatch && weekMatch;
  });

  // Get selected team info
  const selectedTeam = teams.find((t) => t.id === selectedTeamId);
  const teamGameCount =
    selectedTeamId !== "all" ? teamGameCounts[selectedTeamId] : null;

  // Group games by week
  const gamesByWeek = filteredGames.reduce(
    (acc, game) => {
      if (!acc[game.week]) {
        acc[game.week] = [];
      }
      acc[game.week].push(game);
      return acc;
    },
    {} as Record<number, GameWithTeams[]>
  );

  const weeks = Object.keys(gamesByWeek)
    .map(Number)
    .sort((a, b) => a - b);

  // Find teams with incorrect game counts
  const teamsWithIssues = teams.filter((team) => {
    const count = teamGameCounts[team.id] || 0;
    return count !== 17;
  });

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            League Schedule
          </h1>
          <p className="text-gray-600">
            View the complete schedule for the {season} season
          </p>
        </div>

        {/* Issue Alert */}
        {teamsWithIssues.length > 0 && (
          <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 mb-6">
            <div className="flex items-start gap-3">
              <svg
                className="w-6 h-6 text-orange-600 flex-shrink-0 mt-0.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
              <div className="flex-1">
                <h3 className="font-semibold text-orange-900 mb-2">
                  ⚠️ Schedule Issues Detected
                </h3>
                <p className="text-sm text-orange-800 mb-3">
                  {teamsWithIssues.length} team(s) do not have exactly 17 games:
                </p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {teamsWithIssues.map((team) => (
                    <button
                      key={team.id}
                      onClick={() => setSelectedTeamId(team.id)}
                      className="text-left px-3 py-2 bg-white rounded border border-orange-200 hover:border-orange-400 hover:bg-orange-50 transition-colors"
                    >
                      <div className="font-medium text-sm text-gray-900">
                        {team.name}
                      </div>
                      <div
                        className={`text-xs ${teamGameCounts[team.id] < 17 ? "text-red-600" : "text-orange-600"}`}
                      >
                        {teamGameCounts[team.id] || 0} games
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Stats Summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-sm text-gray-600 mb-1">Total Games</div>
            <div className="text-2xl font-bold text-gray-900">
              {games.length}
            </div>
            <div
              className={`text-xs mt-1 ${games.length === 272 ? "text-green-600" : "text-red-600"}`}
            >
              {games.length === 272 ? "✓ Correct (272)" : `⚠ Expected 272`}
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-sm text-gray-600 mb-1">Teams</div>
            <div className="text-2xl font-bold text-gray-900">
              {teams.length}
            </div>
            <div
              className={`text-xs mt-1 ${teams.length === 32 ? "text-green-600" : "text-orange-600"}`}
            >
              {teams.length === 32 ? "✓ Correct (32)" : `Expected 32`}
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-sm text-gray-600 mb-1">Complete Teams</div>
            <div className="text-2xl font-bold text-gray-900">
              {teams.length - teamsWithIssues.length}
            </div>
            <div
              className={`text-xs mt-1 ${teamsWithIssues.length === 0 ? "text-green-600" : "text-orange-600"}`}
            >
              {teamsWithIssues.length === 0
                ? "✓ All have 17 games"
                : `${teamsWithIssues.length} incomplete`}
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-sm text-gray-600 mb-1">Season</div>
            <div className="text-2xl font-bold text-gray-900">{season}</div>
            <div className="text-xs text-gray-500 mt-1">18 weeks</div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Team Filter */}
            <div>
              <label
                htmlFor="team-filter"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                Filter by Team
              </label>
              <select
                id="team-filter"
                value={selectedTeamId}
                onChange={(e) => setSelectedTeamId(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="all">All Teams ({games.length} games)</option>
                <optgroup label="AFC East">
                  {teams
                    .filter(
                      (t) => t.conference === "AFC" && t.division === "East"
                    )
                    .map((team) => (
                      <option key={team.id} value={team.id}>
                        {team.name} ({teamGameCounts[team.id] || 0} games)
                      </option>
                    ))}
                </optgroup>
                <optgroup label="AFC North">
                  {teams
                    .filter(
                      (t) => t.conference === "AFC" && t.division === "North"
                    )
                    .map((team) => (
                      <option key={team.id} value={team.id}>
                        {team.name} ({teamGameCounts[team.id] || 0} games)
                      </option>
                    ))}
                </optgroup>
                <optgroup label="AFC South">
                  {teams
                    .filter(
                      (t) => t.conference === "AFC" && t.division === "South"
                    )
                    .map((team) => (
                      <option key={team.id} value={team.id}>
                        {team.name} ({teamGameCounts[team.id] || 0} games)
                      </option>
                    ))}
                </optgroup>
                <optgroup label="AFC West">
                  {teams
                    .filter(
                      (t) => t.conference === "AFC" && t.division === "West"
                    )
                    .map((team) => (
                      <option key={team.id} value={team.id}>
                        {team.name} ({teamGameCounts[team.id] || 0} games)
                      </option>
                    ))}
                </optgroup>
                <optgroup label="NFC East">
                  {teams
                    .filter(
                      (t) => t.conference === "NFC" && t.division === "East"
                    )
                    .map((team) => (
                      <option key={team.id} value={team.id}>
                        {team.name} ({teamGameCounts[team.id] || 0} games)
                      </option>
                    ))}
                </optgroup>
                <optgroup label="NFC North">
                  {teams
                    .filter(
                      (t) => t.conference === "NFC" && t.division === "North"
                    )
                    .map((team) => (
                      <option key={team.id} value={team.id}>
                        {team.name} ({teamGameCounts[team.id] || 0} games)
                      </option>
                    ))}
                </optgroup>
                <optgroup label="NFC South">
                  {teams
                    .filter(
                      (t) => t.conference === "NFC" && t.division === "South"
                    )
                    .map((team) => (
                      <option key={team.id} value={team.id}>
                        {team.name} ({teamGameCounts[team.id] || 0} games)
                      </option>
                    ))}
                </optgroup>
                <optgroup label="NFC West">
                  {teams
                    .filter(
                      (t) => t.conference === "NFC" && t.division === "West"
                    )
                    .map((team) => (
                      <option key={team.id} value={team.id}>
                        {team.name} ({teamGameCounts[team.id] || 0} games)
                      </option>
                    ))}
                </optgroup>
              </select>
            </div>

            {/* Week Filter */}
            <div>
              <label
                htmlFor="week-filter"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                Filter by Week
              </label>
              <select
                id="week-filter"
                value={selectedWeek}
                onChange={(e) => setSelectedWeek(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="all">All Weeks</option>
                {[...Array(18)].map((_, i) => {
                  const week = i + 1;
                  const weekGames = games.filter((g) => g.week === week);
                  return (
                    <option key={week} value={week}>
                      Week {week} ({weekGames.length} games)
                    </option>
                  );
                })}
              </select>
            </div>

            {/* Season Filter */}
            <div>
              <label
                htmlFor="season-filter"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                Season
              </label>
              <input
                id="season-filter"
                type="number"
                value={season}
                onChange={(e) => setSeason(parseInt(e.target.value) || 2025)}
                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>

          {/* Selected Team Info */}
          {selectedTeam && (
            <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-md">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-blue-900">
                    {selectedTeam.name}
                  </h3>
                  <p className="text-sm text-blue-700">
                    {selectedTeam.conference} {selectedTeam.division}
                  </p>
                </div>
                <div className="text-right">
                  <div
                    className={`text-2xl font-bold ${teamGameCount === 17 ? "text-green-600" : "text-red-600"}`}
                  >
                    {teamGameCount} games
                  </div>
                  <div className="text-xs text-blue-600">
                    {teamGameCount === 17
                      ? "✓ Complete"
                      : `⚠ Missing ${17 - (teamGameCount || 0)} game(s)`}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Team Count Warning */}
        {teams.length > 0 && teams.length !== 32 && !loading && (
          <div className="bg-orange-50 border border-orange-200 rounded-lg p-6 mb-6">
            <div className="flex items-start gap-3">
              <svg
                className="w-6 h-6 text-orange-600 flex-shrink-0 mt-0.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
              <div className="flex-1">
                <h3 className="font-semibold text-orange-900 mb-2">
                  Incomplete Team Setup
                </h3>
                <p className="text-sm text-orange-800 mb-3">
                  Schedule generation requires exactly 32 teams. You currently
                  have {teams.length} teams.
                </p>
                <Link
                  href="/teams"
                  className="px-4 py-2 bg-orange-600 text-white rounded-md hover:bg-orange-700 text-sm inline-block"
                >
                  View Teams
                </Link>
              </div>
            </div>
          </div>
        )}

        {/* Error State */}
        {error && !loading && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-6 mb-6">
            <div className="flex items-start gap-3">
              <svg
                className="w-6 h-6 text-red-600 flex-shrink-0 mt-0.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <div className="flex-1">
                <h3 className="font-semibold text-red-900 mb-2">
                  Error Loading Schedule
                </h3>
                <p className="text-sm text-red-800 mb-3">{error}</p>
                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      setError(null);
                      // Force regeneration by updating season (triggers useMemo)
                      setSeason((prev) => prev);
                    }}
                    className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 text-sm"
                  >
                    Retry
                  </button>
                  <Link
                    href="/teams"
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm"
                  >
                    View Teams
                  </Link>
                </div>
                <p className="text-xs text-red-600 mt-3">
                  Make sure you have 32 teams in the database for schedule
                  generation.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            <p className="mt-4 text-gray-600">Loading schedule...</p>
          </div>
        )}

        {/* Schedule Display */}
        {!loading && filteredGames.length === 0 && (
          <div className="bg-white rounded-lg shadow p-12 text-center">
            <svg
              className="mx-auto h-12 w-12 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
            <h3 className="mt-4 text-lg font-medium text-gray-900">
              No games found
            </h3>
            <p className="mt-2 text-gray-500">
              No games scheduled for the selected filters.
            </p>
            <Link
              href="/admin/generate-schedule"
              className="mt-4 inline-block bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700"
            >
              Generate Schedule
            </Link>
          </div>
        )}

        {/* Games by Week */}
        {!loading &&
          weeks.map((week) => (
            <div key={week} className="bg-white rounded-lg shadow mb-6">
              <div className="bg-gray-50 border-b border-gray-200 px-6 py-3">
                <h2 className="text-lg font-semibold text-gray-900">
                  Week {week}
                  <span className="ml-2 text-sm font-normal text-gray-600">
                    ({gamesByWeek[week].length}{" "}
                    {gamesByWeek[week].length === 1 ? "game" : "games"})
                  </span>
                </h2>
              </div>
              <div className="divide-y divide-gray-200">
                {gamesByWeek[week].map((game) => {
                  const isHomeTeamSelected =
                    game.home_team_id === selectedTeamId;
                  const isAwayTeamSelected =
                    game.away_team_id === selectedTeamId;

                  return (
                    <div
                      key={game.id}
                      className={`p-4 hover:bg-gray-50 transition-colors ${
                        isHomeTeamSelected || isAwayTeamSelected
                          ? "bg-blue-50"
                          : ""
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-4">
                            {/* Away Team */}
                            <Link
                              href={`/teams/${game.away_team_id}`}
                              className={`flex-1 flex items-center justify-between p-3 rounded hover:bg-gray-100 ${
                                isAwayTeamSelected
                                  ? "bg-blue-100 font-semibold"
                                  : ""
                              }`}
                            >
                              <span className="font-medium">
                                {game.away_team.name}
                              </span>
                              <span className="text-sm text-gray-500">
                                {game.away_team.abbreviation}
                              </span>
                            </Link>

                            {/* @ Symbol */}
                            <div className="text-gray-400 font-bold">@</div>

                            {/* Home Team */}
                            <Link
                              href={`/teams/${game.home_team_id}`}
                              className={`flex-1 flex items-center justify-between p-3 rounded hover:bg-gray-100 ${
                                isHomeTeamSelected
                                  ? "bg-blue-100 font-semibold"
                                  : ""
                              }`}
                            >
                              <span className="font-medium">
                                {game.home_team.name}
                              </span>
                              <span className="text-sm text-gray-500">
                                {game.home_team.abbreviation}
                              </span>
                            </Link>
                          </div>
                        </div>

                        {/* Score or Status */}
                        <div className="ml-4 text-right min-w-[100px]">
                          {game.played &&
                          game.home_score !== null &&
                          game.away_score !== null ? (
                            <Link
                              href={`/games/${game.id}`}
                              className="font-semibold text-gray-900 hover:text-blue-600 transition-colors"
                            >
                              {game.away_score} - {game.home_score}
                            </Link>
                          ) : (
                            <div className="text-sm text-gray-500">
                              Not played
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}
