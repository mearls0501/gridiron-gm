import { supabase } from "@/lib/supabase-client";
import { upsertPlayerContract, upsertProspectContract } from "@/lib/utils/player-contracts";

/**
 * CPU logic for automatically resigning players during week 23 (resign phase)
 * Teams will resign their good players and let poor performers/old players go to FA
 */
export async function cpuResignPlayers(
  saveGameId: string,
  season: number,
  userTeamId?: string
): Promise<{
  success: boolean;
  playersResigned: number;
  error?: string;
}> {
  const startTime = Date.now();
  console.log(`[CPU Resign] Starting CPU player resignings for season ${season}`);

  try {
    // Get all teams except user team
    const { data: teams } = await supabase
      .from("teams")
      .select("id, name");

    if (!teams) {
      return { success: false, playersResigned: 0, error: "No teams found" };
    }

    const cpuTeams = teams.filter((t) => t.id !== userTeamId);
    console.log(`[CPU Resign] Processing ${cpuTeams.length} CPU teams`);

    // Fetch ALL expiring contracts and team data in batch
    const { data: allContracts } = await supabase
      .from("player_contracts_per_save_game")
      .select(`
        *,
        players (id, full_name, position, overall, age),
        draft_prospects (id, full_name, position, overall, age)
      `)
      .eq("save_game_id", saveGameId)
      .or("contract_year_2.is.null,contract_year_2.eq.0")
      .not("team_id", "is", null);

    if (!allContracts) {
      console.log(`[CPU Resign] No expiring contracts found`);
      return { success: true, playersResigned: 0 };
    }

    console.log(`[CPU Resign] Found ${allContracts.length} total expiring contracts`);

    // Fetch all current team contracts to calculate cap space
    const { data: currentContracts } = await supabase
      .from("player_contracts_per_save_game")
      .select("team_id, contract_year_1")
      .eq("save_game_id", saveGameId);

    const teamCapHits = new Map<string, number>();
    (currentContracts || []).forEach((contract: any) => {
      const current = teamCapHits.get(contract.team_id) || 0;
      teamCapHits.set(contract.team_id, current + (contract.contract_year_1 || 0));
    });

    const SALARY_CAP = 255000000;
    const contractsToUpdate: Array<{
      playerId: string | null;
      prospectId: string | null;
      teamId: string;
      contract: any;
    }> = [];

    // Process each CPU team
    for (const team of cpuTeams) {
      const teamContracts = allContracts.filter((c: any) => c.team_id === team.id);
      
      if (teamContracts.length === 0) continue;

      const currentCapHit = teamCapHits.get(team.id) || 0;
      const availableCap = SALARY_CAP - currentCapHit;

      console.log(`[CPU Resign] ${team.name}: ${teamContracts.length} expiring contracts, $${(availableCap / 1000000).toFixed(1)}M cap available`);

      // Sort players by value (overall rating, age)
      const playersByValue = teamContracts
        .map((contract: any) => {
          const player = contract.players || contract.draft_prospects;
          if (!player) return null;

          const overall = player.overall || 0;
          const age = player.age || 25;
          
          // Value score: Higher overall is better, younger is better
          // Penalty for old players (30+)
          const agePenalty = age >= 30 ? (age - 29) * 2 : 0;
          const valueScore = overall - agePenalty;

          return {
            playerId: contract.player_id,
            prospectId: contract.prospect_id,
            teamId: contract.team_id,
            player,
            overall,
            age,
            valueScore,
            currentSalary: contract.contract_year_1 || 0,
          };
        })
        .filter((p): p is NonNullable<typeof p> => p !== null)
        .sort((a, b) => b.valueScore - a.valueScore);

      // Resign logic:
      // - Must resign: overall >= 80 (star players)
      // - Should resign: overall >= 70 and age < 32 (solid players)
      // - Maybe resign: overall >= 65 and age < 30 (depth players) - only if cap allows
      // - Don't resign: everyone else goes to FA

      let usedCap = currentCapHit;

      for (const playerData of playersByValue) {
        const { overall, age, playerId, prospectId, teamId, player } = playerData;
        
        // Determine if we should resign
        let shouldResign = false;
        let priorityLevel = 0;

        if (overall >= 80) {
          shouldResign = true;
          priorityLevel = 3; // Must resign
        } else if (overall >= 70 && age < 32) {
          shouldResign = true;
          priorityLevel = 2; // Should resign
        } else if (overall >= 65 && age < 30) {
          shouldResign = Math.random() < 0.6; // 60% chance
          priorityLevel = 1; // Maybe resign
        }

        if (!shouldResign) {
          console.log(`[CPU Resign] ${team.name}: Letting ${player.full_name} (${overall} OVR, ${age} yrs) walk`);
          continue;
        }

        // Generate contract offer based on overall and position
        const contract = generateCPUContractOffer(player.position, overall, age);
        
        // Check if team can afford
        const newCapHit = usedCap + contract.year1;
        if (newCapHit > SALARY_CAP * 0.95) {
          // Team is at 95% of cap, stop resigning unless star player
          if (priorityLevel < 3) {
            console.log(`[CPU Resign] ${team.name}: Can't afford ${player.full_name}, letting walk (cap: ${(newCapHit / 1000000).toFixed(1)}M)`);
            continue;
          }
        }

        // Queue for batch update
        contractsToUpdate.push({
          playerId,
          prospectId,
          teamId,
          contract,
        });

        usedCap = newCapHit;
        console.log(`[CPU Resign] ${team.name}: Resigning ${player.full_name} (${overall} OVR) - ${contract.years}yr/$${(contract.year1 / 1000000).toFixed(1)}M`);
      }
    }

    console.log(`[CPU Resign] Prepared ${contractsToUpdate.length} resignings. Executing batch operations...`);

    // Batch update contracts
    let playersResigned = 0;
    for (const item of contractsToUpdate) {
      const contractData = {
        team_id: item.teamId,
        contract_year_1: item.contract.year1,
        contract_year_2: item.contract.year2,
        contract_year_3: item.contract.year3,
        contract_year_4: item.contract.year4,
        signing_bonus: item.contract.signingBonus,
        contract_expires_season: season + item.contract.years,
      };

      // Use appropriate upsert function for player vs prospect
      const result = item.playerId
        ? await upsertPlayerContract(item.playerId, saveGameId, contractData)
        : await upsertProspectContract(item.prospectId!, saveGameId, contractData);

      if (result.success) {
        playersResigned++;
      } else {
        console.error(`[CPU Resign] Failed to resign ${item.playerId ? 'player' : 'prospect'}:`, result.error);
      }
    }

    console.log(`[CPU Resign] Completed in ${Date.now() - startTime}ms. ${playersResigned} players resigned.`);
    return { success: true, playersResigned };
  } catch (error) {
    console.error("[CPU Resign] Error during CPU resignings:", error);
    return {
      success: false,
      playersResigned: 0,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Generate a fair contract offer for a player based on their ratings
 */
function generateCPUContractOffer(
  position: string,
  overall: number,
  age: number
): {
  year1: number;
  year2: number;
  year3: number;
  year4: number;
  years: number;
  signingBonus: number;
} {
  // Base salary based on overall rating
  let baseSalary = 500000; // League minimum
  
  if (overall >= 90) {
    baseSalary = 25000000; // Superstar
  } else if (overall >= 85) {
    baseSalary = 18000000; // Elite
  } else if (overall >= 80) {
    baseSalary = 12000000; // Star
  } else if (overall >= 75) {
    baseSalary = 8000000; // Starter
  } else if (overall >= 70) {
    baseSalary = 4000000; // Solid
  } else if (overall >= 65) {
    baseSalary = 2000000; // Backup
  } else {
    baseSalary = 1000000; // Depth
  }

  // Position multipliers
  const positionMultipliers: Record<string, number> = {
    QB: 1.3,
    DE: 1.15,
    CB: 1.1,
    WR: 1.1,
    OT: 1.1,
    DT: 1.05,
    LB: 1.0,
    S: 0.95,
    TE: 0.95,
    RB: 0.85,
    OG: 0.9,
    C: 0.9,
  };

  const multiplier = positionMultipliers[position] || 1.0;
  baseSalary = Math.round(baseSalary * multiplier);

  // Contract length based on age and overall
  let years = 1;
  if (overall >= 85 && age < 30) {
    years = 4; // Long-term deal for young stars
  } else if (overall >= 80 && age < 28) {
    years = 4;
  } else if (overall >= 75 && age < 30) {
    years = 3;
  } else if (overall >= 70 && age < 32) {
    years = 2;
  } else {
    years = 1; // Short deal for aging/mediocre players
  }

  // Signing bonus (10-20% of year 1 for good players)
  const signingBonus = overall >= 75 ? Math.round(baseSalary * 0.15) : 0;

  // Build contract array
  const contractYears = [baseSalary, 0, 0, 0];
  for (let i = 1; i < years; i++) {
    // Slight salary progression (5% per year)
    contractYears[i] = Math.round(baseSalary * Math.pow(1.05, i));
  }

  return {
    year1: contractYears[0],
    year2: contractYears[1],
    year3: contractYears[2],
    year4: contractYears[3],
    years,
    signingBonus,
  };
}

