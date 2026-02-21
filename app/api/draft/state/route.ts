import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase-client";

/**
 * Draft State Management API
 * GET: Fetch current draft state
 * POST: Initialize draft (start draft)
 * PATCH: Update draft state (advance pick, mark complete)
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const season = searchParams.get("season");
    const saveGameId = searchParams.get("saveGameId");

    if (!season || !saveGameId) {
      return NextResponse.json(
        { error: "season and saveGameId are required" },
        { status: 400 }
      );
    }

    const { data: draftState, error } = await supabase
      .from("draft_state")
      .select("*")
      .eq("save_game_id", saveGameId)
      .eq("season", parseInt(season))
      .maybeSingle();

    if (error) {
      console.error("Error fetching draft state:", error);
      return NextResponse.json(
        { error: "Failed to fetch draft state" },
        { status: 500 }
      );
    }

    // If no draft state exists, return default state
    if (!draftState) {
      return NextResponse.json({
        status: "not_started",
        season: parseInt(season),
        current_round: null,
        current_pick_overall: null,
        started_at: null,
        completed_at: null,
      });
    }

    return NextResponse.json(draftState);
  } catch (error) {
    console.error("Error in GET draft state:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const { season, saveGameId } = await req.json();

    if (!season || !saveGameId) {
      return NextResponse.json(
        { error: "season and saveGameId are required" },
        { status: 400 }
      );
    }

    // Check if draft state already exists
    const { data: existingState } = await supabase
      .from("draft_state")
      .select("id, status")
      .eq("save_game_id", saveGameId)
      .eq("season", season)
      .maybeSingle();

    if (existingState) {
      if (existingState.status === "in_progress") {
        return NextResponse.json(
          { error: "Draft is already in progress" },
          { status: 400 }
        );
      }
      if (existingState.status === "completed") {
        return NextResponse.json(
          { error: "Draft has already been completed" },
          { status: 400 }
        );
      }
    }

    // Get the first pick to determine starting position
    const { data: firstPick } = await supabase
      .from("draft_picks")
      .select("round, pick_overall")
      .eq("season", season)
      .eq("save_game_id", saveGameId)
      .order("pick_overall", { ascending: true })
      .limit(1)
      .single();

    if (!firstPick) {
      return NextResponse.json(
        { error: "No draft picks found for this season. Please initialize draft picks first." },
        { status: 400 }
      );
    }

    // Create or update draft state
    const draftStateData = {
      save_game_id: saveGameId,
      season: season,
      status: "in_progress",
      current_round: firstPick.round,
      current_pick_overall: firstPick.pick_overall,
      started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { data: draftState, error } = await supabase
      .from("draft_state")
      .upsert(draftStateData, {
        onConflict: "save_game_id,season",
      })
      .select()
      .single();

    if (error) {
      console.error("Error initializing draft state:", error);
      return NextResponse.json(
        { error: "Failed to initialize draft state" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      draftState,
    });
  } catch (error) {
    console.error("Error in POST draft state:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: Request) {
  try {
    const { season, saveGameId, current_round, current_pick_overall, status } = await req.json();

    if (!season || !saveGameId) {
      return NextResponse.json(
        { error: "season and saveGameId are required" },
        { status: 400 }
      );
    }

    const updateData: any = {
      updated_at: new Date().toISOString(),
    };

    if (current_round !== undefined) {
      updateData.current_round = current_round;
    }

    if (current_pick_overall !== undefined) {
      updateData.current_pick_overall = current_pick_overall;
    }

    if (status) {
      updateData.status = status;
      if (status === "completed") {
        updateData.completed_at = new Date().toISOString();
      }
    }

    const { data: draftState, error } = await supabase
      .from("draft_state")
      .update(updateData)
      .eq("save_game_id", saveGameId)
      .eq("season", season)
      .select()
      .single();

    if (error) {
      console.error("Error updating draft state:", error);
      return NextResponse.json(
        { error: "Failed to update draft state" },
        { status: 500 }
      );
    }

    if (!draftState) {
      return NextResponse.json(
        { error: "Draft state not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      draftState,
    });
  } catch (error) {
    console.error("Error in PATCH draft state:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

