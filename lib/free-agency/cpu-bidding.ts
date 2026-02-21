/**
 * CPU Bidding Logic for Free Agency
 * 
 * This module handles CPU team bidding behavior in the competitive free agency system.
 * CPU teams bid on players based on:
 * - Team needs (positional requirements)
 * - Available cap space
 * - Player overall rating
 * - Current highest bid
 * - Stage of free agency (more aggressive in later stages)
 */

import { supabase } from "@/lib/supabase-client";

interface TeamNeed {
  position: string;
  priority: number; // 1-10, 10 being highest need
}

interface BiddingTeam {
  teamId: string;
  teamName: string;
  availableCap: number;
  needs: TeamNeed[];
}

interface FreeAgentTarget {
  playerId: string | null;
  prospectId: string | null;
  fullName: string;
  position: string;
  overall: number;
  currentHighestBid: number;
  currentBidder: string | null;
  preference?: {
    preferred_annual_salary: number;
    preferred_contract_years: number;
    min_acceptable_salary: number;
  };
}

/**
 * Calculate team positional needs from preloaded roster data
 */
function calculateTeamNeedsFromRoster(roster: any[]): TeamNeed[] {
  // Count players by position
  const positionCounts: Record<string, number> = {};
  const positionQuality: Record<string, number[]> = {};

  roster.forEach((assignment: any) => {
    const player = assignment.players || assignment.draft_prospects;
    if (player && player.position) {
      const pos = player.position;
      positionCounts[pos] = (positionCounts[pos] || 0) + 1;
      if (!positionQuality[pos]) positionQuality[pos] = [];
      positionQuality[pos].push(player.overall || 0);
    }
  });

  // Define ideal roster composition
  const idealCounts: Record<string, number> = {
    QB: 3,
    RB: 4,
    WR: 6,
    TE: 3,
    OT: 2,
    OG: 2,
    C: 2,
    DE: 4,
    DT: 4,
    LB: 6,
    CB: 5,
    S: 4,
    K: 1,
    P: 1,
  };

  // Calculate needs
  const needs: TeamNeed[] = [];

  for (const [position, idealCount] of Object.entries(idealCounts)) {
    const currentCount = positionCounts[position] || 0;
    const shortage = idealCount - currentCount;
    
    // Calculate average quality at position
    const avgQuality = positionQuality[position]
      ? positionQuality[position].reduce((a, b) => a + b, 0) / positionQuality[position].length
      : 0;

    // Priority calculation:
    // - High priority if under ideal count (shortage > 0)
    // - Medium priority if at ideal count but low quality (avgQuality < 70)
    // - Low priority if at ideal count and decent quality
    let priority = 0;

    if (shortage > 0) {
      priority = Math.min(10, 5 + shortage * 2);
    } else if (avgQuality < 70 && currentCount > 0) {
      priority = Math.max(1, Math.floor((80 - avgQuality) / 10));
    }

    if (priority > 0) {
      needs.push({ position, priority });
    }
  }

  // Sort by priority (highest first)
  needs.sort((a, b) => b.priority - a.priority);

  return needs;
}

/**
 * Generate a contract offer based on player overall, market value, and player preferences
 */
