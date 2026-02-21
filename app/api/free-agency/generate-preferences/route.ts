import { NextResponse } from "next/server";
import { generatePreferencesForFreeAgents } from "@/lib/free-agency/player-preferences";

export async function POST(req: Request) {
  try {
    const { saveGameId, season } = await req.json();

    if (!saveGameId || !season) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const { success, preferencesCreated, error } =
      await generatePreferencesForFreeAgents(saveGameId, season);

    if (!success) {
      return NextResponse.json({ error }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      preferencesCreated,
      message: `Generated ${preferencesCreated} player contract preferences`,
    });
  } catch (error) {
    console.error("Error in generate-preferences:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}



