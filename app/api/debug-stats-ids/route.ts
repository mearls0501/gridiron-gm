import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase-client";

/**
 * Debug endpoint to check what player_ids are in stats and if they exist
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const saveGameId = url.searchParams.get('saveGameId');
    const season = parseInt(url.searchParams.get('season') || '2026');

    if (!saveGameId) {
      return NextResponse.json({ error: "saveGameId required" }, { status: 400 });
    }

    // Get a sample of stats
    const { data: stats } = await supabase
      .from("player_game_stats")
      .select("player_id")
      .eq("save_game_id", saveGameId)
      .eq("season", season)
      .limit(10);

    if (!stats || stats.length === 0) {
      return NextResponse.json({ message: "No stats found" });
    }

    const playerIds = [...new Set(stats.map(s => s.player_id))];

    // Check players table
    const { data: playersData } = await supabase
      .from("players")
      .select("id, full_name")
      .in("id", playerIds);

    // Check draft_prospects table
    const { data: prospectsData } = await supabase
      .from("draft_prospects")
      .select("id, full_name")
      .in("id", playerIds);

    // Check player_team_assignments to see the structure
    const { data: assignments } = await supabase
      .from("player_team_assignments")
      .select("player_id, prospect_id")
      .eq("save_game_id", saveGameId)
      .limit(5);

    const foundInPlayers = new Set(playersData?.map(p => p.id) || []);
    const foundInProspects = new Set(prospectsData?.map(p => p.id) || []);

    return NextResponse.json({
      stats_player_ids: playerIds,
      found_in_players: playersData?.length || 0,
      found_in_prospects: prospectsData?.length || 0,
      missing: playerIds.filter(id => !foundInPlayers.has(id) && !foundInProspects.has(id)),
      sample_assignments: assignments,
      diagnosis: playerIds.every(id => foundInPlayers.has(id)) ? 
        "All IDs are from players table" :
        playerIds.every(id => foundInProspects.has(id)) ?
        "All IDs are from draft_prospects table" :
        playerIds.every(id => !foundInPlayers.has(id) && !foundInProspects.has(id)) ?
        "PROBLEM: IDs don't exist in either table - they might be assignment IDs!" :
        "Mixed: Some from players, some from prospects",
    });

  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}



