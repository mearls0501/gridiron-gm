import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase-client";

export async function POST(req: Request) {
  try {
    const { saveId } = await req.json();

    if (!saveId) {
      return NextResponse.json(
        { error: "saveId is required" },
        { status: 400 }
      );
    }

    // Get save game
    const { data: saveGame, error } = await supabase
      .from("save_games")
      .select("*")
      .eq("id", saveId)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return NextResponse.json(
          { error: "Save game not found" },
          { status: 404 }
        );
      }
      throw error;
    }

    // Update last played timestamp
    await supabase
      .from("save_games")
      .update({ last_played_at: new Date().toISOString() })
      .eq("id", saveId);

    return NextResponse.json({
      success: true,
      saveGame: saveGame,
      gameState: {
        currentSeason: saveGame.current_season,
        currentWeek: saveGame.current_week,
        selectedTeamId: saveGame.selected_team_id,
        gameState: saveGame.game_state,
      },
    });
  } catch (error) {
    console.error("Error loading game:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load game" },
      { status: 500 }
    );
  }
}

