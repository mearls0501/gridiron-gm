import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase-client";
import { simulateGame, loadTeamWithRoster } from "@/lib/simulation/engine";

/**
 * Debug endpoint to test simulation and see what's happening with stats
 */
export async function POST(req: Request) {
  try {
    const { gameId, saveGameId } = await req.json();

    if (!gameId || !saveGameId) {
      return NextResponse.json(
        { error: "gameId and saveGameId required" },
        { status: 400 }
      );
    }

    // Get game
    const { data: game } = await supabase
      .from("games")
      .select("*")
      .eq("id", gameId)
      .single();

    if (!game) {
      return NextResponse.json({ error: "Game not found" }, { status: 404 });
    }

    console.log(`[Debug Sim] Loading rosters for game ${gameId}...`);

    // Load teams
    const homeTeam = await loadTeamWithRoster(game.home_team_id, saveGameId);
    const awayTeam = await loadTeamWithRoster(game.away_team_id, saveGameId);

    console.log(`[Debug Sim] Home team: ${homeTeam.name}, ${homeTeam.players.length} players`);
    console.log(`[Debug Sim] Away team: ${awayTeam.name}, ${awayTeam.players.length} players`);

    // Check player positions
    const homePositions = new Map<string, number>();
    homeTeam.players.forEach(p => {
      const count = homePositions.get(p.position) || 0;
      homePositions.set(p.position, count + 1);
    });

    const awayPositions = new Map<string, number>();
    awayTeam.players.forEach(p => {
      const count = awayPositions.get(p.position) || 0;
      awayPositions.set(p.position, count + 1);
    });

    // Sample a few players to check their data
    const homeSample = homeTeam.players.slice(0, 5).map(p => ({
      id: p.id,
      name: p.full_name,
      position: p.position,
      overall: p.overall,
      has_traits: !!p.traits,
      traits: p.traits,
    }));

    const awaySample = awayTeam.players.slice(0, 5).map(p => ({
      id: p.id,
      name: p.full_name,
      position: p.position,
      overall: p.overall,
      has_traits: !!p.traits,
      traits: p.traits,
    }));

    // Now simulate and check stats
    console.log(`[Debug Sim] Simulating game...`);
    const result = await simulateGame(
      {
        homeTeamId: game.home_team_id,
        awayTeamId: game.away_team_id,
        gameId: game.id,
        season: game.season,
        week: game.week,
        useEnhancedAttributes: true,  // 🏈 Enable attribute-based simulation
      },
      undefined,
      saveGameId
    );

    console.log(`[Debug Sim] Simulation complete. Generated ${result.playerStats.length} player stats`);

    // Analyze stats by position
    const statsByPosition = new Map<string, number>();
    const playersWithStats = new Set<string>();
    
    result.playerStats.forEach(stat => {
      // Find player in loaded teams
      const player = [...homeTeam.players, ...awayTeam.players].find(p => p.id === stat.player_id);
      if (player) {
        const count = statsByPosition.get(player.position) || 0;
        statsByPosition.set(player.position, count + 1);
        playersWithStats.add(stat.player_id);
      }
    });

    // Sample stats
    const statsSample = result.playerStats.slice(0, 10).map(stat => {
      const player = [...homeTeam.players, ...awayTeam.players].find(p => p.id === stat.player_id);
      return {
        player_name: player?.full_name || 'Unknown',
        position: player?.position || '?',
        snaps: stat.snaps_played,
        passing_yards: stat.passing_yards,
        rushing_yards: stat.rushing_yards,
        tackles: stat.tackles,
      };
    });

    return NextResponse.json({
      game: {
        id: game.id,
        season: game.season,
        week: game.week,
        home_team: homeTeam.name,
        away_team: awayTeam.name,
      },
      rosters: {
        home_size: homeTeam.players.length,
        away_size: awayTeam.players.length,
        home_positions: Object.fromEntries(homePositions),
        away_positions: Object.fromEntries(awayPositions),
        home_sample: homeSample,
        away_sample: awaySample,
      },
      simulation_result: {
        home_score: result.homeScore,
        away_score: result.awayScore,
        total_stats_generated: result.playerStats.length,
        unique_players_with_stats: playersWithStats.size,
        stats_by_position: Object.fromEntries(statsByPosition),
        stats_sample: statsSample,
      },
      analysis: {
        expected_stats: "40-60 players should have stats",
        actual_stats: result.playerStats.length,
        issue: result.playerStats.length < 20 ? 
          "VERY FEW STATS - Most players filtered out or not getting snaps" :
          "OK",
      },
    });

  } catch (error) {
    console.error('[Debug Sim] Error:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      },
      { status: 500 }
    );
  }
}

