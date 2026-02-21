/**
 * Utility functions for querying player contracts with save game isolation
 * Uses player_contracts_per_save_game table to track contracts per save game
 */

import { supabase } from "@/lib/supabase-client";

export interface PlayerContract {
  id: string;
  player_id: string | null;
  prospect_id: string | null;
  save_game_id: string;
  team_id: string | null;
  contract_year_1: number;
  contract_year_2: number;
  contract_year_3: number;
  contract_year_4: number;
  signing_bonus: number;
  contract_expires_season: number | null;
  created_at?: string;
  updated_at?: string;
}

/**
 * Get a player's contract for a save game
 * Returns contract from player_contracts_per_save_game only
 * Assumes contracts have been initialized via initializeContractsForSaveGame
 */
export async function getPlayerContract(
  playerId: string,
  saveGameId?: string | null
): Promise<PlayerContract | null> {
  if (!saveGameId) {
    return null;
  }

  const { data: contract } = await supabase
    .from("player_contracts_per_save_game")
    .select("*")
    .eq("player_id", playerId)
    .eq("save_game_id", saveGameId)
    .maybeSingle();

  if (contract) {
    return contract as PlayerContract;
  }

  return null;
}

/**
 * Upsert a player's contract for a save game
 */
export async function upsertPlayerContract(
  playerId: string,
  saveGameId: string,
  contract: {
    team_id?: string | null;
    contract_year_1?: number;
    contract_year_2?: number;
    contract_year_3?: number;
    contract_year_4?: number;
    signing_bonus?: number;
    contract_expires_season?: number | null;
  }
): Promise<{ success: boolean; error?: string }> {
  // Check if contract already exists
  const { data: existing } = await supabase
    .from("player_contracts_per_save_game")
    .select("id")
    .eq("player_id", playerId)
    .eq("save_game_id", saveGameId)
    .maybeSingle();

  const contractData = {
    player_id: playerId,
    prospect_id: null,
    save_game_id: saveGameId,
    team_id: contract.team_id ?? null,
    contract_year_1: contract.contract_year_1 ?? 0,
    // Use NULL for expiring contracts (no contract for that year), not 0
    // NULL = no contract, 0 = zero dollars (shouldn't happen for future years)
    contract_year_2:
      contract.contract_year_2 !== undefined
        ? contract.contract_year_2 === 0
          ? null
          : contract.contract_year_2
        : null,
    contract_year_3:
      contract.contract_year_3 !== undefined
        ? contract.contract_year_3 === 0
          ? null
          : contract.contract_year_3
        : null,
    contract_year_4:
      contract.contract_year_4 !== undefined
        ? contract.contract_year_4 === 0
          ? null
          : contract.contract_year_4
        : null,
    signing_bonus: contract.signing_bonus ?? 0,
    contract_expires_season: contract.contract_expires_season ?? null,
    updated_at: new Date().toISOString(),
  };

  let error;
  if (existing) {
    // Update existing
    const { error: updateError } = await supabase
      .from("player_contracts_per_save_game")
      .update(contractData)
      .eq("id", existing.id);
    error = updateError;
  } else {
    // Insert new
    const { error: insertError } = await supabase
      .from("player_contracts_per_save_game")
      .insert(contractData);
    error = insertError;
  }

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}

/**
 * Upsert a prospect's contract for a save game
 * Draft prospects have contracts but are not in the players table
 */
export async function upsertProspectContract(
  prospectId: string,
  saveGameId: string,
  contract: {
    team_id?: string | null;
    contract_year_1?: number;
    contract_year_2?: number;
    contract_year_3?: number;
    contract_year_4?: number;
    signing_bonus?: number;
    contract_expires_season?: number | null;
  }
): Promise<{ success: boolean; error?: string }> {
  // Check if contract already exists
  const { data: existing } = await supabase
    .from("player_contracts_per_save_game")
    .select("id")
    .eq("prospect_id", prospectId)
    .eq("save_game_id", saveGameId)
    .maybeSingle();

  const contractData = {
    player_id: null,
    prospect_id: prospectId,
    save_game_id: saveGameId,
    team_id: contract.team_id ?? null,
    contract_year_1: contract.contract_year_1 ?? 0,
    // Use NULL for expiring contracts (no contract for that year), not 0
    // NULL = no contract, 0 = zero dollars (shouldn't happen for future years)
    contract_year_2:
      contract.contract_year_2 !== undefined
        ? contract.contract_year_2 === 0
          ? null
          : contract.contract_year_2
        : null,
    contract_year_3:
      contract.contract_year_3 !== undefined
        ? contract.contract_year_3 === 0
          ? null
          : contract.contract_year_3
        : null,
    contract_year_4:
      contract.contract_year_4 !== undefined
        ? contract.contract_year_4 === 0
          ? null
          : contract.contract_year_4
        : null,
    signing_bonus: contract.signing_bonus ?? 0,
    contract_expires_season: contract.contract_expires_season ?? null,
    updated_at: new Date().toISOString(),
  };

  let error;
  if (existing) {
    // Update existing
    const { error: updateError } = await supabase
      .from("player_contracts_per_save_game")
      .update(contractData)
      .eq("id", existing.id);
    error = updateError;
  } else {
    // Insert new
    const { error: insertError } = await supabase
      .from("player_contracts_per_save_game")
      .insert(contractData);
    error = insertError;
  }

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}

/**
 * Get all contracts for a team in a save game
 * Used for salary cap calculations
 * Includes both seed players and drafted prospects
 * Assumes contracts have been initialized via initializeContractsForSaveGame
 */
