/**
 * Roster validation and auto-fix utility
 * Validates rosters are exactly 53 players and auto-fixes CPU teams
 */

import { supabase } from "@/lib/supabase-client";
import { replenishTeamRosterOnly } from "./roster-replenisher";

const MIN_ROSTER_SIZE = 53;
const MAX_ROSTER_SIZE = 53;
const TARGET_ROSTER_SIZE = 53;

export interface RosterValidationResult {
  teamId: string;
  teamName: string;
  currentSize: number;
  isValid: boolean;
  needsPlayers: number; // Positive = need to add, negative = need to cut
  isUserTeam: boolean;
}

export interface RosterValidationResponse {
  allValid: boolean;
  userTeamInvalid: boolean;
  cpuTeamsInvalid: number;
  validations: RosterValidationResult[];
  errors: string[];
}

/**
 * Get user team ID from save game
 */
async function getUserTeamId(saveGameId: string): Promise<string | null> {
  const { data: saveGame } = await supabase
    .from("save_games")
    .select("selected_team_id")
    .eq("id", saveGameId)
    .single();

  return saveGame?.selected_team_id || null;
}

/**
 * Get roster size for a team
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
 * Cut players from a team (remove lowest overall players first)
 */
async function cutPlayersFromTeam(
  teamId: string,
  saveGameId: string,
  countToCut: number
): Promise<{ success: boolean; cut: number; error?: string }> {
  try {
    // Get players sorted by overall (lowest first)
    const { data: assignments, error: assignmentsError } = await supabase
      .from("player_team_assignments")
      .select(`
        id,
        player_id,
        prospect_id,
        players (id, overall),
        draft_prospects (id, overall)
      `)
      .eq("team_id", teamId)
      .eq("save_game_id", saveGameId);

    if (assignmentsError || !assignments) {
      return {
        success: false,
        cut: 0,
        error: `Failed to fetch roster: ${assignmentsError?.message || "Unknown error"}`,
      };
    }

    // Sort by overall (lowest first)
    const sortedAssignments = assignments
      .map((a: any) => ({
        id: a.id,
        playerId: a.player_id,
        prospectId: a.prospect_id,
        overall:
          a.players?.overall || a.draft_prospects?.overall || 0,
      }))
      .sort((a, b) => a.overall - b.overall);

    // Get IDs to cut (lowest overall players)
    const toCut = sortedAssignments.slice(0, countToCut).map((a) => a.id);

    if (toCut.length === 0) {
      return { success: true, cut: 0 };
    }

    // Delete assignments
    const { error: deleteError } = await supabase
      .from("player_team_assignments")
      .delete()
      .in("id", toCut);

    if (deleteError) {
      return {
        success: false,
        cut: 0,
        error: `Failed to cut players: ${deleteError.message}`,
      };
    }

    // Also remove from free agent availability if they were free agents
    const playerIds = sortedAssignments
      .slice(0, countToCut)
      .map((a) => a.playerId)
      .filter(Boolean);

    if (playerIds.length > 0) {
      // Re-add to free agent availability
      const availabilityRecords = playerIds.map((playerId) => ({
        player_id: playerId,
        save_game_id: saveGameId,
        archived: false,
        entered_free_agency_season: new Date().getFullYear(),
        reason: "cut",
      }));

      await supabase
        .from("free_agent_availability")
        .upsert(availabilityRecords, {
          onConflict: "player_id,save_game_id",
        });
    }

    return { success: true, cut: toCut.length };
  } catch (error) {
    return {
      success: false,
      cut: 0,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Validate and auto-fix a single team's roster
 */
async function validateAndFixTeamRoster(
  teamId: string,
  teamName: string,
  saveGameId: string,
  season: number,
  week: number,
  isUserTeam: boolean,
  autoFix: boolean
): Promise<RosterValidationResult & { fixed?: boolean; fixError?: string }> {
  const currentSize = await getTeamRosterSize(teamId, saveGameId);
  const needsPlayers = TARGET_ROSTER_SIZE - currentSize;
  const isValid = currentSize === TARGET_ROSTER_SIZE;

  const result: RosterValidationResult & {
    fixed?: boolean;
    fixError?: string;
  } = {
    teamId,
    teamName,
    currentSize,
    isValid,
    needsPlayers,
    isUserTeam,
  };

  // Auto-fix CPU teams or if autoFix is true
  if (!isValid && (autoFix || !isUserTeam)) {
    if (needsPlayers > 0) {
      // Need to add players
      const fixResult = await replenishTeamRosterOnly(
        teamId,
        saveGameId,
        season,
        week
      );

      if (fixResult.success) {
        result.fixed = true;
        result.currentSize = fixResult.afterSize;
        result.isValid = fixResult.afterSize === TARGET_ROSTER_SIZE;
        result.needsPlayers = TARGET_ROSTER_SIZE - fixResult.afterSize;
      } else {
        result.fixError = fixResult.error;
      }
    } else if (needsPlayers < 0) {
      // Need to cut players
      const cutResult = await cutPlayersFromTeam(
        teamId,
        saveGameId,
        Math.abs(needsPlayers)
      );

      if (cutResult.success) {
        result.fixed = true;
        result.currentSize = await getTeamRosterSize(teamId, saveGameId);
        result.isValid = result.currentSize === TARGET_ROSTER_SIZE;
        result.needsPlayers = TARGET_ROSTER_SIZE - result.currentSize;
      } else {
        result.fixError = cutResult.error;
      }
    }
  }

  return result;
}

/**
 * Validate all team rosters and auto-fix CPU teams
 * Returns validation results and indicates if user team needs manual fix
 */
export async function validateAllRosters(
  saveGameId: string,
  season: number,
  week: number,
  autoFixUserTeam: boolean = false
): Promise<RosterValidationResponse> {
  console.log(
    `[RosterValidator] Validating rosters for saveGameId: ${saveGameId}, season: ${season}, week: ${week}`
  );

  // Get user team ID
  const userTeamId = await getUserTeamId(saveGameId);
  console.log(
    `[RosterValidator] User team ID: ${userTeamId || "NOT FOUND"} for saveGameId: ${saveGameId}`
  );

  // Get all teams
  const { data: teams, error: teamsError } = await supabase
    .from("teams")
    .select("id, name")
    .order("name");

  if (teamsError || !teams) {
    return {
      allValid: false,
      userTeamInvalid: true,
      cpuTeamsInvalid: 0,
      validations: [],
      errors: [`Failed to fetch teams: ${teamsError?.message || "Unknown error"}`],
    };
  }

  const validations: Array<
    RosterValidationResult & { fixed?: boolean; fixError?: string }
  > = [];
  const errors: string[] = [];

  // Validate and auto-fix each team
  for (const team of teams) {
    const isUserTeam = userTeamId === team.id;
    const rosterSize = await getTeamRosterSize(team.id, saveGameId);
    
    console.log(
      `[RosterValidator] Team ${team.name} (${team.id}): ${rosterSize} players, isUserTeam: ${isUserTeam}`
    );

    const result = await validateAndFixTeamRoster(
      team.id,
      team.name,
      saveGameId,
      season,
      week,
      isUserTeam,
      autoFixUserTeam
    );

    validations.push(result);

    if (result.fixError) {
      errors.push(`${team.name}: ${result.fixError}`);
    }

    // Log validation result
    if (isUserTeam) {
      console.log(
        `[RosterValidator] USER TEAM validation: ${result.currentSize} players, isValid: ${result.isValid}, needsPlayers: ${result.needsPlayers}`
      );
    }
  }

  const userTeamValidation = validations.find((v) => v.isUserTeam);
  const cpuTeamValidations = validations.filter((v) => !v.isUserTeam);

  const userTeamInvalid = userTeamValidation
    ? !userTeamValidation.isValid
    : false;
  const cpuTeamsInvalid = cpuTeamValidations.filter((v) => !v.isValid).length;
  const allValid = !userTeamInvalid && cpuTeamsInvalid === 0;

  console.log(
    `[RosterValidator] Validation complete: ${allValid ? "All valid" : `${userTeamInvalid ? "User team invalid" : ""} ${cpuTeamsInvalid > 0 ? `${cpuTeamsInvalid} CPU teams invalid` : ""}`}`
  );

  return {
    allValid,
    userTeamInvalid,
    cpuTeamsInvalid,
    validations: validations.map((v) => ({
      teamId: v.teamId,
      teamName: v.teamName,
      currentSize: v.currentSize,
      isValid: v.isValid,
      needsPlayers: v.needsPlayers,
      isUserTeam: v.isUserTeam,
    })),
    errors,
  };
}

/**
 * Validate a single team's roster
 */
export async function validateTeamRoster(
  teamId: string,
  saveGameId: string,
  season: number,
  week: number
): Promise<RosterValidationResult> {
  const { data: team } = await supabase
    .from("teams")
    .select("id, name")
    .eq("id", teamId)
    .single();

  if (!team) {
    throw new Error("Team not found");
  }

  const userTeamId = await getUserTeamId(saveGameId);
  const currentSize = await getTeamRosterSize(teamId, saveGameId);
  const needsPlayers = TARGET_ROSTER_SIZE - currentSize;

  return {
    teamId: team.id,
    teamName: team.name,
    currentSize,
    isValid: currentSize === TARGET_ROSTER_SIZE,
    needsPlayers,
    isUserTeam: userTeamId === team.id,
  };
}

