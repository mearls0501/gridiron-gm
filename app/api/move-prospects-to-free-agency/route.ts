import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase-client";

/**
 * Move undrafted prospects to free agency
 * This should be called after the draft is complete
 * Sets entered_free_agency_season to track when they became free agents
 */
export async function POST(req: Request) {
  try {
    const { season, saveGameId } = await req.json();
    
    if (!season || typeof season !== "number") {
      return NextResponse.json(
        { error: "season is required and must be a number" },
        { status: 400 }
      );
    }

    // Fetch all prospects for this season that haven't been drafted
    // Filter by save_game_id if provided
    let prospectsQuery = supabase
      .from("draft_prospects")
      .select("*")
      .eq("season", season);
    
    if (saveGameId) {
      prospectsQuery = prospectsQuery.eq("save_game_id", saveGameId);
    } else {
      prospectsQuery = prospectsQuery.is("save_game_id", null);
    }
    
    const { data: prospects, error: fetchError } = await prospectsQuery;

    if (fetchError) {
      console.error("Error fetching prospects:", fetchError);
      return NextResponse.json(
        { error: "Failed to fetch prospects: " + fetchError.message },
        { status: 500 }
      );
    }

    if (!prospects || prospects.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No prospects found for this season",
        movedCount: 0,
      });
    }

    if (!saveGameId) {
      return NextResponse.json(
        { error: "saveGameId is required to track undrafted prospects" },
        { status: 400 }
      );
    }

    // Track undrafted prospects in undrafted_prospects table
    const undraftedRecords = prospects.map((prospect) => ({
      prospect_id: prospect.id,
      save_game_id: saveGameId,
      season: season,
      entered_free_agency_season: season,
      archived: false,
    }));

    const { error: undraftedError } = await supabase
      .from("undrafted_prospects")
      .upsert(undraftedRecords, {
        onConflict: "prospect_id,save_game_id",
      });

    if (undraftedError) {
      console.error("Error tracking undrafted prospects:", undraftedError);
      return NextResponse.json(
        { error: "Failed to track undrafted prospects: " + undraftedError.message },
        { status: 500 }
      );
    }

    // Create free_agent_availability records with prospect_id (not player_id)
    // This makes them available as free agents for this save game
    const availabilityRecords = prospects.map((prospect) => ({
      prospect_id: prospect.id,
      save_game_id: saveGameId,
      entered_free_agency_season: season,
      reason: "draft_undrafted",
      archived: false,
    }));

    // Insert availability records
    const { error: availabilityError } = await supabase
      .from("free_agent_availability")
      .upsert(availabilityRecords, {
        onConflict: "save_game_id,prospect_id",
      });

    if (availabilityError) {
      console.error("Error creating free agent availability:", availabilityError);
      return NextResponse.json(
        { error: "Failed to create free agent availability: " + availabilityError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Moved ${prospects.length} prospects to free agency`,
      movedCount: prospects.length,
    });
  } catch (error) {
    console.error("Error moving prospects to free agency:", error);
    return NextResponse.json(
      { error: "Server error: " + (error instanceof Error ? error.message : "Unknown error") },
      { status: 500 }
    );
  }
}

