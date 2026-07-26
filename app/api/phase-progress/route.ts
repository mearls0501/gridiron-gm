import { NextResponse } from "next/server";
import {
  requireUser,
  isRowLevelSecurityError,
  forbiddenSaveGameResponse,
} from "@/lib/auth/route-auth";
import { isMissingSupabaseTableError } from "@/lib/supabase-errors";

export async function GET(req: Request) {
  const auth = await requireUser(req);
  if (!auth.ok) return auth.response;
  const { supabase } = auth.context;

  try {
    const { searchParams } = new URL(req.url);
    const saveGameId = searchParams.get("saveGameId");
    const season = searchParams.get("season");
    const phase = searchParams.get("phase");

    if (!saveGameId || !season || !phase) {
      return NextResponse.json(
        { error: "saveGameId, season, and phase are required" },
        { status: 400 }
      );
    }

    // Get phase progress
    let query = supabase
      .from("phase_progress")
      .select("*")
      .eq("save_game_id", saveGameId)
      .eq("season", parseInt(season))
      .eq("phase", phase);

    const { data: progress, error } = await query.maybeSingle();

    if (error) {
      if (isMissingSupabaseTableError(error)) {
        console.warn("phase_progress table is missing; returning null progress");
        return NextResponse.json({ progress: null, schemaMissing: true });
      }

      console.error("Error fetching phase progress:", error);
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ progress });
  } catch (error: unknown) {
    console.error("Error in GET /api/phase-progress:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  const auth = await requireUser(req);
  if (!auth.ok) return auth.response;
  const { supabase } = auth.context;

  try {
    const { saveGameId, season, phase, offseasonWeek, tasks } = await req.json();

    if (!saveGameId || !season || !phase) {
      return NextResponse.json(
        { error: "saveGameId, season, and phase are required" },
        { status: 400 }
      );
    }

    // Calculate if all required tasks are completed
    const requiredTasksCompleted = tasks
      ? tasks.filter((t: { required: boolean }) => t.required)
          .every((t: { completed: boolean }) => t.completed)
      : false;

    // Upsert progress
    const progressData: Record<string, unknown> = {
      save_game_id: saveGameId,
      season: parseInt(season),
      phase,
      tasks: tasks || [],
      required_tasks_completed: requiredTasksCompleted,
      can_advance: requiredTasksCompleted,
      updated_at: new Date().toISOString(),
    };

    // Add offseason_week if provided
    if (phase === "offseason" && offseasonWeek !== undefined) {
      progressData.offseason_week = offseasonWeek;
    }

    const { data, error } = await supabase
      .from("phase_progress")
      .upsert(progressData, {
        onConflict: "save_game_id,season,phase,offseason_week",
      })
      .select()
      .single();

    if (error) {
      if (isMissingSupabaseTableError(error)) {
        return NextResponse.json(
          {
            progress: progressData,
            notPersisted: true,
            schemaMissing: true,
            error: "phase_progress table is missing. Apply supabase/migrations/20240101000046_create_game_settings.sql to persist phase progress.",
          },
          { status: 503 }
        );
      }

      if (isRowLevelSecurityError(error)) {
        return forbiddenSaveGameResponse();
      }

      console.error("Error upserting phase progress:", error);
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ progress: data });
  } catch (error: unknown) {
    console.error("Error in POST /api/phase-progress:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

