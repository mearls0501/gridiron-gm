import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase-client";
import { generateAndSaveSchedule } from "@/lib/utils/schedule";

/**
 * Generate and save schedule to database
 *
 * RULE: This MUST be called when creating a new league.
 * The schedule is required for game simulation to work.
 *
 * @param season - The season year (defaults to 2025 if not provided)
 */
export async function POST(req: Request) {
  try {
    const { season, saveGameId } = await req.json();

    // Default to 2025 if not provided (for league creation)
    const scheduleSeason = season || 2025;

    // IMPORTANT: Require saveGameId - games must be associated with a save game
    if (!saveGameId) {
      return NextResponse.json(
        {
          error:
            "saveGameId is required. Games must be associated with a save game.",
          hint: "Make sure you're creating games from within a save game context. The save game must be created first.",
        },
        { status: 400 }
      );
    }

    // Verify saveGameId exists in save_games table before proceeding
    const { data: saveGame, error: saveGameCheckError } = await supabase
      .from("save_games")
      .select("id")
      .eq("id", saveGameId)
      .single();

    if (saveGameCheckError || !saveGame) {
      return NextResponse.json(
        {
          error: `Invalid saveGameId: ${saveGameId} does not exist in save_games table`,
          hint: "Make sure the save game exists before generating a schedule. Create a save game first.",
        },
        { status: 400 }
      );
    }

    // CRITICAL: Sort teams by ID to ensure consistent ordering
    // This prevents hash mismatches if teams are fetched in different orders
    const { data: teams, error: teamsError } = await supabase
      .from("teams")
      .select("id, division, conference")
      .order("id", { ascending: true });

    if (teamsError) {
      console.error("Error fetching teams:", teamsError);
      return NextResponse.json(
        { error: "Failed to fetch teams" },
        { status: 500 }
      );
    }

    if (!teams || teams.length !== 32) {
      return NextResponse.json(
        { error: `Expected 32 teams, found ${teams?.length || 0}` },
        { status: 400 }
      );
    }

    // VALIDATION 1: Check if schedule already exists for this season
    const { data: existingSchedule, error: scheduleCheckError } = await supabase
      .from("schedules")
      .select("id, total_games, generated_at")
      .eq("save_game_id", saveGameId)
      .eq("season", scheduleSeason)
      .single();

    if (existingSchedule && !scheduleCheckError) {
      console.log(
        `[Generate Schedule] Existing schedule found for season ${scheduleSeason}. Will regenerate (deleteExisting: true).`
      );
      // Allow regeneration - the generateAndSaveSchedule function will handle deletion
    }

    // VALIDATION 2: Check if any games have been played for this season
    // This prevents deletion of past seasons with game results
    const { count: playedGamesCount, error: playedGamesError } = await supabase
      .from("games")
      .select("*", { count: "exact", head: true })
      .eq("save_game_id", saveGameId)
      .eq("season", scheduleSeason)
      .eq("played", true);

    if (playedGamesError && playedGamesError.code !== "PGRST116") {
      console.warn("Error checking for played games:", playedGamesError);
    }

    if (playedGamesCount && playedGamesCount > 0) {
      return NextResponse.json(
        {
          error: "Cannot regenerate schedule: Games have already been played",
          message: `Season ${scheduleSeason} has ${playedGamesCount} played games. Cannot regenerate schedule with existing game results.`,
          season: scheduleSeason,
          playedGamesCount: playedGamesCount,
        },
        { status: 400 } // Bad Request
      );
    }

    // Use shared function to generate and save schedule
    // This ensures same validation, deduplication, and season_id linking
    // deleteExisting: true because this is an explicit regeneration request
    const result = await generateAndSaveSchedule(scheduleSeason, saveGameId, {
      deleteExisting: true,
    });

    if (!result.success) {
      return NextResponse.json(
        {
          error: result.message,
          hint: "Check the console for more details",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: result.message,
      gameCount: result.gameCount,
      scheduleCreated: result.created,
    });
  } catch (error) {
    console.error("Schedule generation error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
