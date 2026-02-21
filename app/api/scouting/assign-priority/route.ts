import { NextResponse } from "next/server";
import { assignPriority, arePrioritiesLocked, getTeamPriorities } from "@/lib/scouting/priorities";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const teamId = searchParams.get("teamId");
    const saveGameId = searchParams.get("saveGameId");
    const season = searchParams.get("season");

    if (!teamId || !saveGameId || !season) {
      return NextResponse.json(
        { error: "teamId, saveGameId, and season are required" },
        { status: 400 }
      );
    }

    const priorities = await getTeamPriorities(teamId, saveGameId, parseInt(season));

    return NextResponse.json({
      success: true,
      priorities,
    });
  } catch (error) {
    console.error("Error fetching scout priorities:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch scout priorities" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const { teamId, scoutId, priority, saveGameId, season } = await req.json();

    if (!teamId || !scoutId || !priority || !saveGameId || !season) {
      return NextResponse.json(
        { error: "teamId, scoutId, priority, saveGameId, and season are required" },
        { status: 400 }
      );
    }

    if (priority < 1 || priority > 4) {
      return NextResponse.json(
        { error: "Priority must be between 1 and 4" },
        { status: 400 }
      );
    }

    // Check if priorities are locked
    const locked = await arePrioritiesLocked(saveGameId, season);
    if (locked) {
      return NextResponse.json(
        { error: "Priorities are locked. Cannot change during the season." },
        { status: 400 }
      );
    }

    const result = await assignPriority(teamId, scoutId, priority as 1 | 2 | 3 | 4, saveGameId, season);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || "Failed to assign priority" },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Priority assigned successfully",
    });
  } catch (error) {
    console.error("Error assigning priority:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to assign priority" },
      { status: 500 }
    );
  }
}

