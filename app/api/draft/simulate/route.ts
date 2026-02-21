import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase-client";
import {
  selectCPUProspect,
  getNextPick,
  isCPUTeam,
} from "@/lib/draft/cpu-drafting";
import { generateContract } from "@/lib/contract-generator";

/**
 * Get the next available pick for a team (with round info)
 */
async function getNextPickWithRound(
  season: number,
  saveGameId: string,
  currentPickOverall: number
): Promise<{ pickId: string; teamId: string; pickOverall: number; round: number } | null> {
  const { data: nextPick } = await supabase
    .from("draft_picks")
    .select("id, owning_team_id, pick_overall, round")
    .eq("season", season)
    .eq("save_game_id", saveGameId)
    .gt("pick_overall", currentPickOverall)
    .is("selected_player_id", null)
    .order("pick_overall", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!nextPick) {
    return null;
  }

  return {
    pickId: nextPick.id,
    teamId: nextPick.owning_team_id,
    pickOverall: nextPick.pick_overall,
    round: nextPick.round,
  };
}

/**
 * Make a draft pick directly (without HTTP call)
 */
async function makeDraftPick(
  pickId: string,
  teamId: string,
  prospectId: string,
  season: number,
  saveGameId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Get draft pick
    const { data: draftPick, error: pickError } = await supabase
      .from("draft_picks")
      .select("*")
      .eq("id", pickId)
      .eq("owning_team_id", teamId)
      .eq("save_game_id", saveGameId)
      .single();

    if (pickError || !draftPick) {
      return { success: false, error: "Draft pick not found" };
    }

    // Check if pick is already used
    if (draftPick.selected_player_id || draftPick.status === "used") {
      return { success: false, error: "Pick already used" };
    }

    // Get prospect
    const { data: prospect, error: prospectError } = await supabase
      .from("draft_prospects")
      .select("*")
      .eq("id", prospectId)
      .single();

    if (prospectError || !prospect) {
      return { success: false, error: "Prospect not found" };
    }

    // Check if prospect is already drafted
    const { data: alreadyDrafted } = await supabase
      .from("draft_picks")
      .select("id")
      .eq("selected_player_id", prospectId)
      .eq("season", draftPick.season)
      .eq("save_game_id", saveGameId)
      .maybeSingle();

    if (alreadyDrafted) {
      return { success: false, error: "Prospect already drafted" };
    }

    // Get scouting report if available
    const { data: scoutingReport } = await supabase
      .from("scouted_prospects")
      .select("est_overall_low, est_overall_high, est_potential_low, est_potential_high")
      .eq("team_id", teamId)
      .eq("prospect_id", prospectId)
      .eq("save_game_id", saveGameId)
      .maybeSingle();

    // Use scouted ratings if available
    const overall = scoutingReport?.est_overall_low && scoutingReport?.est_overall_high
      ? Math.round((scoutingReport.est_overall_low + scoutingReport.est_overall_high) / 2)
      : prospect.overall;
    const potential = scoutingReport?.est_potential_low && scoutingReport?.est_potential_high
      ? Math.round((scoutingReport.est_potential_low + scoutingReport.est_potential_high) / 2)
      : prospect.potential;

    // Generate contract
    const draftPosition = draftPick.pick_overall;
    const contractMultiplier = Math.max(0.5, 1 - (draftPosition - 1) / 256);
    const adjustedOverall = 60 + (overall - 60) * contractMultiplier;
    const contract = generateContract(prospect.position, adjustedOverall);

    // Create player record
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

    const { error: playerError } = await supabase
      .from("players")
      .upsert(playerData, { onConflict: "id" });

    if (playerError) {
      return { success: false, error: `Failed to create player: ${playerError.message}` };
    }

    // Update draft pick
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
      return { success: false, error: `Failed to update draft pick: ${updatePickError.message}` };
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
      // Don't fail if draft result logging fails
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

    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

/**
 * Draft Simulation API
 * Simulates CPU picks until user's turn or full draft completion
 */
export async function POST(req: Request) {
  try {
    const { type, season, saveGameId, userTeamId } = await req.json();

    if (!season || !saveGameId) {
      return NextResponse.json(
        { error: "season and saveGameId are required" },
        { status: 400 }
      );
    }

    if (type !== "to_next_user_pick" && type !== "full_draft") {
      return NextResponse.json(
        { error: "type must be 'to_next_user_pick' or 'full_draft'" },
        { status: 400 }
      );
    }

    // Get current draft state
    const { data: draftState } = await supabase
      .from("draft_state")
      .select("*")
      .eq("save_game_id", saveGameId)
      .eq("season", season)
      .single();

    if (!draftState || draftState.status !== "in_progress") {
      return NextResponse.json(
        { error: "Draft is not in progress" },
        { status: 400 }
      );
    }

    let currentPickOverall = draftState.current_pick_overall || 1;
    const maxPicks = 224; // 7 rounds × 32 teams
    let picksMade = 0;
    const maxIterations = type === "full_draft" ? maxPicks : 100; // Safety limit

    // Get all available prospects
    let prospectsQuery = supabase
      .from("draft_prospects")
      .select("id, full_name, position, overall, potential, traits")
      .eq("season", season)
      .eq("save_game_id", saveGameId);

    const { data: allProspects } = await prospectsQuery.order("overall", {
      ascending: false,
    });

    if (!allProspects || allProspects.length === 0) {
      return NextResponse.json(
        { error: "No prospects available for draft" },
        { status: 400 }
      );
    }

    // Get all drafted prospect IDs
    const { data: draftedPicks } = await supabase
      .from("draft_picks")
      .select("selected_player_id")
      .eq("season", season)
      .eq("save_game_id", saveGameId)
      .not("selected_player_id", "is", null);

    const draftedProspectIds = new Set(
      (draftedPicks || []).map((p) => p.selected_player_id).filter(Boolean)
    );

    // Filter available prospects
    let availableProspects = allProspects.filter(
      (p) => !draftedProspectIds.has(p.id)
    );

    // Simulate picks
    for (let i = 0; i < maxIterations; i++) {
      // Get next pick with round info
      const nextPick = await getNextPickWithRound(season, saveGameId, currentPickOverall);

      if (!nextPick) {
        // No more picks, draft is complete
        console.log(`[Simulate] No more picks at iteration ${i}, draft complete`);
        break;
      }

      console.log(`[Simulate] Processing pick ${nextPick.pickOverall}, team ${nextPick.teamId}, userTeamId: ${userTeamId}`);

      // For "to_next_user_pick", stop if it's the user's turn
      if (type === "to_next_user_pick" && userTeamId) {
        const isCPU = isCPUTeam(nextPick.teamId, userTeamId);
        console.log(`[Simulate] Checking pick ${nextPick.pickOverall}: teamId=${nextPick.teamId}, userTeamId=${userTeamId}, isCPU=${isCPU}`);
        
        if (!isCPU) {
          // This is the user's team, stop simulation
          console.log(`[Simulate] Stopping - user's turn at pick ${nextPick.pickOverall}`);
          break;
        }
      }
      
      // For "full_draft", continue with all picks (including user picks)
      // We'll auto-pick for the user too using the same CPU logic

      // Select prospect (works for both CPU and user teams in full_draft mode)
      const selectedProspect = await selectCPUProspect(
        nextPick.teamId,
        availableProspects,
        saveGameId
      );

      if (!selectedProspect) {
        console.warn(`No available prospect for pick ${nextPick.pickOverall}`);
        break;
      }

      // Make the pick directly
      console.log(`[Simulate] Making pick ${nextPick.pickOverall} for team ${nextPick.teamId}, prospect ${selectedProspect.full_name}`);
      const pickResult = await makeDraftPick(
        nextPick.pickId,
        nextPick.teamId,
        selectedProspect.id,
        season,
        saveGameId
      );

      if (!pickResult.success) {
        console.error(`[Simulate] Failed to make pick ${nextPick.pickOverall}:`, pickResult.error);
        // Continue to next pick
        currentPickOverall = nextPick.pickOverall + 1;
        continue;
      }
      
      console.log(`[Simulate] Successfully made pick ${nextPick.pickOverall}`);

      // Update available prospects
      availableProspects = availableProspects.filter(
        (p) => p.id !== selectedProspect.id
      );
      draftedProspectIds.add(selectedProspect.id);

      // Update current pick (makeDraftPick already updated draft_state with next pick)
      currentPickOverall = nextPick.pickOverall + 1;
      picksMade++;

      // Check if draft is complete
      if (currentPickOverall > maxPicks) {
        // Mark draft as completed
        await supabase
          .from("draft_state")
          .update({
            status: "completed",
            completed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("save_game_id", saveGameId)
          .eq("season", season);
        break;
      }
      
      // Check if there are more picks
      const nextPickAfter = await getNextPickWithRound(season, saveGameId, currentPickOverall - 1);
      if (!nextPickAfter) {
        // No more picks, mark as completed
        await supabase
          .from("draft_state")
          .update({
            status: "completed",
            completed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("save_game_id", saveGameId)
          .eq("season", season);
        break;
      }

      // Small delay to prevent overwhelming the system
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    // Get updated draft state
    const { data: updatedState } = await supabase
      .from("draft_state")
      .select("*")
      .eq("save_game_id", saveGameId)
      .eq("season", season)
      .single();

    console.log(`[Simulate] Completed. Made ${picksMade} picks. Final state:`, updatedState);

    return NextResponse.json({
      success: true,
      picksMade,
      draftState: updatedState,
      message:
        type === "to_next_user_pick"
          ? `Simulated ${picksMade} CPU picks. It's now your turn!`
          : `Simulated ${picksMade} picks.`,
    });
  } catch (error) {
    console.error("Error simulating draft:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

