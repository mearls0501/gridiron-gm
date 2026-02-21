import { NextResponse } from "next/server";
import { 
  updatePlayerRatingsForSeason, 
  aggregateSeasonStats 
} from "@/lib/simulation/player-development";

export async function POST(req: Request) {
  try {
    const { season, saveGameId } = await req.json();

    if (!season) {
      return NextResponse.json(
        { error: "Season is required" },
        { status: 400 }
      );
    }

    // First, aggregate season stats
    const aggregationResult = await aggregateSeasonStats(season, saveGameId);

    // Then, update player ratings based on performance
    const ratingResult = await updatePlayerRatingsForSeason(season);

    return NextResponse.json({
      success: true,
      season,
      aggregation: {
        aggregated: aggregationResult.aggregated,
        errors: aggregationResult.errors,
      },
      ratings: {
        updated: ratingResult.updated,
        errors: ratingResult.errors,
      },
    });
  } catch (error) {
    console.error("Error updating season ratings:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

