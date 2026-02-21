import { NextResponse } from "next/server";
import { validateAllRosters, validateTeamRoster } from "@/lib/utils/roster-validator";

/**
 * Validate rosters and optionally auto-fix
 * Used when user clicks "Auto Fix" button
 */
export async function POST(req: Request) {
  try {
    const { saveGameId, season, week, autoFix = false } = await req.json();

    if (!saveGameId) {
      return NextResponse.json(
        { error: "saveGameId is required" },
        { status: 400 }
      );
    }

    // Get current season/week if not provided
    let currentSeason = season;
    let currentWeek = week || 0;

    if (!currentSeason) {
      const { supabase } = await import("@/lib/supabase-client");
      const { data: activeSeason } = await supabase
        .from("seasons")
        .select("year, current_week")
        .eq("save_game_id", saveGameId)
        .eq("is_active", true)
        .maybeSingle();

      if (activeSeason) {
        currentSeason = activeSeason.year;
        currentWeek = activeSeason.current_week || 0;
      } else {
        currentSeason = 2025;
      }
    }

    // If autoFix is requested, replenish all invalid rosters
    if (autoFix) {
      console.log(`[RosterValidateFix] Auto-fix requested, replenishing all teams...`);
      const { replenishAllRosters } = await import("@/lib/utils/roster-replenisher");
      
      const replenishResult = await replenishAllRosters(
        saveGameId,
        currentSeason,
        currentWeek
      );

      if (replenishResult.success) {
        return NextResponse.json({
          success: true,
          message: `Successfully replenished ${replenishResult.teamsProcessed} teams`,
          playersAdded: replenishResult.playersAdded,
          details: replenishResult.details,
        });
      } else {
        return NextResponse.json(
          {
            success: false,
            error: "Auto-fix failed",
            message: "Failed to replenish rosters",
            errors: replenishResult.errors,
          },
          { status: 500 }
        );
      }
    }

    // Just validate (no auto-fix)
    const result = await validateAllRosters(
      saveGameId,
      currentSeason,
      currentWeek,
      false // Never auto-fix in validation-only mode
    );

    if (!result.allValid) {
      // Build detailed error message
      const invalidTeams = result.validations.filter(v => !v.isValid);
      const userTeam = invalidTeams.find(v => v.isUserTeam);
      const cpuTeams = invalidTeams.filter(v => !v.isUserTeam);
      
      let errorMessage = '';
      
      if (userTeam) {
        const needsMore = userTeam.needsPlayers > 0;
        errorMessage = `Your team (${userTeam.teamName}) has ${userTeam.currentSize} players (requires exactly 53). `;
        if (needsMore) {
          errorMessage += `Need to add ${userTeam.needsPlayers} more players.`;
        } else {
          errorMessage += `Need to cut ${Math.abs(userTeam.needsPlayers)} players.`;
        }
      }
      
      if (cpuTeams.length > 0) {
        if (errorMessage) errorMessage += '\n\n';
        errorMessage += `${cpuTeams.length} CPU team(s) also have invalid rosters.`;
      }

      return NextResponse.json(
        {
          success: false,
          error: "ROSTER_INVALID",
          message: errorMessage,
          invalidTeams: invalidTeams.map(t => ({
            teamId: t.teamId,
            teamName: t.teamName,
            currentSize: t.currentSize,
            needsPlayers: t.needsPlayers,
            isUserTeam: t.isUserTeam,
          })),
          canAutoFix: true,
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: result.allValid,
      message: result.allValid
        ? "All rosters are valid"
        : `Fixed ${result.cpuTeamsInvalid} CPU teams. ${result.userTeamInvalid ? "User team still needs fixing." : ""}`,
      validation: result,
    });
  } catch (error) {
    console.error("Error validating rosters:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * Validate a single team's roster
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const saveGameId = searchParams.get("saveGameId");
    const season = searchParams.get("season");
    const week = searchParams.get("week");
    const teamId = searchParams.get("teamId");

    if (!saveGameId || !season || !teamId) {
      return NextResponse.json(
        { error: "saveGameId, season, and teamId are required" },
        { status: 400 }
      );
    }

    const validation = await validateTeamRoster(
      teamId,
      saveGameId,
      parseInt(season),
      parseInt(week || "0")
    );

    return NextResponse.json({ validation });
  } catch (error) {
    console.error("Error validating team roster:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

