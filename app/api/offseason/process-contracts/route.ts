import { NextResponse } from "next/server";
import { processExpiringContracts } from "@/lib/offseason/contract-processor";

/**
 * Process expiring contracts and move players to free agency
 * This should be called during offseason transition
 */
export async function POST(req: Request) {
  try {
    const { season } = await req.json();

    if (!season || typeof season !== "number") {
      return NextResponse.json(
        { error: "Season is required and must be a number" },
        { status: 400 }
      );
    }

    const result = await processExpiringContracts(season);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || "Failed to process contracts" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: result.playersMovedToFA === 0 
        ? "No players with expiring contracts"
        : `Processed ${result.playersMovedToFA} expiring contracts`,
      playersMovedToFA: result.playersMovedToFA,
      contractsShifted: result.contractsShifted,
    });
  } catch (error) {
    console.error("Error processing contracts:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

