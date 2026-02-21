import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase-client";

/**
 * Diagnose roster issues - find invalid player_team_assignments
 * that don't have valid player or prospect data
 */
export async function POST(req: Request) {
  try {
    const { saveGameId } = await req.json();

    if (!saveGameId) {
      return NextResponse.json(
        { error: "saveGameId is required" },
        { status: 400 }
      );
    }

    console.log(`[DiagnoseRosters] Checking rosters for saveGameId: ${saveGameId}`);

    // Get all teams
    const { data: teams } = await supabase
      .from("teams")
      .select("id, name")
      .order("name");

    if (!teams) {
      return NextResponse.json(
        { error: "Failed to fetch teams" },
        { status: 500 }
      );
    }

    const results: any[] = [];
    let totalInvalidAssignments = 0;

    for (const team of teams) {
      // Get all assignments for this team
      const { data: assignments } = await supabase
        .from("player_team_assignments")
        .select(`
          id,
          player_id,
          prospect_id,
          team_id,
          players (id, full_name, position),
          draft_prospects (id, full_name, position)
        `)
        .eq("team_id", team.id)
        .eq("save_game_id", saveGameId);

      const assignmentCount = assignments?.length || 0;

      // Check for invalid assignments (ones that have neither valid player nor prospect)
      const invalidAssignments = (assignments || []).filter(
        (a: any) =>
          (a.player_id && !a.players) ||
          (a.prospect_id && !a.draft_prospects) ||
          (!a.player_id && !a.prospect_id)
      );

      // Count valid players (ones that will actually load)
      const validPlayers = (assignments || []).filter(
        (a: any) =>
          (a.player_id && a.players) || (a.prospect_id && a.draft_prospects)
      );

      totalInvalidAssignments += invalidAssignments.length;

      results.push({
        teamId: team.id,
        teamName: team.name,
        totalAssignments: assignmentCount,
        validPlayers: validPlayers.length,
        invalidAssignments: invalidAssignments.length,
        invalidDetails: invalidAssignments.map((a: any) => ({
          assignmentId: a.id,
          playerId: a.player_id,
          prospectId: a.prospect_id,
          hasPlayerData: !!a.players,
          hasProspectData: !!a.draft_prospects,
        })),
        rosterStatus:
          validPlayers.length === 53
            ? "✅ Valid"
            : validPlayers.length < 53
              ? `⚠️ Under (needs ${53 - validPlayers.length})`
              : `⚠️ Over (cut ${validPlayers.length - 53})`,
      });
    }

    return NextResponse.json({
      success: true,
      saveGameId,
      totalInvalidAssignments,
      teams: results,
      summary: {
        teamsValid: results.filter((r) => r.validPlayers === 53).length,
        teamsUnder: results.filter((r) => r.validPlayers < 53).length,
        teamsOver: results.filter((r) => r.validPlayers > 53).length,
      },
    });
  } catch (error) {
    console.error("Error diagnosing rosters:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}



