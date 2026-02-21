import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase-client";

/**
 * GET /api/scout-disagreements
 * Get all scout disagreements for a team
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const teamId = searchParams.get("teamId");
    const saveGameId = searchParams.get("saveGameId");
    const resolved = searchParams.get("resolved");

    if (!teamId || !saveGameId) {
      return NextResponse.json(
        { success: false, error: "Missing required parameters: teamId, saveGameId" },
        { status: 400 }
      );
    }

    let query = supabase
      .from("scout_disagreements")
      .select(`
        *,
        scout_1:scouts!scout_disagreements_scout_1_id_fkey (
          id,
          name,
          archetype,
          personality_type,
          personality_bias,
          personality_risk_tolerance,
          region,
          avatar_seed
        ),
        scout_2:scouts!scout_disagreements_scout_2_id_fkey (
          id,
          name,
          archetype,
          personality_type,
          personality_bias,
          personality_risk_tolerance,
          region,
          avatar_seed
        ),
        prospect:draft_prospects!scout_disagreements_prospect_id_fkey (
          id,
          full_name,
          position,
          college
        )
      `)
      .eq("team_id", teamId)
      .eq("save_game_id", saveGameId)
      .order("created_at", { ascending: false });

    if (resolved !== null) {
      query = query.eq("resolved", resolved === "true");
    }

    const { data, error } = await query;

    if (error) {
      console.error("Error fetching scout disagreements:", error);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    // Transform data for frontend
    const disagreements = data?.map((d: any) => ({
      id: d.id,
      prospect: d.prospect,
      scout1: {
        scoutId: d.scout_1?.id,
        scoutName: d.scout_1?.name,
        archetype: d.scout_1?.archetype,
        personalityType: d.scout_1?.personality_type,
        rating: d.scout_1_rating,
        headline: d.scout_1_headline || "No headline",
        note: "", // Would come from scouting_notes
        confidence: "medium",
      },
      scout2: {
        scoutId: d.scout_2?.id,
        scoutName: d.scout_2?.name,
        archetype: d.scout_2?.archetype,
        personalityType: d.scout_2?.personality_type,
        rating: d.scout_2_rating,
        headline: d.scout_2_headline || "No headline",
        note: "", // Would come from scouting_notes
        confidence: "medium",
      },
      disagreementLevel: d.disagreement_level,
      ratingDifference: d.rating_difference,
      resolved: d.resolved,
      resolutionNotes: d.resolution_notes,
      createdAt: d.created_at,
    }));

    return NextResponse.json({
      success: true,
      disagreements: disagreements || [],
    });
  } catch (error) {
    console.error("Error in GET /api/scout-disagreements:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/scout-disagreements
 * Record a new scout disagreement
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      teamId,
      saveGameId,
      prospectId,
      scout1Id,
      scout1Rating,
      scout1Headline,
      scout2Id,
      scout2Rating,
      scout2Headline,
      disagreementLevel,
    } = body;

    if (!teamId || !saveGameId || !prospectId || !scout1Id || !scout2Id) {
      return NextResponse.json(
        {
          success: false,
          error: "Missing required parameters: teamId, saveGameId, prospectId, scout1Id, scout2Id",
        },
        { status: 400 }
      );
    }

    const ratingDifference = Math.abs(scout1Rating - scout2Rating);

    const { data, error } = await supabase
      .from("scout_disagreements")
      .upsert(
        {
          team_id: teamId,
          save_game_id: saveGameId,
          prospect_id: prospectId,
          scout_1_id: scout1Id,
          scout_1_rating: scout1Rating,
          scout_1_headline: scout1Headline,
          scout_2_id: scout2Id,
          scout_2_rating: scout2Rating,
          scout_2_headline: scout2Headline,
          disagreement_level: disagreementLevel || (ratingDifference >= 15 ? "major" : "minor"),
          rating_difference: ratingDifference,
          resolved: false,
        },
        {
          onConflict: "team_id,prospect_id,save_game_id,scout_1_id,scout_2_id",
        }
      )
      .select()
      .single();

    if (error) {
      console.error("Error creating scout disagreement:", error);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      disagreement: data,
    });
  } catch (error) {
    console.error("Error in POST /api/scout-disagreements:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/scout-disagreements
 * Resolve a disagreement
 */
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, resolved, resolutionNotes } = body;

    if (!id) {
      return NextResponse.json(
        { success: false, error: "Missing required parameter: id" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("scout_disagreements")
      .update({
        resolved: resolved ?? true,
        resolution_notes: resolutionNotes,
      })
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error("Error resolving disagreement:", error);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      disagreement: data,
    });
  } catch (error) {
    console.error("Error in PATCH /api/scout-disagreements:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
