import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase-client";
import { simulateGame } from "@/lib/simulation/engine";
import { PlayerGameStat } from "@/lib/simulation/types";

/**
 * Stream simulation progress using Server-Sent Events
 */
export async function POST(req: Request) {
  const { season, week } = await req.json();

  if (!season || !week) {
    return NextResponse.json(
      { error: "Season and week are required" },
      { status: 400 }
    );
  }

  // Create a readable stream for SSE
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      try {
        // Get all unplayed games for this week
        const { data: games, error: gamesError } = await supabase
          .from("games")
          .select("*")
          .eq("season", season)
          .eq("week", week)
          .eq("played", false);

        if (gamesError) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: "error", error: `Failed to fetch games: ${gamesError.message}` })}\n\n`
            )
          );
          controller.close();
          return;
        }

        if (!games || games.length === 0) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: "error", error: "No unplayed games found" })}\n\n`
            )
          );
          controller.close();
          return;
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
              const result = await simulateGame({
                homeTeamId: game.home_team_id,
                awayTeamId: game.away_team_id,
                gameId: game.id,
                season: game.season,
                week: game.week,
              });

              return {
                gameId: game.id,
                success: true,
                result,
              };
            } catch (error) {
              console.error(`Error simulating game ${game.id}:`, error);
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

          // Log any failures
          if (failedResults.length > 0) {
            failedResults.forEach(({ gameId, error }) => {
              console.error(`Failed to simulate game ${gameId}:`, error);
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({ type: "warning", message: `Game ${gameId} failed: ${error}` })}\n\n`
                )
              );
            });
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
                  const updatePayload = {
                    home_score: Math.round(result.homeScore),
                    away_score: Math.round(result.awayScore),
                    played: true,
                    updated_at: new Date().toISOString(),
                  };

                  const { error: updateError, data } = await supabase
                    .from("games")
                    .update(updatePayload)
                    .eq("id", gameId)
                    .select();

                  if (updateError) {
                    console.error(
                      `Error updating game ${gameId}:`,
                      updateError
                    );
                    // Try one more time
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
                      allPlayerStats.push(...result.playerStats);
                    }
                    return { gameId, success: true };
                  }

                  // Verify the update worked
                  if (!data || data.length === 0) {
                    console.error(
                      `Game ${gameId} update returned no data - game may not exist`
                    );
                    // Verify the game exists
                    const { data: gameCheck } = await supabase
                      .from("games")
                      .select("id, played")
                      .eq("id", gameId)
                      .single();

                    if (!gameCheck) {
                      return {
                        gameId,
                        success: false,
                        error: "Game does not exist",
                      };
                    }

                    // Game exists but update didn't return data - might still have worked
                    console.warn(
                      `Game ${gameId} update succeeded but returned no data - game exists:`,
                      gameCheck
                    );
                  }

                  // Add player stats to collection
                  if (result.playerStats && result.playerStats.length > 0) {
                    allPlayerStats.push(...result.playerStats);
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
          const chunkSize = 1000;
          for (let i = 0; i < allPlayerStats.length; i += chunkSize) {
            const chunk = allPlayerStats.slice(i, i + chunkSize);
            try {
              const { error: statsError } = await supabase
                .from("player_game_stats")
                .insert(chunk);
              if (statsError) {
                console.error(
                  `Error saving stats chunk ${i}-${i + chunk.length}:`,
                  statsError
                );
              }
            } catch (statsErr) {
              console.error(`Error saving stats chunk:`, statsErr);
            }
          }
        }

        // Verify all games were marked as played
        const { data: remainingGames, error: verifyError } = await supabase
          .from("games")
          .select("id")
          .eq("season", season)
          .eq("week", week)
          .eq("played", false);

        if (!verifyError && remainingGames && remainingGames.length > 0) {
          console.warn(
            `Warning: ${remainingGames.length} games were not marked as played after simulation`
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
            `data: ${JSON.stringify({ type: "complete", total, completed, message: `Successfully simulated ${completed} of ${total} games` })}\n\n`
          )
        );

        // Aggregate season stats asynchronously
        Promise.resolve()
          .then(async () => {
            try {
              const { aggregateSeasonStats } = await import(
                "@/lib/simulation/player-development"
              );
              await aggregateSeasonStats(season);
            } catch (err) {
              console.error("Error aggregating season stats:", err);
            }
          })
          .catch(() => {});

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
