import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase-client";
import { generatePlayer, resetNameGenerator } from "@/lib/player-generator";

export async function POST(req: Request) {
  try {
    const { season } = await req.json();
    if (!season) {
      return NextResponse.json(
        { error: "Season is required" },
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
      const prospectsToInsert = prospects.map((p) => ({
        season,
        full_name: p.full_name,
        position: p.position,
        age: p.age,
        college: p.college || null,
        archetype: p.archetype || null,
        overall: p.overall,
        potential: p.potential,
        traits: typeof p.traits === "string" ? JSON.parse(p.traits) : p.traits,
        is_free_agent: p.is_free_agent || false,
        contract_year_1: p.contract_year_1 || null,
        contract_year_2: p.contract_year_2 || null,
        contract_year_3: p.contract_year_3 || null,
        contract_year_4: p.contract_year_4 || null,
        signing_bonus: p.signing_bonus || null,
      }));

      // Delete existing prospects for this season first
      await supabase.from("draft_prospects").delete().eq("season", season);

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
        .eq("season", season);

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

      // Upsert draft class record
      // First check if table exists
      const { error: tableCheckError } = await supabase
        .from("draft_classes")
        .select("id")
        .limit(1);

      if (tableCheckError && tableCheckError.code === "PGRST116") {
        // Table doesn't exist - this is okay, prospects are still saved
        console.warn(
          "draft_classes table doesn't exist. Run the migration: supabase/migrations/create_draft_prospects_table.sql"
        );
      } else {
        // Table exists, try to upsert
        const { error: insertError } = await supabase
          .from("draft_classes")
          .upsert(
            {
              season,
              csv_url: publicUrl,
              prospect_count: prospects.length,
              updated_at: new Date().toISOString(),
            },
            {
              onConflict: "season",
            }
          );

        if (insertError) {
          console.error("Draft class insert error:", insertError);
          console.warn(
            "Draft class metadata not saved, but prospects and CSV are available"
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
    console.error(error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
