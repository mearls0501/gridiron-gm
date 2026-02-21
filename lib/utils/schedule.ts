import { supabase } from "@/lib/supabase-client";
import { generateSchedule } from "@/lib/schedule-generator";
import { getOrCreateSeason } from "@/lib/seasons/season-manager";
import type { Game } from "@/lib/schedule-generator";
import { createHash } from "crypto";

/**
 * Check if a schedule exists for a given season and save_game_id
 * First checks the schedules table, then falls back to checking games table
 */
export async function scheduleExists(
  season: number,
  saveGameId?: string | null
): Promise<boolean> {
  try {
    // First, check the schedules table (preferred method)
    let scheduleQuery = supabase
      .from("schedules")
      .select("id", { count: "exact", head: true })
      .eq("season", season);

    // Filter by save_game_id if provided
    if (saveGameId) {
      scheduleQuery = scheduleQuery.eq("save_game_id", saveGameId);
    } else {
      scheduleQuery = scheduleQuery.is("save_game_id", null);
    }

    const { count: scheduleCount, error: scheduleError } = await scheduleQuery;

    // If schedules table exists and we found a record, return true
    if (!scheduleError && (scheduleCount ?? 0) > 0) {
      return true;
    }

    // If schedules table doesn't exist (migration not run yet), fall back to games table
    if (
      scheduleError &&
      (scheduleError.code === "PGRST116" ||
        scheduleError.message?.includes("does not exist"))
    ) {
      console.log(
        "Schedules table not found, falling back to checking games table"
      );
    } else if (scheduleError) {
      console.warn("Error checking schedules table:", scheduleError.message);
    }

    // Fallback: check games table
    let gamesQuery = supabase
      .from("games")
      .select("id", { count: "exact", head: true })
      .eq("season", season);

    // Filter by save_game_id if provided
    if (saveGameId) {
      gamesQuery = gamesQuery.eq("save_game_id", saveGameId);
    } else {
      gamesQuery = gamesQuery.is("save_game_id", null);
    }

    const { count: gamesCount, error: gamesError } = await gamesQuery;

    if (gamesError) {
      // If table doesn't exist, return false
      if (
        gamesError.code === "PGRST116" ||
        gamesError.message.includes("does not exist")
      ) {
        return false;
      }
      console.warn("Error checking games table:", gamesError.message);
      return false;
    }

    return (gamesCount ?? 0) > 0;
  } catch (error) {
    console.warn("Error checking schedule existence:", error);
    return false;
  }
}

/**
 * Generate deterministic UUID v5-style ID from game properties
 * CRITICAL: Inputs must be consistent - same inputs = same ID
 * This ensures game IDs remain stable across regenerations
 */
