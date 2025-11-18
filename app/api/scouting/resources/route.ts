import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase-client";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const teamId = searchParams.get("teamId");
    const season = searchParams.get("season");
    const currentWeek = searchParams.get("currentWeek");

    if (!teamId) {
      return NextResponse.json(
        { error: "teamId is required" },
        { status: 400 }
      );
    }

    let query = supabase
      .from("team_scouting_resources")
      .select("*")
      .eq("team_id", teamId);

    let seasonValue: number | null = null;
    if (season) {
      seasonValue = parseInt(season, 10);
      query = query.eq("season", seasonValue);
    } else {
      // Get most recent season
      query = query.order("season", { ascending: false }).limit(1);
    }

    const { data: resources, error } = await query.single();

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

    // If we have a current week and it's different from last_week, reset points
    if (week && (resources.last_week === null || week > resources.last_week)) {
      // Reset scouting points to 15 for the new week
      const { data: updatedResources, error: updateError } = await supabase
        .from("team_scouting_resources")
        .update({
          scouting_points: 15,
          last_week: week,
          updated_at: new Date().toISOString(),
        })
        .eq("team_id", teamId)
        .eq("season", resources.season)
        .select()
        .single();

      if (updateError) {
        console.error("Error resetting scouting points:", updateError);
        // Return original resources if update fails
        return NextResponse.json({
          success: true,
          resources: resources,
        });
      }

      return NextResponse.json({
        success: true,
        resources: updatedResources,
      });
    }

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

