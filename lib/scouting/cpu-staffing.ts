/**
 * CPU team auto-staffing system
 * Automatically staffs CPU teams with remaining scouts after user finishes hiring
 */

import { supabase } from "@/lib/supabase-client";
import { getAvailableScouts, hireScout, validateHiringBudget } from "./hiring";
import { assignPriority } from "./priorities";
import { generateScoutPool } from "./scout-generator";
import { ScoutArchetype, PriorityLevel } from "./types";
import { random } from "@/lib/utils";

/**
 * Auto-staff all CPU teams with scouts
 * Called after user finishes hiring their scouts
 */
export async function autoStaffCPUTeams(
  saveGameId: string,
  season: number,
  userTeamId?: string
): Promise<{ success: boolean; error?: string; staffedTeams: number }> {
  try {
    // Get user's team ID from save game if not provided
    let actualUserTeamId = userTeamId;
    if (!actualUserTeamId && saveGameId) {
      const { data: saveGame } = await supabase
        .from("save_games")
        .select("selected_team_id")
        .eq("id", saveGameId)
        .single();
      
      if (saveGame?.selected_team_id) {
        actualUserTeamId = saveGame.selected_team_id;
      }
    }
    
    // Get all teams (teams table doesn't have save_game_id, so load all)
    const { data: allTeams, error: teamsError } = await supabase
      .from("teams")
      .select("id, name");
    
    if (teamsError) {
      console.error("Error loading teams:", teamsError);
      return { success: false, error: `Failed to load teams: ${teamsError.message}`, staffedTeams: 0 };
    }
    
    if (!allTeams || allTeams.length === 0) {
      return { success: true, staffedTeams: 0 };
    }
    
    // Get all teams that already have a COMPLETE scouting department (4 scouts, one of each archetype)
    // We need to check each team individually to see if they have all 4 archetypes
    const fullyStaffedTeamIds = new Set<string>();
    
    for (const team of allTeams) {
      let contractsQuery = supabase
        .from("scout_contracts")
        .select("role")
        .eq("team_id", team.id)
        .eq("save_game_id", saveGameId); // Always filter by save_game_id
      
      const { data: contracts } = await contractsQuery;
      
      if (contracts && contracts.length >= 4) {
        // Check if we have all 4 archetypes (and no duplicates)
        const archetypes = contracts.map((c) => c.role).filter(Boolean);
        const uniqueArchetypes = new Set(archetypes);
        const requiredArchetypes = ["evaluator", "tape_grinder", "character_coach", "athletic_analyst"];
        const hasAllArchetypes = requiredArchetypes.every((arch) => uniqueArchetypes.has(arch));
        const hasNoDuplicates = archetypes.length === uniqueArchetypes.size;
        
        if (hasAllArchetypes && hasNoDuplicates && contracts.length === 4) {
          fullyStaffedTeamIds.add(team.id);
        }
      }
    }
    
    // Filter to CPU teams (exclude user's team and teams that already have complete scouting)
    const cpuTeams = allTeams.filter((team) => {
      // Skip user's team
      if (actualUserTeamId && team.id === actualUserTeamId) {
        return false;
      }
      // Skip fully staffed teams
      return !fullyStaffedTeamIds.has(team.id);
    });
    
    console.log(`Found ${allTeams.length} total teams, ${fullyStaffedTeamIds.size} already fully staffed, ${actualUserTeamId ? '1 user team excluded' : 'no user team found'}, ${cpuTeams.length} CPU teams to staff`);
    
    if (cpuTeams.length === 0) {
      return { success: true, staffedTeams: 0 };
    }
    
    // Ensure scout pool exists for this save game and has enough scouts
    // We need: 32 teams * 4 scouts = 128 scouts minimum
    // Plus buffer for user team and variations = ~150-200 scouts
    const { count: existingCount } = await supabase
      .from("scouts")
      .select("*", { count: "exact", head: true })
      .eq("save_game_id", saveGameId);
    
    const minScoutsNeeded = cpuTeams.length * 4 + 50; // Teams * 4 + buffer
    
    if (!existingCount || existingCount === 0 || existingCount < minScoutsNeeded) {
      // Generate enough scouts for all teams plus buffer for this save game
      const scoutsToGenerate = Math.max(200, minScoutsNeeded);
      console.log(`Generating ${scoutsToGenerate} scouts for save game ${saveGameId} (need ${minScoutsNeeded} minimum for ${cpuTeams.length} teams)`);
      const scoutPool = generateScoutPool(scoutsToGenerate, saveGameId);
      const { error: poolError } = await supabase
        .from("scouts")
        .insert(scoutPool);
      
      if (poolError) {
        return { success: false, error: `Failed to generate scout pool: ${poolError.message}`, staffedTeams: 0 };
      }
      console.log(`✅ Generated ${scoutPool.length} scouts in the pool for save game ${saveGameId}`);
    } else {
      console.log(`Scout pool has ${existingCount} scouts for save game ${saveGameId} (need ${minScoutsNeeded} minimum)`);
    }
    
    let staffedCount = 0;
    const errors: string[] = [];
    
    // Staff each CPU team
    for (const team of cpuTeams) {
      try {
        console.log(`\n[CPU Staffing] Attempting to staff CPU team: ${team.name} (${team.id})`);
        const staffed = await staffCPUTeam(team.id, saveGameId, season);
        if (staffed) {
          staffedCount++;
          console.log(`✅ Successfully staffed team: ${team.name}`);
        } else {
          // Get more details about why it failed
          const { data: teamContracts } = await supabase
            .from("scout_contracts")
            .select("role")
            .eq("team_id", team.id)
            .eq("save_game_id", saveGameId);
          
          const contractCount = teamContracts?.length || 0;
          const errorMsg = contractCount > 0 
            ? `Only hired ${contractCount}/4 scouts (missing archetypes or budget issue)`
            : "Failed to hire any scouts (no available scouts or budget issue)";
          
          errors.push(`Failed to staff ${team.name}: ${errorMsg}`);
          console.warn(`⚠️ Failed to staff team: ${team.name} - ${errorMsg}`);
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : "Unknown error";
        errors.push(`Failed to staff ${team.name}: ${errorMsg}`);
        console.error(`❌ Failed to staff team ${team.id} (${team.name}):`, error);
        // Continue with other teams
      }
    }
    
    if (errors.length > 0) {
      console.warn(`CPU staffing completed with ${errors.length} errors:`, errors);
    }
    
    console.log(`CPU staffing complete: ${staffedCount}/${cpuTeams.length} teams staffed`);
    
    return { 
      success: true, 
      staffedTeams: staffedCount,
    };
  } catch (error) {
    console.error("Error in autoStaffCPUTeams:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      staffedTeams: 0,
    };
  }
}

/**
 * Staff a single CPU team
 */
async function staffCPUTeam(
  teamId: string,
  saveGameId: string,
  season: number
): Promise<boolean> {
  // Always require saveGameId
  if (!saveGameId) {
    console.error(`Cannot staff team ${teamId}: saveGameId is required`);
    return false;
  }
  
  // First, check what scouts this team already has (strictly filter by save_game_id)
  const { data: existingContracts, error: contractsError } = await supabase
    .from("scout_contracts")
    .select("scout_id, role")
    .eq("team_id", teamId)
    .eq("save_game_id", saveGameId);
  
  if (contractsError) {
    console.error(`Error fetching contracts for team ${teamId}:`, contractsError);
    return false;
  }
  
  // Define required archetypes once for this function
  const requiredArchetypes: ScoutArchetype[] = [
    "evaluator",
    "tape_grinder",
    "character_coach",
    "athletic_analyst",
  ];
  
  // Get existing archetypes
  const existingArchetypes = new Set(
    (existingContracts || []).map((c) => c.role).filter(Boolean)
  );
  
  // Enforce max 4 scouts limit
  if (existingContracts && existingContracts.length >= 4) {
    console.log(`Team ${teamId} already has ${existingContracts.length} scouts (max 4), skipping`);
    return false;
  }
  
  // If team already has all 4 archetypes, skip
  if (requiredArchetypes.every((arch) => existingArchetypes.has(arch)) && existingContracts && existingContracts.length === 4) {
    console.log(`Team ${teamId} already has complete scouting department (4 scouts, all archetypes), skipping`);
    return true;
  }
  
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
    // Create resources if they don't exist
    const defaultBudget = 7000000; // $7M default
    const { error: createError } = await supabase
      .from("team_scouting_resources")
      .insert({
        team_id: teamId,
        save_game_id: saveGameId,
        season,
        scouting_budget: defaultBudget,
      });
    
    if (createError) {
      console.error(`Failed to create resources for team ${teamId}:`, createError);
      return false;
    }
  }
  
  const budget = resources?.scouting_budget || 7000000;
  
  // Calculate current spending on existing scouts
  const existingScoutIds = (existingContracts || []).map((c) => c.scout_id);
  let currentSpending = 0;
  if (existingScoutIds.length > 0) {
    const { data: existingScouts } = await supabase
      .from("scouts")
      .select("salary")
      .in("id", existingScoutIds)
      .eq("save_game_id", saveGameId);
    
    if (existingScouts) {
      currentSpending = existingScouts.reduce((sum, scout) => sum + Number(scout.salary), 0);
    }
  }
  
  const remainingBudget = budget - currentSpending;
  
  // Get available scouts
  let availableScouts = await getAvailableScouts(saveGameId);
  
  // Group scouts by archetype to check availability
  const scoutsByArchetypeCheck: Record<ScoutArchetype, typeof availableScouts> = {
    evaluator: [],
    tape_grinder: [],
    character_coach: [],
    athletic_analyst: [],
  };
  
  for (const scout of availableScouts) {
    scoutsByArchetypeCheck[scout.archetype].push(scout);
  }
  
  // Check if we have enough of each archetype, generate more if needed
  // Use the same requiredArchetypes defined at the top of the function
  let needMoreScouts = false;
  for (const archetype of requiredArchetypes) {
    if (scoutsByArchetypeCheck[archetype].length < 10) {
      console.log(`Low on ${archetype} scouts (${scoutsByArchetypeCheck[archetype].length} available), generating more...`);
      needMoreScouts = true;
    }
  }
  
  if (needMoreScouts || availableScouts.length < 20) {
    // Generate more scouts to ensure we have enough of each archetype for this save game
    const additionalScouts = generateScoutPool(50, saveGameId); // Generate 50 more (roughly 12-13 of each archetype)
    const { error: poolError } = await supabase
      .from("scouts")
      .insert(additionalScouts);
    
    if (poolError) {
      console.error("Failed to generate additional scouts:", poolError);
    } else {
      console.log(`Generated ${additionalScouts.length} additional scouts`);
    }
  }
  
  // Get updated available scouts
  const updatedAvailable = await getAvailableScouts(saveGameId);
  
  // Group scouts by archetype
  const scoutsByArchetype: Record<ScoutArchetype, typeof updatedAvailable> = {
    evaluator: [],
    tape_grinder: [],
    character_coach: [],
    athletic_analyst: [],
  };
  
  for (const scout of updatedAvailable) {
    scoutsByArchetype[scout.archetype].push(scout);
  }
  
  // Log availability
  console.log(`[staffCPUTeam] Available scouts by archetype:`, {
    evaluator: scoutsByArchetype.evaluator.length,
    tape_grinder: scoutsByArchetype.tape_grinder.length,
    character_coach: scoutsByArchetype.character_coach.length,
    athletic_analyst: scoutsByArchetype.athletic_analyst.length,
    total: updatedAvailable.length
  });
  
  // Hire only missing archetypes
  const hiredScouts: string[] = [];
  const archetypesToHire = requiredArchetypes.filter(
    (arch) => !existingArchetypes.has(arch)
  );
  
  console.log(`Team ${teamId} needs ${archetypesToHire.length} more scouts: ${archetypesToHire.join(", ")}`);
  
  for (const archetype of archetypesToHire) {
    // Enforce max 4 scouts limit
    if (hiredScouts.length + (existingContracts?.length || 0) >= 4) {
      console.log(`Team ${teamId} has reached max 4 scouts limit, stopping hiring`);
      break;
    }
    
    // Check if we already have this archetype (shouldn't happen, but double-check)
    if (existingArchetypes.has(archetype)) {
      console.warn(`Team ${teamId} already has ${archetype}, skipping`);
      continue;
    }
    
    const candidates = scoutsByArchetype[archetype];
    
    if (candidates.length === 0) {
      console.error(`❌ No ${archetype} scouts available for team ${teamId} - cannot complete staffing`);
      // Try to generate more scouts of this specific archetype for this save game
      const emergencyScouts = generateScoutPool(20, saveGameId);
      const archetypeScouts = emergencyScouts.filter(s => s.archetype === archetype);
      if (archetypeScouts.length > 0) {
        const { error: emergencyError } = await supabase
          .from("scouts")
          .insert(archetypeScouts);
        
        if (!emergencyError) {
          console.log(`Generated ${archetypeScouts.length} emergency ${archetype} scouts`);
          // Refresh available scouts
          const refreshed = await getAvailableScouts(saveGameId);
          scoutsByArchetype[archetype] = refreshed.filter(s => s.archetype === archetype);
          
          if (scoutsByArchetype[archetype].length > 0) {
            console.log(`Now have ${scoutsByArchetype[archetype].length} ${archetype} scouts available, retrying...`);
            // Continue to hiring logic below
          } else {
            continue; // Still no scouts available
          }
        } else {
          console.error(`Failed to generate emergency ${archetype} scouts:`, emergencyError);
          continue;
        }
      } else {
        console.error(`Could not generate ${archetype} scouts in emergency pool`);
        continue;
      }
    }
    
    // Sort by reputation (prefer better scouts, but within budget)
    const sorted = candidates.sort((a, b) => b.reputation - a.reputation);
    
    // Try to hire a scout that fits in remaining budget
    let hired = false;
    for (const scout of sorted) {
      // Double-check we don't already have this archetype
      const currentArchetypesAfterHire = new Set([
        ...Array.from(existingArchetypes),
        ...hiredScouts.map(id => {
          const s = updatedAvailable.find(sc => sc.id === id);
          return s?.archetype;
        }).filter(Boolean),
        scout.archetype
      ]);
      
      if (currentArchetypesAfterHire.has(archetype) && existingArchetypes.has(archetype)) {
        continue; // Skip if we already have this archetype
      }
      
      const totalCost = currentSpending + hiredScouts.reduce((sum, id) => {
        const scoutData = updatedAvailable.find((s) => s.id === id);
        return sum + (scoutData ? Number(scoutData.salary) : 0);
      }, 0) + Number(scout.salary);
      
      if (totalCost <= budget) {
        const result = await hireScout(teamId, scout.id, saveGameId, 1);
        if (result.success) {
          hiredScouts.push(scout.id);
          hired = true;
          break;
        } else {
          // If hireScout failed due to validation, log and continue
          console.warn(`Failed to hire ${archetype} scout for team ${teamId}:`, result.error);
        }
      }
    }
    
    if (!hired) {
      // If we can't afford a good scout, try the cheapest one
      const cheapest = sorted[sorted.length - 1];
      if (cheapest) {
        const result = await hireScout(teamId, cheapest.id, saveGameId, 1);
        if (result.success) {
          hiredScouts.push(cheapest.id);
        } else {
          console.warn(`Failed to hire cheapest ${archetype} scout for team ${teamId}:`, result.error);
        }
      }
    }
  }
  
  // Check if we now have all 4 archetypes
  const finalContractsQuery = supabase
    .from("scout_contracts")
    .select("role")
    .eq("team_id", teamId);
  
  if (saveGameId) {
    finalContractsQuery.eq("save_game_id", saveGameId);
  } else {
    finalContractsQuery.is("save_game_id", null);
  }
  
  const { data: finalContracts } = await finalContractsQuery;
  const finalArchetypes = new Set(
    (finalContracts || []).map((c) => c.role).filter(Boolean)
  );
  
  const hasAllArchetypes = requiredArchetypes.every((arch) => finalArchetypes.has(arch));
  
  if (!hasAllArchetypes) {
    const missingArchetypes = requiredArchetypes.filter(arch => !finalArchetypes.has(arch));
    console.error(`❌ Team ${teamId} still missing archetypes after hiring: ${missingArchetypes.join(", ")}`);
    console.error(`   Hired: ${hiredScouts.length}, Final archetypes: ${Array.from(finalArchetypes).join(", ")}`);
    console.error(`   This team will need manual staffing or more scouts need to be generated`);
    return false;
  }
  
  // Verify we have exactly 4 scouts
  if (finalContracts && finalContracts.length !== 4) {
    console.error(`❌ Team ${teamId} has ${finalContracts.length} scouts instead of 4`);
    return false;
  }
  
  console.log(`✅ Team ${teamId} successfully staffed with 4 scouts (all archetypes)`);
  
  // Assign random priorities (1-4) to newly hired scouts that don't have priorities yet
  const priorities: PriorityLevel[] = [1, 2, 3, 4];
  const shuffledPriorities = priorities.sort(() => Math.random() - 0.5);
  
  // Get all scouts for this team to assign priorities
  let allTeamContractsQuery = supabase
    .from("scout_contracts")
    .select("scout_id")
    .eq("team_id", teamId);
  
  if (saveGameId) {
    allTeamContractsQuery = allTeamContractsQuery.eq("save_game_id", saveGameId);
  } else {
    allTeamContractsQuery = allTeamContractsQuery.is("save_game_id", null);
  }
  
  const { data: allTeamContracts } = await allTeamContractsQuery;
  const allTeamScoutIds = (allTeamContracts || []).map((c: any) => c.scout_id);
  
  // Check which scouts already have priorities
  let prioritiesQuery = supabase
    .from("scout_priority")
    .select("scout_id")
    .eq("team_id", teamId);
  
  if (saveGameId) {
    prioritiesQuery = prioritiesQuery.eq("save_game_id", saveGameId);
  } else {
    prioritiesQuery = prioritiesQuery.is("save_game_id", null);
  }
  
  const { data: existingPriorities } = await prioritiesQuery;
  const scoutsWithPriorities = new Set(
    (existingPriorities || []).map((p: any) => p.scout_id)
  );
  
  // Assign priorities to scouts that don't have them yet
  const scoutsNeedingPriorities = allTeamScoutIds.filter(
    (id) => !scoutsWithPriorities.has(id)
  );
  
  for (let i = 0; i < scoutsNeedingPriorities.length && i < shuffledPriorities.length; i++) {
    await assignPriority(
      teamId,
      scoutsNeedingPriorities[i],
      shuffledPriorities[i],
      saveGameId,
      season
    );
  }
  
  return true;
}

/**
 * Calculate total cost of hiring scouts
 */
async function calculateTotalCost(
  existingScoutIds: string[],
  newScoutIds: string[],
  saveGameId: string,
  season: number
): Promise<number> {
  const allIds = [...existingScoutIds, ...newScoutIds];
  
  const { data: scouts } = await supabase
    .from("scouts")
    .select("salary")
    .in("id", allIds)
    .eq("save_game_id", saveGameId);
  
  if (!scouts) {
    return 0;
  }
  
  return scouts.reduce((sum, scout) => sum + Number(scout.salary), 0);
}

