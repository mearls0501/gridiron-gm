import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase-client";

/**
 * Hire a coach from the available pool
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

    // Check if coach is available (team_id is null)
    if (coach.team_id !== null) {
      return NextResponse.json(
        { error: "Coach is not available (already on a team)" },
        { status: 400 }
      );
    }

    // Check if team already has a coach in this role
    const { data: existingCoach, error: existingError } = await supabase
      .from("coaching_staff")
      .select("id")
      .eq("team_id", teamId)
      .eq("role", coach.role)
      .maybeSingle();

    if (existingError && existingError.code !== "PGRST116") {
      console.error("Error checking existing coach:", existingError);
    }

    if (existingCoach) {
      return NextResponse.json(
        { error: `Team already has a ${coach.role.replace('_', ' ')}` },
        { status: 400 }
      );
    }

    // Update coach contract and assign to team
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
      console.error("Error hiring coach:", updateError);
      return NextResponse.json(
        { error: `Failed to hire coach: ${updateError.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Successfully hired ${coach.name}`,
      coach: {
        id: coachId,
        name: coach.name,
        role: coach.role,
        rating: coach.rating,
        contract_year_1: contractYears[0] || 0,
        contract_year_2: contractYears[1] || 0,
        contract_year_3: contractYears[2] || 0,
        contract_year_4: contractYears[3] || 0,
      },
    });
  } catch (error) {
    console.error("Error hiring coach:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

