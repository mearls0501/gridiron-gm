"use client";

import { useState, useEffect, useMemo, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase-client";
import Link from "next/link";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { useDebounce } from "use-debounce";
import {
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  UserPlus,
  Filter,
  TrendingUp,
  DollarSign,
  Users,
  Award,
  ChevronRight,
  Loader2,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils/format";
import { useGameStore } from "@/lib/store/game-store";

// Position list for dropdown filter
const positions = [
  "All",
  "QB",
  "RB",
  "WR",
  "TE",
  "OL",
  "DL",
  "LB",
  "CB",
  "S",
  "K",
  "P",
];

interface FreeAgent {
  id: string;
  full_name: string;
  position: string;
  overall: number;
  potential: number;
  age: number;
  college: string;
  entered_free_agency_season?: number;
  is_prospect?: boolean;
}

interface PlayerPreference {
  preferred_annual_salary: number;
  preferred_contract_years: number;
  preferred_signing_bonus: number;
  min_acceptable_salary: number;
}

interface Bid {
  id: string;
  team: {
    id: string;
    name: string;
    abbreviation: string;
  };
  total_value: number;
  contract_year_1: number;
  contract_year_2: number;
  contract_year_3: number;
  contract_year_4: number;
  signing_bonus: number;
  is_cpu_bid: boolean;
  is_winning: boolean;
  was_outbid: boolean;
  stage: number;
}

interface PlayerBids {
  player: FreeAgent;
  bids: Bid[];
  highestBid: number;
  winningTeam: {
    id: string;
    name: string;
    abbreviation: string;
  } | null;
  totalBidders: number;
}

interface Team {
  id: string;
  name: string;
  abbreviation: string;
  salary_cap_total?: number;
}

interface TeamCapSpace {
  teamId: string;
  remainingCap: number;
  totalCap: number;
  currentCapHit: number;
}

interface BiddingStage {
  currentStage: number;
  status: "active" | "processing" | "completed";
  startedAt: string;
  completedAt: string | null;
}

// League minimum contract
const LEAGUE_MINIMUM = 750000;

function FreeAgentsPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { saveGameId, selectedTeamId, currentSeason, currentWeek, seasonPhase } = useGameStore();
  const [freeAgents, setFreeAgents] = useState<FreeAgent[]>([]);
  const [bidsByPlayer, setBidsByPlayer] = useState<Record<string, PlayerBids>>(
    {}
  );
  const [preferences, setPreferences] = useState<
    Record<string, PlayerPreference>
  >({});
  const [userTeam, setUserTeam] = useState<Team | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [userTeamCapSpace, setUserTeamCapSpace] =
    useState<TeamCapSpace | null>(null);
  const [biddingStage, setBiddingStage] = useState<BiddingStage | null>(null);
  const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null);
  const [bidAmount, setBidAmount] = useState<number>(LEAGUE_MINIMUM);
  const [contractYears, setContractYears] = useState<number>(1);
  const [submitting, setSubmitting] = useState(false);
  const [advancing, setAdvancing] = useState(false);

  const selectedPosition = searchParams.get("position") || "All";
  const search = searchParams.get("search") || "";
  const [debouncedSearch] = useDebounce(search, 300);

  // Determine if we're in the bidding phase (offseason week 24)
  const isBiddingPhase = seasonPhase === "offseason" && currentWeek === 24;
  
  // Debug logging
  useEffect(() => {
    console.log("[Free Agents] Phase check:", { seasonPhase, currentWeek, isBiddingPhase });
  }, [seasonPhase, currentWeek, isBiddingPhase]);

  useEffect(() => {
    if (selectedTeamId) {
      fetchUserTeam();
    }
    // Only fetch bidding data if in bidding phase
    if (isBiddingPhase) {
      fetchBiddingStage();
      fetchPreferences();
    }
    fetchFreeAgents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTeamId, isBiddingPhase]);

  useEffect(() => {
    fetchFreeAgents();
    // Only fetch preferences if in bidding phase
    if (isBiddingPhase) {
      fetchPreferences();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPosition, debouncedSearch, saveGameId, isBiddingPhase]);

  async function fetchUserTeam() {
    if (!selectedTeamId) {
      setError("No team selected. Please select a team from the My Team page.");
      return;
    }

    try {
      const { data: team, error: teamError } = await supabase
        .from("teams")
        .select("id, name, abbreviation, salary_cap_total")
        .eq("id", selectedTeamId)
        .single();

      if (teamError) {
        console.error("Error fetching user team:", teamError);
        setError("Failed to load your team information");
        return;
      }

      setUserTeam(team);

      const totalCap = team?.salary_cap_total ?? 255000000;

      let playersQuery = supabase
        .from("player_contracts_per_save_game")
        .select("contract_year_1")
        .eq("team_id", selectedTeamId);

      if (saveGameId) {
        playersQuery = playersQuery.eq("save_game_id", saveGameId);
      } else {
        playersQuery = playersQuery.is("save_game_id", null);
      }

      const { data: contracts } = await playersQuery;

      const currentCapHit = (contracts || []).reduce(
        (sum, p) => sum + (p.contract_year_1 || 0),
        0
      );

      const remainingCap = totalCap - currentCapHit;

      setUserTeamCapSpace({
        teamId: selectedTeamId,
        remainingCap,
        totalCap,
        currentCapHit,
      });
    } catch (err) {
      console.error("Error fetching user team:", err);
      setError("Failed to load team information");
    }
  }

  async function fetchBiddingStage() {
    if (!saveGameId || !currentSeason) return;

    try {
      const response = await fetch("/api/free-agency/get-stage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          saveGameId,
          season: currentSeason,
        }),
      });

      const data = await response.json();

      if (data.success && data.stage) {
        setBiddingStage(data.stage);
      }
    } catch (err) {
      console.error("Error fetching bidding stage:", err);
    }
  }

  async function fetchFreeAgents() {
    setLoading(true);
    setError(null);

    try {
      let freeAgentsData: any[] = [];

      if (saveGameId) {
        // Query free_agent_availability for both players and prospects
        let playerAvailabilityQuery = supabase
          .from("free_agent_availability")
          .select(`
            player_id,
            prospect_id,
            save_game_id,
            archived,
            entered_free_agency_season,
            players (
              id,
              full_name,
              position,
              overall,
              potential,
              age,
              college
            )
          `)
          .eq("save_game_id", saveGameId)
          .eq("archived", false)
          .not("player_id", "is", null);

        const { data: playerAvailabilityData } = await playerAvailabilityQuery;

        let prospectAvailabilityQuery = supabase
          .from("free_agent_availability")
          .select(`
            player_id,
            prospect_id,
            save_game_id,
            archived,
            entered_free_agency_season,
            draft_prospects (
              id,
              full_name,
              position,
              overall,
              potential,
              age,
              college
            )
          `)
          .eq("save_game_id", saveGameId)
          .eq("archived", false)
          .not("prospect_id", "is", null);

        const { data: prospectAvailabilityData } =
          await prospectAvailabilityQuery;

        const allAvailabilityData: any[] = [];

        if (playerAvailabilityData) {
          playerAvailabilityData.forEach((record: any) => {
            if (record.players) {
              allAvailabilityData.push({
                ...record.players,
                entered_free_agency_season: record.entered_free_agency_season,
                is_prospect: false,
              });
            }
          });
        }

        if (prospectAvailabilityData) {
          prospectAvailabilityData.forEach((record: any) => {
            if (record.draft_prospects) {
              allAvailabilityData.push({
                ...record.draft_prospects,
                entered_free_agency_season: record.entered_free_agency_season,
                is_prospect: true,
              });
            }
          });
        }

        if (allAvailabilityData.length === 0) {
          let fallbackQuery = supabase
            .from("players")
            .select(`
              id,
              full_name,
              position,
              overall,
              potential,
              age,
              college
            `)
            .eq("is_free_agent", true)
            .order("overall", { ascending: false });

          const { data: fallbackData } = await fallbackQuery;

          freeAgentsData = (fallbackData || []).map((fa) => ({
            ...fa,
            entered_free_agency_season: 2025,
          }));
        } else {
          freeAgentsData = allAvailabilityData;
        }
      } else {
        let query = supabase
          .from("players")
          .select(`
            id,
            full_name,
            position,
            overall,
            potential,
            age,
            college
          `)
          .eq("is_free_agent", true)
          .order("overall", { ascending: false });

        if (selectedPosition !== "All") {
          if (selectedPosition === "OL") {
            query = query.in("position", ["OT", "OG", "C"]);
          } else if (selectedPosition === "DL") {
            query = query.in("position", ["DE", "DT"]);
          } else {
            query = query.eq("position", selectedPosition);
          }
        }

        if (debouncedSearch) {
          query = query.ilike("full_name", `%${debouncedSearch}%`);
        }

        const { data: baseData } = await query;
        freeAgentsData = (baseData || []).map((fa) => ({
          ...fa,
          entered_free_agency_season: 2025,
        }));
      }

      if (saveGameId && freeAgentsData.length > 0) {
        if (selectedPosition !== "All") {
          if (selectedPosition === "OL") {
            freeAgentsData = freeAgentsData.filter((fa) =>
              ["OT", "OG", "C"].includes(fa.position)
            );
          } else if (selectedPosition === "DL") {
            freeAgentsData = freeAgentsData.filter((fa) =>
              ["DE", "DT"].includes(fa.position)
            );
          } else {
            freeAgentsData = freeAgentsData.filter(
              (fa) => fa.position === selectedPosition
            );
          }
        }

        if (debouncedSearch) {
          freeAgentsData = freeAgentsData.filter((fa) =>
            fa.full_name.toLowerCase().includes(debouncedSearch.toLowerCase())
          );
        }
      }

      freeAgentsData.sort((a, b) => (b.overall || 0) - (a.overall || 0));

      setFreeAgents(freeAgentsData);

      // Fetch bids if bidding stage exists
      if (biddingStage && currentSeason) {
        await fetchBids();
      }
    } catch (err) {
      console.error("[FreeAgents] Error in fetchFreeAgents:", err);
      setError(
        err instanceof Error ? err.message : "Failed to load free agents"
      );
    } finally {
      setLoading(false);
    }
  }

  async function fetchBids() {
    if (!saveGameId || !currentSeason || !biddingStage) return;

    try {
      const response = await fetch("/api/free-agency/get-bids", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          saveGameId,
          season: currentSeason,
          stage: biddingStage.currentStage,
        }),
      });

      const data = await response.json();

      if (data.success) {
        setBidsByPlayer(data.bidsByPlayer || {});
      }
    } catch (err) {
      console.error("Error fetching bids:", err);
    }
  }

  async function fetchPreferences() {
    if (!saveGameId || !currentSeason) return;

    try {
      const { data, error } = await supabase
        .from("free_agency_player_preferences")
        .select("*")
        .eq("save_game_id", saveGameId)
        .eq("season", currentSeason);

      if (error) {
        // Table might not exist yet - just log and continue
        console.warn("Preferences table not ready:", error.message || "Unknown error");
        // Try to generate preferences anyway
        if (freeAgents.length > 0) {
          try {
            await fetch("/api/free-agency/generate-preferences", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                saveGameId,
                season: currentSeason,
              }),
            });
          } catch (genErr) {
            console.warn("Could not generate preferences:", genErr);
          }
        }
        return;
      }

      // If no preferences exist and we have free agents, generate them
      if ((!data || data.length === 0) && freeAgents.length > 0) {
        console.log("No preferences found, generating...");
        try {
          const response = await fetch("/api/free-agency/generate-preferences", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              saveGameId,
              season: currentSeason,
            }),
          });

          if (response.ok) {
            // Fetch again after generating
            const { data: newData } = await supabase
              .from("free_agency_player_preferences")
              .select("*")
              .eq("save_game_id", saveGameId)
              .eq("season", currentSeason);

            if (newData) {
              const prefsMap: Record<string, PlayerPreference> = {};
              newData.forEach((pref: any) => {
                const key = pref.player_id || pref.prospect_id;
                prefsMap[key] = {
                  preferred_annual_salary: pref.preferred_annual_salary,
                  preferred_contract_years: pref.preferred_contract_years,
                  preferred_signing_bonus: pref.preferred_signing_bonus,
                  min_acceptable_salary: pref.min_acceptable_salary,
                };
              });
              setPreferences(prefsMap);
            }
          }
        } catch (genErr) {
          console.error("Error generating preferences:", genErr);
        }
        return;
      }

      const prefsMap: Record<string, PlayerPreference> = {};
      data?.forEach((pref: any) => {
        const key = pref.player_id || pref.prospect_id;
        prefsMap[key] = {
          preferred_annual_salary: pref.preferred_annual_salary,
          preferred_contract_years: pref.preferred_contract_years,
          preferred_signing_bonus: pref.preferred_signing_bonus,
          min_acceptable_salary: pref.min_acceptable_salary,
        };
      });

      setPreferences(prefsMap);
    } catch (err) {
      console.error("Error fetching preferences:", err);
    }
  }

  async function handleStartBidding() {
    if (!saveGameId || !currentSeason) return;

    try {
      setAdvancing(true);

      // First, ensure preferences are generated
      await fetch("/api/free-agency/generate-preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          saveGameId,
          season: currentSeason,
        }),
      });

      // Then start the bidding stage
      const response = await fetch("/api/free-agency/advance-stage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          saveGameId,
          season: currentSeason,
        }),
      });

      const data = await response.json();

      if (data.success) {
        setSuccessMessage(data.message);
        await fetchBiddingStage();
        await fetchBids();
        await fetchPreferences();
        setTimeout(() => setSuccessMessage(null), 3000);
      } else {
        setError(data.error || "Failed to start bidding");
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to start bidding"
      );
    } finally {
      setAdvancing(false);
    }
  }

  async function handleAdvanceStage() {
    if (!saveGameId || !currentSeason) return;

    try {
      setAdvancing(true);
      const response = await fetch("/api/free-agency/advance-stage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          saveGameId,
          season: currentSeason,
        }),
      });

      const data = await response.json();

      if (data.success) {
        setSuccessMessage(data.message);
        await fetchBiddingStage();
        await fetchBids();
        await fetchPreferences();
        await fetchFreeAgents();
        setTimeout(() => setSuccessMessage(null), 3000);
      } else {
        setError(data.error || "Failed to advance stage");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to advance stage");
    } finally {
      setAdvancing(false);
    }
  }

  // Simple signing for non-bidding phase (preseason/regular season)
  async function handleSimpleSign(playerId: string, isProspect: boolean) {
    if (!selectedTeamId || !saveGameId || !currentSeason) {
      setError("Missing required data to sign player");
      return;
    }

    if (!userTeamCapSpace || userTeamCapSpace.remainingCap < LEAGUE_MINIMUM) {
      setError("Insufficient cap space to sign player");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/sign-player", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          playerId: isProspect ? null : playerId,
          prospectId: isProspect ? playerId : null,
          teamId: selectedTeamId,
          saveGameId,
          season: currentSeason,
          week: currentWeek,
          contractYears: [LEAGUE_MINIMUM], // 1-year league minimum
          signingBonus: 0,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to sign player");
      }

      setSuccessMessage(data.message || "Player signed successfully!");
      await fetchFreeAgents();
      await fetchUserTeam();
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to sign player");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSubmitBid(playerId: string, isProspect: boolean) {
    if (!selectedTeamId || !saveGameId || !currentSeason || !biddingStage) {
      setError("Missing required data to submit bid");
      return;
    }

    // Validate bid amount
    const playerPref = preferences[playerId];
    if (playerPref) {
      const min = Math.floor(playerPref.preferred_annual_salary * 0.80);
      const max = Math.ceil(playerPref.preferred_annual_salary * 1.25);
      
      if (bidAmount < min) {
        setError(`Bid too low! Minimum offer: ${formatCurrency(min)}`);
        return;
      }
      if (bidAmount > max) {
        setError(`Bid too high! Maximum offer: ${formatCurrency(max)}`);
        return;
      }
    }

    if (bidAmount < LEAGUE_MINIMUM) {
      setError(`Bid must be at least league minimum: ${formatCurrency(LEAGUE_MINIMUM)}`);
      return;
    }

    setSubmitting(true);
    setError(null);
    setSuccessMessage(null);

    try {
      // Calculate contract years
      const year1 = bidAmount;
      const year2 = contractYears >= 2 ? Math.floor(bidAmount * 1.05) : 0;
      const year3 = contractYears >= 3 ? Math.floor(bidAmount * 1.1) : 0;
      const year4 = contractYears >= 4 ? Math.floor(bidAmount * 1.15) : 0;

      const response = await fetch("/api/free-agency/submit-bid", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          playerId: isProspect ? null : playerId,
          prospectId: isProspect ? playerId : null,
          teamId: selectedTeamId,
          saveGameId,
          season: currentSeason,
          stage: biddingStage.currentStage,
          contractYear1: year1,
          contractYear2: year2,
          contractYear3: year3,
          contractYear4: year4,
          signingBonus: 0,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to submit bid");
      }

      setSuccessMessage("Bid submitted successfully!");
      setSelectedPlayer(null);
      setBidAmount(LEAGUE_MINIMUM);
      setContractYears(1);

      await fetchBids();
      await fetchUserTeam();

      setTimeout(() => {
        setSuccessMessage(null);
      }, 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit bid");
    } finally {
      setSubmitting(false);
    }
  }

  function handlePositionChange(pos: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (pos === "All") {
      params.delete("position");
    } else {
      params.set("position", pos);
    }
    router.push(`/free-agents?${params.toString()}`);
  }

  function handleSearchChange(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set("search", value);
    } else {
      params.delete("search");
    }
    router.push(`/free-agents?${params.toString()}`);
    setGlobalFilter(value);
  }

  const filteredFreeAgents = useMemo(() => {
    if (!globalFilter) return freeAgents;
    const filter = globalFilter.toLowerCase();
    return freeAgents.filter(
      (fa) =>
        fa.full_name.toLowerCase().includes(filter) ||
        fa.position.toLowerCase().includes(filter) ||
        fa.college.toLowerCase().includes(filter)
    );
  }, [freeAgents, globalFilter]);

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto mt-12 p-6">
        <h1 className="text-4xl font-bold mb-6">Free Agency Bidding</h1>
        <p className="text-gray-600">Loading...</p>
      </div>
    );
  }

  if (error && !successMessage) {
    return (
      <div className="max-w-6xl mx-auto mt-12 p-6">
        <h1 className="text-4xl font-bold mb-6">Free Agency Bidding</h1>
        <div className="p-6 text-red-600">Error: {error}</div>
      </div>
    );
  }

  return (
    <div className="ootp-container">
      <div className="mb-8">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <UserPlus className="w-8 h-8 text-blue-600" />
            <h1 className="ootp-page-title">
              {isBiddingPhase ? "Free Agency Bidding" : "Free Agents"}
            </h1>
          </div>
          {isBiddingPhase && biddingStage && (
            <div className="flex items-center gap-4">
              <div className="text-right">
                <div className="text-sm text-gray-600">Bidding Stage</div>
                <div className="text-2xl font-bold text-blue-600">
                  {biddingStage.currentStage} / 4
                </div>
              </div>
            </div>
          )}
        </div>
        <p className="ootp-text-secondary">
          {isBiddingPhase 
            ? "Compete with other teams to sign top free agents"
            : "Sign available free agents to league minimum contracts"}
        </p>
      </div>

      {/* Success/Error Messages */}
      {successMessage && (
        <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg text-green-800">
          {successMessage}
        </div>
      )}
      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-800">
          {error}
        </div>
      )}

      {/* Cap Space Info */}
      {userTeamCapSpace && userTeam && (
        <div className="ootp-panel mb-6">
          <div className="ootp-panel-header">
            <div className="flex items-center gap-2">
              <DollarSign className="w-5 h-5" />
              <span>{userTeam.name} - Salary Cap</span>
            </div>
          </div>
          <div className="ootp-panel-body">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <div className="text-sm text-gray-600">Available Cap</div>
                <div className="text-xl font-bold text-green-600">
                  {formatCurrency(userTeamCapSpace.remainingCap)}
                </div>
              </div>
              <div>
                <div className="text-sm text-gray-600">Current Cap Hit</div>
                <div className="text-xl font-bold text-gray-900">
                  {formatCurrency(userTeamCapSpace.currentCapHit)}
                </div>
              </div>
              <div>
                <div className="text-sm text-gray-600">Total Cap</div>
                <div className="text-xl font-bold text-gray-900">
                  {formatCurrency(userTeamCapSpace.totalCap)}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Generate Preferences Button - Show if no preferences exist AND in bidding phase */}
      {isBiddingPhase &&
       biddingStage && 
       biddingStage.status === "active" && 
       freeAgents.length > 0 && 
       Object.keys(preferences).length === 0 && (
        <div className="ootp-panel mb-6">
          <div className="ootp-panel-body">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-blue-900 mb-1">
                  Player Preferences Not Generated
                </h3>
                <p className="text-sm text-blue-700">
                  Generate contract preferences to see what players are asking for
                </p>
              </div>
              <button
                onClick={async () => {
                  setAdvancing(true);
                  try {
                    const response = await fetch("/api/free-agency/generate-preferences", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        saveGameId,
                        season: currentSeason,
                      }),
                    });
                    const data = await response.json();
                    if (data.success) {
                      setSuccessMessage(`Generated preferences for ${data.preferencesCreated} players!`);
                      await fetchPreferences();
                      setTimeout(() => setSuccessMessage(null), 3000);
                    }
                  } catch (err) {
                    setError("Failed to generate preferences");
                  } finally {
                    setAdvancing(false);
                  }
                }}
                disabled={advancing}
                className="ootp-button ootp-button-primary whitespace-nowrap"
              >
                {advancing ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Generating...
                  </>
                ) : (
                  "Generate Player Preferences"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bidding Controls - Only show in offseason week 24 */}
      {isBiddingPhase && (
        <>
          {!biddingStage ? (
            <div className="ootp-panel mb-6">
              <div className="ootp-panel-body text-center py-8">
                <Users className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-xl font-bold mb-2">Free Agency Not Started</h3>
                <p className="text-gray-600 mb-4">
                  Start the bidding process to compete for free agents
                </p>
                <button
                  onClick={handleStartBidding}
                  disabled={advancing}
                  className="ootp-button ootp-button-primary"
                >
                  {advancing ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Starting...
                    </>
                  ) : (
                    "Start Free Agency Bidding"
                  )}
                </button>
              </div>
            </div>
          ) : biddingStage.status === "completed" ? (
            <div className="ootp-panel mb-6">
              <div className="ootp-panel-body text-center py-8">
                <Award className="w-12 h-12 text-green-600 mx-auto mb-4" />
                <h3 className="text-xl font-bold mb-2">
                  Free Agency Period Complete
                </h3>
                <p className="text-gray-600">
                  All bids have been resolved and players have been signed
                </p>
              </div>
            </div>
          ) : (
            <div className="ootp-panel mb-6">
              <div className="ootp-panel-header">
                <div className="flex items-center justify-between w-full">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="w-5 h-5" />
                    <span>Bidding Stage {biddingStage.currentStage} of 4</span>
                  </div>
                  <button
                    onClick={handleAdvanceStage}
                    disabled={advancing}
                    className="ootp-button ootp-button-primary text-sm"
                  >
                    {advancing ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Processing...
                      </>
                    ) : biddingStage.currentStage >= 4 ? (
                      "Finalize Free Agency"
                    ) : (
                      <>
                        Advance to Stage {biddingStage.currentStage + 1}
                        <ChevronRight className="w-4 h-4 ml-1" />
                      </>
                    )}
                  </button>
                </div>
              </div>
              <div className="ootp-panel-body">
                <div className="flex gap-2">
                  {[1, 2, 3, 4].map((stage) => (
                    <div
                      key={stage}
                      className={`flex-1 h-2 rounded-full transition-all ${
                        stage <= biddingStage.currentStage
                          ? "bg-blue-600"
                          : "bg-gray-200"
                      }`}
                    />
                  ))}
                </div>
                <div className="mt-4 text-sm text-gray-600 text-center">
                  {biddingStage.currentStage === 1 &&
                    "Initial bidding round - Place your bids"}
                  {biddingStage.currentStage === 2 &&
                    "Counter-bidding - Teams are increasing their offers"}
                  {biddingStage.currentStage === 3 &&
                    "Final bidding - Last chance to secure players"}
                  {biddingStage.currentStage === 4 &&
                    "Resolution stage - Highest bids win"}
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Filters */}
      <div className="ootp-panel mb-6">
        <div className="ootp-panel-header">
          <div className="flex items-center gap-2">
            <Filter className="w-5 h-5" />
            <span>Filters</span>
          </div>
        </div>
        <div className="ootp-panel-body">
          <div className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-[150px]">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Position
              </label>
              <select
                value={selectedPosition}
                className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                onChange={(e) => handlePositionChange(e.target.value)}
              >
                {positions.map((pos) => (
                  <option key={pos} value={pos}>
                    {pos}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex-1 min-w-[250px]">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Search
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search by name..."
                  value={search}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg pl-10 pr-4 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Free Agents with Bidding */}
      {freeAgents.length === 0 ? (
        <div className="ootp-panel">
          <div className="ootp-panel-body">
            <div className="text-center py-12">
              <p className="ootp-text-muted text-lg">No free agents found</p>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredFreeAgents.map((agent) => {
            const playerBids = bidsByPlayer[agent.id];
            const playerPreference = preferences[agent.id];
            const myBid = playerBids?.bids.find(
              (b) => b.team.id === selectedTeamId
            );
            const topBids = playerBids?.bids
              .sort((a, b) => b.total_value - a.total_value)
              .slice(0, 4);

            return (
              <div key={agent.id} className="ootp-panel">
                <div className="ootp-panel-body">
                  <div className="flex items-start gap-6">
                    {/* Player Info */}
                    <div className="flex-1">
                      <Link
                        href={`/players/${agent.id}`}
                        className="text-2xl font-bold text-blue-600 hover:text-blue-800"
                      >
                        {agent.full_name}
                      </Link>
                      <div className="flex items-center gap-4 mt-2">
                        <span className="px-3 py-1 bg-gray-100 text-gray-700 rounded font-medium">
                          {agent.position}
                        </span>
                        <span className="text-sm text-gray-600">
                          OVR: <span className="font-bold">{agent.overall}</span>
                        </span>
                        <span className="text-sm text-gray-600">
                          POT: <span className="font-bold">{agent.potential}</span>
                        </span>
                        <span className="text-sm text-gray-600">
                          Age: {agent.age}
                        </span>
                        <span className="text-sm text-gray-600">
                          {agent.college}
                        </span>
                      </div>

                      {/* Player Contract Preferences */}
                      {playerPreference && (
                        <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                          <div className="flex items-center gap-2 mb-2">
                            <DollarSign className="w-4 h-4 text-blue-600" />
                            <span className="text-sm font-bold text-blue-900">
                              Player Asking Price
                            </span>
                          </div>
                          <div className="flex items-center gap-6 text-sm">
                            <div>
                              <span className="text-gray-600">Salary: </span>
                              <span className="font-bold text-gray-900">
                                {formatCurrency(
                                  playerPreference.preferred_annual_salary
                                )}/yr
                              </span>
                            </div>
                            <div>
                              <span className="text-gray-600">Length: </span>
                              <span className="font-bold text-gray-900">
                                {playerPreference.preferred_contract_years}{" "}
                                {playerPreference.preferred_contract_years === 1
                                  ? "year"
                                  : "years"}
                              </span>
                            </div>
                            <div>
                              <span className="text-gray-600">
                                Total Value:{" "}
                              </span>
                              <span className="font-bold text-blue-700">
                                {formatCurrency(
                                  playerPreference.preferred_annual_salary *
                                    playerPreference.preferred_contract_years +
                                    playerPreference.preferred_signing_bonus
                                )}
                              </span>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Bidding Information */}
                      {playerBids && topBids && topBids.length > 0 && (
                        <div className="mt-4">
                          <div className="text-sm font-medium text-gray-700 mb-2">
                            Top Bids ({playerBids.totalBidders} teams bidding)
                          </div>
                          <div className="space-y-2">
                            {topBids.map((bid, index) => {
                              const isMyBid = bid.team.id === selectedTeamId;
                              const percentage =
                                (bid.total_value / playerBids.highestBid) * 100;

                              return (
                                <div key={bid.id}>
                                  <div className="flex items-center justify-between text-sm mb-1">
                                    <span
                                      className={`font-medium ${
                                        isMyBid
                                          ? "text-blue-600"
                                          : "text-gray-700"
                                      }`}
                                    >
                                      {index + 1}. {bid.team.abbreviation}
                                      {isMyBid && " (You)"}
                                      {bid.is_winning && (
                                        <Award className="w-4 h-4 inline ml-1 text-yellow-600" />
                                      )}
                                    </span>
                                    <span className="font-bold">
                                      {formatCurrency(bid.total_value)}
                                    </span>
                                  </div>
                                  <div className="w-full bg-gray-200 rounded-full h-2">
                                    <div
                                      className={`h-2 rounded-full transition-all ${
                                        bid.is_winning
                                          ? "bg-green-600"
                                          : isMyBid
                                            ? "bg-blue-600"
                                            : "bg-gray-400"
                                      }`}
                                      style={{ width: `${percentage}%` }}
                                    />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* My Bid Status */}
                      {myBid && (
                        <div
                          className={`mt-3 p-2 rounded-lg ${
                            myBid.is_winning
                              ? "bg-green-50 border border-green-200"
                              : myBid.was_outbid
                                ? "bg-red-50 border border-red-200"
                                : "bg-blue-50 border border-blue-200"
                          }`}
                        >
                          <div className="text-sm font-medium">
                            {myBid.is_winning
                              ? "🏆 Your bid is winning!"
                              : myBid.was_outbid
                                ? "⚠️ You've been outbid!"
                                : "Your bid is active"}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Signing/Bidding Controls */}
                    {isBiddingPhase && biddingStage && biddingStage.status === "active" ? (
                      /* BIDDING MODE (Offseason Week 24) */
                      <div className="w-80">
                        {selectedPlayer === agent.id ? (
                          <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                            <h4 className="font-bold mb-3">Place Your Bid</h4>
                            <div className="space-y-3">
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                  Annual Salary (Year 1)
                                </label>
                                {playerPreference && (
                                  <div className="text-xs text-gray-500 mb-1">
                                    Player wants:{" "}
                                    {formatCurrency(
                                      playerPreference.preferred_annual_salary
                                    )}
                                    <span className="ml-2 text-gray-400">
                                      (Range: {formatCurrency(Math.floor(playerPreference.preferred_annual_salary * 0.80))} - {formatCurrency(Math.ceil(playerPreference.preferred_annual_salary * 1.25))})
                                    </span>
                                  </div>
                                )}
                                <div className="relative">
                                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-medium">
                                    $
                                  </span>
                                  <input
                                    type="text"
                                    value={bidAmount.toLocaleString()}
                                    onChange={(e) => {
                                      const numericValue = e.target.value.replace(/[^0-9]/g, '');
                                      const parsed = parseInt(numericValue || '0', 10);
                                      setBidAmount(parsed);
                                    }}
                                    onBlur={() => {
                                      // Enforce min/max on blur
                                      if (playerPreference) {
                                        const min = Math.floor(playerPreference.preferred_annual_salary * 0.80);
                                        const max = Math.ceil(playerPreference.preferred_annual_salary * 1.25);
                                        if (bidAmount < min) setBidAmount(min);
                                        if (bidAmount > max) setBidAmount(max);
                                      } else {
                                        if (bidAmount < LEAGUE_MINIMUM) setBidAmount(LEAGUE_MINIMUM);
                                      }
                                    }}
                                    placeholder="Enter salary"
                                    className="w-full border border-gray-300 rounded pl-7 pr-3 py-2 text-gray-900 font-medium"
                                  />
                                </div>
                                {bidAmount > 0 && (
                                  <div className="text-xs text-gray-500 mt-1">
                                    You're offering: {formatCurrency(bidAmount)}
                                  </div>
                                )}
                              </div>
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                  Contract Length
                                </label>
                                {playerPreference && (
                                  <div className="text-xs text-gray-500 mb-1">
                                    Player wants:{" "}
                                    {playerPreference.preferred_contract_years}{" "}
                                    {playerPreference.preferred_contract_years ===
                                    1
                                      ? "year"
                                      : "years"}
                                  </div>
                                )}
                                <select
                                  value={contractYears}
                                  onChange={(e) =>
                                    setContractYears(Number(e.target.value))
                                  }
                                  className="w-full border border-gray-300 rounded px-3 py-2 text-gray-900 font-medium"
                                >
                                  <option value={1}>1 Year</option>
                                  <option value={2}>2 Years</option>
                                  <option value={3}>3 Years</option>
                                  <option value={4}>4 Years</option>
                                </select>
                              </div>
                              <div className="text-sm text-gray-600">
                                Total Value:{" "}
                                <span className="font-bold">
                                  {formatCurrency(
                                    bidAmount *
                                      (contractYears === 1
                                        ? 1
                                        : contractYears === 2
                                          ? 2.05
                                          : contractYears === 3
                                            ? 3.15
                                            : 4.3)
                                  )}
                                </span>
                              </div>
                              <div className="flex gap-2">
                                <button
                                  onClick={() =>
                                    handleSubmitBid(
                                      agent.id,
                                      agent.is_prospect || false
                                    )
                                  }
                                  disabled={
                                    submitting ||
                                    bidAmount < LEAGUE_MINIMUM ||
                                    (userTeamCapSpace &&
                                      bidAmount > userTeamCapSpace.remainingCap) ||
                                    (playerPreference && (
                                      bidAmount < Math.floor(playerPreference.preferred_annual_salary * 0.80) ||
                                      bidAmount > Math.ceil(playerPreference.preferred_annual_salary * 1.25)
                                    ))
                                  }
                                  className="flex-1 ootp-button ootp-button-success disabled:opacity-50 disabled:cursor-not-allowed"
                                  title={
                                    bidAmount < LEAGUE_MINIMUM
                                      ? "Below league minimum"
                                      : userTeamCapSpace && bidAmount > userTeamCapSpace.remainingCap
                                        ? "Not enough cap space"
                                        : playerPreference && bidAmount < Math.floor(playerPreference.preferred_annual_salary * 0.80)
                                          ? "Bid too low for this player"
                                          : playerPreference && bidAmount > Math.ceil(playerPreference.preferred_annual_salary * 1.25)
                                            ? "Bid too high for this player"
                                            : "Submit your bid"
                                  }
                                >
                                  {submitting ? "Submitting..." : "Submit Bid"}
                                </button>
                                <button
                                  onClick={() => {
                                    setSelectedPlayer(null);
                                    setBidAmount(LEAGUE_MINIMUM);
                                    setContractYears(1);
                                  }}
                                  className="ootp-button ootp-button-secondary"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <button
                            onClick={() => {
                              setSelectedPlayer(agent.id);
                              // Set initial bid amount based on player preference or current highest bid
                              if (playerPreference) {
                                setBidAmount(
                                  playerPreference.preferred_annual_salary
                                );
                                setContractYears(
                                  playerPreference.preferred_contract_years
                                );
                              } else if (playerBids && playerBids.highestBid > 0) {
                                setBidAmount(
                                  Math.ceil(playerBids.highestBid * 1.1 / 100000) * 100000
                                );
                              } else {
                                setBidAmount(LEAGUE_MINIMUM);
                              }
                            }}
                            disabled={
                              !userTeamCapSpace ||
                              userTeamCapSpace.remainingCap < LEAGUE_MINIMUM
                            }
                            className="w-full ootp-button ootp-button-primary"
                          >
                            {myBid ? "Update Bid" : "Place Bid"}
                          </button>
                        )}
                      </div>
                    ) : (
                      /* SIMPLE SIGNING MODE (Preseason/Regular Season) */
                      <div className="w-80">
                        <button
                          onClick={() => handleSimpleSign(agent.id, agent.is_prospect || false)}
                          disabled={
                            submitting ||
                            !userTeamCapSpace ||
                            userTeamCapSpace.remainingCap < LEAGUE_MINIMUM
                          }
                          className="w-full ootp-button ootp-button-success disabled:opacity-50 disabled:cursor-not-allowed"
                          title={
                            !userTeamCapSpace || userTeamCapSpace.remainingCap < LEAGUE_MINIMUM
                              ? "Not enough cap space"
                              : "Sign to 1-year league minimum contract"
                          }
                        >
                          {submitting ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin inline mr-2" />
                              Signing...
                            </>
                          ) : (
                            <>
                              Sign Player
                              <span className="ml-2 text-xs opacity-80">
                                ({formatCurrency(LEAGUE_MINIMUM)})
                              </span>
                            </>
                          )}
                        </button>
                      </div>
                    )}
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

export default function FreeAgentsPage() {
  return (
    <Suspense
      fallback={
        <div className="ootp-container">
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-2">
              <UserPlus className="w-8 h-8 text-blue-600" />
              <h1 className="ootp-page-title">Free Agency Bidding</h1>
            </div>
            <p className="ootp-text-secondary">
              Compete with other teams to sign top free agents
            </p>
          </div>
          <div className="ootp-panel">
            <div className="ootp-panel-body">
              <div className="text-center py-12">
                <p className="ootp-text-muted">Loading...</p>
              </div>
            </div>
          </div>
        </div>
      }
    >
      <FreeAgentsPageContent />
    </Suspense>
  );
}
