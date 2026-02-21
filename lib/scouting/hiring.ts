/**
 * Scout hiring system
 * Handles hiring, firing, and budget validation
 */

import { supabase } from "@/lib/supabase-client";
import { Scout, ScoutContract, ScoutArchetype } from "./types";

/**
 * Calculate scout salary for contract
 */
export function calculateScoutSalary(scout: Scout): number {
  // Use the scout's pre-calculated salary
  return scout.salary;
}

/**
 * Validate if team can afford to hire scouts
 */
export async function validateHiringBudget(
  teamId: string,
  scoutIds: string[],
  saveGameId: string,
  season: number
): Promise<{ canAfford: boolean; totalCost: number; budget: number; error?: string }> {
  // Get team's scouting budget
  let budgetQuery = supabase
    .from("team_scouting_resources")
    .select("scouting_budget")
    .eq("team_id", teamId)
    .eq("season", season);
  
  if (saveGameId) {
    budgetQuery = budgetQuery.eq("save_game_id", saveGameId);
  } else {
    budgetQuery = budgetQuery.is("save_game_id", null);
  }
  
  const { data: resources } = await budgetQuery.single();
  
  if (!resources) {
    return {
      canAfford: false,
      totalCost: 0,
      budget: 0,
      error: "Scouting resources not found. Initialize scouting first.",
    };
  }
  
  // Get salaries for all scouts (must belong to this save game)
  const { data: scouts } = await supabase
    .from("scouts")
    .select("id, salary")
    .in("id", scoutIds)
    .eq("save_game_id", saveGameId);
  
  if (!scouts || scouts.length !== scoutIds.length) {
    return {
      canAfford: false,
      totalCost: 0,
      budget: resources.scouting_budget,
      error: "One or more scouts not found or do not belong to this save game",
    };
  }
  
  // Calculate total cost (annual salaries)
  const totalCost = scouts.reduce((sum, scout) => sum + Number(scout.salary), 0);
  
  return {
    canAfford: totalCost <= resources.scouting_budget,
    totalCost,
    budget: resources.scouting_budget,
  };
}

/**
 * Hire a scout
 */
export async function hireScout(
  teamId: string,
  scoutId: string,
  saveGameId: string,
  contractYears: number = 1
): Promise<{ success: boolean; contract?: ScoutContract; error?: string }> {
  // Get scout details (must belong to this save game)
  const { data: scout, error: scoutError } = await supabase
    .from("scouts")
    .select("*")
    .eq("id", scoutId)
    .eq("save_game_id", saveGameId)
    .single();
  
  if (scoutError || !scout) {
    return { success: false, error: "Scout not found or does not belong to this save game" };
  }
  
  // Always require saveGameId
  if (!saveGameId) {
    return { success: false, error: "saveGameId is required" };
  }
  
  // Check current team scouts to enforce limits
  const currentScouts = await getTeamScouts(teamId, saveGameId);
  
  // Enforce max 4 scouts limit
  if (currentScouts.length >= 4) {
    return { success: false, error: "Team already has 4 scouts. Maximum limit reached." };
  }
  
  // Check if scout is already hired by this team in this save game
  const { data: existing } = await supabase
    .from("scout_contracts")
    .select("id")
    .eq("team_id", teamId)
    .eq("scout_id", scoutId)
    .eq("save_game_id", saveGameId)
    .maybeSingle();
  
  if (existing) {
    return { success: false, error: "Scout is already hired by this team" };
  }
  
  // Check for duplicate archetype
  const existingArchetypes = new Set(currentScouts.map((s) => s.archetype));
  if (existingArchetypes.has(scout.archetype)) {
    return { success: false, error: `Team already has a ${scout.archetype}. You can only have one of each archetype.` };
  }
  
  // Create contract
  const contractData = {
    team_id: teamId,
    scout_id: scoutId,
    save_game_id: saveGameId,
    salary: scout.salary,
    contract_years: contractYears,
    loyalty: scout.loyalty,
    reputation: scout.reputation,
    role: scout.archetype as ScoutArchetype,
  };
  
  const { data: contract, error: contractError } = await supabase
    .from("scout_contracts")
    .insert(contractData)
    .select()
    .single();
  
  if (contractError) {
    return { success: false, error: contractError.message };
  }
  
  return { success: true, contract };
}

/**
 * Fire a scout
 */
export async function fireScout(
  teamId: string,
  scoutId: string,
  saveGameId: string
): Promise<{ success: boolean; error?: string }> {
  let deleteQuery = supabase
    .from("scout_contracts")
    .delete()
    .eq("team_id", teamId)
    .eq("scout_id", scoutId);
  
  if (saveGameId) {
    deleteQuery = deleteQuery.eq("save_game_id", saveGameId);
  } else {
    deleteQuery = deleteQuery.is("save_game_id", null);
  }
  
  const { error } = await deleteQuery;
  
  if (error) {
    return { success: false, error: error.message };
  }
  
  // Also remove priority assignment if exists
  let priorityDeleteQuery = supabase
    .from("scout_priority")
    .delete()
    .eq("team_id", teamId)
    .eq("scout_id", scoutId);
  
  if (saveGameId) {
    priorityDeleteQuery = priorityDeleteQuery.eq("save_game_id", saveGameId);
  } else {
    priorityDeleteQuery = priorityDeleteQuery.is("save_game_id", null);
  }
  
  await priorityDeleteQuery;
  
  return { success: true };
}

