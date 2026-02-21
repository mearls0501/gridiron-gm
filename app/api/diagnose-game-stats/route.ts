import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase-client";

/**
 * Comprehensive diagnostic for game stats saving/retrieval issues
 * Run this after simulating a game to see what's happening
 */
export async function POST(req: Request) {
  try {
    const { gameId, saveGameId } = await req.json();

    if (!gameId) {
      return NextResponse.json(
        { error: "gameId is required" },
        { status: 400 }
      );
    }

    const diagnostics: Record<string, unknown> = {
      gameId,
      saveGameId: saveGameId || 'not provided',
      timestamp: new Date().toISOString(),
    };

    // 1. Check if the game exists and its save_game_id
    const { data: game, error: gameError } = await supabase
      .from("games")
      .select("*")
      .eq("id", gameId)
      .single();

    diagnostics.game = {
      exists: !gameError,
      error: gameError?.message,
      data: game,
      played: game?.played,
      has_scores: game?.home_score !== null && game?.away_score !== null,
      save_game_id: game?.save_game_id,
      save_game_id_matches: game?.save_game_id === saveGameId,
    };

    if (!game) {
      return NextResponse.json({
        status: 'game_not_found',
        diagnostics,
      });
    }

    // 2. Check for ANY stats for this game (regardless of save_game_id)
    const { data: allGameStats, error: allStatsError } = await supabase
      .from("player_game_stats")
      .select("*")
      .eq("game_id", gameId);

    diagnostics.stats_any_save_game = {
      count: allGameStats?.length || 0,
      error: allStatsError?.message,
      sample: allGameStats?.[0] || null,
    };

    // 3. Check for stats with matching save_game_id
    let matchingStats = [];
    if (saveGameId) {
      const { data: statsWithSaveGameId, error: matchingError } = await supabase
        .from("player_game_stats")
        .select("*")
        .eq("game_id", gameId)
        .eq("save_game_id", saveGameId);

      matchingStats = statsWithSaveGameId || [];
      
      diagnostics.stats_with_save_game_id = {
        count: matchingStats.length,
        error: matchingError?.message,
        sample: matchingStats[0] || null,
      };
    }

    // 4. Check for stats with NULL save_game_id
    const { data: statsWithNullSaveGameId, error: nullError } = await supabase
      .from("player_game_stats")
      .select("*")
      .eq("game_id", gameId)
      .is("save_game_id", null);

    diagnostics.stats_with_null_save_game_id = {
      count: statsWithNullSaveGameId?.length || 0,
      error: nullError?.message,
      sample: statsWithNullSaveGameId?.[0] || null,
    };

    // 5. Check for stats with DIFFERENT save_game_id
    const { data: statsWithDifferentSaveGameId, error: differentError } = await supabase
      .from("player_game_stats")
      .select("*")
      .eq("game_id", gameId)
      .not("save_game_id", "eq", saveGameId || '00000000-0000-0000-0000-000000000000');

    diagnostics.stats_with_different_save_game_id = {
      count: statsWithDifferentSaveGameId?.length || 0,
      error: differentError?.message,
      sample: statsWithDifferentSaveGameId?.[0] || null,
    };

    // 6. Check if players exist for this game's teams
    if (game && saveGameId) {
      const { count: homeRosterCount } = await supabase
        .from("player_team_assignments")
        .select("*", { count: "exact", head: true })
        .eq("team_id", game.home_team_id)
        .eq("save_game_id", saveGameId);

      const { count: awayRosterCount } = await supabase
        .from("player_team_assignments")
        .select("*", { count: "exact", head: true })
        .eq("team_id", game.away_team_id)
        .eq("save_game_id", saveGameId);

      diagnostics.rosters = {
        home_team_id: game.home_team_id,
        away_team_id: game.away_team_id,
        home_roster_size: homeRosterCount || 0,
        away_roster_size: awayRosterCount || 0,
        both_full: homeRosterCount === 53 && awayRosterCount === 53,
      };
    }

    // 7. Try to insert a test stat to check for database constraints
    const testPlayerId = 'test-player-' + Math.random().toString(36).substring(7);
    const testStat = {
      player_id: testPlayerId,
      game_id: gameId,
      team_id: game?.home_team_id || 'test-team',
      season: game?.season || 2024,
      week: game?.week || 1,
      save_game_id: saveGameId,
      passing_yards: 100,
      snaps_played: 10,
    };

    const { error: testInsertError } = await supabase
      .from("player_game_stats")
      .insert(testStat);

    diagnostics.test_insert = {
      attempted: true,
      error: testInsertError?.message || null,
      can_insert: !testInsertError,
    };

    // Clean up test stat if it was inserted
    if (!testInsertError) {
      await supabase
        .from("player_game_stats")
        .delete()
        .eq("player_id", testPlayerId);
    }

    // 8. Check RLS policies
    const { data: policies, error: policyError } = await supabase
      .rpc('pg_policies')
      .select('*');

    diagnostics.rls_info = {
      error: policyError?.message || 'Could not check policies',
      note: 'RLS might be blocking inserts - check Supabase dashboard',
    };

    // 9. Generate diagnosis and recommendations
    const issues: string[] = [];
    const recommendations: string[] = [];

    if (!game?.played) {
      issues.push('Game has not been played yet');
      recommendations.push('Simulate this game first');
    }

    if ((allGameStats?.length || 0) === 0) {
      issues.push('NO stats found for this game at all');
      recommendations.push('Check console logs during simulation for errors');
      recommendations.push('Stats may not be generating during simulation');
    } else if ((matchingStats?.length || 0) === 0 && saveGameId) {
      issues.push(`Stats exist but not with save_game_id: ${saveGameId}`);
      if ((statsWithNullSaveGameId?.length || 0) > 0) {
        recommendations.push('Stats are being saved with NULL save_game_id');
        recommendations.push('Check that saveGameId is being passed to simulation API');
      }
      if ((statsWithDifferentSaveGameId?.length || 0) > 0) {
        recommendations.push('Stats are being saved with a DIFFERENT save_game_id');
        recommendations.push('Check that the correct save game is loaded in the UI');
      }
    }

    if (diagnostics.rosters && typeof diagnostics.rosters === 'object' && 'both_full' in diagnostics.rosters && !diagnostics.rosters.both_full) {
      issues.push('One or both teams do not have full rosters (53 players)');
      recommendations.push('Run roster replenishment for affected teams');
    }

    if (testInsertError) {
      issues.push(`Cannot insert stats into database: ${testInsertError.message}`);
      recommendations.push('Check database constraints and RLS policies');
    }

    const status = issues.length === 0 ? 'healthy' : 'issues_found';

    return NextResponse.json({
      status,
      issues,
      recommendations,
      diagnostics,
    });

  } catch (error) {
    console.error('Error diagnosing game stats:', error);
    return NextResponse.json(
      {
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * Get a summary of all stats in the database
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const saveGameId = url.searchParams.get('saveGameId');

    // Count total stats
    const { count: totalStats } = await supabase
      .from("player_game_stats")
      .select("*", { count: "exact", head: true });

    // Count stats with save_game_id
    let statsWithSaveGameId = 0;
    if (saveGameId) {
      const { count } = await supabase
        .from("player_game_stats")
        .select("*", { count: "exact", head: true })
        .eq("save_game_id", saveGameId);
      statsWithSaveGameId = count || 0;
    }

    // Count stats with NULL save_game_id
    const { count: statsWithNull } = await supabase
      .from("player_game_stats")
      .select("*", { count: "exact", head: true })
      .is("save_game_id", null);

    // Get sample of recent stats
    const { data: recentStats } = await supabase
      .from("player_game_stats")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(5);

    return NextResponse.json({
      summary: {
        total_stats: totalStats || 0,
        stats_with_save_game_id: statsWithSaveGameId,
        stats_with_null_save_game_id: statsWithNull || 0,
        save_game_id_provided: saveGameId || 'none',
      },
      recent_stats: recentStats || [],
    });

  } catch (error) {
    console.error('Error getting stats summary:', error);
    return NextResponse.json(
      {
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}



