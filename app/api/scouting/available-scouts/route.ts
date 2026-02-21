import { NextResponse } from "next/server";
import { getAvailableScouts } from "@/lib/scouting/hiring";
import { generateScoutPool } from "@/lib/scouting/scout-generator";
import { supabase } from "@/lib/supabase-client";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const saveGameId = searchParams.get("saveGameId");

    if (!saveGameId) {
      return NextResponse.json(
        { error: "saveGameId is required" },
        { status: 400 }
      );
    }

    // Check if scout pool exists for this save game, generate if needed
    const { data: existingScouts } = await supabase
      .from("scouts")
      .select("id")
      .eq("save_game_id", saveGameId)
      .limit(1);

    if (!existingScouts || existingScouts.length === 0) {
      // Generate initial scout pool (150 scouts) for this save game
      console.log(`Scout pool is empty for save game ${saveGameId}, generating initial pool...`);
      const scoutPool = generateScoutPool(150, saveGameId);
      const { error: poolError } = await supabase
        .from("scouts")
        .insert(scoutPool);

      if (poolError) {
        console.error("Error generating scout pool:", poolError);
        return NextResponse.json(
          { error: "Failed to generate scout pool. Please try again." },
          { status: 500 }
        );
      } else {
        console.log(`Generated ${scoutPool.length} scouts in the free agent pool for save game ${saveGameId}`);
      }
    }

    const scouts = await getAvailableScouts(saveGameId);

    return NextResponse.json({
      success: true,
      scouts,
      count: scouts.length,
    });
  } catch (error) {
    console.error("Error fetching available scouts:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch available scouts" },
      { status: 500 }
    );
  }
}

