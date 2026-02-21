import { NextResponse } from "next/server";
import { initializeContractsForSaveGame } from "@/lib/utils/player-contracts";

/**
 * Initialize contracts for a specific save game
 * This copies contracts from player_contract_seed_data to player_contracts_per_save_game
 */
export async function POST(req: Request) {
  try {
    const { saveGameId } = await req.json();

    if (!saveGameId) {
      return NextResponse.json(
        { error: "saveGameId is required" },
        { status: 400 }
      );
    }

    console.log(`[InitializeSaveGameContracts] Initializing contracts for save game: ${saveGameId}`);

    const result = await initializeContractsForSaveGame(saveGameId);

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          error: result.error,
        },
        { status: 500 }
      );
    }

    console.log(`[InitializeSaveGameContracts] Successfully created ${result.contractsCreated} contracts`);

    return NextResponse.json({
      success: true,
      contractsCreated: result.contractsCreated,
      message: `Successfully initialized ${result.contractsCreated} contracts for save game`,
    });
  } catch (error) {
    console.error("Error initializing save game contracts:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}



