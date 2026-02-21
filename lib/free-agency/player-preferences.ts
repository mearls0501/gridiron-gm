/**
 * Player Contract Preferences for Free Agency
 * 
 * Generates realistic contract preferences based on player ratings, age, and position
 */

import { supabase } from "@/lib/supabase-client";

interface PlayerPreference {
  preferred_annual_salary: number;
  preferred_contract_years: number;
  preferred_signing_bonus: number;
  min_acceptable_salary: number;
}

/**
 * Generate contract preferences for a player based on their attributes
 */
export function generatePlayerPreferences(
  overall: number,
  age: number,
  position: string
): PlayerPreference {
  // Base salary by overall rating
  let preferredSalary = 750000; // League minimum

  if (overall >= 95) preferredSalary = 30000000;
  else if (overall >= 90) preferredSalary = 22000000;
  else if (overall >= 85) preferredSalary = 16000000;
  else if (overall >= 80) preferredSalary = 11000000;
  else if (overall >= 75) preferredSalary = 7000000;
  else if (overall >= 70) preferredSalary = 4000000;
  else if (overall >= 65) preferredSalary = 2000000;
  else if (overall >= 60) preferredSalary = 1200000;
  else preferredSalary = 900000;

  // Position multipliers (some positions command higher salaries)
  const positionMultipliers: Record<string, number> = {
    QB: 1.3,
    DE: 1.15,
    DT: 1.1,
    LB: 1.05,
    CB: 1.1,
    WR: 1.05,
    OT: 1.1,
    default: 1.0,
  };

  const multiplier = positionMultipliers[position] || positionMultipliers.default;
  preferredSalary = Math.floor(preferredSalary * multiplier);

  // Contract length preferences based on age and rating
  let preferredYears = 1;

  if (age <= 26) {
    // Young players want longer deals for security
    if (overall >= 85) preferredYears = 4;
    else if (overall >= 75) preferredYears = 3;
    else if (overall >= 65) preferredYears = 2;
    else preferredYears = 1;
  } else if (age <= 29) {
    // Prime age - want good years but flexibility
    if (overall >= 85) preferredYears = 4;
    else if (overall >= 75) preferredYears = 3;
    else preferredYears = 2;
  } else if (age <= 32) {
    // Later prime - shorter deals
    if (overall >= 85) preferredYears = 3;
    else if (overall >= 75) preferredYears = 2;
    else preferredYears = 1;
  } else {
    // Veterans - mostly 1-year deals, occasional 2
    if (overall >= 85) preferredYears = 2;
    else preferredYears = 1;
  }

  // Signing bonus (percentage of first year salary)
  let signingBonusPercent = 0;
  if (overall >= 85) signingBonusPercent = 0.20; // 20%
  else if (overall >= 75) signingBonusPercent = 0.15; // 15%
  else if (overall >= 70) signingBonusPercent = 0.10; // 10%

  const signingBonus = Math.floor(preferredSalary * signingBonusPercent);

  // Minimum acceptable (willing to take 80-90% of preferred)
  const minAcceptablePercent = 0.80 + (overall / 1000); // 80-90%
  const minAcceptable = Math.floor(
    Math.max(750000, preferredSalary * minAcceptablePercent)
  );

  return {
    preferred_annual_salary: preferredSalary,
    preferred_contract_years: preferredYears,
    preferred_signing_bonus: signingBonus,
    min_acceptable_salary: minAcceptable,
  };
}

/**
 * Generate and save preferences for all free agents
 */
export async function generatePreferencesForFreeAgents(
  saveGameId: string,
  season: number
): Promise<{
  success: boolean;
  preferencesCreated: number;
  error?: string;
}> {
  try {
    let preferencesCreated = 0;

    // Get all free agents for this save game
    const { data: freeAgents } = await supabase
      .from("free_agent_availability")
      .select(`
        player_id,
        prospect_id,
        players (id, full_name, position, overall, age),
        draft_prospects (id, full_name, position, overall, age)
      `)
      .eq("save_game_id", saveGameId)
      .eq("archived", false);

    if (!freeAgents || freeAgents.length === 0) {
      return { success: true, preferencesCreated: 0 };
    }

    // Generate preferences for each player
    for (const fa of freeAgents) {
      const player = fa.players || fa.draft_prospects;
      if (!player) continue;

      // Check if preferences already exist
      const { data: existing } = await supabase
        .from("free_agency_player_preferences")
        .select("id")
        .eq("save_game_id", saveGameId)
        .eq("season", season)
        .match(
          fa.player_id
            ? { player_id: fa.player_id }
            : { prospect_id: fa.prospect_id }
        )
        .maybeSingle();

      if (existing) continue; // Already has preferences

      // Generate preferences based on player attributes
      const prefs = generatePlayerPreferences(
        player.overall || 65,
        player.age || 25,
        player.position || "WR"
      );

      // Save to database
      const { error: insertError } = await supabase
        .from("free_agency_player_preferences")
        .insert({
          save_game_id: saveGameId,
          season,
          player_id: fa.player_id,
          prospect_id: fa.prospect_id,
          preferred_annual_salary: prefs.preferred_annual_salary,
          preferred_contract_years: prefs.preferred_contract_years,
          preferred_signing_bonus: prefs.preferred_signing_bonus,
          min_acceptable_salary: prefs.min_acceptable_salary,
        });

      if (!insertError) {
        preferencesCreated++;
      }
    }

    return { success: true, preferencesCreated };
  } catch (error) {
    console.error("Error generating player preferences:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      preferencesCreated: 0,
    };
  }
}

/**
 * Get preferences for a specific player
 */
export async function getPlayerPreferences(
  saveGameId: string,
  season: number,
  playerId: string | null,
  prospectId: string | null
): Promise<PlayerPreference | null> {
  try {
    const query = supabase
      .from("free_agency_player_preferences")
      .select("*")
      .eq("save_game_id", saveGameId)
      .eq("season", season);

    if (playerId) {
      query.eq("player_id", playerId);
    } else if (prospectId) {
      query.eq("prospect_id", prospectId);
    } else {
      return null;
    }

    const { data } = await query.maybeSingle();

    if (!data) return null;

    return {
      preferred_annual_salary: data.preferred_annual_salary,
      preferred_contract_years: data.preferred_contract_years,
      preferred_signing_bonus: data.preferred_signing_bonus,
      min_acceptable_salary: data.min_acceptable_salary,
    };
  } catch (error) {
    console.error("Error getting player preferences:", error);
    return null;
  }
}



