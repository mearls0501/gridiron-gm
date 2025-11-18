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
    const { season } = await req.json();

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

    // Delete existing games for this season (if any exist)
    // Don't fail if table doesn't exist, no games to delete, or permission issues
    try {
      const { error: deleteError } = await supabase
        .from("games")
        .delete()
        .eq("season", scheduleSeason);

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

    // Insert new games
    const gamesWithSeason = games.map((game) => ({
      ...game,
      season: scheduleSeason,
      home_score: null,
      away_score: null,
      played: false,
    }));

    const { error: insertError } = await supabase
      .from("games")
      .insert(gamesWithSeason);

    if (insertError) {
      console.error("Error inserting games:", insertError);
      return NextResponse.json(
        { error: "Failed to insert games" },
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
