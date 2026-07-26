/**
 * Task Validation Helper
 * Provides functions to validate task completion and check if advancement is allowed
 */

import { supabase } from "@/lib/supabase-client";
import { authFetch } from "@/lib/auth/browser-auth";

export interface TaskValidation {
  taskId: string;
  completed: boolean;
  required: boolean;
  autoCompleted?: boolean; // True if completed via AUTO mode
}

export interface PhaseValidation {
  phase: "preseason" | "regular_season" | "playoffs" | "offseason";
  canAdvance: boolean;
  tasks: TaskValidation[];
  blockingTasks: string[]; // IDs of required tasks that aren't complete
}

/**
 * Validate preseason tasks
 */
export async function validatePreseasonTasks(
  saveGameId: string,
  teamId: string,
  season: number
): Promise<PhaseValidation> {
  const tasks: TaskValidation[] = [];

  // Check scout hiring
  const { data: contracts } = await supabase
    .from("scout_contracts")
    .select("scout_id, role")
    .eq("team_id", teamId)
    .eq("save_game_id", saveGameId);

  const archetypes = [
    "evaluator",
    "tape_grinder",
    "character_coach",
    "athletic_analyst",
  ];
  const hiredArchetypes = new Set(
    (contracts || []).map((c) => c.role).filter(Boolean)
  );
  const hiringComplete = archetypes.every((arch) => hiredArchetypes.has(arch));

  tasks.push({
    taskId: "hire-scouts",
    completed: hiringComplete,
    required: true,
  });

  // Check CPU staffing (simplified - assume it's done if user team is done)
  tasks.push({
    taskId: "cpu-staffing",
    completed: hiringComplete, // Simplified check
    required: true,
  });

  // Check scout priorities
  const { data: priorities } = await supabase
    .from("scout_priority")
    .select("id")
    .eq("team_id", teamId)
    .eq("save_game_id", saveGameId);

  tasks.push({
    taskId: "scout-priorities",
    completed: (priorities?.length || 0) >= 4,
    required: true,
  });

  // Check draft prospects generated
  const { data: prospects } = await supabase
    .from("draft_prospects")
    .select("id")
    .eq("season", season)
    .eq("save_game_id", saveGameId)
    .limit(1);

  tasks.push({
    taskId: "draft-class",
    completed: (prospects?.length || 0) > 0,
    required: true,
  });

  // Check roster validation
  const rosterValidation = await validateRosterSize(teamId, saveGameId);

  tasks.push({
    taskId: "roster-valid",
    completed: rosterValidation.isValid,
    required: true,
  });

  // Check all teams roster validation (simplified)
  tasks.push({
    taskId: "all-rosters-valid",
    completed: true, // Simplified - assume CPU teams are valid
    required: true,
  });

  // Calculate if can advance
  const blockingTasks = tasks
    .filter((t) => t.required && !t.completed)
    .map((t) => t.taskId);

  return {
    phase: "preseason",
    canAdvance: blockingTasks.length === 0,
    tasks,
    blockingTasks,
  };
}

/**
 * Validate regular season tasks
 */
export async function validateRegularSeasonTasks(
  saveGameId: string,
  teamId: string,
  settings: {
    injury_management: "auto" | "manual";
    depth_chart_management: "auto" | "manual";
    scouting_management: "auto" | "manual";
  }
): Promise<PhaseValidation> {
  const tasks: TaskValidation[] = [];

  // Injury management
  tasks.push({
    taskId: "injuries",
    completed: settings.injury_management === "auto",
    required: settings.injury_management === "manual",
    autoCompleted: settings.injury_management === "auto",
  });

  // Depth chart management
  tasks.push({
    taskId: "depth-chart",
    completed: settings.depth_chart_management === "auto",
    required: settings.depth_chart_management === "manual",
    autoCompleted: settings.depth_chart_management === "auto",
  });

  // Scouting management
  tasks.push({
    taskId: "scouting",
    completed: settings.scouting_management === "auto",
    required: settings.scouting_management === "manual",
    autoCompleted: settings.scouting_management === "auto",
  });

  // Calculate if can advance
  const blockingTasks = tasks
    .filter((t) => t.required && !t.completed)
    .map((t) => t.taskId);

  return {
    phase: "regular_season",
    canAdvance: blockingTasks.length === 0,
    tasks,
    blockingTasks,
  };
}

/**
 * Validate offseason tasks for a specific week
 */
