import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase-client";

export async function POST(req: Request) {
  try {
    const {
      saveName,
      description,
      currentSeason,
      currentWeek,
      selectedTeamId,
      gameState,
      saveGameId, // CRITICAL: If provided, update this save instead of creating new one
    } = await req.json();

    // Validate required fields - note: currentWeek can be 0 (preseason), so check for null/undefined explicitly
    if (!saveName || currentSeason === undefined || currentSeason === null || currentWeek === undefined || currentWeek === null) {
      return NextResponse.json(
        { error: "saveName, currentSeason, and currentWeek are required" },
        { status: 400 }
      );
    }

    // Check if save_games table exists
    const { error: tableCheckError } = await supabase
      .from("save_games")
      .select("id")
      .limit(1);

    if (tableCheckError) {
      if (
        tableCheckError.code === "PGRST116" ||
        tableCheckError.message.includes("does not exist") ||
        tableCheckError.message.includes("Could not find the table")
      ) {
        return NextResponse.json(
          {
            error: "Save games table does not exist. Please run the migration first.",
            instructions: [
              "1. Go to your Supabase dashboard",
              "2. Navigate to SQL Editor",
              "3. Run the SQL from: supabase/migrations/create_save_games.sql",
              "4. Or use the Supabase CLI: supabase db push",
            ],
            sqlFile: "supabase/migrations/create_save_games.sql",
          },
          { status: 400 }
        );
      }
      throw tableCheckError;
    }

    const nowIso = new Date().toISOString();
    const buildSaveData = (
      existingMetadata?: Record<string, unknown> | null
    ) => ({
      save_name: saveName,
      description: description || null,
      current_season: currentSeason,
      current_week: currentWeek,
      selected_team_id: selectedTeamId || null,
      game_state: gameState || {},
      metadata: {
        ...(existingMetadata || {}),
        version:
          typeof existingMetadata?.version === "string"
            ? existingMetadata.version
            : "1.0",
        created_at:
          typeof existingMetadata?.created_at === "string"
            ? existingMetadata.created_at
            : nowIso,
        last_played_at: nowIso,
      },
      updated_at: nowIso,
      last_played_at: nowIso,
    });

    let savedGame;

    // CRITICAL: If saveGameId is provided, UPDATE that save (don't create new one)
    // This prevents accidentally creating a new save and breaking the current season
    if (saveGameId) {
      // Verify the save exists
      const { data: existingSave, error: checkError } = await supabase
        .from("save_games")
        .select("id, save_name, metadata")
        .eq("id", saveGameId)
        .single();

      if (checkError || !existingSave) {
        return NextResponse.json(
          {
            error: `Save game with ID ${saveGameId} not found. Cannot update.`,
            hint: "If you want to create a new save, don't provide saveGameId.",
          },
          { status: 400 }
        );
      }

      // Update existing save (preserve ID, update name and other fields)
      const { data, error } = await supabase
        .from("save_games")
        .update(buildSaveData(existingSave.metadata))
        .eq("id", saveGameId)
        .select()
        .single();

      if (error) throw error;
      savedGame = data;
      console.log(`[SaveGame] Updated existing save ${saveGameId} (name: ${saveName})`);
    } else {
      // No saveGameId provided - check if save name already exists
      const { data: existingByName, error: existingError } = await supabase
        .from("save_games")
        .select("id, metadata")
        .eq("save_name", saveName)
        .single();

      // If error is not "not found", it's a real error
      if (existingError && existingError.code !== "PGRST116") {
        throw existingError;
      }

      if (existingByName) {
        // Save name exists - update it
        const { data, error } = await supabase
          .from("save_games")
          .update(buildSaveData(existingByName.metadata))
          .eq("id", existingByName.id)
          .select()
          .single();

        if (error) throw error;
        savedGame = data;
        console.log(`[SaveGame] Updated existing save by name ${saveName} (ID: ${existingByName.id})`);
      } else {
        // Create new save
        const { data, error } = await supabase
          .from("save_games")
          .insert(buildSaveData())
          .select()
          .single();

        if (error) throw error;
        savedGame = data;
        console.log(`[SaveGame] Created new save ${savedGame.id} (name: ${saveName})`);
      }
    }

    return NextResponse.json({
      success: true,
      saveGame: savedGame,
    });
  } catch (error) {
    console.error("Error saving game:", error);
    const errorMessage = error instanceof Error ? error.message : "Failed to save game";
    
    // Provide more helpful error messages
    if (errorMessage.includes("does not exist") || errorMessage.includes("Could not find the table")) {
      return NextResponse.json(
        {
          error: "Save games table does not exist. Please run the migration first.",
          instructions: [
            "1. Go to your Supabase dashboard",
            "2. Navigate to SQL Editor",
            "3. Run the SQL from: supabase/migrations/create_save_games.sql",
          ],
          sqlFile: "supabase/migrations/create_save_games.sql",
        },
        { status: 400 }
      );
    }
    
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const saveId = searchParams.get("id");

    // Check if table exists first
    const { error: tableCheckError } = await supabase
      .from("save_games")
      .select("id")
      .limit(1);

    if (tableCheckError) {
      if (
        tableCheckError.code === "PGRST116" ||
        tableCheckError.message.includes("does not exist") ||
        tableCheckError.message.includes("Could not find the table")
      ) {
        // Table doesn't exist, return empty array instead of error
        return NextResponse.json({
          success: true,
          saveGames: [],
          message: "Save games table does not exist. Run migration to enable save games.",
        });
      }
      throw tableCheckError;
    }

    if (saveId) {
      // Get specific save
      const { data: saveGame, error } = await supabase
        .from("save_games")
        .select("*")
        .eq("id", saveId)
        .single();

      if (error) throw error;

      return NextResponse.json({
        success: true,
        saveGame: saveGame,
      });
    } else {
      // List all saves
      const { data: saveGames, error } = await supabase
        .from("save_games")
        .select("*")
        .order("last_played_at", { ascending: false });

      if (error) throw error;

      return NextResponse.json({
        success: true,
        saveGames: saveGames || [],
      });
    }
  } catch (error) {
    console.error("Error fetching save games:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch save games" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const saveId = searchParams.get("id");

    if (!saveId) {
      return NextResponse.json(
        { error: "saveId is required" },
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from("save_games")
      .delete()
      .eq("id", saveId);

    if (error) throw error;

    return NextResponse.json({
      success: true,
      message: "Save game deleted",
    });
  } catch (error) {
    console.error("Error deleting save game:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete save game" },
      { status: 500 }
    );
  }
}
