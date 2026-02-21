import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase-client";

/**
 * Generate a contract for a player based on their position and overall rating
 * This creates realistic multi-year contracts
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
  // Stars (85+): 4-year deals
  // Good players (75-84): 3-year deals
  // Average players (65-74): 2-year deals
  // Below average (<65): 1-year deals
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

/**
 * Setup contract seed data for all players on teams
 * This should be run once after initial database setup or after clearing seed data
 */
export async function POST(req: Request) {
  try {
    // Get all players who are on teams (have team_id set in players table)
    // These are the seed players who need contracts
    const { data: players, error: playersError } = await supabase
      .from("players")
      .select("id, position, overall, team_id")
      .not("team_id", "is", null); // Only players on teams

    if (playersError) {
      return NextResponse.json(
        { error: `Failed to fetch players: ${playersError.message}` },
        { status: 500 }
      );
    }

    if (!players || players.length === 0) {
      return NextResponse.json(
        { error: "No players found on teams. Please run database setup first." },
        { status: 400 }
      );
    }

    // Generate contracts for all players
    const seedContracts = players.map((player) => {
      const contract = generateContract(player.position, player.overall || 70);
      return {
        player_id: player.id,
        contract_year_1: contract.contract_year_1,
        contract_year_2: contract.contract_year_2,
        contract_year_3: contract.contract_year_3,
        contract_year_4: contract.contract_year_4,
        signing_bonus: contract.signing_bonus,
      };
    });

    // Insert contracts in batches (upsert to handle duplicates)
    const batchSize = 100;
    let contractsCreated = 0;

    for (let i = 0; i < seedContracts.length; i += batchSize) {
      const batch = seedContracts.slice(i, i + batchSize);
      
      // We need to handle upserts manually since we have a primary key on player_id
      for (const contract of batch) {
        const { error } = await supabase
          .from("player_contract_seed_data")
          .upsert(contract, {
            onConflict: "player_id",
          });

        if (error) {
          console.error(`Error upserting contract for player ${contract.player_id}:`, error);
          // Continue with next contract
        } else {
          contractsCreated++;
        }
      }
    }

    return NextResponse.json({
      success: true,
      contractsCreated,
      totalPlayers: players.length,
      message: `Successfully created/updated ${contractsCreated} contract seed data records for ${players.length} players`,
    });
  } catch (error) {
    console.error("Error setting up contract seed data:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}



