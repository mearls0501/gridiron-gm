import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase-client";
import { ensureScheduleExists } from "@/lib/utils/schedule";
import { getOrCreateSeason, deactivateSeason, updateSeasonPhase } from "@/lib/seasons/season-manager";

/**
 * Advance from offseason to new season
 * Creates new season, generates schedule, initializes rosters, etc.
 */
export async function POST(req: Request) {
  try {
    const { season, saveGameId } = await req.json();

    if (!season || typeof season !== "number") {
      return NextResponse.json(
        { error: "Season is required and must be a number" },
        { status: 400 }
      );
    }

    if (!saveGameId) {
      return NextResponse.json(
        { error: "saveGameId is required" },
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
      .eq("save_game_id", saveGameId)
      .limit(1);

    if (picksError && picksError.code !== "PGRST116") {
      console.error("Error checking draft:", picksError);
    }

    // Note: We don't require draft to be complete - user can advance even if draft isn't done
    // This allows flexibility

    // Step 2: Get or create current season using season manager
    const currentSeasonResult = await getOrCreateSeason(
      season,
      saveGameId || null,
      {
        phase: "offseason",
        currentWeek: 23,
        isActive: true,
      }
    );

    if (currentSeasonResult.error || !currentSeasonResult.season) {
      console.error("Error getting/creating current season:", currentSeasonResult.error);
      return NextResponse.json(
        { error: currentSeasonResult.error || "Failed to get or create current season" },
        { status: 500 }
      );
    }

    let currentSeason = currentSeasonResult.season;

    // If season is not in offseason, automatically transition it
    // This allows users to advance even if they haven't explicitly gone through the offseason phase
    if (currentSeason.phase !== "offseason") {
      console.log(`[Advance to Season] Season ${season} is in ${currentSeason.phase} phase, transitioning to offseason...`);
      
      const phaseUpdateResult = await updateSeasonPhase(season, saveGameId || null, "offseason", 23);
      
      if (!phaseUpdateResult.success) {
        console.error("Error transitioning to offseason:", phaseUpdateResult.error);
        return NextResponse.json(
          { error: phaseUpdateResult.error || `Failed to transition season ${season} to offseason phase` },
          { status: 500 }
        );
      }
      
      // Refresh currentSeason data
      const refreshResult = await getOrCreateSeason(season, saveGameId || null, {
        phase: "offseason",
        currentWeek: 23,
        isActive: true,
      });
      
      if (refreshResult.season) {
        currentSeason = refreshResult.season;
      }
    }

    // Step 3: Deactivate old season first (before creating new one)
    const deactivateResult = await deactivateSeason(season, saveGameId || null);
    if (!deactivateResult.success) {
      // Don't fail - we can continue even if deactivation fails
      console.warn(`[Advance to Season] Warning: Failed to deactivate old season ${season}, but continuing...`);
    }

    // Step 4: Get or create new season using season manager
    const newSeasonResult = await getOrCreateSeason(
      newSeason,
      saveGameId || null,
      {
        phase: "preseason",
        currentWeek: 0,
        isActive: true,
      }
    );

    if (newSeasonResult.error || !newSeasonResult.season) {
      console.error("Error getting/creating new season:", newSeasonResult.error);
      return NextResponse.json(
        { error: newSeasonResult.error || `Failed to get or create new season ${newSeason}` },
        { status: 500 }
      );
    }

    const newSeasonRecord = newSeasonResult.season;
    console.log(`[Advance to Season] ${newSeasonResult.created ? 'Created' : 'Retrieved'} new season ${newSeason}`);

    // Step 5: Generate new season schedule
    console.log(`[Advance to Season] Generating schedule for ${newSeason}...`);
    const scheduleResult = await ensureScheduleExists(newSeason, saveGameId);
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

    // Step 7: Ensure draft picks exist for future seasons (maintain 5 seasons ahead)
    // Check what draft picks we have and ensure we have picks for newSeason + 1 through newSeason + 5
    const maxFutureSeason = newSeason + 5;
    const seasonsToCheck: number[] = [];
    for (let s = newSeason + 1; s <= maxFutureSeason; s++) {
      seasonsToCheck.push(s);
    }

    const { data: existingPicks, error: picksCheckError } = await supabase
      .from("draft_picks")
      .select("season")
      .eq("save_game_id", saveGameId)
      .in("season", seasonsToCheck);

    if (picksCheckError && picksCheckError.code !== "PGRST116") {
      console.error("Error checking draft picks:", picksCheckError);
    }

    // Find which seasons are missing picks
    const existingSeasons = new Set(
      (existingPicks || []).map((p) => p.season)
    );
    const missingSeasons = seasonsToCheck.filter(
      (s) => !existingSeasons.has(s)
    );

    let draftPicksInitialized = false;
    let picksCreated = 0;

    // Initialize picks for any missing seasons
    if (missingSeasons.length > 0) {
      console.log(
        `[Advance to Season] Initializing draft picks for seasons: ${missingSeasons.join(", ")}...`
      );
      try {
        // Use the earliest missing season as the base, and calculate how many future seasons we need
        const baseSeason = Math.min(...missingSeasons);
        const maxSeason = Math.max(...missingSeasons);
        const futureSeasonsNeeded = maxSeason - baseSeason;

        // Call initialize-draft-picks to create picks for all missing seasons
        const initResponse = await fetch(
          `${process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"}/api/initialize-draft-picks`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              season: baseSeason,
              saveGameId: saveGameId,
              futureSeasons: futureSeasonsNeeded,
            }),
          }
        );

        if (initResponse.ok) {
          const initData = await initResponse.json();
          picksCreated = initData.picksCreated || 0;
          draftPicksInitialized = picksCreated > 0;
          console.log(
            `[Advance to Season] Draft picks initialized: ${picksCreated} picks created`
          );
        } else {
          const initError = await initResponse.json();
          console.warn(
            `[Advance to Season] Failed to initialize draft picks: ${initError.error || "Unknown error"}`
          );
          // Don't fail the advance if draft picks fail - can be done manually
        }
      } catch (initErr) {
        console.error(
          "[Advance to Season] Error initializing draft picks:",
          initErr
        );
        // Don't fail the advance if draft picks fail
      }
    } else {
      console.log(
        `[Advance to Season] Draft picks already exist for seasons ${seasonsToCheck.join(", ")}`
      );
      draftPicksInitialized = true; // Picks already exist
    }

    // Step 8: Generate new draft class for the new season's draft
    // This is done in preseason - prospects are generated now and scouted during the season
    // Year 1 preseason generates Year 1 prospects
    const draftSeason = newSeason;
    const { data: existingDraftClass, error: draftClassError } = await supabase
      .from("draft_prospects")
      .select("id")
      .eq("season", draftSeason)
      .eq("save_game_id", saveGameId)
      .limit(1);

    if (draftClassError && draftClassError.code !== "PGRST116") {
      console.error("Error checking draft class:", draftClassError);
    }

    if (!existingDraftClass || existingDraftClass.length === 0) {
      console.log(`[Advance to Season] Generating draft class for ${draftSeason} (preseason)...`);
      try {
        // Import and call the generate-draft-class logic directly
        const { generatePlayer, resetNameGenerator } = await import('@/lib/player-generator');
        
        resetNameGenerator();
        const prospects: any[] = [];
        
        // Generate 350 prospects with realistic talent distribution
        const eliteCount = 42;
        const midCount = 123;
        const lateCount = 133;
        const bustCount = 52;
        
        for (let i = 0; i < eliteCount; i++) {
          prospects.push(generatePlayer({ isProspect: true, talentTier: "elite" }));
        }
        for (let i = 0; i < midCount; i++) {
          prospects.push(generatePlayer({ isProspect: true, talentTier: "mid" }));
        }
        for (let i = 0; i < lateCount; i++) {
          prospects.push(generatePlayer({ isProspect: true, talentTier: "late" }));
        }
        for (let i = 0; i < bustCount; i++) {
          prospects.push(generatePlayer({ isProspect: true, talentTier: "bust" }));
        }
        
        // Shuffle prospects
        for (let i = prospects.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [prospects[i], prospects[j]] = [prospects[j], prospects[i]];
        }
        
        // Save prospects to database
        const prospectsToInsert = prospects.map((p) => ({
          season: draftSeason,
          save_game_id: saveGameId,
          full_name: p.full_name,
          position: p.position,
          age: p.age,
          college: p.college || null,
          archetype: p.archetype || null,
          overall: p.overall,
          potential: p.potential,
          traits: typeof p.traits === "string" ? JSON.parse(p.traits) : p.traits,
          is_free_agent: p.is_free_agent || false,
          contract_year_1: p.contract_year_1 || null,
          contract_year_2: p.contract_year_2 || null,
          contract_year_3: p.contract_year_3 || null,
          contract_year_4: p.contract_year_4 || null,
          signing_bonus: p.signing_bonus || null,
        }));
        
        // Delete existing prospects for this season and save_game_id
        await supabase
          .from("draft_prospects")
          .delete()
          .eq("season", draftSeason)
          .eq("save_game_id", saveGameId);
        
        // Insert in batches
        const batchSize = 100;
        let insertedCount = 0;
        for (let i = 0; i < prospectsToInsert.length; i += batchSize) {
          const batch = prospectsToInsert.slice(i, i + batchSize);
          const { error: batchError } = await supabase
            .from("draft_prospects")
            .insert(batch);
          
          if (batchError) {
            console.error(`[Advance to Season] Error inserting batch:`, batchError);
          } else {
            insertedCount += batch.length;
          }
        }
        
        console.log(`[Advance to Season] Successfully generated ${insertedCount} draft prospects for ${draftSeason}`);
      } catch (err) {
        console.error(`[Advance to Season] Error generating draft class:`, err);
        // Continue anyway - user can generate manually
      }
    } else {
      console.log(`[Advance to Season] Draft class for ${draftSeason} already exists`);
    }

    // Step 9: Archive old free agents
    console.log(`[Advance to Season] Archiving old free agents...`);
    // Note: Free agent archiving can be done manually via the archive endpoint

    // Step 10: Create season_weeks records for new season (all weeks 0-23)
    const seasonWeeks = Array.from({ length: 24 }, (_, i) => ({
      season_id: newSeasonRecord.id,
      week_number: i, // 0-23 (preseason, regular, playoffs, offseason)
      status: "scheduled",
      save_game_id: saveGameId || null,
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
        save_game_id: saveGameId || null,
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
        currentWeek: 0, // Preseason starts at week 0
      },
      summary: {
        scheduleGenerated: scheduleResult.success,
        draftPicksInitialized: draftPicksInitialized,
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

