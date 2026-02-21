import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase-client";

/**
 * Reset games that are marked as played but have no player stats
 * This can happen if games were simulated but stats failed to save,
 * or if games were manually marked as played
 */
export async function POST(req: Request) {
  try {
    const { season, week, saveGameId } = await req.json();

    if (!saveGameId) {
      return NextResponse.json(
        { error: "saveGameId is required" },
        { status: 400 }
      );
    }

    // Find games that are marked as played
    let gamesQuery = supabase
      .from("games")
      .select("id, season, week, home_team_id, away_team_id, played, home_score, away_score")
      .eq("season", season || 2026)
      .eq("played", true);

    if (week !== undefined && week !== null) {
      gamesQuery = gamesQuery.eq("week", week);
    }

    if (saveGameId) {
      gamesQuery = gamesQuery.eq("save_game_id", saveGameId);
    }

    const { data: playedGames, error: gamesError } = await gamesQuery;

    if (gamesError) {
      return NextResponse.json(
        { error: `Failed to fetch games: ${gamesError.message}` },
        { status: 500 }
      );
    }

    if (!playedGames || playedGames.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No played games found to check",
        reset: 0,
      });
    }

    // Check which games have stats
    const gameIds = playedGames.map((g) => g.id);
    const { data: stats, error: statsError } = await supabase
      .from("player_game_stats")
      .select("game_id")
      .in("game_id", gameIds)
      .eq("save_game_id", saveGameId);

    if (statsError) {
      console.error("Error checking stats:", statsError);
      // Continue anyway - we'll reset all games
    }

    // Find games without stats
    const gamesWithStats = new Set((stats || []).map((s) => s.game_id));
    const gamesWithoutStats = playedGames.filter(
      (g) => !gamesWithStats.has(g.id)
    );

    if (gamesWithoutStats.length === 0) {
      return NextResponse.json({
        success: true,
        message: "All played games have stats",
        reset: 0,
      });
    }

    // Reset games without stats
    const gameIdsToReset = gamesWithoutStats.map((g) => g.id);
    const { error: resetError } = await supabase
      .from("games")
      .update({
        played: false,
        home_score: null,
        away_score: null,
        updated_at: new Date().toISOString(),
      })
      .in("id", gameIdsToReset);

    if (resetError) {
      return NextResponse.json(
        { error: `Failed to reset games: ${resetError.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Reset ${gamesWithoutStats.length} games that were marked as played but had no stats`,
      reset: gamesWithoutStats.length,
      games: gamesWithoutStats.map((g) => ({
        id: g.id,
        season: g.season,
        week: g.week,
      })),
    });
  } catch (error) {
    console.error("Error resetting games:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}



