import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase-client";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const playerId = searchParams.get("playerId");
  const saveGameId = searchParams.get("saveGameId");

  if (!playerId) {
    return NextResponse.json(
      { error: "playerId parameter required" },
      { status: 400 }
    );
  }

  console.log(`[DiagnosePlayerID] Checking player ID: ${playerId}`);

  const result: Record<string, unknown> = {
    player_id: playerId,
    save_game_id: saveGameId,
  };

  // Check if ID exists in players table
  const { data: playerData, error: playerError } = await supabase
    .from("players")
    .select("id, full_name, position")
    .eq("id", playerId)
    .single();

  result.in_players_table = {
    found: !!playerData,
    data: playerData,
    error: playerError?.message,
  };

  // Check if ID exists in draft_prospects table
  const { data: prospectData, error: prospectError } = await supabase
    .from("draft_prospects")
    .select("id, full_name, position, draft_year")
    .eq("id", playerId)
    .single();

  result.in_prospects_table = {
    found: !!prospectData,
    data: prospectData,
    error: prospectError?.message,
  };

  // Check if ID exists in player_team_assignments
  let assignmentQuery = supabase
    .from("player_team_assignments")
    .select("id, player_id, prospect_id, team_id, teams(name)")
    .eq("id", playerId);

  if (saveGameId) {
    assignmentQuery = assignmentQuery.eq("save_game_id", saveGameId);
  }

  const { data: assignmentById, error: assignmentByIdError } =
    await assignmentQuery;

  result.assignment_by_id = {
    found: !!assignmentById && assignmentById.length > 0,
    count: assignmentById?.length || 0,
    data: assignmentById,
    error: assignmentByIdError?.message,
  };

  // Check if player_id or prospect_id references this ID
  let playerIdQuery = supabase
    .from("player_team_assignments")
    .select("id, player_id, prospect_id, team_id, teams(name)")
    .eq("player_id", playerId);

  if (saveGameId) {
    playerIdQuery = playerIdQuery.eq("save_game_id", saveGameId);
  }

  const { data: assignmentByPlayerId, error: assignmentByPlayerIdError } =
    await playerIdQuery;

  result.assignment_by_player_id = {
    found: !!assignmentByPlayerId && assignmentByPlayerId.length > 0,
    count: assignmentByPlayerId?.length || 0,
    data: assignmentByPlayerId,
    error: assignmentByPlayerIdError?.message,
  };

  let prospectIdQuery = supabase
    .from("player_team_assignments")
    .select("id, player_id, prospect_id, team_id, teams(name)")
    .eq("prospect_id", playerId);

  if (saveGameId) {
    prospectIdQuery = prospectIdQuery.eq("save_game_id", saveGameId);
  }

  const { data: assignmentByProspectId, error: assignmentByProspectIdError } =
    await prospectIdQuery;

  result.assignment_by_prospect_id = {
    found: !!assignmentByProspectId && assignmentByProspectId.length > 0,
    count: assignmentByProspectId?.length || 0,
    data: assignmentByProspectId,
    error: assignmentByProspectIdError?.message,
  };

  // Check stats for this player
  let statsQuery = supabase
    .from("player_game_stats")
    .select("id, player_id, game_id, week")
    .eq("player_id", playerId)
    .limit(5);

  if (saveGameId) {
    statsQuery = statsQuery.eq("save_game_id", saveGameId);
  }

  const { data: statsData, count: statsCount } = await statsQuery;

  result.stats = {
    count: statsCount,
    sample: statsData,
  };

  // Summary
  result.diagnosis = {
    is_player_id: !!playerData,
    is_prospect_id: !!prospectData,
    is_assignment_id: !!assignmentById && assignmentById.length > 0,
    issue:
      !playerData && !prospectData
        ? assignmentById && assignmentById.length > 0
          ? "ID is from player_team_assignments table, not players/prospects!"
          : "ID not found in any table!"
        : null,
  };

  return NextResponse.json(result, { status: 200 });
}

