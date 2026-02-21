/**
 * Roster replenishment utility
 * Automatically fills rosters to 53 players with appropriate position distribution
 */

import { supabase } from "@/lib/supabase-client";
import { generatePlayer } from "@/lib/player-generator";
import { generateContract } from "@/lib/contract-generator";
import { upsertPlayerContract } from "./player-contracts";

const TARGET_ROSTER_SIZE = 53;

// NFL position distribution (approximate)
const POSITION_DISTRIBUTION: Record<string, number> = {
  QB: 3,
  RB: 4,
  WR: 6,
  TE: 3,
  OT: 4,
  OG: 4,
  C: 2,
  DE: 4,
  DT: 4,
  LB: 6,
  CB: 5,
  S: 4,
  K: 1,
  P: 1,
};

// Total: 51, but we'll fill to 53 (extra 2 can be any position)

interface RosterReplenishmentResult {
  success: boolean;
  teamsProcessed: number;
  playersAdded: number;
  errors: string[];
  details: Array<{
    teamId: string;
    teamName: string;
    beforeSize: number;
    afterSize: number;
    playersAdded: number;
  }>;
}

/**
 * Get current roster size for a team
 */
async function getTeamRosterSize(
  teamId: string,
  saveGameId: string
): Promise<number> {
  const { count, error } = await supabase
    .from("player_team_assignments")
    .select("*", { count: "exact", head: true })
    .eq("team_id", teamId)
    .eq("save_game_id", saveGameId);

  if (error) {
    console.error(`Error getting roster size for team ${teamId}:`, error);
    return 0;
  }

  return count || 0;
}

/**
 * Get current position distribution for a team
 */
async function getTeamPositionDistribution(
  teamId: string,
  saveGameId: string
): Promise<Map<string, number>> {
  const { data: assignments, error } = await supabase
    .from("player_team_assignments")
    .select(`
      player_id,
      prospect_id,
      players (position),
      draft_prospects (position)
    `)
    .eq("team_id", teamId)
    .eq("save_game_id", saveGameId);

  if (error || !assignments) {
    return new Map();
  }

  const positionCounts = new Map<string, number>();
  assignments.forEach((assignment: any) => {
    const position =
      assignment.players?.position || assignment.draft_prospects?.position;
    if (position) {
      positionCounts.set(position, (positionCounts.get(position) || 0) + 1);
    }
  });

  return positionCounts;
}

/**
 * Find available free agents for a position
 * Only searches free_agent_availability for this save game
 * Checks both players AND draft_prospects
 * Excludes players/prospects already on teams in this save game
 * @param position - Position to search for, or null for any position
 */
