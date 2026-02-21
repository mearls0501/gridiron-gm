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

    // Archive free agents in free_agent_availability table (per save game)
    // Note: players table is seed data and should not be modified
    // This endpoint should be called per save game, or we need saveGameId parameter
    const { saveGameId } = await req.json();
    
    if (!saveGameId) {
      return NextResponse.json(
        { error: "saveGameId is required to archive free agents" },
        { status: 400 }
      );
    }

    // Find all non-archived free agents who entered free agency 3+ seasons ago
    const cutoffSeason = currentSeason - 3;

    const { data: freeAgentsToArchive, error: fetchError } = await supabase
      .from("free_agent_availability")
      .select(`
        id,
        player_id,
        entered_free_agency_season,
        players!inner (id, full_name)
      `)
      .eq("save_game_id", saveGameId)
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

    // Archive the free agents in free_agent_availability
    const idsToArchive = freeAgentsToArchive.map((fa) => fa.id);
    
    const { error: updateError } = await supabase
      .from("free_agent_availability")
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
        id: fa.player_id,
        name: (fa.players as any)?.full_name || "Unknown",
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

