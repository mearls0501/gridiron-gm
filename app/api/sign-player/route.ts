import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase-client";

export async function POST(req: Request) {
  try {
    const { playerId, teamId } = await req.json();

    if (!playerId || !teamId) {
      return NextResponse.json(
        { error: "Player ID and Team ID are required" },
        { status: 400 }
      );
    }

    // 1. Fetch the free agent data
    const { data: freeAgent, error: fetchError } = await supabase
      .from("free_agents")
      .select("*")
      .eq("id", playerId)
      .single();

    if (fetchError || !freeAgent) {
      return NextResponse.json(
        { error: "Free agent not found" },
        { status: 404 }
      );
    }

    // 2. Check if team exists and get salary cap info
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

    // 3. Calculate current team salary cap usage
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

    // Calculate total cap hit (sum of contract_year_1 for all players)
    const totalCapHit = (currentPlayers || []).reduce(
      (sum, player) => sum + (player.contract_year_1 || 0),
      0
    );

    // Get team's salary cap (default to 255M if not set)
    const SALARY_CAP = team.salary_cap_total ?? 255000000;
    const remainingCap = SALARY_CAP - totalCapHit;

    // 4. League minimum contract
    const LEAGUE_MINIMUM = 750000;

    // 5. Check if signing this player would exceed the cap
    if (remainingCap < LEAGUE_MINIMUM) {
      return NextResponse.json(
        { 
          error: `Team is over the salary cap. Remaining cap space: $${remainingCap.toLocaleString()}. Cannot sign player for $${LEAGUE_MINIMUM.toLocaleString()}.`,
          remainingCap,
          requiredCap: LEAGUE_MINIMUM,
        },
        { status: 400 }
      );
    }

    // 6. Prepare player data for insertion into players table
    const playerData = {
      id: freeAgent.id,
      full_name: freeAgent.full_name,
      position: freeAgent.position,
      age: freeAgent.age,
      college: freeAgent.college,
      archetype: freeAgent.archetype || null,
      overall: freeAgent.overall,
      potential: freeAgent.potential,
      traits: freeAgent.traits,
      team_id: teamId,
      contract_year_1: LEAGUE_MINIMUM,
      contract_year_2: LEAGUE_MINIMUM,
      contract_year_3: LEAGUE_MINIMUM,
      contract_year_4: LEAGUE_MINIMUM,
      signing_bonus: 0,
    };

    // 7. Insert player into players table (use upsert in case player already exists)
    const { error: insertError } = await supabase
      .from("players")
      .upsert(playerData, { onConflict: "id" });

    if (insertError) {
      console.error("Error inserting player:", insertError);
      return NextResponse.json(
        { error: "Failed to sign player: " + insertError.message },
        { status: 500 }
      );
    }

    // 8. Delete from free_agents table
    const { error: deleteError } = await supabase
      .from("free_agents")
      .delete()
      .eq("id", playerId);

    if (deleteError) {
      console.error("Error deleting from free_agents:", deleteError);
      // Don't fail the request if delete fails - player is already signed
      // Just log the error
    }

    // 9. Log transaction
    // Get current season from active season
    const { data: activeSeason } = await supabase
      .from("seasons")
      .select("year, current_week")
      .eq("is_active", true)
      .single();
    
    const season = activeSeason?.year || 2025;
    const week = activeSeason?.current_week || 1;
    
    await supabase.from("transactions").insert({
      player_id: playerId,
      to_team_id: teamId,
      transaction_type: "signing",
      season: season,
      week: week,
      details: `${freeAgent.full_name} signed to ${teamId}`,
      metadata: {
        contract_year_1: LEAGUE_MINIMUM,
        position: freeAgent.position,
      },
    });

    return NextResponse.json({
      success: true,
      message: `Successfully signed ${freeAgent.full_name} to ${teamId}`,
      player: playerData,
    });
  } catch (error) {
    console.error("Error signing player:", error);
    return NextResponse.json(
      { error: "Server error: " + (error instanceof Error ? error.message : "Unknown error") },
      { status: 500 }
    );
  }
}