async function findFreeAgentForPosition(
  position: string | null,
  saveGameId: string,
  excludePlayerIds: Set<string>
): Promise<{ playerId: string | null; prospectId: string | null } | null> {
  try {
    // Get all players and prospects already on teams in this save game
    const { data: assignments, error: assignedError } = await supabase
      .from("player_team_assignments")
      .select("player_id, prospect_id")
      .eq("save_game_id", saveGameId);

    if (assignedError) {
      console.error(`[FindFreeAgent] Error fetching assignments:`, assignedError);
    }

    const assignedPlayerIds = new Set(
      (assignments || []).map((a) => a.player_id).filter(Boolean)
    );
    const assignedProspectIds = new Set(
      (assignments || []).map((a) => a.prospect_id).filter(Boolean)
    );

    // Combine with excludePlayerIds
    const allExcludedPlayerIds = new Set([
      ...Array.from(excludePlayerIds),
      ...Array.from(assignedPlayerIds),
    ]);

    console.log(`[FindFreeAgent] Looking for ${position || 'ANY POSITION'}, excluding ${allExcludedPlayerIds.size} players, ${assignedProspectIds.size} prospects`);

    // Query free_agent_availability for BOTH players and prospects
    const { data: available, error: availError } = await supabase
      .from("free_agent_availability")
      .select(`
        player_id,
        prospect_id,
        players (id, full_name, position, overall),
        draft_prospects (id, full_name, position, overall)
      `)
      .eq("save_game_id", saveGameId)
      .eq("archived", false)
      .limit(500);

    if (availError) {
      console.error(`[FindFreeAgent] Error in free_agent_availability query:`, availError);
      return null;
    }

    if (!available || available.length === 0) {
      console.warn(`[FindFreeAgent] No free agents in database for save game ${saveGameId}`);
      return null;
    }

    // Filter and map to a unified format
    const candidates: Array<{
      id: string;
      name: string;
      position: string;
      overall: number;
      isPlayer: boolean;
    }> = [];

    for (const agent of available) {
      const agentData = agent as any;
      
      // Check if it's a player
      if (agentData.player_id && agentData.players) {
        const player = agentData.players;
        // Match position if specified, or accept any position if null
        const positionMatch = position === null || player.position === position;
        if (
          positionMatch &&
          !allExcludedPlayerIds.has(agentData.player_id)
        ) {
          candidates.push({
            id: agentData.player_id,
            name: player.full_name || 'Unknown',
            position: player.position,
            overall: player.overall || 0,
            isPlayer: true,
          });
        }
      }
      
      // Check if it's a prospect
      if (agentData.prospect_id && agentData.draft_prospects) {
        const prospect = agentData.draft_prospects;
        // Match position if specified, or accept any position if null
        const positionMatch = position === null || prospect.position === position;
        if (
          positionMatch &&
          !assignedProspectIds.has(agentData.prospect_id)
        ) {
          candidates.push({
            id: agentData.prospect_id,
            name: prospect.full_name || 'Unknown',
            position: prospect.position,
            overall: prospect.overall || 0,
            isPlayer: false,
          });
        }
      }
    }

    if (candidates.length === 0) {
      console.warn(`[FindFreeAgent] No ${position || 'any'} free agents available after filtering`);
      return null;
    }

    // Sort by overall rating (highest first)
    candidates.sort((a, b) => b.overall - a.overall);

    const selected = candidates[0];
    console.log(`[FindFreeAgent] Found ${candidates.length} ${position || 'any position'} free agents, selecting: ${selected.name} ${selected.position} (OVR: ${selected.overall}, ${selected.isPlayer ? 'Player' : 'Prospect'})`);

    return selected.isPlayer
      ? { playerId: selected.id, prospectId: null }
      : { playerId: null, prospectId: selected.id };
  } catch (err) {
    console.error(`[FindFreeAgent] Exception finding free agent for ${position}:`, err);
    return null;
  }
}

/**
 * Add a player or prospect to a team (create assignment and contract)
 */
