/**
 * Preseason validation system
 * Ensures teams have complete scouting departments before advancing to season
 */

import { validateScoutingDepartment } from "./hiring";
import { validatePriorities, arePrioritiesLocked } from "./priorities";

export interface PreseasonValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validate that a team's scouting department is complete
 * Checks: 4 scouts hired, one of each archetype, priorities assigned
 */
export async function validateScoutingDepartmentComplete(
  teamId: string,
  saveGameId: string,
  season: number
): Promise<PreseasonValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  // Check if priorities are locked (season has started)
  const locked = await arePrioritiesLocked(saveGameId, season);
  if (locked) {
    // If locked, we can't change anything, so just return current state
    const deptValidation = await validateScoutingDepartment(teamId, saveGameId);
    const priorityValidation = await validatePriorities(teamId, saveGameId, season);
    
    return {
      valid: deptValidation.valid && priorityValidation.valid,
      errors: [...deptValidation.errors, ...priorityValidation.errors],
      warnings: [],
    };
  }
  
  // Validate scouting department (4 scouts, one of each archetype)
  const deptValidation = await validateScoutingDepartment(teamId, saveGameId);
  if (!deptValidation.valid) {
    errors.push(...deptValidation.errors);
  }
  
  // Validate priorities are assigned
  const priorityValidation = await validatePriorities(teamId, saveGameId, season);
  if (!priorityValidation.valid) {
    errors.push(...priorityValidation.errors);
  }
  
  // Warnings for suboptimal setups
  if (deptValidation.valid && priorityValidation.valid) {
    // Could add warnings for low-quality scouts, etc.
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Check if team can advance to season
 * Must have complete scouting department
 */
export async function canAdvanceToSeason(
  teamId: string,
  saveGameId: string,
  season: number
): Promise<{ canAdvance: boolean; reason?: string }> {
  const validation = await validateScoutingDepartmentComplete(teamId, saveGameId, season);
  
  if (!validation.valid) {
    return {
      canAdvance: false,
      reason: validation.errors.join(" "),
    };
  }
  
  return { canAdvance: true };
}

