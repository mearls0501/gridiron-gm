"use client";

import { supabase } from "@/lib/supabase-client";
import { useGameStore } from "@/lib/store/game-store";
import { useState, useEffect, useMemo } from "react";
import { ArrowUp, ArrowDown, ArrowUpDown, RefreshCw } from "lucide-react";
import Link from "next/link";

interface PlayerSeasonStat {
  player_id: string;
  full_name: string;
  position: string;
  team_id: string;
  team_name: string;
  team_abbreviation: string;
  season: number;
  // Offensive stats
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
  // Defensive stats
  tackles: number;
  solo_tackles: number;
  sacks: number;
  defensive_interceptions: number;
  forced_fumbles: number;
  fumble_recoveries: number;
  passes_defended: number;
  tfl: number;
  // Special teams
  field_goals_made: number;
  field_goals_attempted: number;
  extra_points_made: number;
  punts: number;
  punt_yards: number;
  // Performance
  games_played: number;
  games_started: number;
  avg_performance_rating: number;
}

function LeagueStatsPageClient() {
  const { currentSeason, saveGameId } = useGameStore();
  const [season, setSeason] = useState<number>(currentSeason);
  const [selectedCategory, setSelectedCategory] = useState<string>("passing");
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<PlayerSeasonStat[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setSeason(currentSeason);
  }, [currentSeason]);

  useEffect(() => {
    if (mounted) {
      loadStats();
    }
  }, [season, mounted, saveGameId]);

  // Listen for stats refresh events (triggered from admin/sim after aggregation)
  useEffect(() => {
    if (!mounted) return;

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === "stats-refresh" && e.newValue) {
        console.log("[Stats] Received stats refresh event, reloading...");
        loadStats();
        // Clear the event
        localStorage.removeItem("stats-refresh");
      }
    };

    const handleCustomRefresh = () => {
      console.log("[Stats] Received custom refresh event, reloading...");
      loadStats();
    };

    window.addEventListener("storage", handleStorageChange);
    window.addEventListener("stats-refreshed", handleCustomRefresh);

    // Also check for refresh on focus (in case user switches tabs)
    const handleFocus = () => {
      const lastRefresh = localStorage.getItem("stats-last-refresh");
      if (lastRefresh) {
        const lastRefreshTime = parseInt(lastRefresh, 10);
        const now = Date.now();
        // If stats were refreshed in the last 5 seconds, reload
        if (now - lastRefreshTime < 5000) {
          console.log("[Stats] Detected recent stats refresh, reloading...");
          loadStats();
        }
      }
    };

    window.addEventListener("focus", handleFocus);

    return () => {
      window.removeEventListener("storage", handleStorageChange);
      window.removeEventListener("stats-refreshed", handleCustomRefresh);
      window.removeEventListener("focus", handleFocus);
    };
  }, [mounted]);

  async function loadStats() {
    setLoading(true);
    try {
      // Load season stats with player and team info
      // Try to load from player_season_stats first, fallback to aggregating from game stats
      type SeasonStatWithRelations = {
        player_id: string;
        team_id: string;
        season: number;
        save_game_id?: string | null;
        passing_yards?: number | null;
        passing_tds?: number | null;
        interceptions?: number | null;
        completions?: number | null;
        attempts?: number | null;
        rushing_yards?: number | null;
        rushing_tds?: number | null;
        rushing_attempts?: number | null;
        receiving_yards?: number | null;
        receiving_tds?: number | null;
        receptions?: number | null;
        targets?: number | null;
        fumbles?: number | null;
        tackles?: number | null;
        solo_tackles?: number | null;
        sacks?: number | string | null;
        defensive_interceptions?: number | null;
        forced_fumbles?: number | null;
        fumble_recoveries?: number | null;
        passes_defended?: number | null;
        tfl?: number | null;
        field_goals_made?: number | null;
        field_goals_attempted?: number | null;
        extra_points_made?: number | null;
        punts?: number | null;
        punt_yards?: number | null;
        games_played?: number | null;
        games_started?: number | null;
        avg_performance_rating?: number | null;
        players: { id: string; full_name: string; position: string } | null;
        teams: { id: string; name: string; abbreviation: string } | null;
      };
      let seasonStats: SeasonStatWithRelations[] = [];

      console.log(
        `[Stats] Loading stats for season ${season}, saveGameId: ${saveGameId || "null"}`
      );

      // CRITICAL: saveGameId is required - all stats should have save_game_id set
      if (!saveGameId) {
        console.error(`[Stats] saveGameId is required. Cannot load stats without save_game_id.`);
        setStats([]);
        setLoading(false);
        return;
      }

      // Query stats with exact save_game_id match
      // NOTE: Can't use JOIN anymore since we removed FK constraint
      // Load stats, then enrich with player/prospect data separately
      const statsQuery = supabase
        .from("player_season_stats")
        .select("*")
        .eq("season", season)
        .eq("save_game_id", saveGameId);

      const { data: rawStatsData, error: statsError } = await statsQuery;

      console.log(
        `[Stats] Initial query result: ${rawStatsData?.length || 0} stats found, error:`,
        statsError?.message || "none"
      );

      if (statsError) {
        console.error("Error loading stats:", statsError);
        setStats([]);
        setLoading(false);
        return;
      }

      let statsData = rawStatsData;

      // Enrich stats with player and team data
      if (statsData && statsData.length > 0) {
        const playerIds = [...new Set(statsData.map(s => s.player_id))];
        const teamIds = [...new Set(statsData.map(s => s.team_id))];

        // Load teams
        const { data: teams } = await supabase
          .from("teams")
          .select("id, name, abbreviation")
          .in("id", teamIds);
        const teamsMap = new Map(teams?.map(t => [t.id, t]) || []);

        // Load players from both tables - batch to avoid "Bad Request" with too many IDs
        const playersMap = new Map();
        const BATCH_SIZE = 100; // Supabase has limits on .in() array size
        
        for (let i = 0; i < playerIds.length; i += BATCH_SIZE) {
          const batch = playerIds.slice(i, i + BATCH_SIZE);
          const { data: playersBatch } = await supabase
            .from("players")
            .select("id, full_name, position")
            .in("id", batch);
          
          (playersBatch || []).forEach(p => playersMap.set(p.id, p));
        }
        
        console.log(`[Stats] Loaded ${playersMap.size} players from players table out of ${playerIds.length} total IDs`);

        const missingPlayerIds = playerIds.filter(id => !playersMap.has(id));
        if (missingPlayerIds.length > 0) {
          console.log(`[Stats] ${missingPlayerIds.length} player IDs not found in players table, checking prospects...`);
          
          // Batch prospects query too
          for (let i = 0; i < missingPlayerIds.length; i += BATCH_SIZE) {
            const batch = missingPlayerIds.slice(i, i + BATCH_SIZE);
            const { data: prospectsBatch } = await supabase
              .from("draft_prospects")
              .select("id, full_name, position")
              .in("id", batch);
            
            (prospectsBatch || []).forEach(p => playersMap.set(p.id, p));
          }
          
          console.log(`[Stats] Found ${playersMap.size - (playerIds.length - missingPlayerIds.length)} prospects`);
          
          // Check if still missing
          const stillMissing = missingPlayerIds.filter(id => !playersMap.has(id));
          if (stillMissing.length > 0) {
            console.warn(`[Stats] WARNING: ${stillMissing.length} player IDs not found in either table!`);
            console.warn(`[Stats] Sample missing ID:`, stillMissing[0]);
          }
        }

        // Merge data
        statsData = statsData.map(stat => ({
          ...stat,
          players: playersMap.get(stat.player_id) || { id: stat.player_id, full_name: "Unknown", position: "?" },
          teams: teamsMap.get(stat.team_id) || { id: stat.team_id, name: "Unknown", abbreviation: "?" },
        }));

        console.log(`[Stats] Enriched ${statsData.length} stats with player and team data`);
      }

      // Check if there are any game stats to aggregate
      // All game stats should have save_game_id set, so query with exact match
      const gameStatsQuery = supabase
        .from("player_game_stats")
        .select("id, week", { count: "exact" })
        .eq("season", season)
        .eq("save_game_id", saveGameId);

      const {
        data: gameStatsSample,
        count: gameStatsCount,
        error: gameStatsCountError,
      } = await gameStatsQuery.limit(100);

      console.log(
        `[Stats] Game stats check: ${gameStatsCount || 0} found, error:`,
        gameStatsCountError?.message || "none"
      );

      // Also check if games exist for this season (to diagnose if games haven't been simulated)
      if ((!gameStatsCount || gameStatsCount === 0) && saveGameId) {
        const gamesCheckQuery = supabase
          .from("games")
          .select("id, week, played", { count: "exact" })
          .eq("season", season)
          .eq("save_game_id", saveGameId);
        
        const { count: gamesCount, data: gamesSample } = await gamesCheckQuery.limit(10);
        const playedGamesCount = gamesSample?.filter(g => g.played).length || 0;
        
        console.log(
          `[Stats] Diagnostic: Season ${season} has ${gamesCount || 0} games, ${playedGamesCount} marked as played. ` +
          `If games exist but no stats, stats may not have been saved during simulation.`
        );
      }

      // Determine if we need to aggregate
      let shouldAggregate = false;

      if (gameStatsCount && gameStatsCount > 0) {
        if (!statsData || statsData.length === 0) {
          // No season stats exist, definitely need to aggregate
          shouldAggregate = true;
          console.log(
            `[Stats] No season stats found but ${gameStatsCount} game stats exist, need to aggregate`
          );
        } else {
          // Check if game stats have more recent weeks than season stats
          // Get the max week from game stats
          const maxGameWeek = gameStatsSample
            ? Math.max(
                ...(gameStatsSample
                  .map((s) => s.week)
                  .filter((w) => w != null) as number[])
              )
            : 0;

          // Get the max week from season stats (check games_played as a proxy)
          // Since we don't have week info in season stats, we'll check if any player's games_played
          // is less than what we'd expect based on game stats
          const maxSeasonGames = Math.max(
            ...statsData.map((s) => s.games_played || 0)
          );

          // Estimate expected games based on max week (assuming 1 game per week)
          // If max week is 6, we'd expect at least 6 games for players who played all weeks
          if (maxGameWeek > maxSeasonGames) {
            shouldAggregate = true;
            console.log(
              `[Stats] Game stats have week ${maxGameWeek} but season stats show max ${maxSeasonGames} games, need to re-aggregate`
            );
          } else {
            // Also check if there are significantly more game stats than what season stats suggest
            // This catches cases where stats might be incomplete
            const totalSeasonGames = statsData.reduce(
              (sum, s) => sum + (s.games_played || 0),
              0
            );
            const expectedTotalGames = gameStatsCount;

            // If game stats are 20% more than what season stats account for, re-aggregate
            if (expectedTotalGames > totalSeasonGames * 1.2) {
              shouldAggregate = true;
              console.log(
                `[Stats] Found ${expectedTotalGames} game stats but season stats only account for ${totalSeasonGames} games, need to re-aggregate`
              );
            }
          }
        }
      }

      // Perform aggregation if needed
      if (shouldAggregate) {
        console.log(
          `[Stats] Aggregating season stats for season ${season}, saveGameId: ${saveGameId || "null"}...`
        );
        try {
          const { aggregateSeasonStats } = await import(
            "@/lib/simulation/player-development"
          );

          // Increase timeout to 30 seconds for larger datasets
          const aggregationPromise = aggregateSeasonStats(season, saveGameId);
          const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error("Aggregation timeout")), 30000)
          );

          await Promise.race([aggregationPromise, timeoutPromise]);

          // Retry loading after aggregation
          let retryQuery = supabase
            .from("player_season_stats")
            .select("*")
            .eq("season", season);

          // Filter by save_game_id if available
          const SENTINEL_UUID = "00000000-0000-0000-0000-000000000000";
          if (saveGameId) {
            retryQuery = retryQuery.eq("save_game_id", saveGameId);
          } else {
            // For legacy data, check for both NULL and sentinel UUID
            retryQuery = retryQuery.or(
              `save_game_id.is.null,save_game_id.eq.${SENTINEL_UUID}`
            );
          }

          const { data: rawRetryData, error: retryError } = await retryQuery;

          if (retryError) {
            console.error(
              "Error retrying stats after aggregation:",
              retryError
            );
          }

          let retryData = rawRetryData;

          // Enrich with player and team data
          if (retryData && retryData.length > 0) {
            const playerIds = [...new Set(retryData.map(s => s.player_id))];
            const teamIds = [...new Set(retryData.map(s => s.team_id))];

            // Load teams
            const { data: teams } = await supabase
              .from("teams")
              .select("id, name, abbreviation")
              .in("id", teamIds);
            const teamsMap = new Map(teams?.map(t => [t.id, t]) || []);

            // Load players from both tables - batch to avoid query limits
            const playersMap = new Map();
            const BATCH_SIZE = 100;
            
            for (let i = 0; i < playerIds.length; i += BATCH_SIZE) {
              const batch = playerIds.slice(i, i + BATCH_SIZE);
              const { data: playersBatch } = await supabase
                .from("players")
                .select("id, full_name, position")
                .in("id", batch);
              (playersBatch || []).forEach(p => playersMap.set(p.id, p));
            }

            const missingPlayerIds = playerIds.filter(id => !playersMap.has(id));
            if (missingPlayerIds.length > 0) {
              for (let i = 0; i < missingPlayerIds.length; i += BATCH_SIZE) {
                const batch = missingPlayerIds.slice(i, i + BATCH_SIZE);
                const { data: prospectsBatch } = await supabase
                  .from("draft_prospects")
                  .select("id, full_name, position")
                  .in("id", batch);
                (prospectsBatch || []).forEach(p => playersMap.set(p.id, p));
              }
            }

            // Merge data
            retryData = retryData.map(stat => ({
              ...stat,
              players: playersMap.get(stat.player_id) || { id: stat.player_id, full_name: "Unknown", position: "?" },
              teams: teamsMap.get(stat.team_id) || { id: stat.team_id, name: "Unknown", abbreviation: "?" },
            }));

            seasonStats = retryData;
            console.log(
              `[Stats] Successfully loaded ${retryData.length} season stats after aggregation`
            );
          } else {
            console.log(
              "Aggregation completed but no stats returned. This may be normal if no players have stats yet."
            );
            // Fall back to original stats if available
            if (statsData && statsData.length > 0) {
              seasonStats = statsData;
            }
          }
        } catch (aggError) {
          console.error("Error aggregating stats:", aggError);
          // Fall back to original stats if available
          if (statsData && statsData.length > 0) {
            seasonStats = statsData;
          }
        }
      } else {
        // Use existing stats
        if (statsData && statsData.length > 0) {
          seasonStats = statsData;
          console.log(
            `[Stats] Using existing season stats (${statsData.length} players), no aggregation needed`
          );
        } else {
          console.log(
            "No game stats found for this save game, skipping aggregation"
          );
        }
      }

      // Parse and enrich the stats
      const enrichedStats: PlayerSeasonStat[] = (seasonStats || []).map(
        (stat: SeasonStatWithRelations) => {
          const player = stat.players;
          const team = stat.teams;
          return {
            player_id: stat.player_id,
            full_name: player?.full_name || "Unknown",
            position: player?.position || "?",
            team_id: stat.team_id,
            team_name: team?.name || "Unknown",
            team_abbreviation: team?.abbreviation || "?",
            season: stat.season,
            passing_yards: stat.passing_yards || 0,
            passing_tds: stat.passing_tds || 0,
            interceptions: stat.interceptions || 0,
            completions: stat.completions || 0,
            attempts: stat.attempts || 0,
            rushing_yards: stat.rushing_yards || 0,
            rushing_tds: stat.rushing_tds || 0,
            rushing_attempts: stat.rushing_attempts || 0,
            receiving_yards: stat.receiving_yards || 0,
            receiving_tds: stat.receiving_tds || 0,
            receptions: stat.receptions || 0,
            targets: stat.targets || 0,
            fumbles: stat.fumbles || 0,
            tackles: stat.tackles || 0,
            solo_tackles: stat.solo_tackles || 0,
            sacks:
              typeof stat.sacks === "string"
                ? parseFloat(stat.sacks)
                : stat.sacks || 0,
            defensive_interceptions: stat.defensive_interceptions || 0,
            forced_fumbles: stat.forced_fumbles || 0,
            fumble_recoveries: stat.fumble_recoveries || 0,
            passes_defended: stat.passes_defended || 0,
            tfl: stat.tfl || 0,
            field_goals_made: stat.field_goals_made || 0,
            field_goals_attempted: stat.field_goals_attempted || 0,
            extra_points_made: stat.extra_points_made || 0,
            punts: stat.punts || 0,
            punt_yards: stat.punt_yards || 0,
            games_played: stat.games_played || 0,
            games_started: stat.games_started || 0,
            avg_performance_rating: stat.avg_performance_rating || 0,
          };
        }
      );

      setStats(enrichedStats);
    } catch (err) {
      console.error("Error loading stats:", err);
      setStats([]);
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

  // Filter and sort stats based on selected category
  const getFilteredStats = () => {
    let filtered = [...stats];

    switch (selectedCategory) {
      case "passing":
        filtered = filtered.filter((s) => s.attempts > 0);
        filtered.sort((a, b) => b.passing_yards - a.passing_yards);
        break;
      case "rushing":
        filtered = filtered.filter((s) => s.rushing_attempts > 0);
        filtered.sort((a, b) => b.rushing_yards - a.rushing_yards);
        break;
      case "receiving":
        filtered = filtered.filter((s) => s.receptions > 0);
        filtered.sort((a, b) => b.receiving_yards - a.receiving_yards);
        break;
      case "defense":
        filtered = filtered.filter((s) => {
          const tackles = s.tackles || 0;
          const sacks =
            typeof s.sacks === "string" ? parseFloat(s.sacks) : s.sacks || 0;
          const ints = s.defensive_interceptions || 0;
          return tackles > 0 || sacks > 0 || ints > 0;
        });
        filtered.sort((a, b) => {
          const aTackles = a.tackles || 0;
          const bTackles = b.tackles || 0;
          return bTackles - aTackles;
        });
        break;
      default:
        break;
    }

    return filtered.slice(0, 50); // Top 50
  };

  const filteredStats = getFilteredStats();

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-gray-50 to-slate-100">
      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="bg-white rounded-xl shadow-lg border border-slate-200 mb-6 overflow-hidden">
          <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 px-8 py-6">
            <h1 className="text-3xl font-black text-white tracking-tight mb-2">
              League Statistics
            </h1>
            <div className="flex items-center gap-4 mt-4">
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
              <div className="flex items-end">
                <button
                  onClick={() => {
                    console.log("[Stats] Manual refresh triggered");
                    loadStats();
                  }}
                  disabled={loading}
                  className="px-4 py-2 bg-slate-700 hover:bg-slate-600 disabled:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed border border-slate-600 rounded-lg text-white font-semibold transition-colors flex items-center gap-2"
                  title="Refresh statistics"
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

        {/* Navigation Tabs */}
        <div className="bg-white rounded-xl shadow-lg border border-slate-200 mb-6 overflow-hidden">
          <div className="flex border-b border-slate-200">
            <div className="flex-1 px-6 py-4 font-bold text-sm uppercase tracking-wider transition-colors bg-slate-900 text-white border-b-2 border-white text-center">
              Full Stats
            </div>
            <Link
              href="/league/leaders"
              className="flex-1 px-6 py-4 font-bold text-sm uppercase tracking-wider transition-colors bg-slate-50 text-slate-600 hover:bg-slate-100 text-center"
            >
              Leaders
            </Link>
          </div>
        </div>

        {/* Category Tabs */}
        <div className="bg-white rounded-xl shadow-lg border border-slate-200 mb-6 overflow-hidden">
          <div className="flex border-b border-slate-200">
            {[
              { id: "passing", label: "Passing" },
              { id: "rushing", label: "Rushing" },
              { id: "receiving", label: "Receiving" },
              { id: "defense", label: "Defense" },
            ].map((cat) => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`flex-1 px-6 py-4 font-bold text-sm uppercase tracking-wider transition-colors ${
                  selectedCategory === cat.id
                    ? "bg-slate-900 text-white border-b-2 border-white"
                    : "bg-slate-50 text-slate-600 hover:bg-slate-100"
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        {/* Stats Table */}
        {loading ? (
          <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-12 text-center">
            <p className="text-slate-500 text-lg">Loading statistics...</p>
          </div>
        ) : filteredStats.length === 0 ? (
          <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-12 text-center">
            <p className="text-slate-500 text-lg">
              No statistics available for {season}. Play some games first!
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden">
            <StatsTable category={selectedCategory} stats={filteredStats} />
          </div>
        )}
      </div>
    </div>
  );
}

type SortField = string;
type SortDirection = "asc" | "desc" | null;

// Sort icon component - defined outside to avoid recreation
function SortIcon({
  field,
  sortField,
  sortDirection,
}: {
  field: SortField;
  sortField: SortField | null;
  sortDirection: SortDirection;
}) {
  if (sortField !== field) {
    return <ArrowUpDown className="w-3 h-3 text-slate-400" />;
  }
  if (sortDirection === "asc") {
    return <ArrowUp className="w-3 h-3 text-blue-600" />;
  }
  if (sortDirection === "desc") {
    return <ArrowDown className="w-3 h-3 text-blue-600" />;
  }
  return <ArrowUpDown className="w-3 h-3 text-slate-400" />;
}

// Sortable header components - defined outside to avoid recreation
function SortableHeader({
  field,
  children,
  className = "",
  onSort,
  sortField,
  sortDirection,
}: {
  field: SortField;
  children: React.ReactNode;
  className?: string;
  onSort: (field: SortField) => void;
  sortField: SortField | null;
  sortDirection: SortDirection;
}) {
  return (
    <th
      className={`${className} cursor-pointer hover:bg-slate-100 transition-colors select-none`}
      onClick={() => onSort(field)}
    >
      <div className="flex items-center justify-end gap-1">
        {children}
        <SortIcon
          field={field}
          sortField={sortField}
          sortDirection={sortDirection}
        />
      </div>
    </th>
  );
}

function SortableHeaderLeft({
  field,
  children,
  className = "",
  onSort,
  sortField,
  sortDirection,
}: {
  field: SortField;
  children: React.ReactNode;
  className?: string;
  onSort: (field: SortField) => void;
  sortField: SortField | null;
  sortDirection: SortDirection;
}) {
  return (
    <th
      className={`${className} cursor-pointer hover:bg-slate-100 transition-colors select-none`}
      onClick={() => onSort(field)}
    >
      <div className="flex items-center gap-1">
        {children}
        <SortIcon
          field={field}
          sortField={sortField}
          sortDirection={sortDirection}
        />
      </div>
    </th>
  );
}

function StatsTable({
  category,
  stats,
}: {
  category: string;
  stats: PlayerSeasonStat[];
}) {
  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      // Cycle through: desc -> asc -> null
      if (sortDirection === "desc") {
        setSortDirection("asc");
      } else if (sortDirection === "asc") {
        setSortDirection(null);
        setSortField(null);
      } else {
        setSortDirection("desc");
      }
    } else {
      setSortField(field);
      setSortDirection("desc");
    }
  };

  const sortedStats = useMemo(() => {
    if (!sortField || !sortDirection) {
      return stats;
    }

    const sorted = [...stats].sort((a, b) => {
      let aValue: string | number;
      let bValue: string | number;

      switch (sortField) {
        case "player":
          aValue = a.full_name.toLowerCase();
          bValue = b.full_name.toLowerCase();
          break;
        case "team":
          aValue = a.team_abbreviation.toLowerCase();
          bValue = b.team_abbreviation.toLowerCase();
          break;
        case "passing_yards":
          aValue = a.passing_yards || 0;
          bValue = b.passing_yards || 0;
          break;
        case "passing_tds":
          aValue = a.passing_tds || 0;
          bValue = b.passing_tds || 0;
          break;
        case "interceptions":
          aValue = a.interceptions || 0;
          bValue = b.interceptions || 0;
          break;
        case "completions":
          aValue = a.completions || 0;
          bValue = b.completions || 0;
          break;
        case "attempts":
          aValue = a.attempts || 0;
          bValue = b.attempts || 0;
          break;
        case "rating":
          aValue = (a.attempts || 0) > 0 ? calculateQBRating(a) : 0;
          bValue = (b.attempts || 0) > 0 ? calculateQBRating(b) : 0;
          break;
        case "rushing_yards":
          aValue = a.rushing_yards || 0;
          bValue = b.rushing_yards || 0;
          break;
        case "rushing_tds":
          aValue = a.rushing_tds || 0;
          bValue = b.rushing_tds || 0;
          break;
        case "rushing_attempts":
          aValue = a.rushing_attempts || 0;
          bValue = b.rushing_attempts || 0;
          break;
        case "rushing_avg":
          aValue =
            a.rushing_attempts > 0 ? a.rushing_yards / a.rushing_attempts : 0;
          bValue =
            b.rushing_attempts > 0 ? b.rushing_yards / b.rushing_attempts : 0;
          break;
        case "games_played":
          aValue = a.games_played || 0;
          bValue = b.games_played || 0;
          break;
        case "receiving_yards":
          aValue = a.receiving_yards || 0;
          bValue = b.receiving_yards || 0;
          break;
        case "receiving_tds":
          aValue = a.receiving_tds || 0;
          bValue = b.receiving_tds || 0;
          break;
        case "receptions":
          aValue = a.receptions || 0;
          bValue = b.receptions || 0;
          break;
        case "receiving_avg":
          aValue = a.receptions > 0 ? a.receiving_yards / a.receptions : 0;
          bValue = b.receptions > 0 ? b.receiving_yards / b.receptions : 0;
          break;
        case "tackles":
          aValue = a.tackles || 0;
          bValue = b.tackles || 0;
          break;
        case "solo_tackles":
          aValue = a.solo_tackles || 0;
          bValue = b.solo_tackles || 0;
          break;
        case "sacks":
          aValue =
            typeof a.sacks === "string" ? parseFloat(a.sacks) : a.sacks || 0;
          bValue =
            typeof b.sacks === "string" ? parseFloat(b.sacks) : b.sacks || 0;
          break;
        case "defensive_interceptions":
          aValue = a.defensive_interceptions || 0;
          bValue = b.defensive_interceptions || 0;
          break;
        case "passes_defended":
          aValue = a.passes_defended || 0;
          bValue = b.passes_defended || 0;
          break;
        default:
          return 0;
      }

      if (typeof aValue === "string" && typeof bValue === "string") {
        return sortDirection === "asc"
          ? aValue.localeCompare(bValue)
          : bValue.localeCompare(aValue);
      }

      // Both values are numbers at this point
      const aNum = typeof aValue === "number" ? aValue : Number(aValue);
      const bNum = typeof bValue === "number" ? bValue : Number(bValue);
      return sortDirection === "asc" ? aNum - bNum : bNum - aNum;
    });

    return sorted;
  }, [stats, sortField, sortDirection]);

  if (category === "passing") {
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b-2 border-slate-200 bg-slate-50">
              <th className="text-left py-3 px-4 font-bold text-slate-700 text-xs uppercase tracking-wider">
                Rank
              </th>
              <SortableHeaderLeft
                field="player"
                className="text-left py-3 px-4 font-bold text-slate-700 text-xs uppercase tracking-wider"
                onSort={handleSort}
                sortField={sortField}
                sortDirection={sortDirection}
              >
                Player
              </SortableHeaderLeft>
              <SortableHeaderLeft
                field="team"
                className="text-left py-3 px-4 font-bold text-slate-700 text-xs uppercase tracking-wider"
                onSort={handleSort}
                sortField={sortField}
                sortDirection={sortDirection}
              >
                Team
              </SortableHeaderLeft>
              <SortableHeader
                field="games_played"
                className="text-right py-3 px-4 font-bold text-slate-700 text-xs uppercase tracking-wider"
                onSort={handleSort}
                sortField={sortField}
                sortDirection={sortDirection}
              >
                GP
              </SortableHeader>
              <SortableHeader
                field="completions"
                className="text-right py-3 px-4 font-bold text-slate-700 text-xs uppercase tracking-wider"
                onSort={handleSort}
                sortField={sortField}
                sortDirection={sortDirection}
              >
                CMP
              </SortableHeader>
              <SortableHeader
                field="attempts"
                className="text-right py-3 px-4 font-bold text-slate-700 text-xs uppercase tracking-wider"
                onSort={handleSort}
                sortField={sortField}
                sortDirection={sortDirection}
              >
                ATT
              </SortableHeader>
              <SortableHeader
                field="passing_yards"
                className="text-right py-3 px-4 font-bold text-slate-700 text-xs uppercase tracking-wider"
                onSort={handleSort}
                sortField={sortField}
                sortDirection={sortDirection}
              >
                YDS
              </SortableHeader>
              <SortableHeader
                field="passing_tds"
                className="text-right py-3 px-4 font-bold text-slate-700 text-xs uppercase tracking-wider"
                onSort={handleSort}
                sortField={sortField}
                sortDirection={sortDirection}
              >
                TD
              </SortableHeader>
              <SortableHeader
                field="interceptions"
                className="text-right py-3 px-4 font-bold text-slate-700 text-xs uppercase tracking-wider"
                onSort={handleSort}
                sortField={sortField}
                sortDirection={sortDirection}
              >
                INT
              </SortableHeader>
              <SortableHeader
                field="rating"
                className="text-right py-3 px-4 font-bold text-slate-700 text-xs uppercase tracking-wider"
                onSort={handleSort}
                sortField={sortField}
                sortDirection={sortDirection}
              >
                RTG
              </SortableHeader>
            </tr>
          </thead>
          <tbody>
            {sortedStats.map((stat, index) => {
              const completionPct =
                stat.attempts > 0
                  ? ((stat.completions / stat.attempts) * 100).toFixed(1)
                  : "0.0";
              const rating = stat.attempts > 0 ? calculateQBRating(stat) : 0;
              return (
                <tr
                  key={stat.player_id}
                  className="border-b border-slate-100 hover:bg-slate-50 transition-colors"
                >
                  <td className="py-3 px-4 text-slate-600 font-bold tabular-nums">
                    {index + 1}
                  </td>
                  <td className="py-3 px-4 font-semibold text-slate-900">
                    {stat.full_name}
                  </td>
                  <td className="py-3 px-4 text-slate-600">
                    {stat.team_abbreviation}
                  </td>
                  <td className="text-right py-3 px-4 text-slate-600 tabular-nums">
                    {stat.games_played || 0}
                  </td>
                  <td className="text-right py-3 px-4 text-slate-900 font-medium tabular-nums">
                    {stat.completions}
                  </td>
                  <td className="text-right py-3 px-4 text-slate-600 tabular-nums">
                    {stat.attempts}
                  </td>
                  <td className="text-right py-3 px-4 text-slate-900 font-medium tabular-nums">
                    {stat.passing_yards}
                  </td>
                  <td className="text-right py-3 px-4 text-slate-900 font-medium tabular-nums">
                    {stat.passing_tds}
                  </td>
                  <td className="text-right py-3 px-4 text-slate-600 tabular-nums">
                    {stat.interceptions}
                  </td>
                  <td className="text-right py-3 px-4 text-slate-900 font-medium tabular-nums">
                    {rating.toFixed(1)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  if (category === "rushing") {
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b-2 border-slate-200 bg-slate-50">
              <th className="text-left py-3 px-4 font-bold text-slate-700 text-xs uppercase tracking-wider">
                Rank
              </th>
              <SortableHeaderLeft
                field="player"
                className="text-left py-3 px-4 font-bold text-slate-700 text-xs uppercase tracking-wider"
                onSort={handleSort}
                sortField={sortField}
                sortDirection={sortDirection}
              >
                Player
              </SortableHeaderLeft>
              <SortableHeaderLeft
                field="team"
                className="text-left py-3 px-4 font-bold text-slate-700 text-xs uppercase tracking-wider"
                onSort={handleSort}
                sortField={sortField}
                sortDirection={sortDirection}
              >
                Team
              </SortableHeaderLeft>
              <SortableHeader
                field="games_played"
                className="text-right py-3 px-4 font-bold text-slate-700 text-xs uppercase tracking-wider"
                onSort={handleSort}
                sortField={sortField}
                sortDirection={sortDirection}
              >
                GP
              </SortableHeader>
              <SortableHeader
                field="rushing_attempts"
                className="text-right py-3 px-4 font-bold text-slate-700 text-xs uppercase tracking-wider"
                onSort={handleSort}
                sortField={sortField}
                sortDirection={sortDirection}
              >
                ATT
              </SortableHeader>
              <SortableHeader
                field="rushing_yards"
                className="text-right py-3 px-4 font-bold text-slate-700 text-xs uppercase tracking-wider"
                onSort={handleSort}
                sortField={sortField}
                sortDirection={sortDirection}
              >
                YDS
              </SortableHeader>
              <SortableHeader
                field="rushing_avg"
                className="text-right py-3 px-4 font-bold text-slate-700 text-xs uppercase tracking-wider"
                onSort={handleSort}
                sortField={sortField}
                sortDirection={sortDirection}
              >
                AVG
              </SortableHeader>
              <SortableHeader
                field="rushing_tds"
                className="text-right py-3 px-4 font-bold text-slate-700 text-xs uppercase tracking-wider"
                onSort={handleSort}
                sortField={sortField}
                sortDirection={sortDirection}
              >
                TD
              </SortableHeader>
            </tr>
          </thead>
          <tbody>
            {sortedStats.map((stat, index) => {
              const avgYards =
                stat.rushing_attempts > 0
                  ? (stat.rushing_yards / stat.rushing_attempts).toFixed(1)
                  : "0.0";
              return (
                <tr
                  key={stat.player_id}
                  className="border-b border-slate-100 hover:bg-slate-50 transition-colors"
                >
                  <td className="py-3 px-4 text-slate-600 font-bold tabular-nums">
                    {index + 1}
                  </td>
                  <td className="py-3 px-4 font-semibold text-slate-900">
                    {stat.full_name}
                  </td>
                  <td className="py-3 px-4 text-slate-600">
                    {stat.team_abbreviation}
                  </td>
                  <td className="text-right py-3 px-4 text-slate-600 tabular-nums">
                    {stat.games_played || 0}
                  </td>
                  <td className="text-right py-3 px-4 text-slate-600 tabular-nums">
                    {stat.rushing_attempts}
                  </td>
                  <td className="text-right py-3 px-4 text-slate-900 font-medium tabular-nums">
                    {stat.rushing_yards}
                  </td>
                  <td className="text-right py-3 px-4 text-slate-600 tabular-nums">
                    {avgYards}
                  </td>
                  <td className="text-right py-3 px-4 text-slate-900 font-medium tabular-nums">
                    {stat.rushing_tds}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  if (category === "receiving") {
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b-2 border-slate-200 bg-slate-50">
              <th className="text-left py-3 px-4 font-bold text-slate-700 text-xs uppercase tracking-wider">
                Rank
              </th>
              <SortableHeaderLeft
                field="player"
                className="text-left py-3 px-4 font-bold text-slate-700 text-xs uppercase tracking-wider"
                onSort={handleSort}
                sortField={sortField}
                sortDirection={sortDirection}
              >
                Player
              </SortableHeaderLeft>
              <SortableHeaderLeft
                field="team"
                className="text-left py-3 px-4 font-bold text-slate-700 text-xs uppercase tracking-wider"
                onSort={handleSort}
                sortField={sortField}
                sortDirection={sortDirection}
              >
                Team
              </SortableHeaderLeft>
              <SortableHeader
                field="games_played"
                className="text-right py-3 px-4 font-bold text-slate-700 text-xs uppercase tracking-wider"
                onSort={handleSort}
                sortField={sortField}
                sortDirection={sortDirection}
              >
                GP
              </SortableHeader>
              <SortableHeader
                field="receptions"
                className="text-right py-3 px-4 font-bold text-slate-700 text-xs uppercase tracking-wider"
                onSort={handleSort}
                sortField={sortField}
                sortDirection={sortDirection}
              >
                REC
              </SortableHeader>
              <SortableHeader
                field="receiving_yards"
                className="text-right py-3 px-4 font-bold text-slate-700 text-xs uppercase tracking-wider"
                onSort={handleSort}
                sortField={sortField}
                sortDirection={sortDirection}
              >
                YDS
              </SortableHeader>
              <SortableHeader
                field="receiving_avg"
                className="text-right py-3 px-4 font-bold text-slate-700 text-xs uppercase tracking-wider"
                onSort={handleSort}
                sortField={sortField}
                sortDirection={sortDirection}
              >
                AVG
              </SortableHeader>
              <SortableHeader
                field="receiving_tds"
                className="text-right py-3 px-4 font-bold text-slate-700 text-xs uppercase tracking-wider"
                onSort={handleSort}
                sortField={sortField}
                sortDirection={sortDirection}
              >
                TD
              </SortableHeader>
            </tr>
          </thead>
          <tbody>
            {sortedStats.map((stat, index) => {
              const avgYards =
                stat.receptions > 0
                  ? (stat.receiving_yards / stat.receptions).toFixed(1)
                  : "0.0";
              return (
                <tr
                  key={stat.player_id}
                  className="border-b border-slate-100 hover:bg-slate-50 transition-colors"
                >
                  <td className="py-3 px-4 text-slate-600 font-bold tabular-nums">
                    {index + 1}
                  </td>
                  <td className="py-3 px-4 font-semibold text-slate-900">
                    {stat.full_name}
                  </td>
                  <td className="py-3 px-4 text-slate-600">
                    {stat.team_abbreviation}
                  </td>
                  <td className="text-right py-3 px-4 text-slate-600 tabular-nums">
                    {stat.games_played || 0}
                  </td>
                  <td className="text-right py-3 px-4 text-slate-600 tabular-nums">
                    {stat.receptions}
                  </td>
                  <td className="text-right py-3 px-4 text-slate-900 font-medium tabular-nums">
                    {stat.receiving_yards}
                  </td>
                  <td className="text-right py-3 px-4 text-slate-600 tabular-nums">
                    {avgYards}
                  </td>
                  <td className="text-right py-3 px-4 text-slate-900 font-medium tabular-nums">
                    {stat.receiving_tds}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  if (category === "defense") {
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b-2 border-slate-200 bg-slate-50">
              <th className="text-left py-3 px-4 font-bold text-slate-700 text-xs uppercase tracking-wider">
                Rank
              </th>
              <SortableHeaderLeft
                field="player"
                className="text-left py-3 px-4 font-bold text-slate-700 text-xs uppercase tracking-wider"
                onSort={handleSort}
                sortField={sortField}
                sortDirection={sortDirection}
              >
                Player
              </SortableHeaderLeft>
              <SortableHeaderLeft
                field="team"
                className="text-left py-3 px-4 font-bold text-slate-700 text-xs uppercase tracking-wider"
                onSort={handleSort}
                sortField={sortField}
                sortDirection={sortDirection}
              >
                Team
              </SortableHeaderLeft>
              <SortableHeader
                field="games_played"
                className="text-right py-3 px-4 font-bold text-slate-700 text-xs uppercase tracking-wider"
                onSort={handleSort}
                sortField={sortField}
                sortDirection={sortDirection}
              >
                GP
              </SortableHeader>
              <SortableHeader
                field="tackles"
                className="text-right py-3 px-4 font-bold text-slate-700 text-xs uppercase tracking-wider"
                onSort={handleSort}
                sortField={sortField}
                sortDirection={sortDirection}
              >
                TKL
              </SortableHeader>
              <SortableHeader
                field="solo_tackles"
                className="text-right py-3 px-4 font-bold text-slate-700 text-xs uppercase tracking-wider"
                onSort={handleSort}
                sortField={sortField}
                sortDirection={sortDirection}
              >
                SOLO
              </SortableHeader>
              <SortableHeader
                field="sacks"
                className="text-right py-3 px-4 font-bold text-slate-700 text-xs uppercase tracking-wider"
                onSort={handleSort}
                sortField={sortField}
                sortDirection={sortDirection}
              >
                SCK
              </SortableHeader>
              <SortableHeader
                field="defensive_interceptions"
                className="text-right py-3 px-4 font-bold text-slate-700 text-xs uppercase tracking-wider"
                onSort={handleSort}
                sortField={sortField}
                sortDirection={sortDirection}
              >
                INT
              </SortableHeader>
              <SortableHeader
                field="passes_defended"
                className="text-right py-3 px-4 font-bold text-slate-700 text-xs uppercase tracking-wider"
                onSort={handleSort}
                sortField={sortField}
                sortDirection={sortDirection}
              >
                PD
              </SortableHeader>
            </tr>
          </thead>
          <tbody>
            {sortedStats.map((stat, index) => (
              <tr
                key={stat.player_id}
                className="border-b border-slate-100 hover:bg-slate-50 transition-colors"
              >
                <td className="py-3 px-4 text-slate-600 font-bold tabular-nums">
                  {index + 1}
                </td>
                <td className="py-3 px-4 font-semibold text-slate-900">
                  {stat.full_name}
                </td>
                <td className="py-3 px-4 text-slate-600">
                  {stat.team_abbreviation}
                </td>
                <td className="text-right py-3 px-4 text-slate-600 tabular-nums">
                  {stat.games_played || 0}
                </td>
                <td className="text-right py-3 px-4 text-slate-900 font-medium tabular-nums">
                  {stat.tackles}
                </td>
                <td className="text-right py-3 px-4 text-slate-600 tabular-nums">
                  {stat.solo_tackles}
                </td>
                <td className="text-right py-3 px-4 text-slate-900 font-medium tabular-nums">
                  {typeof stat.sacks === "string"
                    ? parseFloat(stat.sacks).toFixed(1)
                    : (stat.sacks || 0).toFixed(1)}
                </td>
                <td className="text-right py-3 px-4 text-slate-900 font-medium tabular-nums">
                  {stat.defensive_interceptions}
                </td>
                <td className="text-right py-3 px-4 text-slate-600 tabular-nums">
                  {stat.passes_defended}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return null;
}

// Calculate QB Rating (simplified version)
function calculateQBRating(stat: PlayerSeasonStat): number {
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

export default function LeagueStatsPage() {
  return <LeagueStatsPageClient />;
}
