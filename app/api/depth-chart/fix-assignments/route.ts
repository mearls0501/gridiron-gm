import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase-client';

/**
 * Fix player_team_assignments that have NULL save_game_id
 * by updating them to use the provided save_game_id
 */
export async function POST(req: Request) {
  try {
    const { saveGameId, teamId } = await req.json();

    if (!saveGameId) {
      return NextResponse.json(
        { error: 'saveGameId is required' },
        { status: 400 }
      );
    }

    // If teamId provided, fix only that team; otherwise fix all teams
    let query = supabase
      .from('player_team_assignments')
      .select('id, team_id, player_id, prospect_id', { count: 'exact' })
      .is('save_game_id', null);

    if (teamId) {
      query = query.eq('team_id', teamId);
    }

    const { data: nullAssignments, error: fetchError, count } = await query;

    if (fetchError) {
      return NextResponse.json(
        { error: `Failed to fetch assignments: ${fetchError.message}` },
        { status: 500 }
      );
    }

    if (!nullAssignments || nullAssignments.length === 0) {
      return NextResponse.json({
        success: true,
        updated: 0,
        message: 'No assignments with NULL save_game_id found',
      });
    }

    // Update assignments to use the provided save_game_id
    const { error: updateError } = await supabase
      .from('player_team_assignments')
      .update({ save_game_id: saveGameId })
      .is('save_game_id', null);

    if (updateError) {
      return NextResponse.json(
        { error: `Failed to update assignments: ${updateError.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      updated: count || 0,
      message: `Updated ${count} player assignments to save_game_id: ${saveGameId}`,
    });
  } catch (error) {
    console.error('Error fixing assignments:', error);
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}



