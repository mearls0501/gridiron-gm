import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase-client";

export async function POST(req: Request) {
  try {
    const { teamId, prospectId, priorityLevel } = await req.json();

    if (!teamId || !prospectId || !priorityLevel) {
      return NextResponse.json(
        { error: "teamId, prospectId, and priorityLevel are required" },
        { status: 400 }
      );
    }

    const validLevels = ["high", "medium", "low", "ignore"];
    if (!validLevels.includes(priorityLevel)) {
      return NextResponse.json(
        { error: "Invalid priority level" },
        { status: 400 }
      );
    }

    // Get prospect to retrieve save_game_id
    const { data: prospect } = await supabase
      .from("draft_prospects")
      .select("save_game_id")
      .eq("id", prospectId)
      .single();

    // Check if priority already exists
    let existingQuery = supabase
      .from("scouting_priorities")
      .select("*")
      .eq("team_id", teamId)
      .eq("prospect_id", prospectId);
    
    // Filter by save_game_id if available (column might not exist if migration hasn't run)
    // We'll try the filter, but if it fails, we'll catch the error and retry without it
    let existing;
    try {
      if (prospect?.save_game_id) {
        existingQuery = existingQuery.eq("save_game_id", prospect.save_game_id);
      } else {
        existingQuery = existingQuery.is("save_game_id", null);
      }
      
      const { data, error } = await existingQuery.single();
      if (error && (error.message?.includes("save_game_id") || error.code === "42703")) {
        // Column doesn't exist, retry without save_game_id filter
        existingQuery = supabase
          .from("scouting_priorities")
          .select("*")
          .eq("team_id", teamId)
          .eq("prospect_id", prospectId);
        const { data: retryData } = await existingQuery.single();
        existing = retryData;
      } else if (error) {
        throw error;
      } else {
        existing = data;
      }
    } catch (err) {
      // If query fails, try without save_game_id filter
      const { data: retryData } = await supabase
        .from("scouting_priorities")
        .select("*")
        .eq("team_id", teamId)
        .eq("prospect_id", prospectId)
        .single();
      existing = retryData;
    }

    if (existing) {
      // Update existing priority
      const { data, error } = await supabase
        .from("scouting_priorities")
        .update({
          priority_level: priorityLevel,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id)
        .select()
        .single();

      if (error) throw error;
      return NextResponse.json({ success: true, priority: data });
    } else {
      // Create new priority
      const priorityData: Record<string, unknown> = {
        team_id: teamId,
        prospect_id: prospectId,
        priority_level: priorityLevel,
      };
      
      // Include save_game_id if prospect has it (column might not exist if migration hasn't run)
      if (prospect?.save_game_id !== undefined && prospect?.save_game_id !== null) {
        priorityData.save_game_id = prospect.save_game_id;
      }
      
      const { data, error } = await supabase
        .from("scouting_priorities")
        .insert(priorityData)
        .select()
        .single();

      if (error) throw error;
      return NextResponse.json({ success: true, priority: data });
    }
  } catch (error) {
    console.error("Error setting scouting priority:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to set priority" },
      { status: 500 }
    );
  }
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const teamId = searchParams.get("teamId");
    const season = searchParams.get("season");

    if (!teamId) {
      return NextResponse.json(
        { error: "teamId is required" },
        { status: 400 }
      );
    }

    const { searchParams } = new URL(req.url);
    const saveGameId = searchParams.get("saveGameId");
    
    let query = supabase
      .from("scouting_priorities")
      .select(`
        *,
        prospect:draft_prospects(*)
      `)
      .eq("team_id", teamId);
    
    // Filter by save_game_id if provided
    if (saveGameId) {
      query = query.eq("save_game_id", saveGameId);
    } else {
      query = query.is("save_game_id", null);
    }
    
    // Also filter draft_prospects by save_game_id in nested query
    if (saveGameId) {
      query = query.eq("prospect.save_game_id", saveGameId);
    } else {
      query = query.is("prospect.save_game_id", null);
    }

    if (season) {
      query = query.eq("prospect.season", parseInt(season, 10));
    }

    const { data: priorities, error } = await query.order("priority_level", {
      ascending: false,
    });

    if (error) throw error;

    return NextResponse.json({
      success: true,
      priorities: priorities || [],
    });
  } catch (error) {
    console.error("Error fetching scouting priorities:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch priorities" },
      { status: 500 }
    );
  }
}

