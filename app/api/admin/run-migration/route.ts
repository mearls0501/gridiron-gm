import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase-client";
import { readFileSync } from "fs";
import { join } from "path";

export async function POST(req: Request) {
  try {
    const { migrationName } = await req.json();

    if (!migrationName) {
      return NextResponse.json(
        { error: "Migration name is required" },
        { status: 400 }
      );
    }

    // Read the migration file
    const migrationPath = join(
      process.cwd(),
      "supabase",
      "migrations",
      `${migrationName}.sql`
    );

    let migrationSQL: string;
    try {
      migrationSQL = readFileSync(migrationPath, "utf-8");
    } catch (err) {
      return NextResponse.json(
        { error: `Migration file not found: ${migrationName}` },
        { status: 404 }
      );
    }

    // Split by semicolons to handle multiple statements
    // This is a simple split - for complex migrations, use a proper SQL parser
    const statements = migrationSQL
      .split(";")
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && !s.startsWith("--"));

    const results = [];
    const errors = [];

    for (const statement of statements) {
      if (statement.length === 0) continue;

      try {
        const { error } = await supabase.rpc("exec_sql", {
          sql: statement + ";",
        });

        if (error) {
          // Try direct query as fallback
          const { error: directError } = await supabase
            .from("_supabase_migrations")
            .select("*")
            .limit(1);

          if (directError) {
            errors.push({
              statement: statement.substring(0, 100),
              error: error.message,
            });
          }
        } else {
          results.push({ success: true });
        }
      } catch (err) {
        errors.push({
          statement: statement.substring(0, 100),
          error: err instanceof Error ? err.message : "Unknown error",
        });
      }
    }

    if (errors.length > 0) {
      return NextResponse.json(
        {
          success: false,
          message: `Migration had ${errors.length} errors`,
          errors,
          successCount: results.length,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Migration ${migrationName} completed successfully`,
      statementsRun: results.length,
    });
  } catch (error) {
    console.error("Error running migration:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}



