"use client";

import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/lib/supabase-client";
import { useGameStore } from "@/lib/store/game-store";
import Link from "next/link";
import {
  Trophy,
  TrendingUp,
  TrendingDown,
  Calendar,
  Users,
  Award,
  BarChart3,
  ArrowRight,
} from "lucide-react";

interface Team {
  id: string;
  name: string;
  abbreviation: string;
  conference: string;
  division: string;
}

interface TeamStanding {
  team: Team;
  wins: number;
  losses: number;
  ties: number;
  pointsFor: number;
  pointsAgainst: number;
  pointDifferential: number;
  winPercentage: number;
  streak: string;
  playoffSeed: number | null;
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
  home_team?: Team;
  away_team?: Team;
}

interface LeagueLeader {
  player_id: string;
  full_name: string;
  position: string;
  team_abbreviation: string;
  stat_value: number;
  stat_name: string;
}

export default function LeaguePage() {
  const { currentSeason, currentWeek, saveGameId } = useGameStore();
  const [standings, setStandings] = useState<TeamStanding[]>([]);
  const [recentGames, setRecentGames] = useState<Game[]>([]);
  const [upcomingGames, setUpcomingGames] = useState<Game[]>([]);
  const [leaders, setLeaders] = useState<LeagueLeader[]>([]);
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted) {
      loadLeagueData();
    }
  }, [mounted, currentSeason, currentWeek, saveGameId]);

  async function loadLeagueData() {
    setLoading(true);
    try {
      await Promise.all([
        loadStandings(),
        loadRecentGames(),
        loadUpcomingGames(),
        loadLeaders(),
      ]);
    } catch (err) {
      console.error("Error loading league data:", err);
    } finally {
      setLoading(false);
    }
  }

  async function loadStandings() {
    try {
      // Calculate standings from games
      let gamesQuery = supabase
        .from("games")
        .select("home_team_id, away_team_id, home_score, away_score")
        .eq("season", currentSeason)
        .eq("played", true);
      
      // Filter by save_game_id if available
      if (saveGameId) {
        gamesQuery = gamesQuery.eq("save_game_id", saveGameId);
      } else {
        gamesQuery = gamesQuery.is("save_game_id", null);
      }
      
      const { data: games } = await gamesQuery;

      const { data: teams } = await supabase
        .from("teams")
        .select("id, name, abbreviation, conference, division")
        .order("conference")
        .order("division");

      if (!teams) return;

      const teamStatsMap = new Map<string, any>();

      teams.forEach((team) => {
        teamStatsMap.set(team.id, {
          team,
          wins: 0,
          losses: 0,
          ties: 0,
          pointsFor: 0,
          pointsAgainst: 0,
        });
      });

      games?.forEach((game) => {
        if (game.home_score === null || game.away_score === null) return;

        const homeStat = teamStatsMap.get(game.home_team_id)!;
        const awayStat = teamStatsMap.get(game.away_team_id)!;

        homeStat.pointsFor += game.home_score;
        homeStat.pointsAgainst += game.away_score;
        awayStat.pointsFor += game.away_score;
        awayStat.pointsAgainst += game.home_score;

        if (game.home_score > game.away_score) {
          homeStat.wins += 1;
          awayStat.losses += 1;
        } else if (game.away_score > game.home_score) {
          homeStat.losses += 1;
          awayStat.wins += 1;
        } else {
          homeStat.ties += 1;
          awayStat.ties += 1;
        }
      });

      const standingsList: TeamStanding[] = Array.from(teamStatsMap.values()).map(
        (stat) => {
          const games = stat.wins + stat.losses + stat.ties;
          const winPercentage = games > 0 ? (stat.wins + stat.ties * 0.5) / games : 0;
          return {
            ...stat,
            pointDifferential: stat.pointsFor - stat.pointsAgainst,
            winPercentage,
            streak: "",
            playoffSeed: null,
          };
        }
      );

      standingsList.sort((a, b) => {
        if (b.winPercentage !== a.winPercentage) {
          return b.winPercentage - a.winPercentage;
        }
        return b.pointDifferential - a.pointDifferential;
      });

      setStandings(standingsList);
    } catch (err) {
      console.error("Error loading standings:", err);
    }
  }

  async function loadRecentGames() {
    try {
      let gamesQuery = supabase
        .from("games")
        .select(
          `
          *,
          home_team:teams!games_home_team_id_fkey (id, name, abbreviation),
          away_team:teams!games_away_team_id_fkey (id, name, abbreviation)
        `
        )
        .eq("season", currentSeason)
        .eq("played", true)
        .order("week", { ascending: false })
        .order("id", { ascending: false })
        .limit(10);
      
      // Filter by save_game_id if available
      if (saveGameId) {
        gamesQuery = gamesQuery.eq("save_game_id", saveGameId);
      } else {
        gamesQuery = gamesQuery.is("save_game_id", null);
      }
      
      const { data: games } = await gamesQuery;

      if (games) {
        setRecentGames(
          games.map((g) => ({
            ...g,
            home_team: g.home_team as Team,
            away_team: g.away_team as Team,
          }))
        );
      }
    } catch (err) {
      console.error("Error loading recent games:", err);
    }
  }

  async function loadUpcomingGames() {
    try {
      let gamesQuery = supabase
        .from("games")
        .select(
          `
          *,
          home_team:teams!games_home_team_id_fkey (id, name, abbreviation),
          away_team:teams!games_away_team_id_fkey (id, name, abbreviation)
        `
        )
        .eq("season", currentSeason)
        .eq("week", currentWeek)
        .eq("played", false)
        .order("id", { ascending: true })
        .limit(8);
      
      // Filter by save_game_id if available
      if (saveGameId) {
        gamesQuery = gamesQuery.eq("save_game_id", saveGameId);
      } else {
        gamesQuery = gamesQuery.is("save_game_id", null);
      }
      
      const { data: games } = await gamesQuery;

      if (games) {
        setUpcomingGames(
          games.map((g) => ({
            ...g,
            home_team: g.home_team as Team,
            away_team: g.away_team as Team,
          }))
        );
      }
    } catch (err) {
      console.error("Error loading upcoming games:", err);
    }
  }

  async function loadLeaders() {
    try {
      let statsQuery = supabase
        .from("player_season_stats")
        .select(
          `
          player_id,
          passing_yards,
          passing_tds,
          rushing_yards,
          rushing_tds,
          receiving_yards,
          receiving_tds,
          tackles,
          sacks,
          defensive_interceptions,
          players!inner (id, full_name, position),
          teams!inner (id, abbreviation)
        `
        )
        .eq("season", currentSeason);
      
      // Filter by save_game_id if available
      if (saveGameId) {
        statsQuery = statsQuery.eq("save_game_id", saveGameId);
      } else {
        statsQuery = statsQuery.is("save_game_id", null);
      }
      
      const { data: stats } = await statsQuery;

      if (!stats || stats.length === 0) return;

      const leadersList: LeagueLeader[] = [];

      // Passing yards
      const passingYards = stats
        .filter((s) => (s.passing_yards ?? 0) > 0)
        .sort((a, b) => (b.passing_yards ?? 0) - (a.passing_yards ?? 0))
        .slice(0, 1)[0];
      if (passingYards) {
        leadersList.push({
          player_id: passingYards.player_id,
          full_name: (passingYards.players as any)?.full_name || "Unknown",
          position: (passingYards.players as any)?.position || "QB",
          team_abbreviation: (passingYards.teams as any)?.abbreviation || "?",
          stat_value: passingYards.passing_yards ?? 0,
          stat_name: "Passing Yards",
        });
      }

      // Rushing yards
      const rushingYards = stats
        .filter((s) => (s.rushing_yards ?? 0) > 0)
        .sort((a, b) => (b.rushing_yards ?? 0) - (a.rushing_yards ?? 0))
        .slice(0, 1)[0];
      if (rushingYards) {
        leadersList.push({
          player_id: rushingYards.player_id,
          full_name: (rushingYards.players as any)?.full_name || "Unknown",
          position: (rushingYards.players as any)?.position || "RB",
          team_abbreviation: (rushingYards.teams as any)?.abbreviation || "?",
          stat_value: rushingYards.rushing_yards ?? 0,
          stat_name: "Rushing Yards",
        });
      }

      // Receiving yards
      const receivingYards = stats
        .filter((s) => (s.receiving_yards ?? 0) > 0)
        .sort((a, b) => (b.receiving_yards ?? 0) - (a.receiving_yards ?? 0))
        .slice(0, 1)[0];
      if (receivingYards) {
        leadersList.push({
          player_id: receivingYards.player_id,
          full_name: (receivingYards.players as any)?.full_name || "Unknown",
          position: (receivingYards.players as any)?.position || "WR",
          team_abbreviation: (receivingYards.teams as any)?.abbreviation || "?",
          stat_value: receivingYards.receiving_yards ?? 0,
          stat_name: "Receiving Yards",
        });
      }

      // Tackles
      const tackles = stats
        .filter((s) => (s.tackles ?? 0) > 0)
        .sort((a, b) => (b.tackles ?? 0) - (a.tackles ?? 0))
        .slice(0, 1)[0];
      if (tackles) {
        leadersList.push({
          player_id: tackles.player_id,
          full_name: (tackles.players as any)?.full_name || "Unknown",
          position: (tackles.players as any)?.position || "LB",
          team_abbreviation: (tackles.teams as any)?.abbreviation || "?",
          stat_value: tackles.tackles ?? 0,
          stat_name: "Tackles",
        });
      }

      setLeaders(leadersList);
    } catch (err) {
      console.error("Error loading leaders:", err);
    }
  }

  // Get top teams by conference
  const topTeamsByConference = useMemo(() => {
    const afc = standings
      .filter((s) => s.team.conference === "AFC")
      .slice(0, 4);
    const nfc = standings
      .filter((s) => s.team.conference === "NFC")
      .slice(0, 4);
    return { afc, nfc };
  }, [standings]);

  // Get games played this week
  const gamesThisWeek = useMemo(() => {
    return recentGames.filter((g) => g.week === currentWeek);
  }, [recentGames, currentWeek]);

  if (!mounted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-gray-50 to-slate-100">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="bg-white rounded-xl shadow-lg p-8">
            <p className="text-slate-500">Loading...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-gray-50 to-slate-100">
      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="bg-white rounded-xl shadow-lg border border-slate-200 mb-6 overflow-hidden">
          <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 px-8 py-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-black text-white tracking-tight mb-2">
                  League Overview
                </h1>
                <div className="flex items-center gap-4 text-slate-300">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4" />
                    <span className="text-sm">
                      Season {currentSeason} • Week {currentWeek}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4" />
                    <span className="text-sm">32 Teams</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Link
                  href="/league/standings"
                  className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-semibold transition-colors text-sm"
                >
                  View Standings
                </Link>
                <Link
                  href="/league/schedule"
                  className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-semibold transition-colors text-sm"
                >
                  Full Schedule
                </Link>
              </div>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-12 text-center">
            <p className="text-slate-500">Loading league data...</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left Column - Standings & Leaders */}
            <div className="lg:col-span-2 space-y-6">
              {/* Top Teams */}
              <div className="bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden">
                <div className="bg-gradient-to-r from-slate-100 to-slate-50 px-6 py-4 border-b border-slate-200">
                  <div className="flex items-center justify-between">
                    <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                      <Trophy className="w-5 h-5 text-yellow-500" />
                      Top Teams
                    </h2>
                    <Link
                      href="/league/standings"
                      className="text-sm text-blue-600 hover:text-blue-700 font-semibold flex items-center gap-1"
                    >
                      View All <ArrowRight className="w-4 h-4" />
                    </Link>
                  </div>
                </div>
                <div className="p-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* AFC */}
                    <div>
                      <h3 className="text-sm font-bold text-blue-700 uppercase tracking-wider mb-3">
                        AFC
                      </h3>
                      <div className="space-y-2">
                        {topTeamsByConference.afc.map((standing, idx) => (
                          <Link
                            key={standing.team.id}
                            href={`/teams/${standing.team.id}`}
                            className="flex items-center justify-between p-3 bg-slate-50 hover:bg-blue-50 rounded-lg transition-colors group"
                          >
                            <div className="flex items-center gap-3">
                              <span className="text-lg font-black text-slate-400 w-6">
                                {idx + 1}
                              </span>
                              <div>
                                <div className="font-semibold text-slate-900 group-hover:text-blue-600">
                                  {standing.team.abbreviation}
                                </div>
                                <div className="text-xs text-slate-500">
                                  {standing.wins}-{standing.losses}
                                  {standing.ties > 0 && `-${standing.ties}`}
                                </div>
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="text-sm font-semibold text-slate-900">
                                {standing.winPercentage.toFixed(3).substring(1)}
                              </div>
                              <div
                                className={`text-xs ${
                                  standing.pointDifferential >= 0
                                    ? "text-green-600"
                                    : "text-red-600"
                                }`}
                              >
                                {standing.pointDifferential >= 0 ? "+" : ""}
                                {standing.pointDifferential}
                              </div>
                            </div>
                          </Link>
                        ))}
                      </div>
                    </div>

                    {/* NFC */}
                    <div>
                      <h3 className="text-sm font-bold text-red-700 uppercase tracking-wider mb-3">
                        NFC
                      </h3>
                      <div className="space-y-2">
                        {topTeamsByConference.nfc.map((standing, idx) => (
                          <Link
                            key={standing.team.id}
                            href={`/teams/${standing.team.id}`}
                            className="flex items-center justify-between p-3 bg-slate-50 hover:bg-red-50 rounded-lg transition-colors group"
                          >
                            <div className="flex items-center gap-3">
                              <span className="text-lg font-black text-slate-400 w-6">
                                {idx + 1}
                              </span>
                              <div>
                                <div className="font-semibold text-slate-900 group-hover:text-red-600">
                                  {standing.team.abbreviation}
                                </div>
                                <div className="text-xs text-slate-500">
                                  {standing.wins}-{standing.losses}
                                  {standing.ties > 0 && `-${standing.ties}`}
                                </div>
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="text-sm font-semibold text-slate-900">
                                {standing.winPercentage.toFixed(3).substring(1)}
                              </div>
                              <div
                                className={`text-xs ${
                                  standing.pointDifferential >= 0
                                    ? "text-green-600"
                                    : "text-red-600"
                                }`}
                              >
                                {standing.pointDifferential >= 0 ? "+" : ""}
                                {standing.pointDifferential}
                              </div>
                            </div>
                          </Link>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Recent Games */}
              <div className="bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden">
                <div className="bg-gradient-to-r from-slate-100 to-slate-50 px-6 py-4 border-b border-slate-200">
                  <div className="flex items-center justify-between">
                    <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                      <BarChart3 className="w-5 h-5 text-slate-600" />
                      Recent Results
                    </h2>
                    <Link
                      href="/league/schedule"
                      className="text-sm text-blue-600 hover:text-blue-700 font-semibold flex items-center gap-1"
                    >
                      View All <ArrowRight className="w-4 h-4" />
                    </Link>
                  </div>
                </div>
                <div className="p-6">
                  {recentGames.length === 0 ? (
                    <p className="text-slate-500 text-center py-8">
                      No games played yet this season
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {recentGames.slice(0, 8).map((game) => (
                        <Link
                          key={game.id}
                          href={`/games/${game.id}`}
                          className="flex items-center justify-between p-4 bg-slate-50 hover:bg-slate-100 rounded-lg transition-colors group"
                        >
                          <div className="flex items-center gap-4 flex-1">
                            <div className="text-xs text-slate-500 font-semibold w-12">
                              W{game.week}
                            </div>
                            <div className="flex items-center gap-3 flex-1">
                              <div className="flex items-center gap-2 flex-1 justify-end">
                                <span
                                  className={`font-semibold ${
                                    (game.home_score ?? 0) > (game.away_score ?? 0)
                                      ? "text-slate-900"
                                      : "text-slate-600"
                                  }`}
                                >
                                  {game.away_team?.abbreviation || "?"}
                                </span>
                                <span className="text-2xl font-black text-slate-900">
                                  {game.away_score ?? 0}
                                </span>
                              </div>
                              <span className="text-slate-400">@</span>
                              <div className="flex items-center gap-2 flex-1">
                                <span className="text-2xl font-black text-slate-900">
                                  {game.home_score ?? 0}
                                </span>
                                <span
                                  className={`font-semibold ${
                                    (game.home_score ?? 0) > (game.away_score ?? 0)
                                      ? "text-slate-900"
                                      : "text-slate-600"
                                  }`}
                                >
                                  {game.home_team?.abbreviation || "?"}
                                </span>
                              </div>
                            </div>
                          </div>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Right Column - Upcoming Games & Leaders */}
            <div className="space-y-6">
              {/* Upcoming Games */}
              <div className="bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden">
                <div className="bg-gradient-to-r from-slate-100 to-slate-50 px-6 py-4 border-b border-slate-200">
                  <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                    <Calendar className="w-5 h-5 text-slate-600" />
                    Week {currentWeek} Matchups
                  </h2>
                </div>
                <div className="p-6">
                  {upcomingGames.length === 0 ? (
                    <p className="text-slate-500 text-center py-8 text-sm">
                      No upcoming games this week
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {upcomingGames.map((game) => (
                        <Link
                          key={game.id}
                          href={`/games/${game.id}`}
                          className="block p-4 bg-slate-50 hover:bg-slate-100 rounded-lg transition-colors"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex-1 text-right">
                              <div className="font-semibold text-slate-900">
                                {game.away_team?.abbreviation || "?"}
                              </div>
                              <div className="text-xs text-slate-500">Away</div>
                            </div>
                            <div className="px-4 text-slate-400">@</div>
                            <div className="flex-1">
                              <div className="font-semibold text-slate-900">
                                {game.home_team?.abbreviation || "?"}
                              </div>
                              <div className="text-xs text-slate-500">Home</div>
                            </div>
                          </div>
                        </Link>
                      ))}
                    </div>
                  )}
                  {upcomingGames.length > 0 && (
                    <Link
                      href="/league/schedule"
                      className="block mt-4 text-center text-sm text-blue-600 hover:text-blue-700 font-semibold"
                    >
                      View Full Schedule →
                    </Link>
                  )}
                </div>
              </div>

              {/* League Leaders */}
              <div className="bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden">
                <div className="bg-gradient-to-r from-slate-100 to-slate-50 px-6 py-4 border-b border-slate-200">
                  <div className="flex items-center justify-between">
                    <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                      <Award className="w-5 h-5 text-yellow-500" />
                      League Leaders
                    </h2>
                    <Link
                      href="/league/stats"
                      className="text-sm text-blue-600 hover:text-blue-700 font-semibold flex items-center gap-1"
                    >
                      View All <ArrowRight className="w-4 h-4" />
                    </Link>
                  </div>
                </div>
                <div className="p-6">
                  {leaders.length === 0 ? (
                    <p className="text-slate-500 text-center py-8 text-sm">
                      No stats available yet
                    </p>
                  ) : (
                    <div className="space-y-4">
                      {leaders.map((leader) => (
                        <div
                          key={`${leader.player_id}-${leader.stat_name}`}
                          className="p-4 bg-gradient-to-r from-slate-50 to-slate-100 rounded-lg border border-slate-200"
                        >
                          <div className="flex items-center justify-between mb-2">
                            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                              {leader.stat_name}
                            </div>
                            <div className="text-lg font-black text-slate-900">
                              {leader.stat_value.toLocaleString()}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Link
                              href={`/players/${leader.player_id}`}
                              className="font-semibold text-slate-900 hover:text-blue-600 transition-colors"
                            >
                              {leader.full_name}
                            </Link>
                            <span className="text-xs text-slate-500">
                              {leader.position}
                            </span>
                            <span className="text-xs font-semibold text-slate-600">
                              {leader.team_abbreviation}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Quick Stats */}
              <div className="bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden">
                <div className="bg-gradient-to-r from-slate-100 to-slate-50 px-6 py-4 border-b border-slate-200">
                  <h2 className="text-xl font-bold text-slate-900">Quick Stats</h2>
                </div>
                <div className="p-6">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-600">Games Played</span>
                      <span className="text-lg font-bold text-slate-900">
                        {recentGames.length}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-600">Games This Week</span>
                      <span className="text-lg font-bold text-slate-900">
                        {gamesThisWeek.length}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-600">Upcoming Games</span>
                      <span className="text-lg font-bold text-slate-900">
                        {upcomingGames.length}
                      </span>
                    </div>
                    {standings.length > 0 && (
                      <>
                        <div className="border-t border-slate-200 pt-4 mt-4">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm text-slate-600">
                              Best Record
                            </span>
                            <span className="text-sm font-semibold text-slate-900">
                              {standings[0]?.team.abbreviation} (
                              {standings[0]?.wins}-{standings[0]?.losses}
                              {standings[0]?.ties > 0 && `-${standings[0]?.ties}`})
                            </span>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

