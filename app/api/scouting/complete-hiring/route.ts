import { NextResponse } from "next/server";
import { autoStaffCPUTeams } from "@/lib/scouting/cpu-staffing";
import { validateScoutingDepartment } from "@/lib/scouting/hiring";

export async function POST(req: Request) {
  try {
    const { teamId, saveGameId, season } = await req.json();

    if (!teamId || !saveGameId || !season) {
      return NextResponse.json(
        { error: "teamId, saveGameId, and season are required" },
        { status: 400 }
      );
    }

    // Validate that user's team has complete scouting department
    const validation = await validateScoutingDepartment(teamId, saveGameId);
    if (!validation.valid) {
      return NextResponse.json(
        { error: `Scouting department incomplete: ${validation.errors.join(", ")}` },
        { status: 400 }
      );
    }

    // Auto-staff CPU teams (exclude user's team)
    const result = await autoStaffCPUTeams(saveGameId, parseInt(season), teamId);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || "Failed to staff CPU teams" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Successfully staffed ${result.staffedTeams} CPU teams`,
      staffedTeams: result.staffedTeams,
    });
  } catch (error) {
    console.error("Error completing hiring:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to complete hiring" },
      { status: 500 }
    );
  }
}

