/**
 * Check if draft_prospects table has the new detailed attribute columns
 */

import { supabase } from "../lib/supabase-client";

async function checkMigrationStatus() {
  console.log("🔍 Checking draft_prospects migration status...\n");

  // Try to insert a test prospect with detailed attributes
  const testProspect = {
    season: 9999, // Use fake season to avoid conflicts
    save_game_id: "00000000-0000-0000-0000-000000000000",
    full_name: "Test Migration Player",
    position: "QB",
    age: 21,
    overall: 75,
    potential: 85,
    // Test if new columns exist
    spd: 80,
    thp: 75,
    sac: 78,
    football_iq: 72,
    athletic_ceiling: 85,
  };

  const { data, error } = await supabase
    .from("draft_prospects")
    .insert(testProspect)
    .select();

  if (error) {
    console.error("❌ Migration NOT applied!");
    console.error("\nError details:", {
      message: error.message,
      code: error.code,
      hint: error.hint,
    });

    if (error.message?.includes("column") || error.code === "42703") {
      console.error("\n🚨 The database is missing the new attribute columns!");
      console.error("📋 You need to apply the migration:");
      console.error("   File: supabase/migrations/add_detailed_attributes_to_draft_prospects.sql");
      console.error("\n📖 See APPLY-MIGRATION.md for instructions");
    }

    return false;
  }

  // Clean up test data
  if (data && data.length > 0) {
    await supabase
      .from("draft_prospects")
      .delete()
      .eq("id", data[0].id);
  }

  console.log("✅ Migration has been applied!");
  console.log("✓ draft_prospects table has all detailed attribute columns");
  console.log("✓ Draft prospect generation should work correctly");
  console.log("\n🎉 You're ready to advance to a new season!");

  return true;
}

checkMigrationStatus()
  .then((success) => {
    if (!success) {
      process.exit(1);
    }
  })
  .catch((err) => {
    console.error("Error checking migration:", err);
    process.exit(1);
  });



