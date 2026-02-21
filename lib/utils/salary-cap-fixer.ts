import { supabase } from "@/lib/supabase-client";
import { calculateTeamCapHit } from "@/lib/utils/player-contracts";

const SALARY_CAP = 255000000;

/**
 * Automatically cut players to get a team under the salary cap
 * Prioritizes cutting highest-paid, lowest-rated players
 */
export async function autoFixSalaryCap(
  teamId: string,
  saveGameId: string
): Promise<{
  success: boolean;
  playersCut: number;
  capSavings: number;
  error?: string;
}> {
  const startTime = Date.now();
  console.log(`[Cap Fixer] Starting auto-fix for team ${teamId}`);

  try {
    // Get current season/week for transactions
    const { data: saveGame } = await supabase
      .from("save_games")
      .select("current_season, current_week")
      .eq("id", saveGameId)
      .single();

    const currentSeason = saveGame?.current_season || 2025;
    const currentWeek = saveGame?.current_week || 1;

    // Calculate current cap situation
    const currentCapHit = await calculateTeamCapHit(teamId, saveGameId);
    const capOverage = currentCapHit - SALARY_CAP;

    if (capOverage <= 0) {
      console.log(`[Cap Fixer] Team is already under cap`);
      return { success: true, playersCut: 0, capSavings: 0 };
    }

    console.log(`[Cap Fixer] Team is $${(capOverage / 1000000).toFixed(1)}M over cap`);

    // Get all players on team with their contracts
    const { data: assignments } = await supabase
      .from("player_team_assignments")
      .select(`
        player_id,
        prospect_id,
        players (id, full_name, position, overall, age),
        draft_prospects (id, full_name, position, overall, age)
      `)
      .eq("team_id", teamId)
      .eq("save_game_id", saveGameId);

    if (!assignments || assignments.length === 0) {
      return { success: false, playersCut: 0, capSavings: 0, error: "No players found on team" };
    }

    // Get all contracts for players on this team
    const { data: contracts } = await supabase
      .from("player_contracts_per_save_game")
      .select("player_id, prospect_id, contract_year_1")
      .eq("team_id", teamId)
      .eq("save_game_id", saveGameId);

    // Create a map of player/prospect -> contract year 1 salary
    const salaryMap = new Map<string, number>();
    (contracts || []).forEach((c: any) => {
      const id = c.player_id || c.prospect_id;
      if (id) {
        salaryMap.set(id, c.contract_year_1 || 0);
      }
    });

    // Build list of cuttable players with their value
    const cuttablePlayers = assignments
      .map((assignment: any) => {
        const player = assignment.players || assignment.draft_prospects;
        if (!player) return null;

        const id = assignment.player_id || assignment.prospect_id;
        const salary = salaryMap.get(id) || 0;
        const overall = player.overall || 0;
        const age = player.age || 25;

        // Calculate "cut value" - prioritize cutting expensive + low-rated players
        // Higher value = more likely to cut
        const salaryFactor = salary / 1000000; // Salary in millions
        const talentPenalty = 100 - overall; // Lower overall = higher penalty
        const cutValue = salaryFactor * (1 + talentPenalty / 50);

        return {
          id,
          playerId: assignment.player_id,
          prospectId: assignment.prospect_id,
          name: player.full_name,
          position: player.position,
          overall,
          age,
          salary,
          cutValue,
        };
      })
      .filter((p): p is NonNullable<typeof p> => p !== null)
      .sort((a, b) => b.cutValue - a.cutValue); // Highest cut value first

    console.log(`[Cap Fixer] Found ${cuttablePlayers.length} players on roster`);

    // Cut players until under cap
    let totalSavings = 0;
    const playersToCut: Array<{
      playerId?: string;
      prospectId?: string;
      name: string;
      position: string;
      salary: number;
      overall: number;
    }> = [];

    for (const player of cuttablePlayers) {
      if (totalSavings >= capOverage) break;

      console.log(`[Cap Fixer] Cutting ${player.name} (${player.overall} OVR, $${(player.salary / 1000000).toFixed(1)}M)`);

      playersToCut.push({
        playerId: player.playerId,
        prospectId: player.prospectId,
        name: player.name,
        position: player.position,
        salary: player.salary,
        overall: player.overall,
      });

      totalSavings += player.salary;
    }

    console.log(`[Cap Fixer] Cutting ${playersToCut.length} players to save $${(totalSavings / 1000000).toFixed(1)}M`);

    // Prepare batch operations
    const playerIdsToDelete: string[] = [];
    const prospectIdsToDelete: string[] = [];
    const freeAgentsToAdd: any[] = [];
    const transactionsToInsert: any[] = [];

    for (const player of playersToCut) {
      if (player.playerId) {
        playerIdsToDelete.push(player.playerId);
        freeAgentsToAdd.push({
          player_id: player.playerId,
          prospect_id: null,
          save_game_id: saveGameId,
          archived: false,
        });
      } else if (player.prospectId) {
        prospectIdsToDelete.push(player.prospectId);
        freeAgentsToAdd.push({
          player_id: null,
          prospect_id: player.prospectId,
          save_game_id: saveGameId,
          archived: false,
        });
      }

      // Log transaction for each cut player
      transactionsToInsert.push({
        player_id: player.playerId || null,
        prospect_id: player.prospectId || null,
        from_team_id: teamId,
        to_team_id: null,
        transaction_type: "released",
        season: currentSeason,
        week: currentWeek,
        save_game_id: saveGameId,
        details: JSON.stringify({
          player_name: player.name,
          position: player.position,
          salary_freed: player.salary,
          overall: player.overall,
          reason: "salary_cap_cut",
        }),
      });
    }

    // Batch delete assignments
    if (playerIdsToDelete.length > 0) {
      await supabase
        .from("player_team_assignments")
        .delete()
        .eq("team_id", teamId)
        .eq("save_game_id", saveGameId)
        .in("player_id", playerIdsToDelete);
    }

    if (prospectIdsToDelete.length > 0) {
      await supabase
        .from("player_team_assignments")
        .delete()
        .eq("team_id", teamId)
        .eq("save_game_id", saveGameId)
        .in("prospect_id", prospectIdsToDelete);
    }

    // Batch update contracts (set team_id to null)
    if (playerIdsToDelete.length > 0) {
      await supabase
        .from("player_contracts_per_save_game")
        .update({ team_id: null })
        .eq("save_game_id", saveGameId)
        .in("player_id", playerIdsToDelete);
    }

    if (prospectIdsToDelete.length > 0) {
      await supabase
        .from("player_contracts_per_save_game")
        .update({ team_id: null })
        .eq("save_game_id", saveGameId)
        .in("prospect_id", prospectIdsToDelete);
    }

    // Batch insert free agents
    if (freeAgentsToAdd.length > 0) {
      await supabase
        .from("free_agent_availability")
        .insert(freeAgentsToAdd);
    }

    // Batch insert transactions
    if (transactionsToInsert.length > 0) {
      await supabase
        .from("transactions")
        .insert(transactionsToInsert);
    }

    const playersCutCount = playersToCut.length;

    console.log(`[Cap Fixer] Completed in ${Date.now() - startTime}ms. Cut ${playersCutCount} players, saved $${(totalSavings / 1000000).toFixed(1)}M`);

    return {
      success: true,
      playersCut: playersCutCount,
      capSavings: totalSavings,
    };
  } catch (error) {
    console.error("[Cap Fixer] Error during auto-fix:", error);
    return {
      success: false,
      playersCut: 0,
      capSavings: 0,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Get salary cap status for a team
 */
export async function getTeamCapStatus(
  teamId: string,
  saveGameId: string
): Promise<{
  currentCapHit: number;
  capSpace: number;
  capOverage: number;
  isCompliant: boolean;
  percentUsed: number;
}> {
  const currentCapHit = await calculateTeamCapHit(teamId, saveGameId);
  const capSpace = SALARY_CAP - currentCapHit;
  const capOverage = Math.max(0, currentCapHit - SALARY_CAP);
  const isCompliant = currentCapHit <= SALARY_CAP;
  const percentUsed = (currentCapHit / SALARY_CAP) * 100;

  return {
    currentCapHit,
    capSpace,
    capOverage,
    isCompliant,
    percentUsed,
  };
}

