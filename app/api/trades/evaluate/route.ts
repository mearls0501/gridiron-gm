import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase-client";
import { getTeamContext, evaluateTrade, TradeItem } from "@/lib/trades/evaluator";

export async function POST(req: Request) {
  try {
    const { teamId, itemsReceiving, itemsGiving, season, saveGameId } = await req.json();

    if (!teamId) {
      return NextResponse.json(
        { error: "Team ID is required" },
        { status: 400 }
      );
    }

    if (!itemsReceiving || !Array.isArray(itemsReceiving)) {
      return NextResponse.json(
        { error: "Items receiving must be an array" },
        { status: 400 }
      );
    }

    if (!itemsGiving || !Array.isArray(itemsGiving)) {
      return NextResponse.json(
        { error: "Items giving must be an array" },
        { status: 400 }
      );
    }

    // Validate and fetch player/draft pick data
    const validatedReceiving: TradeItem[] = [];
    const validatedGiving: TradeItem[] = [];

    // Validate receiving items
    for (const item of itemsReceiving) {
      if (item.type === "player" && item.playerId) {
        const { data: player } = await supabase
          .from("players")
          .select("*")
          .eq("id", item.playerId)
          .single();

        if (player) {
          validatedReceiving.push({
            type: "player",
            playerId: player.id,
            player: {
              id: player.id,
              full_name: player.full_name,
              position: player.position,
              age: player.age,
              overall: player.overall,
              potential: player.potential,
              contract_year_1: player.contract_year_1 || 0,
              contract_year_2: player.contract_year_2 || undefined,
              contract_year_3: player.contract_year_3 || undefined,
              contract_year_4: player.contract_year_4 || undefined,
            },
          });
        }
      } else if (item.type === "draft_pick" && item.draftPickId) {
        let draftPickQuery = supabase
          .from("draft_picks")
          .select("*")
          .eq("id", item.draftPickId);
        
        if (saveGameId) {
          draftPickQuery = draftPickQuery.eq("save_game_id", saveGameId);
        } else {
          draftPickQuery = draftPickQuery.is("save_game_id", null);
        }
        
        const { data: draftPick } = await draftPickQuery.single();

        if (draftPick) {
          validatedReceiving.push({
            type: "draft_pick",
            draftPickId: draftPick.id,
            draftPick: {
              id: draftPick.id,
              season: draftPick.season,
              round: draftPick.round,
              pick_overall: draftPick.pick_overall,
            },
          });
        }
      }
    }

    // Validate giving items
    for (const item of itemsGiving) {
      if (item.type === "player" && item.playerId) {
        const { data: player } = await supabase
          .from("players")
          .select("*")
          .eq("id", item.playerId)
          .single();

        if (player) {
          validatedGiving.push({
            type: "player",
            playerId: player.id,
            player: {
              id: player.id,
              full_name: player.full_name,
              position: player.position,
              age: player.age,
              overall: player.overall,
              potential: player.potential,
              contract_year_1: player.contract_year_1 || 0,
              contract_year_2: player.contract_year_2 || undefined,
              contract_year_3: player.contract_year_3 || undefined,
              contract_year_4: player.contract_year_4 || undefined,
            },
          });
        }
      } else if (item.type === "draft_pick" && item.draftPickId) {
        let draftPickQuery = supabase
          .from("draft_picks")
          .select("*")
          .eq("id", item.draftPickId);
        
        if (saveGameId) {
          draftPickQuery = draftPickQuery.eq("save_game_id", saveGameId);
        } else {
          draftPickQuery = draftPickQuery.is("save_game_id", null);
        }
        
        const { data: draftPick } = await draftPickQuery.single();

        if (draftPick) {
          validatedGiving.push({
            type: "draft_pick",
            draftPickId: draftPick.id,
            draftPick: {
              id: draftPick.id,
              season: draftPick.season,
              round: draftPick.round,
              pick_overall: draftPick.pick_overall,
            },
          });
        }
      }
    }

    // Get team context
    const teamContext = await getTeamContext(teamId, season);

    if (!teamContext) {
      return NextResponse.json(
        { error: "Failed to load team context" },
        { status: 500 }
      );
    }

    // Evaluate trade
    const evaluation = await evaluateTrade(
      teamContext,
      validatedReceiving,
      validatedGiving
    );

    return NextResponse.json({
      success: true,
      evaluation,
      teamContext: {
        teamFocus: teamContext.teamFocus,
        positionalNeeds: teamContext.positionalNeeds,
        salaryCap: teamContext.salaryCap,
        currentCapHit: teamContext.currentCapHit,
        remainingCap: teamContext.salaryCap - teamContext.currentCapHit,
      },
    });
  } catch (error) {
    console.error("Error evaluating trade:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to evaluate trade",
      },
      { status: 500 }
    );
  }
}

