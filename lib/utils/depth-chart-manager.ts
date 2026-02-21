import { supabase } from "@/lib/supabase-client";

// Define depth chart structure matching the UI
const depthChartPositions = [
  { position: 'QB', slots: 3 },
  { position: 'RB', slots: 4 },
  { position: 'WR', slots: 6 },
  { position: 'TE', slots: 3 },
  { position: 'OT', slots: 4 },
  { position: 'OG', slots: 4 },
  { position: 'C', slots: 2 },
  { position: 'DE', slots: 4 },
  { position: 'DT', slots: 4 },
  { position: 'LB', slots: 6 },
  { position: 'CB', slots: 5 },
  { position: 'S', slots: 4 },
  { position: 'K', slots: 1 },
  { position: 'P', slots: 1 },
];

interface Player {
  id: string;
  position: string;
  overall: number;
}

/**
 * Generate or update depth chart for a specific team
 * Automatically ranks players by overall rating within each position
 */
export async function updateTeamDepthChart(
  teamId: string,
  seasonId: string,
  saveGameId: string,
  seasonYear?: number
): Promise<{ success: boolean; updated: number; error?: string }> {
  try {
    // 1. Fetch team roster - need to use left joins since each assignment has either player_id OR prospect_id
    const { data: assignments, error: assignmentsError } = await supabase
      .from('player_team_assignments')
      .select(`
        player_id,
        prospect_id,
        players (id, position, overall),
        draft_prospects (id, position, overall)
      `)
      .eq('team_id', teamId)
      .eq('save_game_id', saveGameId);

    if (assignmentsError) {
      console.error(`[DepthChart] Error fetching assignments for team ${teamId}:`, assignmentsError);
      return { success: false, updated: 0, error: assignmentsError.message };
    }

    if (!assignments || assignments.length === 0) {
      console.warn(`[DepthChart] No assignments found for team ${teamId}, saveGameId ${saveGameId}`);
      return { success: false, updated: 0, error: 'No players found for team' };
    }

    console.log(`[DepthChart] Found ${assignments.length} assignments for team ${teamId}`);

    // 2. Map to unified player structure
    const players: Player[] = assignments
      .map((assignment: any) => {
        if (assignment.player_id && assignment.players) {
          return {
            id: assignment.players.id,
            position: assignment.players.position,
            overall: assignment.players.overall,
          };
        }
        if (assignment.prospect_id && assignment.draft_prospects) {
          return {
            id: assignment.draft_prospects.id,
            position: assignment.draft_prospects.position,
            overall: assignment.draft_prospects.overall,
          };
        }
        return null;
      })
      .filter(Boolean) as Player[];

    console.log(`[DepthChart] Mapped ${players.length} valid players from assignments`);

    // 3. Generate depth chart slots
    const depthChartSlots: any[] = [];
    
    depthChartPositions.forEach(({ position, slots }) => {
      // Get all players at this position, sorted by overall rating (best first)
      const positionPlayers = players
        .filter(p => p.position === position)
        .sort((a, b) => b.overall - a.overall)
        .slice(0, slots); // Take only as many as we have slots

      // Create slot entries (slot 1 = starter, slot 2 = backup, etc.)
      positionPlayers.forEach((player, index) => {
        const slotData: any = {
          team_id: teamId,
          season_id: seasonId,
          position: position,
          slot: index + 1, // Slots are 1-indexed
          player_id: player.id,
          save_game_id: saveGameId,
          updated_at: new Date().toISOString(),
        };
        
        // Include season year if provided (for backwards compatibility)
        if (seasonYear) {
          slotData.season = seasonYear;
        }
        
        depthChartSlots.push(slotData);
      });
    });

    if (depthChartSlots.length === 0) {
      console.warn(`[DepthChart] No depth chart slots generated for team ${teamId}`);
      return { success: false, updated: 0, error: 'No depth chart slots generated' };
    }

    console.log(`[DepthChart] Generated ${depthChartSlots.length} depth chart slots for team ${teamId}`);

    // 4. Delete existing depth chart for this team/season
    const { error: deleteError } = await supabase
      .from('depth_chart_slots')
      .delete()
      .eq('team_id', teamId)
      .eq('season_id', seasonId)
      .eq('save_game_id', saveGameId);

    if (deleteError) {
      console.warn(`[DepthChart] Warning: Could not delete old depth chart: ${deleteError.message}`);
    }

    // 5. Insert new depth chart
    const { error: insertError, data: inserted } = await supabase
      .from('depth_chart_slots')
      .insert(depthChartSlots)
      .select();

    if (insertError) {
      console.error(`[DepthChart] Error inserting depth chart slots:`, insertError);
      return { success: false, updated: 0, error: insertError.message };
    }

    console.log(`[DepthChart] Successfully inserted ${inserted?.length || 0} depth chart slots for team ${teamId}`);

    return { 
      success: true, 
      updated: inserted?.length || 0 
    };
  } catch (error) {
    return {
      success: false,
      updated: 0,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Update depth charts for all teams in a league
 * Use this weekly or when rosters change significantly
 */
export async function updateAllDepthCharts(
  season: number,
  saveGameId: string
): Promise<{ 
  success: boolean; 
  teamsUpdated: number; 
  totalSlots: number;
  errors: string[];
}> {
  try {
    console.log(`[DepthChart] updateAllDepthCharts called for season ${season}, saveGameId ${saveGameId}`);

    // Get season_id from season year
    const { data: seasonData, error: seasonError } = await supabase
      .from('seasons')
      .select('id')
      .eq('year', season)
      .eq('save_game_id', saveGameId)
      .single();

    if (seasonError || !seasonData) {
      console.error(`[DepthChart] Could not find season ${season}:`, seasonError);
      return {
        success: false,
        teamsUpdated: 0,
        totalSlots: 0,
        errors: [`Could not find season ${season}: ${seasonError?.message}`],
      };
    }

    const seasonId = seasonData.id;
    console.log(`[DepthChart] Found season_id: ${seasonId}`);

    // Get all teams
    const { data: teams, error: teamsError } = await supabase
      .from('teams')
      .select('id, name');

    if (teamsError || !teams) {
      console.error(`[DepthChart] Could not fetch teams:`, teamsError);
      return {
        success: false,
        teamsUpdated: 0,
        totalSlots: 0,
        errors: [`Could not fetch teams: ${teamsError?.message}`],
      };
    }

    console.log(`[DepthChart] Processing depth charts for ${teams.length} teams`);

    const errors: string[] = [];
    let teamsUpdated = 0;
    let totalSlots = 0;

    // Update each team's depth chart
    for (const team of teams) {
      const result = await updateTeamDepthChart(team.id, seasonId, saveGameId, season);
      
      if (result.success) {
        teamsUpdated++;
        totalSlots += result.updated;
      } else {
        errors.push(`${team.name}: ${result.error}`);
      }
    }

    console.log(`[DepthChart] Completed: ${teamsUpdated} teams updated, ${totalSlots} total slots, ${errors.length} errors`);

    return {
      success: errors.length === 0,
      teamsUpdated,
      totalSlots,
      errors,
    };
  } catch (error) {
    console.error(`[DepthChart] Error in updateAllDepthCharts:`, error);
    return {
      success: false,
      teamsUpdated: 0,
      totalSlots: 0,
      errors: [error instanceof Error ? error.message : 'Unknown error'],
    };
  }
}

