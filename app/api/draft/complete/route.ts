import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase-client";

/**
 * Mark draft as complete and move undrafted prospects to free agency
 */
export async function POST(req: Request) {
  try {
    const { season } = await req.json();

    if (!season || typeof season !== "number") {
      return NextResponse.json(
        { error: "Season is required and must be a number" },
        { status: 400 }
      );
    }

    // Get all draft picks for this season
    const { data: draftPicks, error: picksError } = await supabase
      .from("draft_picks")
      .select("selected_player_id")
      .eq("season", season)
      .not("selected_player_id", "is", null);

    if (picksError) {
      console.error("Error fetching draft picks:", picksError);
      return NextResponse.json(
        { error: "Failed to fetch draft picks" },
        { status: 500 }
      );
    }

    const draftedProspectIds = new Set(
      draftPicks?.map((p) => p.selected_player_id).filter((id) => id !== null) || []
    );

    // Get all prospects for this season
    const { data: allProspects, error: prospectsError } = await supabase
      .from("draft_prospects")
      .select("id, full_name, position, age, college, archetype, overall, potential, traits")
      .eq("season", season);

    if (prospectsError) {
      console.error("Error fetching prospects:", prospectsError);
      return NextResponse.json(
        { error: "Failed to fetch prospects" },
        { status: 500 }
      );
    }

    // Find undrafted prospects
    const undraftedProspects = (allProspects || []).filter(
      (p) => !draftedProspectIds.has(p.id)
    );

    if (undraftedProspects.length === 0) {
      return NextResponse.json({
        success: true,
        message: "All prospects have been drafted",
        undraftedCount: 0,
      });
    }

    // Move undrafted prospects to free agency
    const freeAgentsToInsert = undraftedProspects.map((prospect) => ({
      id: prospect.id,
      full_name: prospect.full_name,
      position: prospect.position,
      age: prospect.age,
      college: prospect.college || null,
      archetype: prospect.archetype || null,
      overall: prospect.overall,
      potential: prospect.potential,
      traits: prospect.traits || {},
      entered_free_agency_season: season,
      archived: false,
    }));

    const { error: insertFAError } = await supabase
      .from("free_agents")
      .upsert(freeAgentsToInsert, {
        onConflict: "id",
        ignoreDuplicates: false,
      });

    if (insertFAError) {
      console.error("Error moving prospects to free agency:", insertFAError);
      return NextResponse.json(
        { error: `Failed to move undrafted prospects to free agency: ${insertFAError.message}` },
        { status: 500 }
      );
    }

    // Log transactions for undrafted players
    const transactions = undraftedProspects.map((prospect) => ({
      player_id: prospect.id,
      team_id: null,
      transaction_type: "undrafted_free_agent",
      season: season,
      details: JSON.stringify({
        player_name: prospect.full_name,
        position: prospect.position,
        reason: "Undrafted in NFL Draft",
      }),
    }));

    if (transactions.length > 0) {
      const { error: transactionError } = await supabase
        .from("transactions")
        .insert(transactions);

      if (transactionError) {
        console.error("Error logging transactions:", transactionError);
        // Don't fail the request if transaction logging fails
      }
    }

    return NextResponse.json({
      success: true,
      message: `Draft complete. ${undraftedProspects.length} undrafted prospects moved to free agency.`,
      draftedCount: draftedProspectIds.size,
      undraftedCount: undraftedProspects.length,
    });
  } catch (error) {
    console.error("Error completing draft:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

