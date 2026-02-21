"use client";

import { supabase } from "@/lib/supabase-client";
import { useGameStore } from "@/lib/store/game-store";
import { useState, useEffect } from "react";
import { Award, TrendingUp, Trophy, RefreshCw } from "lucide-react";
import Link from "next/link";

interface PlayerStatLeader {
  player_id: string;
  full_name: string;
  position: string;
  team_id: string;
  team_name: string;
  team_abbreviation: string;
  stat_value: number;
  secondary_stat?: number;
  games_played: number;
}

interface LeaderCategory {
  id: string;
  title: string;
  statColumn: string;
  secondaryStatColumn?: string;
  label: string;
  secondaryLabel?: string;
  filter?: (stat: any) => boolean;
  format?: (value: number) => string;
}

const LEADER_CATEGORIES: LeaderCategory[] = [
  // Passing
  {
    id: "passing_yards",
    title: "Passing Yards",
    statColumn: "passing_yards",
    label: "YDS",
    filter: (s) => (s.passing_yards ?? 0) > 0,
  },
  {
    id: "passing_tds",
    title: "Passing Touchdowns",
    statColumn: "passing_tds",
    label: "TD",
    filter: (s) => (s.passing_tds ?? 0) > 0,
  },
  {
    id: "completion_pct",
    title: "Completion Percentage",
    statColumn: "completions",
    secondaryStatColumn: "attempts",
    label: "CMP%",
    filter: (s) => (s.attempts ?? 0) >= 50, // Minimum attempts
    format: (value: number) => `${value.toFixed(1)}%`,
  },
  {
    id: "qb_rating",
    title: "Quarterback Rating",
    statColumn: "passing_yards", // We'll calculate this separately
    label: "RTG",
    filter: (s) => (s.attempts ?? 0) >= 50,
    format: (value: number) => value.toFixed(1),
  },
  // Rushing
  {
    id: "rushing_yards",
    title: "Rushing Yards",
    statColumn: "rushing_yards",
    label: "YDS",
    filter: (s) => (s.rushing_yards ?? 0) > 0,
  },
  {
    id: "rushing_tds",
    title: "Rushing Touchdowns",
    statColumn: "rushing_tds",
    label: "TD",
    filter: (s) => (s.rushing_tds ?? 0) > 0,
  },
  {
    id: "rushing_avg",
    title: "Yards Per Carry",
    statColumn: "rushing_yards",
    secondaryStatColumn: "rushing_attempts",
    label: "YPC",
    filter: (s) => (s.rushing_attempts ?? 0) >= 25, // Minimum carries
    format: (value: number) => value.toFixed(1),
  },
  // Receiving
  {
    id: "receiving_yards",
    title: "Receiving Yards",
    statColumn: "receiving_yards",
    label: "YDS",
    filter: (s) => (s.receiving_yards ?? 0) > 0,
  },
  {
    id: "receiving_tds",
    title: "Receiving Touchdowns",
    statColumn: "receiving_tds",
    label: "TD",
    filter: (s) => (s.receiving_tds ?? 0) > 0,
  },
  {
    id: "receptions",
    title: "Receptions",
    statColumn: "receptions",
    label: "REC",
    filter: (s) => (s.receptions ?? 0) > 0,
  },
  {
    id: "receiving_avg",
    title: "Yards Per Reception",
    statColumn: "receiving_yards",
    secondaryStatColumn: "receptions",
    label: "YPR",
    filter: (s) => (s.receptions ?? 0) >= 10, // Minimum receptions
    format: (value: number) => value.toFixed(1),
  },
  // Defense
  {
    id: "tackles",
    title: "Tackles",
    statColumn: "tackles",
    label: "TKL",
    filter: (s) => (s.tackles ?? 0) > 0,
  },
  {
    id: "sacks",
    title: "Sacks",
    statColumn: "sacks",
    label: "SCK",
    filter: (s) => {
      const sacks = typeof s.sacks === "string" ? parseFloat(s.sacks) : s.sacks ?? 0;
      return sacks > 0;
    },
    format: (value: number) => value.toFixed(1),
  },
  {
    id: "defensive_interceptions",
    title: "Interceptions",
    statColumn: "defensive_interceptions",
    label: "INT",
    filter: (s) => (s.defensive_interceptions ?? 0) > 0,
  },
  {
    id: "passes_defended",
    title: "Passes Defended",
    statColumn: "passes_defended",
    label: "PD",
    filter: (s) => (s.passes_defended ?? 0) > 0,
  },
  // Special Teams
  {
    id: "field_goals_made",
    title: "Field Goals Made",
    statColumn: "field_goals_made",
    label: "FGM",
    filter: (s) => (s.field_goals_made ?? 0) > 0,
  },
  {
    id: "field_goal_pct",
    title: "Field Goal Percentage",
    statColumn: "field_goals_made",
    secondaryStatColumn: "field_goals_attempted",
    label: "FG%",
    filter: (s) => (s.field_goals_attempted ?? 0) >= 5, // Minimum attempts
    format: (value: number) => `${value.toFixed(1)}%`,
  },
];

