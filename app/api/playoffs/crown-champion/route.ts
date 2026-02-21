import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase-client";
import { updateSeasonPhase } from "@/lib/seasons/season-manager";

/**
 * Crown the Super Bowl champion and transition to offseason
 */
export async function POST(req: Request) {
  try {
    const { season, saveGameId } = await req.json();

    if (!season) {
      return NextResponse.json(
        { error: "Season is required" },
        { status: 400 }
      );
    }

    // Check if Super Bowl is complete
    let superBowlQuery = supabase
      .from("playoff_games")
      .select("*")
      .eq("season", season)
      .eq("round", "super_bowl");
    
    if (saveGameId) {
      superBowlQuery = superBowlQuery.eq("save_game_id", saveGameId);
    } else {
      superBowlQuery = superBowlQuery.is("save_game_id", null);
    }
    
    const { data: superBowl, error: sbError } = await superBowlQuery.single();

    if (sbError || !superBowl) {
      return NextResponse.json(
        { error: "Super Bowl not found" },
        { status: 404 }
      );
    }

    if (!superBowl.played) {
      return NextResponse.json(
        { error: "Super Bowl has not been played yet" },
        { status: 400 }
      );
    }

    if (!superBowl.winner_id) {
      return NextResponse.json(
        { error: "Super Bowl winner not determined" },
        { status: 400 }
      );
    }

    // Update season with champion and transition to offseason (week 23)
    // After Super Bowl (week 22), we move to offseason (week 23)
    let updateSeasonQuery = supabase
      .from("seasons")
      .update({
        champion_team_id: superBowl.winner_id,
        updated_at: new Date().toISOString(),
      })
      .eq("year", season)
      .eq("is_active", true);
    
    if (saveGameId) {
      updateSeasonQuery = updateSeasonQuery.eq("save_game_id", saveGameId);
    } else {
      updateSeasonQuery = updateSeasonQuery.is("save_game_id", null);
    }
    
    const { error: seasonError } = await updateSeasonQuery;

    if (seasonError) {
      console.error("Error updating season:", seasonError);
      return NextResponse.json(
        { error: "Failed to update season" },
        { status: 500 }
      );
    }
    
    // Transition to offseason phase (week 23) after Super Bowl
    const phaseUpdateResult = await updateSeasonPhase(season, saveGameId || null, "offseason", 23);
    
    if (!phaseUpdateResult.success) {
      console.error("Error transitioning to offseason:", phaseUpdateResult.error);
      // Don't fail - champion is set, just log the warning
      console.warn("Warning: Champion set but failed to transition to offseason phase");
    } else {
      console.log(`[Crown Champion] Transitioned season ${season} to offseason (week 23) after Super Bowl`);
    }

    // Get updated season data
    let getSeasonQuery = supabase
      .from("seasons")
      .select("phase, current_week")
      .eq("year", season)
      .eq("is_active", true);
    
    if (saveGameId) {
      getSeasonQuery = getSeasonQuery.eq("save_game_id", saveGameId);
    } else {
      getSeasonQuery = getSeasonQuery.is("save_game_id", null);
    }
    
    const { data: updatedSeasonData } = await getSeasonQuery.single();

    // Get champion team info
    const { data: championTeam } = await supabase
      .from("teams")
      .select("id, name, abbreviation")
      .eq("id", superBowl.winner_id)
      .single();

    return NextResponse.json({
      success: true,
      message: `${championTeam?.name || "Champion"} has won Super Bowl ${season}!`,
      champion: {
        teamId: superBowl.winner_id,
        teamName: championTeam?.name,
        abbreviation: championTeam?.abbreviation,
      },
      season: {
        year: season,
        phase: updatedSeasonData?.phase || "regular_season",
        currentWeek: updatedSeasonData?.current_week || 22,
      },
    });
  } catch (error) {
    console.error("Error crowning champion:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

