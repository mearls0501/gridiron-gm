import { NextResponse } from "next/server";
import { replenishAllRosters, replenishTeamRosterOnly } from "@/lib/utils/roster-replenisher";

/**
 * Replenish rosters to 53 players
 * Can replenish all teams or a specific team
 */
export async function POST(req: Request) {
  try {
    const { saveGameId, season, week, teamId } = await req.json();

    if (!saveGameId) {
      return NextResponse.json(
        { error: "saveGameId is required" },
        { status: 400 }
      );
    }

    // Get current season/week if not provided
    let currentSeason = season;
    let currentWeek = week;

    if (!currentSeason || !currentWeek) {
      // Try to get from seasons table
      const { supabase } = await import("@/lib/supabase-client");
      const { data: activeSeason } = await supabase
        .from("seasons")
        .select("year, current_week")
        .eq("save_game_id", saveGameId)
        .eq("is_active", true)
        .maybeSingle();

      if (activeSeason) {
        currentSeason = activeSeason.year;
        currentWeek = activeSeason.current_week;
      } else {
        // Defaults
        currentSeason = currentSeason || 2025;
        currentWeek = currentWeek || 0;
      }
    }

    if (teamId) {
      // Replenish single team
      const result = await replenishTeamRosterOnly(
        teamId,
        saveGameId,
        currentSeason,
        currentWeek
      );

      if (!result.success) {
        return NextResponse.json(
          {
            error: result.error || "Failed to replenish roster",
            beforeSize: result.beforeSize,
            afterSize: result.afterSize,
            playersAdded: result.playersAdded,
          },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        message: `Replenished ${result.playersAdded} players for team`,
        beforeSize: result.beforeSize,
        afterSize: result.afterSize,
        playersAdded: result.playersAdded,
      });
    } else {
      // Replenish all teams
      const result = await replenishAllRosters(
        saveGameId,
        currentSeason,
        currentWeek
      );

      if (!result.success && result.playersAdded === 0) {
        return NextResponse.json(
          {
            error: "Failed to replenish rosters",
            errors: result.errors,
            teamsProcessed: result.teamsProcessed,
            playersAdded: result.playersAdded,
          },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        message: `Replenished ${result.playersAdded} players across ${result.teamsProcessed} teams`,
        teamsProcessed: result.teamsProcessed,
        playersAdded: result.playersAdded,
        errors: result.errors,
        details: result.details,
      });
    }
  } catch (error) {
    console.error("Error replenishing rosters:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

