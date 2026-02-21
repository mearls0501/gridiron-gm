"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase-client";
import { useGameStore } from "@/lib/store/game-store";
import { getPlayerRecords } from "@/lib/utils/career-records";

interface LifetimeStats {
  passing_yards: number;
  passing_tds: number;
  interceptions: number;
  completions: number;
  attempts: number;
  rushing_yards: number;
  rushing_tds: number;
  rushing_attempts: number;
  receiving_yards: number;
  receiving_tds: number;
  receptions: number;
  targets: number;
  fumbles: number;
  tackles: number;
  solo_tackles: number;
  sacks: number;
  defensive_interceptions: number;
  forced_fumbles: number;
  fumble_recoveries: number;
  passes_defended: number;
  tfl: number;
  field_goals_made: number;
  field_goals_attempted: number;
  extra_points_made: number;
  punts: number;
  punt_yards: number;
  seasons_played: number;
  first_season: number | null;
  last_season: number | null;
  total_games_played: number;
  total_games_started: number;
  avg_performance_rating: number | null;
}

interface SeasonStats {
  season: number;
  team_id: string;
  games_played: number;
  games_started: number;
  passing_yards: number;
  passing_tds: number;
  interceptions: number;
  completions: number;
  attempts: number;
  rushing_yards: number;
  rushing_tds: number;
  rushing_attempts: number;
  receiving_yards: number;
  receiving_tds: number;
  receptions: number;
  targets: number;
  fumbles: number;
  tackles: number;
  solo_tackles: number;
  sacks: number;
  defensive_interceptions: number;
  forced_fumbles: number;
  fumble_recoveries: number;
  passes_defended: number;
  tfl: number;
  field_goals_made: number;
  field_goals_attempted: number;
  extra_points_made: number;
  punts: number;
  punt_yards: number;
  avg_performance_rating: number | null;
}