function generateContractOffer(
  overall: number,
  currentHighestBid: number,
  stage: number,
  teamNeedPriority: number,
  isCounterBid: boolean = false,
  playerPreference?: {
    preferred_annual_salary: number;
    preferred_contract_years: number;
    min_acceptable_salary: number;
  }
): {
  contract_year_1: number;
  contract_year_2: number;
  contract_year_3: number;
  contract_year_4: number;
  signing_bonus: number;
  total_value: number;
} {
  // Start with player's preferred salary if available
  let baseSalary = 750000; // League minimum

  if (playerPreference) {
    // Use player's preference as baseline
    baseSalary = playerPreference.preferred_annual_salary;
    
    // CPU teams might try to lowball in stage 1 (85-95% of preferred)
    // But get closer to asking price in later stages
    if (stage === 1) {
      const offerPercent = 0.85 + (Math.random() * 0.10); // 85-95%
      baseSalary = Math.floor(baseSalary * offerPercent);
    } else if (stage === 2) {
      const offerPercent = 0.90 + (Math.random() * 0.10); // 90-100%
      baseSalary = Math.floor(baseSalary * offerPercent);
    } else if (stage === 3) {
      const offerPercent = 0.95 + (Math.random() * 0.10); // 95-105%
      baseSalary = Math.floor(baseSalary * offerPercent);
    } else {
      const offerPercent = 1.0 + (Math.random() * 0.15); // 100-115%
      baseSalary = Math.floor(baseSalary * offerPercent);
    }
    
    // High priority needs will pay closer to asking price
    if (teamNeedPriority >= 8) {
      baseSalary = Math.floor(baseSalary * 1.05); // +5%
    }
  } else {
    // Fallback to rating-based salary if no preference
    if (overall >= 90) baseSalary = 20000000;
    else if (overall >= 85) baseSalary = 15000000;
    else if (overall >= 80) baseSalary = 10000000;
    else if (overall >= 75) baseSalary = 6000000;
    else if (overall >= 70) baseSalary = 3000000;
    else if (overall >= 65) baseSalary = 1500000;
    else baseSalary = 900000;
  }

  // If counter-bidding, need to beat current highest bid
  if (isCounterBid && currentHighestBid > 0) {
    // Increase by 5-15% depending on priority and stage
    const increasePercent = 0.05 + (teamNeedPriority / 100) + (stage * 0.02);
    const minBid = Math.floor(currentHighestBid * (1 + increasePercent));
    baseSalary = Math.max(baseSalary, minBid);
  }

  // Contract length - use player preference if available, otherwise based on overall
  let years = 1;
  if (playerPreference) {
    years = playerPreference.preferred_contract_years;
    // Occasionally vary by +/- 1 year (30% chance)
    if (Math.random() < 0.3) {
      const variation = Math.random() < 0.5 ? -1 : 1;
      years = Math.max(1, Math.min(4, years + variation));
    }
  } else {
    if (overall >= 85) years = 4;
    else if (overall >= 75) years = 3;
    else if (overall >= 70) years = 2;
  }

  // Calculate year values
  const year1 = baseSalary;
  const year2 = years >= 2 ? Math.floor(baseSalary * 1.05) : 0;
  const year3 = years >= 3 ? Math.floor(baseSalary * 1.1) : 0;
  const year4 = years >= 4 ? Math.floor(baseSalary * 1.15) : 0;

  // Signing bonus (10-20% of first year for quality players)
  const signingBonus =
    overall >= 75 ? Math.floor(year1 * (0.1 + (overall - 75) / 100)) : 0;

  const totalValue = year1 + year2 + year3 + year4 + signingBonus;

  return {
    contract_year_1: year1,
    contract_year_2: year2,
    contract_year_3: year3,
    contract_year_4: year4,
    signing_bonus: signingBonus,
    total_value: totalValue,
  };
}

/**
 * Main function: Generate CPU bids for all teams in the current free agency stage
 */
