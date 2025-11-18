import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase-client";

/**
 * Move undrafted prospects to free agency
 * This should be called after the draft is complete
 * Sets entered_free_agency_season to track when they became free agents
 */
export async function POST(req: Request) {
  try {
    const { season } = await req.json();
    
    if (!season || typeof season !== "number") {
      return NextResponse.json(
        { error: "season is required and must be a number" },
        { status: 400 }
      );
    }

    // Fetch all prospects for this season that haven't been drafted
    // (Assuming drafted prospects are removed from draft_prospects or have a drafted flag)
    // For now, we'll move all prospects to free agency
    const { data: prospects, error: fetchError } = await supabase
      .from("draft_prospects")
      .select("*")
      .eq("season", season);

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

    // Convert prospects to free agents format
    const freeAgentsToInsert = prospects.map((prospect) => ({
      id: prospect.id || crypto.randomUUID(),
      full_name: prospect.full_name,
      position: prospect.position,
      age: prospect.age,
      college: prospect.college || null,
      archetype: prospect.archetype || null,
      overall: prospect.overall,
      potential: prospect.potential,
      traits: prospect.traits,
      contract_year_1: prospect.contract_year_1 || 0,
      contract_year_2: prospect.contract_year_2 || 0,
      contract_year_3: prospect.contract_year_3 || 0,
      contract_year_4: prospect.contract_year_4 || 0,
      signing_bonus: prospect.signing_bonus || 0,
      entered_free_agency_season: season, // Track when they entered free agency
      archived: false,
    }));

    // Insert into free_agents table (upsert to handle duplicates)
    const { error: insertError } = await supabase
      .from("free_agents")
      .upsert(freeAgentsToInsert, { onConflict: "id" });

    if (insertError) {
      console.error("Error moving prospects to free agency:", insertError);
      return NextResponse.json(
        { error: "Failed to move prospects to free agency: " + insertError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Moved ${freeAgentsToInsert.length} prospects to free agency`,
      movedCount: freeAgentsToInsert.length,
    });
  } catch (error) {
    console.error("Error moving prospects to free agency:", error);
    return NextResponse.json(
      { error: "Server error: " + (error instanceof Error ? error.message : "Unknown error") },
      { status: 500 }
    );
  }
}

