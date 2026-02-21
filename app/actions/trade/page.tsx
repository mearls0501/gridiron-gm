"use client";

import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/lib/supabase-client";
import { useGameStore } from "@/lib/store/game-store";
import Link from "next/link";
import {
  ArrowLeftRight,
  Plus,
  X,
  Check,
  XCircle,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  DollarSign,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  Users,
  Trophy,
  Search,
  Filter,
} from "lucide-react";
import { calculatePositionalNeeds } from "@/lib/trades/evaluator";
import { formatCurrency } from "@/lib/utils/format";

interface Player {
  id: string;
  full_name: string;
  position: string;
  age: number;
  overall: number;
  potential: number;
  contract_year_1?: number;
  team_id: string;
  is_prospect?: boolean;
}

interface DraftPick {
  id: string;
  season: number;
  round: number;
  pick_overall: number;
  owning_team_id: string;
}

interface Team {
  id: string;
  name: string;
  abbreviation: string;
  conference: string;
  division: string;
}

interface TradeEvaluation {
  overallScore: number;
  salaryCapImpact: number;
  canAfford: boolean;
  positionalFit: number;
  ageFit: number;
  potentialFit: number;
  valueAssessment: number;
  reasoning: string[];
  warnings: string[];
}

export default function TradePage() {
  const { currentSeason, currentWeek, selectedTeamId } = useGameStore();
  const [activeTab, setActiveTab] = useState<"create" | "history">("create");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // This pattern is necessary to prevent hydration mismatches in Next.js
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="bg-slate-800 rounded-xl shadow-2xl p-8 border border-slate-700">
            <p className="text-slate-400">Loading...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <div className="max-w-[1800px] mx-auto px-4 py-6">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-900 via-blue-800 to-blue-900 rounded-xl shadow-2xl border-2 border-blue-600 mb-6 overflow-hidden">
          <div className="px-8 py-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-4xl font-black text-white tracking-tight mb-2 flex items-center gap-3">
                  <ArrowLeftRight className="w-10 h-10 text-blue-300" />
                  Trade Center
                </h1>
                <p className="text-blue-200 text-sm font-medium">
                  Season {currentSeason} • Week {currentWeek}
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setActiveTab("create")}
                  className={`px-6 py-3 rounded-lg font-bold transition-all ${
                    activeTab === "create"
                      ? "bg-white text-blue-900 shadow-lg scale-105"
                      : "bg-blue-700/50 text-blue-200 hover:bg-blue-700"
                  }`}
                >
                  Create Trade
                </button>
                <button
                  onClick={() => setActiveTab("history")}
                  className={`px-6 py-3 rounded-lg font-bold transition-all ${
                    activeTab === "history"
                      ? "bg-white text-blue-900 shadow-lg scale-105"
                      : "bg-blue-700/50 text-blue-200 hover:bg-blue-700"
                  }`}
                >
                  History
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Tab Content */}
        {activeTab === "create" && <CreateTradeTab />}
        {activeTab === "history" && <TradeHistoryTab />}
      </div>
    </div>
  );
}

