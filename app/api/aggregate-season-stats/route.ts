import { NextResponse } from "next/server";
import { aggregateSeasonStats } from "@/lib/simulation/player-development";

/**
 * Manually trigger aggregation of season stats from game stats
 * Useful for fixing data or regenerating stats after clearing old data
 */
export async function POST(req: Request) {
  try {
    const { season, saveGameId } = await req.json();

    if (!season) {
      return NextResponse.json(
        { error: "Season is required" },
        { status: 400 }
      );
    }

    console.log(`[AggregateStats API] Starting aggregation for season ${season}, saveGameId: ${saveGameId || 'null'}`);

    const result = await aggregateSeasonStats(season, saveGameId || null);

    if (result.errors.length > 0) {
      console.error(`[AggregateStats API] Aggregation completed with ${result.errors.length} errors:`, result.errors);
    }

    return NextResponse.json({
      success: true,
      aggregated: result.aggregated,
      errors: result.errors.length > 0 ? result.errors : undefined,
      message: `Successfully aggregated ${result.aggregated} player season stats`,
    });
  } catch (error) {
    console.error("Error aggregating season stats:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

