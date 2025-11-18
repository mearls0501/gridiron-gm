import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase-client";

/**
 * Get scouting status for a team and season
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const teamId = searchParams.get("teamId");
    const season = searchParams.get("season");

    if (!teamId) {
      return NextResponse.json(
        { error: "teamId is required" },
        { status: 400 }
      );
    }

    // Use provided season or get current season + 1 (next draft)
    let draftSeason: number;
    if (season) {
      draftSeason = parseInt(season, 10);
    } else {
      const { data: activeSeason } = await supabase
        .from("seasons")
        .select("year")
        .eq("is_active", true)
        .single();
      draftSeason = (activeSeason?.year || 2025) + 1;
    }

    // Get total prospects for this season
    const { data: prospects, error: prospectsError } = await supabase
      .from("draft_prospects")
      .select("id")
      .eq("season", draftSeason);

    if (prospectsError) {
      console.error("Error fetching prospects:", prospectsError);
      return NextResponse.json(
        { error: "Failed to fetch prospects" },
        { status: 500 }
      );
    }

    const totalProspects = prospects?.length || 0;

    // Get scouting reports for this team and season
    const { data: reports, error: reportsError } = await supabase
      .from("scouting_reports")
      .select("prospect_id, scouting_progress, accuracy_percentage")
      .eq("team_id", teamId)
      .eq("season", draftSeason);

    if (reportsError) {
      console.error("Error fetching scouting reports:", reportsError);
      return NextResponse.json(
        { error: "Failed to fetch scouting reports" },
        { status: 500 }
      );
    }

    const scoutedProspectIds = new Set(reports?.map((r) => r.prospect_id) || []);
    const scoutedCount = scoutedProspectIds.size;
    const scoutingPercentage = totalProspects > 0 ? (scoutedCount / totalProspects) * 100 : 0;

    // Get scouting resources
    const { data: resources, error: resourcesError } = await supabase
      .from("team_scouting_resources")
      .select("scouting_points, scouting_budget")
      .eq("team_id", teamId)
      .single();

    // Get unscouted prospects (top 50 for priority)
    const { data: unscoutedProspects, error: unscoutedError } = await supabase
      .from("draft_prospects")
      .select("id, full_name, position, overall")
      .eq("season", draftSeason)
      .not("id", "in", `(${Array.from(scoutedProspectIds).map((id) => `'${id}'`).join(",") || "''"})`)
      .order("overall", { ascending: false })
      .limit(50);

    return NextResponse.json({
      success: true,
      season: draftSeason,
      totalProspects,
      scoutedCount,
      scoutingPercentage: Math.round(scoutingPercentage * 100) / 100,
      scoutingPoints: resources?.scouting_points || 0,
      scoutingBudget: resources?.scouting_budget || 0,
      unscoutedProspects: unscoutedProspects || [],
      reports: reports?.map((r) => ({
        prospect_id: r.prospect_id,
        progress: r.scouting_progress,
        accuracy: r.accuracy_percentage,
      })) || [],
    });
  } catch (error) {
    console.error("Error getting scouting status:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

