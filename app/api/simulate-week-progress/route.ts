import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase-client";
import { simulateGame } from "@/lib/simulation/engine";
import { PlayerGameStat } from "@/lib/simulation/types";

/**
 * Stream simulation progress using Server-Sent Events
 */
export async function POST(req: Request) {
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

  // Create a readable stream for SSE
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      try {
        // First, ensure the schedule exists for this season
        // This is important for year 2+ when schedules might not have been generated yet
        const { ensureScheduleExists } = await import("@/lib/utils/schedule");
        const scheduleCheck = await ensureScheduleExists(season, saveGameId);

        if (!scheduleCheck.success) {
          console.error(
            `[SimulateWeekProgress] Schedule check failed: ${scheduleCheck.message}`
          );
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: "error", error: `Schedule error: ${scheduleCheck.message}` })}\n\n`
            )
          );
          controller.close();
          return;
        }

        if (scheduleCheck.created) {
          console.log(
            `[SimulateWeekProgress] Auto-generated schedule for season ${season}`
          );
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: "info", message: `Schedule generated for season ${season}` })}\n\n`
            )
          );
        }

        // Validate rosters before simulation
        // CPU teams are auto-fixed, user team requires manual fix or explicit auto-fix
        // CRITICAL: This must block simulation if user team is invalid
        console.log(
          `[SimulateWeekProgress] Starting roster validation for saveGameId: ${saveGameId}, season: ${season}, week: ${week}`
        );
        const { validateAllRosters } = await import(
          "@/lib/utils/roster-validator"
        );
        const validationResult = await validateAllRosters(
          saveGameId,
          season,
          week,
          false // Don't auto-fix user team by default
        );

        console.log(
          `[SimulateWeekProgress] Roster validation result: allValid=${validationResult.allValid}, userTeamInvalid=${validationResult.userTeamInvalid}, cpuTeamsInvalid=${validationResult.cpuTeamsInvalid}`
        );
        console.log(
          `[SimulateWeekProgress] Validation details:`,
          JSON.stringify(
            validationResult.validations.filter((v) => v.isUserTeam),
            null,
            2
          )
        );

        if (!validationResult.allValid) {
          // Build detailed error message showing all invalid rosters
          const invalidTeams = validationResult.validations.filter(
            (v) => !v.isValid
          );
          const userTeam = invalidTeams.find((v) => v.isUserTeam);
          const cpuTeams = invalidTeams.filter((v) => !v.isUserTeam);

          let errorMessage = "";

          if (userTeam) {
            const needsMore = userTeam.needsPlayers > 0;
            errorMessage = `Your team (${userTeam.teamName}) has ${userTeam.currentSize} players (requires exactly 53). `;
            if (needsMore) {
              errorMessage += `Need to add ${userTeam.needsPlayers} more players.`;
            } else {
              errorMessage += `Need to cut ${Math.abs(userTeam.needsPlayers)} players.`;
            }
          }

          if (cpuTeams.length > 0) {
            if (errorMessage) errorMessage += "\n\n";
            errorMessage += `${cpuTeams.length} CPU team(s) also have invalid rosters:\n`;
            cpuTeams.forEach((team) => {
              const needsMore = team.needsPlayers > 0;
              errorMessage += `- ${team.teamName}: ${team.currentSize} players (`;
              if (needsMore) {
                errorMessage += `need ${team.needsPlayers} more)\n`;
              } else {
                errorMessage += `need to cut ${Math.abs(team.needsPlayers)})\n`;
              }
            });
          }

          // If no specific error message, use generic one
          if (!errorMessage) {
            errorMessage = `${invalidTeams.length} team(s) have invalid rosters (not exactly 53 players). Please fix rosters before simulating.`;
          }

          const errorData = {
            type: "error",
            error: "ROSTER_INVALID",
            message: errorMessage,
            invalidTeams: invalidTeams.map((t) => ({
              teamId: t.teamId || "",
              teamName: t.teamName || "Unknown Team",
              currentSize: t.currentSize || 0,
              needsPlayers: t.needsPlayers || 0,
              isUserTeam: !!t.isUserTeam,
            })),
            canAutoFix: true,
          };

          console.error(
            `[SimulateWeekProgress] BLOCKING: Roster validation failed`,
            {
              userTeam,
              cpuTeamsCount: cpuTeams.length,
              invalidTeamsCount: invalidTeams.length,
              errorData,
            }
          );

          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(errorData)}\n\n`)
          );
          controller.close();
          return;

          // CPU teams invalid - log warning but continue (they should have been auto-fixed)
          if (validationResult.cpuTeamsInvalid > 0) {
            console.warn(
              `[SimulateWeekProgress] ${validationResult.cpuTeamsInvalid} CPU teams have invalid rosters (should have been auto-fixed)`
            );
          }
        } else {
          console.log(
            `[SimulateWeekProgress] All rosters validated successfully (all teams have 53 players)`
          );
        }

        // Get all unplayed games for this week
        // CRITICAL: saveGameId is required - all games should have save_game_id set at creation
        // Query games with exact save_game_id match - no fallback to NULL
        const gamesQuery = supabase
          .from("games")
          .select("*")
          .eq("season", season)
          .eq("week", week)
          .eq("played", false)
          .eq("save_game_id", saveGameId);

        const { data: games, error: gamesError } = await gamesQuery;

        if (gamesError) {
          console.error(
            `[SimulateWeekProgress] Error fetching games:`,
            gamesError
          );
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: "error", error: `Failed to fetch games: ${gamesError.message}` })}\n\n`
            )
          );
          controller.close();
          return;
        }

        if (!games || games.length === 0) {
          console.warn(
            `[SimulateWeekProgress] No unplayed games found for season ${season}, week ${week}, saveGameId: ${saveGameId}`
          );
          // Check if there are any games at all for this season/week (played or unplayed)
          const { data: allGames, error: allGamesError } = await supabase
            .from("games")
            .select("id, played, save_game_id")
            .eq("season", season)
            .eq("week", week);

          let errorMessage = `No unplayed games found for season ${season}, week ${week}`;

          if (!allGamesError && allGames) {
            const playedCount = allGames.filter((g) => g.played).length;
            const unplayedCount = allGames.filter((g) => !g.played).length;
            const withSaveGameId = allGames.filter(
              (g) => g.save_game_id === saveGameId
            ).length;
            const withoutSaveGameId = allGames.filter(
              (g) => !g.save_game_id
            ).length;
            const wrongSaveGameId = allGames.filter(
              (g) => g.save_game_id && g.save_game_id !== saveGameId
            ).length;

            console.log(
              `[SimulateWeekProgress] Found ${allGames.length} total games for season ${season}, week ${week}. ` +
                `Played: ${playedCount}, Unplayed: ${unplayedCount}. ` +
                `With correct save_game_id (${saveGameId}): ${withSaveGameId}, ` +
                `Without save_game_id: ${withoutSaveGameId}, ` +
                `With wrong save_game_id: ${wrongSaveGameId}`
            );

            // Provide more helpful error messages
            if (allGames.length === 0) {
              errorMessage = `No games found for season ${season}, week ${week}. The schedule may not have been generated for this week.`;
            } else if (unplayedCount === 0 && playedCount > 0) {
              errorMessage = `All ${playedCount} games for season ${season}, week ${week} are already marked as played.`;
            } else if (
              withSaveGameId === 0 &&
              (withoutSaveGameId > 0 || wrongSaveGameId > 0)
            ) {
              errorMessage =
                `Found ${unplayedCount} unplayed games, but none have the correct save_game_id (${saveGameId}). ` +
                `Games may need to be updated with the correct save_game_id.`;
            }
          } else if (allGamesError) {
            console.error(
              `[SimulateWeekProgress] Error checking all games:`,
              allGamesError
            );
            errorMessage = `Error checking games: ${allGamesError.message}`;
          }

          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: "error", error: errorMessage })}\n\n`
            )
          );
          controller.close();
          return;
        }

        // CRITICAL: All games should have the correct save_game_id set at creation
        // If any games don't have the correct save_game_id, that's an error condition
        if (games && games.length > 0) {
          const gamesWithWrongSaveGameId = games.filter(
            (g) => !g.save_game_id || g.save_game_id !== saveGameId
          );
          if (gamesWithWrongSaveGameId.length > 0) {
            console.error(
              `[SimulateWeekProgress] Found ${gamesWithWrongSaveGameId.length} games with incorrect or missing save_game_id. ` +
                `All games should have save_game_id set at creation. Game IDs: ${gamesWithWrongSaveGameId.map((g) => g.id).join(", ")}`
            );
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  type: "error",
                  error: `Found ${gamesWithWrongSaveGameId.length} games with incorrect save_game_id. All games should have save_game_id set at creation. This indicates a data integrity issue.`,
                })}\n\n`
              )
            );
            controller.close();
            return;
          }
          console.log(
            `[SimulateWeekProgress] Found ${games.length} unplayed games, all with correct save_game_id ${saveGameId}`
          );
        }

        // Log game details for debugging
        console.log(
          `[SimulateWeekProgress] Simulating ${games.length} games for week ${week}, season ${season}, saveGameId: ${saveGameId}`
        );
        if (games.length > 0) {
          console.log(`[SimulateWeekProgress] Sample game:`, {
            id: games[0].id,
            save_game_id: games[0].save_game_id,
            home_team_id: games[0].home_team_id,
            away_team_id: games[0].away_team_id,
            played: games[0].played,
          });
        }

        const total = games.length;
        let completed = 0;
        const allPlayerStats: PlayerGameStat[] = [];

        // Send initial progress
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: "start", total, completed: 0 })}\n\n`
          )
        );

        // Process games in batches for better progress visibility
        // Use smaller batches for more frequent progress updates
        const batchSize = 4;
        const totalBatches = Math.ceil(games.length / batchSize);

        for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
          const startIndex = batchIndex * batchSize;
          const batch = games.slice(startIndex, startIndex + batchSize);

          // Simulate batch in parallel
          const batchPromises = batch.map(async (game) => {
            try {
              console.log(
                `[SimulateWeekProgress] Simulating game ${game.id}: ${game.home_team_id} vs ${game.away_team_id}, saveGameId: ${saveGameId}`
              );
              const result = await simulateGame(
                {
                  homeTeamId: game.home_team_id,
                  awayTeamId: game.away_team_id,
                  gameId: game.id,
                  season: game.season,
                  week: game.week,
                  useEnhancedAttributes: true, // 🏈 Enable attribute-based simulation
                },
                undefined,
                saveGameId
              );

              const statsCount = result.playerStats?.length || 0;
              console.log(
                `[SimulateWeekProgress] Game ${game.id} simulated successfully. Stats count: ${statsCount}`
              );
              if (statsCount === 0) {
                console.warn(
                  `[SimulateWeekProgress] WARNING: Game ${game.id} simulated but generated 0 stats. This may indicate empty rosters.`
                );
              }

              return {
                gameId: game.id,
                success: true,
                result,
              };
            } catch (error) {
              console.error(
                `[SimulateWeekProgress] Error simulating game ${game.id}:`,
                error
              );
              if (error instanceof Error) {
                console.error(
                  `[SimulateWeekProgress] Error details: ${error.message}`,
                  error.stack
                );
              }
              return {
                gameId: game.id,
                success: false,
                error: error instanceof Error ? error.message : "Unknown error",
                result: null,
              };
            }
          });

          // Wait for batch to complete and collect results
          const batchResults = await Promise.all(batchPromises);
          const successfulResults = batchResults.filter(
            (r) => r.success && r.result
          );
          const failedResults = batchResults.filter((r) => !r.success);

          // Log any failures - these are critical errors
          if (failedResults.length > 0) {
            console.error(
              `[SimulateWeekProgress] ${failedResults.length} games failed to simulate:`
            );
            failedResults.forEach(({ gameId, error }) => {
              console.error(
                `[SimulateWeekProgress] Game ${gameId} failed: ${error}`
              );
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({ type: "error", message: `Game ${gameId} failed: ${error}` })}\n\n`
                )
              );
            });
            // If all games failed, this is a critical issue - likely roster loading problem
            if (failedResults.length === batch.length) {
              console.error(
                `[SimulateWeekProgress] CRITICAL: All ${batch.length} games in batch failed. This likely indicates a roster loading issue. Check player_team_assignments for saveGameId: ${saveGameId}`
              );
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({ type: "error", message: `All games failed to simulate. This may indicate missing player rosters. Check console for details.` })}\n\n`
                )
              );
            }
          }

          completed += successfulResults.length;

          // Update games in database for this batch
          if (successfulResults.length > 0) {
            const updateResults = await Promise.all(
              successfulResults.map(async ({ gameId, result }) => {
                if (!result)
                  return { gameId, success: false, error: "No result" };

                try {
                  // Update game record - check for errors
                  // Ensure scores are integers (database constraint)
                  // CRITICAL: Include save_game_id in update to ensure game is properly isolated
                  const updatePayload: {
                    home_score: number;
                    away_score: number;
                    played: boolean;
                    updated_at: string;
                    save_game_id?: string;
                  } = {
                    home_score: Math.round(result.homeScore),
                    away_score: Math.round(result.awayScore),
                    played: true,
                    updated_at: new Date().toISOString(),
                  };

                  // Ensure save_game_id is set (it should already be set from earlier, but be defensive)
                  if (saveGameId) {
                    updatePayload.save_game_id = saveGameId;
                  }

                  // Update game by id only (save_game_id is in the payload, so it will be set)
                  // Don't filter by save_game_id in the WHERE clause because the game might not have it set yet
                  // The updatePayload includes save_game_id, so it will be set during the update
                  const { error: updateError, data } = await supabase
                    .from("games")
                    .update(updatePayload)
                    .eq("id", gameId)
                    .select();

                  if (updateError) {
                    console.error(
                      `[SimulateWeekProgress] Error updating game ${gameId}:`,
                      updateError
                    );
                    console.error(
                      `[SimulateWeekProgress] Update payload:`,
                      updatePayload
                    );
                    console.error(
                      `[SimulateWeekProgress] saveGameId: ${saveGameId}`
                    );
                    // Try one more time - update by id only (save_game_id is in payload)
                    const { error: retryError, data: retryData } =
                      await supabase
                        .from("games")
                        .update(updatePayload)
                        .eq("id", gameId)
                        .select();

                    if (retryError) {
                      console.error(
                        `Retry also failed for game ${gameId}:`,
                        retryError
                      );
                      return {
                        gameId,
                        success: false,
                        error: retryError.message,
                      };
                    }

                    if (!retryData || retryData.length === 0) {
                      return {
                        gameId,
                        success: false,
                        error: "Retry update returned no data",
                      };
                    }

                    // Retry succeeded
                    if (result.playerStats && result.playerStats.length > 0) {
                      // CRITICAL: Always use saveGameId (guaranteed to be non-null at this point)
                      const statsWithSaveGameId = result.playerStats.map(
                        (stat) => ({
                          ...stat,
                          save_game_id: saveGameId,
                        })
                      );
                      allPlayerStats.push(...statsWithSaveGameId);
                    }
                    return { gameId, success: true };
                  }

                  // Verify the update worked
                  if (!data || data.length === 0) {
                    console.error(
                      `[SimulateWeekProgress] Game ${gameId} update returned no data - checking if game exists and was updated`
                    );
                    // Verify the game exists and check if it was actually updated
                    const { data: gameCheck, error: checkError } =
                      await supabase
                        .from("games")
                        .select(
                          "id, played, home_score, away_score, save_game_id"
                        )
                        .eq("id", gameId)
                        .single();

                    if (checkError || !gameCheck) {
                      console.error(
                        `[SimulateWeekProgress] Game ${gameId} does not exist or error checking:`,
                        checkError
                      );
                      return {
                        gameId,
                        success: false,
                        error: "Game does not exist",
                      };
                    }

                    // Check if the game was actually updated (has scores and played = true)
                    if (
                      gameCheck.played &&
                      gameCheck.home_score !== null &&
                      gameCheck.away_score !== null
                    ) {
                      // Game was updated successfully, just didn't return data
                      console.log(
                        `[SimulateWeekProgress] Game ${gameId} was updated successfully (played: ${gameCheck.played}, scores: ${gameCheck.home_score}-${gameCheck.away_score}, save_game_id: ${gameCheck.save_game_id})`
                      );
                      // Continue as if update succeeded
                    } else {
                      // Game was not updated - this is a real failure
                      console.error(
                        `[SimulateWeekProgress] Game ${gameId} update failed - game still not played. Current state:`,
                        gameCheck
                      );
                      return {
                        gameId,
                        success: false,
                        error:
                          "Game update failed - game still not marked as played",
                      };
                    }
                  } else {
                    // Update succeeded - log success
                    console.log(
                      `[SimulateWeekProgress] Successfully updated game ${gameId} with scores ${updatePayload.home_score}-${updatePayload.away_score}, saveGameId: ${saveGameId}`
                    );
                    if (data && data.length > 0) {
                      console.log(`[SimulateWeekProgress] Updated game data:`, {
                        id: data[0].id,
                        save_game_id: data[0].save_game_id,
                        played: data[0].played,
                        home_score: data[0].home_score,
                        away_score: data[0].away_score,
                      });
                    }
                  }

                  // Add player stats to collection with save_game_id
                  // CRITICAL: Always use saveGameId (guaranteed to be non-null at this point)
                  // The stats from simulateGame don't have save_game_id, so we add it here
                  if (result.playerStats && result.playerStats.length > 0) {
                    const statsWithSaveGameId = result.playerStats.map(
                      (stat) => ({
                        ...stat,
                        save_game_id: saveGameId,
                      })
                    );
                    allPlayerStats.push(...statsWithSaveGameId);
                  } else {
                    // Log warning if no stats were generated
                    console.warn(
                      `[SimulateWeekProgress] WARNING: Game ${gameId} simulated but generated 0 player stats. ` +
                        `This may indicate incomplete rosters or simulation issues.`
                    );
                  }

                  return { gameId, success: true };
                } catch (updateError) {
                  console.error(`Error updating game ${gameId}:`, updateError);
                  return {
                    gameId,
                    success: false,
                    error:
                      updateError instanceof Error
                        ? updateError.message
                        : "Unknown error",
                  };
                }
              })
            );

            // Log any update failures
            const failedUpdates = updateResults.filter((r) => !r.success);
            if (failedUpdates.length > 0) {
              failedUpdates.forEach(({ gameId, error }) => {
                console.error(
                  `Failed to update game ${gameId} in database:`,
                  error
                );
                controller.enqueue(
                  encoder.encode(
                    `data: ${JSON.stringify({ type: "warning", message: `Failed to save game ${gameId}: ${error}` })}\n\n`
                  )
                );
              });
            }
          }

          // Send progress update
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: "progress", total, completed, percentage: Math.round((completed / total) * 100) })}\n\n`
            )
          );
        }

        // Save all player stats in chunks
        if (allPlayerStats.length > 0) {
          console.log(
            `[SimulateWeekProgress] Preparing to save ${allPlayerStats.length} player stats for week ${week}, saveGameId: ${saveGameId}`
          );
          const chunkSize = 1000;
          let totalSaved = 0;
          for (let i = 0; i < allPlayerStats.length; i += chunkSize) {
            const chunk = allPlayerStats.slice(i, i + chunkSize);
            try {
              const { error: statsError, data: insertedStats } = await supabase
                .from("player_game_stats")
                .insert(chunk)
                .select();
              if (statsError) {
                console.error(
                  `[SimulateWeekProgress] Error saving stats chunk ${i}-${i + chunk.length}:`,
                  statsError
                );
                console.error("[SimulateWeekProgress] Error details:", {
                  message: statsError.message,
                  code: statsError.code,
                  details: statsError.details,
                  hint: statsError.hint,
                  saveGameId: saveGameId || "null",
                  chunkSize: chunk.length,
                  sampleStat: chunk[0]
                    ? {
                        player_id: chunk[0].player_id,
                        save_game_id: (
                          chunk[0] as PlayerGameStat & { save_game_id?: string }
                        ).save_game_id,
                        season: chunk[0].season,
                        week: chunk[0].week,
                      }
                    : null,
                });
              } else {
                totalSaved += insertedStats?.length || 0;
                console.log(
                  `[SimulateWeekProgress] Successfully saved ${insertedStats?.length || 0} stats in chunk ${i}-${i + chunk.length} for saveGameId: ${saveGameId}`
                );
                if (insertedStats && insertedStats.length > 0) {
                  console.log(`[SimulateWeekProgress] Sample saved stat:`, {
                    player_id: insertedStats[0].player_id,
                    save_game_id: insertedStats[0].save_game_id,
                    season: insertedStats[0].season,
                    week: insertedStats[0].week,
                  });
                }
              }
            } catch (statsErr) {
              console.error(
                `[SimulateWeekProgress] Error saving stats chunk:`,
                statsErr
              );
            }
          }
          console.log(
            `[SimulateWeekProgress] Total stats saved: ${totalSaved}/${allPlayerStats.length} for week ${week}, saveGameId: ${saveGameId}`
          );
        } else {
          console.warn(
            `[SimulateWeekProgress] WARNING: No player stats to save for week ${week}, saveGameId: ${saveGameId}. ` +
              `This may indicate incomplete rosters (teams with < 53 players) or simulation issues. ` +
              `Games were simulated but no stats were generated. Consider running roster replenishment.`
          );
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: "warning", message: `No player stats generated for week ${week}. This may indicate roster issues.` })}\n\n`
            )
          );
        }

        // Verify all games were marked as played (only check games for this save game)
        // All games should have save_game_id set, so we only check for the exact match
        const verifyQuery = supabase
          .from("games")
          .select("id")
          .eq("season", season)
          .eq("week", week)
          .eq("played", false)
          .eq("save_game_id", saveGameId);

        const { data: remainingGames, error: verifyError } = await verifyQuery;

        if (!verifyError && remainingGames && remainingGames.length > 0) {
          console.warn(
            `[SimulateWeekProgress] Warning: ${remainingGames.length} games were not marked as played after simulation for saveGameId: ${saveGameId}`
          );
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: "warning", message: `Warning: ${remainingGames.length} games may not have been saved properly` })}\n\n`
            )
          );
        }

        // Send completion message
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: "complete", total, completed, message: `Successfully simulated ${completed} of ${total} games. Aggregating stats...` })}\n\n`
          )
        );

        // Aggregate season stats - do it synchronously but send progress updates
        // This ensures it completes but doesn't block the initial response
        try {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: "progress", message: "Aggregating season statistics..." })}\n\n`
            )
          );

          console.log(
            `[Simulate Week Progress] Starting stats aggregation for season ${season}, saveGameId: ${saveGameId || "null"}...`
          );
          const { aggregateSeasonStats } = await import(
            "@/lib/simulation/player-development"
          );
          const aggResult = await aggregateSeasonStats(season, saveGameId);
          console.log(
            `[Simulate Week Progress] Completed stats aggregation: ${aggResult.aggregated} players aggregated`
          );

          // Send detailed aggregation info to frontend
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: "aggregation_details", aggregated: aggResult.aggregated, errors: aggResult.errors.length })}\n\n`
            )
          );

          if (aggResult.errors.length > 0) {
            console.warn(
              `[Simulate Week Progress] Stats aggregation had ${aggResult.errors.length} errors:`,
              aggResult.errors
            );
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ type: "warning", message: `Stats aggregation completed with ${aggResult.errors.length} errors` })}\n\n`
              )
            );
          } else {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ type: "stats_aggregated", message: `Aggregated stats for ${aggResult.aggregated} players` })}\n\n`
              )
            );
          }
        } catch (err) {
          console.error("Error aggregating season stats:", err);
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: "error", error: `Stats aggregation failed: ${err instanceof Error ? err.message : "Unknown error"}` })}\n\n`
            )
          );
        }

        controller.close();
      } catch (error) {
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: "error", error: error instanceof Error ? error.message : "Unknown error" })}\n\n`
          )
        );
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
