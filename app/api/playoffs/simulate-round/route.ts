import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase-client";
import { simulateGame } from "@/lib/simulation/engine";

/**
 * Simulate all unplayed games in a playoff round
 */
export async function POST(req: Request) {
  try {
    const { season, round } = await req.json();

    if (!season || !round) {
      return NextResponse.json(
        { error: "Season and round are required" },
        { status: 400 }
      );
    }

    // Get all unplayed games for this round
    const { data: games, error: gamesError } = await supabase
      .from("playoff_games")
      .select("*")
      .eq("season", season)
      .eq("round", round)
      .eq("played", false);

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

        // Collect player stats
        if (result.playerStats && result.playerStats.length > 0) {
          allPlayerStats.push(...result.playerStats);
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
        const { error: statsError } = await supabase
          .from("player_game_stats")
          .insert(batch);

        if (statsError) {
          console.error("Error saving player stats:", statsError);
          // Don't fail the request if stats fail
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

