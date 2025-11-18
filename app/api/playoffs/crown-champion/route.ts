import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase-client";

/**
 * Crown the Super Bowl champion and transition to offseason
 */
export async function POST(req: Request) {
  try {
    const { season } = await req.json();

    if (!season) {
      return NextResponse.json(
        { error: "Season is required" },
        { status: 400 }
      );
    }

    // Check if Super Bowl is complete
    const { data: superBowl, error: sbError } = await supabase
      .from("playoff_games")
      .select("*")
      .eq("season", season)
      .eq("round", "super_bowl")
      .single();

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

    // Update season with champion (but don't set phase to offseason yet - that happens when advancing to offseason)
    const { error: seasonError } = await supabase
      .from("seasons")
      .update({
        champion_team_id: superBowl.winner_id,
        updated_at: new Date().toISOString(),
      })
      .eq("year", season)
      .eq("is_active", true);

    if (seasonError) {
      console.error("Error updating season:", seasonError);
      return NextResponse.json(
        { error: "Failed to update season" },
        { status: 500 }
      );
    }

    // Get updated season data
    const { data: updatedSeasonData } = await supabase
      .from("seasons")
      .select("phase, current_week")
      .eq("year", season)
      .eq("is_active", true)
      .single();

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

