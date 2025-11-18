import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase-client";

/**
 * Archive free agents who have been unsigned for 3+ seasons
 * This should be called at the start of each new season
 */
export async function POST(req: Request) {
  try {
    const { currentSeason } = await req.json();
    
    if (!currentSeason || typeof currentSeason !== "number") {
      return NextResponse.json(
        { error: "currentSeason is required and must be a number" },
        { status: 400 }
      );
    }

    // Find all non-archived free agents who entered free agency 3+ seasons ago
    const cutoffSeason = currentSeason - 3;

    const { data: freeAgentsToArchive, error: fetchError } = await supabase
      .from("free_agents")
      .select("id, full_name, entered_free_agency_season")
      .eq("archived", false)
      .lte("entered_free_agency_season", cutoffSeason);

    if (fetchError) {
      console.error("Error fetching free agents to archive:", fetchError);
      return NextResponse.json(
        { error: "Failed to fetch free agents: " + fetchError.message },
        { status: 500 }
      );
    }

    if (!freeAgentsToArchive || freeAgentsToArchive.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No free agents to archive",
        archivedCount: 0,
      });
    }

    // Archive the players
    const idsToArchive = freeAgentsToArchive.map((fa) => fa.id);
    
    const { error: updateError } = await supabase
      .from("free_agents")
      .update({ archived: true })
      .in("id", idsToArchive);

    if (updateError) {
      console.error("Error archiving free agents:", updateError);
      return NextResponse.json(
        { error: "Failed to archive free agents: " + updateError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Archived ${freeAgentsToArchive.length} free agents who have been unsigned for 3+ seasons`,
      archivedCount: freeAgentsToArchive.length,
      archivedPlayers: freeAgentsToArchive.map((fa) => ({
        id: fa.id,
        name: fa.full_name,
        enteredSeason: fa.entered_free_agency_season,
      })),
    });
  } catch (error) {
    console.error("Error archiving free agents:", error);
    return NextResponse.json(
      { error: "Server error: " + (error instanceof Error ? error.message : "Unknown error") },
      { status: 500 }
    );
  }
}

