import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase-client";

/**
 * GET /api/big-board
 * Retrieve a team's big board for a specific season
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const teamId = searchParams.get("teamId");
    const saveGameId = searchParams.get("saveGameId");
    const season = searchParams.get("season");
    const boardName = searchParams.get("name") || "Default Board";

    if (!teamId || !saveGameId || !season) {
      return NextResponse.json(
        { success: false, error: "Missing required parameters: teamId, saveGameId, season" },
        { status: 400 }
      );
    }

    // Get the board
    const { data: board, error: boardError } = await supabase
      .from("team_big_boards")
      .select("*")
      .eq("team_id", teamId)
      .eq("save_game_id", saveGameId)
      .eq("season", parseInt(season))
      .eq("name", boardName)
      .maybeSingle();

    if (boardError) {
      console.error("Error fetching big board:", boardError);
      return NextResponse.json(
        { success: false, error: boardError.message },
        { status: 500 }
      );
    }

    if (!board) {
      return NextResponse.json({
        success: true,
        board: null,
        entries: [],
      });
    }

    // Get the entries with prospect data
    const { data: entries, error: entriesError } = await supabase
      .from("big_board_entries")
      .select(`
        *,
        draft_prospects (
          id,
          full_name,
          position,
          college,
          age,
          overall,
          potential
        )
      `)
      .eq("board_id", board.id)
      .order("rank", { ascending: true });

    if (entriesError) {
      console.error("Error fetching big board entries:", entriesError);
      return NextResponse.json(
        { success: false, error: entriesError.message },
        { status: 500 }
      );
    }

    // Also get scouting data for these prospects
    const prospectIds = entries?.map((e: any) => e.prospect_id) || [];
    let scoutingData: any[] = [];

    if (prospectIds.length > 0) {
      const { data: scouted } = await supabase
        .from("scouted_prospects")
        .select("*")
        .eq("team_id", teamId)
        .eq("save_game_id", saveGameId)
        .in("prospect_id", prospectIds);

      scoutingData = scouted || [];
    }

    // Merge scouting data with entries
    const enrichedEntries = entries?.map((entry: any) => {
      const scoutReport = scoutingData.find((s) => s.prospect_id === entry.prospect_id);
      return {
        ...entry,
        scoutingReport: scoutReport || null,
      };
    });

    return NextResponse.json({
      success: true,
      board,
      entries: enrichedEntries || [],
    });
  } catch (error) {
    console.error("Error in GET /api/big-board:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/big-board
 * Create or update a team's big board
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { teamId, saveGameId, season, name = "Default Board", entries } = body;

    if (!teamId || !saveGameId || !season) {
      return NextResponse.json(
        { success: false, error: "Missing required parameters: teamId, saveGameId, season" },
        { status: 400 }
      );
    }

    // Upsert the board
    const { data: board, error: boardError } = await supabase
      .from("team_big_boards")
      .upsert(
        {
          team_id: teamId,
          save_game_id: saveGameId,
          season,
          name,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: "team_id,save_game_id,season,name",
        }
      )
      .select()
      .single();

    if (boardError) {
      console.error("Error upserting big board:", boardError);
      return NextResponse.json(
        { success: false, error: boardError.message },
        { status: 500 }
      );
    }

    // If entries provided, update them
    if (entries && Array.isArray(entries)) {
      // Delete existing entries
      const { error: deleteError } = await supabase
        .from("big_board_entries")
        .delete()
        .eq("board_id", board.id);

      if (deleteError) {
        console.error("Error deleting old entries:", deleteError);
        return NextResponse.json(
          { success: false, error: deleteError.message },
          { status: 500 }
        );
      }

      // Insert new entries
      if (entries.length > 0) {
        const entryData = entries.map((entry: any, index: number) => ({
          board_id: board.id,
          prospect_id: entry.prospectId || entry.id,
          rank: entry.rank || index + 1,
          tier: entry.tier || null,
          notes: entry.notes || null,
          tags: entry.tags || null,
        }));

        const { error: insertError } = await supabase
          .from("big_board_entries")
          .insert(entryData);

        if (insertError) {
          console.error("Error inserting entries:", insertError);
          return NextResponse.json(
            { success: false, error: insertError.message },
            { status: 500 }
          );
        }
      }
    }

    return NextResponse.json({
      success: true,
      board,
      message: "Big board saved successfully",
    });
  } catch (error) {
    console.error("Error in POST /api/big-board:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/big-board
 * Update a single entry on the board (rank, tier, notes)
 */
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { boardId, prospectId, rank, tier, notes, tags } = body;

    if (!boardId || !prospectId) {
      return NextResponse.json(
        { success: false, error: "Missing required parameters: boardId, prospectId" },
        { status: 400 }
      );
    }

    const updateData: any = { updated_at: new Date().toISOString() };
    if (rank !== undefined) updateData.rank = rank;
    if (tier !== undefined) updateData.tier = tier;
    if (notes !== undefined) updateData.notes = notes;
    if (tags !== undefined) updateData.tags = tags;

    const { data, error } = await supabase
      .from("big_board_entries")
      .update(updateData)
      .eq("board_id", boardId)
      .eq("prospect_id", prospectId)
      .select()
      .single();

    if (error) {
      console.error("Error updating entry:", error);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      entry: data,
    });
  } catch (error) {
    console.error("Error in PATCH /api/big-board:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/big-board
 * Remove a prospect from the board
 */
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const boardId = searchParams.get("boardId");
    const prospectId = searchParams.get("prospectId");

    if (!boardId || !prospectId) {
      return NextResponse.json(
        { success: false, error: "Missing required parameters: boardId, prospectId" },
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from("big_board_entries")
      .delete()
      .eq("board_id", boardId)
      .eq("prospect_id", prospectId);

    if (error) {
      console.error("Error deleting entry:", error);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Prospect removed from board",
    });
  } catch (error) {
    console.error("Error in DELETE /api/big-board:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
