import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase-client";

/**
 * Mark draft as complete and move undrafted prospects to free agency
 */
export async function POST(req: Request) {
  try {
    const { season: requestedSeason, saveGameId } = await req.json();

    if (!saveGameId) {
      return NextResponse.json(
        { error: "saveGameId is required" },
        { status: 400 }
      );
    }

    // First, find the season from draft_picks that have been made
    // This ensures we're using the correct season (draft season equals current season)
    let draftPicksQuery = supabase
      .from("draft_picks")
      .select("season, selected_player_id")
      .eq("save_game_id", saveGameId)
      .not("selected_player_id", "is", null)
      .order("season", { ascending: false })
      .limit(10); // Get multiple to see all seasons with picks

    const { data: draftPicksWithSeasons, error: pickSeasonError } = await draftPicksQuery;

    if (pickSeasonError) {
      console.error("Error finding draft season:", pickSeasonError);
    }

    // Find the most recent season with drafted picks
    const latestDraftPick = draftPicksWithSeasons?.[0];
    const season = latestDraftPick?.season || requestedSeason;

    if (!season || typeof season !== "number") {
      return NextResponse.json(
        { error: "Could not determine draft season. Please ensure draft picks exist." },
        { status: 400 }
      );
    }

    console.log(`[Draft Complete] Found picks for seasons:`, draftPicksWithSeasons?.map(p => p.season));
    console.log(`[Draft Complete] Using season ${season} (requested: ${requestedSeason}, saveGameId: ${saveGameId})`);

    // Get all draft picks for this season and save game
    draftPicksQuery = supabase
      .from("draft_picks")
      .select("selected_player_id")
      .eq("season", season)
      .eq("save_game_id", saveGameId)
      .not("selected_player_id", "is", null);
    
    if (saveGameId) {
      draftPicksQuery = draftPicksQuery.eq("save_game_id", saveGameId);
    } else {
      draftPicksQuery = draftPicksQuery.is("save_game_id", null);
    }
    
    const { data: draftPicks, error: picksError } = await draftPicksQuery;

    if (picksError) {
      console.error("Error fetching draft picks:", picksError);
      return NextResponse.json(
        { error: "Failed to fetch draft picks" },
        { status: 500 }
      );
    }

    const draftedProspectIds = new Set(
      draftPicks?.map((p) => p.selected_player_id).filter((id) => id !== null) || []
    );

    // Get all prospects for this season and save game
    let prospectsQuery = supabase
      .from("draft_prospects")
      .select("id, full_name, position, age, college, archetype, overall, potential, traits")
      .eq("season", season);
    
    if (saveGameId) {
      prospectsQuery = prospectsQuery.eq("save_game_id", saveGameId);
    } else {
      prospectsQuery = prospectsQuery.is("save_game_id", null);
    }
    
    const { data: allProspects, error: prospectsError } = await prospectsQuery;

    if (prospectsError) {
      console.error("Error fetching prospects:", prospectsError);
      return NextResponse.json(
        { error: "Failed to fetch prospects" },
        { status: 500 }
      );
    }

    // Find undrafted prospects
    const undraftedProspects = (allProspects || []).filter(
      (p) => !draftedProspectIds.has(p.id)
    );

    if (undraftedProspects.length === 0) {
      return NextResponse.json({
        success: true,
        message: "All prospects have been drafted",
        undraftedCount: 0,
      });
    }

    // Move undrafted prospects to free agency
    const freeAgentsToInsert = undraftedProspects.map((prospect) => ({
      id: prospect.id,
      full_name: prospect.full_name,
      position: prospect.position,
      age: prospect.age,
      college: prospect.college || null,
      archetype: prospect.archetype || null,
      overall: prospect.overall,
      potential: prospect.potential,
      traits: prospect.traits || {},
      entered_free_agency_season: season,
      archived: false,
    }));

    const { error: insertFAError } = await supabase
      .from("free_agents")
      .upsert(freeAgentsToInsert, {
        onConflict: "id",
        ignoreDuplicates: false,
      });

    if (insertFAError) {
      console.error("Error moving prospects to free agency:", insertFAError);
      return NextResponse.json(
        { error: `Failed to move undrafted prospects to free agency: ${insertFAError.message}` },
        { status: 500 }
      );
    }

    // Log transactions for undrafted players
    const transactions = undraftedProspects.map((prospect) => ({
      player_id: prospect.id,
      team_id: null,
      transaction_type: "undrafted_free_agent",
      season: season,
      details: JSON.stringify({
        player_name: prospect.full_name,
        position: prospect.position,
        reason: "Undrafted in NFL Draft",
      }),
    }));

    if (transactions.length > 0) {
      const { error: transactionError } = await supabase
        .from("transactions")
        .insert(transactions);

      if (transactionError) {
        console.error("Error logging transactions:", transactionError);
        // Don't fail the request if transaction logging fails
      }
    }

    // Populate draft_results for all drafted picks (if not already populated)
    const { data: allDraftedPicks } = await supabase
      .from("draft_picks")
      .select("id, selected_player_id, owning_team_id, season")
      .eq("season", season)
      .eq("save_game_id", saveGameId)
      .not("selected_player_id", "is", null);

    if (allDraftedPicks && allDraftedPicks.length > 0) {
      // Check which picks already have draft_results
      const { data: existingResults } = await supabase
        .from("draft_results")
        .select("draft_pick_id")
        .in("draft_pick_id", allDraftedPicks.map(p => p.id));

      const existingPickIds = new Set(
        (existingResults || []).map(r => r.draft_pick_id)
      );

      // Create draft_results for picks that don't have them
      const resultsToInsert = allDraftedPicks
        .filter(pick => !existingPickIds.has(pick.id))
        .map(pick => ({
          draft_pick_id: pick.id,
          prospect_id: pick.selected_player_id,
          player_id: pick.selected_player_id, // Same ID since we use prospect ID for player
          team_id: pick.owning_team_id,
          season: pick.season,
          signed_at: new Date().toISOString(),
          save_game_id: saveGameId,
        }));

      if (resultsToInsert.length > 0) {
        const { error: resultsError } = await supabase
          .from("draft_results")
          .insert(resultsToInsert);

        if (resultsError) {
          console.error("Error populating draft_results:", resultsError);
          // Don't fail if draft results population fails
        } else {
          console.log(`Populated ${resultsToInsert.length} draft_results entries`);
        }
      }
    }

    // Update or create draft state to mark as completed
    // First check if it exists
    const { data: existingDraftState } = await supabase
      .from("draft_state")
      .select("id")
      .eq("save_game_id", saveGameId)
      .eq("season", season)
      .maybeSingle();

    const draftStateData = {
      save_game_id: saveGameId,
      season: season,
      status: "completed",
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    let draftStateError;
    if (existingDraftState) {
      // Update existing
      const { error } = await supabase
        .from("draft_state")
        .update(draftStateData)
        .eq("id", existingDraftState.id);
      draftStateError = error;
    } else {
      // Create new
      const { error } = await supabase
        .from("draft_state")
        .insert(draftStateData);
      draftStateError = error;
    }

    if (draftStateError) {
      console.error("Error updating/creating draft_state:", draftStateError);
      return NextResponse.json(
        { error: `Failed to update draft state: ${draftStateError.message}` },
        { status: 500 }
      );
    } else {
      console.log(`[Draft Complete] ${existingDraftState ? 'Updated' : 'Created'} draft_state for season ${season} (saveGameId: ${saveGameId}) to completed`);
      
      // Verify it was created/updated
      const { data: verifyState } = await supabase
        .from("draft_state")
        .select("id, season, status, save_game_id")
        .eq("save_game_id", saveGameId)
        .eq("season", season)
        .maybeSingle();
      
      console.log(`[Draft Complete] Verification - draft_state record:`, verifyState);
    }

    return NextResponse.json({
      success: true,
      message: `Draft complete for season ${season}. ${undraftedProspects.length} undrafted prospects moved to free agency.`,
      draftedCount: draftedProspectIds.size,
      undraftedCount: undraftedProspects.length,
      season: season, // Return the season that was used
    });
  } catch (error) {
    console.error("Error completing draft:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

