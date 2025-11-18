import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase-client";
import { simulateGame } from "@/lib/simulation/engine";

/**
 * Simulate a playoff game
 */
export async function POST(req: Request) {
  try {
    const { gameId, season, week } = await req.json();

    if (!gameId) {
      return NextResponse.json(
        { error: "Game ID is required" },
        { status: 400 }
      );
    }

    // Load playoff game
    const { data: game, error: gameError } = await supabase
      .from("playoff_games")
      .select("*")
      .eq("id", gameId)
      .single();

    if (gameError || !game) {
      return NextResponse.json(
        { error: "Playoff game not found" },
        { status: 404 }
      );
    }

    if (game.played) {
      return NextResponse.json(
        { error: "Game has already been played" },
        { status: 400 }
      );
    }

    if (!game.home_team_id || !game.away_team_id) {
      return NextResponse.json(
        { error: "Game teams not set" },
        { status: 400 }
      );
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
      return NextResponse.json(
        { error: "Game ended in a tie - playoff games cannot tie" },
        { status: 500 }
      );
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
      .eq("id", gameId);

    if (updateError) {
      console.error("Error updating playoff game:", updateError);
      return NextResponse.json(
        { error: "Failed to update playoff game" },
        { status: 500 }
      );
    }

    // Save player stats
    if (result.playerStats && result.playerStats.length > 0) {
      const { error: statsError } = await supabase
        .from("player_game_stats")
        .insert(result.playerStats);

      if (statsError) {
        console.error("Error saving player stats:", statsError);
        // Don't fail the request if stats fail
      }
    }

    return NextResponse.json({
      success: true,
      result: {
        homeScore: Math.round(result.homeScore),
        awayScore: Math.round(result.awayScore),
        winnerId,
        playerStatsCount: result.playerStats.length,
      },
    });
  } catch (error) {
    console.error("Error simulating playoff game:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

