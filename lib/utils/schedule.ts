import { supabase } from "@/lib/supabase-client";
import { generateSchedule } from "@/lib/schedule-generator";

/**
 * Check if a schedule exists for a given season and save_game_id
 */
export async function scheduleExists(season: number, saveGameId?: string | null): Promise<boolean> {
  try {
    let query = supabase
      .from("games")
      .select("id", { count: "exact", head: true })
      .eq("season", season);

    // Filter by save_game_id if provided
    if (saveGameId) {
      query = query.eq("save_game_id", saveGameId);
    } else {
      query = query.is("save_game_id", null);
    }

    const { count, error } = await query;

    if (error) {
      // If table doesn't exist, return false
      if (
        error.code === "PGRST116" ||
        error.message.includes("does not exist")
      ) {
        return false;
      }
      console.warn("Error checking schedule:", error.message);
      return false;
    }

    return (count ?? 0) > 0;
  } catch (error) {
    console.warn("Error checking schedule existence:", error);
    return false;
  }
}

/**
 * Auto-generate schedule for a season if it doesn't exist
 * @param season - The season year
 * @param saveGameId - Optional save game ID to isolate schedules per save game
 */
export async function ensureScheduleExists(season: number, saveGameId?: string | null): Promise<{
  success: boolean;
  created: boolean;
  message: string;
}> {
  try {
    // Check if schedule already exists for this save game
    const exists = await scheduleExists(season, saveGameId);
    if (exists) {
      return {
        success: true,
        created: false,
        message: `Schedule for season ${season} already exists${saveGameId ? ` for save game ${saveGameId}` : ''}`,
      };
    }

    // Fetch teams
    const { data: teams, error: teamsError } = await supabase
      .from("teams")
      .select("id, division, conference");

    if (teamsError) {
      console.error("Error fetching teams for schedule:", teamsError);
      return {
        success: false,
        created: false,
        message: `Failed to fetch teams: ${teamsError.message}`,
      };
    }

    if (!teams || teams.length !== 32) {
      return {
        success: false,
        created: false,
        message: `Expected 32 teams, found ${teams?.length || 0}. Cannot generate schedule.`,
      };
    }

    // Generate the schedule (deterministic based on season)
    let games: ReturnType<typeof generateSchedule>;
    try {
      games = generateSchedule(teams, season);
    } catch (error) {
      console.error("Error generating schedule:", error);
      return {
        success: false,
        created: false,
        message: `Failed to generate schedule: ${error instanceof Error ? error.message : "Unknown error"}`,
      };
    }

    // Check if games were generated successfully
    if (!games || !Array.isArray(games)) {
      return {
        success: false,
        created: false,
        message: `Failed to generate schedule: generateSchedule returned invalid data`,
      };
    }

    if (games.length !== 272) {
      console.warn(`Generated ${games.length} games instead of expected 272`);
    }

    // Prepare games with season data and save_game_id
    const gamesWithSeason = games.map((game) => ({
      ...game,
      season,
      home_score: null,
      away_score: null,
      played: false,
      save_game_id: saveGameId || null,
    }));

    // Insert games (don't delete first - we already checked it doesn't exist)
    const { error: insertError } = await supabase
      .from("games")
      .insert(gamesWithSeason);

    if (insertError) {
      console.error("Error inserting games:", insertError);

      // Check if the error is because the table doesn't exist
      // This should be treated as an error since the games table should exist
      if (
        insertError.message.includes("Could not find the table") ||
        insertError.message.includes("does not exist") ||
        insertError.code === "PGRST116"
      ) {
        return {
          success: false,
          created: false,
          message: `Games table not found. Please run database migrations to create the games table. Schedule cannot be saved without the table.`,
        };
      }

      return {
        success: false,
        created: false,
        message: `Failed to insert games: ${insertError.message}`,
      };
    }

    return {
      success: true,
      created: true,
      message: `Successfully auto-generated ${games.length} games for season ${season}`,
    };
  } catch (error) {
    console.error("Error ensuring schedule exists:", error);
    return {
      success: false,
      created: false,
      message: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Get the current season (defaults to 2025)
 */
export async function getCurrentSeason(): Promise<number> {
  // In the future, this could check a league settings table
  // For now, default to 2025
  return 2025;
}
