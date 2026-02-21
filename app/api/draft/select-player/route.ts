import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase-client";
import { generateContract } from "@/lib/contract-generator";

/**
 * Select a player in the draft
 * Validates scouting completion before allowing selection
 */
export async function POST(req: Request) {
  try {
    const { teamId, prospectId, pickId, season, saveGameId } = await req.json();

    if (!teamId || !prospectId || !pickId) {
      return NextResponse.json(
        { error: "teamId, prospectId, and pickId are required" },
        { status: 400 }
      );
    }

    if (!saveGameId) {
      return NextResponse.json(
        { error: "saveGameId is required" },
        { status: 400 }
      );
    }

    // Validate scouting is complete (only for teams that have scouted prospects)
    // CPU teams may not have scouted prospects, so we check first
    let scoutedProspectsQuery = supabase
      .from("scouted_prospects")
      .select("id")
      .eq("team_id", teamId)
      .limit(1);
    
    if (saveGameId) {
      scoutedProspectsQuery = scoutedProspectsQuery.eq("save_game_id", saveGameId);
    } else {
      scoutedProspectsQuery = scoutedProspectsQuery.is("save_game_id", null);
    }
    
    const { data: scoutedProspects } = await scoutedProspectsQuery;
    
    // Only validate scouting if the team has scouted prospects (user teams)
    // CPU teams with no scouted prospects can draft without validation
    if (scoutedProspects && scoutedProspects.length > 0) {
      const { validateScoutingComplete } = await import("@/lib/scouting/validator");
      const scoutingValidation = await validateScoutingComplete(teamId, season, saveGameId);

      if (!scoutingValidation.isValid) {
        return NextResponse.json(
          {
            error: "Scouting requirements not met. Please complete scouting before drafting.",
            scoutingValidation: scoutingValidation,
          },
          { status: 400 }
        );
      }
    }

    // Get draft pick
    const { data: draftPick, error: pickError } = await supabase
      .from("draft_picks")
      .select("*")
      .eq("id", pickId)
      .eq("owning_team_id", teamId)
      .eq("save_game_id", saveGameId)
      .single();

    if (pickError || !draftPick) {
      return NextResponse.json(
        { error: "Draft pick not found or not owned by this team" },
        { status: 404 }
      );
    }

    // Check if pick is already used
    if (draftPick.selected_player_id || draftPick.status === "used") {
      return NextResponse.json(
        { error: "This draft pick has already been used" },
        { status: 400 }
      );
    }

    // Get prospect
    const { data: prospect, error: prospectError } = await supabase
      .from("draft_prospects")
      .select("*")
      .eq("id", prospectId)
      .single();

    if (prospectError || !prospect) {
      return NextResponse.json(
        { error: "Prospect not found" },
        { status: 404 }
      );
    }

    // Check if prospect is already drafted
    const { data: alreadyDrafted, error: draftedError } = await supabase
      .from("draft_picks")
      .select("id")
      .eq("selected_player_id", prospectId)
      .eq("season", draftPick.season)
      .eq("save_game_id", saveGameId)
      .maybeSingle();

    if (alreadyDrafted) {
      return NextResponse.json(
        { error: "This prospect has already been drafted" },
        { status: 400 }
      );
    }

    // Get scouting report if available (for more accurate ratings)
    // Use new scouted_prospects table instead of old scouting_reports
    let scoutedQuery = supabase
      .from("scouted_prospects")
      .select("est_overall_low, est_overall_high, est_potential_low, est_potential_high")
      .eq("team_id", teamId)
      .eq("prospect_id", prospectId);
    
    if (saveGameId) {
      scoutedQuery = scoutedQuery.eq("save_game_id", saveGameId);
    } else {
      scoutedQuery = scoutedQuery.is("save_game_id", null);
    }
    
    const { data: scoutingReport } = await scoutedQuery.single();

    // Use scouted ratings if available, otherwise use prospect's base ratings
    // Calculate average of low/high estimates if available
    const overall = scoutingReport?.est_overall_low && scoutingReport?.est_overall_high
      ? Math.round((scoutingReport.est_overall_low + scoutingReport.est_overall_high) / 2)
      : prospect.overall;
    const potential = scoutingReport?.est_potential_low && scoutingReport?.est_potential_high
      ? Math.round((scoutingReport.est_potential_low + scoutingReport.est_potential_high) / 2)
      : prospect.potential;

    // Generate rookie contract based on draft position
    // Higher picks get better contracts
    const draftPosition = draftPick.pick_overall;
    const contractMultiplier = Math.max(0.5, 1 - (draftPosition - 1) / 256); // Scale from 1.0 (pick 1) to ~0.5 (pick 256)
    const adjustedOverall = 60 + (overall - 60) * contractMultiplier; // Adjust overall for contract calculation
    const contract = generateContract(prospect.position, adjustedOverall);

    // Create player record from prospect
    const playerData = {
      id: prospect.id,
      full_name: prospect.full_name,
      position: prospect.position,
      age: prospect.age,
      college: prospect.college || null,
      archetype: prospect.archetype || null,
      overall: overall,
      potential: potential,
      traits: prospect.traits || {},
      team_id: teamId,
      contract_year_1: contract.contract_year_1,
      contract_year_2: contract.contract_year_2,
      contract_year_3: contract.contract_year_3,
      contract_year_4: contract.contract_year_4,
      signing_bonus: contract.signing_bonus,
    };

    // Insert player (use upsert in case player already exists)
    const { error: playerError } = await supabase
      .from("players")
      .upsert(playerData, { onConflict: "id" });

    if (playerError) {
      console.error("Error creating player:", playerError);
      return NextResponse.json(
        { error: `Failed to create player: ${playerError.message}` },
        { status: 500 }
      );
    }

    // Update draft pick to mark as used
    const { error: updatePickError } = await supabase
      .from("draft_picks")
      .update({
        selected_player_id: prospectId,
        status: "used",
        updated_at: new Date().toISOString(),
      })
      .eq("id", pickId);

    if (updatePickError) {
      console.error("Error updating draft pick:", updatePickError);
      // Player is already created, so continue
    }

    // Log transaction
    const { data: activeSeason } = await supabase
      .from("seasons")
      .select("year")
      .eq("is_active", true)
      .single();

    const currentSeason = activeSeason?.year || 2025;

    const { error: transactionError } = await supabase
      .from("transactions")
      .insert({
        player_id: prospectId,
        team_id: teamId,
        transaction_type: "drafted",
        season: currentSeason,
        details: JSON.stringify({
          player_name: prospect.full_name,
          position: prospect.position,
          draft_pick: draftPick.pick_overall,
          round: draftPick.round,
          contract: contract,
        }),
      });

    if (transactionError) {
      console.error("Error logging transaction:", transactionError);
      // Don't fail the request if transaction logging fails
    }

    // Create draft_results entry
    const { error: draftResultError } = await supabase
      .from("draft_results")
      .upsert({
        draft_pick_id: pickId,
        prospect_id: prospectId,
        player_id: prospectId, // Same ID since we use prospect ID for player
        team_id: teamId,
        season: draftPick.season,
        signed_at: new Date().toISOString(),
        save_game_id: saveGameId,
      }, {
        onConflict: "draft_pick_id",
      });

    if (draftResultError) {
      console.error("Error creating draft result:", draftResultError);
      // Don't fail the request if draft result logging fails
    }

    // Update draft state to advance to next pick
    const { data: nextPick } = await supabase
      .from("draft_picks")
      .select("round, pick_overall")
      .eq("season", draftPick.season)
      .eq("save_game_id", saveGameId)
      .gt("pick_overall", draftPick.pick_overall)
      .is("selected_player_id", null)
      .order("pick_overall", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (nextPick) {
      // Update draft state with next pick
      await supabase
        .from("draft_state")
        .update({
          current_round: nextPick.round,
          current_pick_overall: nextPick.pick_overall,
          updated_at: new Date().toISOString(),
        })
        .eq("save_game_id", saveGameId)
        .eq("season", draftPick.season);
    } else {
      // No more picks, mark draft as completed
      await supabase
        .from("draft_state")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("save_game_id", saveGameId)
        .eq("season", draftPick.season);
    }

    return NextResponse.json({
      success: true,
      message: `Successfully drafted ${prospect.full_name} with pick ${draftPick.pick_overall}`,
      player: {
        id: prospectId,
        name: prospect.full_name,
        position: prospect.position,
        overall: overall,
        potential: potential,
      },
      draftPick: {
        id: pickId,
        pick_overall: draftPick.pick_overall,
        round: draftPick.round,
      },
      contract: contract,
    });
  } catch (error) {
    console.error("Error selecting player in draft:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

