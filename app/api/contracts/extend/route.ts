import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase-client";
import {
  getPlayerContract,
  upsertPlayerContract,
  calculateTeamCapHit,
} from "@/lib/utils/player-contracts";

/**
 * Extend a player's existing contract by adding years
 */
export async function POST(req: Request) {
  try {
    const { playerId, teamId, additionalYears, signingBonus, saveGameId } =
      await req.json();

    if (!playerId || !teamId || !saveGameId) {
      return NextResponse.json(
        { error: "Player ID, Team ID, and saveGameId are required" },
        { status: 400 }
      );
    }

    // Validate additional years
    if (
      !additionalYears ||
      !Array.isArray(additionalYears) ||
      additionalYears.length === 0
    ) {
      return NextResponse.json(
        { error: "Additional contract years array is required" },
        { status: 400 }
      );
    }

    // Fetch player
    const { data: player, error: playerError } = await supabase
      .from("players")
      .select("*")
      .eq("id", playerId)
      .single();

    if (playerError || !player) {
      return NextResponse.json({ error: "Player not found" }, { status: 404 });
    }

    // Verify player is on the correct team (check player_team_assignments)
    const { data: assignment } = await supabase
      .from("player_team_assignments")
      .select("team_id")
      .eq("player_id", playerId)
      .eq("save_game_id", saveGameId)
      .eq("team_id", teamId)
      .maybeSingle();

    if (!assignment) {
      return NextResponse.json(
        { error: "Player is not on this team" },
        { status: 400 }
      );
    }

    // Check salary cap
    const { data: team, error: teamError } = await supabase
      .from("teams")
      .select("id, salary_cap_total")
      .eq("id", teamId)
      .single();

    if (teamError || !team) {
      return NextResponse.json({ error: "Team not found" }, { status: 404 });
    }

    // Calculate current team salary cap usage
    const totalCapHit = await calculateTeamCapHit(teamId, saveGameId);
    const SALARY_CAP = team.salary_cap_total ?? 255000000;
    const additionalYear1 = additionalYears[0] || 0;
    const remainingCap = SALARY_CAP - totalCapHit;

    // For extension, we need to check if we can afford the additional years
    // The cap hit for extension years will be added to existing contract
    if (remainingCap < additionalYear1) {
      return NextResponse.json(
        {
          error: `Team does not have enough cap space for extension. Remaining: $${remainingCap.toLocaleString()}, Required: $${additionalYear1.toLocaleString()}`,
          remainingCap,
          requiredCap: additionalYear1,
        },
        { status: 400 }
      );
    }

    // Get current contract
    const currentContract = await getPlayerContract(playerId, saveGameId);
    if (!currentContract) {
      return NextResponse.json(
        { error: "Player contract not found" },
        { status: 404 }
      );
    }

    // Extend contract by appending additional years
    // Find the first zero/null year and fill it with extension years
    const currentYears = [
      currentContract.contract_year_1 || 0,
      currentContract.contract_year_2 || 0,
      currentContract.contract_year_3 || 0,
      currentContract.contract_year_4 || 0,
    ];

    // Find first zero year
    let firstZeroIndex = currentYears.findIndex((year) => year === 0);
    if (firstZeroIndex === -1) {
      firstZeroIndex = currentYears.length; // All years filled, append at end
    }

    // Fill in extension years
    const extendedYears = [...currentYears];
    for (let i = 0; i < additionalYears.length && firstZeroIndex + i < 4; i++) {
      extendedYears[firstZeroIndex + i] = additionalYears[i] || 0;
    }

    // Update contract in player_contracts_per_save_game
    // Use NULL for years with no contract (0 or undefined), not 0
    // NULL = no contract for that year, any number = contract exists
    const contractResult = await upsertPlayerContract(playerId, saveGameId, {
      team_id: teamId,
      contract_year_1: extendedYears[0] || 0, // Year 1 must have a value
      contract_year_2:
        extendedYears[1] && extendedYears[1] > 0 ? extendedYears[1] : undefined, // undefined if no contract
      contract_year_3:
        extendedYears[2] && extendedYears[2] > 0 ? extendedYears[2] : undefined, // undefined if no contract
      contract_year_4:
        extendedYears[3] && extendedYears[3] > 0 ? extendedYears[3] : undefined, // undefined if no contract
      signing_bonus: (currentContract.signing_bonus || 0) + (signingBonus || 0),
      contract_expires_season: null, // Reset expiration
    });

    if (!contractResult.success) {
      console.error("Error extending player contract:", contractResult.error);
      return NextResponse.json(
        { error: `Failed to extend contract: ${contractResult.error}` },
        { status: 500 }
      );
    }

    // Log transaction
    const { data: activeSeason } = await supabase
      .from("seasons")
      .select("year")
      .eq("is_active", true)
      .single();

    const season = activeSeason?.year || 2025;

    const { error: transactionError } = await supabase
      .from("transactions")
      .insert({
        player_id: playerId,
        team_id: teamId,
        transaction_type: "contract_extended",
        season: season,
        details: JSON.stringify({
          player_name: player.full_name,
          position: player.position,
          additional_years: additionalYears,
          signing_bonus: signingBonus || 0,
          new_contract: extendedYears,
        }),
      });

    if (transactionError) {
      console.error("Error logging transaction:", transactionError);
      // Don't fail the request if transaction logging fails
    }

    return NextResponse.json({
      success: true,
      message: `Successfully extended ${player.full_name}'s contract`,
      player: {
        id: playerId,
        contract_year_1: extendedYears[0] || 0,
        contract_year_2: extendedYears[1] || 0,
        contract_year_3: extendedYears[2] || 0,
        contract_year_4: extendedYears[3] || 0,
        signing_bonus:
          (currentContract.signing_bonus || 0) + (signingBonus || 0),
      },
    });
  } catch (error) {
    console.error("Error extending contract:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
