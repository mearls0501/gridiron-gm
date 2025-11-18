import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase-client";

/**
 * API endpoint to check if player stats tables exist
 * Since Supabase client doesn't support DDL operations,
 * this checks if tables exist and provides instructions if they don't
 */
export async function POST(req: Request) {
  try {
    // Check if player_game_stats table exists
    const { error: gameStatsError } = await supabase
      .from("player_game_stats")
      .select("id")
      .limit(1);

    // Check if player_season_stats table exists
    const { error: seasonStatsError } = await supabase
      .from("player_season_stats")
      .select("id")
      .limit(1);

    // If both tables exist, return success
    if (!gameStatsError && !seasonStatsError) {
      return NextResponse.json({
        success: true,
        message: "Player stats tables already exist",
        created: false,
      });
    }

    // If tables don't exist, provide instructions
    const missingTables: string[] = [];
    if (gameStatsError && (
      gameStatsError.code === "PGRST116" ||
      gameStatsError.message.includes("does not exist") ||
      gameStatsError.message.includes("Could not find the table")
    )) {
      missingTables.push("player_game_stats");
    }

    if (seasonStatsError && (
      seasonStatsError.code === "PGRST116" ||
      seasonStatsError.message.includes("does not exist") ||
      seasonStatsError.message.includes("Could not find the table")
    )) {
      missingTables.push("player_season_stats");
    }

    if (missingTables.length > 0) {
      return NextResponse.json(
        {
          success: false,
          message: `Missing tables: ${missingTables.join(", ")}. Please run the migration SQL.`,
          instructions: [
            "1. Go to your Supabase dashboard",
            "2. Navigate to SQL Editor",
            "3. Run the SQL from: supabase/migrations/create_player_stats_tables.sql",
            "4. Or use the Supabase CLI: supabase db push",
          ],
          sqlFile: "supabase/migrations/create_player_stats_tables.sql",
          missingTables,
        },
        { status: 400 }
      );
    }

    // Other errors
    return NextResponse.json(
      {
        success: false,
        message: `Error checking tables: ${gameStatsError?.message || seasonStatsError?.message}`,
      },
      { status: 500 }
    );
  } catch (error) {
    console.error("Error in setup-stats-tables:", error);
    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Unknown error setting up stats tables",
      },
      { status: 500 }
    );
  }
}

/**
 * GET endpoint to check table status
 */
export async function GET() {
  try {
    const { error: gameStatsError } = await supabase
      .from("player_game_stats")
      .select("id")
      .limit(1);

    const { error: seasonStatsError } = await supabase
      .from("player_season_stats")
      .select("id")
      .limit(1);

    const gameStatsExists = !gameStatsError;
    const seasonStatsExists = !seasonStatsError;

    return NextResponse.json({
      success: true,
      tables: {
        player_game_stats: gameStatsExists,
        player_season_stats: seasonStatsExists,
      },
      allExist: gameStatsExists && seasonStatsExists,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

