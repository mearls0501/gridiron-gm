"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase-client";
import { formatCurrency } from "@/lib/utils/format";
import { generateContract } from "@/lib/contract-generator";
import { FileText, DollarSign, AlertCircle, X } from "lucide-react";
import Link from "next/link";
import { useGameStore } from "@/lib/store/game-store";

interface Player {
  id: string;
  full_name: string;
  position: string;
  age: number;
  overall: number;
  potential: number;
  contract_year_1: number;
  contract_year_2: number;
  contract_year_3: number;
  contract_year_4: number;
  signing_bonus: number;
  team_id: string | null;
}

interface Team {
  id: string;
  name: string;
  abbreviation: string;
  salary_cap_total: number;
}

export default function ContractsPage() {
  const { saveGameId } = useGameStore();
  const [team, setTeam] = useState<Team | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [expiringPlayers, setExpiringPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPosition, setSelectedPosition] = useState("All");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [showResignModal, setShowResignModal] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [showExtendModal, setShowExtendModal] = useState(false);
  const [contractYears, setContractYears] = useState<number[]>([0, 0, 0, 0]);
  const [signingBonus, setSigningBonus] = useState<number>(0);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focusedInput, setFocusedInput] = useState<string | null>(null);
  const router = useRouter();

  const positions = [
    "All",
    "QB",
    "RB",
    "WR",
    "TE",
    "OT",
    "OG",
    "C",
    "DE",
    "DT",
    "LB",
    "CB",
    "S",
    "K",
    "P",
  ];

  useEffect(() => {
    loadTeamAndContracts();
  }, []);

  useEffect(() => {
    filterPlayers();
  }, [players, selectedPosition, searchTerm]);

  async function loadTeamAndContracts() {
    try {
      let selectedTeamId: string | null = null;
      if (typeof window !== "undefined") {
        selectedTeamId = localStorage.getItem("selectedTeamId");
      }

      if (!selectedTeamId) {
        const { useGameStore } = await import("@/lib/store/game-store");
        selectedTeamId = useGameStore.getState().selectedTeamId;
      }

      if (!selectedTeamId) {
        router.push("/");
        return;
      }

      // Fetch team
      const { data: teamData, error: teamError } = await supabase
        .from("teams")
        .select("*")
        .eq("id", selectedTeamId)
        .single();

      if (teamError || !teamData) {
        console.error("Error loading team:", teamError);
        return;
      }

      setTeam(teamData);

      if (!saveGameId) {
        console.error("No saveGameId available");
        setLoading(false);
        return;
      }

      // Fetch players on team from player_team_assignments (per save game)
      const { data: assignments, error: assignmentsError } = await supabase
        .from("player_team_assignments")
        .select(
          `
          player_id,
          prospect_id,
          players (
            id,
            full_name,
            position,
            age,
            overall,
            potential
          ),
          draft_prospects (
            id,
            full_name,
            position,
            age,
            overall,
            potential
          )
        `
        )
        .eq("team_id", selectedTeamId)
        .eq("save_game_id", saveGameId)
        .not("team_id", "is", null);

      if (assignmentsError) {
        console.error("Error loading player assignments:", assignmentsError);
        setLoading(false);
        return;
      }

      // Only use player_team_assignments - no fallback to base players table
      // After game initialization, all players on teams should have assignment records
      const allAssignments = assignments || [];

      // Fetch contracts for all players/prospects on the team
      const playerIds = allAssignments
        .map((a) => a.player_id)
        .filter(Boolean) as string[];
      const prospectIds = allAssignments
        .map((a) => a.prospect_id)
        .filter(Boolean) as string[];

      // Get contracts from player_contracts_per_save_game
      // Load all contracts for this save game, then filter in JavaScript
      // This is more reliable than trying to use .or() with .in() filters
      const { data: allContractsData, error: contractsError } = await supabase
        .from("player_contracts_per_save_game")
        .select("*")
        .eq("save_game_id", saveGameId);

      if (contractsError) {
        console.error("Error loading contracts:", contractsError);
      }

      // Filter contracts to only those for players/prospects on this team
      // Match by player_id/prospect_id first (team_id might be outdated if player was moved)
      const contractsData = allContractsData?.filter((contract) => {
        // Check if contract is for a player/prospect on this team
        // This is the primary match - team_id might be outdated
        const isForTeamPlayer =
          (contract.player_id && playerIds.includes(contract.player_id)) ||
          (contract.prospect_id && prospectIds.includes(contract.prospect_id));

        return isForTeamPlayer;
      });

      console.log("[Contracts] Contract filtering:", {
        totalContracts: allContractsData?.length || 0,
        contractsForTeamByTeamId:
          allContractsData?.filter((c) => c.team_id === selectedTeamId)
            .length || 0,
        contractsForTeamByPlayerId:
          allContractsData?.filter(
            (c) =>
              (c.player_id && playerIds.includes(c.player_id)) ||
              (c.prospect_id && prospectIds.includes(c.prospect_id))
          ).length || 0,
        finalFilteredCount: contractsData?.length || 0,
        playerIdsSample: playerIds.slice(0, 3),
        contractPlayerIdsSample: allContractsData
          ?.slice(0, 3)
          .map((c) => c.player_id),
      });

      if (contractsError) {
        console.error("Error loading contracts:", contractsError);
      }

      // Count expiring contracts in the filtered data
      const expiringContractsCount =
        contractsData?.filter((c) => {
          const year2 = c.contract_year_2;
          return (
            year2 === null ||
            year2 === undefined ||
            year2 === 0 ||
            (typeof year2 === "string" && parseFloat(year2) === 0)
          );
        }).length || 0;

      // Sample a few contracts to see their values
      const sampleContracts =
        contractsData?.slice(0, 5).map((c) => ({
          player_id: c.player_id,
          prospect_id: c.prospect_id,
          team_id: c.team_id,
          contract_year_1: c.contract_year_1,
          contract_year_2: c.contract_year_2,
          contract_year_2_type: typeof c.contract_year_2,
          contract_year_2_is_null: c.contract_year_2 === null,
          contract_year_2_is_zero: c.contract_year_2 === 0,
        })) || [];

      // Check why contracts aren't matching - sample some contracts from allContractsData
      const sampleAllContracts =
        allContractsData?.slice(0, 10).map((c) => ({
          player_id: c.player_id,
          prospect_id: c.prospect_id,
          team_id: c.team_id,
          contract_year_2: c.contract_year_2,
          matchesTeamId: c.team_id === selectedTeamId,
          matchesPlayerId: c.player_id && playerIds.includes(c.player_id),
        })) || [];

      // Count how many contracts have NULL contract_year_2 in all contracts
      const allExpiringCount =
        allContractsData?.filter(
          (c) => c.contract_year_2 === null || c.contract_year_2 === 0
        ).length || 0;

      console.log("[Contracts] Loaded contracts:", {
        totalContractsInSaveGame: allContractsData?.length || 0,
        contractsForTeam: contractsData?.length || 0,
        playerIds: playerIds.length,
        prospectIds: prospectIds.length,
        expiringContractsCount,
        allExpiringCount,
        selectedTeamId,
        sampleContracts,
        sampleAllContracts,
      });

      // Only use player_contracts_per_save_game - never use players table as fallback
      // If contracts don't exist, they need to be initialized for this save game
      const allContracts = contractsData || [];

      if (allContracts.length < playerIds.length) {
        console.warn(
          "[Contracts] Warning: Only found",
          allContracts.length,
          "contracts for",
          playerIds.length,
          "players. Contracts may need to be initialized for this save game."
        );
      }

      // Combine player/prospect data with their contracts
      // Filter to only include players with expiring contracts (contract_year_2 is 0 or null)
      const playersWithContracts: Player[] = [];
      for (const assignment of allAssignments) {
        const playerData = assignment.player_id
          ? assignment.players
          : assignment.draft_prospects;
        const player = Array.isArray(playerData) ? playerData[0] : playerData;
        if (!player) continue;

        const contract = allContracts.find(
          (c) =>
            (c.player_id === assignment.player_id && assignment.player_id) ||
            (c.prospect_id === assignment.prospect_id && assignment.prospect_id)
        );

        // CRITICAL: Only include players that HAVE a contract AND that contract is expiring
        // A contract expires if contract_year_2 is 0 or null (meaning no contract for next year)
        // If player has no contract record, skip them (they're not expiring, they have no contract)
        if (!contract) {
          continue;
        }

        // Get contract_year_2 value - NUMERIC fields from PostgreSQL might return as strings
        // NULL means no contract for that year (expiring), any number means contract exists
        const contractYear2Raw = contract.contract_year_2;

        // A contract expires if contract_year_2 is NULL (meaning no contract for next year)
        // We also check for 0 for backward compatibility with existing data (until migration runs)
        // This means the player's current contract (contract_year_1) is their last year
        const contractYear2Num =
          contractYear2Raw === null || contractYear2Raw === undefined
            ? null
            : typeof contractYear2Raw === "string"
              ? parseFloat(contractYear2Raw)
              : Number(contractYear2Raw);

        const isExpiring = contractYear2Num === null || contractYear2Num === 0;

        // Debug logging for first 10 players to see what's happening
        if (playersWithContracts.length < 10 || !contract) {
          console.log("[Contracts] Checking player:", {
            playerName: player.full_name,
            playerId: player.id,
            assignmentPlayerId: assignment.player_id,
            assignmentProspectId: assignment.prospect_id,
            hasContract: !!contract,
            contractId: contract?.id,
            contractPlayerId: contract?.player_id,
            contractProspectId: contract?.prospect_id,
            contractTeamId: contract?.team_id,
            contractYear1: contract?.contract_year_1,
            contractYear2Raw,
            contractYear2RawType: typeof contractYear2Raw,
            contractYear2Num,
            isExpiring,
            willInclude: isExpiring,
            // Check if contract exists in allContracts but wasn't matched
            contractInAllContracts: allContracts.find(
              (c) =>
                (c.player_id === assignment.player_id &&
                  assignment.player_id) ||
                (c.prospect_id === assignment.prospect_id &&
                  assignment.prospect_id)
            )
              ? "YES"
              : "NO",
          });
        }

        // Only include players with expiring contracts (contract_year_2 is 0 or null)
        if (!isExpiring) {
          continue;
        }

        playersWithContracts.push({
          id: player.id,
          full_name: player.full_name,
          position: player.position,
          age: player.age,
          overall: player.overall,
          potential: player.potential,
          contract_year_1: contract?.contract_year_1 || 0,
          contract_year_2: contractYear2Num ?? 0, // Use null coalescing, but convert to 0 for display
          contract_year_3: contract?.contract_year_3 || 0,
          contract_year_4: contract?.contract_year_4 || 0,
          signing_bonus: contract?.signing_bonus || 0,
          team_id: selectedTeamId,
        });
      }

      // Sort players by position and overall
      playersWithContracts.sort((a, b) => {
        if (a.position !== b.position) {
          return a.position.localeCompare(b.position);
        }
        return b.overall - a.overall;
      });

      // All players in playersWithContracts are already expiring (filtered at database level)
      // So we can set both players and expiringPlayers to the same list
      setPlayers(playersWithContracts);
      setExpiringPlayers(playersWithContracts);

      console.log(
        "[Contracts] Expiring players count:",
        playersWithContracts.length
      );
    } catch (err) {
      console.error("Error loading contracts:", err);
    } finally {
      setLoading(false);
    }
  }

  function filterPlayers() {
    let filtered = [...expiringPlayers];

    if (selectedPosition !== "All") {
      filtered = filtered.filter((p) => p.position === selectedPosition);
    }

    if (searchTerm) {
      filtered = filtered.filter((p) =>
        p.full_name.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    return filtered;
  }

  function calculateTotalContractValue(years: number[]): number {
    return years.reduce((sum, year) => sum + (year || 0), 0) + signingBonus;
  }

  function calculateRemainingCap(): number {
    if (!team) return 0;
    const totalCapHit = players.reduce(
      (sum, p) => sum + (p.contract_year_1 || 0),
      0
    );
    const SALARY_CAP = team.salary_cap_total ?? 255000000;
    return SALARY_CAP - totalCapHit;
  }

  function generateSuggestedContract(player: Player): number[] {
    const contract = generateContract(player.position, player.overall);
    return [
      contract.contract_year_1,
      contract.contract_year_2,
      contract.contract_year_3,
      contract.contract_year_4,
    ];
  }

  /**
   * Generate a suggested resign contract based on previous contract and player attributes
   */
  function generateResignContract(player: Player): {
    years: number[];
    signingBonus: number;
  } {
    // Get previous contract year 1 salary as base
    const previousSalary = player.contract_year_1 || 0;

    // If no previous contract, use standard contract generator
    if (previousSalary === 0) {
      const contract = generateContract(player.position, player.overall);
      return {
        years: [
          contract.contract_year_1,
          contract.contract_year_2,
          contract.contract_year_3,
          contract.contract_year_4,
        ],
        signingBonus: contract.signing_bonus,
      };
    }

    // Calculate salary adjustment factors
    // 1. Overall rating factor (scale based on overall, with 80 as baseline)
    const overallFactor = 0.7 + (player.overall / 100) * 0.6; // 0.7x to 1.3x

    // 2. Age factor (older players get less, younger get more)
    let ageFactor = 1.0;
    if (player.age <= 24) {
      ageFactor = 1.15; // Young players get premium
    } else if (player.age <= 27) {
      ageFactor = 1.05; // Prime age
    } else if (player.age <= 30) {
      ageFactor = 1.0; // Still prime
    } else if (player.age <= 32) {
      ageFactor = 0.9; // Slight decline
    } else if (player.age <= 34) {
      ageFactor = 0.75; // Noticeable decline
    } else {
      ageFactor = 0.6; // Significant decline
    }

    // 3. Potential factor (high potential = higher pay)
    const potentialBonus = (player.potential - player.overall) / 100; // Up to 0.2x bonus
    const potentialFactor = 1.0 + Math.max(0, potentialBonus * 0.5); // Max 0.1x bonus

    // Calculate base year 1 salary
    const baseSalary =
      previousSalary * overallFactor * ageFactor * potentialFactor;
    const year1 = Math.round(baseSalary);

    // Standard contract progression (10% increase per year)
    const year2 = Math.round(year1 * 1.1);
    const year3 = Math.round(year1 * 1.2);
    const year4 = Math.round(year1 * 1.3);

    // Determine contract length based heavily on age
    let contractYears: number[] = [0, 0, 0, 0];
    if (player.age <= 24) {
      // Very young: 4-5 years (use all 4 years)
      contractYears = [year1, year2, year3, year4];
    } else if (player.age <= 27) {
      // Young: 3-4 years
      contractYears = [year1, year2, year3, 0];
    } else if (player.age <= 30) {
      // Prime: 2-3 years
      contractYears = [year1, year2, 0, 0];
    } else if (player.age <= 32) {
      // Older: 1-2 years
      contractYears = [year1, year2, 0, 0];
    } else if (player.age <= 34) {
      // Very old: 1-2 years (shorter)
      contractYears = [year1, Math.round(year1 * 1.05), 0, 0]; // Smaller year 2 increase
    } else {
      // Extremely old: 1 year only
      contractYears = [year1, 0, 0, 0];
    }

    // Signing bonus: 20-30% of year 1, higher for longer contracts
    const bonusMultiplier =
      contractYears.filter((y) => y > 0).length >= 3 ? 0.3 : 0.2;
    const signingBonus = Math.round(year1 * bonusMultiplier);

    return {
      years: contractYears,
      signingBonus,
    };
  }

  async function handleResign(player: Player) {
    setSelectedPlayer(player);
    const suggested = generateResignContract(player);
    setContractYears(suggested.years);
    setSigningBonus(suggested.signingBonus);
    setShowResignModal(true);
    setError(null);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async function handleExtend(player: Player) {
    setSelectedPlayer(player);
    // For extension, suggest 2-3 additional years
    const suggested = generateSuggestedContract(player);
    setContractYears([suggested[0], suggested[1], 0, 0]);
    setSigningBonus(Math.round(suggested[0] * 0.2));
    setShowExtendModal(true);
    setError(null);
  }

  async function submitResign() {
    if (!selectedPlayer || !team || !saveGameId) {
      setError("Missing required information. Please refresh the page.");
      return;
    }

    setProcessing(true);
    setError(null);

    try {
      const response = await fetch("/api/contracts/resign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          playerId: selectedPlayer.id,
          teamId: team.id,
          saveGameId,
          contractYears: contractYears.filter((y) => y > 0), // Only send non-zero years
          signingBonus,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Failed to re-sign player");
        return;
      }

      // Reload data
      await loadTeamAndContracts();
      setShowResignModal(false);
      setSelectedPlayer(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setProcessing(false);
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async function submitExtend() {
    if (!selectedPlayer || !team || !saveGameId) {
      setError("Missing required information. Please refresh the page.");
      return;
    }

    setProcessing(true);
    setError(null);

    try {
      const response = await fetch("/api/contracts/extend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          playerId: selectedPlayer.id,
          teamId: team.id,
          saveGameId,
          additionalYears: contractYears.filter((y) => y > 0),
          signingBonus,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Failed to extend contract");
        return;
      }

      // Reload data
      await loadTeamAndContracts();
      setShowExtendModal(false);
      setSelectedPlayer(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setProcessing(false);
    }
  }

  const filteredPlayers = filterPlayers();
  const remainingCap = calculateRemainingCap();

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-gray-50 to-slate-100">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="bg-white rounded-xl shadow-lg p-8">
            <p className="text-gray-600">Loading contracts...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!team) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-gray-50 to-slate-100">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="bg-white rounded-xl shadow-lg p-8">
            <p className="text-red-600">Team not found</p>
            <Link
              href="/"
              className="text-blue-600 underline mt-4 inline-block"
            >
              ← Back to Home
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-gray-50 to-slate-100">
      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="bg-white rounded-xl shadow-lg border border-slate-200 mb-6 overflow-hidden">
          <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 px-8 py-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-black text-white tracking-tight mb-2">
                  Contract Management
                </h1>
                <p className="text-slate-300">{team.name}</p>
              </div>
              <div className="text-right">
                <p className="text-slate-400 text-sm mb-1">
                  Remaining Cap Space
                </p>
                <p
                  className={`text-2xl font-bold ${remainingCap < 0 ? "text-red-400" : "text-green-400"}`}
                >
                  {formatCurrency(remainingCap)}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Expiring Contracts</p>
                <p className="text-2xl font-bold text-gray-900">
                  {expiringPlayers.length}
                </p>
              </div>
              <AlertCircle className="w-8 h-8 text-orange-500" />
            </div>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Total Players</p>
                <p className="text-2xl font-bold text-gray-900">
                  {players.length}
                </p>
              </div>
              <FileText className="w-8 h-8 text-blue-500" />
            </div>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Total Cap Hit</p>
                <p className="text-2xl font-bold text-gray-900">
                  {formatCurrency(
                    players.reduce(
                      (sum, p) => sum + (p.contract_year_1 || 0),
                      0
                    )
                  )}
                </p>
              </div>
              <DollarSign className="w-8 h-8 text-green-500" />
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg shadow p-4 mb-6">
          <div className="flex gap-4">
            <select
              value={selectedPosition}
              onChange={(e) => setSelectedPosition(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {positions.map((pos) => (
                <option key={pos} value={pos}>
                  {pos}
                </option>
              ))}
            </select>
            <input
              type="text"
              placeholder="Search players..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Players Table */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Player
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Position
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Overall
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Contract Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredPlayers.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-6 py-4 text-center text-gray-500"
                    >
                      {expiringPlayers.length === 0
                        ? "No players with expiring contracts"
                        : "No players match your filters"}
                    </td>
                  </tr>
                ) : (
                  filteredPlayers.map((player) => (
                    <tr key={player.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">
                          {player.full_name}
                        </div>
                        <div className="text-sm text-gray-500">
                          Age {player.age}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {player.position}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {player.overall}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="px-2 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-800">
                          Expiring
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleResign(player)}
                            className="text-blue-600 hover:text-blue-900"
                          >
                            Re-sign
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Re-sign Modal */}
        {showResignModal && selectedPlayer && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
              <div className="p-6 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <h2 className="text-2xl font-bold text-gray-900">
                    Re-sign {selectedPlayer.full_name}
                  </h2>
                  <button
                    onClick={() => setShowResignModal(false)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <X className="w-6 h-6" />
                  </button>
                </div>
              </div>
              <div className="p-6">
                {error && (
                  <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
                    {error}
                  </div>
                )}
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Contract Years
                    </label>
                    <div className="grid grid-cols-4 gap-4">
                      {[0, 1, 2, 3].map((index) => {
                        const yearValue = contractYears[index] || 0;
                        const contractLength = contractYears.filter(
                          (y) => y > 0
                        ).length;
                        const proratedBonus =
                          contractLength > 0
                            ? Math.round(signingBonus / contractLength)
                            : 0;
                        const capHit = yearValue + proratedBonus;

                        return (
                          <div key={index}>
                            <label className="block text-xs text-gray-600 mb-1">
                              Year {index + 1}
                            </label>
                            <div className="relative">
                              <input
                                type="text"
                                value={
                                  focusedInput === `year-${index}`
                                    ? yearValue.toString()
                                    : yearValue > 0
                                      ? formatCurrency(yearValue)
                                      : ""
                                }
                                onChange={(e) => {
                                  const rawValue = e.target.value.replace(
                                    /[^0-9]/g,
                                    ""
                                  );
                                  const newYears = [...contractYears];
                                  newYears[index] = parseInt(rawValue) || 0;
                                  setContractYears(newYears);
                                }}
                                onFocus={() => setFocusedInput(`year-${index}`)}
                                onBlur={() => setFocusedInput(null)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 font-medium"
                                placeholder="0"
                              />
                            </div>
                            {yearValue > 0 && (
                              <div className="mt-1 text-xs text-gray-500">
                                <div>Base: {formatCurrency(yearValue)}</div>
                                {contractLength > 0 && (
                                  <div className="font-semibold text-gray-700">
                                    Cap Hit: {formatCurrency(capHit)}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Signing Bonus
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        value={
                          focusedInput === "signing-bonus"
                            ? signingBonus.toString()
                            : signingBonus > 0
                              ? formatCurrency(signingBonus)
                              : ""
                        }
                        onChange={(e) => {
                          const rawValue = e.target.value.replace(
                            /[^0-9]/g,
                            ""
                          );
                          setSigningBonus(parseInt(rawValue) || 0);
                        }}
                        onFocus={() => setFocusedInput("signing-bonus")}
                        onBlur={() => setFocusedInput(null)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 font-medium"
                        placeholder="0"
                      />
                    </div>
                    {signingBonus > 0 && (
                      <div className="mt-1 text-xs text-gray-500">
                        {formatCurrency(signingBonus)} prorated over{" "}
                        {contractYears.filter((y) => y > 0).length || 1} years
                      </div>
                    )}
                  </div>
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <div className="mb-3">
                      <h3 className="text-sm font-semibold text-gray-700 mb-2">
                        Year-by-Year Cap Hit
                      </h3>
                      <div className="space-y-1">
                        {contractYears.map((year, index) => {
                          if (year === 0) return null;
                          const contractLength = contractYears.filter(
                            (y) => y > 0
                          ).length;
                          const proratedBonus =
                            contractLength > 0
                              ? Math.round(signingBonus / contractLength)
                              : 0;
                          const capHit = year + proratedBonus;
                          return (
                            <div
                              key={index}
                              className="flex justify-between text-sm"
                            >
                              <span className="text-gray-600">
                                Year {index + 1}:
                              </span>
                              <span className="font-semibold text-gray-900">
                                {formatCurrency(capHit)}
                              </span>
                            </div>
                          );
                        })}
                        {contractYears.every((y) => y === 0) && (
                          <div className="text-sm text-gray-500 italic">
                            No contract years set
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="pt-3 border-t border-gray-200 space-y-2">
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-600">
                          Total Contract Value:
                        </span>
                        <span className="text-lg font-bold text-gray-900">
                          {formatCurrency(
                            calculateTotalContractValue(contractYears)
                          )}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-600">
                          Remaining Cap Space:
                        </span>
                        <span
                          className={`text-sm font-semibold ${remainingCap < (contractYears[0] || 0) ? "text-red-600" : "text-green-600"}`}
                        >
                          {formatCurrency(
                            remainingCap - (contractYears[0] || 0)
                          )}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="p-6 border-t border-gray-200 flex justify-end gap-4">
                <button
                  onClick={() => setShowResignModal(false)}
                  className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                >
                  Cancel
                </button>
                <button
                  onClick={submitResign}
                  disabled={processing || contractYears[0] === 0}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {processing ? "Processing..." : "Re-sign Player"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
