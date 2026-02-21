import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase-client";
import { simulateGame } from "@/lib/simulation/engine";

/**
 * Simulate all unplayed games in a playoff round
 */
export async function POST(req: Request) {
  try {
    const { season, round, saveGameId } = await req.json();

    if (!season || !round) {
      return NextResponse.json(
        { error: "Season and round are required" },
        { status: 400 }
      );
    }

    // Get all unplayed games for this round - filter by save_game_id
    let gamesQuery = supabase
      .from("playoff_games")
      .select("*")
      .eq("season", season)
      .eq("round", round)
      .eq("played", false);
    
    if (saveGameId) {
      gamesQuery = gamesQuery.eq("save_game_id", saveGameId);
    } else {
      gamesQuery = gamesQuery.is("save_game_id", null);
    }
    
    const { data: games, error: gamesError } = await gamesQuery;

    if (gamesError) {
      return NextResponse.json(
        { error: "Failed to fetch playoff games" },
        { status: 500 }
      );
    }

    if (!games || games.length === 0) {
      return NextResponse.json(
        { error: "No unplayed games found for this round" },
        { status: 404 }
      );
    }

    const results: Array<{ gameId: string; homeScore: number; awayScore: number; winnerId: string }> = [];
    const errors: Array<{ gameId: string; error: string }> = [];
    const allPlayerStats: any[] = [];

    // Simulate all games in parallel
    const simulationPromises = games.map(async (game) => {
      try {
        if (!game.home_team_id || !game.away_team_id) {
          throw new Error("Game teams not set");
        }

        // Simulate the game
        const result = await simulateGame({
          homeTeamId: game.home_team_id,
          awayTeamId: game.away_team_id,
          gameId: game.id,
          season: game.season,
          week: game.week,
        });

        // Determine winner
        const winnerId = result.homeScore > result.awayScore 
          ? game.home_team_id 
          : result.awayScore > result.homeScore 
          ? game.away_team_id 
          : null;

        if (!winnerId) {
          throw new Error("Game ended in a tie - playoff games cannot tie");
        }

        // Collect player stats with save_game_id
        if (result.playerStats && result.playerStats.length > 0) {
          const effectiveSaveGameId = saveGameId || game.save_game_id || null;
          const statsWithSaveGameId = result.playerStats.map((stat) => ({
            ...stat,
            save_game_id: effectiveSaveGameId,
          }));
          allPlayerStats.push(...statsWithSaveGameId);
        }

        // Update playoff game
        const { error: updateError } = await supabase
          .from("playoff_games")
          .update({
            home_score: Math.round(result.homeScore),
            away_score: Math.round(result.awayScore),
            played: true,
            winner_id: winnerId,
            updated_at: new Date().toISOString(),
          })
          .eq("id", game.id);

        if (updateError) {
          throw new Error(`Failed to update game: ${updateError.message}`);
        }

        return {
          gameId: game.id,
          homeScore: Math.round(result.homeScore),
          awayScore: Math.round(result.awayScore),
          winnerId,
        };
      } catch (error) {
        errors.push({
          gameId: game.id,
          error: error instanceof Error ? error.message : "Unknown error",
        });
        return null;
      }
    });

    // Wait for all simulations
    const simResults = await Promise.all(simulationPromises);
    results.push(...simResults.filter((r) => r !== null));

    // Batch insert all player stats
    if (allPlayerStats.length > 0) {
      const batchSize = 1000;
      for (let i = 0; i < allPlayerStats.length; i += batchSize) {
        const batch = allPlayerStats.slice(i, i + batchSize);
        const { error: statsError, data: insertedStats } = await supabase
          .from("player_game_stats")
          .insert(batch)
          .select();

        if (statsError) {
          console.error(`Error saving stats chunk ${i}-${i + batchSize}:`, statsError);
          console.error("Error details:", {
            message: statsError.message,
            code: statsError.code,
            details: statsError.details,
            hint: statsError.hint,
          });
          // Don't fail the request if stats fail
        } else {
          console.log(`Successfully saved ${insertedStats?.length || 0} stats in chunk ${i}-${i + batchSize}`);
        }
      }
    }

    return NextResponse.json({
      success: true,
      round,
      gamesSimulated: results.length,
      gamesFailed: errors.length,
      results,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error("Error simulating playoff round:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

