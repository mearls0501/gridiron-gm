import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase-client";
import { simulateGame } from "@/lib/simulation/engine";

type AdvanceType = "next_week" | "playoffs" | "offseason";

/**
 * Calculate target week based on advance type
 */
function getTargetWeek(currentWeek: number, advanceType: AdvanceType): number {
  switch (advanceType) {
    case "next_week":
      return currentWeek + 1;
    case "playoffs":
      // Playoffs start at week 19 (Wild Card)
      return 19;
    case "offseason":
      // Offseason starts after Super Bowl (week 22)
      return 23;
    default:
      return currentWeek + 1;
  }
}

/**
 * Check if we've reached the target
 */
function hasReachedTarget(
  currentWeek: number,
  advanceType: AdvanceType
): boolean {
  const targetWeek = getTargetWeek(currentWeek, advanceType);
  return currentWeek >= targetWeek;
}

/**
 * Stream simulation progress using Server-Sent Events
 */
export async function POST(req: Request) {
  const { season, currentWeek, advanceType } = await req.json();

  if (!season || !currentWeek || !advanceType) {
    return NextResponse.json(
      { error: "Season, currentWeek, and advanceType are required" },
      { status: 400 }
    );
  }

  // Create a readable stream for SSE
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      try {
        const targetWeek = getTargetWeek(currentWeek, advanceType);
        const totalWeeks = Math.max(1, targetWeek - currentWeek);
        let simulatedWeeks = 0;
        let currentSimWeek = currentWeek;
        const results: Array<{ week: number; simulated: number; total: number; errors?: Array<{ gameId: string; error: string }> }> = [];

        // Send initial progress
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ 
            type: "start", 
            total: totalWeeks, 
            current: 0,
            message: `Starting simulation from Week ${currentWeek} to Week ${targetWeek}...`
          })}\n\n`)
        );

        // Simulate week by week until we reach the target
        while (currentSimWeek < targetWeek && currentSimWeek <= 22) {
          // Send progress update for current week
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ 
              type: "progress", 
              total: totalWeeks, 
              current: simulatedWeeks,
              week: currentSimWeek,
              message: `Simulating Week ${currentSimWeek}...`
            })}\n\n`)
          );

          // Get all unplayed games for this week
          const { data: games, error: gamesError } = await supabase
            .from("games")
            .select("*")
            .eq("season", season)
            .eq("week", currentSimWeek)
            .eq("played", false);

          if (gamesError) {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ 
                type: "error", 
                error: `Failed to fetch games for week ${currentSimWeek}: ${gamesError.message}` 
              })}\n\n`)
            );
            controller.close();
            return;
          }

          // If no games, advance to next week
          if (!games || games.length === 0) {
            currentSimWeek++;
            simulatedWeeks++;
            continue;
          }

          // Simulate all games in this week (optimized with batching)
          const weekResults: Array<{ gameId: string; week: number; homeScore: number; awayScore: number }> = [];
          const weekErrors: Array<{ gameId: string; error: string }> = [];
          const allPlayerStats: Array<Record<string, unknown>> = [];
          const gameUpdates: Array<{ id: string; home_score: number; away_score: number }> = [];

          // Simulate games in batches for better progress visibility
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

                // Collect for batch operations
                if (result.playerStats && result.playerStats.length > 0) {
                  allPlayerStats.push(...result.playerStats);
                }

                gameUpdates.push({
                  id: game.id,
                  home_score: Math.round(result.homeScore),
                  away_score: Math.round(result.awayScore),
                });

                return {
                  gameId: game.id,
                  week: currentSimWeek,
                  homeScore: result.homeScore,
                  awayScore: result.awayScore,
                };
              } catch (error) {
                weekErrors.push({
                  gameId: game.id,
                  error: error instanceof Error ? error.message : "Unknown error",
                });
                return null;
              }
            });

            // Wait for batch to complete
            const batchResults = await Promise.all(batchPromises);
            weekResults.push(...batchResults.filter((r) => r !== null));

            // Send progress update for batch
            const completedGames = weekResults.length;
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ 
                type: "progress", 
                total: totalWeeks, 
                current: simulatedWeeks,
                week: currentSimWeek,
                gamesCompleted: completedGames,
                gamesTotal: games.length,
                message: `Week ${currentSimWeek}: ${completedGames}/${games.length} games completed`
              })}\n\n`)
            );
          }

          // Batch update all games
          if (gameUpdates.length > 0) {
            const updatePromises = gameUpdates.map((update) =>
              supabase
                .from("games")
                .update({
                  home_score: update.home_score,
                  away_score: update.away_score,
                  played: true,
                  updated_at: new Date().toISOString(),
                })
                .eq("id", update.id)
            );
            await Promise.all(updatePromises);
          }

          // Batch insert all player stats
          if (allPlayerStats.length > 0) {
            const chunkSize = 1000;
            for (let i = 0; i < allPlayerStats.length; i += chunkSize) {
              const chunk = allPlayerStats.slice(i, i + chunkSize);
              const { error: statsError } = await supabase
                .from("player_game_stats")
                .insert(chunk);

              if (statsError) {
                console.error(`Error saving stats chunk:`, statsError);
              }
            }
          }

          // Aggregate season stats after week is complete
          if (weekResults.length > 0) {
            try {
              const { aggregateSeasonStats } = await import('@/lib/simulation/player-development');
              await aggregateSeasonStats(season);
            } catch (err) {
              console.error('Error aggregating season stats:', err);
            }
          }

          results.push({
            week: currentSimWeek,
            simulated: weekResults.length,
            total: games.length,
            errors: weekErrors.length > 0 ? weekErrors : undefined,
          });

          // Advance to next week
          currentSimWeek++;
          simulatedWeeks++;
        }

        // Update current week in seasons table
        if (simulatedWeeks > 0) {
          const { error: updateError } = await supabase
            .from("seasons")
            .update({ current_week: currentSimWeek })
            .eq("year", season)
            .eq("is_active", true);

          if (updateError) {
            console.error("Error updating current week:", updateError);
          }
        }

        // Send completion message
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ 
            type: "complete", 
            total: totalWeeks, 
            current: simulatedWeeks,
            finalWeek: currentSimWeek,
            simulatedWeeks,
            results,
            message: `Successfully simulated ${simulatedWeeks} week(s) from week ${currentWeek} to week ${currentSimWeek - 1}`
          })}\n\n`)
        );

        controller.close();
      } catch (error) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ 
            type: "error", 
            error: error instanceof Error ? error.message : "Unknown error" 
          })}\n\n`)
        );
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}

