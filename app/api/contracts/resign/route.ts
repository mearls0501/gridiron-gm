import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase-client";
import { generateContract } from "@/lib/contract-generator";
import {
  getPlayerContract,
  upsertPlayerContract,
  calculateTeamCapHit,
} from "@/lib/utils/player-contracts";

/**
 * Re-sign a player with an expiring contract
 */
export async function POST(req: Request) {
  try {
    const { playerId, teamId, contractYears, signingBonus, saveGameId } =
      await req.json();

    if (!playerId || !teamId || !saveGameId) {
      return NextResponse.json(
        { error: "Player ID, Team ID, and saveGameId are required" },
        { status: 400 }
      );
    }

    // Validate contract years
    if (
      !contractYears ||
      !Array.isArray(contractYears) ||
      contractYears.length === 0
    ) {
      return NextResponse.json(
        { error: "Contract years array is required" },
        { status: 400 }
      );
    }

    // Fetch player (could be in players table or draft_prospects table)
    let player: any = null;
    let isProspect = false;

    // Try players table first (seed players)
    const { data: seedPlayer } = await supabase
      .from("players")
      .select("*")
      .eq("id", playerId)
      .maybeSingle();

    if (seedPlayer) {
      player = seedPlayer;
      isProspect = false;
    } else {
      // Try draft_prospects table (drafted players)
      const { data: draftedPlayer } = await supabase
        .from("draft_prospects")
        .select("*")
        .eq("id", playerId)
        .maybeSingle();

      if (draftedPlayer) {
        player = draftedPlayer;
        isProspect = true;
      }
    }

    if (!player) {
      return NextResponse.json(
        { error: "Player not found in players or draft_prospects tables" },
        { status: 404 }
      );
    }

    // Check if player is on the team for this save game
    const { data: assignment, error: assignmentError } = await supabase
      .from("player_team_assignments")
      .select("player_id, prospect_id, team_id")
      .eq("save_game_id", saveGameId)
      .or(`player_id.eq.${playerId},prospect_id.eq.${playerId}`)
      .maybeSingle();

    if (assignmentError) {
      console.error(
        "[Resign] Error checking player assignment:",
        assignmentError
      );
    }

    const isOnTeam = assignment && assignment.team_id === teamId;

    // Get current contract from player_contracts_per_save_game
    // Check both player_id and prospect_id fields
    let currentContract: any = null;
    if (saveGameId) {
      if (isProspect) {
        const { data: contract } = await supabase
          .from("player_contracts_per_save_game")
          .select("*")
          .eq("prospect_id", playerId)
          .eq("save_game_id", saveGameId)
          .maybeSingle();

        currentContract = contract;
      } else {
        const { data: contract } = await supabase
          .from("player_contracts_per_save_game")
          .select("*")
          .eq("player_id", playerId)
          .eq("save_game_id", saveGameId)
          .maybeSingle();

        currentContract = contract;
      }
    }

    console.log("[Resign] Contract check:", {
      playerId,
      teamId,
      saveGameId,
      hasContract: !!currentContract,
      contractTeamId: currentContract?.team_id,
      contractYear1: currentContract?.contract_year_1,
      contractYear2: currentContract?.contract_year_2,
      isOnTeam,
      assignmentTeamId: assignment?.team_id,
    });

    // Check if player is currently a free agent or has expiring contract
    // A contract expires if contract_year_2 is 0 or null (meaning no contract for next year)
    // This means the player's current contract (contract_year_1) is their last year
    // If player is on team but has no contract record, treat as expiring (allow resign to create contract)
    const isFreeAgent = !currentContract || !currentContract.team_id;
    const hasExpiringContract =
      currentContract &&
      currentContract.team_id === teamId &&
      (!currentContract.contract_year_2 ||
        currentContract.contract_year_2 === 0);

    // If player is on team but has no contract record, allow resign (will create new contract)
    const canResignWithoutContract = isOnTeam && !currentContract;

    if (!isFreeAgent && !hasExpiringContract && !canResignWithoutContract) {
      // Provide more detailed error message
      const contractStatus = currentContract
        ? `Contract year 2: ${currentContract.contract_year_2 || "null"}, Team: ${currentContract.team_id || "null"}`
        : "No contract found in player_contracts_per_save_game";
      return NextResponse.json(
        {
          error: `Player does not have an expiring contract. ${contractStatus}. Player must have contract_year_2 = 0 or null to resign.`,
          contract: currentContract,
          isOnTeam,
        },
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
    const newContractYear1 = contractYears[0] || 0;
    const currentPlayerCapHit =
      currentContract && currentContract.team_id === teamId
        ? currentContract.contract_year_1 || 0
        : 0;
    const remainingCap = SALARY_CAP - totalCapHit + currentPlayerCapHit;

    if (remainingCap < newContractYear1) {
      return NextResponse.json(
        {
          error: `Team does not have enough cap space. Remaining: $${remainingCap.toLocaleString()}, Required: $${newContractYear1.toLocaleString()}`,
          remainingCap,
          requiredCap: newContractYear1,
        },
        { status: 400 }
      );
    }

    // Update contract in player_contracts_per_save_game
    // Use NULL for years with no contract (0 or undefined), not 0
    // NULL = no contract for that year, any number = contract exists
    // Use the appropriate upsert function based on whether it's a prospect or seed player
    let contractResult;
    if (isProspect) {
      const { upsertProspectContract } = await import(
        "@/lib/utils/player-contracts"
      );
      contractResult = await upsertProspectContract(playerId, saveGameId, {
        team_id: teamId,
        contract_year_1: contractYears[0] || 0,
        contract_year_2:
          contractYears[1] && contractYears[1] > 0
            ? contractYears[1]
            : undefined,
        contract_year_3:
          contractYears[2] && contractYears[2] > 0
            ? contractYears[2]
            : undefined,
        contract_year_4:
          contractYears[3] && contractYears[3] > 0
            ? contractYears[3]
            : undefined,
        signing_bonus: signingBonus || 0,
        contract_expires_season: null,
      });
    } else {
      contractResult = await upsertPlayerContract(playerId, saveGameId, {
        team_id: teamId,
        contract_year_1: contractYears[0] || 0,
        contract_year_2:
          contractYears[1] && contractYears[1] > 0 ? contractYears[1] : null,
        contract_year_3:
          contractYears[2] && contractYears[2] > 0 ? contractYears[2] : null,
        contract_year_4:
          contractYears[3] && contractYears[3] > 0 ? contractYears[3] : null,
        signing_bonus: signingBonus || 0,
        contract_expires_season: null,
      });
    }

    if (!contractResult.success) {
      console.error("Error updating player contract:", contractResult.error);
      return NextResponse.json(
        { error: `Failed to re-sign player: ${contractResult.error}` },
        { status: 500 }
      );
    }

    // Get current season and week for assignment
    let seasonQuery = supabase
      .from("seasons")
      .select("year, current_week")
      .eq("is_active", true);

    if (saveGameId) {
      seasonQuery = seasonQuery.eq("save_game_id", saveGameId);
    } else {
      seasonQuery = seasonQuery.is("save_game_id", null);
    }

    const { data: activeSeason } = await seasonQuery.maybeSingle();
    const season = activeSeason?.year || 2025;
    const week = activeSeason?.current_week || 0;

    // Also update player_team_assignments if player was a free agent
    if (isFreeAgent) {
      const assignmentData = isProspect
        ? {
            prospect_id: playerId,
            player_id: null,
            team_id: teamId,
            save_game_id: saveGameId,
            assigned_reason: "resigned",
            season: season,
            week: week,
          }
        : {
            player_id: playerId,
            prospect_id: null,
            team_id: teamId,
            save_game_id: saveGameId,
            assigned_reason: "resigned",
            season: season,
            week: week,
          };

      // Can't use upsert with partial unique indexes, so insert directly
      const { error: assignmentError } = await supabase
        .from("player_team_assignments")
        .insert(assignmentData)
        .select();

      if (assignmentError) {
        console.error("Error updating player assignment:", assignmentError);
        // Don't fail - contract is already updated
      }
    }

    // If player was a free agent, remove from free_agent_availability for this save game
    // Note: players table is seed data and should NEVER be modified
    if (isFreeAgent && saveGameId) {
      const deleteQuery = supabase
        .from("free_agent_availability")
        .delete()
        .eq("save_game_id", saveGameId);

      if (isProspect) {
        await deleteQuery.eq("prospect_id", playerId);
      } else {
        await deleteQuery.eq("player_id", playerId);
      }
    }

    // Log transaction (season already retrieved above)
    const { error: transactionError } = await supabase
      .from("transactions")
      .insert({
        player_id: playerId,
        from_team_id: null, // Coming from free agency
        to_team_id: teamId,
        transaction_type: "resigned",
        season: season,
        details: JSON.stringify({
          player_name: player.full_name,
          position: player.position,
          contract_years: contractYears,
          signing_bonus: signingBonus || 0,
          is_prospect: isProspect,
        }),
      });

    if (transactionError) {
      console.error("Error logging transaction:", transactionError);
      // Don't fail the request if transaction logging fails
    }

    return NextResponse.json({
      success: true,
      message: `Successfully re-signed ${player.full_name}`,
      player: {
        id: playerId,
        contract_year_1: contractYears[0] || 0,
        contract_year_2: contractYears[1] || 0,
        contract_year_3: contractYears[2] || 0,
        contract_year_4: contractYears[3] || 0,
        signing_bonus: signingBonus || 0,
      },
    });
  } catch (error) {
    console.error("Error re-signing player:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
