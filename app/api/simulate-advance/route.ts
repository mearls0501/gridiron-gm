import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase-client";
import { simulateGame } from "@/lib/simulation/engine";

type AdvanceType = "next_week" | "regular_season" | "playoffs" | "offseason" | "preseason";

/**
 * Calculate target week based on advance type
 */
function getTargetWeek(currentWeek: number, advanceType: AdvanceType): number {
  switch (advanceType) {
    case "next_week":
      return currentWeek + 1;
    case "regular_season":
      // Regular season starts at week 1
      return 1;
    case "playoffs":
      // Playoffs start at week 19 (Wild Card)
      return 19;
    case "offseason":
      // Offseason starts after Super Bowl (week 22)
      return 23;
    case "preseason":
      // Preseason is week 0, but this advances to next season's preseason
      // This will be handled specially in the route
      return 0;
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
  const { season, currentWeek, advanceType, saveGameId } = await req.json();

  // Validate required fields - note: currentWeek can be 0 (preseason), so check for null/undefined explicitly
  if (!season || currentWeek === null || currentWeek === undefined || !advanceType) {
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
        // Handle special advance types that don't simulate games
        if (advanceType === "preseason") {
          // Advance from offseason to next season's preseason
          // Call the advance-to-season endpoint
          const advanceResponse = await fetch(
            `${process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"}/api/offseason/advance-to-season`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ season, saveGameId }),
            }
          );

          if (!advanceResponse.ok) {
            const errorData = await advanceResponse.json();
            throw new Error(errorData.error || "Failed to advance to preseason");
          }

          const newSeason = season + 1;
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ 
              type: "complete", 
              total: 1, 
              current: 1,
              finalWeek: 0,
              finalSeason: newSeason,
              simulatedWeeks: 0,
              message: `Advanced to ${newSeason} preseason (Week 0)`
            })}\n\n`)
          );
          controller.close();
          return;
        }

        if (advanceType === "regular_season") {
          // Advance from preseason (week 0) to regular season (week 1)
          // Just update the season phase and week, no games to simulate
          let seasonUpdateQuery = supabase
            .from("seasons")
            .update({ 
              current_week: 1,
              phase: "regular_season"
            })
            .eq("year", season)
            .eq("is_active", true);
          
          // Filter by save_game_id if provided
          if (saveGameId) {
            seasonUpdateQuery = seasonUpdateQuery.eq("save_game_id", saveGameId);
          } else {
            seasonUpdateQuery = seasonUpdateQuery.is("save_game_id", null);
          }
          
          const { error: updateError } = await seasonUpdateQuery;

          if (updateError) {
            throw new Error(`Failed to advance to regular season: ${updateError.message}`);
          }

          // Regenerate scouting points for all teams for week 1
          try {
            const { regenerateWeeklyPoints } = await import("@/lib/scouting/weekly-points");
            
            // Get all teams for this save game
            let teamsQuery = supabase
              .from("teams")
              .select("id");
            
            if (saveGameId) {
              teamsQuery = teamsQuery.eq("save_game_id", saveGameId);
            } else {
              teamsQuery = teamsQuery.is("save_game_id", null);
            }
            
            const { data: teams } = await teamsQuery;
            
            if (teams && teams.length > 0) {
              // Regenerate points for all teams for week 1
              const regeneratePromises = teams.map((team) =>
                regenerateWeeklyPoints(team.id, saveGameId || "", season, 1)
              );
              
              await Promise.all(regeneratePromises);
              console.log(`Regenerated scouting points for ${teams.length} teams for week 1`);
            }
          } catch (err) {
            console.error("Error regenerating scouting points:", err);
            // Don't fail the advance if point regeneration fails
          }

          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ 
              type: "complete", 
              total: 1, 
              current: 1,
              finalWeek: 1,
              simulatedWeeks: 0,
              message: `Advanced to regular season (Week 1)`
            })}\n\n`)
          );
          controller.close();
          return;
        }

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
        let lastHeartbeat = Date.now();
        const HEARTBEAT_INTERVAL = 30000; // Send heartbeat every 30 seconds
        
        while (currentSimWeek < targetWeek && currentSimWeek <= 22) {
          // Send heartbeat if needed
          const now = Date.now();
          if (now - lastHeartbeat > HEARTBEAT_INTERVAL) {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ 
                type: "progress", 
                total: totalWeeks, 
                current: simulatedWeeks,
                week: currentSimWeek,
                message: `Still processing Week ${currentSimWeek}...`
              })}\n\n`)
            );
            lastHeartbeat = now;
          }
          
          // Send progress update for current week
          const weekStartData = encoder.encode(`data: ${JSON.stringify({ 
            type: "progress", 
            total: totalWeeks, 
            current: simulatedWeeks,
            week: currentSimWeek,
            message: `Starting Week ${currentSimWeek}...`
          })}\n\n`);
          controller.enqueue(weekStartData);
          
          // Add a small delay to ensure the message is sent
          await new Promise(resolve => setTimeout(resolve, 50));

          // Get all unplayed games for this week
          let gamesQuery = supabase
            .from("games")
            .select("*")
            .eq("season", season)
            .eq("week", currentSimWeek)
            .eq("played", false);
          
          // Filter by save_game_id if provided
          if (saveGameId) {
            gamesQuery = gamesQuery.eq("save_game_id", saveGameId);
          } else {
            gamesQuery = gamesQuery.is("save_game_id", null);
          }
          
          const { data: games, error: gamesError } = await gamesQuery;

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

            // Simulate batch in parallel with timeout protection
            const batchPromises = batch.map(async (game) => {
              try {
                // Add timeout to prevent individual games from hanging
                const gamePromise = simulateGame({
                  homeTeamId: game.home_team_id,
                  awayTeamId: game.away_team_id,
                  gameId: game.id,
                  season: game.season,
                  week: game.week,
                });
                
                const timeoutPromise = new Promise<never>((_, reject) => 
                  setTimeout(() => reject(new Error('Game simulation timeout')), 30000)
                );
                
                const result = await Promise.race([gamePromise, timeoutPromise]);

                // Collect for batch operations
                if (result.playerStats && result.playerStats.length > 0) {
                  // Add save_game_id to player stats
                  const statsWithSaveGameId = result.playerStats.map(stat => ({
                    ...stat,
                    save_game_id: saveGameId || game.save_game_id || null,
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

            // Wait for batch to complete with timeout protection
            try {
              const batchResults = await Promise.all(batchPromises);
              weekResults.push(...batchResults.filter((r) => r !== null));
              lastHeartbeat = Date.now(); // Update heartbeat after batch completes
            } catch (batchError) {
              console.error(`[Simulate Advance] Batch error for week ${currentSimWeek}, batch ${batchIndex}:`, batchError);
              // Continue with next batch even if one fails
            }

          // Send progress update for batch
            const completedGames = weekResults.length;
            const progressData = encoder.encode(`data: ${JSON.stringify({ 
              type: "progress", 
              total: totalWeeks, 
              current: simulatedWeeks,
              week: currentSimWeek,
              gamesCompleted: completedGames,
              gamesTotal: games.length,
              message: `Week ${currentSimWeek}: ${completedGames}/${games.length} games completed`
            })}\n\n`);
            controller.enqueue(progressData);
            
            // Add small delay to ensure stream can process
            await new Promise(resolve => setTimeout(resolve, 10));
          }

          // Batch update all games
          if (gameUpdates.length > 0) {
            // Send progress update before updating games
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ 
                type: "progress", 
                total: totalWeeks, 
                current: simulatedWeeks,
                week: currentSimWeek,
                message: `Week ${currentSimWeek}: Saving game results...`
              })}\n\n`)
            );
            
            // Update games in batches to avoid overwhelming the database
            const updateBatchSize = 50;
            for (let i = 0; i < gameUpdates.length; i += updateBatchSize) {
              const batch = gameUpdates.slice(i, i + updateBatchSize);
              const updatePromises = batch.map((update) =>
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
          }

          // Batch insert all player stats
          if (allPlayerStats.length > 0) {
            // Send progress update before saving stats
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ 
                type: "progress", 
                total: totalWeeks, 
                current: simulatedWeeks,
                week: currentSimWeek,
                message: `Week ${currentSimWeek}: Saving player statistics...`
              })}\n\n`)
            );
            
            const chunkSize = 500; // Reduced chunk size for better reliability
            for (let i = 0; i < allPlayerStats.length; i += chunkSize) {
              const chunk = allPlayerStats.slice(i, i + chunkSize);
              const { error: statsError, data: insertedStats } = await supabase
                .from("player_game_stats")
                .insert(chunk)
                .select();

              if (statsError) {
                console.error(`Error saving stats chunk ${i}-${i + chunkSize}:`, statsError);
                console.error("Error details:", {
                  message: statsError.message,
                  code: statsError.code,
                  details: statsError.details,
                  hint: statsError.hint,
                });
                // Continue with next chunk even if one fails
              } else {
                console.log(`Successfully saved ${insertedStats?.length || 0} stats in chunk ${i}-${i + chunkSize}`);
              }
              
              // Send progress update for each chunk
              if ((i + chunkSize) % (chunkSize * 2) === 0 || i + chunkSize >= allPlayerStats.length) {
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify({ 
                    type: "progress", 
                    total: totalWeeks, 
                    current: simulatedWeeks,
                    week: currentSimWeek,
                    message: `Week ${currentSimWeek}: Saved ${Math.min(i + chunkSize, allPlayerStats.length)}/${allPlayerStats.length} player stats`
                  })}\n\n`)
                );
              }
            }
          }

          // Aggregate season stats after week is complete
          // This ensures season stats are always up to date with all games played so far
          if (weekResults.length > 0) {
            // Send progress update
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ 
                type: "progress", 
                total: totalWeeks, 
                current: simulatedWeeks,
                week: currentSimWeek,
                message: `Week ${currentSimWeek} complete. Aggregating season stats...`
              })}\n\n`)
            );
            
            try {
              const { aggregateSeasonStats } = await import('@/lib/simulation/player-development');
              const aggResult = await aggregateSeasonStats(season, saveGameId);
              console.log(`[Simulate Advance] Completed stats aggregation for week ${currentSimWeek}: ${aggResult.aggregated} players aggregated`);
              if (aggResult.errors.length > 0) {
                console.warn(`[Simulate Advance] Stats aggregation had ${aggResult.errors.length} errors:`, aggResult.errors);
              }
            } catch (err) {
              console.error('Error aggregating season stats:', err);
              // Don't fail the simulation if stats aggregation fails, but log it
            }
          }

          results.push({
            week: currentSimWeek,
            simulated: weekResults.length,
            total: games.length,
            errors: weekErrors.length > 0 ? weekErrors : undefined,
          });

          // Regenerate scouting points for all teams for the new week (async, don't block)
          if (currentSimWeek < targetWeek) {
            // Do this asynchronously so it doesn't block the simulation
            Promise.resolve().then(async () => {
              try {
                const { regenerateWeeklyPoints } = await import("@/lib/scouting/weekly-points");
                
                // Get all teams for this save game
                let teamsQuery = supabase
                  .from("teams")
                  .select("id");
                
                if (saveGameId) {
                  teamsQuery = teamsQuery.eq("save_game_id", saveGameId);
                } else {
                  teamsQuery = teamsQuery.is("save_game_id", null);
                }
                
                const { data: teams } = await teamsQuery;
                
                if (teams && teams.length > 0) {
                  // Regenerate points for all teams for the new week
                  const nextWeek = currentSimWeek + 1;
                  const regeneratePromises = teams.map((team) =>
                    regenerateWeeklyPoints(team.id, saveGameId || "", season, nextWeek)
                  );
                  
                  await Promise.all(regeneratePromises);
                  console.log(`Regenerated scouting points for ${teams.length} teams for week ${nextWeek}`);
                }
              } catch (err) {
                console.error("Error regenerating scouting points:", err);
                // Don't fail the simulation if point regeneration fails
              }
            }).catch(err => {
              console.error("Error in async scouting points regeneration:", err);
            });
          }
          
          // Advance to next week
          currentSimWeek++;
          simulatedWeeks++;
        }

        // Regenerate scouting points for the final week if we completed simulation
        if (simulatedWeeks > 0 && currentSimWeek <= targetWeek) {
          try {
            const { regenerateWeeklyPoints } = await import("@/lib/scouting/weekly-points");
            
            // Get all teams for this save game
            let teamsQuery = supabase
              .from("teams")
              .select("id");
            
            if (saveGameId) {
              teamsQuery = teamsQuery.eq("save_game_id", saveGameId);
            } else {
              teamsQuery = teamsQuery.is("save_game_id", null);
            }
            
            const { data: teams } = await teamsQuery;
            
            if (teams && teams.length > 0) {
              // Regenerate points for all teams for the target week
              const regeneratePromises = teams.map((team) =>
                regenerateWeeklyPoints(team.id, saveGameId || "", season, currentSimWeek)
              );
              
              await Promise.all(regeneratePromises);
              console.log(`Regenerated scouting points for ${teams.length} teams for week ${currentSimWeek}`);
            }
          } catch (err) {
            console.error("Error regenerating scouting points:", err);
            // Don't fail the simulation if point regeneration fails
          }
        }

        // Update current week and phase in seasons table using season manager
        // Always update phase when explicitly advancing to a specific phase
        if (simulatedWeeks > 0 || advanceType === "playoffs" || advanceType === "offseason" || advanceType === "regular_season") {
          let phase: "preseason" | "regular_season" | "playoffs" | "offseason" = "regular_season";
          
          // Determine phase based on advanceType first, then fall back to week-based logic
          if (advanceType === "offseason") {
            phase = "offseason";
          } else if (advanceType === "playoffs") {
            phase = "playoffs";
          } else if (advanceType === "regular_season") {
            phase = "regular_season";
          } else if (advanceType === "preseason") {
            phase = "preseason";
          } else if (currentSimWeek >= 23) {
            phase = "offseason";
          } else if (currentSimWeek >= 19) {
            phase = "playoffs";
          } else if (currentSimWeek === 0) {
            phase = "preseason";
          } else {
            phase = "regular_season";
          }

          const { updateSeasonPhase } = await import("@/lib/seasons/season-manager");
          const phaseUpdateResult = await updateSeasonPhase(season, saveGameId || null, phase, currentSimWeek);

          if (!phaseUpdateResult.success) {
            console.error("Error updating season phase and week:", phaseUpdateResult.error);
          } else {
            console.log(`[Simulate Advance] Updated season ${season} to phase: ${phase}, week: ${currentSimWeek}`);
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

