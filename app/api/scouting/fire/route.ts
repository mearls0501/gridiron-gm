import { NextResponse } from "next/server";
import { fireScout } from "@/lib/scouting/hiring";

export async function POST(req: Request) {
  try {
    const { teamId, scoutId, saveGameId } = await req.json();

    if (!teamId || !scoutId || !saveGameId) {
      return NextResponse.json(
        { error: "teamId, scoutId, and saveGameId are required" },
        { status: 400 }
      );
    }

    const result = await fireScout(teamId, scoutId, saveGameId);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || "Failed to fire scout" },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Scout fired successfully",
    });
  } catch (error) {
    console.error("Error firing scout:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fire scout" },
      { status: 500 }
    );
  }
}

