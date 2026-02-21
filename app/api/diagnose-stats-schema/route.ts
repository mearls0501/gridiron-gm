import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase-client";

/**
 * Diagnose player stats table schema issues
 * Checks if save_game_id column exists and if stats are being saved
 */
export async function GET() {
  try {
    const diagnostics: Record<string, unknown> = {};

    // Check if player_game_stats table exists and its columns
    const { data: gameStatsColumns, error: gameStatsError } = await supabase
      .rpc('get_table_columns', { table_name: 'player_game_stats' })
      .select();

    if (gameStatsError) {
      // Fallback: try to query the table directly
      const { data: gameStatsTest, error: testError } = await supabase
        .from('player_game_stats')
        .select('*')
        .limit(1);

      diagnostics.player_game_stats = {
        exists: !testError,
        error: testError?.message,
        sample: gameStatsTest?.[0] || null,
        columns: gameStatsTest?.[0] ? Object.keys(gameStatsTest[0]) : [],
      };
    } else {
      diagnostics.player_game_stats = {
        exists: true,
        columns: gameStatsColumns || [],
      };
    }

    // Check player_season_stats
    const { data: seasonStatsTest, error: seasonStatsError } = await supabase
      .from('player_season_stats')
      .select('*')
      .limit(1);

    diagnostics.player_season_stats = {
      exists: !seasonStatsError,
      error: seasonStatsError?.message,
      sample: seasonStatsTest?.[0] || null,
      columns: seasonStatsTest?.[0] ? Object.keys(seasonStatsTest[0]) : [],
    };

    // Check player_lifetime_stats
    const { data: lifetimeStatsTest, error: lifetimeStatsError } = await supabase
      .from('player_lifetime_stats')
      .select('*')
      .limit(1);

    diagnostics.player_lifetime_stats = {
      exists: !lifetimeStatsError,
      error: lifetimeStatsError?.message,
      sample: lifetimeStatsTest?.[0] || null,
      columns: lifetimeStatsTest?.[0] ? Object.keys(lifetimeStatsTest[0]) : [],
    };

    // Check if save_game_id column exists in each table
    const hasSaveGameIdInGameStats = 
      diagnostics.player_game_stats &&
      typeof diagnostics.player_game_stats === 'object' &&
      'columns' in diagnostics.player_game_stats &&
      Array.isArray(diagnostics.player_game_stats.columns) &&
      diagnostics.player_game_stats.columns.includes('save_game_id');

    const hasSaveGameIdInSeasonStats = 
      diagnostics.player_season_stats &&
      typeof diagnostics.player_season_stats === 'object' &&
      'columns' in diagnostics.player_season_stats &&
      Array.isArray(diagnostics.player_season_stats.columns) &&
      diagnostics.player_season_stats.columns.includes('save_game_id');

    const hasSaveGameIdInLifetimeStats = 
      diagnostics.player_lifetime_stats &&
      typeof diagnostics.player_lifetime_stats === 'object' &&
      'columns' in diagnostics.player_lifetime_stats &&
      Array.isArray(diagnostics.player_lifetime_stats.columns) &&
      diagnostics.player_lifetime_stats.columns.includes('save_game_id');

    // Count stats records
    const { count: gameStatsCount } = await supabase
      .from('player_game_stats')
      .select('*', { count: 'exact', head: true });

    const { count: seasonStatsCount } = await supabase
      .from('player_season_stats')
      .select('*', { count: 'exact', head: true });

    const { count: lifetimeStatsCount } = await supabase
      .from('player_lifetime_stats')
      .select('*', { count: 'exact', head: true });

    // Build final report
    const report = {
      timestamp: new Date().toISOString(),
      tables: {
        player_game_stats: {
          exists: diagnostics.player_game_stats && 
            typeof diagnostics.player_game_stats === 'object' && 
            'exists' in diagnostics.player_game_stats ? 
            diagnostics.player_game_stats.exists : false,
          has_save_game_id: hasSaveGameIdInGameStats,
          record_count: gameStatsCount || 0,
          columns: diagnostics.player_game_stats && 
            typeof diagnostics.player_game_stats === 'object' && 
            'columns' in diagnostics.player_game_stats ? 
            diagnostics.player_game_stats.columns : [],
        },
        player_season_stats: {
          exists: diagnostics.player_season_stats && 
            typeof diagnostics.player_season_stats === 'object' && 
            'exists' in diagnostics.player_season_stats ? 
            diagnostics.player_season_stats.exists : false,
          has_save_game_id: hasSaveGameIdInSeasonStats,
          record_count: seasonStatsCount || 0,
          columns: diagnostics.player_season_stats && 
            typeof diagnostics.player_season_stats === 'object' && 
            'columns' in diagnostics.player_season_stats ? 
            diagnostics.player_season_stats.columns : [],
        },
        player_lifetime_stats: {
          exists: diagnostics.player_lifetime_stats && 
            typeof diagnostics.player_lifetime_stats === 'object' && 
            'exists' in diagnostics.player_lifetime_stats ? 
            diagnostics.player_lifetime_stats.exists : false,
          has_save_game_id: hasSaveGameIdInLifetimeStats,
          record_count: lifetimeStatsCount || 0,
          columns: diagnostics.player_lifetime_stats && 
            typeof diagnostics.player_lifetime_stats === 'object' && 
            'columns' in diagnostics.player_lifetime_stats ? 
            diagnostics.player_lifetime_stats.columns : [],
        },
      },
      issues: [] as string[],
      recommendations: [] as string[],
    };

    // Identify issues
    if (!hasSaveGameIdInGameStats) {
      report.issues.push('player_game_stats table is missing save_game_id column');
      report.recommendations.push('Run migration: supabase/migrations/fix_player_stats_save_game_id.sql');
    }

    if (!hasSaveGameIdInSeasonStats) {
      report.issues.push('player_season_stats table is missing save_game_id column');
      report.recommendations.push('Run migration: supabase/migrations/fix_player_stats_save_game_id.sql');
    }

    if (!hasSaveGameIdInLifetimeStats) {
      report.issues.push('player_lifetime_stats table is missing save_game_id column');
      report.recommendations.push('Run migration: supabase/migrations/fix_player_stats_save_game_id.sql');
    }

    if (gameStatsCount === 0) {
      report.issues.push('No game stats records found - stats may not be saving');
      report.recommendations.push('Simulate a game to test if stats are being saved');
    }

    // Summary
    const allGood = report.issues.length === 0;
    
    return NextResponse.json({
      status: allGood ? 'healthy' : 'issues_found',
      report,
    });

  } catch (error) {
    console.error('Error diagnosing stats schema:', error);
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
 * Apply the fix migration automatically
 */
export async function POST() {
  try {
    // Read the migration file and execute it
    // Note: This is a simplified approach - in production, you'd want to use proper migration tools
    
    return NextResponse.json({
      message: 'Please run the migration manually using Supabase CLI or SQL editor',
      migration_file: 'supabase/migrations/fix_player_stats_save_game_id.sql',
      instructions: [
        '1. Open Supabase SQL Editor',
        '2. Copy contents of supabase/migrations/fix_player_stats_save_game_id.sql',
        '3. Paste and execute the SQL',
        '4. Verify with GET /api/diagnose-stats-schema',
      ],
    });

  } catch (error) {
    console.error('Error applying fix:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}



