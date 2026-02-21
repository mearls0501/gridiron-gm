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
    const saveGameId = searchParams.get("saveGameId");

    if (!teamId) {
      return NextResponse.json(
        { error: "teamId is required" },
        { status: 400 }
      );
    }

    // Use provided season or get current season (current season's draft)
    let draftSeason: number;
    if (season) {
      draftSeason = parseInt(season, 10);
    } else {
      let activeSeasonQuery = supabase
        .from("seasons")
        .select("year")
        .eq("is_active", true);
      
      if (saveGameId) {
        activeSeasonQuery = activeSeasonQuery.eq("save_game_id", saveGameId);
      } else {
        activeSeasonQuery = activeSeasonQuery.is("save_game_id", null);
      }
      
      const { data: activeSeason } = await activeSeasonQuery.single();
      draftSeason = activeSeason?.year || 2025;
    }

    // Get total prospects for this season
    let prospectsQuery = supabase
      .from("draft_prospects")
      .select("id")
      .eq("season", draftSeason);
    
    if (saveGameId) {
      prospectsQuery = prospectsQuery.eq("save_game_id", saveGameId);
    } else {
      prospectsQuery = prospectsQuery.is("save_game_id", null);
    }
    
    const { data: prospects, error: prospectsError } = await prospectsQuery;

    if (prospectsError) {
      console.error("Error fetching prospects:", prospectsError);
      return NextResponse.json(
        { error: "Failed to fetch prospects" },
        { status: 500 }
      );
    }

    const totalProspects = prospects?.length || 0;

    // Get scouted prospects for this team and season (current scouting system)
    let reportsQuery = supabase
      .from("scouted_prospects")
      .select("prospect_id")
      .eq("team_id", teamId);
    
    // Filter by save_game_id if provided
    if (saveGameId) {
      reportsQuery = reportsQuery.eq("save_game_id", saveGameId);
    } else {
      reportsQuery = reportsQuery.is("save_game_id", null);
    }
    
    const { data: reports, error: reportsError } = await reportsQuery;

    if (reportsError) {
      console.error("Error fetching scouted prospects:", reportsError);
      return NextResponse.json(
        { error: "Failed to fetch scouting status" },
        { status: 500 }
      );
    }

    const scoutedProspectIds = new Set(reports?.map((r) => r.prospect_id) || []);
    const scoutedCount = scoutedProspectIds.size;
    const scoutingPercentage = totalProspects > 0 ? (scoutedCount / totalProspects) * 100 : 0;

    // Get scouting resources (budget only - points are per-scout in scout_priority)
    let resourcesQuery = supabase
      .from("team_scouting_resources")
      .select("scouting_budget")
      .eq("team_id", teamId);
    
    // Filter by save_game_id if provided
    if (saveGameId) {
      resourcesQuery = resourcesQuery.eq("save_game_id", saveGameId);
    } else {
      resourcesQuery = resourcesQuery.is("save_game_id", null);
    }
    
    const { data: resources, error: resourcesError } = await resourcesQuery.single();

    // Get unscouted prospects (top 50 for priority)
    let unscoutedQuery = supabase
      .from("draft_prospects")
      .select("id, full_name, position, overall")
      .eq("season", draftSeason)
      .not("id", "in", `(${Array.from(scoutedProspectIds).map((id) => `'${id}'`).join(",") || "''"})`)
      .order("overall", { ascending: false })
      .limit(50);
    
    if (saveGameId) {
      unscoutedQuery = unscoutedQuery.eq("save_game_id", saveGameId);
    } else {
      unscoutedQuery = unscoutedQuery.is("save_game_id", null);
    }
    
    const { data: unscoutedProspects, error: unscoutedError } = await unscoutedQuery;

    return NextResponse.json({
      success: true,
      season: draftSeason,
      totalProspects,
      scoutedCount,
      scoutingPercentage: Math.round(scoutingPercentage * 100) / 100,
      // Note: Points are now per-scout in scout_priority table, not a global pool
      scoutingBudget: resources?.scouting_budget || 0,
      unscoutedProspects: unscoutedProspects || [],
      reports: reports?.map((r) => ({
        prospect_id: r.prospect_id,
        progress: 100,
        accuracy: null,
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