async function addPlayerToTeam(
  playerId: string | null,
  prospectId: string | null,
  teamId: string,
  saveGameId: string,
  season: number,
  week: number
): Promise<{ success: boolean; error?: string }> {
  try {
    // 1. Create player_team_assignment
    const { error: assignmentError } = await supabase
      .from("player_team_assignments")
      .insert({
        player_id: playerId,
        prospect_id: prospectId,
        team_id: teamId,
        save_game_id: saveGameId,
        assigned_reason: "auto_replenish",
        season: season,
        week: week,
      });

    if (assignmentError) {
      // If it's a duplicate, that's okay - already on team
      if (
        assignmentError.code === "23505" ||
        assignmentError.message?.includes("unique constraint")
      ) {
        return { success: true };
      }
      return { success: false, error: assignmentError.message };
    }

    // 2. Get player/prospect data to generate contract
    let position: string;
    let overall: number;

    if (playerId) {
      const { data: player } = await supabase
        .from("players")
        .select("position, overall")
        .eq("id", playerId)
        .single();

      if (!player) {
        return { success: false, error: "Player not found" };
      }
      position = player.position;
      overall = player.overall;
    } else if (prospectId) {
      const { data: prospect } = await supabase
        .from("draft_prospects")
        .select("position, overall")
        .eq("id", prospectId)
        .single();

      if (!prospect) {
        return { success: false, error: "Prospect not found" };
      }
      position = prospect.position;
      overall = prospect.overall;
    } else {
      return { success: false, error: "No player or prospect ID provided" };
    }

    // 3. Generate contract based on position and overall
    const contract = generateContract(position, overall);

    // 4. Create contract (1 year minimum contract) - only for players, not prospects
    if (playerId) {
      const contractResult = await upsertPlayerContract(playerId, saveGameId, {
        team_id: teamId,
        contract_year_1: contract.contract_year_1 || 500000, // Minimum $500k
        contract_year_2: null, // 1-year contract
        contract_year_3: null,
        contract_year_4: null,
        signing_bonus: 0,
        contract_expires_season: season, // Expires at end of current season
      });

      if (!contractResult.success) {
        console.warn(
          `Failed to create contract for player ${playerId}, but assignment was created`
        );
      }
    }

    // 5. Remove from free agent availability
    const deleteQuery = supabase
      .from("free_agent_availability")
      .delete()
      .eq("save_game_id", saveGameId);

    if (playerId) {
      await deleteQuery.eq("player_id", playerId);
    } else if (prospectId) {
      await deleteQuery.eq("prospect_id", prospectId);
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Replenish a single team's roster to 53 players
 * OPTIMIZED VERSION: Uses cached free agent data passed from parent
 */
async function replenishTeamRoster(
  teamId: string,
  teamName: string,
  saveGameId: string,
  season: number,
  week: number,
  cachedFreeAgents?: Array<{
    id: string;
    name: string;
    position: string;
    overall: number;
    isPlayer: boolean;
  }>,
  assignedIds?: Set<string>
): Promise<{
  success: boolean;
  beforeSize: number;
  afterSize: number;
  playersAdded: number;
  error?: string;
}> {
  const beforeSize = await getTeamRosterSize(teamId, saveGameId);

  if (beforeSize >= TARGET_ROSTER_SIZE) {
    return {
      success: true,
      beforeSize,
      afterSize: beforeSize,
      playersAdded: 0,
    };
  }

  const playersNeeded = TARGET_ROSTER_SIZE - beforeSize;
  const positionDistribution = await getTeamPositionDistribution(
    teamId,
    saveGameId
  );

  // First, fill missing positions based on target distribution
  const positionsToFill: string[] = [];
  for (const [position, targetCount] of Object.entries(POSITION_DISTRIBUTION)) {
    const currentCount = positionDistribution.get(position) || 0;
    const needed = Math.max(0, targetCount - currentCount);
    for (let i = 0; i < needed; i++) {
      positionsToFill.push(position);
    }
  }

  // Fill remaining slots with any position (prioritize depth positions)
  const remainingSlots = playersNeeded - positionsToFill.length;
  const depthPositions = ["WR", "CB", "LB", "DE", "DT", "OT", "OG"];
  for (let i = 0; i < remainingSlots; i++) {
    positionsToFill.push(
      depthPositions[i % depthPositions.length] || "WR"
    );
  }

  let playersAdded = 0;
  const errors: string[] = [];

  // Batch: Collect all players to add first, then do batch operations
  const playersToAdd: Array<{
    playerId: string | null;
    prospectId: string | null;
    position: string;
    overall: number;
  }> = [];

  // Use cached free agents if provided, otherwise fall back to query method
  let availableFreeAgents = cachedFreeAgents;
  
  if (!availableFreeAgents) {
    // Fallback: Load free agents using existing function (slower)
    const excludedIds = assignedIds || new Set<string>();
    
    for (const position of positionsToFill.slice(0, playersNeeded)) {
      let freeAgent = await findFreeAgentForPosition(
        position,
        saveGameId,
        excludedIds
      );

      if (!freeAgent || (!freeAgent.playerId && !freeAgent.prospectId)) {
        freeAgent = await findFreeAgentForPosition(
          null,
          saveGameId,
          excludedIds
        );
      }

      if (!freeAgent || (!freeAgent.playerId && !freeAgent.prospectId)) {
        errors.push(`No free agent available for position ${position}`);
        continue;
      }

      // Get player/prospect data
      let playerPosition: string;
      let playerOverall: number;

      if (freeAgent.playerId) {
        const { data: player } = await supabase
          .from("players")
          .select("position, overall")
          .eq("id", freeAgent.playerId)
          .single();
        
        if (!player) continue;
        playerPosition = player.position;
        playerOverall = player.overall;
        excludedIds.add(freeAgent.playerId);
      } else if (freeAgent.prospectId) {
        const { data: prospect } = await supabase
          .from("draft_prospects")
          .select("position, overall")
          .eq("id", freeAgent.prospectId)
          .single();
        
        if (!prospect) continue;
        playerPosition = prospect.position;
        playerOverall = prospect.overall;
        excludedIds.add(freeAgent.prospectId!);
      } else {
        continue;
      }

      playersToAdd.push({
        playerId: freeAgent.playerId,
        prospectId: freeAgent.prospectId,
        position: playerPosition,
        overall: playerOverall,
      });
    }
  } else {
    // Optimized path: Use cached free agents
    const usedIds = assignedIds || new Set<string>();
    
    for (const position of positionsToFill.slice(0, playersNeeded)) {
      // Find best available free agent for this position
      let candidates = availableFreeAgents.filter(
        (fa) => fa.position === position && !usedIds.has(fa.id)
      );

      // If no match for specific position, try any position
      if (candidates.length === 0) {
        candidates = availableFreeAgents.filter((fa) => !usedIds.has(fa.id));
      }

      if (candidates.length === 0) {
        errors.push(`No free agent available for position ${position}`);
        continue;
      }

      // Sort by overall and take the best
      candidates.sort((a, b) => b.overall - a.overall);
      const selected = candidates[0];
      
      usedIds.add(selected.id);
      playersToAdd.push({
        playerId: selected.isPlayer ? selected.id : null,
        prospectId: selected.isPlayer ? null : selected.id,
        position: selected.position,
        overall: selected.overall,
      });
    }
  }

  console.log(`[ReplenishRoster] ${teamName}: Found ${playersToAdd.length} players to add. Executing batch operations...`);

  // Batch insert assignments
  if (playersToAdd.length > 0) {
    const assignmentsToInsert = playersToAdd.map((p) => ({
      player_id: p.playerId,
      prospect_id: p.prospectId,
      team_id: teamId,
      save_game_id: saveGameId,
      assigned_reason: "auto_replenish",
      season: season,
      week: week,
    }));

    const { error: assignmentError } = await supabase
      .from("player_team_assignments")
      .insert(assignmentsToInsert);

    if (assignmentError) {
      console.error(`[ReplenishRoster] ${teamName}: Failed to batch insert assignments:`, assignmentError);
      errors.push(`Failed to insert assignments: ${assignmentError.message}`);
    } else {
      console.log(`[ReplenishRoster] ${teamName}: Created ${assignmentsToInsert.length} assignments`);
      playersAdded = assignmentsToInsert.length;
    }

    // Check if adding these players would put team over cap
  const { calculateTeamCapHit } = await import("@/lib/utils/player-contracts");
  const currentCapHit = await calculateTeamCapHit(teamId, saveGameId);
  const SALARY_CAP = 255000000;

  // Batch insert contracts (only for players, not prospects)
  const contractsToInsert = playersToAdd
    .filter((p) => p.playerId)
    .map((p) => {
      const contract = generateContract(p.position, p.overall);
      return {
        player_id: p.playerId,
        save_game_id: saveGameId,
        team_id: teamId,
        contract_year_1: contract.contract_year_1 || 500000,
        contract_year_2: null,
        contract_year_3: null,
        contract_year_4: null,
        signing_bonus: 0,
        contract_expires_season: season,
      };
    });

  // Calculate total cost of new contracts
  const newContractsCost = contractsToInsert.reduce((sum, c) => sum + c.contract_year_1, 0);
  const projectedCapHit = currentCapHit + newContractsCost;

  // If this would put team over cap, don't add these players
  if (projectedCapHit > SALARY_CAP) {
    console.warn(`[ReplenishRoster] ${teamName}: Would go over cap ($${(projectedCapHit / 1000000).toFixed(1)}M / $${(SALARY_CAP / 1000000).toFixed(1)}M), skipping replenishment`);
    const afterSize = await getTeamRosterSize(teamId, saveGameId);
    return {
      success: true,
      beforeSize,
      afterSize,
      playersAdded: 0,
      error: "Skipped to avoid cap violation",
    };
  }

    if (contractsToInsert.length > 0) {
      const { error: contractError } = await supabase
        .from("player_contracts_per_save_game")
        .insert(contractsToInsert);

      if (contractError) {
        console.error(`[ReplenishRoster] ${teamName}: Failed to batch insert contracts:`, contractError);
      } else {
        console.log(`[ReplenishRoster] ${teamName}: Created ${contractsToInsert.length} contracts`);
      }
    }

    // Batch delete from free agent availability
    const playerIdsToRemove = playersToAdd.filter((p) => p.playerId).map((p) => p.playerId!);
    const prospectIdsToRemove = playersToAdd.filter((p) => p.prospectId).map((p) => p.prospectId!);

    if (playerIdsToRemove.length > 0) {
      await supabase
        .from("free_agent_availability")
        .delete()
        .eq("save_game_id", saveGameId)
        .in("player_id", playerIdsToRemove);
    }

    if (prospectIdsToRemove.length > 0) {
      await supabase
        .from("free_agent_availability")
        .delete()
        .eq("save_game_id", saveGameId)
        .in("prospect_id", prospectIdsToRemove);
    }
  }

  const afterSize = await getTeamRosterSize(teamId, saveGameId);
  console.log(`[ReplenishRoster] ${teamName}: ${beforeSize} → ${afterSize} players (added ${playersAdded})`);

  return {
    success: errors.length === 0 || playersAdded > 0,
    beforeSize,
    afterSize,
    playersAdded,
    error: errors.length > 0 ? errors.join("; ") : undefined,
  };
}

/**
 * Replenish all team rosters to 53 players
 * OPTIMIZED: Fetches all free agents once and processes in batches
 */
export async function replenishAllRosters(
  saveGameId: string,
  season: number,
  week: number
): Promise<RosterReplenishmentResult> {
  const startTime = Date.now();
  console.log(
    `[RosterReplenisher] Starting roster replenishment for saveGameId: ${saveGameId}, season: ${season}, week: ${week}`
  );

  // Get all teams
  const { data: teams, error: teamsError } = await supabase
    .from("teams")
    .select("id, name")
    .order("name");

  if (teamsError || !teams) {
    return {
      success: false,
      teamsProcessed: 0,
      playersAdded: 0,
      errors: [`Failed to fetch teams: ${teamsError?.message || "Unknown error"}`],
      details: [],
    };
  }

  // OPTIMIZATION: Fetch all free agents and assigned players ONCE at the start
  const fetchStart = Date.now();
  
  // Get all assigned players/prospects
  const { data: assignments } = await supabase
    .from("player_team_assignments")
    .select("player_id, prospect_id")
    .eq("save_game_id", saveGameId);

  const assignedIds = new Set<string>();
  (assignments || []).forEach((a) => {
    if (a.player_id) assignedIds.add(a.player_id);
    if (a.prospect_id) assignedIds.add(a.prospect_id);
  });

  // Get all available free agents
  const { data: available } = await supabase
    .from("free_agent_availability")
    .select(`
      player_id,
      prospect_id,
      players (id, full_name, position, overall),
      draft_prospects (id, full_name, position, overall)
    `)
    .eq("save_game_id", saveGameId)
    .eq("archived", false);

  // Convert to unified format
  const freeAgentsPool: Array<{
    id: string;
    name: string;
    position: string;
    overall: number;
    isPlayer: boolean;
  }> = [];

  (available || []).forEach((agent: any) => {
    if (agent.player_id && agent.players && !assignedIds.has(agent.player_id)) {
      freeAgentsPool.push({
        id: agent.player_id,
        name: agent.players.full_name || 'Unknown',
        position: agent.players.position,
        overall: agent.players.overall || 0,
        isPlayer: true,
      });
    }
    if (agent.prospect_id && agent.draft_prospects && !assignedIds.has(agent.prospect_id)) {
      freeAgentsPool.push({
        id: agent.prospect_id,
        name: agent.draft_prospects.full_name || 'Unknown',
        position: agent.draft_prospects.position,
        overall: agent.draft_prospects.overall || 0,
        isPlayer: false,
      });
    }
  });

  console.log(`[RosterReplenisher] Loaded ${freeAgentsPool.length} available free agents in ${Date.now() - fetchStart}ms`);

  const details: Array<{
    teamId: string;
    teamName: string;
    beforeSize: number;
    afterSize: number;
    playersAdded: number;
  }> = [];

  let totalPlayersAdded = 0;
  const errors: string[] = [];

  // Process each team with cached data
  for (const team of teams) {
    const result = await replenishTeamRoster(
      team.id,
      team.name,
      saveGameId,
      season,
      week,
      freeAgentsPool,
      assignedIds
    );

    details.push({
      teamId: team.id,
      teamName: team.name,
      beforeSize: result.beforeSize,
      afterSize: result.afterSize,
      playersAdded: result.playersAdded,
    });

    totalPlayersAdded += result.playersAdded;

    if (result.error) {
      errors.push(`${team.name}: ${result.error}`);
    }
  }

  const success = errors.length === 0 || totalPlayersAdded > 0;

  console.log(
    `[RosterReplenisher] Completed: ${totalPlayersAdded} players added across ${teams.length} teams in ${Date.now() - startTime}ms`
  );

  return {
    success,
    teamsProcessed: teams.length,
    playersAdded: totalPlayersAdded,
    errors,
    details,
  };
}

/**
 * Replenish a single team's roster
 */
export async function replenishTeamRosterOnly(
  teamId: string,
  saveGameId: string,
  season: number,
  week: number
): Promise<{
  success: boolean;
  beforeSize: number;
  afterSize: number;
  playersAdded: number;
  error?: string;
}> {
  const { data: team } = await supabase
    .from("teams")
    .select("id, name")
    .eq("id", teamId)
    .single();

  if (!team) {
    return {
      success: false,
      beforeSize: 0,
      afterSize: 0,
      playersAdded: 0,
      error: "Team not found",
    };
  }

  return replenishTeamRoster(teamId, team.name, saveGameId, season, week);
}

