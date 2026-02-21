/**
 * Weekly scouting points system
 * Manages point allocation and regeneration per scout based on priority
 */

import { supabase } from "@/lib/supabase-client";
import { getWeeklyPoints } from "./priorities";
import { PriorityLevel } from "./types";

interface ScoutWeeklyPoints {
  scout_id: string;
  points: number;
  priority: PriorityLevel;
  weekly_points: number;
}

/**
 * Get current week's points for all scouts on a team
 */
export async function getScoutWeeklyPoints(
  teamId: string,
  saveGameId: string,
  season: number,
  week: number
): Promise<ScoutWeeklyPoints[]> {
  // Get priority assignments
  let prioritiesQuery = supabase
    .from("scout_priority")
    .select("scout_id, priority, weekly_points")
    .eq("team_id", teamId)
    .eq("season", season);
  
  if (saveGameId) {
    prioritiesQuery = prioritiesQuery.eq("save_game_id", saveGameId);
  } else {
    prioritiesQuery = prioritiesQuery.is("save_game_id", null);
  }
  
  const { data: priorities } = await prioritiesQuery;
  
  if (!priorities || priorities.length === 0) {
    return [];
  }
  
  const scoutIds = priorities.map((p) => p.scout_id);
  
  // Get or create weekly points records for this week
  // First, try to get existing records
  let weeklyPointsQuery = supabase
    .from("scout_weekly_points")
    .select("scout_id, weekly_allocation, points_spent, points_available")
    .eq("team_id", teamId)
    .eq("season", season)
    .eq("week", week)
    .in("scout_id", scoutIds);
  
  if (saveGameId) {
    weeklyPointsQuery = weeklyPointsQuery.eq("save_game_id", saveGameId);
  } else {
    weeklyPointsQuery = weeklyPointsQuery.is("save_game_id", null);
  }
  
  const { data: weeklyPoints } = await weeklyPointsQuery;
  
  // Create records for scouts that don't have them yet (first time this week)
  const existingScoutIds = new Set(weeklyPoints?.map((wp) => wp.scout_id) || []);
  const missingScouts = priorities.filter((p) => !existingScoutIds.has(p.scout_id));
  
  if (missingScouts.length > 0) {
    const newRecords = missingScouts.map((priority) => ({
      team_id: teamId,
      scout_id: priority.scout_id,
      save_game_id: saveGameId || null,
      season,
      week,
      weekly_allocation: priority.weekly_points,
      points_spent: 0,
    }));
    
    const { data: inserted } = await supabase
      .from("scout_weekly_points")
      .insert(newRecords)
      .select("scout_id, weekly_allocation, points_spent, points_available");
    
    if (inserted) {
      weeklyPoints?.push(...inserted);
    }
  }
  
  // Combine priorities with weekly points
  const result = priorities.map((priority) => {
    const weeklyPoint = weeklyPoints?.find((wp) => wp.scout_id === priority.scout_id);
    const availablePoints = weeklyPoint?.points_available ?? priority.weekly_points;
    
    // Debug logging
    if (weeklyPoint) {
      console.log(`[getScoutWeeklyPoints] Scout ${priority.scout_id}: allocation=${weeklyPoint.weekly_allocation}, spent=${weeklyPoint.points_spent}, available=${weeklyPoint.points_available}`);
    } else {
      console.log(`[getScoutWeeklyPoints] Scout ${priority.scout_id}: No weekly point record, using full allocation ${priority.weekly_points}`);
    }
    
    return {
      scout_id: priority.scout_id,
      points: availablePoints,
      priority: priority.priority as PriorityLevel,
      weekly_points: priority.weekly_points,
    };
  });
  
  console.log(`[getScoutWeeklyPoints] Returning ${result.length} scouts with points`);
  return result;
}

/**
 * Spend points from a scout
 * Tracks spent points in scout_weekly_points table
 */
