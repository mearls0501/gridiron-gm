import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase-client";

/**
 * Get current playoff bracket status
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const season = parseInt(searchParams.get("season") || "2025");

    // Get all playoff games
    const { data: games, error: gamesError } = await supabase
      .from("playoff_games")
      .select(`
        *,
        home_team:teams!playoff_games_home_team_id_fkey(id, name, abbreviation),
        away_team:teams!playoff_games_away_team_id_fkey(id, name, abbreviation),
        winner:teams!playoff_games_winner_id_fkey(id, name, abbreviation)
      `)
      .eq("season", season)
      .order("week", { ascending: true })
      .order("round", { ascending: true });

    if (gamesError) {
      // Check if table doesn't exist
      if (gamesError.code === "PGRST116" || gamesError.message?.includes("does not exist")) {
        return NextResponse.json({
          season,
          phase: "regular_season",
          currentWeek: 18,
          champion: null,
          seeds: [],
          bracket: {
            wildCard: [],
            divisional: [],
            conferenceChampionship: [],
            superBowl: null,
          },
          rounds: {
            wildCard: { total: 0, played: 0, complete: false },
            divisional: { total: 0, played: 0, complete: false },
            conferenceChampionship: { total: 0, played: 0, complete: false },
            superBowl: { played: false, complete: false },
          },
          error: "Playoff tables not found. Please run the migration: supabase/migrations/create_playoffs_tables.sql",
        });
      }
      return NextResponse.json(
        { error: `Failed to fetch playoff games: ${gamesError.message}` },
        { status: 500 }
      );
    }

    // Get playoff seeds
    const { data: seeds, error: seedsError } = await supabase
      .from("playoff_seeds")
      .select(`
        *,
        team:teams!playoff_seeds_team_id_fkey(id, name, abbreviation)
      `)
      .eq("season", season)
      .order("conference")
      .order("seed");

    if (seedsError) {
      console.error("Error fetching seeds:", seedsError);
    }

    // Group games by round
    const bracket = {
      wildCard: games?.filter(g => g.round === "wild_card") || [],
      divisional: games?.filter(g => g.round === "divisional") || [],
      conferenceChampionship: games?.filter(g => g.round === "conference_championship") || [],
      superBowl: games?.find(g => g.round === "super_bowl") || null,
    };

    // Check season status
    const { data: seasonData } = await supabase
      .from("seasons")
      .select("phase, champion_team_id, current_week")
      .eq("year", season)
      .eq("is_active", true)
      .single();

    return NextResponse.json({
      season,
      phase: seasonData?.phase || "regular_season",
      currentWeek: seasonData?.current_week || 18,
      champion: seasonData?.champion_team_id || null,
      seeds: seeds || [],
      bracket,
      rounds: {
        wildCard: {
          total: bracket.wildCard.length,
          played: bracket.wildCard.filter(g => g.played).length,
          complete: bracket.wildCard.length > 0 && bracket.wildCard.every(g => g.played),
        },
        divisional: {
          total: bracket.divisional.length,
          played: bracket.divisional.filter(g => g.played).length,
          complete: bracket.divisional.length > 0 && bracket.divisional.every(g => g.played),
        },
        conferenceChampionship: {
          total: bracket.conferenceChampionship.length,
          played: bracket.conferenceChampionship.filter(g => g.played).length,
          complete: bracket.conferenceChampionship.length > 0 && bracket.conferenceChampionship.every(g => g.played),
        },
        superBowl: {
          played: bracket.superBowl?.played || false,
          complete: bracket.superBowl?.played || false,
        },
      },
    });
  } catch (error) {
    console.error("Error fetching playoff status:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