function CreateTradeTab() {
  const {
    currentSeason,
    currentWeek,
    selectedTeamId: userTeamId,
    saveGameId,
  } = useGameStore();
  const [yourTeam, setYourTeam] = useState<Team | null>(null);
  const [selectedTeamId, setSelectedTeamId] = useState<string>("");
  const [teams, setTeams] = useState<Team[]>([]);
  const [yourTeamPlayers, setYourTeamPlayers] = useState<Player[]>([]);
  const [selectedTeamPlayers, setSelectedTeamPlayers] = useState<Player[]>([]);
  const [yourTeamPicks, setYourTeamPicks] = useState<DraftPick[]>([]);
  const [selectedTeamPicks, setSelectedTeamPicks] = useState<DraftPick[]>([]);
  const [itemsFromTeam, setItemsFromTeam] = useState<
    Array<{ type: string; id: string }>
  >([]);
  const [itemsToTeam, setItemsToTeam] = useState<
    Array<{ type: string; id: string }>
  >([]);
  const [evaluation, setEvaluation] = useState<TradeEvaluation | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [teamIndex, setTeamIndex] = useState(0);
  const [showTradeResult, setShowTradeResult] = useState(false);
  const [tradeResult, setTradeResult] = useState<{
    accepted: boolean;
    message: string;
    score?: number;
  } | null>(null);
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [selectedPick, setSelectedPick] = useState<DraftPick | null>(null);
  const [selectingFor, setSelectingFor] = useState<"your" | "selected" | null>(
    null
  );
  const [yourTeamNeeds, setYourTeamNeeds] = useState<Record<string, number>>(
    {}
  );
  const [selectedTeamNeeds, setSelectedTeamNeeds] = useState<
    Record<string, number>
  >({});
  const [yourTeamCap, setYourTeamCap] = useState<{
    total: number;
    used: number;
    remaining: number;
  } | null>(null);
  const [selectedTeamCap, setSelectedTeamCap] = useState<{
    total: number;
    used: number;
    remaining: number;
  } | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [positionFilter, setPositionFilter] = useState<string>("all");

  useEffect(() => {
    if (userTeamId) {
      loadYourTeam();
      loadTeams();
    }
  }, [userTeamId]);

  useEffect(() => {
    if (yourTeam) {
      loadTeamAssets(yourTeam.id, "your");
      loadTeamInfo(yourTeam.id, "your");
    }
  }, [yourTeam]);

  useEffect(() => {
    if (selectedTeamId && selectedTeamId !== yourTeam?.id) {
      loadTeamAssets(selectedTeamId, "selected");
      loadTeamInfo(selectedTeamId, "selected");
    }
  }, [selectedTeamId]);

  useEffect(() => {
    if (teams.length > 0 && yourTeam) {
      const otherTeams = teams.filter((t) => t.id !== yourTeam.id);
      if (!selectedTeamId || selectedTeamId === yourTeam.id) {
        if (otherTeams.length > 0) {
          setSelectedTeamId(otherTeams[0].id);
          setTeamIndex(0);
        }
      }
    }
  }, [teams, yourTeam, selectedTeamId]);

  useEffect(() => {
    if (
      yourTeam &&
      selectedTeamId &&
      selectedTeamId !== yourTeam.id &&
      (itemsFromTeam.length > 0 || itemsToTeam.length > 0)
    ) {
      evaluateTrade();
    } else {
      setEvaluation(null);
    }
  }, [yourTeam, selectedTeamId, itemsFromTeam, itemsToTeam, currentSeason]);

  async function loadYourTeam() {
    if (!userTeamId) return;

    const { data: team } = await supabase
      .from("teams")
      .select("id, name, abbreviation, conference, division")
      .eq("id", userTeamId)
      .single();

    if (team) {
      setYourTeam(team);
    }
  }

  async function loadTeams() {
    const { data } = await supabase
      .from("teams")
      .select("id, name, abbreviation, conference, division")
      .order("conference")
      .order("division")
      .order("name");

    if (data) {
      setTeams(data);
    }
  }

  async function loadTeamInfo(teamId: string, side: "your" | "selected") {
    // Load cap info
    const { data: team } = await supabase
      .from("teams")
      .select("salary_cap_total")
      .eq("id", teamId)
      .single();

    // Load contracts from player_contracts_per_save_game
    let usedCap = 0;

    if (saveGameId) {
      const { data: contracts } = await supabase
        .from("player_contracts_per_save_game")
        .select("contract_year_1")
        .eq("team_id", teamId)
        .eq("save_game_id", saveGameId);

      usedCap = (contracts || []).reduce(
        (sum, c) => sum + (c.contract_year_1 || 0),
        0
      );
    }

    const totalCap = team?.salary_cap_total || 255000000;
    const remainingCap = totalCap - usedCap;

    if (side === "your") {
      setYourTeamCap({
        total: totalCap,
        used: usedCap,
        remaining: remainingCap,
      });
    } else {
      setSelectedTeamCap({
        total: totalCap,
        used: usedCap,
        remaining: remainingCap,
      });
    }

    // Load team needs
    const needs = await calculatePositionalNeeds(teamId);
    if (side === "your") {
      setYourTeamNeeds(needs);
    } else {
      setSelectedTeamNeeds(needs);
    }
  }

  async function loadTeamAssets(teamId: string, side: "your" | "selected") {
    // Load players from player_team_assignments if saveGameId exists
    let players: Player[] = [];

    if (saveGameId) {
      const { data: assignments } = await supabase
        .from("player_team_assignments")
        .select(
          `
          player_id,
          prospect_id,
          players (*),
          draft_prospects (*)
        `
        )
        .eq("team_id", teamId)
        .eq("save_game_id", saveGameId);

      if (assignments) {
        players = assignments
          .map((a: any) => {
            if (a.player_id && a.players) {
              return { ...a.players, is_prospect: false };
            }
            if (a.prospect_id && a.draft_prospects) {
              return { ...a.draft_prospects, is_prospect: true };
            }
            return null;
          })
          .filter(Boolean);
      }
    } else {
      // Fallback to base players table (should not happen)
      const { data: basePlayers } = await supabase
        .from("players")
        .select("*")
        .eq("team_id", teamId)
        .order("overall", { ascending: false });
      players = basePlayers || [];
    }

    // Load contracts and merge with players
    if (saveGameId && players.length > 0) {
      const playerIds = players.filter((p) => !p.is_prospect).map((p) => p.id);
      const prospectIds = players.filter((p) => p.is_prospect).map((p) => p.id);

      const contractsMap = new Map<string, { contract_year_1: number }>();

      if (playerIds.length > 0) {
        const { data: playerContracts } = await supabase
          .from("player_contracts_per_save_game")
          .select("player_id, contract_year_1")
          .in("player_id", playerIds)
          .eq("save_game_id", saveGameId);

        if (playerContracts) {
          playerContracts.forEach((c: any) => {
            if (c.player_id) contractsMap.set(c.player_id, c);
          });
        }
      }

      if (prospectIds.length > 0) {
        const { data: prospectContracts } = await supabase
          .from("player_contracts_per_save_game")
          .select("prospect_id, contract_year_1")
          .in("prospect_id", prospectIds)
          .eq("save_game_id", saveGameId);

        if (prospectContracts) {
          prospectContracts.forEach((c: any) => {
            if (c.prospect_id) contractsMap.set(c.prospect_id, c);
          });
        }
      }

      // Merge contracts with players
      players = players.map((p) => ({
        ...p,
        contract_year_1: contractsMap.get(p.id)?.contract_year_1 || 0,
      }));
    }

    players.sort((a, b) => (b.overall || 0) - (a.overall || 0));

    const seasonsToLoad = [
      currentSeason,
      currentSeason + 1,
      currentSeason + 2,
      currentSeason + 3,
    ];

    // CRITICAL: Filter draft picks by save_game_id for save game isolation
    let picksQuery = supabase
      .from("draft_picks")
      .select("*")
      .eq("owning_team_id", teamId)
      .in("season", seasonsToLoad);

    if (saveGameId) {
      picksQuery = picksQuery.eq("save_game_id", saveGameId);
    } else {
      // If no saveGameId, this is an error - we can't load draft picks without save game context
      console.error(
        "[loadTeamAssets] Cannot load draft picks without saveGameId"
      );
      if (side === "your") {
        setYourTeamPicks([]);
      } else {
        setSelectedTeamPicks([]);
      }
      return;
    }

    const { data: picks } = await picksQuery
      .order("season", { ascending: true })
      .order("pick_overall", { ascending: true });

    if (side === "your") {
      setYourTeamPlayers(players || []);
      setYourTeamPicks(picks || []);
    } else {
      setSelectedTeamPlayers(players || []);
      setSelectedTeamPicks(picks || []);
    }
  }

  function navigateTeam(direction: "prev" | "next") {
    if (!yourTeam) return;

    const otherTeams = teams.filter((t) => t.id !== yourTeam.id);
    if (otherTeams.length === 0) return;

    let newIndex = teamIndex;
    if (direction === "next") {
      newIndex = (teamIndex + 1) % otherTeams.length;
    } else {
      newIndex = teamIndex - 1;
      if (newIndex < 0) newIndex = otherTeams.length - 1;
    }

    setTeamIndex(newIndex);
    setSelectedTeamId(otherTeams[newIndex].id);
  }

  async function evaluateTrade() {
    if (!yourTeam || !selectedTeamId) return;

    setLoading(true);
    setError(null);

    try {
      if (!saveGameId) {
        setError(
          "saveGameId is required. Please ensure you have a save game loaded."
        );
        setLoading(false);
        return;
      }

      const res = await fetch("/api/trades/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamId: yourTeam.id,
          itemsReceiving: itemsToTeam.map((item) => ({
            type: item.type,
            playerId: item.type === "player" ? item.id : undefined,
            draftPickId: item.type === "draft_pick" ? item.id : undefined,
          })),
          itemsGiving: itemsFromTeam.map((item) => ({
            type: item.type,
            playerId: item.type === "player" ? item.id : undefined,
            draftPickId: item.type === "draft_pick" ? item.id : undefined,
          })),
          season: currentSeason,
          saveGameId: saveGameId,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to evaluate trade");
      }

      setEvaluation(data.evaluation);
    } catch (err) {
      console.error("Error evaluating trade:", err);
      setError(err instanceof Error ? err.message : "Failed to evaluate trade");
    } finally {
      setLoading(false);
    }
  }

  function addItem(
    teamSide: "your" | "selected",
    type: "player" | "draft_pick",
    id: string
  ) {
    if (teamSide === "your") {
      setItemsFromTeam([...itemsFromTeam, { type, id }]);
    } else {
      setItemsToTeam([...itemsToTeam, { type, id }]);
    }
    setSelectedPlayer(null);
    setSelectedPick(null);
    setSelectingFor(null);
  }

  function removeItem(teamSide: "your" | "selected", index: number) {
    if (teamSide === "your") {
      setItemsFromTeam(itemsFromTeam.filter((_, i) => i !== index));
    } else {
      setItemsToTeam(itemsToTeam.filter((_, i) => i !== index));
    }
  }

  function handlePlayerClick(player: Player, teamSide: "your" | "selected") {
    setSelectedPlayer(player);
    setSelectedPick(null);
    setSelectingFor(teamSide);
  }

  function handlePickClick(pick: DraftPick, teamSide: "your" | "selected") {
    setSelectedPick(pick);
    setSelectedPlayer(null);
    setSelectingFor(teamSide);
  }

  function addSelectedToTrade() {
    if (!selectingFor) return;

    if (selectedPlayer) {
      addItem(selectingFor, "player", selectedPlayer.id);
    } else if (selectedPick) {
      addItem(selectingFor, "draft_pick", selectedPick.id);
    }
  }

  async function proposeTrade() {
    if (!yourTeam || !selectedTeamId || selectedTeamId === yourTeam.id) {
      setError("Please select a trading partner");
      return;
    }

    if (itemsFromTeam.length === 0 || itemsToTeam.length === 0) {
      setError("Both teams must include at least one item in the trade");
      return;
    }

    if (evaluation && !evaluation.canAfford) {
      setError("Trade would exceed salary cap");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const proposeRes = await fetch("/api/trades/propose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fromTeamId: yourTeam.id,
          toTeamId: selectedTeamId,
          itemsFromTeam: itemsFromTeam.map((item) => ({
            type: item.type,
            playerId: item.type === "player" ? item.id : undefined,
            draftPickId: item.type === "draft_pick" ? item.id : undefined,
          })),
          saveGameId: saveGameId,
          itemsToTeam: itemsToTeam.map((item) => ({
            type: item.type,
            playerId: item.type === "player" ? item.id : undefined,
            draftPickId: item.type === "draft_pick" ? item.id : undefined,
          })),
          season: currentSeason,
          week: currentWeek,
        }),
      });

      const proposeData = await proposeRes.json();

      if (!proposeRes.ok) {
        throw new Error(proposeData.error || "Failed to propose trade");
      }

      const tradeId = proposeData.trade?.id;

      if (!tradeId) {
        throw new Error("Trade ID not returned");
      }

      const receivingTeamEvaluation = proposeData.trade?.to_team_evaluation;

      const shouldAccept =
        receivingTeamEvaluation &&
        receivingTeamEvaluation.overallScore >= 50 &&
        receivingTeamEvaluation.canAfford;

      if (shouldAccept) {
        const executeRes = await fetch("/api/trades/execute", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tradeId: tradeId,
            acceptingTeamId: selectedTeamId,
          }),
        });

        const executeData = await executeRes.json();

        if (!executeRes.ok) {
          throw new Error(
            executeData.error || "Trade was proposed but failed to execute"
          );
        }

        setTradeResult({
          accepted: true,
          message: `Trade accepted and executed!`,
          score: receivingTeamEvaluation.overallScore,
        });
        setShowTradeResult(true);
      } else {
        const rejectRes = await fetch("/api/trades/reject", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tradeId: tradeId,
            rejectingTeamId: selectedTeamId,
          }),
        });

        const rejectData = await rejectRes.json();

        if (!rejectRes.ok) {
          console.error("Failed to reject trade:", rejectData);
        }

        const reason =
          receivingTeamEvaluation?.canAfford === false
            ? "Trade would exceed salary cap"
            : `Score too low: ${receivingTeamEvaluation?.overallScore.toFixed(0) || "N/A"} (minimum: 50)`;

        setTradeResult({
          accepted: false,
          message: `Trade declined: ${reason}`,
          score: receivingTeamEvaluation?.overallScore,
        });
        setShowTradeResult(true);
      }

      setItemsFromTeam([]);
      setItemsToTeam([]);
      setEvaluation(null);
      setSelectedPlayer(null);
      setSelectedPick(null);
    } catch (err) {
      console.error("Error proposing trade:", err);
      setError(err instanceof Error ? err.message : "Failed to propose trade");
    } finally {
      setLoading(false);
    }
  }

  const otherTeams = useMemo(() => {
    return teams.filter((t) => t.id !== yourTeam?.id);
  }, [teams, yourTeam]);

  const validSelectedTeamId = useMemo(() => {
    if (!yourTeam) return "";
    return selectedTeamId && selectedTeamId !== yourTeam.id
      ? selectedTeamId
      : otherTeams.length > 0
        ? otherTeams[0].id
        : "";
  }, [selectedTeamId, yourTeam, otherTeams]);

  const selectedTeam = useMemo(() => {
    return teams.find((t) => t.id === validSelectedTeamId);
  }, [teams, validSelectedTeamId]);

  // Get top team needs (sorted by need score)
  const yourTopNeeds = useMemo(() => {
    return Object.entries(yourTeamNeeds)
      .filter(([_, score]) => score > 0)
      .sort(([_, a], [__, b]) => b - a)
      .slice(0, 5)
      .map(([pos]) => pos);
  }, [yourTeamNeeds]);

  const selectedTopNeeds = useMemo(() => {
    return Object.entries(selectedTeamNeeds)
      .filter(([_, score]) => score > 0)
      .sort(([_, a], [__, b]) => b - a)
      .slice(0, 5)
      .map(([pos]) => pos);
  }, [selectedTeamNeeds]);

  // Filter players
  const filteredYourPlayers = useMemo(() => {
    return yourTeamPlayers.filter((p) => {
      const matchesSearch =
        searchQuery === "" ||
        p.full_name.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesPosition =
        positionFilter === "all" || p.position === positionFilter;
      return matchesSearch && matchesPosition;
    });
  }, [yourTeamPlayers, searchQuery, positionFilter]);

  const filteredSelectedPlayers = useMemo(() => {
    return selectedTeamPlayers.filter((p) => {
      const matchesSearch =
        searchQuery === "" ||
        p.full_name.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesPosition =
        positionFilter === "all" || p.position === positionFilter;
      return matchesSearch && matchesPosition;
    });
  }, [selectedTeamPlayers, searchQuery, positionFilter]);

  const positions = useMemo(() => {
    return Array.from(
      new Set(
        [...yourTeamPlayers, ...selectedTeamPlayers].map((p) => p.position)
      )
    ).sort();
  }, [yourTeamPlayers, selectedTeamPlayers]);

  // Get roster sizes
  const yourRosterSize = useMemo(
    () => yourTeamPlayers.length,
    [yourTeamPlayers]
  );
  const selectedRosterSize = useMemo(
    () => selectedTeamPlayers.length,
    [selectedTeamPlayers]
  );

  if (!userTeamId || !yourTeam) {
    return (
      <div className="bg-slate-800 rounded-xl shadow-2xl border border-slate-700 p-12 text-center">
        <p className="text-slate-400 text-lg">
          Please select a team to start trading
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Propose Trade Button - Top Center */}
      {yourTeam &&
        validSelectedTeamId &&
        itemsFromTeam.length > 0 &&
        itemsToTeam.length > 0 && (
          <div className="flex justify-center">
            <button
              onClick={proposeTrade}
              disabled={loading || (evaluation ? !evaluation.canAfford : false)}
              className="px-12 py-4 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-xl font-black text-xl hover:from-blue-700 hover:to-blue-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-2xl hover:shadow-3xl hover:scale-105 flex items-center gap-3 border-2 border-blue-500"
            >
              <ArrowLeftRight className="w-7 h-7" />
              {loading ? "Processing Trade..." : "Propose Trade"}
            </button>
          </div>
        )}

      {/* Three Column Layout - Madden Style */}
      <div className="grid grid-cols-12 gap-4">
        {/* Left Panel - Your Team */}
        <div className="col-span-3 bg-gradient-to-b from-red-900/95 to-red-800/95 rounded-xl shadow-2xl border-2 border-red-600 overflow-hidden">
          {/* Team Header */}
          <div className="bg-red-700 px-4 py-3 border-b-2 border-red-600">
            <div className="text-xs font-bold text-red-200 uppercase tracking-wider mb-1">
              Your Team
            </div>
            <div className="text-2xl font-black text-white">
              {yourTeam.abbreviation}
            </div>
            <div className="text-xs text-red-200 mt-1">
              {yourTeam.conference} • {yourTeam.division}
            </div>
          </div>

          {/* Team Info */}
          <div className="p-4 space-y-4">
            {/* Team Needs */}
            <div>
              <div className="text-xs font-bold text-red-200 uppercase tracking-wider mb-2">
                Team Needs
              </div>
              <div className="space-y-1">
                {yourTopNeeds.length > 0 ? (
                  yourTopNeeds.map((pos) => (
                    <div key={pos} className="text-sm text-white font-semibold">
                      • {pos}
                    </div>
                  ))
                ) : (
                  <div className="text-sm text-red-300/50 italic">
                    No major needs
                  </div>
                )}
              </div>
            </div>

            {/* Cap Room */}
            <div>
              <div className="text-xs font-bold text-red-200 uppercase tracking-wider mb-1">
                Cap Room
              </div>
              <div className="text-2xl font-black text-white">
                {yourTeamCap ? formatCurrency(yourTeamCap.remaining) : "$0"}
              </div>
            </div>

            {/* Roster Size */}
            <div>
              <div className="text-xs font-bold text-red-200 uppercase tracking-wider mb-1">
                Roster Size
              </div>
              <div className="text-2xl font-black text-white">
                {yourRosterSize} / 75
              </div>
            </div>
          </div>

          {/* Players/Picks List */}
          <div className="border-t-2 border-red-600 bg-red-900/50">
            <div className="p-2 flex gap-1 border-b border-red-700">
              <button
                onClick={() => setSelectingFor("your")}
                className={`flex-1 px-2 py-1 text-xs font-bold rounded ${
                  selectingFor === "your"
                    ? "bg-red-600 text-white"
                    : "bg-red-800/50 text-red-200 hover:bg-red-700"
                }`}
              >
                Players
              </button>
              <button
                onClick={() => {
                  setSelectingFor("your");
                  setSelectedPlayer(null);
                  setSelectedPick(null);
                }}
                className={`flex-1 px-2 py-1 text-xs font-bold rounded ${
                  selectingFor === "your" && !selectedPlayer
                    ? "bg-red-600 text-white"
                    : "bg-red-800/50 text-red-200 hover:bg-red-700"
                }`}
              >
                Picks
              </button>
            </div>
            <div className="max-h-[500px] overflow-y-auto p-2 space-y-1">
              {selectingFor === "your" && (
                <>
                  {filteredYourPlayers.map((player) => {
                    const isSelected = itemsFromTeam.some(
                      (item) => item.type === "player" && item.id === player.id
                    );
                    return (
                      <button
                        key={player.id}
                        onClick={() => handlePlayerClick(player, "your")}
                        disabled={isSelected}
                        className={`w-full text-left p-2 rounded border transition-all ${
                          selectedPlayer?.id === player.id
                            ? "bg-red-600 border-red-400"
                            : isSelected
                              ? "bg-red-800/30 border-red-700 opacity-50"
                              : "bg-red-800/20 border-red-700 hover:bg-red-700/50"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 bg-red-600 rounded flex items-center justify-center border border-red-500">
                            <span className="text-xs font-black text-white">
                              {player.overall}
                            </span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-bold text-white truncate">
                              {player.full_name}
                            </div>
                            <div className="text-xs text-red-200">
                              {player.position}
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                  {yourTeamPicks.map((pick) => {
                    const isSelected = itemsFromTeam.some(
                      (item) =>
                        item.type === "draft_pick" && item.id === pick.id
                    );
                    return (
                      <button
                        key={pick.id}
                        onClick={() => handlePickClick(pick, "your")}
                        disabled={isSelected}
                        className={`w-full text-left p-2 rounded border transition-all ${
                          selectedPick?.id === pick.id
                            ? "bg-red-600 border-red-400"
                            : isSelected
                              ? "bg-red-800/30 border-red-700 opacity-50"
                              : "bg-red-800/20 border-red-700 hover:bg-red-700/50"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <Trophy className="w-6 h-6 text-yellow-400" />
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-bold text-white">
                              {pick.season} R{pick.round}
                            </div>
                            <div className="text-xs text-red-200">
                              #{pick.pick_overall}
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </>
              )}
            </div>
          </div>
        </div>

        {/* Center Panel - Trade Details */}
        <div className="col-span-6 bg-gradient-to-b from-slate-800 to-slate-900 rounded-xl shadow-2xl border-2 border-slate-600 overflow-hidden">
          {/* Selected Player/Pick Display */}
          {(selectedPlayer || selectedPick) && (
            <div className="bg-slate-700 p-6 border-b-2 border-slate-600">
              {selectedPlayer && (
                <div className="flex items-center gap-6">
                  <div className="w-24 h-24 bg-gradient-to-br from-blue-600 to-blue-700 rounded-lg flex items-center justify-center border-4 border-blue-500">
                    <span className="text-4xl font-black text-white">
                      {selectedPlayer.overall}
                    </span>
                  </div>
                  <div className="flex-1">
                    <div className="text-3xl font-black text-white mb-1">
                      {selectedPlayer.full_name}
                    </div>
                    <div className="text-lg text-slate-300 mb-2">
                      AGE: {selectedPlayer.age} | CAP HIT{" "}
                      {formatCurrency(selectedPlayer.contract_year_1 ?? 0)}
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-sm text-slate-400">
                        {selectedPlayer.position} • POT{" "}
                        {selectedPlayer.potential}
                      </div>
                    </div>
                  </div>
                  {selectingFor && (
                    <button
                      onClick={addSelectedToTrade}
                      className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold transition-colors"
                    >
                      Add to Trade
                    </button>
                  )}
                </div>
              )}
              {selectedPick && (
                <div className="flex items-center gap-6">
                  <div className="w-24 h-24 bg-gradient-to-br from-yellow-500 to-yellow-600 rounded-lg flex items-center justify-center border-4 border-yellow-400">
                    <Trophy className="w-12 h-12 text-white" />
                  </div>
                  <div className="flex-1">
                    <div className="text-3xl font-black text-white mb-1">
                      {selectedPick.season} Round {selectedPick.round}
                    </div>
                    <div className="text-lg text-slate-300 mb-2">
                      Pick #{selectedPick.pick_overall}
                    </div>
                  </div>
                  {selectingFor && (
                    <button
                      onClick={addSelectedToTrade}
                      className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold transition-colors"
                    >
                      Add to Trade
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Trade Slots Grid */}
          <div className="p-6">
            <div className="grid grid-cols-2 gap-4 mb-4">
              {/* Your Team Trade Slots */}
              <div>
                <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 text-center">
                  {yourTeam.abbreviation} - Giving
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {Array.from({ length: 3 }).map((_, idx) => {
                    const item = itemsFromTeam[idx];
                    const player = item
                      ? yourTeamPlayers.find((p) => p.id === item.id)
                      : null;
                    const pick = item
                      ? yourTeamPicks.find((p) => p.id === item.id)
                      : null;
                    return (
                      <div
                        key={idx}
                        className={`aspect-square rounded-lg border-2 flex flex-col items-center justify-center p-2 ${
                          item
                            ? "bg-red-800/50 border-red-600"
                            : "bg-slate-700/50 border-slate-600 border-dashed"
                        }`}
                      >
                        {item ? (
                          <>
                            {player && (
                              <>
                                <div className="w-10 h-10 bg-red-600 rounded flex items-center justify-center mb-1">
                                  <span className="text-sm font-black text-white">
                                    {player.overall}
                                  </span>
                                </div>
                                <div className="text-xs font-bold text-white text-center truncate w-full">
                                  {player.full_name}
                                </div>
                                <div className="text-xs text-red-200 text-center">
                                  {player.position}
                                </div>
                                <button
                                  onClick={() => removeItem("your", idx)}
                                  className="mt-1 p-1 text-red-400 hover:bg-red-500/20 rounded"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </>
                            )}
                            {pick && (
                              <>
                                <Trophy className="w-8 h-8 text-yellow-400 mb-1" />
                                <div className="text-xs font-bold text-white text-center">
                                  {pick.season} R{pick.round}
                                </div>
                                <div className="text-xs text-red-200 text-center">
                                  #{pick.pick_overall}
                                </div>
                                <button
                                  onClick={() => removeItem("your", idx)}
                                  className="mt-1 p-1 text-red-400 hover:bg-red-500/20 rounded"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </>
                            )}
                          </>
                        ) : (
                          <div className="text-xs text-slate-400 text-center">
                            ADD PLAYER OR DRAFT PICK
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Trading Partner Trade Slots */}
              <div>
                <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 text-center">
                  {selectedTeam?.abbreviation || "OPP"} - Receiving
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {Array.from({ length: 3 }).map((_, idx) => {
                    const item = itemsToTeam[idx];
                    const player = item
                      ? selectedTeamPlayers.find((p) => p.id === item.id)
                      : null;
                    const pick = item
                      ? selectedTeamPicks.find((p) => p.id === item.id)
                      : null;
                    return (
                      <div
                        key={idx}
                        className={`aspect-square rounded-lg border-2 flex flex-col items-center justify-center p-2 ${
                          item
                            ? "bg-blue-800/50 border-blue-600"
                            : "bg-slate-700/50 border-slate-600 border-dashed"
                        }`}
                      >
                        {item ? (
                          <>
                            {player && (
                              <>
                                <div className="w-10 h-10 bg-blue-600 rounded flex items-center justify-center mb-1">
                                  <span className="text-sm font-black text-white">
                                    {player.overall}
                                  </span>
                                </div>
                                <div className="text-xs font-bold text-white text-center truncate w-full">
                                  {player.full_name}
                                </div>
                                <div className="text-xs text-blue-200 text-center">
                                  {player.position}
                                </div>
                                <button
                                  onClick={() => removeItem("selected", idx)}
                                  className="mt-1 p-1 text-blue-400 hover:bg-blue-500/20 rounded"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </>
                            )}
                            {pick && (
                              <>
                                <Trophy className="w-8 h-8 text-yellow-400 mb-1" />
                                <div className="text-xs font-bold text-white text-center">
                                  {pick.season} R{pick.round}
                                </div>
                                <div className="text-xs text-blue-200 text-center">
                                  #{pick.pick_overall}
                                </div>
                                <button
                                  onClick={() => removeItem("selected", idx)}
                                  className="mt-1 p-1 text-blue-400 hover:bg-blue-500/20 rounded"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </>
                            )}
                          </>
                        ) : (
                          <div className="text-xs text-slate-400 text-center">
                            ADD PLAYER OR DRAFT PICK
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Trade Evaluation */}
            {evaluation && (
              <div className="mt-6 p-4 bg-slate-700/50 rounded-lg border border-slate-600">
                <div className="grid grid-cols-6 gap-3">
                  <div className="bg-blue-600 rounded-lg p-2 border border-blue-500">
                    <div className="text-xs font-bold text-blue-200 uppercase tracking-wider mb-1">
                      Score
                    </div>
                    <div className="text-xl font-black text-white">
                      {evaluation.overallScore.toFixed(0)}
                    </div>
                  </div>
                  <div className="bg-slate-600 rounded-lg p-2 border border-slate-500">
                    <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">
                      Position
                    </div>
                    <div className="text-lg font-black text-white">
                      {evaluation.positionalFit.toFixed(0)}
                    </div>
                  </div>
                  <div className="bg-slate-600 rounded-lg p-2 border border-slate-500">
                    <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">
                      Age
                    </div>
                    <div className="text-lg font-black text-white">
                      {evaluation.ageFit.toFixed(0)}
                    </div>
                  </div>
                  <div className="bg-slate-600 rounded-lg p-2 border border-slate-500">
                    <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">
                      Value
                    </div>
                    <div className="text-lg font-black text-white">
                      {evaluation.valueAssessment.toFixed(0)}
                    </div>
                  </div>
                  <div
                    className={`rounded-lg p-2 border ${
                      evaluation.canAfford
                        ? "bg-green-600 border-green-500"
                        : "bg-red-600 border-red-500"
                    }`}
                  >
                    <div
                      className={`text-xs font-bold uppercase tracking-wider mb-1 ${
                        evaluation.canAfford ? "text-green-200" : "text-red-200"
                      }`}
                    >
                      Cap
                    </div>
                    <div className="text-sm font-black text-white">
                      {evaluation.salaryCapImpact >= 0 ? "+" : ""}
                      {(evaluation.salaryCapImpact / 1000).toFixed(0)}K
                    </div>
                  </div>
                  <div
                    className={`rounded-lg p-2 border ${
                      evaluation.canAfford
                        ? "bg-green-600 border-green-500"
                        : "bg-red-600 border-red-500"
                    }`}
                  >
                    <div
                      className={`text-xs font-bold uppercase tracking-wider mb-1 ${
                        evaluation.canAfford ? "text-green-200" : "text-red-200"
                      }`}
                    >
                      Status
                    </div>
                    <div className="text-sm font-black text-white">
                      {evaluation.canAfford ? "VALID" : "INVALID"}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Panel - Trading Partner */}
        <div className="col-span-3 bg-gradient-to-b from-blue-900/95 to-blue-800/95 rounded-xl shadow-2xl border-2 border-blue-600 overflow-hidden">
          {/* Team Header */}
          <div className="bg-blue-700 px-4 py-3 border-b-2 border-blue-600">
            <div className="flex items-center justify-between mb-2">
              <div className="flex-1">
                <div className="text-xs font-bold text-blue-200 uppercase tracking-wider mb-1">
                  Trading Partner
                </div>
                {selectedTeam ? (
                  <>
                    <div className="text-2xl font-black text-white">
                      {selectedTeam.abbreviation}
                    </div>
                    <div className="text-xs text-blue-200 mt-1">
                      {selectedTeam.conference} • {selectedTeam.division}
                    </div>
                  </>
                ) : (
                  <div className="text-2xl font-black text-white">
                    Select Team
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => navigateTeam("prev")}
                  className="p-1.5 bg-blue-600 hover:bg-blue-500 rounded border border-blue-500 transition-colors"
                >
                  <ChevronLeft className="w-4 h-4 text-white" />
                </button>
                <button
                  onClick={() => navigateTeam("next")}
                  className="p-1.5 bg-blue-600 hover:bg-blue-500 rounded border border-blue-500 transition-colors"
                >
                  <ChevronRight className="w-4 h-4 text-white" />
                </button>
              </div>
            </div>
            <select
              value={validSelectedTeamId}
              onChange={(e) => {
                const newIndex = otherTeams.findIndex(
                  (t) => t.id === e.target.value
                );
                setTeamIndex(newIndex >= 0 ? newIndex : 0);
                setSelectedTeamId(e.target.value);
              }}
              className="w-full px-2 py-1 bg-blue-800/50 border border-blue-600 rounded text-white text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {otherTeams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.abbreviation}
                </option>
              ))}
            </select>
          </div>

          {/* Team Info */}
          <div className="p-4 space-y-4">
            {/* Team Needs */}
            <div>
              <div className="text-xs font-bold text-blue-200 uppercase tracking-wider mb-2">
                Team Needs
              </div>
              <div className="space-y-1">
                {selectedTopNeeds.length > 0 ? (
                  selectedTopNeeds.map((pos) => (
                    <div key={pos} className="text-sm text-white font-semibold">
                      • {pos}
                    </div>
                  ))
                ) : (
                  <div className="text-sm text-blue-300/50 italic">
                    No major needs
                  </div>
                )}
              </div>
            </div>

            {/* Cap Room */}
            <div>
              <div className="text-xs font-bold text-blue-200 uppercase tracking-wider mb-1">
                Cap Room
              </div>
              <div className="text-2xl font-black text-white">
                {selectedTeamCap
                  ? formatCurrency(selectedTeamCap.remaining)
                  : "$0"}
              </div>
            </div>

            {/* Roster Size */}
            <div>
              <div className="text-xs font-bold text-blue-200 uppercase tracking-wider mb-1">
                Roster Size
              </div>
              <div className="text-2xl font-black text-white">
                {selectedRosterSize} / 75
              </div>
            </div>
          </div>

          {/* Players/Picks List */}
          <div className="border-t-2 border-blue-600 bg-blue-900/50">
            <div className="p-2 flex gap-1 border-b border-blue-700">
              <button
                onClick={() => setSelectingFor("selected")}
                className={`flex-1 px-2 py-1 text-xs font-bold rounded ${
                  selectingFor === "selected"
                    ? "bg-blue-600 text-white"
                    : "bg-blue-800/50 text-blue-200 hover:bg-blue-700"
                }`}
              >
                Players
              </button>
              <button
                onClick={() => {
                  setSelectingFor("selected");
                  setSelectedPlayer(null);
                  setSelectedPick(null);
                }}
                className={`flex-1 px-2 py-1 text-xs font-bold rounded ${
                  selectingFor === "selected" && !selectedPlayer
                    ? "bg-blue-600 text-white"
                    : "bg-blue-800/50 text-blue-200 hover:bg-blue-700"
                }`}
              >
                Picks
              </button>
            </div>
            <div className="max-h-[500px] overflow-y-auto p-2 space-y-1">
              {selectingFor === "selected" && (
                <>
                  {filteredSelectedPlayers.map((player) => {
                    const isSelected = itemsToTeam.some(
                      (item) => item.type === "player" && item.id === player.id
                    );
                    return (
                      <button
                        key={player.id}
                        onClick={() => handlePlayerClick(player, "selected")}
                        disabled={isSelected}
                        className={`w-full text-left p-2 rounded border transition-all ${
                          selectedPlayer?.id === player.id
                            ? "bg-blue-600 border-blue-400"
                            : isSelected
                              ? "bg-blue-800/30 border-blue-700 opacity-50"
                              : "bg-blue-800/20 border-blue-700 hover:bg-blue-700/50"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 bg-blue-600 rounded flex items-center justify-center border border-blue-500">
                            <span className="text-xs font-black text-white">
                              {player.overall}
                            </span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-bold text-white truncate">
                              {player.full_name}
                            </div>
                            <div className="text-xs text-blue-200">
                              {player.position}
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                  {selectedTeamPicks.map((pick) => {
                    const isSelected = itemsToTeam.some(
                      (item) =>
                        item.type === "draft_pick" && item.id === pick.id
                    );
                    return (
                      <button
                        key={pick.id}
                        onClick={() => handlePickClick(pick, "selected")}
                        disabled={isSelected}
                        className={`w-full text-left p-2 rounded border transition-all ${
                          selectedPick?.id === pick.id
                            ? "bg-blue-600 border-blue-400"
                            : isSelected
                              ? "bg-blue-800/30 border-blue-700 opacity-50"
                              : "bg-blue-800/20 border-blue-700 hover:bg-blue-700/50"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <Trophy className="w-6 h-6 text-yellow-400" />
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-bold text-white">
                              {pick.season} R{pick.round}
                            </div>
                            <div className="text-xs text-blue-200">
                              #{pick.pick_overall}
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 p-4">
        <div className="flex items-center gap-4">
          <div className="flex-1 relative">
            <Search className="w-5 h-5 text-slate-400 absolute left-3 top-1/2 transform -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search players..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <select
            value={positionFilter}
            onChange={(e) => setPositionFilter(e.target.value)}
            className="px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Positions</option>
            {positions.map((pos) => (
              <option key={pos} value={pos}>
                {pos}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Error Messages */}
      {error && (
        <div className="bg-red-900/50 border-2 border-red-600 rounded-lg p-4">
          <p className="text-red-200 font-bold">{error}</p>
        </div>
      )}

      {/* Trade Result Dialog */}
      {showTradeResult && tradeResult && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div
            className={`rounded-xl shadow-2xl border-2 p-8 max-w-md w-full mx-4 ${
              tradeResult.accepted
                ? "bg-gradient-to-br from-green-900 to-green-800 border-green-500"
                : "bg-gradient-to-br from-red-900 to-red-800 border-red-500"
            }`}
          >
            <div className="text-center">
              {tradeResult.accepted ? (
                <>
                  <div className="w-20 h-20 bg-green-600 rounded-full flex items-center justify-center mx-auto mb-4 border-4 border-green-400">
                    <Check className="w-12 h-12 text-white" />
                  </div>
                  <h2 className="text-3xl font-black text-white mb-2">
                    Trade Accepted!
                  </h2>
                  <p className="text-green-200 text-lg mb-4">
                    {tradeResult.message}
                  </p>
                  {tradeResult.score !== undefined && (
                    <div className="bg-green-800/50 rounded-lg p-4 border border-green-600 mb-4">
                      <div className="text-sm text-green-200 uppercase tracking-wider mb-1">
                        Evaluation Score
                      </div>
                      <div className="text-4xl font-black text-white">
                        {tradeResult.score.toFixed(0)}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="w-20 h-20 bg-red-600 rounded-full flex items-center justify-center mx-auto mb-4 border-4 border-red-400">
                    <XCircle className="w-12 h-12 text-white" />
                  </div>
                  <h2 className="text-3xl font-black text-white mb-2">
                    Trade Declined
                  </h2>
                  <p className="text-red-200 text-lg mb-4">
                    {tradeResult.message}
                  </p>
                  {tradeResult.score !== undefined && (
                    <div className="bg-red-800/50 rounded-lg p-4 border border-red-600 mb-4">
                      <div className="text-sm text-red-200 uppercase tracking-wider mb-1">
                        Evaluation Score
                      </div>
                      <div className="text-4xl font-black text-white">
                        {tradeResult.score.toFixed(0)}
                      </div>
                    </div>
                  )}
                </>
              )}
              <button
                onClick={() => {
                  setShowTradeResult(false);
                  setTradeResult(null);
                }}
                className={`w-full px-6 py-3 rounded-lg font-bold text-lg transition-all ${
                  tradeResult.accepted
                    ? "bg-green-600 hover:bg-green-700 text-white"
                    : "bg-red-600 hover:bg-red-700 text-white"
                }`}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TradeHistoryTab() {
  const { currentSeason, selectedTeamId, saveGameId } = useGameStore();
  const [trades, setTrades] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted && selectedTeamId) {
      loadTrades();
    }
  }, [mounted, selectedTeamId, currentSeason, saveGameId]);

  async function loadTrades() {
    setLoading(true);
    try {
      const url = saveGameId
        ? `/api/trades/list?teamId=${selectedTeamId}&season=${currentSeason}&saveGameId=${saveGameId}`
        : `/api/trades/list?teamId=${selectedTeamId}&season=${currentSeason}`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.success) {
        setTrades(
          (data.trades || []).filter(
            (t: any) => t.status === "executed" || t.status === "rejected"
          )
        );
      }
    } catch (err) {
      console.error("Error loading trades:", err);
    } finally {
      setLoading(false);
    }
  }

  if (!mounted) {
    return (
      <div className="bg-slate-800 rounded-xl shadow-lg p-8">Loading...</div>
    );
  }

  if (!selectedTeamId) {
    return (
      <div className="bg-slate-800 rounded-xl shadow-lg border border-slate-700 p-8 text-center">
        <p className="text-slate-400">
          Please select a team to view trade history
        </p>
      </div>
    );
  }

  return (
    <div className="bg-slate-800 rounded-xl shadow-2xl border border-slate-700 p-6">
      <h2 className="text-2xl font-black text-white mb-6">Trade History</h2>
      {loading ? (
        <p className="text-slate-400">Loading trades...</p>
      ) : trades.length === 0 ? (
        <p className="text-slate-400 text-center py-12">No trade history</p>
      ) : (
        <div className="space-y-4">
          {trades.map((trade) => {
            const otherTeam =
              trade.from_team_id === selectedTeamId
                ? trade.to_team
                : trade.from_team;
            const isFromTeam = trade.from_team_id === selectedTeamId;

            return (
              <div
                key={trade.id}
                className={`border-2 rounded-xl p-6 ${
                  trade.status === "executed"
                    ? "border-green-600 bg-green-900/20"
                    : "border-red-600 bg-red-900/20"
                }`}
              >
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <div className="font-bold text-white text-lg">
                      {trade.status === "executed" ? "Executed" : "Rejected"}{" "}
                      with {otherTeam?.abbreviation || otherTeam?.name}
                    </div>
                    <div className="text-sm text-slate-400">
                      Week {trade.week} •{" "}
                      {new Date(trade.proposed_at).toLocaleDateString()}
                    </div>
                  </div>
                  <span
                    className={`px-4 py-2 rounded-lg text-xs font-bold ${
                      trade.status === "executed"
                        ? "bg-green-600 text-white"
                        : "bg-red-600 text-white"
                    }`}
                  >
                    {trade.status.toUpperCase()}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-xs font-bold text-slate-400 uppercase mb-2">
                      {isFromTeam ? "Gave" : "Received"}
                    </div>
                    <div className="space-y-2">
                      {trade.trade_items
                        .filter((item: any) =>
                          isFromTeam
                            ? item.from_team_id === trade.from_team_id
                            : item.from_team_id === trade.to_team_id
                        )
                        .map((item: any) => (
                          <div
                            key={item.id}
                            className="p-3 bg-slate-700 rounded-lg text-sm text-white border border-slate-600"
                          >
                            {item.item_type === "player" && item.player && (
                              <div>
                                {item.player.full_name} ({item.player.position})
                              </div>
                            )}
                            {item.item_type === "draft_pick" &&
                              item.draft_pick && (
                                <div>
                                  {item.draft_pick.season} Round{" "}
                                  {item.draft_pick.round} • Pick #
                                  {item.draft_pick.pick_overall}
                                </div>
                              )}
                          </div>
                        ))}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs font-bold text-slate-400 uppercase mb-2">
                      {isFromTeam ? "Received" : "Gave"}
                    </div>
                    <div className="space-y-2">
                      {trade.trade_items
                        .filter((item: any) =>
                          isFromTeam
                            ? item.from_team_id === trade.to_team_id
                            : item.from_team_id === trade.from_team_id
                        )
                        .map((item: any) => (
                          <div
                            key={item.id}
                            className="p-3 bg-slate-700 rounded-lg text-sm text-white border border-slate-600"
                          >
                            {item.item_type === "player" && item.player && (
                              <div>
                                {item.player.full_name} ({item.player.position})
                              </div>
                            )}
                            {item.item_type === "draft_pick" &&
                              item.draft_pick && (
                                <div>
                                  {item.draft_pick.season} Round{" "}
                                  {item.draft_pick.round} • Pick #
                                  {item.draft_pick.pick_overall}
                                </div>
                              )}
                          </div>
                        ))}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