export async function spendScoutPoints(
  teamId: string,
  scoutId: string,
  points: number,
  saveGameId: string,
  season: number,
  week: number
): Promise<{ success: boolean; remaining: number; error?: string }> {
  // Get scout's weekly points allocation from priority
  let priorityQuery = supabase
    .from("scout_priority")
    .select("weekly_points")
    .eq("team_id", teamId)
    .eq("scout_id", scoutId)
    .eq("season", season);
  
  if (saveGameId) {
    priorityQuery = priorityQuery.eq("save_game_id", saveGameId);
  } else {
    priorityQuery = priorityQuery.is("save_game_id", null);
  }
  
  const { data: priority } = await priorityQuery.single();
  
  if (!priority) {
    return { success: false, remaining: 0, error: "Scout priority not found" };
  }
  
  const weeklyAllocation = priority.weekly_points;
  
  // Get or create weekly points record
  let weeklyPointsQuery = supabase
    .from("scout_weekly_points")
    .select("*")
    .eq("team_id", teamId)
    .eq("scout_id", scoutId)
    .eq("season", season)
    .eq("week", week);
  
  if (saveGameId) {
    weeklyPointsQuery = weeklyPointsQuery.eq("save_game_id", saveGameId);
  } else {
    weeklyPointsQuery = weeklyPointsQuery.is("save_game_id", null);
  }
  
  const { data: existingRecord } = await weeklyPointsQuery.single();
  
  // If record doesn't exist, create it
  if (!existingRecord) {
    const { data: newRecord, error: createError } = await supabase
      .from("scout_weekly_points")
      .insert({
        team_id: teamId,
        scout_id: scoutId,
        save_game_id: saveGameId || null,
        season,
        week,
        weekly_allocation: weeklyAllocation,
        points_spent: 0,
      })
      .select()
      .single();
    
    if (createError || !newRecord) {
      return { 
        success: false, 
        remaining: 0, 
        error: `Failed to create weekly points record: ${createError?.message || "Unknown error"}` 
      };
    }
    
    // Check if we can afford it
    if (points > newRecord.points_available) {
      return {
        success: false,
        remaining: newRecord.points_available,
        error: `Not enough points. Need ${points}, have ${newRecord.points_available}`,
      };
    }
    
    // Spend the points
    const { data: updated, error: updateError } = await supabase
      .from("scout_weekly_points")
      .update({
        points_spent: points,
        updated_at: new Date().toISOString(),
      })
      .eq("id", newRecord.id)
      .select("points_available")
      .single();
    
    if (updateError || !updated) {
      return {
        success: false,
        remaining: newRecord.points_available,
        error: `Failed to spend points: ${updateError?.message || "Unknown error"}`,
      };
    }
    
    return { success: true, remaining: updated.points_available };
  }
  
  // Record exists - check available points
  const available = existingRecord.points_available;
  
  if (points > available) {
    return {
      success: false,
      remaining: available,
      error: `Not enough points. Need ${points}, have ${available}`,
    };
  }
  
  // Update spent points
  const newSpent = existingRecord.points_spent + points;
  const { data: updated, error: updateError } = await supabase
    .from("scout_weekly_points")
    .update({
      points_spent: newSpent,
      updated_at: new Date().toISOString(),
    })
    .eq("id", existingRecord.id)
    .select("points_available")
    .single();
  
  if (updateError || !updated) {
    return {
      success: false,
      remaining: available,
      error: `Failed to spend points: ${updateError?.message || "Unknown error"}`,
    };
  }
  
  return { success: true, remaining: updated.points_available };
}

/**
 * Regenerate weekly points for all scouts on a team
 * Called when advancing to a new week
 * Creates new weekly_points records for the new week with full allocation
 */
