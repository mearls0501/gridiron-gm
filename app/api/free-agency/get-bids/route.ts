import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase-client";

export async function POST(req: Request) {
  try {
    const { saveGameId, season, stage } = await req.json();

    if (!saveGameId || !season) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Get all active bids - include all stages to show bid progression
    // But prioritize the latest bid from each team for each player
    const { data: allBids, error } = await supabase
      .from("free_agency_bids")
      .select(`
        *,
        players (id, full_name, position, overall, age, college),
        draft_prospects (id, full_name, position, overall, age, college),
        teams (id, name, abbreviation)
      `)
      .eq("save_game_id", saveGameId)
      .eq("season", season)
      .eq("is_active", true)
      .order("stage", { ascending: false })
      .order("total_value", { ascending: false });

    if (error) {
      console.error("Error fetching bids:", error);
      return NextResponse.json(
        { error: `Failed to fetch bids: ${error.message}` },
        { status: 500 }
      );
    }

    // Filter to only show the latest bid from each team for each player
    const latestBidsMap = new Map<string, any>();
    allBids?.forEach((bid: any) => {
      const playerId = bid.player_id || bid.prospect_id;
      const key = `${playerId}-${bid.team_id}`;
      
      // Only keep the latest stage bid for each team-player combination
      if (!latestBidsMap.has(key) || latestBidsMap.get(key).stage < bid.stage) {
        latestBidsMap.set(key, bid);
      }
    });

    const bids = Array.from(latestBidsMap.values());

    if (error) {
      console.error("Error fetching bids:", error);
      return NextResponse.json(
        { error: `Failed to fetch bids: ${error.message}` },
        { status: 500 }
      );
    }

    // Group bids by player
    const bidsByPlayer: Record<
      string,
      {
        player: any;
        bids: any[];
        highestBid: number;
        winningTeam: any;
        totalBidders: number;
      }
    > = {};

    (bids || []).forEach((bid: any) => {
      const player = bid.players || bid.draft_prospects;
      const key = bid.player_id || bid.prospect_id;

      if (!bidsByPlayer[key]) {
        bidsByPlayer[key] = {
          player: {
            id: player?.id,
            full_name: player?.full_name,
            position: player?.position,
            overall: player?.overall,
            age: player?.age,
            college: player?.college,
            is_prospect: !!bid.prospect_id,
          },
          bids: [],
          highestBid: 0,
          winningTeam: null,
          totalBidders: 0,
        };
      }

      bidsByPlayer[key].bids.push({
        id: bid.id,
        team: bid.teams,
        total_value: bid.total_value,
        contract_year_1: bid.contract_year_1,
        contract_year_2: bid.contract_year_2,
        contract_year_3: bid.contract_year_3,
        contract_year_4: bid.contract_year_4,
        signing_bonus: bid.signing_bonus,
        is_cpu_bid: bid.is_cpu_bid,
        is_winning: bid.is_winning,
        was_outbid: bid.was_outbid,
        stage: bid.stage,
      });

      if (bid.total_value > bidsByPlayer[key].highestBid) {
        bidsByPlayer[key].highestBid = bid.total_value;
        bidsByPlayer[key].winningTeam = bid.teams;
      }
    });

    // Count unique bidders for each player
    Object.keys(bidsByPlayer).forEach((key) => {
      const uniqueTeams = new Set(
        bidsByPlayer[key].bids.map((b) => b.team.id)
      );
      bidsByPlayer[key].totalBidders = uniqueTeams.size;
    });

    return NextResponse.json({
      success: true,
      bidsByPlayer,
    });
  } catch (error) {
    console.error("Error in get-bids:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

