import { NextResponse } from "next/server";
import { ensureScheduleExists } from "@/lib/utils/schedule";

export async function POST(req: Request) {
  try {
    const { season, saveGameId } = await req.json();

    if (!season) {
      return NextResponse.json(
        { error: "Season is required" },
        { status: 400 }
      );
    }

    const result = await ensureScheduleExists(season, saveGameId);

    if (!result.success) {
      return NextResponse.json({ error: result.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      created: result.created,
      message: result.message,
    });
  } catch (error) {
    console.error("Error ensuring schedule:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to ensure schedule exists",
      },
      { status: 500 }
    );
  }
}
