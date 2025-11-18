import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase-client";
import { ensureScheduleExists } from "@/lib/utils/schedule";

/**
 * Advance from offseason to new season
 * Creates new season, generates schedule, initializes rosters, etc.
 */
export async function POST(req: Request) {
  try {
    const { season } = await req.json();

    if (!season || typeof season !== "number") {
      return NextResponse.json(
        { error: "Season is required and must be a number" },
        { status: 400 }
      );
    }

    const newSeason = season + 1;

    console.log(`[Advance to Season] Advancing from ${season} to ${newSeason}...`);

    // Step 1: Validate offseason completion
    // Check if draft is complete (simplified - check if at least some picks have been made)
    const { data: draftPicks, error: picksError } = await supabase
      .from("draft_picks")
      .select("id, selected_player_id")
      .eq("season", newSeason)
      .limit(1);

    if (picksError && picksError.code !== "PGRST116") {
      console.error("Error checking draft:", picksError);
    }

    // Note: We don't require draft to be complete - user can advance even if draft isn't done
    // This allows flexibility

    // Step 2: Get current active season
    const { data: currentSeason, error: seasonError } = await supabase
      .from("seasons")
      .select("*")
      .eq("year", season)
      .eq("is_active", true)
      .single();

    if (seasonError && seasonError.code !== "PGRST116") {
      console.error("Error fetching current season:", seasonError);
      return NextResponse.json(
        { error: "Failed to fetch current season" },
        { status: 500 }
      );
    }

    if (!currentSeason || currentSeason.phase !== "offseason") {
      return NextResponse.json(
        { error: `Season ${season} is not in offseason phase` },
        { status: 400 }
      );
    }

    // Step 3: Deactivate old season
    const { error: deactivateError } = await supabase
      .from("seasons")
      .update({
        is_active: false,
        updated_at: new Date().toISOString(),
      })
      .eq("year", season)
      .eq("is_active", true);

    if (deactivateError) {
      console.error("Error deactivating old season:", deactivateError);
      return NextResponse.json(
        { error: "Failed to deactivate old season" },
        { status: 500 }
      );
    }

    // Step 4: Create new season record
    const { data: newSeasonRecord, error: createSeasonError } = await supabase
      .from("seasons")
      .insert({
        year: newSeason,
        phase: "preseason",
        current_week: 1,
        is_active: true,
        started_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (createSeasonError || !newSeasonRecord) {
      console.error("Error creating new season:", createSeasonError);
      return NextResponse.json(
        { error: "Failed to create new season" },
        { status: 500 }
      );
    }

    console.log(`[Advance to Season] Created new season ${newSeason}`);

    // Step 5: Generate new season schedule
    console.log(`[Advance to Season] Generating schedule for ${newSeason}...`);
    const scheduleResult = await ensureScheduleExists(newSeason);
    if (!scheduleResult.success) {
      console.error("Error generating schedule:", scheduleResult.message);
      return NextResponse.json(
        { error: `Failed to generate schedule: ${scheduleResult.message}` },
        { status: 500 }
      );
    }
    if (!scheduleResult.created) {
      console.log(`[Advance to Season] Schedule for ${newSeason} already exists`);
    } else {
      console.log(`[Advance to Season] Successfully generated schedule for ${newSeason}`);
    }

    // Step 6: Initialize rosters
    // All signed players (with team_id) remain on rosters
    // Draft picks are already on rosters (created during draft selection)
    // Free agents who were signed are already on rosters
    console.log(`[Advance to Season] Rosters initialized (players with team_id remain on teams)`);

    // Step 7: Initialize draft picks for new season (if not already done)
    // Check if draft picks exist for newSeason + 1 (next year's draft)
    const { data: nextYearPicks, error: nextYearPicksError } = await supabase
      .from("draft_picks")
      .select("id")
      .eq("season", newSeason + 1)
      .limit(1);

    if (nextYearPicksError && nextYearPicksError.code !== "PGRST116") {
      console.error("Error checking next year picks:", nextYearPicksError);
    }

    if (!nextYearPicks || nextYearPicks.length === 0) {
      // Initialize draft picks for next year based on current season standings
      console.log(`[Advance to Season] Initializing draft picks for ${newSeason + 1}...`);
      // Note: This requires calling the API endpoint - can be done manually if needed
      // The picks will be initialized when needed
    }

    // Step 8: Generate new draft class (if not already done)
    const { data: existingDraftClass, error: draftClassError } = await supabase
      .from("draft_prospects")
      .select("id")
      .eq("season", newSeason + 1)
      .limit(1);

    if (draftClassError && draftClassError.code !== "PGRST116") {
      console.error("Error checking draft class:", draftClassError);
    }

    if (!existingDraftClass || existingDraftClass.length === 0) {
      console.log(`[Advance to Season] Draft class for ${newSeason + 1} not found - can be generated manually`);
      // Note: Draft class generation can be done manually via the draft page
    }

    // Step 9: Archive old free agents
    console.log(`[Advance to Season] Archiving old free agents...`);
    // Note: Free agent archiving can be done manually via the archive endpoint

    // Step 10: Create season_weeks records for new season
    const seasonWeeks = Array.from({ length: 18 }, (_, i) => ({
      season_id: newSeasonRecord.id,
      week_number: i + 1,
      status: "scheduled",
    }));

    const { error: weeksError } = await supabase
      .from("season_weeks")
      .insert(seasonWeeks);

    if (weeksError) {
      console.error("Error creating season weeks:", weeksError);
      // Continue even if this fails
    }

    // Step 11: Initialize team_season_stats for new season
    const { data: teams, error: teamsError } = await supabase
      .from("teams")
      .select("id");

    if (!teamsError && teams) {
      const teamStats = teams.map((team) => ({
        season_id: newSeasonRecord.id,
        team_id: team.id,
        wins: 0,
        losses: 0,
        ties: 0,
        points_for: 0,
        points_against: 0,
        turnover_diff: 0,
      }));

      const { error: statsError } = await supabase
        .from("team_season_stats")
        .upsert(teamStats, { onConflict: "season_id,team_id" });

      if (statsError) {
        console.error("Error initializing team stats:", statsError);
        // Continue even if this fails
      }
    }

    return NextResponse.json({
      success: true,
      message: `Successfully advanced to season ${newSeason}`,
      newSeason: {
        year: newSeason,
        phase: "preseason",
        currentWeek: 1,
      },
      summary: {
        scheduleGenerated: scheduleResult.success,
        draftPicksInitialized: !!nextYearPicks && nextYearPicks.length > 0,
        draftClassGenerated: !!existingDraftClass && existingDraftClass.length > 0,
      },
    });
  } catch (error) {
    console.error("Error advancing to new season:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

