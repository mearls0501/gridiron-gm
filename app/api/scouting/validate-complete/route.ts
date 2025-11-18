import { NextResponse } from "next/server";
import { validateScoutingComplete } from "@/lib/scouting/validator";

/**
 * Validate that scouting requirements are met before draft can proceed
 */
export async function POST(req: Request) {
  try {
    const { teamId, season } = await req.json();

    if (!teamId) {
      return NextResponse.json(
        { error: "teamId is required" },
        { status: 400 }
      );
    }

    const validation = await validateScoutingComplete(teamId, season);

    return NextResponse.json({
      success: true,
      ...validation,
    });
  } catch (error) {
    console.error("Error validating scouting:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

