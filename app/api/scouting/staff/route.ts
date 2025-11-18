import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase-client";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const teamId = searchParams.get("teamId");

    if (!teamId) {
      return NextResponse.json(
        { error: "teamId is required" },
        { status: 400 }
      );
    }

    const { data: staff, error } = await supabase
      .from("scouting_staff")
      .select("*")
      .eq("team_id", teamId)
      .order("role", { ascending: true })
      .order("scouting_accuracy", { ascending: false });

    if (error) {
      throw error;
    }

    return NextResponse.json({
      success: true,
      staff: staff || [],
    });
  } catch (error) {
    console.error("Error fetching scouting staff:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch scouting staff" },
      { status: 500 }
    );
  }
}

