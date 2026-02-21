import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase-client";
import { generatePlayer, resetNameGenerator } from "@/lib/player-generator";

export async function POST(req: Request) {
  try {
    const { season, saveGameId } = await req.json();
    if (!season) {
      return NextResponse.json(
        { error: "Season is required" },
        { status: 400 }
      );
    }
    if (!saveGameId) {
      return NextResponse.json(
        { error: "saveGameId is required" },
        { status: 400 }
      );
    }

    // Reset name generator to ensure unique names for this draft class
    resetNameGenerator();

    const prospects: ReturnType<typeof generatePlayer>[] = [];

    // Generate 350 prospects with realistic talent distribution
    // Elite: ~42 (12%), Mid: ~123 (35%), Late: ~133 (38%), Bust: ~52 (15%)
    const eliteCount = 42;
    const midCount = 123;
    const lateCount = 133;
    const bustCount = 52;

    // Generate elite prospects
    for (let i = 0; i < eliteCount; i++) {
      const player = generatePlayer({ isProspect: true, talentTier: "elite" });
      prospects.push(player);
    }

    // Generate mid level prospects
    for (let i = 0; i < midCount; i++) {
      const player = generatePlayer({ isProspect: true, talentTier: "mid" });
      prospects.push(player);
    }

    // Generate late round prospects
    for (let i = 0; i < lateCount; i++) {
      const player = generatePlayer({ isProspect: true, talentTier: "late" });
      prospects.push(player);
    }

    // Generate busts
    for (let i = 0; i < bustCount; i++) {
      const player = generatePlayer({ isProspect: true, talentTier: "bust" });
      prospects.push(player);
    }

    // Shuffle the prospects to randomize the order
    for (let i = prospects.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [prospects[i], prospects[j]] = [prospects[j], prospects[i]];
    }

    // Verify total count
    console.log(`Generated ${prospects.length} prospects (Expected: 350)`);
    if (prospects.length !== 350) {
      console.warn(
        `Warning: Expected 350 prospects, but generated ${prospects.length}`
      );
    }

    const header = Object.keys(prospects[0]).join(",");
    const rows = prospects.map((p) =>
      Object.values(p)
        .map((v) => `"${v}"`)
        .join(",")
    );

    const csv = [header, ...rows].join("\n");

    // Check if Supabase is configured
    const hasSupabase =
      process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (hasSupabase) {
      // Upload to Supabase if configured
      const fileName = `draft_${season}.csv`;

      const { error: uploadError } = await supabase.storage
        .from("draft-classes")
        .upload(fileName, csv, {
          contentType: "text/csv",
          upsert: true,
        });

      if (uploadError) {
        console.error(uploadError);
        return NextResponse.json(
          { error: "Failed to upload CSV" },
          { status: 500 }
        );
      }

      const { data: urlData } = supabase.storage
        .from("draft-classes")
        .getPublicUrl(fileName);
      const publicUrl = urlData.publicUrl;

      // Save prospects to database
      // Destructure to remove contract fields, keep all attribute fields
      const prospectsToInsert = prospects.map((p) => {
        const { contract_year_1, contract_year_2, contract_year_3, contract_year_4, signing_bonus, ...prospectData } = p;
        return {
          ...prospectData,
          season,
          save_game_id: saveGameId,
        };
      });

      // Delete existing prospects for this season and save_game_id
      await supabase
        .from("draft_prospects")
        .delete()
        .eq("season", season)
        .eq("save_game_id", saveGameId);

      // Insert new prospects (in batches to avoid payload size limits)
      const batchSize = 100;
      const totalBatches = Math.ceil(prospectsToInsert.length / batchSize);
      let insertedCount = 0;
      const errors: Array<{
        batch: number;
        error: string;
        code?: string;
        details?: string;
        hint?: string;
        batchSize: number;
      }> = [];

      for (let i = 0; i < prospectsToInsert.length; i += batchSize) {
        const batch = prospectsToInsert.slice(i, i + batchSize);
        const batchNumber = Math.floor(i / batchSize) + 1;

        const { error: batchError } = await supabase
          .from("draft_prospects")
          .insert(batch);

        if (batchError) {
          const errorDetails = {
            batch: batchNumber,
            error: batchError.message || "Unknown error",
            code: batchError.code,
            details: batchError.details,
            hint: batchError.hint,
            batchSize: batch.length,
          };
          const errorMsg = `Error saving prospects batch ${batchNumber}/${totalBatches}: ${batchError.message || JSON.stringify(batchError)}`;
          console.error(errorMsg, batchError);
          console.error(`Batch ${batchNumber} error details:`, errorDetails);
          errors.push(errorDetails);
        } else {
          insertedCount += batch.length;
          console.log(
            `Successfully inserted batch ${batchNumber}/${totalBatches} (${batch.length} prospects)`
          );
        }
      }

      if (errors.length > 0) {
        console.error(`Errors occurred while saving prospects:`, errors);
        console.error(
          `Only ${insertedCount} out of ${prospectsToInsert.length} prospects were saved`
        );
      } else {
        console.log(`Successfully inserted all ${insertedCount} prospects`);
      }

      // Verify the count in database
      const { count: dbCount, error: countError } = await supabase
        .from("draft_prospects")
        .select("*", { count: "exact", head: true })
        .eq("season", season)
        .eq("save_game_id", saveGameId);

      if (!countError && dbCount !== null) {
        console.log(
          `Database now contains ${dbCount} prospects for season ${season}`
        );
        if (dbCount < prospectsToInsert.length) {
          console.warn(
            `Warning: Expected ${prospectsToInsert.length} prospects, but database has ${dbCount}`
          );
        }
      }

      // Return response with detailed information
      const responseMessage =
        errors.length > 0
          ? `Draft class generated, but ${errors.length} batch(es) had errors. ${insertedCount} out of ${prospects.length} prospects saved.`
          : `Draft class generated successfully. All ${prospects.length} prospects saved.`;

      return NextResponse.json({
        success: errors.length === 0,
        message: responseMessage,
        url: publicUrl,
        prospectCount: prospects.length,
        insertedCount: insertedCount,
        dbCount: dbCount || null,
        errors: errors.length > 0 ? errors : undefined,
      });
    } else {
      // Return CSV directly as a downloadable response if Supabase is not configured
      const fileName = `draft_${season}.csv`;

      return new NextResponse(csv, {
        status: 200,
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition": `attachment; filename="${fileName}"`,
        },
      });
    }
  } catch (error) {
    console.error("Error generating draft class:", error);
    const errorMessage = error instanceof Error 
      ? error.message 
      : typeof error === "object" && error !== null && "message" in error
        ? String(error.message)
        : "Failed to generate draft class";
    
    return NextResponse.json(
      { 
        error: errorMessage,
        details: error instanceof Error ? error.stack : undefined
      },
      { status: 500 }
    );
  }
}
