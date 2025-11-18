import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase-client";
import { getTeamContext, evaluateTrade } from "@/lib/trades/evaluator";

export async function POST(req: Request) {
  try {
    const { tradeId, acceptingTeamId } = await req.json();

    if (!tradeId || !acceptingTeamId) {
      return NextResponse.json(
        { error: "Trade ID and accepting team ID are required" },
        { status: 400 }
      );
    }

    // Get trade
    const { data: trade, error: tradeError } = await supabase
      .from("trades")
      .select("*")
      .eq("id", tradeId)
      .single();

    if (tradeError || !trade) {
      return NextResponse.json(
        { error: "Trade not found" },
        { status: 404 }
      );
    }

    if (trade.status !== "pending") {
      return NextResponse.json(
        { error: `Trade is already ${trade.status}` },
        { status: 400 }
      );
    }

    // Verify accepting team is the receiving team
    if (acceptingTeamId !== trade.to_team_id) {
      return NextResponse.json(
        { error: "Only the receiving team can accept a trade" },
        { status: 403 }
      );
    }

    // Get trade items
    const { data: tradeItems, error: itemsError } = await supabase
      .from("trade_items")
      .select("*")
      .eq("trade_id", tradeId);

    if (itemsError || !tradeItems) {
      return NextResponse.json(
        { error: "Failed to load trade items" },
        { status: 500 }
      );
    }

    // Re-evaluate trade to ensure it's still valid (cap check)
    const fromTeamContext = await getTeamContext(trade.from_team_id, trade.season);
    const toTeamContext = await getTeamContext(trade.to_team_id, trade.season);

    if (!fromTeamContext || !toTeamContext) {
      return NextResponse.json(
        { error: "Failed to load team context" },
        { status: 500 }
      );
    }

    // Separate items by team
    const itemsFromTeam = tradeItems.filter((item) => item.from_team_id === trade.from_team_id);
    const itemsToTeam = tradeItems.filter((item) => item.from_team_id === trade.to_team_id);

    // Fetch full player/draft pick data for evaluation
    const validatedItemsFrom: any[] = [];
    const validatedItemsTo: any[] = [];

    for (const item of itemsFromTeam) {
      if (item.item_type === "player" && item.player_id) {
        const { data: player } = await supabase
          .from("players")
          .select("*")
          .eq("id", item.player_id)
          .single();
        if (player) validatedItemsFrom.push({ type: "player", player });
      } else if (item.item_type === "draft_pick" && item.draft_pick_id) {
        const { data: draftPick } = await supabase
          .from("draft_picks")
          .select("*")
          .eq("id", item.draft_pick_id)
          .single();
        if (draftPick) validatedItemsFrom.push({ type: "draft_pick", draftPick });
      }
    }

    for (const item of itemsToTeam) {
      if (item.item_type === "player" && item.player_id) {
        const { data: player } = await supabase
          .from("players")
          .select("*")
          .eq("id", item.player_id)
          .single();
        if (player) validatedItemsTo.push({ type: "player", player });
      } else if (item.item_type === "draft_pick" && item.draft_pick_id) {
        const { data: draftPick } = await supabase
          .from("draft_picks")
          .select("*")
          .eq("id", item.draft_pick_id)
          .single();
        if (draftPick) validatedItemsTo.push({ type: "draft_pick", draftPick });
      }
    }

    // Final cap check for both teams
    let fromTeamCapHit = fromTeamContext.currentCapHit;
    let toTeamCapHit = toTeamContext.currentCapHit;

    for (const item of validatedItemsFrom) {
      if (item.type === "player" && item.player) {
        fromTeamCapHit -= item.player.contract_year_1 || 0;
        toTeamCapHit += item.player.contract_year_1 || 0;
      }
    }

    for (const item of validatedItemsTo) {
      if (item.type === "player" && item.player) {
        toTeamCapHit -= item.player.contract_year_1 || 0;
        fromTeamCapHit += item.player.contract_year_1 || 0;
      }
    }

    if (fromTeamCapHit > fromTeamContext.salaryCap) {
      return NextResponse.json(
        {
          error: "Trade would exceed salary cap for proposing team",
          capExceeded: fromTeamCapHit - fromTeamContext.salaryCap,
        },
        { status: 400 }
      );
    }

    if (toTeamCapHit > toTeamContext.salaryCap) {
      return NextResponse.json(
        {
          error: "Trade would exceed salary cap for accepting team",
          capExceeded: toTeamCapHit - toTeamContext.salaryCap,
        },
        { status: 400 }
      );
    }

    // Execute trade: Update player team_ids
    for (const item of tradeItems) {
      if (item.item_type === "player" && item.player_id) {
        const { error: updateError } = await supabase
          .from("players")
          .update({ team_id: item.to_team_id })
          .eq("id", item.player_id);

        if (updateError) {
          return NextResponse.json(
            { error: `Failed to transfer player: ${updateError.message}` },
            { status: 500 }
          );
        }
      } else if (item.item_type === "draft_pick" && item.draft_pick_id) {
        const { error: updateError } = await supabase
          .from("draft_picks")
          .update({
            owning_team_id: item.to_team_id,
            updated_at: new Date().toISOString(),
          })
          .eq("id", item.draft_pick_id);

        if (updateError) {
          return NextResponse.json(
            { error: `Failed to transfer draft pick: ${updateError.message}` },
            { status: 500 }
          );
        }

        // Log draft pick trade
        await supabase.from("draft_pick_trades").insert({
          draft_pick_id: item.draft_pick_id,
          from_team_id: item.from_team_id,
          to_team_id: item.to_team_id,
          season: trade.season,
          week: trade.week,
        });
      }
    }

    // Update trade status
    const { error: updateTradeError } = await supabase
      .from("trades")
      .update({
        status: "executed",
        executed_at: new Date().toISOString(),
        responded_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", tradeId);

    if (updateTradeError) {
      return NextResponse.json(
        { error: `Failed to update trade status: ${updateTradeError.message}` },
        { status: 500 }
      );
    }

    // Create trade history entry
    await supabase.from("trade_history").insert({
      trade_id: tradeId,
      action: "executed",
      performed_by_team_id: acceptingTeamId,
      details: "Trade executed successfully",
    });

    // Log transaction for each player
    for (const item of tradeItems) {
      if (item.item_type === "player" && item.player_id) {
        await supabase.from("transactions").insert({
          player_id: item.player_id,
          from_team_id: item.from_team_id,
          to_team_id: item.to_team_id,
          transaction_type: "trade",
          season: trade.season,
          week: trade.week,
          details: `Traded in trade ${tradeId}`,
        });
      }
    }

    return NextResponse.json({
      success: true,
      message: "Trade executed successfully",
    });
  } catch (error) {
    console.error("Error executing trade:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to execute trade",
      },
      { status: 500 }
    );
  }
}

