import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase-client";

export async function POST(req: Request) {
  try {
    const {
      playerId,
      prospectId,
      teamId,
      saveGameId,
      season,
      stage,
      contractYear1,
      contractYear2,
      contractYear3,
      contractYear4,
      signingBonus,
    } = await req.json();

    if (!teamId || !saveGameId || !season || !stage) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    if (!playerId && !prospectId) {
      return NextResponse.json(
        { error: "Either playerId or prospectId is required" },
        { status: 400 }
      );
    }

    if (contractYear1 < 750000) {
      return NextResponse.json(
        { error: "Contract must be at least league minimum ($750,000)" },
        { status: 400 }
      );
    }

    // Verify stage is active
    const { data: stageData } = await supabase
      .from("free_agency_stage")
      .select("*")
      .eq("save_game_id", saveGameId)
      .eq("season", season)
      .single();

    if (!stageData) {
      return NextResponse.json(
        { error: "Free agency stage not found" },
        { status: 404 }
      );
    }

    if (stageData.stage_status !== "active") {
      return NextResponse.json(
        { error: "Free agency stage is not active" },
        { status: 400 }
      );
    }

    if (stageData.current_stage !== stage) {
      return NextResponse.json(
        { error: `Current stage is ${stageData.current_stage}, not ${stage}` },
        { status: 400 }
      );
    }

    // Check team cap space
    const { data: team } = await supabase
      .from("teams")
      .select("salary_cap_total")
      .eq("id", teamId)
      .single();

    const totalCap = team?.salary_cap_total ?? 255000000;

    const { data: contracts } = await supabase
      .from("player_contracts_per_save_game")
      .select("contract_year_1")
      .eq("team_id", teamId)
      .eq("save_game_id", saveGameId);

    const currentCapHit = (contracts || []).reduce(
      (sum, c) => sum + (c.contract_year_1 || 0),
      0
    );

    const availableCap = totalCap - currentCapHit;

    if (contractYear1 > availableCap) {
      return NextResponse.json(
        {
          error: `Not enough cap space. Available: $${availableCap.toLocaleString()}`,
        },
        { status: 400 }
      );
    }

    // Calculate total contract value
    const totalValue =
      contractYear1 +
      (contractYear2 || 0) +
      (contractYear3 || 0) +
      (contractYear4 || 0) +
      (signingBonus || 0);

    // Mark previous bids from this team for this player as not winning
    // But keep them active so we can see bid history
    const filter: any = {
      save_game_id: saveGameId,
      season,
      team_id: teamId,
    };

    if (playerId) {
      filter.player_id = playerId;
    } else {
      filter.prospect_id = prospectId;
    }

    await supabase
      .from("free_agency_bids")
      .update({ is_winning: false, was_outbid: false })
      .match(filter);

    // Submit new bid
    const { error: bidError } = await supabase
      .from("free_agency_bids")
      .insert({
        save_game_id: saveGameId,
        season,
        stage,
        player_id: playerId || null,
        prospect_id: prospectId || null,
        team_id: teamId,
        contract_year_1: contractYear1,
        contract_year_2: contractYear2 || 0,
        contract_year_3: contractYear3 || 0,
        contract_year_4: contractYear4 || 0,
        signing_bonus: signingBonus || 0,
        total_value: totalValue,
        is_cpu_bid: false,
        bid_priority: 0,
        is_active: true,
        is_winning: false,
        was_outbid: false,
      });

    if (bidError) {
      console.error("Error submitting bid:", bidError);
      return NextResponse.json(
        { error: `Failed to submit bid: ${bidError.message}` },
        { status: 500 }
      );
    }

    // Update bid statuses to determine winners
    await updateBidStatuses(saveGameId, season, stage);

    return NextResponse.json({
      success: true,
      message: "Bid submitted successfully",
    });
  } catch (error) {
    console.error("Error in submit-bid:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

async function updateBidStatuses(
  saveGameId: string,
  season: number,
  _stage: number
) {
  // Get ALL active bids (not just current stage) to see the full picture
  const { data: allBids } = await supabase
    .from("free_agency_bids")
    .select("*")
    .eq("save_game_id", saveGameId)
    .eq("season", season)
    .eq("is_active", true)
    .order("stage", { ascending: false })
    .order("total_value", { ascending: false });

  if (!allBids || allBids.length === 0) return;

  // Get latest bid from each team for each player
  const latestBidsMap = new Map<string, any>();
  allBids.forEach((bid: any) => {
    const playerId = bid.player_id || bid.prospect_id;
    const key = `${playerId}-${bid.team_id}`;
    
    // Only keep the latest stage bid for each team-player combination
    if (!latestBidsMap.has(key) || latestBidsMap.get(key).stage < bid.stage) {
      latestBidsMap.set(key, bid);
    }
  });

  const latestBids = Array.from(latestBidsMap.values());

  // Group by player
  const bidsByPlayer: Record<string, any[]> = {};
  latestBids.forEach((bid: any) => {
    const key = bid.player_id || bid.prospect_id || "unknown";
    if (!bidsByPlayer[key]) {
      bidsByPlayer[key] = [];
    }
    bidsByPlayer[key].push(bid);
  });

  // Collect bid IDs for batch updates
  const winningBidIds: string[] = [];
  const outbidBidIds: string[] = [];

  // Determine winning and outbid bids
  for (const [, playerBids] of Object.entries(bidsByPlayer)) {
    playerBids.sort((a, b) => b.total_value - a.total_value);

    if (playerBids[0]) {
      winningBidIds.push(playerBids[0].id);
    }

    for (let i = 1; i < playerBids.length; i++) {
      outbidBidIds.push(playerBids[i].id);
    }
  }

  // Batch update: Set all non-relevant bids to not winning first
  await supabase
    .from("free_agency_bids")
    .update({
      is_winning: false,
      was_outbid: false,
    })
    .eq("save_game_id", saveGameId)
    .eq("season", season)
    .eq("is_active", true);

  // Batch update: Set winning bids
  if (winningBidIds.length > 0) {
    await supabase
      .from("free_agency_bids")
      .update({
        is_winning: true,
        was_outbid: false,
      })
      .in("id", winningBidIds);
  }

  // Batch update: Set outbid bids
  if (outbidBidIds.length > 0) {
    await supabase
      .from("free_agency_bids")
      .update({
        is_winning: false,
        was_outbid: true,
      })
      .in("id", outbidBidIds);
  }
}

