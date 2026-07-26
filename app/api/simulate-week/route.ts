import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase-client";
import { isMissingSupabaseTableError } from "@/lib/supabase-errors";
import { simulateGame, loadTeamsWithRosters } from "@/lib/simulation/engine";
import { PlayerGameStat } from "@/lib/simulation/types";

export async function POST(req: Request) {
  try {
    const { season, week, saveGameId } = await req.json();

    // Validate required fields - note: week can be 0 (preseason), so check for null/undefined explicitly
    if (!season || week === null || week === undefined) {
      return NextResponse.json(
        { error: "Season and week are required" },
        { status: 400 }
      );
    }

    // CRITICAL: Require saveGameId to prevent stats from being saved with wrong/null save_game_id
    if (!saveGameId) {
      return NextResponse.json(
        {
          error: "saveGameId is required",
          hint: "All games and stats must be associated with a save game. Make sure you're using a valid save game.",
        },
        { status: 400 }
      );
    }

    // Get all unplayed games for this week
    let gamesQuery = supabase
      .from("games")
      .select("*")
      .eq("season", season)
      .eq("week", week)
      .eq("played", false);

    // Filter by save_game_id if provided
    if (saveGameId) {
      gamesQuery = gamesQuery.eq("save_game_id", saveGameId);
    } else {
      gamesQuery = gamesQuery.is("save_game_id", null);
    }

    const { data: games, error: gamesError } = await gamesQuery;

    if (gamesError) {
      return NextResponse.json(
        { error: "Failed to fetch games" },
        { status: 500 }
      );
    }

    if (!games || games.length === 0) {
      return NextResponse.json(
        { error: "No unplayed games found for this week" },
        { status: 404 }
      );
    }

    // CRITICAL: Ensure all games have the correct save_game_id
    // This prevents stats from being saved with wrong/null save_game_id
    // saveGameId is guaranteed to be non-null at this point (validated above)
    const gamesNeedingUpdate = games.filter(
      (g) => g.save_game_id !== saveGameId
    );
    if (gamesNeedingUpdate.length > 0) {
      // OPTIMIZED: Check for duplicates with a single query instead of one per game
      // Build a list of unique (season, week, home_team_id, away_team_id) combinations
      const gameKeys = gamesNeedingUpdate.map((g) => ({
        season: g.season,
        week: g.week,
        home_team_id: g.home_team_id,
        away_team_id: g.away_team_id,
        gameId: g.id,
      }));

      // Query for all existing games with this save_game_id for the same season/week
      // This is much faster than individual queries
      const existingGamesQuery = supabase
        .from("games")
        .select("season, week, home_team_id, away_team_id")
        .eq("save_game_id", saveGameId)
        .eq("season", season)
        .eq("week", week);

      const { data: existingGames, error: existingError } =
        await existingGamesQuery;

      if (existingError && existingError.code !== "PGRST116") {
        console.error(
          `[SimulateWeek] Error checking for existing games:`,
          existingError
        );
        // Continue anyway - try to update
      }

      // Create a Set of existing game keys for fast lookup
      const existingGameKeys = new Set(
        (existingGames || []).map(
          (g) => `${g.season}-${g.week}-${g.home_team_id}-${g.away_team_id}`
        )
      );

      // Separate games into duplicates and those to update
      const duplicateGameIds: string[] = [];
      const gamesToUpdate: string[] = [];

      gameKeys.forEach((key) => {
        const keyString = `${key.season}-${key.week}-${key.home_team_id}-${key.away_team_id}`;
        if (existingGameKeys.has(keyString)) {
          duplicateGameIds.push(key.gameId);
        } else {
          gamesToUpdate.push(key.gameId);
        }
      });

      // Delete duplicate games (games without save_game_id that have duplicates with save_game_id)
      if (duplicateGameIds.length > 0) {
        console.log(
          `[SimulateWeek] Found ${duplicateGameIds.length} duplicate games, deleting them`
        );
        const { error: deleteError } = await supabase
          .from("games")
          .delete()
          .in("id", duplicateGameIds);

        if (deleteError) {
          console.error(
            `[SimulateWeek] Error deleting duplicate games:`,
            deleteError
          );
          // Continue anyway - try to update the rest
        } else {
          console.log(
            `[SimulateWeek] Deleted ${duplicateGameIds.length} duplicate games`
          );
          // Remove deleted games from the games array
          duplicateGameIds.forEach((gameId) => {
            const index = games.findIndex((game) => game.id === gameId);
            if (index !== -1) {
              games.splice(index, 1);
            }
          });
        }
      }

      // Update games that don't have duplicates
      if (gamesToUpdate.length > 0) {
        const { error: updateError } = await supabase
          .from("games")
          .update({ save_game_id: saveGameId })
          .in("id", gamesToUpdate);

        if (updateError) {
          // If it's a duplicate key error, try deleting duplicates first
          if (
            updateError.message?.includes("duplicate key") ||
            updateError.message?.includes("unique constraint")
          ) {
            console.warn(
              `[SimulateWeek] Duplicate key error during update, this should have been caught earlier`
            );
            // Try to continue - the games might still work
          } else {
            console.error(
              `[SimulateWeek] CRITICAL: Failed to update ${gamesToUpdate.length} games with save_game_id ${saveGameId}:`,
              updateError
            );
            // This is a critical error - games without correct save_game_id will cause stats isolation issues
            return NextResponse.json(
              {
                error: `Failed to update games with save_game_id. This is required for proper data isolation.`,
                details: updateError.message,
              },
              { status: 500 }
            );
          }
        } else {
          console.log(
            `[SimulateWeek] Updated ${gamesToUpdate.length} games with save_game_id ${saveGameId}`
          );
          // Update local game objects so they reflect the correct save_game_id
          gamesNeedingUpdate
            .filter((g) => gamesToUpdate.includes(g.id))
            .forEach((g) => (g.save_game_id = saveGameId));
        }
      }
    }

    // Batch load all teams before simulation to avoid redundant queries
    const allTeamIds = new Set<string>();
    games.forEach((game) => {
      allTeamIds.add(game.home_team_id);
      allTeamIds.add(game.away_team_id);
    });

    // CRITICAL: Check roster sizes for all teams and auto-replenish if needed
    // This prevents simulation failures due to incomplete rosters
    console.log(
      `[Simulate Week] Checking roster sizes for ${allTeamIds.size} teams...`
    );
    const teamIdsArray = Array.from(allTeamIds);
    for (const teamId of teamIdsArray) {
      const { count: rosterSize } = await supabase
        .from("player_team_assignments")
        .select("*", { count: "exact", head: true })
        .eq("team_id", teamId)
        .eq("save_game_id", saveGameId);

      if ((rosterSize || 0) !== 53) {
        console.log(
          `[Simulate Week] Team ${teamId} has ${rosterSize || 0} players, replenishing to 53...`
        );
        const { replenishTeamRosterOnly } = await import(
          "@/lib/utils/roster-replenisher"
        );
        const replenishResult = await replenishTeamRosterOnly(
          teamId,
          saveGameId,
          season,
          week
        );
        console.log(
          `[Simulate Week] Team ${teamId} replenished: ${replenishResult.beforeSize} → ${replenishResult.afterSize} (added ${replenishResult.playersAdded})`
        );
      }
    }

    console.log(
      `[Simulate Week] Batch loading ${allTeamIds.size} unique teams...`
    );
    const preloadedTeams = await loadTeamsWithRosters(
      Array.from(allTeamIds),
      saveGameId
    );
    console.log(
      `[Simulate Week] Successfully loaded ${preloadedTeams.size} teams`
    );

    // Simulate games sequentially with progress tracking
    // Process in smaller batches for better progress visibility
    const results: Array<{
      gameId: string;
      homeTeam: string;
      awayTeam: string;
      homeScore: number;
      awayScore: number;
    }> = [];
    const errors: Array<{ gameId: string; error: string }> = [];
    const allPlayerStats: PlayerGameStat[] = [];
    const gameUpdates: Array<{
      id: string;
      home_score: number;
      away_score: number;
    }> = [];

    async function flushGameUpdates(
      updates: Array<{ id: string; home_score: number; away_score: number }>
    ) {
      const updateResults = await Promise.all(
        updates.map((update) =>
          supabase
            .from("games")
            .update({
              home_score: update.home_score,
              away_score: update.away_score,
              played: true,
              updated_at: new Date().toISOString(),
            })
            .eq("id", update.id)
        )
      );

      const failedUpdates = updateResults
        .map((result, index) => ({
          gameId: updates[index]?.id,
          error: result.error,
        }))
        .filter((item) => item.error);

      if (failedUpdates.length > 0) {
        const firstFailure = failedUpdates[0];
        throw new Error(
          `Failed to persist game results for game ${firstFailure?.gameId}: ${firstFailure?.error?.message || "Unknown error"}`
        );
      }
    }

    // Process games in batches of 4 for better progress visibility
    const batchSize = 4;
    for (let i = 0; i < games.length; i += batchSize) {
      const batch = games.slice(i, i + batchSize);

      // Simulate batch in parallel
      const batchPromises = batch.map(async (game) => {
        try {
          let result;
          try {
            result = await simulateGame(
              {
                homeTeamId: game.home_team_id,
                awayTeamId: game.away_team_id,
                gameId: game.id,
                season: game.season,
                week: game.week,
                useEnhancedAttributes: true, // 🏈 Enable attribute-based simulation
              },
              preloadedTeams,
              saveGameId
            );
          } catch (simError) {
            // If it's a roster size error, provide more context
            if (
              simError instanceof Error &&
              simError.message.includes("ROSTER_SIZE_ERROR")
            ) {
              throw new Error(
                `Roster validation failed: ${simError.message.replace("ROSTER_SIZE_ERROR: ", "")}. Please use the roster management or replenishment tools.`
              );
            }
            throw simError;
          }

          // Collect stats and updates for batch operations
          if (result.playerStats && result.playerStats.length > 0) {
            // CRITICAL: Always use saveGameId from request (guaranteed to be non-null at this point)
            // Never fall back to game.save_game_id - if game doesn't have it, we updated it earlier
            // This ensures all stats are saved with the correct save_game_id
            const statsWithSaveGameId = result.playerStats.map((stat) => ({
              ...stat,
              save_game_id: saveGameId, // Always use the provided saveGameId
            }));
            allPlayerStats.push(...statsWithSaveGameId);
          }

          gameUpdates.push({
            id: game.id,
            home_score: Math.round(result.homeScore),
            away_score: Math.round(result.awayScore),
          });

          return {
            gameId: game.id,
            homeTeam: game.home_team_id,
            awayTeam: game.away_team_id,
            homeScore: result.homeScore,
            awayScore: result.awayScore,
          };
        } catch (error) {
          errors.push({
            gameId: game.id,
            error: error instanceof Error ? error.message : "Unknown error",
          });
          return null;
        }
      });

      // Wait for batch to complete
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults.filter((r) => r !== null));

      // Save progress after each batch
      if (gameUpdates.length > 0) {
        const batchUpdates = gameUpdates.splice(0, batchSize);
        await flushGameUpdates(batchUpdates);
      }
    }

    // Any remaining game updates (should be none after batch processing)
    if (gameUpdates.length > 0) {
      await flushGameUpdates(gameUpdates);
    }

    // Batch insert all player stats
    if (allPlayerStats.length > 0) {
      // Insert in chunks of 1000 to avoid payload size limits
      const chunkSize = 1000;
      for (let i = 0; i < allPlayerStats.length; i += chunkSize) {
        const chunk = allPlayerStats.slice(i, i + chunkSize);
        const { error: statsError, data: insertedStats } = await supabase
          .from("player_game_stats")
          .insert(chunk)
          .select();

        if (statsError) {
          throw new Error(
            `Failed to persist player stats chunk ${i}-${Math.min(i + chunkSize, allPlayerStats.length)}: ${statsError.message}`
          );
        } else {
          console.log(
            `Successfully saved ${insertedStats?.length || 0} stats in chunk ${i}-${i + chunkSize}`
          );
        }
      }
    }

    // Aggregate season stats synchronously to ensure it completes
    if (results.length > 0) {
      try {
        console.log(
          `[Simulate Week] Aggregating season stats for season ${season}, saveGameId: ${saveGameId || "null"}...`
        );
        const { aggregateSeasonStats } = await import(
          "@/lib/simulation/player-development"
        );
        const aggResult = await aggregateSeasonStats(season, saveGameId);
        console.log(
          `[Simulate Week] Completed stats aggregation: ${aggResult.aggregated} players aggregated`
        );
        if (aggResult.errors.length > 0) {
          console.warn(
            `[Simulate Week] Stats aggregation had ${aggResult.errors.length} errors:`,
            aggResult.errors
          );
        }
      } catch (err) {
        console.error("Error aggregating season stats:", err);
        // Don't fail the request, but log the error
      }

      // Recalculate draft positions for current season based on updated standings (non-blocking)
      Promise.resolve()
        .then(async () => {
          try {
            if (saveGameId) {
              // Import and call recalculate function directly (more efficient than HTTP)
              // cSpell:ignore recalculator
              const { recalculateDraftPicksForSeason } = await import(
                "@/lib/draft/weekly-recalculator"
              );
              await recalculateDraftPicksForSeason(season, saveGameId);
              console.log(
                `[Simulate Week] Draft positions recalculated for season ${season}`
              );
            }
          } catch (err) {
            console.error(
              "[Simulate Week] Error recalculating draft positions:",
              err
            );
            // Don't fail the request if recalculation fails
          }
        })
        .catch(() => {});

      // Auto-update depth charts if setting is enabled (non-blocking)
      Promise.resolve()
        .then(async () => {
          try {
            if (saveGameId) {
              // Check if auto depth chart is enabled
              const { data: settings, error: settingsError } = await supabase
                .from("game_settings")
                .select("depth_chart_management")
                .eq("save_game_id", saveGameId)
                .single();

              if (settingsError && !isMissingSupabaseTableError(settingsError)) {
                console.warn("[Simulate Week] Could not load game settings:", settingsError);
              }

              if (settings?.depth_chart_management === "auto") {
                console.log("[Simulate Week] Auto-updating depth charts...");
                const { updateAllDepthCharts } = await import(
                  "@/lib/utils/depth-chart-manager"
                );
                const result = await updateAllDepthCharts(season, saveGameId);
                console.log(
                  `[Simulate Week] Depth charts updated: ${result.teamsUpdated} teams, ${result.totalSlots} slots`
                );
                if (result.errors.length > 0) {
                  console.warn(
                    "[Simulate Week] Depth chart errors:",
                    result.errors
                  );
                }
              }
            }
          } catch (err) {
            console.error("[Simulate Week] Error updating depth charts:", err);
            // Don't fail the request if depth chart update fails
          }
        })
        .catch(() => {});
    }

    return NextResponse.json({
      success: true,
      simulated: results.length,
      total: games.length,
      results,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error("Error simulating week:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
