import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase-client";

export async function POST(req: Request) {
  try {
    const { tradeId, rejectingTeamId } = await req.json();

    if (!tradeId || !rejectingTeamId) {
      return NextResponse.json(
        { error: "Trade ID and rejecting team ID are required" },
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

    // Verify rejecting team is the receiving team
    if (rejectingTeamId !== trade.to_team_id) {
      return NextResponse.json(
        { error: "Only the receiving team can reject a trade" },
        { status: 403 }
      );
    }

    // Update trade status
    const { error: updateError } = await supabase
      .from("trades")
      .update({
        status: "rejected",
        responded_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", tradeId);

    if (updateError) {
      throw updateError;
    }

    // Create trade history entry
    await supabase.from("trade_history").insert({
      trade_id: tradeId,
      action: "rejected",
      performed_by_team_id: rejectingTeamId,
      details: "Trade rejected",
    });

    return NextResponse.json({
      success: true,
      message: "Trade rejected",
    });
  } catch (error) {
    console.error("Error rejecting trade:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to reject trade",
      },
      { status: 500 }
    );
  }
}

