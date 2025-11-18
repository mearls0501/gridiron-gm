import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase-client";
import { generateContract } from "@/lib/contract-generator";

/**
 * Re-sign a player with an expiring contract
 */
export async function POST(req: Request) {
  try {
    const { playerId, teamId, contractYears, signingBonus } = await req.json();

    if (!playerId || !teamId) {
      return NextResponse.json(
        { error: "Player ID and Team ID are required" },
        { status: 400 }
      );
    }

    // Validate contract years
    if (!contractYears || !Array.isArray(contractYears) || contractYears.length === 0) {
      return NextResponse.json(
        { error: "Contract years array is required" },
        { status: 400 }
      );
    }

    // Fetch player
    const { data: player, error: playerError } = await supabase
      .from("players")
      .select("*")
      .eq("id", playerId)
      .single();

    if (playerError || !player) {
      return NextResponse.json(
        { error: "Player not found" },
        { status: 404 }
      );
    }

    // Check if player is currently a free agent or has expiring contract
    const isFreeAgent = !player.team_id;
    const hasExpiringContract = !player.contract_year_1 || player.contract_year_1 === 0;

    if (!isFreeAgent && !hasExpiringContract) {
      return NextResponse.json(
        { error: "Player does not have an expiring contract" },
        { status: 400 }
      );
    }

    // Check salary cap
    const { data: team, error: teamError } = await supabase
      .from("teams")
      .select("id, salary_cap_total")
      .eq("id", teamId)
      .single();

    if (teamError || !team) {
      return NextResponse.json(
        { error: "Team not found" },
        { status: 404 }
      );
    }

    // Calculate current team salary cap usage
    const { data: currentPlayers, error: playersError } = await supabase
      .from("players")
      .select("contract_year_1")
      .eq("team_id", teamId);

    if (playersError) {
      console.error("Error fetching team players:", playersError);
      return NextResponse.json(
        { error: "Failed to check team salary cap" },
        { status: 500 }
      );
    }

    const totalCapHit = (currentPlayers || []).reduce(
      (sum, p) => sum + (p.contract_year_1 || 0),
      0
    );

    const SALARY_CAP = team.salary_cap_total ?? 255000000;
    const newContractYear1 = contractYears[0] || 0;
    const currentPlayerCapHit = player.team_id === teamId ? (player.contract_year_1 || 0) : 0;
    const remainingCap = SALARY_CAP - totalCapHit + currentPlayerCapHit;

    if (remainingCap < newContractYear1) {
      return NextResponse.json(
        {
          error: `Team does not have enough cap space. Remaining: $${remainingCap.toLocaleString()}, Required: $${newContractYear1.toLocaleString()}`,
          remainingCap,
          requiredCap: newContractYear1,
        },
        { status: 400 }
      );
    }

    // Update player contract
    const contractUpdate = {
      team_id: teamId,
      contract_year_1: contractYears[0] || 0,
      contract_year_2: contractYears[1] || 0,
      contract_year_3: contractYears[2] || 0,
      contract_year_4: contractYears[3] || 0,
      signing_bonus: signingBonus || 0,
      contract_expires_season: null, // Reset expiration
    };

    const { error: updateError } = await supabase
      .from("players")
      .update(contractUpdate)
      .eq("id", playerId);

    if (updateError) {
      console.error("Error updating player contract:", updateError);
      return NextResponse.json(
        { error: `Failed to re-sign player: ${updateError.message}` },
        { status: 500 }
      );
    }

    // If player was a free agent, remove from free_agents table
    if (isFreeAgent) {
      const { error: deleteFAError } = await supabase
        .from("free_agents")
        .delete()
        .eq("id", playerId);

      if (deleteFAError) {
        console.error("Error removing from free agents:", deleteFAError);
        // Don't fail the request if this fails
      }
    }

    // Log transaction
    const { data: activeSeason } = await supabase
      .from("seasons")
      .select("year")
      .eq("is_active", true)
      .single();

    const season = activeSeason?.year || 2025;

    const { error: transactionError } = await supabase
      .from("transactions")
      .insert({
        player_id: playerId,
        team_id: teamId,
        transaction_type: "resigned",
        season: season,
        details: JSON.stringify({
          player_name: player.full_name,
          position: player.position,
          contract_years: contractYears,
          signing_bonus: signingBonus || 0,
        }),
      });

    if (transactionError) {
      console.error("Error logging transaction:", transactionError);
      // Don't fail the request if transaction logging fails
    }

    return NextResponse.json({
      success: true,
      message: `Successfully re-signed ${player.full_name}`,
      player: {
        id: playerId,
        contract_year_1: contractYears[0] || 0,
        contract_year_2: contractYears[1] || 0,
        contract_year_3: contractYears[2] || 0,
        contract_year_4: contractYears[3] || 0,
        signing_bonus: signingBonus || 0,
      },
    });
  } catch (error) {
    console.error("Error re-signing player:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