function generateDeterministicGameId(
  saveGameId: string,
  season: number,
  week: number,
  homeTeamId: string,
  awayTeamId: string
): string {
  // CRITICAL: Sort team IDs to ensure consistent ordering regardless of input order
  // This prevents hash mismatches if teams are passed in different orders
  const [team1, team2] = [homeTeamId, awayTeamId].sort();

  // Create a composite key with ALL identifying properties
  // Order matters: saveGameId|season|week|team1|team2 (sorted teams)
  const compositeKey = `${saveGameId}|${season}|${week}|${team1}|${team2}`;

  // Hash the composite key using SHA-256
  const hash = createHash("sha256").update(compositeKey).digest();

  // Convert first 16 bytes to UUID format (v4 style, but deterministic)
  // Format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
  const bytes = Array.from(hash.slice(0, 16));

  // Set version (4) and variant bits
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // Version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // Variant 10

  // Convert to UUID string format
  const hex = bytes.map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

/**
 * Core function to generate and save schedule to database
 * This is the shared logic used by both /api/generate-schedule and ensureScheduleExists
 */
export async function generateAndSaveSchedule(
  season: number,
  saveGameId: string,
  options?: {
    deleteExisting?: boolean; // Whether to delete existing games first (for explicit regeneration)
  }
): Promise<{
  success: boolean;
  created: boolean;
  message: string;
  gameCount?: number;
}> {
  // CRITICAL: Look up or create season record FIRST
  // This ensures season_id exists before we generate the schedule
  console.log(
    `[Generate Schedule] Looking up or creating season record for ${season}...`
  );
  const seasonResult = await getOrCreateSeason(season, saveGameId, {
    phase: "preseason",
    currentWeek: 0,
    isActive: true,
  });

  if (seasonResult.error || !seasonResult.season) {
    console.error("Error getting/creating season:", seasonResult.error);
    return {
      success: false,
      created: false,
      message:
        seasonResult.error ||
        `Failed to get or create season ${season}. Season record must exist before schedule can be generated.`,
    };
  }

  const seasonRecord = seasonResult.season;
  console.log(
    `[Generate Schedule] ${seasonResult.created ? "Created" : "Retrieved"} season record with ID: ${seasonRecord.id}`
  );

  // Fetch teams
  const { data: teams, error: teamsError } = await supabase
    .from("teams")
    .select("id, division, conference")
    .order("id", { ascending: true });

  if (teamsError) {
    console.error("Error fetching teams:", teamsError);
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
  // CRITICAL: Teams are already sorted by ID, ensuring consistent schedule generation
  let games: ReturnType<typeof generateSchedule>;
  try {
    // For first season, standingsLastSeason is empty array (all teams default to rank 1)
    games = generateSchedule(teams, season, []);
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

  // Verify we have exactly 272 games
  if (games.length !== 272) {
    console.warn(
      `[Generate Schedule] Generated ${games.length} games instead of expected 272`
    );
  }

  // Remove duplicate games before processing
  // Use a Map to track unique game keys (season, week, home_team_id, away_team_id)
  const uniqueGames = new Map<string, Game>();
  let duplicateCount = 0;
  for (const game of games) {
    const gameKey = `${season}-${game.week}-${game.home_team_id}-${game.away_team_id}`;
    if (!uniqueGames.has(gameKey)) {
      uniqueGames.set(gameKey, game);
    } else {
      duplicateCount++;
      console.warn(
        `[Generate Schedule] Duplicate game detected and removed: ${gameKey} (week ${game.week}, ${game.home_team_id} vs ${game.away_team_id})`
      );
    }
  }

  const deduplicatedGames = Array.from(uniqueGames.values());
  if (duplicateCount > 0) {
    console.error(
      `[Generate Schedule] Removed ${duplicateCount} duplicate games from schedule generator. Original: ${games.length}, After dedup: ${deduplicatedGames.length}`
    );
  } else {
    console.log(
      `[Generate Schedule] No duplicates found. Game count: ${deduplicatedGames.length}`
    );
  }

  // CRITICAL: If we still have more than 272 games after deduplication, something is wrong
  if (deduplicatedGames.length > 272) {
    console.error(
      `[Generate Schedule] ERROR: Still have ${deduplicatedGames.length} games after deduplication (expected max 272). This indicates a serious issue with the schedule generator.`
    );
    // Take only the first 272 games to prevent database issues
    const excess = deduplicatedGames.length - 272;
    console.warn(
      `[Generate Schedule] Truncating to 272 games, removing ${excess} excess games`
    );
    deduplicatedGames.splice(272);
  }

  // Prepare games with deterministic IDs and required fields
  // CRITICAL: Use deterministic IDs based on consistent inputs
  // This ensures the same game always gets the same ID, preserving foreign key relationships
  // CRITICAL: Include season_id UUID for proper referential integrity
  // CRITICAL: Also deduplicate by ID to prevent "ON CONFLICT DO UPDATE command cannot affect row a second time" error
  const gamesWithIds = deduplicatedGames.map((game) => ({
    id: generateDeterministicGameId(
      saveGameId,
      season,
      game.week,
      game.home_team_id,
      game.away_team_id
    ),
    ...game,
    season: season,
    season_id: seasonRecord.id, // Link to season UUID
    home_score: null,
    away_score: null,
    played: false,
    save_game_id: saveGameId,
  }));

  // CRITICAL: Remove any duplicate IDs (shouldn't happen, but safety check)
  const uniqueGamesById = new Map<string, (typeof gamesWithIds)[0]>();
  for (const game of gamesWithIds) {
    if (!uniqueGamesById.has(game.id)) {
      uniqueGamesById.set(game.id, game);
    } else {
      console.warn(
        `Duplicate game ID detected and removed: ${game.id} (week ${game.week}, ${game.home_team_id} vs ${game.away_team_id})`
      );
    }
  }

  let gamesWithSeason = Array.from(uniqueGamesById.values());
  if (gamesWithSeason.length !== gamesWithIds.length) {
    console.warn(
      `[Generate Schedule] Removed ${gamesWithIds.length - gamesWithSeason.length} games with duplicate IDs. Final count: ${gamesWithSeason.length}`
    );
  }

  // CRITICAL: Enforce maximum of 272 games (32 teams × 17 games / 2)
  // If we have more, something went wrong with the schedule generator
  if (gamesWithSeason.length > 272) {
    console.error(
      `[Generate Schedule] ERROR: Have ${gamesWithSeason.length} games, but maximum is 272. The schedule generator created too many games. Truncating to 272 games.`
    );
    gamesWithSeason = gamesWithSeason.slice(0, 272);
  }

  console.log(
    `[Generate Schedule] Final games to insert: ${gamesWithSeason.length} (expected 272)`
  );

  // CRITICAL: Always delete existing games for this season/saveGameId before inserting
  // This prevents primary key violations from deterministic IDs
  // However, if deleteExisting is false (auto-generation), check for played games first
  if (!options?.deleteExisting) {
    // Check if any games have been played - don't delete if games are in progress
    const { count: playedGamesCount, error: playedGamesError } = await supabase
      .from("games")
      .select("*", { count: "exact", head: true })
      .eq("save_game_id", saveGameId)
      .eq("season", season)
      .eq("played", true);

    if (playedGamesError && playedGamesError.code !== "PGRST116") {
      console.warn("Error checking for played games:", playedGamesError);
    }

    if (playedGamesCount && playedGamesCount > 0) {
      return {
        success: false,
        created: false,
        message: `Cannot regenerate schedule: ${playedGamesCount} games have already been played for season ${season}. Use explicit regeneration to override.`,
      };
    }
  }

  // Delete existing games (safe now - either explicit regeneration or no played games)
  // CRITICAL: Delete by save_game_id + season first
  console.log(
    `[Generate Schedule] Deleting existing games for season ${season}, saveGameId ${saveGameId}...`
  );
  const { error: deleteError } = await supabase
    .from("games")
    .delete()
    .eq("save_game_id", saveGameId)
    .eq("season", season);

  if (deleteError) {
    console.error("Error deleting existing games:", deleteError);
    return {
      success: false,
      created: false,
      message: `Failed to clear existing games: ${deleteError.message}`,
    };
  }

  // CRITICAL: Also delete games with the same deterministic IDs
  // This handles cases where games exist with NULL save_game_id or different save_game_id
  // but have the same IDs (shouldn't happen, but safety check)
  const gameIds = gamesWithSeason.map((g) => g.id);
  if (gameIds.length > 0) {
    console.log(
      `[Generate Schedule] Deleting ${gameIds.length} games by ID to prevent conflicts...`
    );
    // Delete in batches to avoid query size limits
    const batchSize = 100;
    let deletedCount = 0;
    for (let i = 0; i < gameIds.length; i += batchSize) {
      const batch = gameIds.slice(i, i + batchSize);
      const { data: deletedData, error: batchDeleteError } = await supabase
        .from("games")
        .delete()
        .in("id", batch)
        .select("id");

      if (batchDeleteError) {
        console.error(
          `[Generate Schedule] Error deleting batch of games by ID: ${batchDeleteError.message}`
        );
        // Don't fail yet - try to continue with insert and handle conflict
      } else if (deletedData) {
        deletedCount += deletedData.length;
        console.log(
          `[Generate Schedule] Deleted ${deletedData.length} games by ID in batch ${Math.floor(i / batchSize) + 1}`
        );
      }
    }
    console.log(
      `[Generate Schedule] Total deleted by ID: ${deletedCount} games`
    );
  }

  console.log(
    `[Generate Schedule] Cleared existing games, ready to insert new schedule`
  );

  // Insert games
  // We've already deleted all existing games, so use insert (not upsert)
  // Upsert would cause "ON CONFLICT DO UPDATE command cannot affect row a second time"
  // if there are duplicate IDs in the batch (which we've now prevented)
  const { error: insertError } = await supabase
    .from("games")
    .insert(gamesWithSeason);

  if (insertError) {
    console.error("Error inserting games:", insertError);

    // Check if insert failed due to unique constraint violation
    // This can happen if games were created between our existence check and insert
    if (
      insertError.message?.includes("duplicate key") ||
      insertError.message?.includes("unique constraint") ||
      insertError.code === "23505"
    ) {
      console.log(
        `[Generate Schedule] Insert failed due to unique constraint, checking if games now exist...`
      );

      // Re-check if schedule exists now (maybe another process created it)
      const existsNow = await scheduleExists(season, saveGameId);
      if (existsNow) {
        console.log(
          `[Generate Schedule] Games now exist for season ${season}, returning success`
        );
        return {
          success: true,
          created: false,
          message: `Schedule for season ${season} already exists (created by another process)`,
          gameCount: deduplicatedGames.length,
        };
      }

      // If games don't exist, it's a real constraint issue
      console.error(
        `[Generate Schedule] Unique constraint violation but games don't exist. This suggests a data integrity issue.`
      );
      return {
        success: false,
        created: false,
        message: `Failed to insert games: Unique constraint violation detected. Games may exist with conflicting data. Error: ${insertError.message}`,
      };
    }

    return {
      success: false,
      created: false,
      message: `Failed to insert games: ${insertError.message}`,
    };
  }

  // Create or update schedule record to track this schedule generation
  // CRITICAL: Include season_id UUID for proper referential integrity
  const scheduleMetadata = {
    season: season,
    season_id: seasonRecord.id, // Link to season UUID
    save_game_id: saveGameId,
    total_games: deduplicatedGames.length,
    generated_at: new Date().toISOString(),
    generated_by: options?.deleteExisting
      ? "generate-schedule-api"
      : "ensureScheduleExists",
  };

  const { error: scheduleError } = await supabase
    .from("schedules")
    .upsert(scheduleMetadata, {
      onConflict: "save_game_id,season",
      ignoreDuplicates: false,
    });

  if (scheduleError) {
    // Log error but don't fail the request - games were already inserted
    console.error("Error creating schedule record:", scheduleError);
    console.warn(
      "Games were inserted successfully, but schedule record creation failed. This is non-critical."
    );
  } else {
    console.log(
      `Created schedule record for season ${season}, save_game_id: ${saveGameId}`
    );
  }

  return {
    success: true,
    created: true,
    message: `Successfully generated ${deduplicatedGames.length} games for season ${season}`,
    gameCount: deduplicatedGames.length,
  };
}

/**
 * Auto-generate schedule for a season if it doesn't exist
 * @param season - The season year
 * @param saveGameId - Optional save game ID to isolate schedules per save game
 */
export async function ensureScheduleExists(
  season: number,
  saveGameId?: string | null
): Promise<{
  success: boolean;
  created: boolean;
  message: string;
}> {
  try {
    // IMPORTANT: Require saveGameId - games must be associated with a save game
    if (!saveGameId) {
      return {
        success: false,
        created: false,
        message: `saveGameId is required. Cannot create schedule without a save game ID.`,
      };
    }

    // Check if schedule already exists for this save game
    const exists = await scheduleExists(season, saveGameId);
    if (exists) {
      return {
        success: true,
        created: false,
        message: `Schedule for season ${season} already exists${saveGameId ? ` for save game ${saveGameId}` : ""}`,
      };
    }

    // CRITICAL: Check if games exist with NULL save_game_id for this season
    // If they do, update them instead of creating duplicates
    const { data: existingGamesWithNull, error: nullCheckError } =
      await supabase
        .from("games")
        .select("id, season, week, home_team_id, away_team_id")
        .eq("season", season)
        .is("save_game_id", null)
        .limit(10); // Just check if any exist

    if (nullCheckError && nullCheckError.code !== "PGRST116") {
      console.warn(
        "Error checking for games with NULL save_game_id:",
        nullCheckError
      );
    }

    // If games exist with NULL save_game_id, update them instead of creating new ones
    if (existingGamesWithNull && existingGamesWithNull.length > 0) {
      console.log(
        `[ensureScheduleExists] Found ${existingGamesWithNull.length} games with NULL save_game_id for season ${season}, updating them...`
      );

      // Get count of all games with NULL save_game_id for this season
      const { count: nullGamesCount } = await supabase
        .from("games")
        .select("*", { count: "exact", head: true })
        .eq("season", season)
        .is("save_game_id", null);

      if (nullGamesCount && nullGamesCount > 0) {
        // Update all games with NULL save_game_id to have the correct save_game_id
        const { error: updateError } = await supabase
          .from("games")
          .update({ save_game_id: saveGameId })
          .eq("season", season)
          .is("save_game_id", null);

        if (updateError) {
          console.error(
            "Error updating games with NULL save_game_id:",
            updateError
          );
          // If update fails due to unique constraint, we need to handle duplicates
          if (
            updateError.message?.includes("duplicate key") ||
            updateError.message?.includes("unique constraint")
          ) {
            return {
              success: false,
              created: false,
              message: `Failed to update games: Duplicate games detected. Some games may already exist with save_game_id ${saveGameId}. Please use the fix-games-save-game-id endpoint to resolve duplicates.`,
            };
          }
          return {
            success: false,
            created: false,
            message: `Failed to update games with NULL save_game_id: ${updateError.message}`,
          };
        }

        console.log(
          `[ensureScheduleExists] Updated ${nullGamesCount} games with NULL save_game_id to have save_game_id ${saveGameId}`
        );
        return {
          success: true,
          created: false,
          message: `Updated ${nullGamesCount} existing games with NULL save_game_id to have save_game_id ${saveGameId}`,
        };
      }
    }

    // Use shared function to generate and save schedule
    // This ensures same validation, deduplication, and season_id linking
    return await generateAndSaveSchedule(season, saveGameId, {
      deleteExisting: false, // Don't delete - we already checked it doesn't exist
    });
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
 * Validate that schedule exists and is properly linked to season_id before entering preseason
 * @param seasonId - The season UUID
 * @param seasonYear - The season year (for fallback queries)
 * @param saveGameId - The save game ID
 */
export async function validateScheduleForSeason(
  seasonId: string,
  seasonYear: number,
  saveGameId: string
): Promise<{ valid: boolean; error?: string }> {
  try {
    // Check that schedule exists for season_id
    const { data: scheduleRecord, error: scheduleError } = await supabase
      .from("schedules")
      .select("id, season_id, total_games")
      .eq("save_game_id", saveGameId)
      .eq("season", seasonYear)
      .single();

    if (scheduleError) {
      if (scheduleError.code === "PGRST116") {
        // Table doesn't exist - skip this check
        console.warn("Schedules table not found, skipping schedule validation");
      } else if (scheduleError.code === "PGRST116") {
        // No schedule found
        return {
          valid: false,
          error: `Schedule does not exist for season ${seasonYear}. Schedule must be generated before entering preseason.`,
        };
      } else {
        return {
          valid: false,
          error: `Error checking schedule: ${scheduleError.message}`,
        };
      }
    }

    if (!scheduleRecord) {
      return {
        valid: false,
        error: `Schedule does not exist for season ${seasonYear}. Schedule must be generated before entering preseason.`,
      };
    }

    // Check that schedule is linked to season_id
    if (scheduleRecord.season_id !== seasonId) {
      return {
        valid: false,
        error: `Schedule season_id (${scheduleRecord.season_id}) does not match season record id (${seasonId}). Schedule may need to be regenerated.`,
      };
    }

    // Check that games exist and have season_id populated
    const { count: gamesCount, error: gamesError } = await supabase
      .from("games")
      .select("*", { count: "exact", head: true })
      .eq("save_game_id", saveGameId)
      .eq("season", seasonYear);

    if (gamesError && gamesError.code !== "PGRST116") {
      return {
        valid: false,
        error: `Error checking games: ${gamesError.message}`,
      };
    }

    if (!gamesCount || gamesCount === 0) {
      return {
        valid: false,
        error: `No games found for season ${seasonYear}. Schedule must be generated before entering preseason.`,
      };
    }

    // Check that games have season_id populated
    const { count: gamesWithSeasonId, error: seasonIdCheckError } =
      await supabase
        .from("games")
        .select("*", { count: "exact", head: true })
        .eq("save_game_id", saveGameId)
        .eq("season", seasonYear)
        .eq("season_id", seasonId);

    if (seasonIdCheckError && seasonIdCheckError.code !== "PGRST116") {
      return {
        valid: false,
        error: `Error checking games season_id: ${seasonIdCheckError.message}`,
      };
    }

    if (!gamesWithSeasonId || gamesWithSeasonId < gamesCount) {
      const missingCount = (gamesCount || 0) - (gamesWithSeasonId || 0);
      return {
        valid: false,
        error: `${missingCount} games are missing season_id linkage. Schedule may need to be regenerated.`,
      };
    }

    // All validations passed
    return {
      valid: true,
    };
  } catch (error) {
    console.error("Error validating schedule for season:", error);
    return {
      valid: false,
      error:
        error instanceof Error
          ? error.message
          : "Unknown error during validation",
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
