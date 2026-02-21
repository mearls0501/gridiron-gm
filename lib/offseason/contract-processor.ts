import { supabase } from "@/lib/supabase-client";
import {
  getPlayerContract,
  upsertPlayerContract,
} from "@/lib/utils/player-contracts";

/**
 * Process expiring contracts and move players to free agency
 * Returns the number of players moved to free agency and contracts shifted
 */
export async function processExpiringContracts(
  season: number,
  saveGameId?: string | null
): Promise<{
  success: boolean;
  playersMovedToFA: number;
  contractsShifted: number;
  error?: string;
}> {
  try {
    if (!saveGameId) {
      return {
        success: false,
        playersMovedToFA: 0,
        contractsShifted: 0,
        error: "saveGameId is required for contract processing",
      };
    }

    console.log(
      `[Process Contracts] Processing contracts for season ${season}, saveGameId ${saveGameId}...`
    );

    // Step 1: Find all players/prospects with expiring contracts for this save game
    // A contract expires if contract_year_2 is 0 or null (meaning no contract for next year)
    // This means the player's current contract (contract_year_1) is their last year
    // We need to join with player_team_assignments to find players/prospects on teams
    const { data: assignments, error: assignmentsError } = await supabase
      .from("player_team_assignments")
      .select(
        `
        player_id,
        prospect_id,
        team_id,
        players (*),
        draft_prospects (*)
      `
      )
      .eq("save_game_id", saveGameId)
      .not("team_id", "is", null);

    if (assignmentsError) {
      console.error("Error fetching player assignments:", assignmentsError);
      return {
        success: false,
        playersMovedToFA: 0,
        contractsShifted: 0,
        error: `Failed to fetch player assignments: ${assignmentsError.message}`,
      };
    }

    if (!assignments || assignments.length === 0) {
      console.log("[Process Contracts] No players on teams for this save game");
      return {
        success: true,
        playersMovedToFA: 0,
        contractsShifted: 0,
      };
    }

    // Get contracts for all players/prospects on teams
    // A contract expires if contract_year_2 is 0 or null (no contract for next year)
    // OPTIMIZATION: Batch query contracts instead of individual queries
    // Separate player IDs and prospect IDs for separate batch queries
    const playerIds: string[] = [];
    const prospectIds: string[] = [];

    for (const assignment of assignments) {
      if (assignment.player_id) {
        playerIds.push(assignment.player_id);
      } else if (assignment.prospect_id) {
        prospectIds.push(assignment.prospect_id);
      }
    }

    if (playerIds.length === 0 && prospectIds.length === 0) {
      console.log(
        "[Process Contracts] No player or prospect IDs found in assignments"
      );
      return {
        success: true,
        playersMovedToFA: 0,
        contractsShifted: 0,
      };
    }

    console.log(
      `[Process Contracts] Processing ${playerIds.length} players and ${prospectIds.length} prospects`
    );

    // Create a map of entityId -> contract for fast lookup
    const contractMap = new Map<string, any>();
    let batchContractsError: any = null;

    // Batch query player contracts in chunks to avoid "Bad Request" errors
    // Supabase has limits on query size, so we chunk the IDs
    const CHUNK_SIZE = 100;

    if (playerIds.length > 0) {
      console.log(
        `[Process Contracts] Querying ${playerIds.length} player contracts in chunks of ${CHUNK_SIZE}`
      );
      let totalPlayerContracts = 0;
      let expiringPlayerCount = 0;

      for (let i = 0; i < playerIds.length; i += CHUNK_SIZE) {
        const chunk = playerIds.slice(i, i + CHUNK_SIZE);
        const { data: playerContracts, error: playerContractsError } =
          await supabase
            .from("player_contracts_per_save_game")
            .select("*")
            .eq("save_game_id", saveGameId)
            .in("player_id", chunk);

        if (playerContractsError) {
          console.error(
            `Error batch querying player contracts (chunk ${i}-${i + chunk.length}):`,
            playerContractsError
          );
          batchContractsError = playerContractsError;
          break; // Stop on first error
        } else if (playerContracts) {
          totalPlayerContracts += playerContracts.length;
          // Filter for expiring contracts (contract_year_2 is null or 0)
          const expiringPlayerContracts = playerContracts.filter(
            (c) => c.contract_year_2 === null || c.contract_year_2 === 0
          );
          expiringPlayerContracts.forEach((contract) => {
            contractMap.set(contract.player_id, contract);
          });
          expiringPlayerCount += expiringPlayerContracts.length;
        }
      }

      console.log(
        `[Process Contracts] Found ${expiringPlayerCount} expiring player contracts out of ${totalPlayerContracts} total`
      );
    }

    // Batch query prospect contracts in chunks
    if (prospectIds.length > 0) {
      console.log(
        `[Process Contracts] Querying ${prospectIds.length} prospect contracts in chunks of ${CHUNK_SIZE}`
      );
      let totalProspectContracts = 0;
      let expiringProspectCount = 0;

      for (let i = 0; i < prospectIds.length; i += CHUNK_SIZE) {
        const chunk = prospectIds.slice(i, i + CHUNK_SIZE);
        const { data: prospectContracts, error: prospectContractsError } =
          await supabase
            .from("player_contracts_per_save_game")
            .select("*")
            .eq("save_game_id", saveGameId)
            .in("prospect_id", chunk);

        if (prospectContractsError) {
          console.error(
            `Error batch querying prospect contracts (chunk ${i}-${i + chunk.length}):`,
            prospectContractsError
          );
          batchContractsError = prospectContractsError;
          break; // Stop on first error
        } else if (prospectContracts) {
          totalProspectContracts += prospectContracts.length;
          // Filter for expiring contracts (contract_year_2 is null or 0)
          const expiringProspectContracts = prospectContracts.filter(
            (c) => c.contract_year_2 === null || c.contract_year_2 === 0
          );
          expiringProspectContracts.forEach((contract) => {
            contractMap.set(contract.prospect_id, contract);
          });
          expiringProspectCount += expiringProspectContracts.length;
        }
      }

      console.log(
        `[Process Contracts] Found ${expiringProspectCount} expiring prospect contracts out of ${totalProspectContracts} total`
      );
    }

    if (batchContractsError) {
      // Fall back to individual queries if batch fails
      console.log(
        "[Process Contracts] Falling back to individual contract queries..."
      );
    }

    const expiringPlayers: Array<{
      player: any;
      assignment: any;
      contract: any;
      isProspect: boolean;
    }> = [];

    // If batch query failed or returned incomplete results, fall back to individual queries
    // but only for entities not found in the batch result
    for (const assignment of assignments) {
      const entityId = assignment.player_id || assignment.prospect_id;
      if (!entityId) continue;

      let contract = contractMap.get(entityId);

      // If not found in batch result and batch query failed, do individual query
      if (!contract && batchContractsError) {
        contract = await getPlayerContract(entityId, saveGameId);
      }

      // Check if contract_year_2 is 0 or null (contract expires after this year)
      if (
        contract &&
        (contract.contract_year_2 === 0 || contract.contract_year_2 === null)
      ) {
        const isProspect = !!assignment.prospect_id;
        const player = isProspect
          ? assignment.draft_prospects
          : assignment.players;
        if (!player) continue; // Skip if player/prospect data not found
        expiringPlayers.push({
          player: player,
          assignment: assignment,
          contract: contract,
          isProspect: isProspect,
        });
      }
    }

    if (expiringPlayers.length === 0) {
      console.log("[Process Contracts] No players with expiring contracts");
      return {
        success: true,
        playersMovedToFA: 0,
        contractsShifted: 0,
      };
    }

    console.log(
      `[Process Contracts] Found ${expiringPlayers.length} players with expiring contracts`
    );

    // Step 2: Create free_agent_availability records
    // Free agents are now stored in players table with is_free_agent = TRUE
    // Handle both players and prospects
    if (!saveGameId) {
      return {
        success: false,
        playersMovedToFA: 0,
        contractsShifted: 0,
        error: "saveGameId is required to track free agent availability",
      };
    }

    // Separate players and prospects since they use different unique constraints
    const playerAvailabilityRecords = expiringPlayers
      .filter((item) => !item.isProspect)
      .map((item) => ({
        player_id: item.player.id,
        save_game_id: saveGameId,
        entered_free_agency_season: season,
        reason: "contract_expired",
        archived: false,
      }));

    const prospectAvailabilityRecords = expiringPlayers
      .filter((item) => item.isProspect)
      .map((item) => ({
        prospect_id: item.player.id,
        save_game_id: saveGameId,
        entered_free_agency_season: season,
        reason: "contract_expired",
        archived: false,
      }));

    // Insert players and prospects separately due to partial unique indexes
    if (playerAvailabilityRecords.length > 0) {
      const { error: playerAvailabilityError } = await supabase
        .from("free_agent_availability")
        .upsert(playerAvailabilityRecords, {
          onConflict: "save_game_id,player_id",
        });

      if (playerAvailabilityError) {
        console.error(
          "Error creating player availability:",
          playerAvailabilityError
        );
        return {
          success: false,
          playersMovedToFA: 0,
          contractsShifted: 0,
          error: `Failed to create player free agent availability: ${playerAvailabilityError.message}`,
        };
      }
    }

    if (prospectAvailabilityRecords.length > 0) {
      const { error: prospectAvailabilityError } = await supabase
        .from("free_agent_availability")
        .upsert(prospectAvailabilityRecords, {
          onConflict: "save_game_id,prospect_id",
        });

      if (prospectAvailabilityError) {
        console.error(
          "Error creating prospect availability:",
          prospectAvailabilityError
        );
        return {
          success: false,
          playersMovedToFA: 0,
          contractsShifted: 0,
          error: `Failed to create prospect free agent availability: ${prospectAvailabilityError.message}`,
        };
      }
    }

    const totalAvailabilityRecords =
      playerAvailabilityRecords.length + prospectAvailabilityRecords.length;

    console.log(
      `[Process Contracts] Created ${totalAvailabilityRecords} free agent availability records`
    );

    // Step 3: Update contracts for expiring players (set team_id = null, contract_year_1 = 0)
    // This marks them as free agents in the contract system
    const contractUpdatePromises = expiringPlayers.map(async (item) => {
      const entityId = item.player.id;
      const isProspect = item.isProspect;

      // Update contract to mark as free agent
      const contractUpdate = {
        team_id: null, // Remove from team
        contract_year_1: 0, // Contract expired
        contract_year_2: 0,
        contract_year_3: 0,
        contract_year_4: 0,
        signing_bonus: 0,
        contract_expires_season: season, // Mark as expired this season
      };

      let result;
      if (isProspect) {
        const { upsertProspectContract } = await import(
          "@/lib/utils/player-contracts"
        );
        result = await upsertProspectContract(
          entityId,
          saveGameId,
          contractUpdate
        );
      } else {
        result = await upsertPlayerContract(
          entityId,
          saveGameId,
          contractUpdate
        );
      }

      if (!result.success) {
        console.error(
          `Error updating contract for ${isProspect ? "prospect" : "player"} ${entityId}:`,
          result.error
        );
      }
    });

    await Promise.all(contractUpdatePromises);
    console.log(
      `[Process Contracts] Updated contracts for ${expiringPlayers.length} players moved to free agency`
    );

    // Step 4: Remove players/prospects from teams by deleting player_team_assignments
    // Note: We no longer update players.team_id - that's seed data
    // Team assignments are tracked in player_team_assignments only
    if (saveGameId) {
      // Handle both players and prospects
      const playerIds: string[] = [];
      const prospectIds: string[] = [];

      for (const item of expiringPlayers) {
        if (item.isProspect) {
          prospectIds.push(item.player.id);
        } else {
          playerIds.push(item.player.id);
        }
      }

      // Delete player assignments
      if (playerIds.length > 0) {
        const { error: removePlayerError } = await supabase
          .from("player_team_assignments")
          .delete()
          .in("player_id", playerIds)
          .eq("save_game_id", saveGameId);

        if (removePlayerError) {
          console.error(
            "Error removing player assignments:",
            removePlayerError
          );
        } else {
          console.log(
            `[Process Contracts] Removed ${playerIds.length} player team assignments`
          );
        }
      }

      // Delete prospect assignments
      if (prospectIds.length > 0) {
        const { error: removeProspectError } = await supabase
          .from("player_team_assignments")
          .delete()
          .in("prospect_id", prospectIds)
          .eq("save_game_id", saveGameId);

        if (removeProspectError) {
          console.error(
            "Error removing prospect assignments:",
            removeProspectError
          );
        } else {
          console.log(
            `[Process Contracts] Removed ${prospectIds.length} prospect team assignments`
          );
        }
      }
    }

    // Step 5: Log transactions for all moves
    const transactions = expiringPlayers.map((item) => ({
      player_id: item.player.id,
      from_team_id: item.assignment.team_id, // Team they're leaving
      to_team_id: null, // Going to free agency (no team)
      transaction_type: "contract_expired",
      season: season,
      details: JSON.stringify({
        player_name: item.player.full_name,
        position: item.player.position,
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

    // Step 6: Shift contract years forward for remaining players with contracts
    // Get all contracts for this save game that have contract_year_1 > 0 AND team_id is not null
    // (exclude players who were just moved to free agency)
    const { data: allContracts, error: contractsError } = await supabase
      .from("player_contracts_per_save_game")
      .select("*")
      .eq("save_game_id", saveGameId)
      .not("contract_year_1", "is", null)
      .gt("contract_year_1", 0)
      .not("team_id", "is", null); // Only shift contracts for players still on teams

    let contractsShifted = 0;
    if (contractsError) {
      console.error("Error fetching contracts:", contractsError);
      // Continue - this is not critical for the main operation
    } else if (allContracts && allContracts.length > 0) {
      // Update each contract (shift years forward)
      const updatePromises = allContracts.map(async (contract) => {
        // Shift contract years forward
        // Use NULL for expiring contracts (no contract for that year), not 0
        // NULL = no contract, 0 = zero dollars (shouldn't happen for future years)
        const contractUpdate = {
          team_id: contract.team_id,
          contract_year_1: contract.contract_year_2 ?? 0,
          contract_year_2: contract.contract_year_3 ?? undefined, // undefined if no contract for year 3
          contract_year_3: contract.contract_year_4 ?? undefined, // undefined if no contract for year 4
          contract_year_4: undefined, // Always undefined after shifting (no contract beyond year 4)
          signing_bonus: contract.signing_bonus || 0,
          contract_expires_season:
            contract.contract_year_2 === null || contract.contract_year_2 === 0
              ? season + 1
              : undefined, // Set expiration season if next year is NULL/0
        };

        let result;
        if (contract.prospect_id) {
          const { upsertProspectContract } = await import(
            "@/lib/utils/player-contracts"
          );
          result = await upsertProspectContract(
            contract.prospect_id,
            saveGameId,
            contractUpdate
          );
        } else {
          result = await upsertPlayerContract(
            contract.player_id!,
            saveGameId,
            contractUpdate
          );
        }

        if (!result.success) {
          console.error(
            `Error updating contract for ${contract.prospect_id ? "prospect" : "player"} ${contract.prospect_id || contract.player_id}:`,
            result.error
          );
        } else {
          contractsShifted++;
        }
      });

      await Promise.all(updatePromises);
      console.log(
        `[Process Contracts] Shifted contracts for ${allContracts.length} players`
      );
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
