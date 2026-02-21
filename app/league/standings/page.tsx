"use client";

import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/lib/supabase-client";
import { useGameStore } from "@/lib/store/game-store";
import Link from "next/link";
import { Trophy, TrendingUp, TrendingDown, Minus } from "lucide-react";

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
  clinched: string | null;
  playoffSeed: number | null;
  divisionWins: number;
  divisionLosses: number;
  divisionTies: number;
  conferenceWins: number;
  conferenceLosses: number;
  conferenceTies: number;
}

interface DivisionStandings {
  division: string;
  teams: TeamStanding[];
}

interface ConferenceStandings {
  conference: string;
  divisions: DivisionStandings[];
}

export default function StandingsPage() {
  const { currentSeason, currentWeek, saveGameId } = useGameStore();
  const [season, setSeason] = useState<number>(currentSeason);
  const [standings, setStandings] = useState<TeamStanding[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setSeason(currentSeason);
  }, [currentSeason]);

  useEffect(() => {
    if (mounted) {
      loadStandings();
    }
  }, [season, mounted, saveGameId]);

  async function loadStandings() {
    setLoading(true);
    setError(null);
    try {
      console.log(`[Standings] Loading standings for season ${season}, saveGameId: ${saveGameId || "null"}`);
      
      // First, try to get standings from team_season_stats
      // Use conditional logic to match /league page behavior
      let seasonQuery = supabase
        .from("seasons")
        .select("id")
        .eq("year", season);
      
      // Filter by save_game_id if available
      if (saveGameId) {
        seasonQuery = seasonQuery.eq("save_game_id", saveGameId);
      } else {
        seasonQuery = seasonQuery.is("save_game_id", null);
      }
      
      const { data: seasonData, error: seasonError } = await seasonQuery.maybeSingle();
      
      console.log(`[Standings] Season query result:`, { 
        season, 
        seasonData: seasonData?.id || "not found", 
        seasonError: seasonError?.message || "none" 
      });

      let teamStats: any[] = [];

      // For the current season, always calculate from games (team_season_stats is only updated at end of season)
      // For historical seasons, try to use cached team_season_stats first
      if (season === currentSeason) {
        console.log(`[Standings] Current season ${season}, calculating from games`);
        teamStats = await calculateStandingsFromGames(season);
        console.log(`[Standings] Calculated ${teamStats.length} team stats from games`);
      } else {
        // Historical season - try to get cached stats first
        if (seasonData && !seasonError) {
          let statsQuery = supabase
            .from("team_season_stats")
            .select(
              `
              *,
              teams!inner (id, name, abbreviation, conference, division)
            `
            )
            .eq("season_id", seasonData.id);
          
          // Filter by save_game_id if available
          if (saveGameId) {
            statsQuery = statsQuery.eq("save_game_id", saveGameId);
          } else {
            statsQuery = statsQuery.is("save_game_id", null);
          }
          
          const { data: statsData } = await statsQuery;

          if (statsData && statsData.length > 0) {
            teamStats = statsData;
            console.log(`[Standings] Using ${teamStats.length} team stats from team_season_stats for historical season ${season}`);
          }
        }

        // If no cached stats exist, calculate from games
        if (teamStats.length === 0) {
          console.log(`[Standings] No team_season_stats found, calculating from games for season ${season}`);
          teamStats = await calculateStandingsFromGames(season);
          console.log(`[Standings] Calculated ${teamStats.length} team stats from games`);
        }
      }

      // Fetch all teams to ensure we have all teams in standings
      const { data: allTeams } = await supabase
        .from("teams")
        .select("id, name, abbreviation, conference, division")
        .order("conference")
        .order("division")
        .order("name");

      if (!allTeams) {
        throw new Error("Failed to load teams");
      }

      // Create a map of team stats
      const statsMap = new Map<string, any>();
      teamStats.forEach((stat) => {
        const teamId = stat.team_id || stat.teams?.id;
        if (teamId) {
          statsMap.set(teamId, stat);
        }
      });
      console.log(`[Standings] Stats map has ${statsMap.size} entries`);

      // Build standings for all teams
      const standingsList: TeamStanding[] = allTeams.map((team) => {
        const stat = statsMap.get(team.id);
        const wins = stat?.wins || 0;
        const losses = stat?.losses || 0;
        const ties = stat?.ties || 0;
        const pointsFor = stat?.points_for || 0;
        const pointsAgainst = stat?.points_against || 0;
        const games = wins + losses + ties;
        const winPercentage = games > 0 ? (wins + ties * 0.5) / games : 0;

        return {
          team,
          wins,
          losses,
          ties,
          pointsFor,
          pointsAgainst,
          pointDifferential: pointsFor - pointsAgainst,
          winPercentage,
          streak: stat?.streak || "",
          clinched: stat?.clinched || null,
          playoffSeed: stat?.playoff_seed || null,
          divisionWins: stat?.division_wins || 0,
          divisionLosses: stat?.division_losses || 0,
          divisionTies: stat?.division_ties || 0,
          conferenceWins: stat?.conference_wins || 0,
          conferenceLosses: stat?.conference_losses || 0,
          conferenceTies: stat?.conference_ties || 0,
        };
      });
      
      console.log(`[Standings] Built standings for ${standingsList.length} teams, first team:`, standingsList[0]);

      // Calculate division and conference records
      const standingsWithDivConf = await calculateDivisionConferenceRecords(
        standingsList,
        season
      );

      setStandings(standingsWithDivConf);
    } catch (err) {
      console.error("Error loading standings:", err);
      setError(err instanceof Error ? err.message : "Failed to load standings");
    } finally {
      setLoading(false);
    }
  }

  async function calculateStandingsFromGames(season: number): Promise<any[]> {
    console.log(`[Standings] Calculating from games for season ${season}, saveGameId: ${saveGameId || "null"}`);
    
    // Get all played games for this season with conditional save_game_id handling
    let gamesQuery = supabase
      .from("games")
      .select("home_team_id, away_team_id, home_score, away_score")
      .eq("season", season)
      .eq("played", true);
    
    // Filter by save_game_id if available (same pattern as /league page)
    if (saveGameId) {
      gamesQuery = gamesQuery.eq("save_game_id", saveGameId);
    } else {
      gamesQuery = gamesQuery.is("save_game_id", null);
    }
    
    const { data: games, error: gamesError } = await gamesQuery;
    
    console.log(`[Standings] Games query result: ${games?.length || 0} games found, error: ${gamesError?.message || "none"}`);

    if (!games || games.length === 0) {
      console.log(`[Standings] No games found for season ${season}`);
      return [];
    }

    // Calculate stats for each team
    const teamStatsMap = new Map<string, any>();

    games.forEach((game) => {
      if (game.home_score === null || game.away_score === null) return;

      // Home team
      if (!teamStatsMap.has(game.home_team_id)) {
        teamStatsMap.set(game.home_team_id, {
          team_id: game.home_team_id,
          wins: 0,
          losses: 0,
          ties: 0,
          points_for: 0,
          points_against: 0,
        });
      }
      const homeStat = teamStatsMap.get(game.home_team_id)!;
      homeStat.points_for += game.home_score;
      homeStat.points_against += game.away_score;

      if (game.home_score > game.away_score) {
        homeStat.wins += 1;
      } else if (game.home_score < game.away_score) {
        homeStat.losses += 1;
      } else {
        homeStat.ties += 1;
      }

      // Away team
      if (!teamStatsMap.has(game.away_team_id)) {
        teamStatsMap.set(game.away_team_id, {
          team_id: game.away_team_id,
          wins: 0,
          losses: 0,
          ties: 0,
          points_for: 0,
          points_against: 0,
        });
      }
      const awayStat = teamStatsMap.get(game.away_team_id)!;
      awayStat.points_for += game.away_score;
      awayStat.points_against += game.home_score;

      if (game.away_score > game.home_score) {
        awayStat.wins += 1;
      } else if (game.away_score < game.home_score) {
        awayStat.losses += 1;
      } else {
        awayStat.ties += 1;
      }
    });

    console.log(`[Standings] Processed ${games.length} games into ${teamStatsMap.size} team stats`);
    return Array.from(teamStatsMap.values());
  }

  async function calculateDivisionConferenceRecords(
    standings: TeamStanding[],
    season: number
  ): Promise<TeamStanding[]> {
    // Get all played games
    let gamesQuery = supabase
      .from("games")
      .select("home_team_id, away_team_id, home_score, away_score")
      .eq("season", season)
      .eq("played", true);
    
    // Filter by save_game_id if available
    if (saveGameId) {
      gamesQuery = gamesQuery.eq("save_game_id", saveGameId);
    } else {
      gamesQuery = gamesQuery.is("save_game_id", null);
    }
    
    const { data: games } = await gamesQuery;

    if (!games || games.length === 0) {
      return standings;
    }

    // Get team info map
    const { data: teams } = await supabase
      .from("teams")
      .select("id, conference, division");

    const teamInfoMap = new Map<string, { conference: string; division: string }>();
    teams?.forEach((t) => {
      teamInfoMap.set(t.id, { conference: t.conference, division: t.division });
    });

    // Initialize division/conference records
    const standingsMap = new Map<string, TeamStanding>();
    standings.forEach((s) => {
      standingsMap.set(s.team.id, { ...s });
    });

    // Calculate division and conference records
    games.forEach((game) => {
      if (game.home_score === null || game.away_score === null) return;

      const homeInfo = teamInfoMap.get(game.home_team_id);
      const awayInfo = teamInfoMap.get(game.away_team_id);

      if (!homeInfo || !awayInfo) return;

      const homeStanding = standingsMap.get(game.home_team_id);
      const awayStanding = standingsMap.get(game.away_team_id);

      if (!homeStanding || !awayStanding) return;

      const homeWon = game.home_score! > game.away_score!;
      const awayWon = game.away_score! > game.home_score!;
      const tied = game.home_score === game.away_score;

      // Division games
      if (
        homeInfo.division === awayInfo.division &&
        homeInfo.conference === awayInfo.conference
      ) {
        if (homeWon) {
          homeStanding.divisionWins += 1;
          awayStanding.divisionLosses += 1;
        } else if (awayWon) {
          homeStanding.divisionLosses += 1;
          awayStanding.divisionWins += 1;
        } else if (tied) {
          homeStanding.divisionTies += 1;
          awayStanding.divisionTies += 1;
        }
      }

      // Conference games
      if (homeInfo.conference === awayInfo.conference) {
        if (homeWon) {
          homeStanding.conferenceWins += 1;
          awayStanding.conferenceLosses += 1;
        } else if (awayWon) {
          homeStanding.conferenceLosses += 1;
          awayStanding.conferenceWins += 1;
        } else if (tied) {
          homeStanding.conferenceTies += 1;
          awayStanding.conferenceTies += 1;
        }
      }
    });

    return Array.from(standingsMap.values());
  }

  // Group standings by conference and division
  const groupedStandings = useMemo(() => {
    const conferences: ConferenceStandings[] = [];

    // Group by conference
    const conferenceMap = new Map<string, TeamStanding[]>();
    standings.forEach((standing) => {
      const conf = standing.team.conference;
      if (!conferenceMap.has(conf)) {
        conferenceMap.set(conf, []);
      }
      conferenceMap.get(conf)!.push(standing);
    });

    // For each conference, group by division and sort
    conferenceMap.forEach((confTeams, conference) => {
      const divisionMap = new Map<string, TeamStanding[]>();
      confTeams.forEach((standing) => {
        const div = standing.team.division;
        if (!divisionMap.has(div)) {
          divisionMap.set(div, []);
        }
        divisionMap.get(div)!.push(standing);
      });

      const divisions: DivisionStandings[] = [];
      divisionMap.forEach((divTeams, division) => {
        // Sort teams within division
        const sorted = [...divTeams].sort((a, b) => {
          // Win percentage
          if (b.winPercentage !== a.winPercentage) {
            return b.winPercentage - a.winPercentage;
          }
          // Head-to-head (simplified - just use point differential for now)
          if (b.pointDifferential !== a.pointDifferential) {
            return b.pointDifferential - a.pointDifferential;
          }
          // Points for
          return b.pointsFor - a.pointsFor;
        });

        divisions.push({ division, teams: sorted });
      });

      // Sort divisions by best team's win percentage
      divisions.sort((a, b) => {
        const aBest = a.teams[0];
        const bBest = b.teams[0];
        if (bBest.winPercentage !== aBest.winPercentage) {
          return bBest.winPercentage - aBest.winPercentage;
        }
        return bBest.pointDifferential - aBest.pointDifferential;
      });

      conferences.push({ conference, divisions });
    });

    // Sort conferences (AFC first)
    conferences.sort((a, b) => {
      if (a.conference === "AFC" && b.conference !== "AFC") return -1;
      if (a.conference !== "AFC" && b.conference === "AFC") return 1;
      return 0;
    });

    return conferences;
  }, [standings]);

  // Calculate playoff seeds
  const playoffSeeds = useMemo(() => {
    const seeds: Map<string, number> = new Map();
    let seed = 1;

    groupedStandings.forEach((conf) => {
      // Division winners get seeds 1-4
      conf.divisions.forEach((div, idx) => {
        if (div.teams.length > 0) {
          const divisionWinner = div.teams[0];
          seeds.set(divisionWinner.team.id, seed);
          seed++;
        }
      });

      // Wild cards get seeds 5-7 (best remaining teams)
      const allTeams = conf.divisions.flatMap((div) => div.teams);
      const divisionWinners = new Set(
        conf.divisions.map((div) => div.teams[0]?.team.id).filter(Boolean)
      );
      const wildCards = allTeams
        .filter((t) => !divisionWinners.has(t.team.id))
        .sort((a, b) => {
          if (b.winPercentage !== a.winPercentage) {
            return b.winPercentage - a.winPercentage;
          }
          return b.pointDifferential - a.pointDifferential;
        })
        .slice(0, 3);

      wildCards.forEach((team) => {
        seeds.set(team.team.id, seed);
        seed++;
      });
    });

    return seeds;
  }, [groupedStandings]);

  function getStreakIcon(streak: string) {
    if (streak.startsWith("W")) {
      return <TrendingUp className="w-4 h-4 text-green-600" />;
    } else if (streak.startsWith("L")) {
      return <TrendingDown className="w-4 h-4 text-red-600" />;
    } else if (streak.startsWith("T")) {
      return <Minus className="w-4 h-4 text-gray-500" />;
    }
    return null;
  }

  function formatWinPercentage(pct: number): string {
    if (pct === 0) return ".000";
    return pct.toFixed(3).substring(1);
  }

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
                  League Standings
                </h1>
                <p className="text-slate-400 text-sm">
                  Season {season} • Week {currentWeek}
                </p>
              </div>
              <div>
                <label className="text-xs text-slate-400 uppercase tracking-wider block mb-1">
                  Season
                </label>
                <input
                  type="number"
                  value={season}
                  onChange={(e) => setSeason(parseInt(e.target.value) || 2025)}
                  className="px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <p className="text-red-700 font-medium">{error}</p>
          </div>
        )}

        {loading ? (
          <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-12 text-center">
            <p className="text-slate-500">Loading standings...</p>
          </div>
        ) : standings.length === 0 ? (
          <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-12 text-center">
            <p className="text-slate-500 mb-2">No standings available for season {season}</p>
            <p className="text-sm text-slate-400">
              {saveGameId 
                ? "No games have been played yet this season. Simulate games to see standings."
                : "No games have been played yet this season."}
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {groupedStandings.map((conf) => (
              <div
                key={conf.conference}
                className="bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden"
              >
                {/* Conference Header */}
                <div
                  className={`px-8 py-4 border-b-2 ${
                    conf.conference === "AFC"
                      ? "bg-gradient-to-r from-blue-900 via-blue-800 to-blue-900 border-blue-700"
                      : "bg-gradient-to-r from-red-900 via-red-800 to-red-900 border-red-700"
                  }`}
                >
                  <h2 className="text-2xl font-black text-white tracking-tight">
                    {conf.conference}
                  </h2>
                </div>

                {/* Divisions */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 p-6">
                  {conf.divisions.map((div) => (
                    <div key={div.division} className="space-y-3">
                      {/* Division Header */}
                      <div className="flex items-center justify-between pb-2 border-b-2 border-slate-200">
                        <h3 className="text-lg font-bold text-slate-900">
                          {div.division}
                        </h3>
                        <span className="text-xs text-slate-500 uppercase tracking-wider">
                          {div.teams.length} Teams
                        </span>
                      </div>

                      {/* Division Standings Table */}
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-slate-200 bg-slate-50">
                              <th className="text-left py-2 px-3 font-bold text-slate-700 text-xs uppercase tracking-wider">
                                Team
                              </th>
                              <th className="text-center py-2 px-2 font-bold text-slate-700 text-xs uppercase tracking-wider">
                                W
                              </th>
                              <th className="text-center py-2 px-2 font-bold text-slate-700 text-xs uppercase tracking-wider">
                                L
                              </th>
                              <th className="text-center py-2 px-2 font-bold text-slate-700 text-xs uppercase tracking-wider">
                                T
                              </th>
                              <th className="text-center py-2 px-2 font-bold text-slate-700 text-xs uppercase tracking-wider">
                                PCT
                              </th>
                              <th className="text-center py-2 px-2 font-bold text-slate-700 text-xs uppercase tracking-wider">
                                PF
                              </th>
                              <th className="text-center py-2 px-2 font-bold text-slate-700 text-xs uppercase tracking-wider">
                                PA
                              </th>
                              <th className="text-center py-2 px-2 font-bold text-slate-700 text-xs uppercase tracking-wider">
                                DIFF
                              </th>
                              <th className="text-center py-2 px-2 font-bold text-slate-700 text-xs uppercase tracking-wider">
                                STRK
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {div.teams.map((standing, idx) => {
                              const seed = playoffSeeds.get(standing.team.id);
                              const isDivisionLeader = idx === 0;
                              return (
                                <tr
                                  key={standing.team.id}
                                  className={`border-b border-slate-100 transition-colors ${
                                    isDivisionLeader
                                      ? "bg-blue-50 hover:bg-blue-100"
                                      : "hover:bg-slate-50"
                                  }`}
                                >
                                  <td className="py-3 px-3">
                                    <div className="flex items-center gap-2">
                                      {seed && (
                                        <span className="flex items-center justify-center w-6 h-6 rounded-full bg-slate-900 text-white text-xs font-bold">
                                          {seed}
                                        </span>
                                      )}
                                      {isDivisionLeader && (
                                        <Trophy className="w-4 h-4 text-yellow-500" />
                                      )}
                                      <Link
                                        href={`/teams/${standing.team.id}`}
                                        className="font-semibold text-slate-900 hover:text-blue-600 transition-colors"
                                      >
                                        {standing.team.abbreviation || standing.team.name}
                                      </Link>
                                    </div>
                                  </td>
                                  <td className="text-center py-3 px-2 text-slate-900 font-semibold">
                                    {standing.wins}
                                  </td>
                                  <td className="text-center py-3 px-2 text-slate-600">
                                    {standing.losses}
                                  </td>
                                  <td className="text-center py-3 px-2 text-slate-600">
                                    {standing.ties}
                                  </td>
                                  <td className="text-center py-3 px-2 text-slate-900 font-semibold">
                                    {formatWinPercentage(standing.winPercentage)}
                                  </td>
                                  <td className="text-center py-3 px-2 text-slate-600">
                                    {standing.pointsFor}
                                  </td>
                                  <td className="text-center py-3 px-2 text-slate-600">
                                    {standing.pointsAgainst}
                                  </td>
                                  <td
                                    className={`text-center py-3 px-2 font-semibold ${
                                      standing.pointDifferential >= 0
                                        ? "text-green-600"
                                        : "text-red-600"
                                    }`}
                                  >
                                    {standing.pointDifferential >= 0 ? "+" : ""}
                                    {standing.pointDifferential}
                                  </td>
                                  <td className="text-center py-3 px-2">
                                    <div className="flex items-center justify-center gap-1">
                                      {getStreakIcon(standing.streak)}
                                      <span className="text-slate-600 text-xs font-medium">
                                        {standing.streak || "—"}
                                      </span>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>

                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

