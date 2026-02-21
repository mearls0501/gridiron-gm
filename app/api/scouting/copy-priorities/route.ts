import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase-client";
import { regenerateWeeklyPoints } from "@/lib/scouting/weekly-points";

/**
 * API endpoint to copy scout priorities from previous season to current season
 * and regenerate weekly points
 */
export async function POST(req: Request) {
  try {
    const { teamId, saveGameId, season, week } = await req.json();

    if (!teamId || !saveGameId || !season) {
      return NextResponse.json(
        { error: "teamId, saveGameId, and season are required" },
        { status: 400 }
      );
    }

    // Regenerate weekly points (which will copy priorities if needed)
    const result = await regenerateWeeklyPoints(
      teamId,
      saveGameId,
      season,
      week || 1
    );

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || "Failed to copy priorities" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Priorities copied and weekly points regenerated",
    });
  } catch (error) {
    console.error("Error copying priorities:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to copy priorities",
      },
      { status: 500 }
    );
  }
}


