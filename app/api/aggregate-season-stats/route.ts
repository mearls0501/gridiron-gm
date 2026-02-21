import { NextResponse } from "next/server";
import { aggregateSeasonStats } from "@/lib/simulation/player-development";

/**
 * Manually trigger aggregation of season stats from game stats
 * Useful for fixing data or regenerating stats after clearing old data
 */
export async function POST(req: Request) {
  try {
    const { season, saveGameId } = await req.json();

    if (!season) {
      return NextResponse.json(
        { error: "Season is required" },
        { status: 400 }
      );
    }

    console.log(
      `[AggregateStats API] Starting aggregation for season ${season}, saveGameId: ${saveGameId || "null"}`
    );

    // First, check how many game stats exist
    const { supabase } = await import("@/lib/supabase-client");
    let gameStatsQuery = supabase
      .from("player_game_stats")
      .select("player_id, week, game_id, rushing_yards, save_game_id", {
        count: "exact",
      })
      .eq("season", season);

    if (saveGameId) {
      gameStatsQuery = gameStatsQuery.eq("save_game_id", saveGameId);
    } else {
      gameStatsQuery = gameStatsQuery.is("save_game_id", null);
    }

    const {
      data: gameStatsSample,
      count: gameStatsCount,
      error: gameStatsError,
    } = await gameStatsQuery.limit(1000);

    const weekDistribution: Record<number, number> = {};
    const playerGameCounts: Record<string, number> = {};
    if (gameStatsSample) {
      gameStatsSample.forEach((stat) => {
        if (stat.week != null) {
          weekDistribution[stat.week] = (weekDistribution[stat.week] || 0) + 1;
        }
        playerGameCounts[stat.player_id] =
          (playerGameCounts[stat.player_id] || 0) + 1;
      });
    }

    console.log(
      `[AggregateStats API] Found ${gameStatsCount || 0} game stats total`
    );
    console.log(`[AggregateStats API] Week distribution:`, weekDistribution);
    console.log(
      `[AggregateStats API] Sample player game counts:`,
      Object.fromEntries(Object.entries(playerGameCounts).slice(0, 10))
    );

    // DIAGNOSTIC: Check ALL stats for this season (regardless of save_game_id) to see what's actually stored
    const { data: allStatsDiagnostic, count: allStatsCount } = await supabase
      .from("player_game_stats")
      .select("week, save_game_id", { count: "exact" })
      .eq("season", season);

    if (allStatsDiagnostic) {
      const allWeekDistribution: Record<number, number> = {};
      const allSaveGameIdDistribution = new Map<string | null, number>();
      allStatsDiagnostic.forEach((stat) => {
        if (stat.week != null) {
          allWeekDistribution[stat.week] =
            (allWeekDistribution[stat.week] || 0) + 1;
        }
        const sgid = stat.save_game_id || null;
        allSaveGameIdDistribution.set(
          sgid,
          (allSaveGameIdDistribution.get(sgid) || 0) + 1
        );
      });
      console.log(`[AggregateStats API] DIAGNOSTIC - ALL stats (unfiltered):`);
      console.log(`  Total stats: ${allStatsCount || 0}`);
      console.log(`  Week distribution:`, allWeekDistribution);
      console.log(
        `  save_game_id distribution:`,
        Object.fromEntries(allSaveGameIdDistribution)
      );
      console.log(`  Requested saveGameId: ${saveGameId || "null"}`);
    }

    const result = await aggregateSeasonStats(season, saveGameId || null);

    if (result.errors.length > 0) {
      console.error(
        `[AggregateStats API] Aggregation completed with ${result.errors.length} errors:`,
        result.errors
      );
    }

    return NextResponse.json({
      success: true,
      aggregated: result.aggregated,
      errors: result.errors.length > 0 ? result.errors : undefined,
      message: `Successfully aggregated ${result.aggregated} player season stats`,
      debug: {
        gameStatsCount: gameStatsCount || 0,
        weekDistribution,
        samplePlayerCounts: Object.fromEntries(
          Object.entries(playerGameCounts).slice(0, 5)
        ),
      },
    });
  } catch (error) {
    console.error("Error aggregating season stats:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
