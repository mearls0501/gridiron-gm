import { NextResponse } from "next/server";
import { getStageProgress } from "@/lib/progression/checklist";
import { GameSettings } from "@/lib/store/game-store";

export async function POST(req: Request) {
  try {
    const { teamId, saveGameId, season, week, phase, settings } = await req.json();

    if (!teamId || !saveGameId) {
      return NextResponse.json(
        { error: "Missing required parameters" },
        { status: 400 }
      );
    }

    const progress = await getStageProgress(
      teamId,
      saveGameId,
      season,
      week,
      phase,
      settings as GameSettings
    );

    return NextResponse.json({ progress });
  } catch (error) {
    console.error("Error getting progression status:", error);
    return NextResponse.json(
      { error: "Failed to get progression status" },
      { status: 500 }
    );
  }
}

