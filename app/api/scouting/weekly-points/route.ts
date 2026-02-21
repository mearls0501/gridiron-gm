import { NextResponse } from "next/server";
import { getScoutWeeklyPoints, regenerateWeeklyPoints } from "@/lib/scouting/weekly-points";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const teamId = searchParams.get("teamId");
    const saveGameId = searchParams.get("saveGameId");
    const season = searchParams.get("season");
    const week = searchParams.get("week");

    if (!teamId || !saveGameId || !season || week === null || week === undefined) {
      return NextResponse.json(
        { error: "teamId, saveGameId, season, and week are required" },
        { status: 400 }
      );
    }

    const points = await getScoutWeeklyPoints(
      teamId,
      saveGameId,
      parseInt(season),
      parseInt(week)
    );

    return NextResponse.json({
      success: true,
      points,
    });
  } catch (error) {
    console.error("Error fetching weekly points:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch weekly points" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const { teamId, saveGameId, season, week } = await req.json();

    if (!teamId || !saveGameId || season === null || season === undefined || week === null || week === undefined) {
      return NextResponse.json(
        { error: "teamId, saveGameId, season, and week are required" },
        { status: 400 }
      );
    }

    const result = await regenerateWeeklyPoints(teamId, saveGameId, season, week);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || "Failed to regenerate weekly points" },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Weekly points regenerated",
    });
  } catch (error) {
    console.error("Error regenerating weekly points:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to regenerate weekly points" },
      { status: 500 }
    );
  }
}