/**
 * Get available scouts (not under contract in this save game)
 */
export async function getAvailableScouts(saveGameId: string): Promise<Scout[]> {
  if (!saveGameId) {
    console.warn("getAvailableScouts called without saveGameId - returning empty array");
    return [];
  }
  
  // Get all scouts for this save game
  const { data: allScouts } = await supabase
    .from("scouts")
    .select("*")
    .eq("save_game_id", saveGameId)
    .order("reputation", { ascending: false });
  
  if (!allScouts) {
    return [];
  }
  
  // Get scouts hired in this save game
  const { data: hired } = await supabase
    .from("scout_contracts")
    .select("scout_id")
    .eq("save_game_id", saveGameId);
  
  const hiredIds = new Set(hired?.map((c) => c.scout_id) || []);
  
  // Filter out hired scouts
  return allScouts.filter((scout) => !hiredIds.has(scout.id));
}

/**
 * Get team's hired scouts
 */
export async function getTeamScouts(
  teamId: string,
  saveGameId: string
): Promise<(Scout & { contract: ScoutContract })[]> {
  // Always require saveGameId - scout_contracts table has save_game_id as NOT NULL
  if (!saveGameId) {
    console.warn("getTeamScouts called without saveGameId - returning empty array");
    return [];
  }
  
  // Strictly filter by both team_id and save_game_id
  console.log(`[getTeamScouts] Querying contracts for team ${teamId}, saveGameId: ${saveGameId}`);
  const { data: contracts, error: contractsError } = await supabase
    .from("scout_contracts")
    .select("*")
    .eq("team_id", teamId)
    .eq("save_game_id", saveGameId);
  
  if (contractsError) {
    console.error(`[getTeamScouts] Error fetching scout contracts:`, contractsError);
    return [];
  }
  
  if (!contracts || contracts.length === 0) {
    console.log(`[getTeamScouts] No contracts found for team ${teamId} in save game ${saveGameId}`);
    return [];
  }
  
  // Log for debugging - show save_game_id of each contract
  console.log(`[getTeamScouts] Found ${contracts.length} scout contracts for team ${teamId} in save game ${saveGameId}`);
  contracts.forEach((c, i) => {
    console.log(`[getTeamScouts] Contract ${i + 1}: scout_id=${c.scout_id}, save_game_id=${c.save_game_id}, role=${c.role}`);
  });
  
  // Double-check all contracts have correct save_game_id
  const invalidContracts = contracts.filter(c => c.save_game_id !== saveGameId);
  if (invalidContracts.length > 0) {
    console.error(`[getTeamScouts] ⚠️ Found ${invalidContracts.length} contracts with wrong save_game_id!`);
    invalidContracts.forEach(c => {
      console.error(`[getTeamScouts] Invalid contract: scout_id=${c.scout_id}, expected save_game_id=${saveGameId}, got ${c.save_game_id}`);
    });
    // Filter them out
    contracts.splice(0, contracts.length, ...contracts.filter(c => c.save_game_id === saveGameId));
    console.log(`[getTeamScouts] After filtering invalid contracts: ${contracts.length} valid contracts`);
  }
  
  // Get scout details (must belong to this save game)
  const scoutIds = contracts.map((c) => c.scout_id);
  const { data: scouts, error: scoutsError } = await supabase
    .from("scouts")
    .select("*")
    .in("id", scoutIds)
    .eq("save_game_id", saveGameId);
  
  if (scoutsError) {
    console.error("Error fetching scouts:", scoutsError);
    return [];
  }
  
  if (!scouts) {
    return [];
  }
  
  // Combine scouts with contracts, ensuring contract matches
  const result = scouts
    .map((scout) => {
      const contract = contracts.find((c) => c.scout_id === scout.id && c.save_game_id === saveGameId);
      if (!contract) {
        console.warn(`No matching contract found for scout ${scout.id} in save game ${saveGameId}`);
        return null;
      }
      return {
        ...scout,
        contract: contract,
      };
    })
    .filter((item): item is Scout & { contract: ScoutContract } => item !== null);
  
  return result;
}

/**
 * Validate that team has exactly 4 scouts, one of each archetype
 */
export async function validateScoutingDepartment(
  teamId: string,
  saveGameId: string
): Promise<{ valid: boolean; errors: string[] }> {
  const scouts = await getTeamScouts(teamId, saveGameId);
  const errors: string[] = [];
  
  if (scouts.length !== 4) {
    errors.push(`Must have exactly 4 scouts. Currently have ${scouts.length}.`);
  }
  
  const archetypes = new Set(scouts.map((s) => s.archetype));
  const requiredArchetypes: ScoutArchetype[] = [
    "evaluator",
    "tape_grinder",
    "character_coach",
    "athletic_analyst",
  ];
  
  for (const required of requiredArchetypes) {
    if (!archetypes.has(required)) {
      errors.push(`Missing ${required} archetype.`);
    }
  }
  
  // Check for duplicates
  const archetypeCounts = new Map<ScoutArchetype, number>();
  scouts.forEach((s) => {
    archetypeCounts.set(s.archetype, (archetypeCounts.get(s.archetype) || 0) + 1);
  });
  
  for (const [archetype, count] of archetypeCounts.entries()) {
    if (count > 1) {
      errors.push(`Duplicate ${archetype} archetype (have ${count}).`);
    }
  }
  
  return {
    valid: errors.length === 0,
    errors,
  };
}

