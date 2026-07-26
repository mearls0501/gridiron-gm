import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/route-auth";

export async function POST(req: Request) {
  const auth = await requireUser(req);
  if (!auth.ok) return auth.response;
  const { supabase, user } = auth.context;

  try {
    const { saveId } = await req.json();

    if (!saveId) {
      return NextResponse.json(
        { error: "saveId is required" },
        { status: 400 }
      );
    }

    // Get save game owned by the caller
    const { data: saveGame, error } = await supabase
      .from("save_games")
      .select("*")
      .eq("id", saveId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) throw error;

    if (!saveGame) {
      return NextResponse.json(
        { error: "Save game not found" },
        { status: 404 }
      );
    }

    // Update last played timestamp
    await supabase
      .from("save_games")
      .update({ last_played_at: new Date().toISOString() })
      .eq("id", saveId)
      .eq("user_id", user.id);

    return NextResponse.json({
      success: true,
      saveGame: saveGame,
      saveGameId: saveGame.id, // Include save_game_id in response
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
