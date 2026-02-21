import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase-client";
import {
  hireScout,
  validateHiringBudget,
  validateScoutingDepartment,
} from "@/lib/scouting/hiring";

export async function POST(req: Request) {
  try {
    const { teamId, scoutId, saveGameId, season, contractYears } =
      await req.json();

    if (!teamId || !scoutId || !saveGameId || !season) {
      return NextResponse.json(
        { error: "teamId, scoutId, saveGameId, and season are required" },
        { status: 400 }
      );
    }

    // Check if team already has 4 scouts
    const deptValidation = await validateScoutingDepartment(teamId, saveGameId);
    if (deptValidation.valid && deptValidation.errors.length === 0) {
      // Check if this scout would create a duplicate archetype
      const { data: existingContracts } = await supabase
        .from("scout_contracts")
        .select("scout_id")
        .eq("team_id", teamId)
        .eq("save_game_id", saveGameId);

      const { data: scout } = await supabase
        .from("scouts")
        .select("archetype")
        .eq("id", scoutId)
        .eq("save_game_id", saveGameId)
        .single();

      if (scout) {
        // Get existing scout archetypes (must belong to this save game)
        const existingScoutIds =
          existingContracts?.map((c) => c.scout_id) || [];
        if (existingScoutIds.length > 0) {
          const { data: existingScouts } = await supabase
            .from("scouts")
            .select("archetype")
            .in("id", existingScoutIds)
            .eq("save_game_id", saveGameId);

          const existingArchetypes = new Set(
            existingScouts?.map((s) => s.archetype) || []
          );
          if (existingArchetypes.has(scout.archetype)) {
            return NextResponse.json(
              {
                error: `Team already has a ${scout.archetype}. You must have one of each archetype.`,
              },
              { status: 400 }
            );
          }
        }
      }
    }

    // Validate budget
    const budgetValidation = await validateHiringBudget(
      teamId,
      [scoutId],
      saveGameId,
      season
    );
    if (!budgetValidation.canAfford) {
      return NextResponse.json(
        {
          error: `Cannot afford scout. Cost: $${budgetValidation.totalCost.toLocaleString()}, Budget: $${budgetValidation.budget.toLocaleString()}`,
        },
        { status: 400 }
      );
    }

    // Hire the scout
    const result = await hireScout(
      teamId,
      scoutId,
      saveGameId,
      contractYears || 1
    );

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || "Failed to hire scout" },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      contract: result.contract,
    });
  } catch (error) {
    console.error("Error hiring scout:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to hire scout",
      },
      { status: 500 }
    );
  }
}
