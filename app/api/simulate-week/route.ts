import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase-client";
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

    // Batch load all teams before simulation to avoid redundant queries
    const allTeamIds = new Set<string>();
    games.forEach(game => {
      allTeamIds.add(game.home_team_id);
      allTeamIds.add(game.away_team_id);
    });

    console.log(`[Simulate Week] Batch loading ${allTeamIds.size} unique teams...`);
    const preloadedTeams = await loadTeamsWithRosters(Array.from(allTeamIds));
    console.log(`[Simulate Week] Successfully loaded ${preloadedTeams.size} teams`);

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

    // Process games in batches of 4 for better progress visibility
    const batchSize = 4;
    for (let i = 0; i < games.length; i += batchSize) {
      const batch = games.slice(i, i + batchSize);

      // Simulate batch in parallel
      const batchPromises = batch.map(async (game) => {
        try {
          const result = await simulateGame({
            homeTeamId: game.home_team_id,
            awayTeamId: game.away_team_id,
            gameId: game.id,
            season: game.season,
            week: game.week,
          }, preloadedTeams);

          // Collect stats and updates for batch operations
          if (result.playerStats && result.playerStats.length > 0) {
            // Use saveGameId from request, fall back to game's save_game_id
            const effectiveSaveGameId = saveGameId || game.save_game_id || null;
            
            const statsWithSaveGameId = result.playerStats.map(stat => ({
              ...stat,
              save_game_id: effectiveSaveGameId,
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
        await Promise.all(
          batchUpdates.map((update) =>
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
      }
    }

    // Any remaining game updates (should be none after batch processing)
    if (gameUpdates.length > 0) {
      await Promise.all(
        gameUpdates.map((update) =>
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
          console.error(`Error saving stats chunk ${i}-${i + chunkSize}:`, statsError);
          console.error("Error details:", {
            message: statsError.message,
            code: statsError.code,
            details: statsError.details,
            hint: statsError.hint,
          });
        } else {
          console.log(`Successfully saved ${insertedStats?.length || 0} stats in chunk ${i}-${i + chunkSize}`);
        }
      }
    }

    // Aggregate season stats asynchronously (non-blocking)
    if (results.length > 0) {
      Promise.resolve()
        .then(async () => {
          try {
            const { aggregateSeasonStats } = await import(
              "@/lib/simulation/player-development"
            );
            await aggregateSeasonStats(season, saveGameId);
          } catch (err) {
            console.error("Error aggregating season stats:", err);
          }
        })
        .catch(() => {});

      // Recalculate draft positions for current season based on updated standings (non-blocking)
      Promise.resolve()
        .then(async () => {
          try {
            if (saveGameId) {
              // Import and call recalculate function directly (more efficient than HTTP)
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
