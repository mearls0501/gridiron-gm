import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase-client";
import { getTeamContext, evaluateTrade, TradeItem } from "@/lib/trades/evaluator";

export async function POST(req: Request) {
  try {
    const {
      fromTeamId,
      toTeamId,
      itemsFromTeam,
      itemsToTeam,
      season,
      week,
    } = await req.json();

    if (!fromTeamId || !toTeamId) {
      return NextResponse.json(
        { error: "Both team IDs are required" },
        { status: 400 }
      );
    }

    if (!itemsFromTeam || !Array.isArray(itemsFromTeam) || itemsFromTeam.length === 0) {
      return NextResponse.json(
        { error: "Items from team are required" },
        { status: 400 }
      );
    }

    if (!itemsToTeam || !Array.isArray(itemsToTeam) || itemsToTeam.length === 0) {
      return NextResponse.json(
        { error: "Items to team are required" },
        { status: 400 }
      );
    }

    // Validate items and fetch player/draft pick data
    const validatedItemsFrom: TradeItem[] = [];
    const validatedItemsTo: TradeItem[] = [];

    // Validate and fetch items from team
    for (const item of itemsFromTeam) {
      if (item.type === "player" && item.playerId) {
        const { data: player } = await supabase
          .from("players")
          .select("*")
          .eq("id", item.playerId)
          .single();

        if (!player) {
          return NextResponse.json(
            { error: `Player ${item.playerId} not found` },
            { status: 404 }
          );
        }

        if (player.team_id !== fromTeamId) {
          return NextResponse.json(
            { error: `Player ${player.full_name} is not on the proposing team` },
            { status: 400 }
          );
        }

        validatedItemsFrom.push({
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
      } else if (item.type === "draft_pick" && item.draftPickId) {
        const { data: draftPick } = await supabase
          .from("draft_picks")
          .select("*")
          .eq("id", item.draftPickId)
          .single();

        if (!draftPick) {
          return NextResponse.json(
            { error: `Draft pick ${item.draftPickId} not found` },
            { status: 404 }
          );
        }

        if (draftPick.owning_team_id !== fromTeamId) {
          return NextResponse.json(
            { error: `Draft pick is not owned by the proposing team` },
            { status: 400 }
          );
        }

        validatedItemsFrom.push({
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

    // Validate and fetch items to team
    for (const item of itemsToTeam) {
      if (item.type === "player" && item.playerId) {
        const { data: player } = await supabase
          .from("players")
          .select("*")
          .eq("id", item.playerId)
          .single();

        if (!player) {
          return NextResponse.json(
            { error: `Player ${item.playerId} not found` },
            { status: 404 }
          );
        }

        if (player.team_id !== toTeamId) {
          return NextResponse.json(
            { error: `Player ${player.full_name} is not on the receiving team` },
            { status: 400 }
          );
        }

        validatedItemsTo.push({
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
      } else if (item.type === "draft_pick" && item.draftPickId) {
        const { data: draftPick } = await supabase
          .from("draft_picks")
          .select("*")
          .eq("id", item.draftPickId)
          .single();

        if (!draftPick) {
          return NextResponse.json(
            { error: `Draft pick ${item.draftPickId} not found` },
            { status: 404 }
          );
        }

        if (draftPick.owning_team_id !== toTeamId) {
          return NextResponse.json(
            { error: `Draft pick is not owned by the receiving team` },
            { status: 400 }
          );
        }

        validatedItemsTo.push({
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

    // Evaluate trade from both perspectives
    const fromTeamContext = await getTeamContext(fromTeamId, season);
    const toTeamContext = await getTeamContext(toTeamId, season);

    if (!fromTeamContext || !toTeamContext) {
      return NextResponse.json(
        { error: "Failed to load team context" },
        { status: 500 }
      );
    }

    // From team's perspective: receiving itemsToTeam, giving itemsFromTeam
    const fromTeamEvaluation = await evaluateTrade(
      fromTeamContext,
      validatedItemsTo,
      validatedItemsFrom
    );

    // To team's perspective: receiving itemsFromTeam, giving itemsToTeam
    const toTeamEvaluation = await evaluateTrade(
      toTeamContext,
      validatedItemsFrom,
      validatedItemsTo
    );

    // Check if from team can afford the trade
    if (!fromTeamEvaluation.canAfford) {
      return NextResponse.json(
        {
          error: "Trade would exceed salary cap",
          evaluation: fromTeamEvaluation,
        },
        { status: 400 }
      );
    }

    // Create trade record
    const { data: trade, error: tradeError } = await supabase
      .from("trades")
      .insert({
        from_team_id: fromTeamId,
        to_team_id: toTeamId,
        status: "pending",
        season: season,
        week: week,
        from_team_evaluation: fromTeamEvaluation,
        to_team_evaluation: toTeamEvaluation,
      })
      .select()
      .single();

    if (tradeError || !trade) {
      throw tradeError || new Error("Failed to create trade");
    }

    // Create trade items
    const tradeItems = [
      ...validatedItemsFrom.map((item) => ({
        trade_id: trade.id,
        item_type: item.type,
        player_id: item.playerId || null,
        draft_pick_id: item.draftPickId || null,
        from_team_id: fromTeamId,
        to_team_id: toTeamId,
      })),
      ...validatedItemsTo.map((item) => ({
        trade_id: trade.id,
        item_type: item.type,
        player_id: item.playerId || null,
        draft_pick_id: item.draftPickId || null,
        from_team_id: toTeamId,
        to_team_id: fromTeamId,
      })),
    ];

    const { error: itemsError } = await supabase
      .from("trade_items")
      .insert(tradeItems);

    if (itemsError) {
      // Rollback trade creation
      await supabase.from("trades").delete().eq("id", trade.id);
      throw itemsError;
    }

    // Create trade history entry
    await supabase.from("trade_history").insert({
      trade_id: trade.id,
      action: "proposed",
      performed_by_team_id: fromTeamId,
      details: `Trade proposed from ${fromTeamId} to ${toTeamId}`,
    });

    return NextResponse.json({
      success: true,
      trade: {
        id: trade.id,
        from_team_id: trade.from_team_id,
        to_team_id: trade.to_team_id,
        status: trade.status,
        from_team_evaluation: fromTeamEvaluation,
        to_team_evaluation: toTeamEvaluation,
      },
    });
  } catch (error) {
    console.error("Error proposing trade:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to propose trade",
      },
      { status: 500 }
    );
  }
}