export function StatsDisplay({ playerId }: { playerId: string }) {
  const { saveGameId } = useGameStore();
  const [lifetimeStats, setLifetimeStats] = useState<LifetimeStats | null>(null);
  const [seasonStats, setSeasonStats] = useState<SeasonStats[]>([]);
  const [playerRecords, setPlayerRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted) {
      loadStats();
    }
  }, [mounted, playerId, saveGameId]);

  async function loadStats() {
    if (!saveGameId) {
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      // Load lifetime stats
      const { data: lifetimeData, error: lifetimeError } = await supabase
        .from("player_lifetime_stats")
        .select("*")
        .eq("player_id", playerId)
        .eq("save_game_id", saveGameId)
        .maybeSingle();

      if (lifetimeError && lifetimeError.code !== "PGRST116") {
        console.error("Error loading lifetime stats:", lifetimeError);
      } else if (lifetimeData) {
        setLifetimeStats(lifetimeData as LifetimeStats);
      }

      // Load season stats
      const { data: seasonData, error: seasonError } = await supabase
        .from("player_season_stats")
        .select("*")
        .eq("player_id", playerId)
        .eq("save_game_id", saveGameId)
        .order("season", { ascending: false });

      if (seasonError) {
        console.error("Error loading season stats:", seasonError);
      } else if (seasonData) {
        setSeasonStats(seasonData as SeasonStats[]);
      }

      // Load player records
      const records = await getPlayerRecords(playerId, saveGameId);
      setPlayerRecords(records);
    } catch (error) {
      console.error("Error loading stats:", error);
    } finally {
      setLoading(false);
    }
  }

  if (!mounted || !saveGameId) {
    return null;
  }

  if (loading) {
    return (
      <div className="mt-8">
        <div className="text-center py-8 text-gray-500">Loading stats...</div>
      </div>
    );
  }

  if (!lifetimeStats && seasonStats.length === 0) {
    return (
      <div className="mt-8">
        <div className="text-center py-8 text-gray-500">
          No career statistics available yet.
        </div>
      </div>
    );
  }

  const formatNumber = (num: number | null | undefined): string => {
    if (num === null || num === undefined) return "0";
    return num.toLocaleString();
  };

  const formatDecimal = (num: number | null | undefined, decimals: number = 1): string => {
    if (num === null || num === undefined) return "0.0";
    return parseFloat(num.toString()).toFixed(decimals);
  };

  return (
    <div className="mt-8 space-y-8">
      {/* Career Totals */}
      {lifetimeStats && (
        <div className="bg-gray-50 rounded-lg p-6 border border-gray-200">
          <h2 className="text-2xl font-bold mb-4 text-gray-900">Career Totals</h2>
          
          {/* Career Metadata */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6 pb-6 border-b border-gray-200">
            <div>
              <div className="text-sm text-gray-600">Seasons</div>
              <div className="text-xl font-semibold">{lifetimeStats.seasons_played}</div>
            </div>
            <div>
              <div className="text-sm text-gray-600">Games Played</div>
              <div className="text-xl font-semibold">{lifetimeStats.total_games_played}</div>
            </div>
            <div>
              <div className="text-sm text-gray-600">Games Started</div>
              <div className="text-xl font-semibold">{lifetimeStats.total_games_started}</div>
            </div>
            <div>
              <div className="text-sm text-gray-600">Career Span</div>
              <div className="text-xl font-semibold">
                {lifetimeStats.first_season && lifetimeStats.last_season
                  ? `${lifetimeStats.first_season}${lifetimeStats.first_season !== lifetimeStats.last_season ? `-${lifetimeStats.last_season}` : ""}`
                  : "N/A"}
              </div>
            </div>
          </div>

          {/* Offensive Stats */}
          {(lifetimeStats.passing_yards > 0 ||
            lifetimeStats.rushing_yards > 0 ||
            lifetimeStats.receiving_yards > 0) && (
            <div className="mb-6">
              <h3 className="text-lg font-semibold mb-3 text-gray-800">Offensive Stats</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {lifetimeStats.passing_yards > 0 && (
                  <>
                    <div>
                      <div className="text-sm text-gray-600">Passing Yards</div>
                      <div className="text-lg font-semibold">
                        {formatNumber(lifetimeStats.passing_yards)}
                        {playerRecords.find((r) => r.statName === "Career Passing Yards" && r.isRecord) && (
                          <span className="ml-2 text-yellow-600">🏆</span>
                        )}
                      </div>
                    </div>
                    <div>
                      <div className="text-sm text-gray-600">Passing TDs</div>
                      <div className="text-lg font-semibold">
                        {formatNumber(lifetimeStats.passing_tds)}
                        {playerRecords.find((r) => r.statName === "Career Passing Touchdowns" && r.isRecord) && (
                          <span className="ml-2 text-yellow-600">🏆</span>
                        )}
                      </div>
                    </div>
                    <div>
                      <div className="text-sm text-gray-600">Completions</div>
                      <div className="text-lg font-semibold">{formatNumber(lifetimeStats.completions)}</div>
                    </div>
                    <div>
                      <div className="text-sm text-gray-600">Attempts</div>
                      <div className="text-lg font-semibold">{formatNumber(lifetimeStats.attempts)}</div>
                    </div>
                    <div>
                      <div className="text-sm text-gray-600">Interceptions</div>
                      <div className="text-lg font-semibold">{formatNumber(lifetimeStats.interceptions)}</div>
                    </div>
                  </>
                )}
                {lifetimeStats.rushing_yards > 0 && (
                  <>
                    <div>
                      <div className="text-sm text-gray-600">Rushing Yards</div>
                      <div className="text-lg font-semibold">
                        {formatNumber(lifetimeStats.rushing_yards)}
                        {playerRecords.find((r) => r.statName === "Career Rushing Yards" && r.isRecord) && (
                          <span className="ml-2 text-yellow-600">🏆</span>
                        )}
                      </div>
                    </div>
                    <div>
                      <div className="text-sm text-gray-600">Rushing TDs</div>
                      <div className="text-lg font-semibold">
                        {formatNumber(lifetimeStats.rushing_tds)}
                        {playerRecords.find((r) => r.statName === "Career Rushing Touchdowns" && r.isRecord) && (
                          <span className="ml-2 text-yellow-600">🏆</span>
                        )}
                      </div>
                    </div>
                    <div>
                      <div className="text-sm text-gray-600">Rushing Attempts</div>
                      <div className="text-lg font-semibold">{formatNumber(lifetimeStats.rushing_attempts)}</div>
                    </div>
                  </>
                )}
                {lifetimeStats.receiving_yards > 0 && (
                  <>
                    <div>
                      <div className="text-sm text-gray-600">Receiving Yards</div>
                      <div className="text-lg font-semibold">
                        {formatNumber(lifetimeStats.receiving_yards)}
                        {playerRecords.find((r) => r.statName === "Career Receiving Yards" && r.isRecord) && (
                          <span className="ml-2 text-yellow-600">🏆</span>
                        )}
                      </div>
                    </div>
                    <div>
                      <div className="text-sm text-gray-600">Receiving TDs</div>
                      <div className="text-lg font-semibold">
                        {formatNumber(lifetimeStats.receiving_tds)}
                        {playerRecords.find((r) => r.statName === "Career Receiving Touchdowns" && r.isRecord) && (
                          <span className="ml-2 text-yellow-600">🏆</span>
                        )}
                      </div>
                    </div>
                    <div>
                      <div className="text-sm text-gray-600">Receptions</div>
                      <div className="text-lg font-semibold">{formatNumber(lifetimeStats.receptions)}</div>
                    </div>
                    <div>
                      <div className="text-sm text-gray-600">Targets</div>
                      <div className="text-lg font-semibold">{formatNumber(lifetimeStats.targets)}</div>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Defensive Stats */}
          {(lifetimeStats.tackles > 0 ||
            lifetimeStats.sacks > 0 ||
            lifetimeStats.defensive_interceptions > 0) && (
            <div className="mb-6">
              <h3 className="text-lg font-semibold mb-3 text-gray-800">Defensive Stats</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {lifetimeStats.tackles > 0 && (
                  <div>
                    <div className="text-sm text-gray-600">Tackles</div>
                    <div className="text-lg font-semibold">
                      {formatNumber(lifetimeStats.tackles)}
                      {playerRecords.find((r) => r.statName === "Career Tackles" && r.isRecord) && (
                        <span className="ml-2 text-yellow-600">🏆</span>
                      )}
                    </div>
                  </div>
                )}
                {lifetimeStats.solo_tackles > 0 && (
                  <div>
                    <div className="text-sm text-gray-600">Solo Tackles</div>
                    <div className="text-lg font-semibold">{formatNumber(lifetimeStats.solo_tackles)}</div>
                  </div>
                )}
                {lifetimeStats.sacks > 0 && (
                  <div>
                    <div className="text-sm text-gray-600">Sacks</div>
                    <div className="text-lg font-semibold">
                      {formatDecimal(lifetimeStats.sacks)}
                      {playerRecords.find((r) => r.statName === "Career Sacks" && r.isRecord) && (
                        <span className="ml-2 text-yellow-600">🏆</span>
                      )}
                    </div>
                  </div>
                )}
                {lifetimeStats.defensive_interceptions > 0 && (
                  <div>
                    <div className="text-sm text-gray-600">Interceptions</div>
                    <div className="text-lg font-semibold">
                      {formatNumber(lifetimeStats.defensive_interceptions)}
                      {playerRecords.find((r) => r.statName === "Career Interceptions" && r.isRecord) && (
                        <span className="ml-2 text-yellow-600">🏆</span>
                      )}
                    </div>
                  </div>
                )}
                {lifetimeStats.forced_fumbles > 0 && (
                  <div>
                    <div className="text-sm text-gray-600">Forced Fumbles</div>
                    <div className="text-lg font-semibold">{formatNumber(lifetimeStats.forced_fumbles)}</div>
                  </div>
                )}
                {lifetimeStats.fumble_recoveries > 0 && (
                  <div>
                    <div className="text-sm text-gray-600">Fumble Recoveries</div>
                    <div className="text-lg font-semibold">{formatNumber(lifetimeStats.fumble_recoveries)}</div>
                  </div>
                )}
                {lifetimeStats.passes_defended > 0 && (
                  <div>
                    <div className="text-sm text-gray-600">Passes Defended</div>
                    <div className="text-lg font-semibold">{formatNumber(lifetimeStats.passes_defended)}</div>
                  </div>
                )}
                {lifetimeStats.tfl > 0 && (
                  <div>
                    <div className="text-sm text-gray-600">TFL</div>
                    <div className="text-lg font-semibold">{formatNumber(lifetimeStats.tfl)}</div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Special Teams */}
          {(lifetimeStats.field_goals_made > 0 || lifetimeStats.punts > 0) && (
            <div>
              <h3 className="text-lg font-semibold mb-3 text-gray-800">Special Teams</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {lifetimeStats.field_goals_made > 0 && (
                  <>
                    <div>
                      <div className="text-sm text-gray-600">Field Goals Made</div>
                      <div className="text-lg font-semibold">{formatNumber(lifetimeStats.field_goals_made)}</div>
                    </div>
                    <div>
                      <div className="text-sm text-gray-600">Field Goals Attempted</div>
                      <div className="text-lg font-semibold">{formatNumber(lifetimeStats.field_goals_attempted)}</div>
                    </div>
                    <div>
                      <div className="text-sm text-gray-600">Extra Points Made</div>
                      <div className="text-lg font-semibold">{formatNumber(lifetimeStats.extra_points_made)}</div>
                    </div>
                  </>
                )}
                {lifetimeStats.punts > 0 && (
                  <>
                    <div>
                      <div className="text-sm text-gray-600">Punts</div>
                      <div className="text-lg font-semibold">{formatNumber(lifetimeStats.punts)}</div>
                    </div>
                    <div>
                      <div className="text-sm text-gray-600">Punt Yards</div>
                      <div className="text-lg font-semibold">{formatNumber(lifetimeStats.punt_yards)}</div>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Season-by-Season Breakdown */}
      {seasonStats.length > 0 && (
        <div className="bg-gray-50 rounded-lg p-6 border border-gray-200">
          <h2 className="text-2xl font-bold mb-4 text-gray-900">Season-by-Season</h2>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-100">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                    Season
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                    GP
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                    GS
                  </th>
                  {seasonStats.some((s) => s.passing_yards > 0) && (
                    <>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                        Pass Yds
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                        Pass TDs
                      </th>
                    </>
                  )}
                  {seasonStats.some((s) => s.rushing_yards > 0) && (
                    <>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                        Rush Yds
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                        Rush TDs
                      </th>
                    </>
                  )}
                  {seasonStats.some((s) => s.receiving_yards > 0) && (
                    <>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                        Rec Yds
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                        Rec TDs
                      </th>
                    </>
                  )}
                  {seasonStats.some((s) => s.tackles > 0) && (
                    <>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                        Tackles
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                        Sacks
                      </th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {seasonStats.map((stat) => (
                  <tr key={stat.season} className="hover:bg-gray-50">
                    <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                      {stat.season}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">
                      {stat.games_played}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">
                      {stat.games_started}
                    </td>
                    {seasonStats.some((s) => s.passing_yards > 0) && (
                      <>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">
                          {formatNumber(stat.passing_yards)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">
                          {formatNumber(stat.passing_tds)}
                        </td>
                      </>
                    )}
                    {seasonStats.some((s) => s.rushing_yards > 0) && (
                      <>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">
                          {formatNumber(stat.rushing_yards)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">
                          {formatNumber(stat.rushing_tds)}
                        </td>
                      </>
                    )}
                    {seasonStats.some((s) => s.receiving_yards > 0) && (
                      <>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">
                          {formatNumber(stat.receiving_yards)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">
                          {formatNumber(stat.receiving_tds)}
                        </td>
                      </>
                    )}
                    {seasonStats.some((s) => s.tackles > 0) && (
                      <>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">
                          {formatNumber(stat.tackles)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">
                          {formatDecimal(stat.sacks)}
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}



