import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase-client";

/**
 * Diagnostic endpoint to check stats for a specific game
 */
export async function POST(req: Request) {
  try {
    const { gameId, saveGameId } = await req.json();

    if (!gameId) {
      return NextResponse.json({ error: "gameId required" }, { status: 400 });
    }

    // Get game info
    let gameQuery = supabase.from("games").select("*").eq("id", gameId);
    if (saveGameId) {
      gameQuery = gameQuery.eq("save_game_id", saveGameId);
    }
    const { data: game } = await gameQuery.single();

    // Get stats for this game
    let statsQuery = supabase
      .from("player_game_stats")
      .select("*")
      .eq("game_id", gameId);
    if (saveGameId) {
      statsQuery = statsQuery.eq("save_game_id", saveGameId);
    }
    const { data: stats, error: statsError } = await statsQuery;

    // Get stats WITHOUT game_id filter (to see if they exist elsewhere)
    const { data: allStatsForSeason } = await supabase
      .from("player_game_stats")
      .select("game_id, season, week, save_game_id, player_id")
      .eq("season", game?.season || 2026)
      .eq("save_game_id", saveGameId || "")
      .limit(10);

    return NextResponse.json({
      game: {
        id: game?.id,
        season: game?.season,
        week: game?.week,
        played: game?.played,
        save_game_id: game?.save_game_id,
        home_team_id: game?.home_team_id,
        away_team_id: game?.away_team_id,
      },
      stats: {
        count: stats?.length || 0,
        error: statsError?.message,
        sample: stats?.[0],
      },
      allStatsForSeason: {
        count: allStatsForSeason?.length || 0,
        sample: allStatsForSeason,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown" },
      { status: 500 }
    );
  }
}