export async function getTeamContracts(
  teamId: string,
  saveGameId?: string | null
): Promise<PlayerContract[]> {
  if (!saveGameId) {
    return [];
  }

  const { data: contracts } = await supabase
    .from("player_contracts_per_save_game")
    .select("*")
    .eq("team_id", teamId)
    .eq("save_game_id", saveGameId);

  if (contracts && contracts.length > 0) {
    return contracts as PlayerContract[];
  }

  return [];
}

/**
 * Calculate total salary cap hit for a team
 */
export async function calculateTeamCapHit(
  teamId: string,
  saveGameId?: string | null
): Promise<number> {
  const contracts = await getTeamContracts(teamId, saveGameId);
  return contracts.reduce(
    (sum, contract) => sum + (contract.contract_year_1 || 0),
    0
  );
}

/**
 * Copy contracts from player_contract_seed_data table to player_contracts_per_save_game for a new save game
 * This initializes contracts for all players based on seed data
 */
export async function initializeContractsForSaveGame(
  saveGameId: string
): Promise<{ success: boolean; contractsCreated: number; error?: string }> {
  try {
    // Fetch ALL seed contracts using pagination to avoid Supabase limits
    console.log("[InitializeContracts] Fetching all seed contracts...");

    interface SeedContractWithPlayer {
      player_id: string;
      contract_year_1: number;
      contract_year_2: number | null;
      contract_year_3: number | null;
      contract_year_4: number | null;
      signing_bonus: number;
      players:
        | { id: string; team_id: string | null }
        | { id: string; team_id: string | null }[];
    }

    let allSeedContracts: SeedContractWithPlayer[] = [];
    let offset = 0;
    const pageSize = 1000;
    let hasMore = true;

    while (hasMore) {
      const { data: page, error: pageError } = await supabase
        .from("player_contract_seed_data")
        .select(
          `
          player_id,
          contract_year_1,
          contract_year_2,
          contract_year_3,
          contract_year_4,
          signing_bonus,
          players!inner (id, team_id)
        `
        )
        .not("players.team_id", "is", null)
        .range(offset, offset + pageSize - 1);

      if (pageError) {
        return {
          success: false,
          contractsCreated: 0,
          error: `Failed to fetch seed contract data: ${pageError.message}`,
        };
      }

      if (page && page.length > 0) {
        allSeedContracts = [
          ...allSeedContracts,
          ...(page as SeedContractWithPlayer[]),
        ];
        offset += pageSize;
        hasMore = page.length === pageSize; // Continue if we got a full page
        console.log(
          `[InitializeContracts] Fetched ${allSeedContracts.length} seed contracts so far...`
        );
      } else {
        hasMore = false;
      }
    }

    console.log(
      `[InitializeContracts] Total seed contracts fetched: ${allSeedContracts.length}`
    );

    if (allSeedContracts.length === 0) {
      return {
        success: false,
        contractsCreated: 0,
        error:
          "No seed contract data found. Please ensure player_contract_seed_data table is populated.",
      };
    }

    const seedContracts = allSeedContracts;

    // Create contracts for all players
    // Use NULL for expiring contracts (no contract for that year), not 0
    // NULL = no contract, 0 = zero dollars (shouldn't happen for future years)
    const contracts = seedContracts.map((seed) => {
      // Handle both array and single object cases from Supabase join
      const playersData = Array.isArray(seed.players)
        ? seed.players[0]
        : seed.players;
      const player = playersData as { id: string; team_id: string | null };
      return {
        player_id: seed.player_id,
        prospect_id: null, // Seed players only
        save_game_id: saveGameId,
        team_id: player.team_id,
        contract_year_1: seed.contract_year_1 || 0, // Year 1 must have a value
        contract_year_2:
          seed.contract_year_2 && seed.contract_year_2 > 0
            ? seed.contract_year_2
            : null, // NULL if no contract
        contract_year_3:
          seed.contract_year_3 && seed.contract_year_3 > 0
            ? seed.contract_year_3
            : null, // NULL if no contract
        contract_year_4:
          seed.contract_year_4 && seed.contract_year_4 > 0
            ? seed.contract_year_4
            : null, // NULL if no contract
        signing_bonus: seed.signing_bonus || 0,
        contract_expires_season: null, // Will be calculated if needed
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
    });

    // Insert contracts in batches
    const batchSize = 100;
    let contractsCreated = 0;
    for (let i = 0; i < contracts.length; i += batchSize) {
      const batch = contracts.slice(i, i + batchSize);
      // Check which contracts already exist and handle manually (can't use ON CONFLICT with partial indexes)
      const playerIds = batch
        .map((c) => c.player_id)
        .filter(Boolean) as string[];
      const existingContracts: Set<string> = new Set();

      if (playerIds.length > 0) {
        const { data: existing } = await supabase
          .from("player_contracts_per_save_game")
          .select("player_id")
          .in("player_id", playerIds)
          .eq("save_game_id", saveGameId);

        if (existing) {
          existing.forEach((c: { player_id: string | null }) => {
            if (c.player_id) existingContracts.add(c.player_id);
          });
        }
      }

      // Filter out existing contracts and insert only new ones
      const newContracts = batch.filter(
        (c) => !c.player_id || !existingContracts.has(c.player_id)
      );

      if (newContracts.length === 0) {
        contractsCreated += batch.length; // Count as created if they all exist
        continue;
      }

      const { error } = await supabase
        .from("player_contracts_per_save_game")
        .insert(newContracts);

      if (error) {
        return {
          success: false,
          contractsCreated,
          error: `Failed to create contracts: ${error.message}`,
        };
      }

      contractsCreated += batch.length;
    }

    return {
      success: true,
      contractsCreated,
    };
  } catch (error) {
    return {
      success: false,
      contractsCreated: 0,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
