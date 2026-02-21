import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase-client";
import {
  generateCPUBids,
  updateBidStatuses,
  resolveBids,
} from "@/lib/free-agency/cpu-bidding";
import { generatePreferencesForFreeAgents } from "@/lib/free-agency/player-preferences";

// Increase timeout for this endpoint as it may process many bids
export const maxDuration = 60; // 60 seconds

export async function POST(req: Request) {
  try {
    const { saveGameId, season } = await req.json();

    if (!saveGameId || !season) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Get current stage
    const { data: stageData } = await supabase
      .from("free_agency_stage")
      .select("*")
      .eq("save_game_id", saveGameId)
      .eq("season", season)
      .maybeSingle();

    if (!stageData) {
      // Create initial stage if it doesn't exist
      const { error: createError } = await supabase
        .from("free_agency_stage")
        .insert({
          save_game_id: saveGameId,
          season,
          current_stage: 1,
          stage_status: "active",
        });

      if (createError) {
        return NextResponse.json(
          { error: `Failed to create stage: ${createError.message}` },
          { status: 500 }
        );
      }

      // Generate player contract preferences
      const { preferencesCreated } = await generatePreferencesForFreeAgents(
        saveGameId,
        season
      );

      // Generate initial CPU bids
      await generateCPUBids(saveGameId, season, 1);
      await updateBidStatuses(saveGameId, season, 1);

      return NextResponse.json({
        success: true,
        message: `Free agency stage 1 initialized. ${preferencesCreated} player preferences generated.`,
        currentStage: 1,
      });
    }

    if (stageData.stage_status !== "active") {
      return NextResponse.json(
        { error: "Current stage is not active" },
        { status: 400 }
      );
    }

    const currentStage = stageData.current_stage;

    // If we're at stage 4, resolve all bids
    if (currentStage >= 4) {
      console.log("[Advance Stage] Stage 4 reached - resolving all bids...");
      // Mark stage as processing
      await supabase
        .from("free_agency_stage")
        .update({ stage_status: "processing" })
        .eq("save_game_id", saveGameId)
        .eq("season", season);

      // Resolve bids and sign players (this is now optimized with batch operations)
      const resolveStart = Date.now();
      const { success, playersSigned, error } = await resolveBids(
        saveGameId,
        season
      );
      console.log(`[Advance Stage] Bid resolution completed in ${Date.now() - resolveStart}ms`);

      if (!success) {
        return NextResponse.json({ error }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        message: `Free agency completed. ${playersSigned} players signed.`,
        currentStage: 4,
        completed: true,
        playersSigned,
      });
    }

    // Advance to next stage
    const nextStage = currentStage + 1;

    await supabase
      .from("free_agency_stage")
      .update({
        current_stage: nextStage,
        stage_status: "active",
      })
      .eq("save_game_id", saveGameId)
      .eq("season", season);

    // Generate CPU bids for next stage
    const { bidsCreated } = await generateCPUBids(saveGameId, season, nextStage);
    await updateBidStatuses(saveGameId, season, nextStage);

    return NextResponse.json({
      success: true,
      message: `Advanced to stage ${nextStage}. ${bidsCreated} CPU bids generated.`,
      currentStage: nextStage,
      bidsCreated,
    });
  } catch (error) {
    console.error("Error in advance-stage:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

