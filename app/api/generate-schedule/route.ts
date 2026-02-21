import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase-client";
import { generateSchedule } from "@/lib/schedule-generator";

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

    // Fetch all teams from the database
    const { data: teams, error: teamsError } = await supabase
      .from("teams")
      .select("id, division, conference");

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

    // Generate the schedule (deterministic based on season)
    const games = generateSchedule(teams, scheduleSeason);

    // Verify we have exactly 272 games
    if (games.length !== 272) {
      console.warn(`Generated ${games.length} games instead of expected 272`);
    }

    // Delete existing games for this season and save_game_id (if any exist)
    // Don't fail if table doesn't exist, no games to delete, or permission issues
    try {
      let deleteError;

      // Try to delete with save_game_id filter if provided
      if (saveGameId) {
        const { error } = await supabase
          .from("games")
          .delete()
          .eq("save_game_id", saveGameId)
          .eq("season", scheduleSeason); // Also filter by season
        deleteError = error;

        // If error is about save_game_id column not existing, retry with just season
        if (
          deleteError &&
          (deleteError.message?.includes("save_game_id") ||
            (deleteError.message?.includes("column") &&
              deleteError.message?.includes("does not exist")) ||
            deleteError.code === "42703")
        ) {
          const { error: retryError } = await supabase
            .from("games")
            .delete()
            .eq("season", scheduleSeason);
          deleteError = retryError;
        }
      } else {
        // Try to delete games with NULL save_game_id for this season
        const { error } = await supabase
          .from("games")
          .delete()
          .eq("season", scheduleSeason)
          .is("save_game_id", null);
        deleteError = error;

        // If error is about save_game_id column not existing, retry with just season
        if (
          deleteError &&
          (deleteError.message?.includes("save_game_id") ||
            (deleteError.message?.includes("column") &&
              deleteError.message?.includes("does not exist")) ||
            deleteError.code === "42703")
        ) {
          const { error: retryError } = await supabase
            .from("games")
            .delete()
            .eq("season", scheduleSeason);
          deleteError = retryError;
        }
      }

      // Only log the error, don't fail - it's okay if there are no games to delete
      // or if there are permission issues (we'll handle duplicates on insert)
      if (deleteError) {
        console.warn(
          "Warning deleting old games (may not exist or permission issue):",
          deleteError.message
        );
        // Continue anyway - we'll try to insert new games
        // If duplicates exist, the insert will fail and we'll handle it
      }
    } catch (deleteErr) {
      // Catch any unexpected errors during delete, but continue
      console.warn(
        "Warning during delete operation (continuing anyway):",
        deleteErr
      );
    }

    // Insert new games with save_game_id (with fallback if column doesn't exist)
    // If saveGameId is provided, verify it exists in save_games table first
    let validSaveGameId: string | null = saveGameId || null;
    if (validSaveGameId) {
      const { data: saveGame, error: saveGameCheckError } = await supabase
        .from("save_games")
        .select("id")
        .eq("id", validSaveGameId)
        .single();

      if (saveGameCheckError || !saveGame) {
        console.warn(
          `Save game ${validSaveGameId} not found, inserting games without save_game_id`
        );
        // Set to null so we don't try to use invalid save_game_id
        validSaveGameId = null;
      }
    }

    const gamesWithSeason = games.map((game) => ({
      ...game,
      season: scheduleSeason,
      home_score: null,
      away_score: null,
      played: false,
      save_game_id: validSaveGameId, // Include save_game_id if provided and valid
    }));

    let { error: insertError } = await supabase
      .from("games")
      .insert(gamesWithSeason);

    // If insert fails because save_game_id column doesn't exist, retry without it
    if (
      insertError &&
      (insertError.message?.includes("save_game_id") ||
        (insertError.message?.includes("column") &&
          insertError.message?.includes("does not exist")) ||
        insertError.code === "42703") // undefined_column
    ) {
      console.warn(
        "save_game_id column not found, inserting games without it. Please run the migration: supabase/migrations/add_save_game_isolation.sql"
      );

      // Retry without save_game_id
      const gamesWithoutSaveGameId = games.map((game) => ({
        ...game,
        season: scheduleSeason,
        home_score: null,
        away_score: null,
        played: false,
      }));

      ({ error: insertError } = await supabase
        .from("games")
        .insert(gamesWithoutSaveGameId));
    }

    if (insertError) {
      console.error("Error inserting games:", insertError);
      console.error("Insert error details:", {
        message: insertError.message,
        code: insertError.code,
        details: insertError.details,
        hint: insertError.hint,
      });

      // Check if it's a foreign key constraint error (save_game_id doesn't exist in save_games)
      if (
        insertError.message?.includes("foreign key") ||
        insertError.message?.includes("save_games") ||
        insertError.code === "23503"
      ) {
        return NextResponse.json(
          {
            error: "Failed to insert games: Invalid save_game_id",
            details: `The save_game_id (${saveGameId}) does not exist in the save_games table. This might happen if the save game was deleted or not properly created.`,
            saveGameId: saveGameId,
          },
          { status: 400 }
        );
      }

      return NextResponse.json(
        {
          error: "Failed to insert games",
          details: insertError.message,
          code: insertError.code,
          hint: insertError.hint || "Check the console for more details",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Successfully generated ${games.length} games for season ${season}`,
      gameCount: games.length,
    });
  } catch (error) {
    console.error("Schedule generation error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