export async function validateOffseasonTasks(
  saveGameId: string,
  season: number,
  week: 0 | 1 | 2
): Promise<PhaseValidation> {
  const tasks: TaskValidation[] = [];

  if (week === 0) {
    // Week 0 (Week 23): Contracts and staff
    // Check for expiring contracts using player_contracts_per_save_game
    // A contract expires if contract_year_2 is NULL or 0 (no contract for next year)
    // This task is optional - players can advance even with expiring contracts
    let expiringCount = 0;
    if (saveGameId) {
      // Check for expiring contracts (contract_year_2 is NULL or 0)
      // Don't filter by team_id as it might be outdated - just check for any expiring contracts
      const { count, error } = await supabase
        .from("player_contracts_per_save_game")
        .select("id", { count: "exact", head: true })
        .eq("save_game_id", saveGameId)
        .or("contract_year_2.is.null,contract_year_2.eq.0")
        .not("team_id", "is", null); // Only contracts for players on teams (not free agents)

      if (error) {
        console.error(
          "[TaskValidator] Error checking expiring contracts:",
          error
        );
        // Don't block on error - default to no expiring contracts
        expiringCount = 0;
      } else if (count !== null) {
        expiringCount = count;
      }
    }

    tasks.push({
      taskId: "contracts",
      completed: expiringCount === 0, // Completed if no expiring contracts
      required: false, // Optional - not blocking advancement
    });

    tasks.push({
      taskId: "coaches",
      completed: true, // Optional
      required: false,
    });

    tasks.push({
      taskId: "scouts",
      completed: true, // Optional
      required: false,
    });
  } else if (week === 1) {
    // Week 1: Free agency and scouting
    tasks.push({
      taskId: "scouting",
      completed: true, // Optional
      required: false,
    });

    tasks.push({
      taskId: "free-agents",
      completed: true, // Optional
      required: false,
    });
  } else {
    // Week 2: Draft
    let draftStateQuery = supabase
      .from("draft_state")
      .select("status")
      .eq("season", season);

    if (saveGameId) {
      draftStateQuery = draftStateQuery.eq("save_game_id", saveGameId);
    } else {
      draftStateQuery = draftStateQuery.is("save_game_id", null);
    }

    const { data: draftState } = await draftStateQuery.maybeSingle();

    tasks.push({
      taskId: "draft",
      completed: draftState?.status === "completed",
      required: true,
    });
  }

  // Calculate if can advance
  const blockingTasks = tasks
    .filter((t) => t.required && !t.completed)
    .map((t) => t.taskId);

  return {
    phase: "offseason",
    canAdvance: blockingTasks.length === 0,
    tasks,
    blockingTasks,
  };
}

/**
 * Helper: Validate roster size
 */
async function validateRosterSize(
  teamId: string,
  saveGameId: string
): Promise<{ isValid: boolean; currentSize: number; maxSize: number }> {
  const MAX_ROSTER_SIZE = 53;

  // Get current roster size
  const { data: assignments } = await supabase
    .from("player_team_assignments")
    .select("player_id")
    .eq("team_id", teamId)
    .eq("save_game_id", saveGameId);

  let currentSize = 0;

  if (assignments && assignments.length > 0) {
    currentSize = assignments.length;
  } else {
    // Fallback to players table
    const { count } = await supabase
      .from("players")
      .select("id", { count: "exact", head: true })
      .eq("team_id", teamId);

    currentSize = count || 0;
  }

  return {
    isValid: currentSize <= MAX_ROSTER_SIZE,
    currentSize,
    maxSize: MAX_ROSTER_SIZE,
  };
}

/**
 * Get default game settings
 */
export function getDefaultSettings() {
  return {
    injury_management: "manual" as const,
    depth_chart_management: "manual" as const,
    scouting_management: "manual" as const,
    contract_management: "manual" as const,
    roster_management: "manual" as const,
  };
}

/**
 * Check if advancement is allowed for current phase
 */
export async function canAdvanceFromPhase(
  phase: "preseason" | "regular_season" | "playoffs" | "offseason",
  saveGameId: string,
  teamId: string,
  season: number,
  offseasonWeek?: 0 | 1 | 2
): Promise<{ allowed: boolean; reason?: string; blockingTasks?: string[] }> {
  try {
    let validation: PhaseValidation;

    if (phase === "preseason") {
      validation = await validatePreseasonTasks(saveGameId, teamId, season);
    } else if (phase === "regular_season") {
      // Load settings
      const response = await authFetch(
        `/api/game-settings?saveGameId=${saveGameId}`
      );
      const data = await response.json();
      const settings = data.settings || getDefaultSettings();

      validation = await validateRegularSeasonTasks(
        saveGameId,
        teamId,
        settings
      );
    } else if (phase === "offseason") {
      const week = offseasonWeek ?? 0;
      validation = await validateOffseasonTasks(saveGameId, season, week);
    } else {
      // Playoffs - no required tasks
      return { allowed: true };
    }

    if (validation.canAdvance) {
      return { allowed: true };
    } else {
      return {
        allowed: false,
        reason: `Cannot advance: ${validation.blockingTasks.length} required task(s) not complete`,
        blockingTasks: validation.blockingTasks,
      };
    }
  } catch (error) {
    console.error("Error checking advancement:", error);
    return {
      allowed: false,
      reason: `Error validating tasks: ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  }
}
