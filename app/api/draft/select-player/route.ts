import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase-client";
import { generateContract } from "@/lib/contract-generator";

/**
 * Select a player in the draft
 * Validates scouting completion before allowing selection
 */
export async function POST(req: Request) {
  try {
    const { teamId, prospectId, pickId, season } = await req.json();

    if (!teamId || !prospectId || !pickId) {
      return NextResponse.json(
        { error: "teamId, prospectId, and pickId are required" },
        { status: 400 }
      );
    }

    // Validate scouting is complete
    const { validateScoutingComplete } = await import("@/lib/scouting/validator");
    const scoutingValidation = await validateScoutingComplete(teamId, season);

    if (!scoutingValidation.isValid) {
      return NextResponse.json(
        {
          error: "Scouting requirements not met. Please complete scouting before drafting.",
          scoutingValidation: scoutingValidation,
        },
        { status: 400 }
      );
    }

    // Get draft pick
    const { data: draftPick, error: pickError } = await supabase
      .from("draft_picks")
      .select("*")
      .eq("id", pickId)
      .eq("owning_team_id", teamId)
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
      .maybeSingle();

    if (alreadyDrafted) {
      return NextResponse.json(
        { error: "This prospect has already been drafted" },
        { status: 400 }
      );
    }

    // Get scouting report if available (for more accurate ratings)
    const { data: scoutingReport } = await supabase
      .from("scouting_reports")
      .select("overall_estimate, potential_estimate")
      .eq("team_id", teamId)
      .eq("prospect_id", prospectId)
      .single();

    // Use scouted ratings if available, otherwise use prospect's base ratings
    const overall = scoutingReport?.overall_estimate || prospect.overall;
    const potential = scoutingReport?.potential_estimate || prospect.potential;

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

