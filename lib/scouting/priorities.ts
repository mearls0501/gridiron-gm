/**
 * Scout priority assignment system
 * Handles assigning scouts to priority slots (Primary, Secondary, Tertiary, Quaternary)
 */

import { supabase } from "@/lib/supabase-client";
import { PriorityLevel, PRIORITY_POINTS } from "./types";

/**
 * Assign a scout to a priority slot
 */
export async function assignPriority(
  teamId: string,
  scoutId: string,
  priority: PriorityLevel,
  saveGameId: string,
  season: number
): Promise<{ success: boolean; error?: string }> {
  // Validate priority
  if (priority < 1 || priority > 4) {
    return { success: false, error: "Priority must be between 1 and 4" };
  }
  
  // Check if scout is hired by this team
  let contractQuery = supabase
    .from("scout_contracts")
    .select("id")
    .eq("team_id", teamId)
    .eq("scout_id", scoutId);
  
  if (saveGameId) {
    contractQuery = contractQuery.eq("save_game_id", saveGameId);
  } else {
    contractQuery = contractQuery.is("save_game_id", null);
  }
  
  const { data: contract } = await contractQuery.single();
  
  if (!contract) {
    return { success: false, error: "Scout is not hired by this team" };
  }
  
  // Check if this priority slot is already taken
  let existingQuery = supabase
    .from("scout_priority")
    .select("id, scout_id")
    .eq("team_id", teamId)
    .eq("priority", priority)
    .eq("season", season);
  
  if (saveGameId) {
    existingQuery = existingQuery.eq("save_game_id", saveGameId);
  } else {
    existingQuery = existingQuery.is("save_game_id", null);
  }
  
  const { data: existing } = await existingQuery.single();
  
  // If slot is taken by different scout, remove it
  if (existing && existing.scout_id !== scoutId) {
    await supabase
      .from("scout_priority")
      .delete()
      .eq("id", existing.id);
  }
  
  // Remove this scout's existing priority if any
  let removeQuery = supabase
    .from("scout_priority")
    .delete()
    .eq("team_id", teamId)
    .eq("scout_id", scoutId)
    .eq("season", season);
  
  if (saveGameId) {
    removeQuery = removeQuery.eq("save_game_id", saveGameId);
  } else {
    removeQuery = removeQuery.is("save_game_id", null);
  }
  
  await removeQuery;
  
  // Create new priority assignment
  const priorityData = {
    team_id: teamId,
    scout_id: scoutId,
    save_game_id: saveGameId,
    season,
    priority,
    weekly_points: PRIORITY_POINTS[priority],
  };
  
  const { error } = await supabase
    .from("scout_priority")
    .insert(priorityData);
  
  if (error) {
    return { success: false, error: error.message };
  }
  
  return { success: true };
}

/**
 * Validate that all priorities (1-4) are assigned
 */
export async function validatePriorities(
  teamId: string,
  saveGameId: string,
  season: number
): Promise<{ valid: boolean; errors: string[] }> {
  let prioritiesQuery = supabase
    .from("scout_priority")
    .select("priority")
    .eq("team_id", teamId)
    .eq("season", season);
  
  if (saveGameId) {
    prioritiesQuery = prioritiesQuery.eq("save_game_id", saveGameId);
  } else {
    prioritiesQuery = prioritiesQuery.is("save_game_id", null);
  }
  
  const { data: priorities } = await prioritiesQuery;
  
  const errors: string[] = [];
  const assignedPriorities = new Set(priorities?.map((p) => p.priority) || []);
  
  for (let i = 1; i <= 4; i++) {
    if (!assignedPriorities.has(i)) {
      errors.push(`Priority ${i} is not assigned.`);
    }
  }
  
  // Check for duplicates
  const priorityCounts = new Map<number, number>();
  priorities?.forEach((p) => {
    priorityCounts.set(p.priority, (priorityCounts.get(p.priority) || 0) + 1);
  });
  
  for (const [priority, count] of priorityCounts.entries()) {
    if (count > 1) {
      errors.push(`Priority ${priority} is assigned to multiple scouts.`);
    }
  }
  
  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Get weekly points for a priority level
 */
export function getWeeklyPoints(priority: PriorityLevel): number {
  return PRIORITY_POINTS[priority];
}

/**
 * Get team's priority assignments
 */
export async function getTeamPriorities(
  teamId: string,
  saveGameId: string,
  season: number
) {
  let prioritiesQuery = supabase
    .from("scout_priority")
    .select("*")
    .eq("team_id", teamId)
    .eq("season", season)
    .order("priority", { ascending: true });
  
  if (saveGameId) {
    prioritiesQuery = prioritiesQuery.eq("save_game_id", saveGameId);
  } else {
    prioritiesQuery = prioritiesQuery.is("save_game_id", null);
  }
  
  const { data: priorities } = await prioritiesQuery;
  
  return priorities || [];
}

/**
 * Check if priorities are locked (season has started)
 */
export async function arePrioritiesLocked(
  saveGameId: string,
  season: number
): Promise<boolean> {
  // Get current week
  let weekQuery = supabase
    .from("seasons")
    .select("current_week")
    .eq("year", season);
  
  if (saveGameId) {
    weekQuery = weekQuery.eq("save_game_id", saveGameId);
  } else {
    weekQuery = weekQuery.is("save_game_id", null);
  }
  
  const { data: seasonData } = await weekQuery.single();
  
  // Priorities are locked if week > 0 (preseason is week 0)
  return (seasonData?.current_week || 0) > 0;
}

