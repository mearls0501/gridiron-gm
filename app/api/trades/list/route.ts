import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase-client";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const teamId = searchParams.get("teamId");
    const status = searchParams.get("status");
    const season = searchParams.get("season");

    let query = supabase
      .from("trades")
      .select(
        `
        *,
        from_team:teams!trades_from_team_id_fkey (id, name, abbreviation),
        to_team:teams!trades_to_team_id_fkey (id, name, abbreviation),
        trade_items (
          *,
          player:players (id, full_name, position, overall, age),
          draft_pick:draft_picks (id, season, round, pick_overall)
        )
      `
      )
      .order("proposed_at", { ascending: false });

    if (teamId) {
      query = query.or(`from_team_id.eq.${teamId},to_team_id.eq.${teamId}`);
    }

    if (status) {
      query = query.eq("status", status);
    }

    if (season) {
      query = query.eq("season", parseInt(season));
    }

    const { data: trades, error } = await query.limit(50);

    if (error) {
      throw error;
    }

    return NextResponse.json({
      success: true,
      trades: trades || [],
    });
  } catch (error) {
    console.error("Error listing trades:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to list trades",
      },
      { status: 500 }
    );
  }
}