export async function generateCPUBids(
  saveGameId: string,
  season: number,
  stage: number
): Promise<{
  success: boolean;
  bidsCreated: number;
  error?: string;
}> {
  try {
    console.log(`[CPU Bidding] Starting Stage ${stage} bid generation...`);
    const startTime = Date.now();
    let bidsCreated = 0;

    // Get all CPU teams (teams without a user)
    // For now, we'll consider all teams as potential bidders
    // You can add logic to identify user teams vs CPU teams
    const { data: allTeams } = await supabase
      .from("teams")
      .select("id, name, abbreviation");

    if (!allTeams) {
      return { success: false, error: "Failed to fetch teams", bidsCreated: 0 };
    }

    console.log(`[CPU Bidding] Processing ${allTeams.length} teams...`);

    // Get available free agents
    const { data: freeAgents } = await supabase
      .from("free_agent_availability")
      .select(`
        player_id,
        prospect_id,
        players (id, full_name, position, overall),
        draft_prospects (id, full_name, position, overall)
      `)
      .eq("save_game_id", saveGameId)
      .eq("archived", false);

    if (!freeAgents || freeAgents.length === 0) {
      return { success: true, bidsCreated: 0 }; // No free agents available
    }

    // Get player preferences
    const { data: preferences } = await supabase
      .from("free_agency_player_preferences")
      .select("*")
      .eq("save_game_id", saveGameId)
      .eq("season", season);

    console.log(`[CPU Bidding] Loaded ${preferences?.length || 0} player preferences`);

    const preferencesMap = new Map();
    preferences?.forEach((pref: any) => {
      const key = pref.player_id || pref.prospect_id;
      preferencesMap.set(key, {
        preferred_annual_salary: pref.preferred_annual_salary,
        preferred_contract_years: pref.preferred_contract_years,
        min_acceptable_salary: pref.min_acceptable_salary,
      });
    });

    // Convert to FreeAgentTarget format
    const allTargets: FreeAgentTarget[] = freeAgents
      .map((fa: any) => {
        const player = fa.players || fa.draft_prospects;
        if (!player) return null;

        const playerId = fa.player_id || fa.prospect_id;
        const preference = preferencesMap.get(playerId);

        return {
          playerId: fa.player_id,
          prospectId: fa.prospect_id,
          fullName: player.full_name,
          position: player.position,
          overall: player.overall || 0,
          currentHighestBid: 0,
          currentBidder: null,
          preference,
        };
      })
      .filter((t): t is FreeAgentTarget => t !== null);

    // Filter to only top players at each position - reduces pool significantly
    const targetsByPosition = new Map<string, FreeAgentTarget[]>();
    allTargets.forEach((target) => {
      const pos = target.position;
      if (!targetsByPosition.has(pos)) {
        targetsByPosition.set(pos, []);
      }
      targetsByPosition.get(pos)!.push(target);
    });

    // Keep only top 10 players at each position
    const targets: FreeAgentTarget[] = [];
    targetsByPosition.forEach((players, _position) => {
      const topPlayers = players
        .sort((a, b) => b.overall - a.overall)
        .slice(0, 10); // Only top 10 at each position
      targets.push(...topPlayers);
    });

    console.log(`[CPU Bidding] Filtered to ${targets.length} top targets from ${allTargets.length} total free agents`);

    // Get current bids for all players to determine highest bids
    const { data: existingBids } = await supabase
      .from("free_agency_bids")
      .select("player_id, prospect_id, team_id, total_value")
      .eq("save_game_id", saveGameId)
      .eq("season", season)
      .eq("stage", stage)
      .eq("is_active", true)
      .order("total_value", { ascending: false });

    // Update targets with current highest bids
    if (existingBids) {
      existingBids.forEach((bid: any) => {
        const target = targets.find(
          (t) =>
            (t.playerId && t.playerId === bid.player_id) ||
            (t.prospectId && t.prospectId === bid.prospect_id)
        );
        if (target && bid.total_value > target.currentHighestBid) {
          target.currentHighestBid = bid.total_value;
          target.currentBidder = bid.team_id;
        }
      });
    }

    // Batch: Get all team contracts at once
    const { data: allContracts } = await supabase
      .from("player_contracts_per_save_game")
      .select("team_id, contract_year_1")
      .eq("save_game_id", saveGameId);

    const teamCapHits = new Map<string, number>();
    allContracts?.forEach((contract: any) => {
      const current = teamCapHits.get(contract.team_id) || 0;
      teamCapHits.set(contract.team_id, current + (contract.contract_year_1 || 0));
    });

    // Batch: Get all team rosters at once for need calculation
    const { data: allRosters } = await supabase
      .from("player_team_assignments")
      .select(`
        team_id,
        player_id,
        prospect_id,
        players (position, overall),
        draft_prospects (position, overall)
      `)
      .eq("save_game_id", saveGameId);

    const teamRosters = new Map<string, any[]>();
    allRosters?.forEach((assignment: any) => {
      const roster = teamRosters.get(assignment.team_id) || [];
      roster.push(assignment);
      teamRosters.set(assignment.team_id, roster);
    });

    console.log(`[CPU Bidding] Preloaded contracts and rosters for ${allTeams.length} teams`);

    // Prepare bids array for batch insert
    const bidsToInsert: any[] = [];

    // Process each team
    for (const team of allTeams) {
      // Calculate available cap from preloaded data
      const totalCap = 255000000;
      const currentCapHit = teamCapHits.get(team.id) || 0;
      const availableCap = totalCap - currentCapHit;

      // Skip teams with very low cap space
      if (availableCap < 1000000) continue;

      // Calculate needs from preloaded roster
      const roster = teamRosters.get(team.id) || [];
      const needs = calculateTeamNeedsFromRoster(roster);

      // Limit bids per team - only bid on top targets
      let teamBidCount = 0;
      const MAX_BIDS_PER_TEAM = 8; // Only bid on 8 players max per stage

      // Sort targets by overall to prioritize better players
      const sortedTargets = [...targets].sort((a, b) => b.overall - a.overall);

      // For each target, decide if team should bid
      for (const target of sortedTargets) {
        // Stop if team has already bid on enough players
        if (teamBidCount >= MAX_BIDS_PER_TEAM) break;
        // Check if team has a need at this position
        const need = needs.find((n) => {
          if (target.position === "OT" || target.position === "OG" || target.position === "C") {
            return n.position === "OT" || n.position === "OG" || n.position === "C";
          }
          if (target.position === "DE" || target.position === "DT") {
            return n.position === "DE" || n.position === "DT";
          }
          return n.position === target.position;
        });

        // STRICT FILTERING: Only bid if there's an actual need OR player is elite (85+)
        if (!need && target.overall < 85) continue;

        // Skip if priority is too low (unless elite player)
        const priority = need ? need.priority : Math.max(1, Math.floor(target.overall / 20));
        if (priority < 3 && target.overall < 80) continue;

        // Check if already bidding on this player
        const hasBid = existingBids?.some(
          (b: any) =>
            b.team_id === team.id &&
            ((target.playerId && b.player_id === target.playerId) ||
              (target.prospectId && b.prospect_id === target.prospectId))
        );

        // Decide whether to bid - MUCH MORE SELECTIVE
        let shouldBid = false;
        const isCurrentlyWinning = target.currentBidder === team.id;

        if (stage === 1) {
          // Stage 1: Only bid on high priority needs or star players
          shouldBid = (priority >= 7) || (target.overall >= 85 && priority >= 5);
        } else if (stage === 2) {
          // Stage 2: Counter-bid if outbid, or bid on medium priority
          shouldBid = (hasBid && !isCurrentlyWinning) || (priority >= 6);
        } else if (stage === 3) {
          // Stage 3: Focus on critical needs and counter-bids
          shouldBid = (hasBid && !isCurrentlyWinning) || (priority >= 7);
        } else if (stage === 4) {
          // Stage 4: Only counter-bid if you're losing on a priority target
          shouldBid = (hasBid && !isCurrentlyWinning && priority >= 5);
        }

        // Only 40% of eligible bids actually happen (more selective)
        if (shouldBid && Math.random() < 0.4) {
          // Generate contract offer (include player preference)
          const isCounterBid = hasBid && !isCurrentlyWinning;
          const offer = generateContractOffer(
            target.overall,
            target.currentHighestBid,
            stage,
            priority,
            isCounterBid,
            target.preference
          );

          // Check if team can afford this offer
          if (offer.contract_year_1 > availableCap) continue;

          // Increment team bid count
          teamBidCount++;

          // Add to batch insert array
          bidsToInsert.push({
            save_game_id: saveGameId,
            season,
            stage,
            player_id: target.playerId,
            prospect_id: target.prospectId,
            team_id: team.id,
            contract_year_1: offer.contract_year_1,
            contract_year_2: offer.contract_year_2,
            contract_year_3: offer.contract_year_3,
            contract_year_4: offer.contract_year_4,
            signing_bonus: offer.signing_bonus,
            total_value: offer.total_value,
            is_cpu_bid: true,
            bid_priority: priority,
            is_active: true,
          });
        }
      }
    }

    console.log(`[CPU Bidding] Generated ${bidsToInsert.length} bids, inserting...`);

    // Batch insert all bids at once (much faster than individual inserts)
    if (bidsToInsert.length > 0) {
      // DON'T deactivate old bids - keep them active so we can see bid history
      // Just mark them as not winning
      await supabase
        .from("free_agency_bids")
        .update({ is_winning: false })
        .eq("save_game_id", saveGameId)
        .eq("season", season)
        .eq("is_winning", true);

      // Insert new bids in batches of 100
      const batchSize = 100;
      for (let i = 0; i < bidsToInsert.length; i += batchSize) {
        const batch = bidsToInsert.slice(i, i + batchSize);
        const { error: batchError } = await supabase
          .from("free_agency_bids")
          .insert(batch);

        if (!batchError) {
          bidsCreated += batch.length;
        } else {
          console.error(`Error inserting batch ${i}-${i + batch.length}:`, batchError);
        }
      }
    }

    const elapsed = Date.now() - startTime;
    console.log(`[CPU Bidding] Completed in ${elapsed}ms. Created ${bidsCreated} bids.`);

    return { success: true, bidsCreated };
  } catch (error) {
    console.error("Error generating CPU bids:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      bidsCreated: 0,
    };
  }
}

