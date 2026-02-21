import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase-client";

/**
 * Admin endpoint to fix missing contracts for an existing save game
 * This will:
 * 1. Ensure player_contract_seed_data is populated
 * 2. Initialize contracts for the specified save game
 */

function generateContract(position: string, overall: number): {
  contract_year_1: number;
  contract_year_2: number | null;
  contract_year_3: number | null;
  contract_year_4: number | null;
  signing_bonus: number;
} {
  const LEAGUE_MINIMUM = 750000;
  const baseValue = overall * 100000; // $100k per overall point

  // Position multipliers
  const positionMultipliers: Record<string, number> = {
    QB: 2.5,
    WR: 1.8,
    RB: 1.3,
    TE: 1.4,
    OL: 1.5,
    DL: 1.7,
    LB: 1.6,
    CB: 1.9,
    S: 1.5,
    K: 0.8,
    P: 0.7,
  };

  const multiplier = positionMultipliers[position] || 1.0;
  const annualValue = Math.max(LEAGUE_MINIMUM, baseValue * multiplier);

  // Contract length based on overall rating
  let contractLength: number;
  if (overall >= 85) {
    contractLength = 4;
  } else if (overall >= 75) {
    contractLength = 3;
  } else if (overall >= 65) {
    contractLength = 2;
  } else {
    contractLength = 1;
  }

  // Add some randomness to contract length (+/- 1 year)
  const randomAdjustment = Math.random() < 0.3 ? (Math.random() < 0.5 ? -1 : 1) : 0;
  contractLength = Math.max(1, Math.min(4, contractLength + randomAdjustment));

  // Calculate signing bonus (higher for longer contracts and better players)
  const signingBonus = Math.round(annualValue * contractLength * 0.2);

  // Slightly increase salaries in later years
  const year1 = Math.round(annualValue);
  const year2 = contractLength >= 2 ? Math.round(annualValue * 1.05) : null;
  const year3 = contractLength >= 3 ? Math.round(annualValue * 1.1) : null;
  const year4 = contractLength >= 4 ? Math.round(annualValue * 1.15) : null;

  return {
    contract_year_1: year1,
    contract_year_2: year2,
    contract_year_3: year3,
    contract_year_4: year4,
    signing_bonus: signingBonus,
  };
}

export async function POST(req: Request) {
  try {
    const { saveGameId } = await req.json();

    if (!saveGameId) {
      return NextResponse.json(
        { error: "saveGameId is required" },
        { status: 400 }
      );
    }

    console.log(`[Fix Contracts] Starting fix for save game: ${saveGameId}`);

    // Step 1: Get ALL seed contracts using pagination
    console.log("[Fix Contracts] Step 1: Fetching seed contract data...");
    
    interface SeedContractWithPlayer {
      player_id: string;
      contract_year_1: number;
      contract_year_2: number | null;
      contract_year_3: number | null;
      contract_year_4: number | null;
      signing_bonus: number;
      players:
        | { id: string; team_id: string | null }
        | { id: string; team_id: string | null }[];
    }
    
    let allSeedContracts: SeedContractWithPlayer[] = [];
    let offset = 0;
    const pageSize = 1000;
    let hasMore = true;

    while (hasMore) {
      const { data: page, error: pageError } = await supabase
        .from("player_contract_seed_data")
        .select(`
          player_id,
          contract_year_1,
          contract_year_2,
          contract_year_3,
          contract_year_4,
          signing_bonus,
          players!inner (id, team_id)
        `)
        .not("players.team_id", "is", null)
        .range(offset, offset + pageSize - 1);

      if (pageError) {
        return NextResponse.json(
          { error: `Failed to fetch seed contracts: ${pageError.message}` },
          { status: 500 }
        );
      }

      if (page && page.length > 0) {
        allSeedContracts = [...allSeedContracts, ...(page as SeedContractWithPlayer[])];
        offset += pageSize;
        hasMore = page.length === pageSize;
        console.log(`[Fix Contracts] Fetched ${allSeedContracts.length} seed contracts so far...`);
      } else {
        hasMore = false;
      }
    }

    if (allSeedContracts.length === 0) {
      return NextResponse.json(
        { error: "No seed contract data found. Please run /api/setup-contract-seed-data first." },
        { status: 400 }
      );
    }

    console.log(`[Fix Contracts] Total seed contracts fetched: ${allSeedContracts.length}`);
    const seedContracts = allSeedContracts;

    // Step 2: Get existing contracts for this save game
    console.log("[Fix Contracts] Step 2: Checking existing contracts in save game...");
    
    const { data: existingContracts } = await supabase
      .from("player_contracts_per_save_game")
      .select("player_id")
      .eq("save_game_id", saveGameId)
      .not("player_id", "is", null)
      .limit(10000); // Override default 1000 row limit

    const existingPlayerIds = new Set(
      (existingContracts || []).map((c) => c.player_id)
    );

    console.log(`[Fix Contracts] Found ${existingPlayerIds.size} existing contracts in save game`);

    // Step 3: Create contracts for players missing them
    const contractsToCreate = seedContracts
      .filter((seed) => !existingPlayerIds.has(seed.player_id))
      .map((seed) => {
        const playersData = Array.isArray(seed.players) ? seed.players[0] : seed.players;
        const player = playersData as { id: string; team_id: string | null };
        
        return {
          player_id: seed.player_id,
          prospect_id: null,
          save_game_id: saveGameId,
          team_id: player.team_id,
          contract_year_1: seed.contract_year_1 || 0,
          contract_year_2: seed.contract_year_2 && seed.contract_year_2 > 0 ? seed.contract_year_2 : null,
          contract_year_3: seed.contract_year_3 && seed.contract_year_3 > 0 ? seed.contract_year_3 : null,
          contract_year_4: seed.contract_year_4 && seed.contract_year_4 > 0 ? seed.contract_year_4 : null,
          signing_bonus: seed.signing_bonus || 0,
          contract_expires_season: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
      });

    if (contractsToCreate.length === 0) {
      console.log("[Fix Contracts] No missing contracts - all players already have contracts!");
      return NextResponse.json({
        success: true,
        seedContractsCreated: 0,
        contractsCreated: 0,
        message: "No missing contracts found. All players already have contracts in this save game.",
      });
    }

    console.log(`[Fix Contracts] Creating ${contractsToCreate.length} missing contracts...`);

    // Insert missing contracts in batches
    const batchSize = 100;
    let contractsCreated = 0;
    
    for (let i = 0; i < contractsToCreate.length; i += batchSize) {
      const batch = contractsToCreate.slice(i, i + batchSize);
      
      const { error } = await supabase
        .from("player_contracts_per_save_game")
        .insert(batch);

      if (error) {
        console.error(`Error inserting batch ${i / batchSize}:`, error);
        return NextResponse.json(
          { error: `Failed to insert contracts: ${error.message}` },
          { status: 500 }
        );
      }
      
      contractsCreated += batch.length;
    }

    console.log(`[Fix Contracts] Successfully created ${contractsCreated} contracts`);

    return NextResponse.json({
      success: true,
      seedContractsCreated: 0,
      contractsCreated,
      message: `Successfully created ${contractsCreated} missing contracts for save game ${saveGameId}`,
    });
  } catch (error) {
    console.error("[Fix Contracts] Error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

