import { supabase } from "@/lib/supabase-client";

export interface Season {
  id: string;
  year: number;
  phase: 'preseason' | 'regular_season' | 'playoffs' | 'offseason';
  current_week: number;
  is_active: boolean;
  champion_team_id?: string | null;
  started_at?: string;
  ended_at?: string;
  created_at?: string;
  updated_at?: string;
  save_game_id?: string | null;
}

export type SeasonPhase = 'preseason' | 'regular_season' | 'playoffs' | 'offseason';

/**
 * Validates that current_week is within the allowed range (0-23)
 */
export function validateCurrentWeek(week: number): { valid: boolean; error?: string } {
  const weekNum = parseInt(String(week), 10);
  
  if (isNaN(weekNum)) {
    return { valid: false, error: `current_week must be a number, got: ${week}` };
  }
  
  if (weekNum < 0 || weekNum > 23) {
    return { valid: false, error: `current_week must be between 0 and 23, got: ${weekNum}` };
  }
  
  return { valid: true };
}

/**
 * Gets or creates a season record with upsert logic to handle race conditions
 * Uses PostgreSQL ON CONFLICT to safely handle concurrent requests
 */
export async function getOrCreateSeason(
  year: number,
  saveGameId: string | null,
  options?: {
    phase?: SeasonPhase;
    currentWeek?: number;
    isActive?: boolean;
    championTeamId?: string | null;
  }
): Promise<{ season: Season; created: boolean; error?: string }> {
  console.log(`[SeasonManager] getOrCreateSeason called:`, {
    year,
    saveGameId: saveGameId || 'null',
    options: JSON.stringify(options)
  });
  
  const phase = options?.phase || 'preseason';
  
  // Calculate default week based on phase
  let defaultWeek: number;
  if (phase === 'preseason') {
    defaultWeek = 0;
  } else if (phase === 'offseason') {
    defaultWeek = 23;
  } else if (phase === 'playoffs') {
    defaultWeek = 19;
  } else {
    defaultWeek = 18; // regular_season
  }
  
  // Ensure currentWeek is a valid integer
  let currentWeek: number;
  if (options?.currentWeek !== undefined && options.currentWeek !== null) {
    // Log the raw value we received
    console.log(`[SeasonManager] Received currentWeek:`, {
      value: options.currentWeek,
      type: typeof options.currentWeek,
      stringified: String(options.currentWeek)
    });
    
    const parsed = parseInt(String(options.currentWeek), 10);
    if (isNaN(parsed)) {
      console.error(`[SeasonManager] Failed to parse currentWeek:`, {
        original: options.currentWeek,
        type: typeof options.currentWeek,
        parsed
      });
      return {
        season: {} as Season,
        created: false,
        error: `Invalid currentWeek value: ${options.currentWeek} (type: ${typeof options.currentWeek}). Must be a number.`
      };
    }
    currentWeek = parsed;
    console.log(`[SeasonManager] Parsed currentWeek:`, { original: options.currentWeek, parsed: currentWeek });
  } else {
    currentWeek = defaultWeek;
    console.log(`[SeasonManager] Using default currentWeek:`, { phase, defaultWeek });
  }
  
  const isActive = options?.isActive !== undefined ? options.isActive : true;
  
  // Validate current_week
  const weekValidation = validateCurrentWeek(currentWeek);
  if (!weekValidation.valid) {
    return {
      season: {} as Season,
      created: false,
      error: weekValidation.error || 'Invalid current_week value'
    };
  }
  
  // Double-check: ensure it's an integer between 0 and 23
  if (!Number.isInteger(currentWeek) || currentWeek < 0 || currentWeek > 23) {
    return {
      season: {} as Season,
      created: false,
      error: `current_week must be an integer between 0 and 23, got: ${currentWeek} (type: ${typeof currentWeek})`
    };
  }
  
  // First, try to get existing season
  let seasonQuery = supabase
    .from("seasons")
    .select("*")
    .eq("year", year);
  
  if (saveGameId) {
    seasonQuery = seasonQuery.eq("save_game_id", saveGameId);
  } else {
    seasonQuery = seasonQuery.is("save_game_id", null);
  }
  
  const { data: existingSeason, error: fetchError } = await seasonQuery.maybeSingle();
  
  if (fetchError && fetchError.code !== "PGRST116") {
    console.error(`[SeasonManager] Error fetching season ${year}:`, fetchError);
    return {
      season: {} as Season,
      created: false,
      error: `Failed to fetch season: ${fetchError.message}`
    };
  }
  
  // If season exists, return it
  if (existingSeason) {
    console.log(`[SeasonManager] Season ${year} exists (id: ${existingSeason.id}, phase: ${existingSeason.phase}, active: ${existingSeason.is_active})`);
    return {
      season: existingSeason as Season,
      created: false
    };
  }
  
  // Season doesn't exist, create it with upsert logic
  console.log(`[SeasonManager] Creating season ${year} for save_game_id: ${saveGameId || 'null'}`);
  
  // Ensure all values are properly typed before insert
  // Triple-check currentWeek is valid - handle all edge cases
  let finalCurrentWeek: number;
  
  if (currentWeek === undefined || currentWeek === null) {
    // This shouldn't happen due to earlier validation, but be defensive
    console.error(`[SeasonManager] CRITICAL: currentWeek is undefined/null! Using default for phase ${phase}`);
    finalCurrentWeek = defaultWeek;
  } else if (Number.isInteger(currentWeek)) {
    // Already an integer, use it directly
    finalCurrentWeek = currentWeek;
  } else if (typeof currentWeek === 'number') {
    // It's a number but not an integer (e.g., 23.5) - round it
    finalCurrentWeek = Math.round(currentWeek);
    console.warn(`[SeasonManager] currentWeek was a float ${currentWeek}, rounded to ${finalCurrentWeek}`);
  } else {
    // Try to parse it
    const parsed = parseInt(String(currentWeek), 10);
    if (isNaN(parsed)) {
      console.error(`[SeasonManager] CRITICAL: Cannot parse currentWeek!`, {
        original: currentWeek,
        type: typeof currentWeek
      });
      finalCurrentWeek = defaultWeek; // Fallback to default
    } else {
      finalCurrentWeek = parsed;
    }
  }
  
  // Final validation - must be integer between 0 and 23
  if (!Number.isInteger(finalCurrentWeek) || finalCurrentWeek < 0 || finalCurrentWeek > 23) {
    console.error(`[SeasonManager] CRITICAL: Invalid currentWeek after all processing!`, {
      original: currentWeek,
      type: typeof currentWeek,
      final: finalCurrentWeek,
      isInteger: Number.isInteger(finalCurrentWeek),
      year,
      phase,
      saveGameId,
      defaultWeek
    });
    return {
      season: {} as Season,
      created: false,
      error: `Invalid current_week value: ${currentWeek} (final: ${finalCurrentWeek}). Must be an integer between 0 and 23.`
    };
  }
  
  // Ensure current_week is definitely an integer (defensive programming)
  const safeCurrentWeek = Number.isInteger(finalCurrentWeek) 
    ? finalCurrentWeek 
    : Math.round(Number(finalCurrentWeek));
  
  // Final clamp to ensure it's in range
  const clampedCurrentWeek = Math.max(0, Math.min(23, safeCurrentWeek));
  
  // Ensure current_week is definitely an integer (not a string or float)
  const finalCurrentWeekInt = Number.isInteger(clampedCurrentWeek) 
    ? clampedCurrentWeek 
    : Math.round(Number(clampedCurrentWeek));
  
  // One final clamp to be absolutely sure
  const finalInt = Math.max(0, Math.min(23, finalCurrentWeekInt));
  
  // Ensure current_week is a proper integer (PostgreSQL requires INTEGER type)
  // Convert to integer explicitly to avoid any type issues
  const currentWeekForDB = parseInt(String(finalInt), 10);
  
  if (isNaN(currentWeekForDB) || currentWeekForDB < 0 || currentWeekForDB > 23) {
    console.error(`[SeasonManager] CRITICAL: Invalid currentWeekForDB after all processing!`, {
      finalInt,
      currentWeekForDB,
      isNaN: isNaN(currentWeekForDB)
    });
    return {
      season: {} as Season,
      created: false,
      error: `Invalid current_week value after processing: ${finalInt} -> ${currentWeekForDB}`
    };
  }
  
  const seasonData = {
    year: parseInt(String(year), 10),
    phase: phase as string,
    current_week: currentWeekForDB, // Explicitly use parsed integer
    is_active: Boolean(isActive),
    save_game_id: saveGameId || null,
    champion_team_id: options?.championTeamId || null,
    started_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  
  // Log the final value being inserted
  console.log(`[SeasonManager] Final seasonData.current_week:`, {
    original: currentWeek,
    final: finalCurrentWeek,
    safe: safeCurrentWeek,
    clamped: clampedCurrentWeek,
    finalInt: finalInt,
    currentWeekForDB: currentWeekForDB,
    type: typeof currentWeekForDB,
    isInteger: Number.isInteger(currentWeekForDB),
    inRange: currentWeekForDB >= 0 && currentWeekForDB <= 23
  });
  
  // Final validation before insert - one more check (should never fail now due to clamping)
  if (!Number.isInteger(seasonData.current_week) || seasonData.current_week < 0 || seasonData.current_week > 23) {
    console.error(`[SeasonManager] CRITICAL: Validation failed at final check despite clamping!`, {
      seasonData,
      original: currentWeek,
      final: finalCurrentWeek,
      safe: safeCurrentWeek,
      clamped: clampedCurrentWeek
    });
    return {
      season: {} as Season,
      created: false,
      error: `Invalid current_week after final validation: ${seasonData.current_week} (type: ${typeof seasonData.current_week}). This should not happen.`
    };
  }
  
  console.log(`[SeasonManager] Inserting season with validated data:`, {
    year: seasonData.year,
    phase: seasonData.phase,
    current_week: seasonData.current_week,
    current_week_type: typeof seasonData.current_week,
    is_integer: Number.isInteger(seasonData.current_week)
  });
  
  // Use RPC call for upsert since Supabase client doesn't support ON CONFLICT directly
  // First try insert, if it fails with duplicate key, fetch existing
  console.log(`[SeasonManager] About to insert season data:`, JSON.stringify(seasonData, null, 2));
  
  const { data: createdSeason, error: createError } = await supabase
    .from("seasons")
    .insert(seasonData)
    .select()
    .single();
  
  if (createError) {
    console.error(`[SeasonManager] Insert error:`, {
      code: createError.code,
      message: createError.message,
      details: createError.details,
      hint: createError.hint,
      dataAttempted: seasonData,
      currentWeekValue: seasonData.current_week,
      currentWeekType: typeof seasonData.current_week,
      isInteger: Number.isInteger(seasonData.current_week),
      inRange: seasonData.current_week >= 0 && seasonData.current_week <= 23
    });
    
    // Check if it's a constraint violation
    if (createError.message?.includes("check constraint") || createError.message?.includes("seasons_current_week_check")) {
      // This suggests the database constraint might be wrong or the migration didn't run
      // Provide helpful error message
      return {
        season: {} as Season,
        created: false,
        error: `Database constraint violation: The seasons table constraint may not allow current_week = ${seasonData.current_week}. Please run the migration: supabase/migrations/fix_seasons_current_week_constraint_force.sql to fix the constraint. Value being inserted: ${seasonData.current_week} (type: ${typeof seasonData.current_week}, isInteger: ${Number.isInteger(seasonData.current_week)}).`
      };
    }
    // Check if it's a duplicate key error (race condition)
    if (createError.code === "23505" || createError.message?.includes("duplicate key") || createError.message?.includes("unique constraint")) {
      console.log(`[SeasonManager] Race condition detected for season ${year}, fetching existing record...`);
      
      // Fetch the season that was created by another request
      const { data: raceSeason, error: raceError } = await seasonQuery.single();
      
      if (raceError || !raceSeason) {
        return {
          season: {} as Season,
          created: false,
          error: `Failed to fetch season after race condition: ${raceError?.message || 'Unknown error'}`
        };
      }
      
      console.log(`[SeasonManager] Retrieved season ${year} created by concurrent request`);
      return {
        season: raceSeason as Season,
        created: false
      };
    }
    
    // Other error
    console.error(`[SeasonManager] Error creating season ${year}:`, createError);
    return {
      season: {} as Season,
      created: false,
      error: `Failed to create season: ${createError.message}`
    };
  }
  
  if (!createdSeason) {
    return {
      season: {} as Season,
      created: false,
      error: 'Season creation returned no data'
    };
  }
  
  console.log(`[SeasonManager] Successfully created season ${year} (id: ${createdSeason.id})`);
  return {
    season: createdSeason as Season,
    created: true
  };
}

/**
 * Updates a season's phase and week
 * Validates inputs and ensures save_game_id filtering
 */
export async function updateSeasonPhase(
  year: number,
  saveGameId: string | null,
  phase: SeasonPhase,
  week: number
): Promise<{ success: boolean; error?: string }> {
  // Ensure week is a valid integer
  const parsedWeek = parseInt(String(week), 10);
  if (isNaN(parsedWeek)) {
    return {
      success: false,
      error: `Invalid week value: ${week}. Must be a number.`
    };
  }
  
  // Validate week
  const weekValidation = validateCurrentWeek(parsedWeek);
  if (!weekValidation.valid) {
    return {
      success: false,
      error: weekValidation.error || 'Invalid current_week value'
    };
  }
  
  // Double-check: ensure it's an integer between 0 and 23
  if (!Number.isInteger(parsedWeek) || parsedWeek < 0 || parsedWeek > 23) {
    return {
      success: false,
      error: `current_week must be an integer between 0 and 23, got: ${parsedWeek}`
    };
  }
  
  // Validate phase matches week range
  const phaseWeekMap: Record<SeasonPhase, { min: number; max: number }> = {
    preseason: { min: 0, max: 0 },
    regular_season: { min: 1, max: 18 },
    playoffs: { min: 19, max: 22 },
    offseason: { min: 23, max: 23 }
  };
  
  const phaseRange = phaseWeekMap[phase];
  if (parsedWeek < phaseRange.min || parsedWeek > phaseRange.max) {
    console.warn(`[SeasonManager] Warning: Week ${parsedWeek} is outside expected range for phase ${phase} (${phaseRange.min}-${phaseRange.max})`);
  }
  
  let updateQuery = supabase
    .from("seasons")
    .update({
      phase: phase as string,
      current_week: parsedWeek, // Use the parsed integer value
      updated_at: new Date().toISOString(),
    })
    .eq("year", year);
  
  if (saveGameId) {
    updateQuery = updateQuery.eq("save_game_id", saveGameId);
  } else {
    updateQuery = updateQuery.is("save_game_id", null);
  }
  
  const { error: updateError } = await updateQuery;
  
  if (updateError) {
    console.error(`[SeasonManager] Error updating season ${year} phase to ${phase}:`, updateError);
    return {
      success: false,
      error: `Failed to update season phase: ${updateError.message}`
    };
  }
  
  console.log(`[SeasonManager] Successfully updated season ${year} to phase: ${phase}, week: ${week}`);
  return { success: true };
}

/**
 * Deactivates a season (sets is_active to false)
 */
export async function deactivateSeason(
  year: number,
  saveGameId: string | null
): Promise<{ success: boolean; error?: string }> {
  let updateQuery = supabase
    .from("seasons")
    .update({
      is_active: false,
      updated_at: new Date().toISOString(),
    })
    .eq("year", year)
    .eq("is_active", true); // Only update if currently active
  
  if (saveGameId) {
    updateQuery = updateQuery.eq("save_game_id", saveGameId);
  } else {
    updateQuery = updateQuery.is("save_game_id", null);
  }
  
  const { error: deactivateError } = await updateQuery;
  
  if (deactivateError) {
    console.error(`[SeasonManager] Error deactivating season ${year}:`, deactivateError);
    // Don't fail - deactivation is not critical
    console.warn(`[SeasonManager] Warning: Failed to deactivate season ${year}, but continuing...`);
    return {
      success: false,
      error: `Failed to deactivate season: ${deactivateError.message}`
    };
  }
  
  console.log(`[SeasonManager] Successfully deactivated season ${year}`);
  return { success: true };
}

/**
 * Gets an active season for a given year and save_game_id
 */
export async function getActiveSeason(
  year: number,
  saveGameId: string | null
): Promise<{ season: Season | null; error?: string }> {
  let seasonQuery = supabase
    .from("seasons")
    .select("*")
    .eq("year", year)
    .eq("is_active", true);
  
  if (saveGameId) {
    seasonQuery = seasonQuery.eq("save_game_id", saveGameId);
  } else {
    seasonQuery = seasonQuery.is("save_game_id", null);
  }
  
  const { data: season, error } = await seasonQuery.maybeSingle();
  
  if (error && error.code !== "PGRST116") {
    console.error(`[SeasonManager] Error fetching active season ${year}:`, error);
    return {
      season: null,
      error: `Failed to fetch season: ${error.message}`
    };
  }
  
  return { season: season as Season | null };
}

