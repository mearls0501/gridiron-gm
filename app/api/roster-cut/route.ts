import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase-client";

export async function POST(req: Request) {
  try {
    const { playerId, teamId, saveGameId } = await req.json();

    if (!playerId || !teamId || !saveGameId) {
      return NextResponse.json(
        { error: "playerId, teamId, and saveGameId are required" },
        { status: 400 }
      );
    }

    // Verify player/prospect is on the team
    const { data: assignment, error: assignmentError } = await supabase
      .from("player_team_assignments")
      .select("*")
      .or(`player_id.eq.${playerId},prospect_id.eq.${playerId}`)
      .eq("team_id", teamId)
      .eq("save_game_id", saveGameId)
      .maybeSingle();

    if (assignmentError) {
      console.error("Error checking player assignment:", assignmentError);
      return NextResponse.json(
        { error: assignmentError.message },
        { status: 500 }
      );
    }

    if (!assignment) {
      // Check if player is on team in base players table (seed players only)
      const { data: player, error: playerError } = await supabase
        .from("players")
        .select("id, team_id")
        .eq("id", playerId)
        .maybeSingle();

      if (playerError || !player || player.team_id !== teamId) {
        return NextResponse.json(
          { error: "Player or prospect not found on this team" },
          { status: 404 }
        );
      }
    }

    // Get player/prospect details
    const isProspect = assignment?.prospect_id === playerId;
    let player: any = null;
    
    if (isProspect) {
      const { data: prospect, error: prospectError } = await supabase
        .from("draft_prospects")
        .select("*")
        .eq("id", playerId)
        .eq("save_game_id", saveGameId)
        .maybeSingle();
      
      if (prospectError || !prospect) {
        return NextResponse.json(
          { error: "Prospect not found" },
          { status: 404 }
        );
      }
      player = prospect;
    } else {
      const { data: playerData, error: playerError } = await supabase
        .from("players")
        .select("*")
        .eq("id", playerId)
        .maybeSingle();

      if (playerError || !playerData) {
        return NextResponse.json(
          { error: "Player not found" },
          { status: 404 }
        );
      }
      player = playerData;
    }

    // Move player/prospect to free agency
    // 1. Delete from player_team_assignments (works for both player_id and prospect_id)
    const deleteFilter = isProspect 
      ? { prospect_id: playerId, save_game_id: saveGameId }
      : { player_id: playerId, save_game_id: saveGameId };
    
    const { error: deleteAssignmentError } = await supabase
      .from("player_team_assignments")
      .delete()
      .match(deleteFilter);

    if (deleteAssignmentError) {
      console.error("Error deleting player assignment:", deleteAssignmentError);
      return NextResponse.json(
        { error: deleteAssignmentError.message },
        { status: 500 }
      );
    }

    // 2. Add to free_agent_availability table
    // Note: We no longer update players.team_id - that's seed data
    // Team assignments are tracked in player_team_assignments only
    // Use prospect_id if it's a prospect, player_id if it's a player
    const availabilityData: any = {
      save_game_id: saveGameId,
      entered_free_agency_season: new Date().getFullYear(), // Current season
      reason: "cut",
      archived: false,
    };

    if (isProspect) {
      availabilityData.prospect_id = playerId;
    } else {
      availabilityData.player_id = playerId;
    }

    const { error: freeAgentError } = await supabase
      .from("free_agent_availability")
      .upsert(
        availabilityData,
        {
          onConflict: isProspect ? "save_game_id,prospect_id" : "save_game_id,player_id",
        }
      );

    if (freeAgentError) {
      console.error("Error adding to free agents:", freeAgentError);
      // Don't fail the operation if this fails
    }

    return NextResponse.json({
      success: true,
      message: `${player.first_name} ${player.last_name} has been cut and is now a free agent`,
    });
  } catch (error: unknown) {
    console.error("Error in POST /api/roster-cut:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

