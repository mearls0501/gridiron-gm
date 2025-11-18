import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase-client";

/**
 * Re-sign a coach with an expiring contract
 */
export async function POST(req: Request) {
  try {
    const { coachId, teamId, contractYears } = await req.json();

    if (!coachId || !teamId) {
      return NextResponse.json(
        { error: "Coach ID and Team ID are required" },
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

    // Fetch coach
    const { data: coach, error: coachError } = await supabase
      .from("coaching_staff")
      .select("*")
      .eq("id", coachId)
      .single();

    if (coachError || !coach) {
      return NextResponse.json(
        { error: "Coach not found" },
        { status: 404 }
      );
    }

    // Check if coach is available (team_id is null) or has expiring contract
    const isAvailable = !coach.team_id;
    const hasExpiringContract = !coach.contract_year_1 || coach.contract_year_1 === 0;

    if (!isAvailable && !hasExpiringContract) {
      return NextResponse.json(
        { error: "Coach does not have an expiring contract" },
        { status: 400 }
      );
    }

    // Update coach contract
    const contractUpdate = {
      team_id: teamId,
      contract_year_1: contractYears[0] || 0,
      contract_year_2: contractYears[1] || 0,
      contract_year_3: contractYears[2] || 0,
      contract_year_4: contractYears[3] || 0,
    };

    const { error: updateError } = await supabase
      .from("coaching_staff")
      .update(contractUpdate)
      .eq("id", coachId);

    if (updateError) {
      console.error("Error updating coach contract:", updateError);
      return NextResponse.json(
        { error: `Failed to re-sign coach: ${updateError.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Successfully re-signed ${coach.name}`,
      coach: {
        id: coachId,
        contract_year_1: contractYears[0] || 0,
        contract_year_2: contractYears[1] || 0,
        contract_year_3: contractYears[2] || 0,
        contract_year_4: contractYears[3] || 0,
      },
    });
  } catch (error) {
    console.error("Error re-signing coach:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