export async function regenerateWeeklyPoints(
  teamId: string,
  saveGameId: string,
  season: number,
  week: number
): Promise<{ success: boolean; error?: string }> {
  // Get all priority assignments for this team
  let prioritiesQuery = supabase
    .from("scout_priority")
    .select("scout_id, priority, weekly_points")
    .eq("team_id", teamId)
    .eq("season", season);
  
  if (saveGameId) {
    prioritiesQuery = prioritiesQuery.eq("save_game_id", saveGameId);
  } else {
    prioritiesQuery = prioritiesQuery.is("save_game_id", null);
  }
  
  let { data: priorities } = await prioritiesQuery;
  
  // If no priorities exist for this season, try to copy from previous season
  if (!priorities || priorities.length === 0) {
    console.log(`[regenerateWeeklyPoints] No priorities found for season ${season}, attempting to copy from previous season`);
    
    const previousSeason = season - 1;
    let previousPrioritiesQuery = supabase
      .from("scout_priority")
      .select("scout_id, priority, weekly_points")
      .eq("team_id", teamId)
      .eq("season", previousSeason);
    
    if (saveGameId) {
      previousPrioritiesQuery = previousPrioritiesQuery.eq("save_game_id", saveGameId);
    } else {
      previousPrioritiesQuery = previousPrioritiesQuery.is("save_game_id", null);
    }
    
    const { data: previousPriorities } = await previousPrioritiesQuery;
    
    if (previousPriorities && previousPriorities.length > 0) {
      // Copy priorities from previous season
      // Note: save_game_id is NOT NULL in scout_priority table, so we must have it
      if (!saveGameId) {
        console.warn(`[regenerateWeeklyPoints] Cannot copy priorities: saveGameId is required but was not provided`);
        return { success: true }; // Don't fail, just skip copying
      }
      
      const newPriorities = previousPriorities.map((p) => ({
        team_id: teamId,
        scout_id: p.scout_id,
        save_game_id: saveGameId, // Required field, don't use null
        season,
        priority: p.priority,
        weekly_points: p.weekly_points,
      }));
      
      const { error: copyError } = await supabase
        .from("scout_priority")
        .insert(newPriorities);
      
      if (copyError) {
        console.error(`[regenerateWeeklyPoints] Error copying priorities from previous season:`, copyError);
        // Don't fail the whole operation, just log and continue
        // User can manually reassign priorities if needed
        console.warn(`[regenerateWeeklyPoints] Continuing without copied priorities - user may need to reassign manually`);
        // Continue with empty priorities - will return success but no points will be generated
        return { success: true }; // Return success to not block simulation
      }
      
      console.log(`[regenerateWeeklyPoints] Copied ${newPriorities.length} priorities from season ${previousSeason} to ${season}`);
      priorities = previousPriorities; // Use the copied priorities
    } else {
      // No scouts or priorities at all, nothing to regenerate
      console.log(`[regenerateWeeklyPoints] No priorities found for season ${season} or ${previousSeason}, no scouts to regenerate points for`);
      return { success: true };
    }
  }
  
  // Check if records already exist for this week
  let existingQuery = supabase
    .from("scout_weekly_points")
    .select("scout_id")
    .eq("team_id", teamId)
    .eq("season", season)
    .eq("week", week);
  
  if (saveGameId) {
    existingQuery = existingQuery.eq("save_game_id", saveGameId);
  } else {
    existingQuery = existingQuery.is("save_game_id", null);
  }
  
  const { data: existing } = await existingQuery;
  const existingScoutIds = new Set(existing?.map((e) => e.scout_id) || []);
  
  // Create records for scouts that don't have them yet
  const newRecords = priorities
    .filter((p) => !existingScoutIds.has(p.scout_id))
    .map((priority) => ({
      team_id: teamId,
      scout_id: priority.scout_id,
      save_game_id: saveGameId || null,
      season,
      week,
      weekly_allocation: priority.weekly_points,
      points_spent: 0, // Fresh start for new week
    }));
  
  if (newRecords.length > 0) {
    const { error: insertError } = await supabase
      .from("scout_weekly_points")
      .insert(newRecords);
    
    if (insertError) {
      return {
        success: false,
        error: `Failed to regenerate points: ${insertError.message}`,
      };
    }
  }
  
  // For existing records, reset points_spent to 0
  // Build update query with proper filtering
  let updateQuery = supabase
    .from("scout_weekly_points")
    .update({
      points_spent: 0,
      updated_at: new Date().toISOString(),
    })
    .eq("team_id", teamId)
    .eq("season", season)
    .eq("week", week);
  
  if (saveGameId) {
    updateQuery = updateQuery.eq("save_game_id", saveGameId);
  } else {
    updateQuery = updateQuery.is("save_game_id", null);
  }
  
  const { error: updateError } = await updateQuery;
  
  if (updateError) {
    // Non-critical - records might not exist yet
    console.warn("Warning updating weekly points:", updateError);
  }
  
  return { success: true };
}

/**
 * Get available points for a specific scout
 */
export async function getAvailablePoints(
  teamId: string,
  scoutId: string,
  saveGameId: string,
  season: number,
  week: number
): Promise<number> {
  // First get priority to know weekly allocation
  let priorityQuery = supabase
    .from("scout_priority")
    .select("weekly_points")
    .eq("team_id", teamId)
    .eq("scout_id", scoutId)
    .eq("season", season);
  
  if (saveGameId) {
    priorityQuery = priorityQuery.eq("save_game_id", saveGameId);
  } else {
    priorityQuery = priorityQuery.is("save_game_id", null);
  }
  
  const { data: priority } = await priorityQuery.single();
  
  if (!priority) {
    return 0;
  }
  
  // Get weekly points record for this week
  let weeklyPointsQuery = supabase
    .from("scout_weekly_points")
    .select("points_available, weekly_allocation")
    .eq("team_id", teamId)
    .eq("scout_id", scoutId)
    .eq("season", season)
    .eq("week", week);
  
  if (saveGameId) {
    weeklyPointsQuery = weeklyPointsQuery.eq("save_game_id", saveGameId);
  } else {
    weeklyPointsQuery = weeklyPointsQuery.is("save_game_id", null);
  }
  
  const { data: weeklyPoints } = await weeklyPointsQuery.single();
  
  // If no record exists, scout has full allocation
  if (!weeklyPoints) {
    return priority.weekly_points;
  }
  
  // Return available points (calculated column)
  return weeklyPoints.points_available;
}

