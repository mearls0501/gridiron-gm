import { NextResponse } from 'next/server';
import { updateAllDepthCharts, updateTeamDepthChart } from '@/lib/utils/depth-chart-manager';
import { supabase } from '@/lib/supabase-client';

export async function POST(req: Request) {
  try {
    const { season, saveGameId, teamId } = await req.json();

    console.log('[DepthChart API] Request received:', { season, saveGameId, teamId: teamId || 'ALL TEAMS' });

    if (!season) {
      return NextResponse.json(
        { error: 'season is required' },
        { status: 400 }
      );
    }

    if (!saveGameId) {
      return NextResponse.json(
        { error: 'saveGameId is required' },
        { status: 400 }
      );
    }

    // If teamId provided, update single team
    if (teamId) {
      console.log('[DepthChart API] Updating SINGLE team:', teamId);
      // Get season_id
      const { data: seasonData, error: seasonError } = await supabase
        .from('seasons')
        .select('id')
        .eq('year', season)
        .eq('save_game_id', saveGameId)
        .single();

      if (seasonError || !seasonData) {
        return NextResponse.json(
          { error: `Season not found: ${seasonError?.message}` },
          { status: 404 }
        );
      }

      const result = await updateTeamDepthChart(teamId, seasonData.id, saveGameId, season);
      
      return NextResponse.json({
        success: result.success,
        teamsUpdated: result.success ? 1 : 0,
        totalSlots: result.updated,
        error: result.error,
      });
    }

    // Update all teams
    console.log('[DepthChart API] Updating ALL TEAMS (no teamId provided)');
    const result = await updateAllDepthCharts(season, saveGameId);

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error updating depth charts:', error);
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Unknown error',
        success: false,
      },
      { status: 500 }
    );
  }
}