function LeagueLeadersPageClient() {
  const { currentSeason, saveGameId } = useGameStore();
  const [season, setSeason] = useState<number>(currentSeason);
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);
  const [allLeaders, setAllLeaders] = useState<
    Map<string, PlayerStatLeader[]>
  >(new Map());

  useEffect(() => {
    setMounted(true);
    setSeason(currentSeason);
  }, [currentSeason]);

  useEffect(() => {
    if (mounted) {
      loadLeaders();
    }
  }, [season, mounted, saveGameId]);

  async function loadLeaders() {
    setLoading(true);
    try {
      if (!saveGameId) {
        console.error("[Leaders] saveGameId is required");
        setAllLeaders(new Map());
        setLoading(false);
        return;
      }

      // Load all season stats
      const { data: rawStatsData, error: statsError } = await supabase
        .from("player_season_stats")
        .select("*")
        .eq("season", season)
        .eq("save_game_id", saveGameId);

      if (statsError) {
        console.error("Error loading stats:", statsError);
        setAllLeaders(new Map());
        setLoading(false);
        return;
      }

      let statsData = rawStatsData || [];

      // Enrich with player and team data
      if (statsData.length > 0) {
        const playerIds = [...new Set(statsData.map((s) => s.player_id))];
        const teamIds = [...new Set(statsData.map((s) => s.team_id))];

        // Load teams
        const { data: teams } = await supabase
          .from("teams")
          .select("id, name, abbreviation")
          .in("id", teamIds);
        const teamsMap = new Map(teams?.map((t) => [t.id, t]) || []);

        // Load players from both tables - batch to avoid query limits
        const playersMap = new Map();
        const BATCH_SIZE = 100;

        for (let i = 0; i < playerIds.length; i += BATCH_SIZE) {
          const batch = playerIds.slice(i, i + BATCH_SIZE);
          const { data: playersBatch } = await supabase
            .from("players")
            .select("id, full_name, position")
            .in("id", batch);
          (playersBatch || []).forEach((p) => playersMap.set(p.id, p));
        }

        const missingPlayerIds = playerIds.filter((id) => !playersMap.has(id));
        if (missingPlayerIds.length > 0) {
          for (let i = 0; i < missingPlayerIds.length; i += BATCH_SIZE) {
            const batch = missingPlayerIds.slice(i, i + BATCH_SIZE);
            const { data: prospectsBatch } = await supabase
              .from("draft_prospects")
              .select("id, full_name, position")
              .in("id", batch);
            (prospectsBatch || []).forEach((p) => playersMap.set(p.id, p));
          }
        }

        // Merge data
        statsData = statsData.map((stat) => ({
          ...stat,
          players: playersMap.get(stat.player_id) || {
            id: stat.player_id,
            full_name: "Unknown",
            position: "?",
          },
          teams: teamsMap.get(stat.team_id) || {
            id: stat.team_id,
            name: "Unknown",
            abbreviation: "?",
          },
        }));
      }

      // Calculate leaders for each category
      const leadersMap = new Map<string, PlayerStatLeader[]>();

      for (const category of LEADER_CATEGORIES) {
        let filtered = statsData.filter((s) =>
          category.filter ? category.filter(s) : true
        );

        let leaders: PlayerStatLeader[] = filtered.map((stat) => {
          const player = stat.players as any;
          const team = stat.teams as any;

          let statValue = 0;
          let secondaryValue = undefined;

          // Calculate the stat value based on the category
          if (category.id === "completion_pct") {
            const completions = stat.completions || 0;
            const attempts = stat.attempts || 0;
            statValue = attempts > 0 ? (completions / attempts) * 100 : 0;
            secondaryValue = attempts;
          } else if (category.id === "qb_rating") {
            statValue = calculateQBRating(stat);
            secondaryValue = stat.attempts || 0;
          } else if (category.id === "rushing_avg") {
            const yards = stat.rushing_yards || 0;
            const attempts = stat.rushing_attempts || 0;
            statValue = attempts > 0 ? yards / attempts : 0;
            secondaryValue = attempts;
          } else if (category.id === "receiving_avg") {
            const yards = stat.receiving_yards || 0;
            const receptions = stat.receptions || 0;
            statValue = receptions > 0 ? yards / receptions : 0;
            secondaryValue = receptions;
          } else if (category.id === "field_goal_pct") {
            const made = stat.field_goals_made || 0;
            const attempted = stat.field_goals_attempted || 0;
            statValue = attempted > 0 ? (made / attempted) * 100 : 0;
            secondaryValue = made;
          } else if (category.statColumn === "sacks") {
            statValue =
              typeof stat.sacks === "string"
                ? parseFloat(stat.sacks)
                : stat.sacks || 0;
          } else {
            statValue = stat[category.statColumn] || 0;
            if (category.secondaryStatColumn) {
              secondaryValue = stat[category.secondaryStatColumn];
            }
          }

          return {
            player_id: stat.player_id,
            full_name: player?.full_name || "Unknown",
            position: player?.position || "?",
            team_id: stat.team_id,
            team_name: team?.name || "Unknown",
            team_abbreviation: team?.abbreviation || "?",
            stat_value: statValue,
            secondary_stat: secondaryValue,
            games_played: stat.games_played || 0,
          };
        });

        // Sort by stat value (descending)
        leaders.sort((a, b) => b.stat_value - a.stat_value);

        // Take top 10
        leaders = leaders.slice(0, 10);

        leadersMap.set(category.id, leaders);
      }

      setAllLeaders(leadersMap);
    } catch (err) {
      console.error("Error loading leaders:", err);
      setAllLeaders(new Map());
    } finally {
      setLoading(false);
    }
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
          <div className="bg-gradient-to-r from-yellow-500 via-yellow-400 to-amber-500 px-8 py-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-black text-slate-900 tracking-tight mb-2 flex items-center gap-3">
                  <Trophy className="w-8 h-8" />
                  League Leaders
                </h1>
                <p className="text-slate-800 text-sm font-medium">
                  Top performers across all statistical categories
                </p>
              </div>
              <div className="flex items-center gap-4">
                <div>
                  <label className="text-xs text-slate-700 uppercase tracking-wider block mb-1 font-semibold">
                    Season
                  </label>
                  <input
                    type="number"
                    value={season}
                    onChange={(e) => setSeason(parseInt(e.target.value) || 2025)}
                    className="px-4 py-2 bg-white border-2 border-slate-900 rounded-lg text-slate-900 font-bold focus:outline-none focus:ring-2 focus:ring-slate-900"
                  />
                </div>
                <div className="flex items-end">
                  <button
                    onClick={() => {
                      console.log("[Leaders] Manual refresh triggered");
                      loadLeaders();
                    }}
                    disabled={loading}
                    className="px-4 py-2 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-500 disabled:opacity-50 disabled:cursor-not-allowed border-2 border-slate-900 rounded-lg text-white font-bold transition-colors flex items-center gap-2"
                    title="Refresh leaders"
                  >
                    <RefreshCw
                      className={`w-4 h-4 ${loading ? "animate-spin" : ""}`}
                    />
                    Refresh
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="bg-white rounded-xl shadow-lg border border-slate-200 mb-6 overflow-hidden">
          <div className="flex border-b border-slate-200">
            <Link
              href="/league/stats"
              className="flex-1 px-6 py-4 font-bold text-sm uppercase tracking-wider transition-colors bg-slate-50 text-slate-600 hover:bg-slate-100 text-center"
            >
              Full Stats
            </Link>
            <div className="flex-1 px-6 py-4 font-bold text-sm uppercase tracking-wider transition-colors bg-yellow-400 text-slate-900 border-b-4 border-slate-900 text-center">
              Leaders
            </div>
          </div>
        </div>

        {loading ? (
          <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-12 text-center">
            <p className="text-slate-500 text-lg">Loading leaders...</p>
          </div>
        ) : allLeaders.size === 0 ? (
          <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-12 text-center">
            <p className="text-slate-500 text-lg">
              No statistics available for {season}. Play some games first!
            </p>
          </div>
        ) : (
          <div className="space-y-8">
            {/* Passing Leaders */}
            <LeaderSection
              title="Passing Leaders"
              icon={<TrendingUp className="w-6 h-6" />}
              color="blue"
              categories={[
                "passing_yards",
                "passing_tds",
                "completion_pct",
                "qb_rating",
              ]}
              allLeaders={allLeaders}
            />

            {/* Rushing Leaders */}
            <LeaderSection
              title="Rushing Leaders"
              icon={<TrendingUp className="w-6 h-6" />}
              color="green"
              categories={["rushing_yards", "rushing_tds", "rushing_avg"]}
              allLeaders={allLeaders}
            />

            {/* Receiving Leaders */}
            <LeaderSection
              title="Receiving Leaders"
              icon={<TrendingUp className="w-6 h-6" />}
              color="purple"
              categories={[
                "receiving_yards",
                "receiving_tds",
                "receptions",
                "receiving_avg",
              ]}
              allLeaders={allLeaders}
            />

            {/* Defensive Leaders */}
            <LeaderSection
              title="Defensive Leaders"
              icon={<Award className="w-6 h-6" />}
              color="red"
              categories={[
                "tackles",
                "sacks",
                "defensive_interceptions",
                "passes_defended",
              ]}
              allLeaders={allLeaders}
            />

            {/* Special Teams Leaders */}
            <LeaderSection
              title="Special Teams Leaders"
              icon={<Award className="w-6 h-6" />}
              color="amber"
              categories={["field_goals_made", "field_goal_pct"]}
              allLeaders={allLeaders}
            />
          </div>
        )}
      </div>
    </div>
  );
}