/**
 * Update bid statuses (mark which bids are winning, which are outbid)
 */
export async function updateBidStatuses(
  saveGameId: string,
  season: number,
  _stage: number
): Promise<{ success: boolean; error?: string }> {
  try {
    console.log("[CPU Bidding] Updating bid statuses...");
    const startTime = Date.now();

    // Get ALL active bids (not just current stage) for accurate status
    const { data: allBids } = await supabase
      .from("free_agency_bids")
      .select("*")
      .eq("save_game_id", saveGameId)
      .eq("season", season)
      .eq("is_active", true)
      .order("stage", { ascending: false })
      .order("total_value", { ascending: false });

    if (!allBids || allBids.length === 0) return { success: true };

    // Get latest bid from each team for each player
    const latestBidsMap = new Map<string, any>();
    allBids.forEach((bid: any) => {
      const playerId = bid.player_id || bid.prospect_id;
      const key = `${playerId}-${bid.team_id}`;
      
      if (!latestBidsMap.has(key) || latestBidsMap.get(key).stage < bid.stage) {
        latestBidsMap.set(key, bid);
      }
    });

    const latestBids = Array.from(latestBidsMap.values());

    // Group bids by player
    const bidsByPlayer: Record<string, any[]> = {};
    latestBids.forEach((bid: any) => {
      const key = bid.player_id || bid.prospect_id || "unknown";
      if (!bidsByPlayer[key]) {
        bidsByPlayer[key] = [];
      }
      bidsByPlayer[key].push(bid);
    });

    // Collect bid IDs for batch updates
    const winningBidIds: string[] = [];
    const outbidBidIds: string[] = [];

    for (const [, playerBids] of Object.entries(bidsByPlayer)) {
      playerBids.sort((a, b) => b.total_value - a.total_value);

      if (playerBids[0]) {
        winningBidIds.push(playerBids[0].id);
      }

      for (let i = 1; i < playerBids.length; i++) {
        outbidBidIds.push(playerBids[i].id);
      }
    }

    // Batch updates - MUCH faster than individual updates
    // Reset all first
    await supabase
      .from("free_agency_bids")
      .update({
        is_winning: false,
        was_outbid: false,
      })
      .eq("save_game_id", saveGameId)
      .eq("season", season)
      .eq("is_active", true);

    // Set winning bids
    if (winningBidIds.length > 0) {
      await supabase
        .from("free_agency_bids")
        .update({
          is_winning: true,
          was_outbid: false,
        })
        .in("id", winningBidIds);
    }

    // Set outbid bids
    if (outbidBidIds.length > 0) {
      await supabase
        .from("free_agency_bids")
        .update({
          is_winning: false,
          was_outbid: true,
        })
        .in("id", outbidBidIds);
    }

    const elapsed = Date.now() - startTime;
    console.log(`[CPU Bidding] Bid statuses updated in ${elapsed}ms`);

    return { success: true };
  } catch (error) {
    console.error("Error updating bid statuses:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Resolve all bids at the end of stage 4 - sign players to winning teams
 */
export async function resolveBids(
  saveGameId: string,
  season: number
): Promise<{
  success: boolean;
  playersSigned: number;
  error?: string;
}> {
  const startTime = Date.now();
  try {
    console.log("[Free Agency] Resolving bids and signing players...");
    let playersSigned = 0;

    // Get ALL active bids (from all stages) to find true winners
    const fetchStart = Date.now();
    const { data: allBids } = await supabase
      .from("free_agency_bids")
      .select(`
        *,
        players (id, full_name, position, overall),
        draft_prospects (id, full_name, position, overall),
        teams (name, abbreviation)
      `)
      .eq("save_game_id", saveGameId)
      .eq("season", season)
      .eq("is_active", true)
      .order("stage", { ascending: false })
      .order("total_value", { ascending: false });

    console.log(`[Free Agency] Fetched ${allBids?.length || 0} bids in ${Date.now() - fetchStart}ms`);

    if (!allBids || allBids.length === 0) {
      console.log("[Free Agency] No active bids found");
      return { success: true, playersSigned: 0 };
    }

    console.log(`[Free Agency] Processing ${allBids.length} total active bids`);

    // Get latest bid from each team for each player
    const latestBidsMap = new Map<string, any>();
    allBids.forEach((bid: any) => {
      const playerId = bid.player_id || bid.prospect_id;
      const key = `${playerId}-${bid.team_id}`;
      
      if (!latestBidsMap.has(key) || latestBidsMap.get(key).stage < bid.stage) {
        latestBidsMap.set(key, bid);
      }
    });

    const latestBids = Array.from(latestBidsMap.values());
    console.log(`[Free Agency] Found ${latestBids.length} latest bids`);

    // Group by player to find winners
    const bidsByPlayer: Record<string, any[]> = {};
    latestBids.forEach((bid: any) => {
      const key = bid.player_id || bid.prospect_id || "unknown";
      if (!bidsByPlayer[key]) {
        bidsByPlayer[key] = [];
      }
      bidsByPlayer[key].push(bid);
    });

    // Get winning bid for each player (highest total value)
    const winningBids: any[] = [];
    Object.values(bidsByPlayer).forEach((playerBids) => {
      playerBids.sort((a, b) => b.total_value - a.total_value);
      if (playerBids[0]) {
        winningBids.push(playerBids[0]);
      }
    });

    console.log(`[Free Agency] Found ${winningBids.length} winning bids to process`);

    // Get current week from season
    const { data: seasonData } = await supabase
      .from("seasons")
      .select("current_week")
      .eq("save_game_id", saveGameId)
      .eq("year", season)
      .single();

    const week = seasonData?.current_week || 24;

    // Prepare batch data for bulk inserts
    const assignmentsToInsert: any[] = [];
    const contractsToInsert: any[] = [];
    const transactionsToInsert: any[] = [];
    const playerIdsToRemove: string[] = [];
    const prospectIdsToRemove: string[] = [];

    // Process each winning bid and prepare data
    for (const bid of winningBids) {
      console.log(`[Free Agency] Processing player for ${bid.teams?.abbreviation || 'Unknown'}: $${bid.total_value.toLocaleString()}`);
      const playerId = bid.player_id;
      const prospectId = bid.prospect_id;
      const teamId = bid.team_id;
      const player = bid.players || bid.draft_prospects;

      if (!player) continue;

      // Prepare assignment data
      const assignmentData: any = {
        team_id: teamId,
        save_game_id: saveGameId,
        assigned_reason: "free_agency_bid",
        season,
        week,
      };

      if (playerId) {
        assignmentData.player_id = playerId;
        assignmentData.prospect_id = null;
        playerIdsToRemove.push(playerId);
      } else {
        assignmentData.prospect_id = prospectId;
        assignmentData.player_id = null;
        prospectIdsToRemove.push(prospectId!);
      }

      assignmentsToInsert.push(assignmentData);

      // Prepare contract data (only for players, not prospects)
      if (playerId) {
        contractsToInsert.push({
          player_id: playerId,
          save_game_id: saveGameId,
          team_id: teamId,
          contract_year_1: bid.contract_year_1,
          contract_year_2: bid.contract_year_2,
          contract_year_3: bid.contract_year_3,
          contract_year_4: bid.contract_year_4,
          signing_bonus: bid.signing_bonus,
          contract_expires_season:
            season +
            (bid.contract_year_4 > 0
              ? 4
              : bid.contract_year_3 > 0
                ? 3
                : bid.contract_year_2 > 0
                  ? 2
                  : 1),
        });
      }

      // Prepare transaction data
      transactionsToInsert.push({
        player_id: playerId,
        from_team_id: null,
        to_team_id: teamId,
        transaction_type: "signed",
        season,
        details: JSON.stringify({
          player_name: player.full_name,
          position: player.position,
          contract_value: bid.total_value,
          signing_method: "free_agency_bid",
        }),
      });

      playersSigned++;
    }

    console.log(`[Free Agency] Prepared ${playersSigned} players for signing. Executing batch operations...`);

    const batchStart = Date.now();

    // Batch insert assignments
    if (assignmentsToInsert.length > 0) {
      const assignStart = Date.now();
      const { error: assignmentError } = await supabase
        .from("player_team_assignments")
        .insert(assignmentsToInsert);

      if (assignmentError) {
        console.error("Failed to batch insert assignments:", assignmentError);
      } else {
        console.log(`[Free Agency] Created ${assignmentsToInsert.length} player assignments in ${Date.now() - assignStart}ms`);
      }
    }

    // Batch insert contracts
    if (contractsToInsert.length > 0) {
      const contractStart = Date.now();
      const { error: contractError } = await supabase
        .from("player_contracts_per_save_game")
        .insert(contractsToInsert);

      if (contractError) {
        console.error("Failed to batch insert contracts:", contractError);
      } else {
        console.log(`[Free Agency] Created ${contractsToInsert.length} contracts in ${Date.now() - contractStart}ms`);
      }
    }

    // Batch delete from free agent availability
    if (playerIdsToRemove.length > 0) {
      const deleteStart = Date.now();
      await supabase
        .from("free_agent_availability")
        .delete()
        .eq("save_game_id", saveGameId)
        .in("player_id", playerIdsToRemove);
      console.log(`[Free Agency] Removed ${playerIdsToRemove.length} players from FA in ${Date.now() - deleteStart}ms`);
    }

    if (prospectIdsToRemove.length > 0) {
      const deleteStart = Date.now();
      await supabase
        .from("free_agent_availability")
        .delete()
        .eq("save_game_id", saveGameId)
        .in("prospect_id", prospectIdsToRemove);
      console.log(`[Free Agency] Removed ${prospectIdsToRemove.length} prospects from FA in ${Date.now() - deleteStart}ms`);
    }

    // Batch insert transactions
    if (transactionsToInsert.length > 0) {
      const txStart = Date.now();
      const { error: transactionError } = await supabase
        .from("transactions")
        .insert(transactionsToInsert);

      if (transactionError) {
        console.error("Failed to batch insert transactions:", transactionError);
      } else {
        console.log(`[Free Agency] Logged ${transactionsToInsert.length} transactions in ${Date.now() - txStart}ms`);
      }
    }

    console.log(`[Free Agency] All batch operations completed in ${Date.now() - batchStart}ms`);
    console.log(`[Free Agency] Total players signed: ${playersSigned}`);

    // Mark all bids as inactive now that they're resolved
    const cleanupStart = Date.now();
    await supabase
      .from("free_agency_bids")
      .update({ is_active: false })
      .eq("save_game_id", saveGameId)
      .eq("season", season);

    // Mark stage as completed
    await supabase
      .from("free_agency_stage")
      .update({
        stage_status: "completed",
        completed_at: new Date().toISOString(),
      })
      .eq("save_game_id", saveGameId)
      .eq("season", season);

    console.log(`[Free Agency] Cleanup completed in ${Date.now() - cleanupStart}ms`);
    console.log(`[Free Agency] Free agency completed. ${playersSigned} players signed to teams.`);
    console.log(`[Free Agency] Total resolution time: ${Date.now() - startTime}ms`);
    return { success: true, playersSigned };
  } catch (error) {
    console.error("Error resolving bids:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      playersSigned: 0,
    };
  }
}

