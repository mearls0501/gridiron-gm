import { NextResponse } from "next/server";
import { getTeamScouts } from "@/lib/scouting/hiring";
import { getTeamPriorities } from "@/lib/scouting/priorities";
import { getScoutWeeklyPoints } from "@/lib/scouting/weekly-points";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const teamId = searchParams.get("teamId");
    const saveGameId = searchParams.get("saveGameId");
    const season = searchParams.get("season");
    const week = searchParams.get("week");

    if (!teamId || !saveGameId) {
      return NextResponse.json(
        { error: "teamId and saveGameId are required" },
        { status: 400 }
      );
    }

    const scouts = await getTeamScouts(teamId, saveGameId);

    // Get priorities if season is provided
    let priorities: any[] = [];
    if (season) {
      priorities = await getTeamPriorities(teamId, saveGameId, parseInt(season));
    }

    // Get weekly points if week is provided (consolidated API call)
    let weeklyPoints: Array<{ scout_id: string; points: number; weekly_points: number }> = [];
    if (season && week !== null && week !== undefined) {
      try {
        weeklyPoints = await getScoutWeeklyPoints(
          teamId,
          saveGameId,
          parseInt(season),
          parseInt(week)
        );
      } catch (error) {
        console.error("Error fetching weekly points:", error);
        // Don't fail the request if weekly points fail
      }
    }

    // Combine scouts with their priorities and weekly points
    const scoutsWithPriorities = scouts.map((scout) => {
      const priority = priorities.find((p) => p.scout_id === scout.id);
      const points = weeklyPoints.find((p) => p.scout_id === scout.id);
      
      return {
        ...scout,
        priority: priority ? {
          level: priority.priority,
          weekly_points: priority.weekly_points,
        } : null,
        // Include weekly points if available
        availablePoints: points?.points !== undefined ? points.points : (priority?.weekly_points || 0),
      };
    });

    return NextResponse.json({
      success: true,
      scouts: scoutsWithPriorities,
      count: scoutsWithPriorities.length,
    });
  } catch (error) {
    console.error("Error fetching team scouts:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch team scouts" },
      { status: 500 }
    );
  }
}

