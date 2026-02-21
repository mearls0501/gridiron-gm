import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase-client";

/**
 * Initialize coach assignments for a new save game
 * Copies coach assignments from the coaches seed table to coach_team_assignments
 */
export async function POST(req: Request) {
  try {
    const { saveGameId, season } = await req.json();

    if (!saveGameId) {
      return NextResponse.json(
        { error: "saveGameId is required" },
        { status: 400 }
      );
    }

    console.log(`[Initialize Coaches] Starting for save game: ${saveGameId}`);

    // Get all coaches with their seed team assignments
    const { data: coaches, error: coachesError } = await supabase
      .from("coaches")
      .select("id, team_id, role")
      .not("team_id", "is", null); // Only coaches assigned to teams

    if (coachesError) {
      console.error("[Initialize Coaches] Error fetching coaches:", coachesError);
      return NextResponse.json(
        { error: `Failed to fetch coaches: ${coachesError.message}` },
        { status: 500 }
      );
    }

    if (!coaches || coaches.length === 0) {
      return NextResponse.json(
        { error: "No coaches found in seed data. Please seed coaches first." },
        { status: 400 }
      );
    }

    console.log(`[Initialize Coaches] Found ${coaches.length} coaches to assign`);

    // Create coach_team_assignments for each coach
    const assignments = coaches.map((coach) => ({
      coach_id: coach.id,
      team_id: coach.team_id!,
      save_game_id: saveGameId,
      assigned_reason: "initial",
      season: season || 2025,
      week: 0,
    }));

    // Insert in batches
    const batchSize = 100;
    let assignmentsCreated = 0;

    for (let i = 0; i < assignments.length; i += batchSize) {
      const batch = assignments.slice(i, i + batchSize);

      const { error: insertError } = await supabase
        .from("coach_team_assignments")
        .insert(batch);

      if (insertError) {
        console.error(`[Initialize Coaches] Error inserting batch ${i / batchSize}:`, insertError);
        // Continue with next batch rather than failing completely
      } else {
        assignmentsCreated += batch.length;
      }
    }

    console.log(`[Initialize Coaches] Created ${assignmentsCreated} coach assignments`);

    return NextResponse.json({
      success: true,
      assignmentsCreated,
      message: `Successfully initialized ${assignmentsCreated} coach assignments for save game`,
    });
  } catch (error) {
    console.error("[Initialize Coaches] Unexpected error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}



