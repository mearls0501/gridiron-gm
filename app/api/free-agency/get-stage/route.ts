import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase-client";

export async function POST(req: Request) {
  try {
    const { saveGameId, season } = await req.json();

    if (!saveGameId || !season) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Get current free agency stage
    const { data: stageData, error } = await supabase
      .from("free_agency_stage")
      .select("*")
      .eq("save_game_id", saveGameId)
      .eq("season", season)
      .maybeSingle();

    if (error) {
      console.error("Error fetching stage:", error);
      return NextResponse.json(
        { error: `Failed to fetch stage: ${error.message}` },
        { status: 500 }
      );
    }

    // If no stage exists, free agency hasn't started yet
    if (!stageData) {
      return NextResponse.json({
        success: true,
        stage: null,
        hasStarted: false,
      });
    }

    return NextResponse.json({
      success: true,
      stage: {
        currentStage: stageData.current_stage,
        status: stageData.stage_status,
        startedAt: stageData.started_at,
        completedAt: stageData.completed_at,
      },
      hasStarted: true,
    });
  } catch (error) {
    console.error("Error in get-stage:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}



