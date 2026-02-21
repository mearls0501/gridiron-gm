import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase-client";

/**
 * Fix invalid player_team_assignments by deleting orphaned records
 * and replenishing rosters
 */
export async function POST(req: Request) {
  try {
    const { saveGameId, season, week } = await req.json();

    if (!saveGameId) {
      return NextResponse.json(
        { error: "saveGameId is required" },
        { status: 400 }
      );
    }

    console.log(`[FixInvalidAssignments] Fixing rosters for saveGameId: ${saveGameId}`);

    // Step 1: Find and delete invalid assignments
    const { data: allAssignments } = await supabase
      .from("player_team_assignments")
      .select(`
        id,
        player_id,
        prospect_id,
        team_id,
        players (id),
        draft_prospects (id)
      `)
      .eq("save_game_id", saveGameId);

    const invalidAssignments = (allAssignments || []).filter(
      (a: any) =>
        (a.player_id && !a.players) ||
        (a.prospect_id && !a.draft_prospects) ||
        (!a.player_id && !a.prospect_id)
    );

    let deletedCount = 0;
    if (invalidAssignments.length > 0) {
      const idsToDelete = invalidAssignments.map((a: any) => a.id);
      const { error: deleteError } = await supabase
        .from("player_team_assignments")
        .delete()
        .in("id", idsToDelete);

      if (deleteError) {
        console.error("Error deleting invalid assignments:", deleteError);
      } else {
        deletedCount = idsToDelete.length;
        console.log(`[FixInvalidAssignments] Deleted ${deletedCount} invalid assignments`);
      }
    }

    // Step 2: Replenish all rosters to 53
    const { replenishAllRosters } = await import("@/lib/utils/roster-replenisher");
    
    const replenishResult = await replenishAllRosters(
      saveGameId,
      season || 2025,
      week || 0
    );

    return NextResponse.json({
      success: true,
      deletedInvalidAssignments: deletedCount,
      replenishment: {
        playersAdded: replenishResult.playersAdded,
        teamsProcessed: replenishResult.teamsProcessed,
        details: replenishResult.details,
      },
      message: `Deleted ${deletedCount} invalid assignments and added ${replenishResult.playersAdded} players`,
    });
  } catch (error) {
    console.error("Error fixing invalid assignments:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}



