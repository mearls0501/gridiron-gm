import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase-client";
import {
  aggregateSeasonStats,
  aggregateLifetimeStats,
} from "@/lib/simulation/player-development";

/**
 * Fix missing season stats by re-aggregating from game stats
 * This should fix issues where stats weren't aggregated properly during season transitions
 */
export async function POST(req: Request) {
  try {
    const { season, saveGameId, force } = await req.json();

    if (!season || typeof season !== "number") {
      return NextResponse.json(
        { error: "Season is required and must be a number" },
        { status: 400 }
      );
    }

    if (!saveGameId) {
      return NextResponse.json(
        { error: "saveGameId is required" },
        { status: 400 }
      );
    }

    console.log(
      `[FixSeasonStats] Starting fix for season ${season}, saveGameId: ${saveGameId}, force: ${force || false}`
    );

    // 1. Check current state
    const { count: existingSeasonStats } = await supabase
      .from("player_season_stats")
      .select("*", { count: "exact", head: true })
      .eq("save_game_id", saveGameId)
      .eq("season", season);

    const { count: existingGameStats } = await supabase
      .from("player_game_stats")
      .select("*", { count: "exact", head: true })
      .eq("save_game_id", saveGameId)
      .eq("season", season);

    console.log(
      `[FixSeasonStats] Current state: ${existingGameStats || 0} game stats, ${existingSeasonStats || 0} season stats`
    );

    if (!existingGameStats || existingGameStats === 0) {
      return NextResponse.json(
        {
          error: `No game stats found for season ${season}. Cannot aggregate without game stats.`,
          hint: "Simulate some games first to generate game stats.",
        },
        { status: 400 }
      );
    }

    // 2. Check if we need to fix (or if force is true)
    const needsFix =
      force || !existingSeasonStats || existingSeasonStats === 0;

    if (!needsFix) {
      return NextResponse.json({
        success: true,
        message: `Season stats already exist (${existingSeasonStats} records). Use force=true to regenerate.`,
        currentState: {
          gameStats: existingGameStats,
          seasonStats: existingSeasonStats,
        },
      });
    }

    // 3. Delete existing season stats if force=true
    if (force && existingSeasonStats && existingSeasonStats > 0) {
      console.log(
        `[FixSeasonStats] Force=true, deleting ${existingSeasonStats} existing season stats...`
      );
      const { error: deleteError } = await supabase
        .from("player_season_stats")
        .delete()
        .eq("save_game_id", saveGameId)
        .eq("season", season);

      if (deleteError) {
        console.error(
          `[FixSeasonStats] Error deleting existing season stats:`,
          deleteError
        );
        return NextResponse.json(
          {
            error: `Failed to delete existing season stats: ${deleteError.message}`,
          },
          { status: 500 }
        );
      }
      console.log(`[FixSeasonStats] Deleted existing season stats`);
    }

    // 4. Re-aggregate season stats from game stats
    console.log(`[FixSeasonStats] Aggregating season stats from game stats...`);
    const aggregateResult = await aggregateSeasonStats(season, saveGameId);

    if (aggregateResult.errors.length > 0) {
      console.error(
        `[FixSeasonStats] Aggregation completed with errors:`,
        aggregateResult.errors
      );
    }

    console.log(
      `[FixSeasonStats] Aggregated ${aggregateResult.aggregated} season stats`
    );

    // 5. Also update lifetime stats
    console.log(`[FixSeasonStats] Updating lifetime stats...`);
    const lifetimeResult = await aggregateLifetimeStats(season, saveGameId);

    if (lifetimeResult.errors.length > 0) {
      console.error(
        `[FixSeasonStats] Lifetime stats update had errors:`,
        lifetimeResult.errors
      );
    }

    console.log(
      `[FixSeasonStats] Lifetime stats: ${lifetimeResult.created} created, ${lifetimeResult.updated} updated`
    );

    // 6. Verify the fix
    const { count: newSeasonStats } = await supabase
      .from("player_season_stats")
      .select("*", { count: "exact", head: true })
      .eq("save_game_id", saveGameId)
      .eq("season", season);

    return NextResponse.json({
      success: true,
      message: `Successfully fixed stats for season ${season}`,
      results: {
        gameStats: existingGameStats,
        seasonStats: {
          before: existingSeasonStats || 0,
          after: newSeasonStats || 0,
          aggregated: aggregateResult.aggregated,
        },
        lifetimeStats: {
          created: lifetimeResult.created,
          updated: lifetimeResult.updated,
        },
        errors: [
          ...aggregateResult.errors,
          ...lifetimeResult.errors,
        ],
      },
    });
  } catch (error) {
    console.error("Error fixing season stats:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}



