import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase-client";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const teamId = searchParams.get("teamId");
    const season = searchParams.get("season");
    const currentWeek = searchParams.get("currentWeek");
    const saveGameId = searchParams.get("saveGameId");

    if (!teamId) {
      return NextResponse.json(
        { 
          success: false,
          error: "teamId is required",
          message: "No team selected. Please select a team first."
        },
        { status: 400 }
      );
    }

    let query = supabase
      .from("team_scouting_resources")
      .select("*")
      .eq("team_id", teamId);

    // Filter by save_game_id if provided
    if (saveGameId) {
      query = query.eq("save_game_id", saveGameId);
    } else {
      query = query.is("save_game_id", null);
    }

    let seasonValue: number | null = null;
    if (season) {
      seasonValue = parseInt(season, 10);
      query = query.eq("season", seasonValue);
    } else {
      // Get most recent season
      query = query.order("season", { ascending: false }).limit(1);
    }

    let { data: resources, error } = await query.single();

    if (error) {
      if (error.code === "PGRST116") {
        // No resources found
        return NextResponse.json({
          success: false,
          error: "Scouting not initialized",
        });
      }
      throw error;
    }

    // Get current week if not provided
    let week = currentWeek ? parseInt(currentWeek, 10) : null;
    if (!week && seasonValue) {
      // Try to get current week from seasons table
      const { data: seasonData } = await supabase
        .from("seasons")
        .select("current_week")
        .eq("year", seasonValue)
        .single();
      
      if (seasonData) {
        week = seasonData.current_week;
      }
    }

    // Note: In the new scouting system, points are tracked per-scout in scout_priority table
    // This table (team_scouting_resources) only tracks the scouting_budget for hiring scouts
    // Weekly points are allocated per-scout based on their priority (25/15/10/5)

    return NextResponse.json({
      success: true,
      resources: resources,
    });
  } catch (error) {
    console.error("Error fetching scouting resources:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch scouting resources" },
      { status: 500 }
    );
  }
}

