import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase-client';

/**
 * Diagnostic endpoint to check why depth chart generation might be failing
 */
export async function POST(req: Request) {
  try {
    const { teamId, saveGameId } = await req.json();

    if (!teamId || !saveGameId) {
      return NextResponse.json(
        { error: 'teamId and saveGameId are required' },
        { status: 400 }
      );
    }

    const diagnostics: any = {
      teamId,
      saveGameId,
      checks: [],
    };

    // 1. Check if team exists
    const { data: team, error: teamError } = await supabase
      .from('teams')
      .select('id, name, abbreviation')
      .eq('id', teamId)
      .single();

    diagnostics.checks.push({
      check: 'Team exists',
      passed: !!team,
      data: team || null,
      error: teamError?.message,
    });

    // 2. Check if save game exists
    const { data: saveGame, error: saveError } = await supabase
      .from('save_games')
      .select('id, save_name, current_season, current_week')
      .eq('id', saveGameId)
      .single();

    diagnostics.checks.push({
      check: 'Save game exists',
      passed: !!saveGame,
      data: saveGame || null,
      error: saveError?.message,
    });

    // 3. Check player_team_assignments with this save_game_id
    const { data: assignments, error: assignError, count } = await supabase
      .from('player_team_assignments')
      .select(`
        *,
        players (id, position, overall),
        draft_prospects (id, position, overall)
      `, { count: 'exact' })
      .eq('team_id', teamId)
      .eq('save_game_id', saveGameId);

    diagnostics.checks.push({
      check: 'Player assignments (correct save_game_id)',
      passed: !!assignments && assignments.length > 0,
      count: count || 0,
      data: assignments?.slice(0, 5) || [], // First 5 for preview
      error: assignError?.message,
    });

    // 4. Check if there are ANY assignments for this team (any save_game_id)
    const { count: anyCount } = await supabase
      .from('player_team_assignments')
      .select('*', { count: 'exact', head: true })
      .eq('team_id', teamId);

    diagnostics.checks.push({
      check: 'Player assignments (any save_game_id)',
      count: anyCount || 0,
      passed: (anyCount || 0) > 0,
    });

    // 5. Check if there are assignments with NULL save_game_id
    const { count: nullCount } = await supabase
      .from('player_team_assignments')
      .select('*', { count: 'exact', head: true })
      .eq('team_id', teamId)
      .is('save_game_id', null);

    diagnostics.checks.push({
      check: 'Player assignments (NULL save_game_id)',
      count: nullCount || 0,
      passed: (nullCount || 0) > 0,
      note: nullCount && nullCount > 0 
        ? 'Found assignments with NULL save_game_id - you may need to migrate them'
        : null,
    });

    // 6. Check seasons table
    const { data: seasons, count: seasonCount } = await supabase
      .from('seasons')
      .select('id, year, save_game_id', { count: 'exact' })
      .eq('save_game_id', saveGameId);

    diagnostics.checks.push({
      check: 'Seasons for this save game',
      count: seasonCount || 0,
      passed: !!seasons && seasons.length > 0,
      data: seasons || [],
    });

    // 7. Overall assessment
    const hasTeam = !!team;
    const hasSaveGame = !!saveGame;
    const hasAssignments = assignments && assignments.length > 0;
    const hasNullAssignments = (nullCount || 0) > 0;

    let recommendation = '';
    if (!hasTeam) {
      recommendation = 'Team not found. Check that the team ID is correct.';
    } else if (!hasSaveGame) {
      recommendation = 'Save game not found. Check that the save game ID is correct.';
    } else if (hasNullAssignments && !hasAssignments) {
      recommendation = 'Found player assignments with NULL save_game_id. You need to migrate them to the current save game. Use the roster validation/fix API.';
    } else if (!hasAssignments && !hasNullAssignments) {
      recommendation = 'No players found for this team. The team roster may be empty. Try replenishing the roster or creating a new game.';
    } else if (hasAssignments) {
      recommendation = 'All checks passed! Depth chart should generate successfully.';
    }

    diagnostics.recommendation = recommendation;
    diagnostics.summary = {
      hasTeam,
      hasSaveGame,
      hasAssignments,
      assignmentCount: count || 0,
      hasNullAssignments,
      nullAssignmentCount: nullCount || 0,
    };

    return NextResponse.json(diagnostics);
  } catch (error) {
    console.error('Error diagnosing depth chart:', error);
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

