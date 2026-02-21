import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase-client";

/**
 * Diagnostic endpoint to check stats across all seasons
 * This helps identify issues with stats not being saved or aggregated properly
 */
export async function POST(req: Request) {
  try {
    const { saveGameId } = await req.json();

    if (!saveGameId) {
      return NextResponse.json(
        { error: "saveGameId is required" },
        { status: 400 }
      );
    }

    console.log(`[DiagnoseStats] Checking stats for save game: ${saveGameId}`);

    // 1. Check all seasons
    const { data: seasons, error: seasonsError } = await supabase
      .from("seasons")
      .select("*")
      .eq("save_game_id", saveGameId)
      .order("year", { ascending: true });

    if (seasonsError) {
      return NextResponse.json(
        { error: `Failed to fetch seasons: ${seasonsError.message}` },
        { status: 500 }
      );
    }

    const results: any[] = [];

    for (const season of seasons || []) {
      console.log(`[DiagnoseStats] Checking season ${season.year}...`);

      // Check games
      const { count: totalGames } = await supabase
        .from("games")
        .select("*", { count: "exact", head: true })
        .eq("save_game_id", saveGameId)
        .eq("season", season.year);

      const { count: playedGames } = await supabase
        .from("games")
        .select("*", { count: "exact", head: true })
        .eq("save_game_id", saveGameId)
        .eq("season", season.year)
        .eq("played", true);

      // Check player_game_stats
      const { count: gameStatsCount, data: sampleGameStats } = await supabase
        .from("player_game_stats")
        .select("*", { count: "exact" })
        .eq("save_game_id", saveGameId)
        .eq("season", season.year)
        .limit(5);

      // Get week distribution for game stats
      const { data: allGameStats } = await supabase
        .from("player_game_stats")
        .select("week, save_game_id, season")
        .eq("save_game_id", saveGameId)
        .eq("season", season.year);

      const weekDistribution: Record<number, number> = {};
      allGameStats?.forEach((stat) => {
        if (stat.week != null) {
          weekDistribution[stat.week] = (weekDistribution[stat.week] || 0) + 1;
        }
      });

      // Check player_season_stats
      const { count: seasonStatsCount, data: sampleSeasonStats } = await supabase
        .from("player_season_stats")
        .select("*", { count: "exact" })
        .eq("save_game_id", saveGameId)
        .eq("season", season.year)
        .limit(5);

      // Check for COALESCE sentinel UUID stats (these shouldn't exist for a save game)
      const SENTINEL_UUID = "00000000-0000-0000-0000-000000000000";
      const { count: sentinelStatsCount } = await supabase
        .from("player_season_stats")
        .select("*", { count: "exact", head: true })
        .eq("save_game_id", SENTINEL_UUID)
        .eq("season", season.year);

      // Check for NULL save_game_id stats (these shouldn't exist for a save game either)
      const { count: nullStatsCount } = await supabase
        .from("player_season_stats")
        .select("*", { count: "exact", head: true })
        .is("save_game_id", null)
        .eq("season", season.year);

      // Check player_lifetime_stats
      const { count: lifetimeStatsCount } = await supabase
        .from("player_lifetime_stats")
        .select("*", { count: "exact", head: true })
        .eq("save_game_id", saveGameId);

      results.push({
        season: season.year,
        phase: season.phase,
        currentWeek: season.current_week,
        isActive: season.is_active,
        games: {
          total: totalGames || 0,
          played: playedGames || 0,
          unplayed: (totalGames || 0) - (playedGames || 0),
        },
        playerGameStats: {
          count: gameStatsCount || 0,
          weekDistribution,
          sampleStats: sampleGameStats?.map((s) => ({
            player_id: s.player_id,
            game_id: s.game_id,
            week: s.week,
            season: s.season,
            save_game_id: s.save_game_id,
            rushing_yards: s.rushing_yards,
            passing_yards: s.passing_yards,
          })),
        },
        playerSeasonStats: {
          count: seasonStatsCount || 0,
          sentinelCount: sentinelStatsCount || 0,
          nullCount: nullStatsCount || 0,
          sampleStats: sampleSeasonStats?.map((s) => ({
            player_id: s.player_id,
            season: s.season,
            save_game_id: s.save_game_id,
            games_played: s.games_played,
            rushing_yards: s.rushing_yards,
            passing_yards: s.passing_yards,
          })),
        },
        lifetimeStats: {
          count: lifetimeStatsCount || 0,
        },
      });
    }

    // Overall summary
    const totalGameStats = results.reduce(
      (sum, r) => sum + r.playerGameStats.count,
      0
    );
    const totalSeasonStats = results.reduce(
      (sum, r) => sum + r.playerSeasonStats.count,
      0
    );

    return NextResponse.json({
      success: true,
      saveGameId,
      seasonsChecked: seasons?.length || 0,
      summary: {
        totalGameStats,
        totalSeasonStats,
        totalLifetimeStats:
          results[results.length - 1]?.lifetimeStats?.count || 0,
      },
      results,
      diagnosis: {
        year1Stats: results[0]
          ? {
              hasGameStats: results[0].playerGameStats.count > 0,
              hasSeasonStats: results[0].playerSeasonStats.count > 0,
              gamesPlayed: results[0].games.played,
            }
          : null,
        year2Stats: results[1]
          ? {
              hasGameStats: results[1].playerGameStats.count > 0,
              hasSeasonStats: results[1].playerSeasonStats.count > 0,
              gamesPlayed: results[1].games.played,
            }
          : null,
        possibleIssues: [],
      },
    });
  } catch (error) {
    console.error("Error diagnosing stats:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}



