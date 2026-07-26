import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase-client";
import { isMissingSupabaseTableError } from "@/lib/supabase-errors";

const MAX_ROSTER_SIZE = 53;

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const saveGameId = searchParams.get("saveGameId");
    const season = searchParams.get("season");
    const teamId = searchParams.get("teamId");

    if (!saveGameId || !season) {
      return NextResponse.json(
        { error: "saveGameId and season are required" },
        { status: 400 }
      );
    }

    if (teamId) {
      // Get validation for specific team
      const validation = await validateTeamRoster(teamId, saveGameId, parseInt(season));
      return NextResponse.json({ validation });
    } else {
      // Get validation for all teams
      const { data: teams, error: teamsError } = await supabase
        .from("teams")
        .select("id, name, abbreviation");

      if (teamsError) {
        console.error("Error fetching teams:", teamsError);
        return NextResponse.json(
          { error: teamsError.message },
          { status: 500 }
        );
      }

      const validations = await Promise.all(
        (teams || []).map((team) =>
          validateTeamRoster(team.id, saveGameId, parseInt(season))
        )
      );

      // Filter to only teams that need cuts
      const teamsNeedingCuts = validations.filter((v) => !v.is_valid);

      return NextResponse.json({
        validations,
        teamsNeedingCuts,
        allTeamsValid: teamsNeedingCuts.length === 0,
      });
    }
  } catch (error: unknown) {
    console.error("Error in GET /api/roster-validation:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const { saveGameId, season, teamId } = await req.json();

    if (!saveGameId || !season || !teamId) {
      return NextResponse.json(
        { error: "saveGameId, season, and teamId are required" },
        { status: 400 }
      );
    }

    const validation = await validateTeamRoster(teamId, saveGameId, parseInt(season));

    // Upsert validation
    const { data, error } = await supabase
      .from("roster_validation")
      .upsert(
        {
          save_game_id: saveGameId,
          team_id: teamId,
          season: parseInt(season),
          current_roster_size: validation.current_roster_size,
          max_roster_size: MAX_ROSTER_SIZE,
          is_valid: validation.is_valid,
          must_cut_count: validation.must_cut_count,
          checked_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: "save_game_id,team_id,season",
        }
      )
      .select()
      .single();

    if (error) {
      if (isMissingSupabaseTableError(error)) {
        return NextResponse.json({
          validation,
          notPersisted: true,
          schemaMissing: true,
          warning: "roster_validation table is missing. Apply supabase/migrations/20240101000046_create_game_settings.sql to persist roster validation history.",
        });
      }

      console.error("Error upserting roster validation:", error);
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ validation: data });
  } catch (error: unknown) {
    console.error("Error in POST /api/roster-validation:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

async function validateTeamRoster(teamId: string, saveGameId: string, season: number) {
  // Get current roster size using player_team_assignments (includes both players and prospects)
  const { data: assignments, error: assignmentsError } = await supabase
    .from("player_team_assignments")
    .select("player_id, prospect_id")
    .eq("team_id", teamId)
    .eq("save_game_id", saveGameId);

  let currentRosterSize = 0;

  if (!assignmentsError && assignments && assignments.length > 0) {
    // Count all assignments (both players and prospects)
    currentRosterSize = assignments.length;
  } else {
    // Fallback to players table (seed players only)
    const { count } = await supabase
      .from("players")
      .select("id", { count: "exact", head: true })
      .eq("team_id", teamId);

    currentRosterSize = count || 0;
  }

  const isValid = currentRosterSize <= MAX_ROSTER_SIZE;
  const mustCutCount = isValid ? 0 : currentRosterSize - MAX_ROSTER_SIZE;

  return {
    team_id: teamId,
    save_game_id: saveGameId,
    season,
    current_roster_size: currentRosterSize,
    max_roster_size: MAX_ROSTER_SIZE,
    is_valid: isValid,
    must_cut_count: mustCutCount,
  };
}

