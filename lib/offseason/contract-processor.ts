import { supabase } from "@/lib/supabase-client";

/**
 * Process expiring contracts and move players to free agency
 * Returns the number of players moved to free agency and contracts shifted
 */
export async function processExpiringContracts(season: number): Promise<{
  success: boolean;
  playersMovedToFA: number;
  contractsShifted: number;
  error?: string;
}> {
  try {
    console.log(`[Process Contracts] Processing contracts for season ${season}...`);

    // Step 1: Find all players with expiring contracts
    // A contract is expired if contract_year_1 is 0, null, or undefined
    const { data: expiringPlayers, error: expiringError } = await supabase
      .from("players")
      .select("*")
      .or("contract_year_1.is.null,contract_year_1.eq.0")
      .not("team_id", "is", null); // Only players currently on a team

    if (expiringError) {
      console.error("Error fetching expiring players:", expiringError);
      return {
        success: false,
        playersMovedToFA: 0,
        contractsShifted: 0,
        error: `Failed to fetch expiring players: ${expiringError.message}`,
      };
    }

    if (!expiringPlayers || expiringPlayers.length === 0) {
      console.log("[Process Contracts] No players with expiring contracts");
      return {
        success: true,
        playersMovedToFA: 0,
        contractsShifted: 0,
      };
    }

    console.log(`[Process Contracts] Found ${expiringPlayers.length} players with expiring contracts`);

    // Step 2: Move expiring players to free_agents table
    const freeAgentsToInsert = expiringPlayers.map((player) => ({
      id: player.id,
      full_name: player.full_name,
      position: player.position,
      age: player.age,
      college: player.college || null,
      archetype: player.archetype || null,
      overall: player.overall,
      potential: player.potential,
      traits: player.traits || {},
      entered_free_agency_season: season,
      archived: false,
    }));

    // Insert into free_agents (use upsert in case player already exists)
    const { error: insertFAError } = await supabase
      .from("free_agents")
      .upsert(freeAgentsToInsert, {
        onConflict: "id",
        ignoreDuplicates: false,
      });

    if (insertFAError) {
      console.error("Error inserting free agents:", insertFAError);
      return {
        success: false,
        playersMovedToFA: 0,
        contractsShifted: 0,
        error: `Failed to move players to free agency: ${insertFAError.message}`,
      };
    }

    console.log(`[Process Contracts] Moved ${freeAgentsToInsert.length} players to free agency`);

    // Step 3: Remove players from teams (set team_id to null)
    const playerIds = expiringPlayers.map((p) => p.id);
    const { error: removeTeamError } = await supabase
      .from("players")
      .update({ team_id: null })
      .in("id", playerIds);

    if (removeTeamError) {
      console.error("Error removing players from teams:", removeTeamError);
      // Continue even if this fails - players are already in free agency
    }

    // Step 4: Log transactions for all moves
    const transactions = expiringPlayers.map((player) => ({
      player_id: player.id,
      team_id: player.team_id,
      transaction_type: "contract_expired",
      season: season,
      details: JSON.stringify({
        player_name: player.full_name,
        position: player.position,
        reason: "Contract expired",
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

    // Step 5: Shift contract years forward for remaining players
    // Get all players with contracts (contract_year_1 > 0)
    const { data: playersWithContracts, error: contractsError } = await supabase
      .from("players")
      .select("id, contract_year_1, contract_year_2, contract_year_3, contract_year_4")
      .not("contract_year_1", "is", null)
      .gt("contract_year_1", 0);

    let contractsShifted = 0;
    if (contractsError) {
      console.error("Error fetching players with contracts:", contractsError);
      // Continue - this is not critical for the main operation
    } else if (playersWithContracts && playersWithContracts.length > 0) {
      // Update each player's contract years (shift forward)
      const updatePromises = playersWithContracts.map(async (player) => {
        const updates = {
          contract_year_1: player.contract_year_2 || 0,
          contract_year_2: player.contract_year_3 || 0,
          contract_year_3: player.contract_year_4 || 0,
          contract_year_4: 0,
          contract_expires_season: 
            (player.contract_year_2 || 0) === 0 
              ? season + 1 
              : null, // Set expiration season if next year is 0
        };

        const { error } = await supabase
          .from("players")
          .update(updates)
          .eq("id", player.id);

        if (error) {
          console.error(`Error updating contract for player ${player.id}:`, error);
        } else {
          contractsShifted++;
        }
      });

      await Promise.all(updatePromises);
      console.log(`[Process Contracts] Shifted contracts for ${playersWithContracts.length} players`);
    }

    return {
      success: true,
      playersMovedToFA: expiringPlayers.length,
      contractsShifted,
    };
  } catch (error) {
    console.error("Error processing contracts:", error);
    return {
      success: false,
      playersMovedToFA: 0,
      contractsShifted: 0,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

