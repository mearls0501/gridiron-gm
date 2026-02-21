import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase-client";
import { simulateGame } from "@/lib/simulation/engine";

// Extended timeout for season transitions (especially preseason which generates draft class)
export const maxDuration = 120; // 120 seconds (2 minutes)

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

  // Validate saveGameId - it's required for all operations
  if (!saveGameId) {
    return NextResponse.json(
      { error: "saveGameId is required. Games must be associated with a save game." },
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
          // Send progress updates during the long process
          const newSeason = season + 1;
          
          console.log(`[Simulate Advance] Starting preseason transition for season ${newSeason}...`);
          
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ 
              type: "progress", 
              total: 6, 
              current: 0,
              week: 0,
              message: `Initializing ${newSeason} season...`
            })}\n\n`)
          );

          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ 
              type: "progress", 
              total: 6, 
              current: 1,
              week: 0,
              message: `Generating schedule (272 games)... This may take 15-45 seconds.`
            })}\n\n`)
          );

          await new Promise(resolve => setTimeout(resolve, 100)); // Small delay to ensure message is sent

          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ 
              type: "progress", 
              total: 6, 
              current: 2,
              week: 0,
              message: `Replenishing team rosters (up to 800 players)...`
            })}\n\n`)
          );

          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ 
              type: "progress", 
              total: 6, 
              current: 3,
              week: 0,
              message: `Generating draft class (350 prospects × 71 attributes = 25,000+ data points)...`
            })}\n\n`)
          );

          // Call the advance-to-season endpoint with extended timeout
          // This can take 15-45 seconds due to draft class generation with detailed attributes
          console.log(`[Simulate Advance] Calling advance-to-season API for season ${season}...`);
          const advanceStartTime = Date.now();
          
          // Send progress update to user
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ 
              type: "progress", 
              total: 6, 
              current: 2,
              week: 0,
              message: `Creating new season ${season + 1}... (this may take 30-45 seconds)`
            })}\n\n`)
          );
          
          try {
            // Create an AbortController with 90 second timeout (generous for slow operations)
            const abortController = new AbortController();
            const timeoutId = setTimeout(() => abortController.abort(), 90000); // 90 seconds
            
            const advanceResponse = await fetch(
              `${process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"}/api/offseason/advance-to-season`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ season, saveGameId }),
                signal: abortController.signal,
              }
            );

            clearTimeout(timeoutId);
            console.log(`[Simulate Advance] Advance-to-season response status: ${advanceResponse.status}, took ${Date.now() - advanceStartTime}ms`);

            if (!advanceResponse.ok) {
              const errorData = await advanceResponse.json().catch(() => ({ error: "Unknown error" }));
              console.error(`[Simulate Advance] Advance-to-season failed:`, errorData);
              throw new Error(errorData.error || `Failed to advance to preseason (HTTP ${advanceResponse.status})`);
            }
            
            const advanceData = await advanceResponse.json();
            console.log(`[Simulate Advance] Advance-to-season completed successfully in ${Date.now() - advanceStartTime}ms`, advanceData);
            
            // Send progress update
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ 
                type: "progress", 
                total: 6, 
                current: 4,
                week: 0,
                message: `Season ${season + 1} created successfully! Finalizing...`
              })}\n\n`)
            );
          } catch (fetchError) {
            console.error(`[Simulate Advance] Error calling advance-to-season:`, fetchError);
            
            // Check if it was a timeout
            if (fetchError instanceof Error && fetchError.name === 'AbortError') {
              throw new Error(`Season creation timed out after 90 seconds. This usually means the database is slow or overloaded. Please try again.`);
            }
            
            throw new Error(`Failed to advance to preseason: ${fetchError instanceof Error ? fetchError.message : "Unknown error"}`);
          }

          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ 
              type: "progress", 
              total: 6, 
              current: 5,
              week: 0,
              message: `Initializing draft picks and season data...`
            })}\n\n`)
          );

          const totalAdvanceTime = Date.now() - advanceStartTime;
          console.log(`[Simulate Advance] Successfully advanced to ${newSeason} preseason in ${totalAdvanceTime}ms (${(totalAdvanceTime / 1000).toFixed(1)}s)`);

          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ 
              type: "complete", 
              total: 6, 
              current: 6,
              finalWeek: 0,
              finalSeason: newSeason,
              simulatedWeeks: 0,
              message: `Successfully advanced to ${newSeason} preseason (Week 0) in ${(totalAdvanceTime / 1000).toFixed(1)}s`
            })}\n\n`)
          );
          controller.close();
          return;
        }

        if (advanceType === "regular_season") {
          // Advance from preseason (week 0) to regular season (week 1)
          
          // CRITICAL: Validate salary cap compliance before allowing season start
          const { data: saveGame } = await supabase
            .from("save_games")
            .select("selected_team_id")
            .eq("id", saveGameId)
            .single();

          if (saveGame?.selected_team_id) {
            const { calculateTeamCapHit } = await import("@/lib/utils/player-contracts");
            const userCapHit = await calculateTeamCapHit(saveGame.selected_team_id, saveGameId);
            const SALARY_CAP = 255000000;

            if (userCapHit > SALARY_CAP) {
              const overage = userCapHit - SALARY_CAP;
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ 
                  type: "error", 
                  error: `Cannot start season: Your team is $${(overage / 1000000).toFixed(1)}M over the salary cap. You must cut players or restructure contracts before advancing.`
                })}\n\n`)
              );
              controller.close();
              return;
            }
          }

          // Update the season phase and week
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
        
        console.log(`[Simulate Advance] Starting: currentWeek=${currentWeek}, targetWeek=${targetWeek}, advanceType=${advanceType}, saveGameId=${saveGameId}`);
        const results: Array<{ week: number; simulated: number; total: number; errors?: Array<{ gameId: string; error: string }> }> = [];

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

        // CRITICAL: Check salary cap compliance for user's team
        // Prevent ANY advancement (preseason or regular season) if over cap
        const { data: saveGame } = await supabase
          .from("save_games")
          .select("selected_team_id")
          .eq("id", saveGameId)
          .single();

        if (saveGame?.selected_team_id) {
          const { calculateTeamCapHit } = await import("@/lib/utils/player-contracts");
          const userCapHit = await calculateTeamCapHit(saveGame.selected_team_id, saveGameId);
          const SALARY_CAP = 255000000;

          if (userCapHit > SALARY_CAP) {
            const overage = userCapHit - SALARY_CAP;
            const errorMessage = `Cannot advance: Your team is $${(overage / 1000000).toFixed(1)}M over the salary cap ($${(userCapHit / 1000000).toFixed(1)}M / $${(SALARY_CAP / 1000000).toFixed(1)}M). You must cut players or restructure contracts.`;
            console.error(`[Simulate Advance] Salary cap violation:`, errorMessage);
            
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ 
                type: "error", 
                error: errorMessage
              })}\n\n`)
            );
            controller.close();
            return;
          }
        }

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
        
        while (currentSimWeek < targetWeek && currentSimWeek <= 25) {
          console.log(`[Simulate Advance] Loop: currentSimWeek=${currentSimWeek}, targetWeek=${targetWeek}, condition=${currentSimWeek < targetWeek && currentSimWeek <= 25}`);
          
          // Offseason weeks (23-25) don't have games to simulate, just advance the week
          if (currentSimWeek >= 23 && currentSimWeek <= 25) {
            const previousWeek = currentSimWeek;
            
            // Process contracts when advancing from week 23 (resign phase) to week 24 (free agency)
            if (previousWeek === 23 && saveGameId) {
              console.log(`[Simulate Advance] Starting week 23 -> 24 transition (resignings + FA processing)...`);
              
              // STEP 1: CPU teams resign their players FIRST (before contracts expire)
              try {
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify({ 
                    type: "progress", 
                    total: totalWeeks, 
                    current: simulatedWeeks,
                    week: previousWeek,
                    message: `CPU teams resigning players...`
                  })}\n\n`)
                );

                const { cpuResignPlayers } = await import("@/lib/offseason/cpu-resign");
                
                // Get user team ID for this save game
                const { data: saveGame } = await supabase
                  .from("save_games")
                  .select("selected_team_id")
                  .eq("id", saveGameId)
                  .single();

                const resignStart = Date.now();
                const resignResult = await cpuResignPlayers(
                  saveGameId,
                  season,
                  saveGame?.selected_team_id || undefined
                );

                if (resignResult.success) {
                  console.log(
                    `[Simulate Advance] CPU resignings: ${resignResult.playersResigned} players resigned in ${Date.now() - resignStart}ms`
                  );
                  
                  controller.enqueue(
                    encoder.encode(`data: ${JSON.stringify({ 
                      type: "progress", 
                      total: totalWeeks, 
                      current: simulatedWeeks,
                      week: previousWeek,
                      message: `${resignResult.playersResigned} players resigned by CPU teams`
                    })}\n\n`)
                  );
                } else {
                  console.error("Error in CPU resignings:", resignResult.error);
                }
              } catch (err) {
                console.error("Error during CPU resignings:", err);
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify({ 
                    type: "warning", 
                    message: `CPU resignings had issues but continuing: ${err instanceof Error ? err.message : "Unknown error"}`
                  })}\n\n`)
                );
              }

              // STEP 2: Process remaining expiring contracts (move unsigned players to FA)
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ 
                  type: "progress", 
                  total: totalWeeks, 
                  current: simulatedWeeks,
                  week: previousWeek,
                  message: `Processing unsigned expiring contracts...`
                })}\n\n`)
              );
              
              try {
                const contractProcessingPromise = (async () => {
                  const { processExpiringContracts } = await import(
                    "@/lib/offseason/contract-processor"
                  );
                  return await processExpiringContracts(season, saveGameId);
                })();
                
                const timeoutPromise = new Promise((_, reject) => 
                  setTimeout(() => reject(new Error("Contract processing timeout")), 60000)
                );
                
                const contractResult = await Promise.race([
                  contractProcessingPromise,
                  timeoutPromise
                ]) as any;
                
                if (!contractResult.success) {
                  console.error("Error processing contracts:", contractResult.error);
                  controller.enqueue(
                    encoder.encode(`data: ${JSON.stringify({ 
                      type: "warning", 
                      message: `Contract processing had issues but continuing: ${contractResult.error}`
                    })}\n\n`)
                  );
                } else {
                  console.log(
                    `[Simulate Advance] Contract processing: ${contractResult.playersMovedToFA} players moved to FA, ${contractResult.contractsShifted} contracts shifted`
                  );
                  
                  controller.enqueue(
                    encoder.encode(`data: ${JSON.stringify({ 
                      type: "progress", 
                      total: totalWeeks, 
                      current: simulatedWeeks,
                      week: previousWeek,
                      message: `${contractResult.playersMovedToFA} unsigned players moved to FA`
                    })}\n\n`)
                  );
                }
              } catch (err) {
                console.error("Error processing contracts:", err);
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify({ 
                    type: "warning", 
                    message: `Contract processing failed but continuing: ${err instanceof Error ? err.message : "Unknown error"}`
                  })}\n\n`)
                );
              }
            }
            
            currentSimWeek++;
            simulatedWeeks++;
            
            console.log(`[Simulate Advance] Offseason advance: ${previousWeek} -> ${currentSimWeek}`);
            
            // Send progress update
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ 
                type: "progress", 
                total: totalWeeks, 
                current: simulatedWeeks,
                week: currentSimWeek,
                message: `Advanced to Week ${currentSimWeek} (Offseason)`
              })}\n\n`)
            );
            continue;
          }
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
          // CRITICAL: saveGameId is required - all games should have save_game_id set at creation
          if (!saveGameId) {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ 
                type: "error", 
                error: "saveGameId is required. All games must have save_game_id set." 
              })}\n\n`)
            );
            controller.close();
            return;
          }
          
          console.log(`[Simulate Advance] Querying games for week ${currentSimWeek}, season ${season}, saveGameId: ${saveGameId}`);
          
          // Query games with exact save_game_id match - no fallback to NULL
          // All games should have save_game_id set when created
          const gamesQuery = supabase
            .from("games")
            .select("*")
            .eq("season", season)
            .eq("week", currentSimWeek)
            .eq("played", false)
            .eq("save_game_id", saveGameId);

          // Query games (with timeout protection if needed)
          const { data: games, error: gamesError } = await gamesQuery;
          
          console.log(`[Simulate Advance] Games query result: ${games?.length || 0} games found for week ${currentSimWeek}, error: ${gamesError?.message || "none"}`);

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

          // CRITICAL: All games should have the correct save_game_id set at creation
          // If any games don't have the correct save_game_id, that's an error condition
          if (games && games.length > 0) {
            const gamesWithWrongSaveGameId = games.filter(
              (g) => !g.save_game_id || g.save_game_id !== saveGameId
            );
            if (gamesWithWrongSaveGameId.length > 0) {
              console.error(
                `[Simulate Advance] Found ${gamesWithWrongSaveGameId.length} games with incorrect or missing save_game_id. ` +
                `All games should have save_game_id set at creation. Game IDs: ${gamesWithWrongSaveGameId.map(g => g.id).join(', ')}`
              );
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ 
                  type: "error", 
                  error: `Found ${gamesWithWrongSaveGameId.length} games with incorrect save_game_id. All games should have save_game_id set at creation. This indicates a data integrity issue.` 
                })}\n\n`)
              );
              controller.close();
              return;
            }
          }

          // If no games, advance to next week
          if (!games || games.length === 0) {
            console.log(`[Simulate Advance] No games found for week ${currentSimWeek}, advancing to next week`);
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
                  useEnhancedAttributes: true,  // 🏈 Enable attribute-based simulation
                }, undefined, saveGameId);
                
                const timeoutPromise = new Promise<never>((_, reject) => 
                  setTimeout(() => reject(new Error('Game simulation timeout')), 30000)
                );
                
                const result = await Promise.race([gamePromise, timeoutPromise]);

                // Collect for batch operations
                if (result.playerStats && result.playerStats.length > 0) {
                  const statsWithSaveGameId = result.playerStats.map(stat => ({
                    ...stat,
                    save_game_id: saveGameId,
                  }));
                  allPlayerStats.push(...statsWithSaveGameId);
                  console.log(`[Simulate Advance] Collected ${statsWithSaveGameId.length} stats for game ${game.id}, total stats so far: ${allPlayerStats.length}`);
                } else {
                  console.warn(`[Simulate Advance] No player stats returned for game ${game.id} (home: ${game.home_team_id}, away: ${game.away_team_id})`);
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
              await flushGameUpdates(batch);
            }
          }

          // Batch insert all player stats
          console.log(`[Simulate Advance] Stats collection complete for week ${currentSimWeek}: ${allPlayerStats.length} total stats collected from ${weekResults.length} games`);
          if (allPlayerStats.length > 0) {
            console.log(`[Simulate Advance] Preparing to save ${allPlayerStats.length} player stats for week ${currentSimWeek}, saveGameId: ${saveGameId || "null"}`);
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
                throw new Error(
                  `Failed to persist player stats chunk ${i}-${Math.min(i + chunkSize, allPlayerStats.length)}: ${statsError.message}`
                );
              } else {
                console.log(`[Simulate Advance] Successfully saved ${insertedStats?.length || 0} stats in chunk ${i}-${i + chunkSize} for saveGameId: ${saveGameId || "null"}`);
                if (insertedStats && insertedStats.length > 0) {
                  console.log(`[Simulate Advance] Sample saved stat:`, {
                    player_id: insertedStats[0].player_id,
                    save_game_id: insertedStats[0].save_game_id,
                    season: insertedStats[0].season,
                    week: insertedStats[0].week,
                  });
                }
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
          } else {
            console.warn(`[Simulate Advance] WARNING: No player stats to save for week ${currentSimWeek} even though ${weekResults.length} games were simulated. This may indicate that simulateGame is not returning playerStats.`);
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
          if (currentSimWeek < targetWeek && saveGameId) {
            // Do this asynchronously so it doesn't block the simulation
            // Only run if we have a saveGameId (required for scout_priority table)
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
                  const regeneratePromises = teams.map(async (team) => {
                    try {
                      return await regenerateWeeklyPoints(team.id, saveGameId, season, nextWeek);
                    } catch (err) {
                      console.error(`Error regenerating points for team ${team.id}:`, err);
                      return { success: true }; // Return success to not block other teams
                    }
                  });
                  
                  const results = await Promise.allSettled(regeneratePromises);
                  const successful = results.filter(r => r.status === 'fulfilled').length;
                  console.log(`Regenerated scouting points for ${successful}/${teams.length} teams for week ${nextWeek}`);
                }
              } catch (err) {
                console.error("Error in scouting points regeneration:", err);
                // Don't fail the simulation if point regeneration fails
              }
            }).catch(err => {
              console.error("Error in async scouting points regeneration:", err);
              // Silently fail - don't block simulation
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
        // Always update if we advanced (simulatedWeeks > 0) OR if we're in offseason (weeks 23-25)
        // For offseason weeks, we always want to update even if no games were simulated
        // Also update if we've advanced weeks (currentSimWeek > currentWeek) to ensure week is always updated
        if (simulatedWeeks > 0 || currentSimWeek >= 23 || currentSimWeek > currentWeek || advanceType === "playoffs" || advanceType === "offseason" || advanceType === "regular_season" || advanceType === "next_week") {
          let phase: "preseason" | "regular_season" | "playoffs" | "offseason" = "regular_season";
          
          // Check if Super Bowl is complete (week 22) - if so, transition to offseason
          let superBowlComplete = false;
          if (currentSimWeek >= 22) {
            let superBowlQuery = supabase
              .from("playoff_games")
              .select("winner_id, played")
              .eq("season", season)
              .eq("round", "super_bowl");
            
            if (saveGameId) {
              superBowlQuery = superBowlQuery.eq("save_game_id", saveGameId);
            } else {
              superBowlQuery = superBowlQuery.is("save_game_id", null);
            }
            
            const { data: superBowl } = await superBowlQuery.maybeSingle();
            superBowlComplete = superBowl?.played && !!superBowl?.winner_id;
          }
          
          // Determine phase based on advanceType first, then fall back to week-based logic
          // BUT: if Super Bowl is complete, always transition to offseason regardless of advanceType
          if (superBowlComplete && currentSimWeek >= 22) {
            phase = "offseason";
            // If we're at week 22 and Super Bowl is complete, advance to week 23 (offseason)
            if (currentSimWeek === 22) {
              currentSimWeek = 23;
            }
          } else if (advanceType === "offseason") {
            phase = "offseason";
          } else if (advanceType === "playoffs") {
            // Only set to playoffs if Super Bowl isn't complete yet
            if (currentSimWeek >= 23) {
              phase = "offseason";
            } else {
              phase = "playoffs";
            }
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
            // Send error to client but don't fail the whole simulation
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ 
                type: "warning", 
                message: `Warning: Failed to update season week in database: ${phaseUpdateResult.error}. Week may be out of sync.` 
              })}\n\n`)
            );
          } else {
            console.log(`[Simulate Advance] Updated season ${season} to phase: ${phase}, week: ${currentSimWeek}`);
          }
        } else {
          // Even if we didn't meet the condition above, if we've advanced weeks, we should update
          if (currentSimWeek > currentWeek) {
            console.log(`[Simulate Advance] Week advanced from ${currentWeek} to ${currentSimWeek}, updating database even though no games were simulated`);
            const { updateSeasonPhase } = await import("@/lib/seasons/season-manager");
            const phaseUpdateResult = await updateSeasonPhase(season, saveGameId || null, "regular_season", currentSimWeek);
            
            if (!phaseUpdateResult.success) {
              console.error("Error updating season phase and week:", phaseUpdateResult.error);
            } else {
              console.log(`[Simulate Advance] Updated season ${season} to week: ${currentSimWeek}`);
            }
          }
        }

        // Send completion message
        console.log(`[Simulate Advance] Complete: simulatedWeeks=${simulatedWeeks}, finalWeek=${currentSimWeek}, from ${currentWeek} to ${currentSimWeek}`);
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ 
            type: "complete", 
            total: totalWeeks, 
            current: simulatedWeeks,
            finalWeek: currentSimWeek,
            simulatedWeeks,
            results,
            message: `Successfully advanced from week ${currentWeek} to week ${currentSimWeek}`
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
