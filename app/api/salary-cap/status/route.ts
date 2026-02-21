import { NextResponse } from "next/server";
import { getTeamCapStatus } from "@/lib/utils/salary-cap-fixer";

export async function POST(req: Request) {
  try {
    const { teamId, saveGameId } = await req.json();

    if (!teamId || !saveGameId) {
      return NextResponse.json(
        { error: "Missing teamId or saveGameId" },
        { status: 400 }
      );
    }

    const status = await getTeamCapStatus(teamId, saveGameId);

    return NextResponse.json(status);
  } catch (error) {
    console.error("Error getting cap status:", error);
    return NextResponse.json(
      { error: "Failed to get cap status" },
      { status: 500 }
    );
  }
}
