import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase-client";

/**
 * Advance to the next playoff round
 * Creates the next round's games based on previous round winners
 */
export async function POST(req: Request) {
  try {
    const { season, currentRound, saveGameId } = await req.json();

    if (!season || !currentRound) {
      return NextResponse.json(
        { error: "Season and currentRound are required" },
        { status: 400 }
      );
    }

    // Validate round progression
    const roundOrder = ["wild_card", "divisional", "conference_championship", "super_bowl"];
    const currentIndex = roundOrder.indexOf(currentRound);
    
    if (currentIndex === -1) {
      return NextResponse.json(
        { error: `Invalid round: ${currentRound}` },
        { status: 400 }
      );
    }

    if (currentIndex === roundOrder.length - 1) {
      return NextResponse.json(
        { error: "Super Bowl is the final round" },
        { status: 400 }
      );
    }

    // Check if current round is complete
    let currentRoundQuery = supabase
      .from("playoff_games")
      .select("*")
      .eq("season", season)
      .eq("round", currentRound);
    
    if (saveGameId) {
      currentRoundQuery = currentRoundQuery.eq("save_game_id", saveGameId);
    } else {
      currentRoundQuery = currentRoundQuery.is("save_game_id", null);
    }
    
    const { data: currentRoundGames, error: gamesError } = await currentRoundQuery;

    if (gamesError) {
      return NextResponse.json(
        { error: "Failed to fetch current round games" },
        { status: 500 }
      );
    }

    const incompleteGames = currentRoundGames?.filter(g => !g.played) || [];
    if (incompleteGames.length > 0) {
      return NextResponse.json(
        { 
          error: `Current round is not complete. ${incompleteGames.length} games remaining.`,
          incompleteGames: incompleteGames.length
        },
        { status: 400 }
      );
    }

    const nextRound = roundOrder[currentIndex + 1];
    const nextWeek = 19 + currentIndex + 1; // Week 19 = Wild Card, 20 = Divisional, 21 = Conference, 22 = Super Bowl

    // Check if next round already exists - filter by save_game_id
    let existingNextRoundQuery = supabase
      .from("playoff_games")
      .select("id")
      .eq("season", season)
      .eq("round", nextRound);
    
    if (saveGameId) {
      existingNextRoundQuery = existingNextRoundQuery.eq("save_game_id", saveGameId);
    } else {
      existingNextRoundQuery = existingNextRoundQuery.is("save_game_id", null);
    }
    
    const { data: existingNextRound } = await existingNextRoundQuery.limit(1);

    if (existingNextRound && existingNextRound.length > 0) {
      return NextResponse.json(
        { 
          error: `${nextRound} round already exists`,
          message: "Use /api/playoffs/status to view current bracket"
        },
        { status: 400 }
      );
    }

    // Get winners from current round
    const winners = currentRoundGames
      ?.filter(g => g.winner_id)
      .map(g => ({
        winnerId: g.winner_id!,
        conference: g.conference,
        homeTeamSeed: g.home_team_seed,
        awayTeamSeed: g.away_team_seed,
        winnerSeed: g.winner_id === g.home_team_id ? g.home_team_seed : g.away_team_seed,
      })) || [];

    if (winners.length === 0) {
      return NextResponse.json(
        { error: "No winners found in current round" },
        { status: 400 }
      );
    }

    // Create next round games based on round type
    const nextRoundGames: any[] = [];

    if (nextRound === "divisional") {
      // Divisional Round: 1 seed vs lowest remaining, 2 seed vs next lowest
      // Separate by conference
      const afcWinners = winners.filter(w => w.conference === "AFC").sort((a, b) => a.winnerSeed! - b.winnerSeed!);
      const nfcWinners = winners.filter(w => w.conference === "NFC").sort((a, b) => a.winnerSeed! - b.winnerSeed!);

      // Get #1 seeds (they get a bye in wild card)
      let seedsQuery = supabase
        .from("playoff_seeds")
        .select("team_id, seed, conference")
        .eq("season", season)
        .eq("seed", 1);
      
      // Filter by save_game_id if provided
      if (saveGameId) {
        seedsQuery = seedsQuery.eq("save_game_id", saveGameId);
      } else {
        seedsQuery = seedsQuery.is("save_game_id", null);
      }
      
      const { data: seeds } = await seedsQuery;

      const afc1Seed = seeds?.find(s => s.conference === "AFC");
      const nfc1Seed = seeds?.find(s => s.conference === "NFC");

      // AFC Divisional games
      if (afc1Seed && afcWinners.length > 0) {
        // #1 seed vs lowest wild card winner
        const lowestWinner = afcWinners[0];
        nextRoundGames.push({
          season,
          week: nextWeek,
          round: nextRound,
          conference: "AFC",
          home_team_id: afc1Seed.team_id,
          away_team_id: lowestWinner.winnerId,
          home_team_seed: 1,
          away_team_seed: lowestWinner.winnerSeed,
          home_score: null,
          away_score: null,
          played: false,
          winner_id: null,
          save_game_id: saveGameId || null,
        });

        // Other two winners play each other
        if (afcWinners.length >= 2) {
          const [team1, team2] = afcWinners.slice(1, 3);
          // Higher seed is home
          const homeTeam = team1.winnerSeed! < team2.winnerSeed! ? team1 : team2;
          const awayTeam = team1.winnerSeed! < team2.winnerSeed! ? team2 : team1;
          nextRoundGames.push({
            season,
            week: nextWeek,
            round: nextRound,
            conference: "AFC",
            home_team_id: homeTeam.winnerId,
            away_team_id: awayTeam.winnerId,
            home_team_seed: homeTeam.winnerSeed,
            away_team_seed: awayTeam.winnerSeed,
            home_score: null,
            away_score: null,
            played: false,
            winner_id: null,
            save_game_id: saveGameId || null,
          });
        }
      }

      // NFC Divisional games (same logic)
      if (nfc1Seed && nfcWinners.length > 0) {
        const lowestWinner = nfcWinners[0];
        nextRoundGames.push({
          season,
          week: nextWeek,
          round: nextRound,
          conference: "NFC",
          home_team_id: nfc1Seed.team_id,
          away_team_id: lowestWinner.winnerId,
          home_team_seed: 1,
          away_team_seed: lowestWinner.winnerSeed,
          home_score: null,
          away_score: null,
          played: false,
          winner_id: null,
          save_game_id: saveGameId || null,
        });

        if (nfcWinners.length >= 2) {
          const [team1, team2] = nfcWinners.slice(1, 3);
          const homeTeam = team1.winnerSeed! < team2.winnerSeed! ? team1 : team2;
          const awayTeam = team1.winnerSeed! < team2.winnerSeed! ? team2 : team1;
          nextRoundGames.push({
            season,
            week: nextWeek,
            round: nextRound,
            conference: "NFC",
            home_team_id: homeTeam.winnerId,
            away_team_id: awayTeam.winnerId,
            home_team_seed: homeTeam.winnerSeed,
            away_team_seed: awayTeam.winnerSeed,
            home_score: null,
            away_score: null,
            played: false,
            winner_id: null,
            save_game_id: saveGameId || null,
          });
        }
      }
    } else if (nextRound === "conference_championship") {
      // Conference Championship: Winners of divisional round
      const afcWinners = winners.filter(w => w.conference === "AFC");
      const nfcWinners = winners.filter(w => w.conference === "NFC");

      if (afcWinners.length === 2) {
        const [team1, team2] = afcWinners.sort((a, b) => a.winnerSeed! - b.winnerSeed!);
        nextRoundGames.push({
          season,
          week: nextWeek,
          round: nextRound,
          conference: "AFC",
          home_team_id: team1.winnerId,
          away_team_id: team2.winnerId,
          home_team_seed: team1.winnerSeed,
          away_team_seed: team2.winnerSeed,
          home_score: null,
          away_score: null,
          played: false,
          winner_id: null,
          save_game_id: saveGameId || null,
        });
      }

      if (nfcWinners.length === 2) {
        const [team1, team2] = nfcWinners.sort((a, b) => a.winnerSeed! - b.winnerSeed!);
        nextRoundGames.push({
          season,
          week: nextWeek,
          round: nextRound,
          conference: "NFC",
          home_team_id: team1.winnerId,
          away_team_id: team2.winnerId,
          home_team_seed: team1.winnerSeed,
          away_team_seed: team2.winnerSeed,
          home_score: null,
          away_score: null,
          played: false,
          winner_id: null,
          save_game_id: saveGameId || null,
        });
      }
    } else if (nextRound === "super_bowl") {
      // Super Bowl: Conference champions
      const afcChampion = winners.find(w => w.conference === "AFC");
      const nfcChampion = winners.find(w => w.conference === "NFC");

      if (afcChampion && nfcChampion) {
        // Super Bowl home team alternates - use AFC as home for even years, NFC for odd
        const isAfcHome = season % 2 === 0;
        nextRoundGames.push({
          season,
          week: nextWeek,
          round: nextRound,
          conference: null, // Super Bowl has no conference
          home_team_id: isAfcHome ? afcChampion.winnerId : nfcChampion.winnerId,
          away_team_id: isAfcHome ? nfcChampion.winnerId : afcChampion.winnerId,
          home_team_seed: null,
          away_team_seed: null,
          home_score: null,
          away_score: null,
          played: false,
          winner_id: null,
          save_game_id: saveGameId || null,
        });
      }
    }

    if (nextRoundGames.length === 0) {
      return NextResponse.json(
        { error: "Failed to create next round games - insufficient winners" },
        { status: 400 }
      );
    }

    // Insert next round games
    const { error: insertError } = await supabase
      .from("playoff_games")
      .insert(nextRoundGames);

    if (insertError) {
      console.error("Error inserting next round games:", insertError);
      return NextResponse.json(
        { error: "Failed to create next round games" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Created ${nextRound} round games`,
      nextRound,
      nextWeek,
      gamesCreated: nextRoundGames.length,
    });
  } catch (error) {
    console.error("Error advancing playoff round:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

