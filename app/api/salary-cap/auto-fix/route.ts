import { NextResponse } from "next/server";
import { autoFixSalaryCap } from "@/lib/utils/salary-cap-fixer";

export async function POST(req: Request) {
  try {
    const { teamId, saveGameId } = await req.json();

    if (!teamId || !saveGameId) {
      return NextResponse.json(
        { error: "teamId and saveGameId are required" },
        { status: 400 }
      );
    }

    const result = await autoFixSalaryCap(teamId, saveGameId);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || "Failed to fix salary cap" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      playersCut: result.playersCut,
      capSavings: result.capSavings,
      message: `Cut ${result.playersCut} player(s) to save $${(result.capSavings / 1000000).toFixed(1)}M`,
    });
  } catch (error) {
    console.error("Error in salary cap auto-fix:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}



