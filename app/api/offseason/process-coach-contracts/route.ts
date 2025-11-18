import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase-client";

/**
 * Process expiring coach contracts
 * Similar to player contracts - moves expired coaches to available pool
 */
export async function POST(req: Request) {
  try {
    const { season } = await req.json();

    if (!season || typeof season !== "number") {
      return NextResponse.json(
        { error: "Season is required and must be a number" },
        { status: 400 }
      );
    }

    console.log(`[Process Coach Contracts] Processing coach contracts for season ${season}...`);

    // Step 1: Find all coaches with expiring contracts
    const { data: expiringCoaches, error: expiringError } = await supabase
      .from("coaching_staff")
      .select("*")
      .or("contract_year_1.is.null,contract_year_1.eq.0")
      .not("team_id", "is", null); // Only coaches currently on a team

    if (expiringError) {
      console.error("Error fetching expiring coaches:", expiringError);
      return NextResponse.json(
        { error: `Failed to fetch expiring coaches: ${expiringError.message}` },
        { status: 500 }
      );
    }

    if (!expiringCoaches || expiringCoaches.length === 0) {
      console.log("[Process Coach Contracts] No coaches with expiring contracts");
      return NextResponse.json({
        success: true,
        message: "No coaches with expiring contracts",
        coachesMovedToPool: 0,
        contractsShifted: 0,
      });
    }

    console.log(`[Process Coach Contracts] Found ${expiringCoaches.length} coaches with expiring contracts`);

    // Step 2: Remove coaches from teams (set team_id to null) - this makes them available
    const coachIds = expiringCoaches.map((c) => c.id);
    const { error: removeTeamError } = await supabase
      .from("coaching_staff")
      .update({ team_id: null })
      .in("id", coachIds);

    if (removeTeamError) {
      console.error("Error removing coaches from teams:", removeTeamError);
      return NextResponse.json(
        { error: `Failed to move coaches to available pool: ${removeTeamError.message}` },
        { status: 500 }
      );
    }

    console.log(`[Process Coach Contracts] Moved ${expiringCoaches.length} coaches to available pool`);

    // Step 3: Shift contract years forward for remaining coaches
    const { data: coachesWithContracts, error: contractsError } = await supabase
      .from("coaching_staff")
      .select("id, contract_year_1, contract_year_2, contract_year_3, contract_year_4")
      .not("contract_year_1", "is", null)
      .gt("contract_year_1", 0);

    let contractsShifted = 0;
    if (contractsError) {
      console.error("Error fetching coaches with contracts:", contractsError);
      // Continue - this is not critical for the main operation
    } else if (coachesWithContracts && coachesWithContracts.length > 0) {
      // Update each coach's contract years (shift forward)
      const updatePromises = coachesWithContracts.map(async (coach) => {
        const updates = {
          contract_year_1: coach.contract_year_2 || 0,
          contract_year_2: coach.contract_year_3 || 0,
          contract_year_3: coach.contract_year_4 || 0,
          contract_year_4: 0,
        };

        const { error } = await supabase
          .from("coaching_staff")
          .update(updates)
          .eq("id", coach.id);

        if (error) {
          console.error(`Error updating contract for coach ${coach.id}:`, error);
        } else {
          contractsShifted++;
        }
      });

      await Promise.all(updatePromises);
      console.log(`[Process Coach Contracts] Shifted contracts for ${coachesWithContracts.length} coaches`);
    }

    return NextResponse.json({
      success: true,
      message: `Processed ${expiringCoaches.length} expiring coach contracts`,
      coachesMovedToPool: expiringCoaches.length,
      contractsShifted,
    });
  } catch (error) {
    console.error("Error processing coach contracts:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

