import { NextResponse } from "next/server";
import {
  aggregateLifetimeStats,
  archiveGameStats,
} from "@/lib/simulation/player-development";

/**
 * Manually trigger archival process for a specific season
 * This aggregates season stats into lifetime stats and deletes old game stats
 * Useful for retroactive cleanup or fixing issues
 */
export async function POST(req: Request) {
  try {
    const { season, saveGameId } = await req.json();

    if (!season || typeof season !== "number") {
      return NextResponse.json(
        { error: "Season is required and must be a number" },
        { status: 400 }
      );
    }

    console.log(
      `[ArchiveSeasonStats API] Starting archival for season ${season}, saveGameId: ${saveGameId || "null"}`
    );

    // Step 1: Aggregate lifetime stats
    console.log(`[ArchiveSeasonStats API] Aggregating lifetime stats...`);
    const lifetimeResult = await aggregateLifetimeStats(season, saveGameId);

    if (lifetimeResult.errors.length > 0) {
      console.error(
        `[ArchiveSeasonStats API] Lifetime stats aggregation had errors:`,
        lifetimeResult.errors
      );
    }

    // Step 2: Archive game stats
    console.log(`[ArchiveSeasonStats API] Archiving game stats...`);
    const archiveResult = await archiveGameStats(season, saveGameId);

    if (archiveResult.errors.length > 0) {
      console.error(
        `[ArchiveSeasonStats API] Game stats archival had errors:`,
        archiveResult.errors
      );
    }

    return NextResponse.json({
      success: true,
      message: `Archival completed for season ${season}`,
      results: {
        lifetimeStats: {
          created: lifetimeResult.created,
          updated: lifetimeResult.updated,
          errors: lifetimeResult.errors,
        },
        gameStats: {
          deleted: archiveResult.deleted,
          errors: archiveResult.errors,
        },
      },
    });
  } catch (error) {
    console.error("Error in archive-season-stats:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}



