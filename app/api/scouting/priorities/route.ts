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

    // Check if priority already exists
    const { data: existing } = await supabase
      .from("scouting_priorities")
      .select("*")
      .eq("team_id", teamId)
      .eq("prospect_id", prospectId)
      .single();

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
      const { data, error } = await supabase
        .from("scouting_priorities")
        .insert({
          team_id: teamId,
          prospect_id: prospectId,
          priority_level: priorityLevel,
        })
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

    let query = supabase
      .from("scouting_priorities")
      .select(`
        *,
        prospect:draft_prospects(*)
      `)
      .eq("team_id", teamId);

    if (season) {
      query = query.eq("prospect.season", season);
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