interface LeaderSectionProps {
  title: string;
  icon: React.ReactNode;
  color: string;
  categories: string[];
  allLeaders: Map<string, PlayerStatLeader[]>;
}

function LeaderSection({
  title,
  icon,
  color,
  categories,
  allLeaders,
}: LeaderSectionProps) {
  const colorClasses = {
    blue: "from-blue-500 to-blue-600",
    green: "from-green-500 to-green-600",
    purple: "from-purple-500 to-purple-600",
    red: "from-red-500 to-red-600",
    amber: "from-amber-500 to-amber-600",
  }[color];

  return (
    <div className="bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden">
      <div
        className={`bg-gradient-to-r ${colorClasses} px-6 py-4 border-b border-slate-200`}
      >
        <h2 className="text-2xl font-black text-white flex items-center gap-2">
          {icon}
          {title}
        </h2>
      </div>
      <div className="p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-6">
          {categories.map((categoryId) => {
            const category = LEADER_CATEGORIES.find((c) => c.id === categoryId);
            const leaders = allLeaders.get(categoryId) || [];

            if (!category) return null;

            return (
              <div key={categoryId}>
                <h3 className="text-lg font-bold text-slate-900 mb-3 pb-2 border-b-2 border-slate-200">
                  {category.title}
                </h3>
                {leaders.length === 0 ? (
                  <p className="text-slate-500 text-sm italic">No data available</p>
                ) : (
                  <div className="space-y-2">
                    {leaders.map((leader, idx) => (
                      <div
                        key={`${leader.player_id}-${idx}`}
                        className="flex items-center justify-between p-3 bg-slate-50 hover:bg-slate-100 rounded-lg transition-colors group"
                      >
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <span className="text-lg font-black text-slate-400 w-6 flex-shrink-0">
                            {idx + 1}
                          </span>
                          <div className="min-w-0 flex-1">
                            <Link
                              href={`/players/${leader.player_id}`}
                              className="font-semibold text-slate-900 group-hover:text-blue-600 transition-colors truncate block"
                            >
                              {leader.full_name}
                            </Link>
                            <div className="text-xs text-slate-500">
                              <span className="font-medium">
                                {leader.position}
                              </span>
                              {" • "}
                              <span className="font-semibold">
                                {leader.team_abbreviation}
                              </span>
                              {" • "}
                              <span>{leader.games_played} GP</span>
                            </div>
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <div className="text-xl font-black text-slate-900">
                            {category.format
                              ? category.format(leader.stat_value)
                              : leader.stat_value.toLocaleString()}
                          </div>
                          <div className="text-xs text-slate-500 font-semibold">
                            {category.label}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// Calculate QB Rating (simplified version)
function calculateQBRating(stat: any): number {
  const attempts = stat.attempts || 0;
  const completions = stat.completions || 0;
  const yards = stat.passing_yards || 0;
  const tds = stat.passing_tds || 0;
  const ints = stat.interceptions || 0;

  if (attempts === 0) return 0;

  // Simplified QB Rating formula
  const completionPct = (completions / attempts - 0.3) * 5;
  const yardsPerAttempt = (yards / attempts - 3) * 0.25;
  const tdPct = (tds / attempts) * 20;
  const intPct = 2.375 - (ints / attempts) * 25;

  const rating =
    ((Math.max(0, Math.min(2.375, completionPct)) +
      Math.max(0, Math.min(2.375, yardsPerAttempt)) +
      Math.max(0, Math.min(2.375, tdPct)) +
      Math.max(0, Math.min(2.375, intPct))) /
      6) *
    100;

  return Math.max(0, Math.min(158.3, rating));
}

export default function LeagueLeadersPage() {
  return <LeagueLeadersPageClient />;
}



