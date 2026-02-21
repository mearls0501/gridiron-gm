"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase-client";
import { useGameStore } from "@/lib/store/game-store";
import {
  Users,
  AlertCircle,
  CheckCircle,
  ArrowRight,
  Target,
} from "lucide-react";
import Link from "next/link";
import ScoutHiring from "@/app/components/ScoutHiring";
import PriorityAssignment from "@/app/components/PriorityAssignment";

interface SeasonData {
  year: number;
  phase: string;
  current_week: number;
}

export default function PreseasonPage() {
  const {
    saveGameId,
    currentSeason,
    seasonPhase,
    currentWeek,
    selectedTeamId,
  } = useGameStore();
  const [season, setSeason] = useState<SeasonData | null>(null);
  const [loading, setLoading] = useState(true);
  const [hiringComplete, setHiringComplete] = useState(false);
  const [prioritiesSet, setPrioritiesSet] = useState(false);
  const [cpuStaffingTriggered, setCpuStaffingTriggered] = useState(false);
  const [cpuStaffingInProgress, setCpuStaffingInProgress] = useState(false);

  const triggerCPUStaffing = useCallback(async () => {
    if (!selectedTeamId || !saveGameId || !currentSeason) {
      return;
    }

    setCpuStaffingInProgress(true);
    try {
      const response = await fetch("/api/scouting/complete-hiring", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamId: selectedTeamId,
          saveGameId,
          season: currentSeason,
        }),
      });

      const data = await response.json();
      if (data.success) {
        console.log(
          `✅ CPU auto-staffing complete: ${data.staffedTeams} teams staffed`
        );
        setCpuStaffingTriggered(true);
      } else {
        console.error("❌ CPU auto-staffing failed:", data.error);
        // Don't mark as triggered so it can retry
      }
    } catch (error) {
      console.error("Error triggering CPU staffing:", error);
      // Don't mark as triggered so it can retry
    } finally {
      setCpuStaffingInProgress(false);
    }
  }, [selectedTeamId, saveGameId, currentSeason]);

  const loadPreseasonData = useCallback(async () => {
    try {
      setLoading(true);

      // Get active season for this save game
      let seasonQuery = supabase
        .from("seasons")
        .select("*")
        .eq("is_active", true);

      if (saveGameId) {
        seasonQuery = seasonQuery.eq("save_game_id", saveGameId);
      } else {
        seasonQuery = seasonQuery.is("save_game_id", null);
      }

      const { data: seasonData } = await seasonQuery.single();
      setSeason(seasonData);

      // Check if hiring is complete
      const selectedTeamId = useGameStore.getState().selectedTeamId;
      if (selectedTeamId && saveGameId) {
        // Get all contracts with scout archetypes
        const { data: contracts } = await supabase
          .from("scout_contracts")
          .select("scout_id, role")
          .eq("team_id", selectedTeamId)
          .eq("save_game_id", saveGameId);

        // Need exactly 4 scouts (one of each archetype)
        const archetypes = [
          "evaluator",
          "tape_grinder",
          "character_coach",
          "athletic_analyst",
        ];
        if (contracts && contracts.length >= 4) {
          // Check if we have all archetypes - use the role field from contracts
          const hiredArchetypes = new Set(
            contracts.map((c) => c.role).filter(Boolean)
          );
          const hasAllArchetypes = archetypes.every((arch) =>
            hiredArchetypes.has(arch)
          );
          setHiringComplete(hasAllArchetypes);

          // Debug logging
          if (hasAllArchetypes) {
            console.log("✅ Hiring complete!", {
              contracts: contracts.length,
              archetypes: Array.from(hiredArchetypes),
            });
          } else {
            console.log("⚠️ Missing archetypes:", {
              contracts: contracts.length,
              hired: Array.from(hiredArchetypes),
              needed: archetypes.filter((a) => !hiredArchetypes.has(a)),
            });
          }
        } else {
          setHiringComplete(false);
        }

        // Check if priorities are set
        const { data: priorities } = await supabase
          .from("scout_priority")
          .select("id")
          .eq("team_id", selectedTeamId)
          .eq("save_game_id", saveGameId);

        setPrioritiesSet((priorities?.length || 0) >= 4);
      } else {
        setHiringComplete(false);
        setPrioritiesSet(false);
      }
    } catch (err) {
      console.error("Error loading preseason data:", err);
    } finally {
      setLoading(false);
    }
  }, [saveGameId]);

  useEffect(() => {
    loadPreseasonData();
  }, [loadPreseasonData]);

  // Note: CPU staffing is now manual-only via the button
  // Removed automatic trigger to give user control

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-gray-50 to-slate-100">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="bg-white rounded-xl shadow-lg p-8">
            <p className="text-gray-600">Loading preseason...</p>
          </div>
        </div>
      </div>
    );
  }

  // Check if we're actually in preseason
  const isPreseason = seasonPhase === "preseason" || currentWeek === 0;

  if (!isPreseason && season?.phase !== "preseason") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-gray-50 to-slate-100">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="bg-white rounded-xl shadow-lg p-8">
            <div className="text-center">
              <AlertCircle className="w-16 h-16 text-orange-500 mx-auto mb-4" />
              <h2 className="text-2xl font-bold text-gray-900 mb-2">
                Not in Preseason
              </h2>
              <p className="text-gray-600 mb-4">
                Current phase: <strong>{season?.phase || "Unknown"}</strong>{" "}
                (Week {season?.current_week || currentWeek})
              </p>
              <Link
                href="/"
                className="inline-block px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Go to Home
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Check if required data is available
  if (!selectedTeamId) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-gray-50 to-slate-100">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="bg-white rounded-xl shadow-lg p-8">
            <div className="text-center">
              <AlertCircle className="w-16 h-16 text-orange-500 mx-auto mb-4" />
              <h2 className="text-2xl font-bold text-gray-900 mb-2">
                No Team Selected
              </h2>
              <p className="text-gray-600 mb-4">
                Please select a team before accessing the preseason page.
              </p>
              <Link
                href="/teams/my-team"
                className="inline-block px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Go to My Team
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!saveGameId) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-gray-50 to-slate-100">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="bg-white rounded-xl shadow-lg p-8">
            <div className="text-center">
              <AlertCircle className="w-16 h-16 text-orange-500 mx-auto mb-4" />
              <h2 className="text-2xl font-bold text-gray-900 mb-2">
                No Save Game Loaded
              </h2>
              <p className="text-gray-600 mb-4">
                Please save your game first to access the preseason page.
              </p>
              <button
                onClick={() => {
                  // Trigger save manager
                  const event = new CustomEvent("openSaveManager");
                  window.dispatchEvent(event);
                }}
                className="inline-block px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Save Game
              </button>
            </div>
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
          <div className="bg-gradient-to-r from-blue-900 via-blue-800 to-blue-900 px-8 py-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-black text-white tracking-tight mb-2">
                  {season?.year || currentSeason} Preseason
                </h1>
                <p className="text-slate-300">
                  Week {season?.current_week || currentWeek} - Prepare for the
                  season
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Preseason Checklist */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <Target className="w-6 h-6 text-blue-600" />
              Preseason Checklist
            </h2>
            <button
              onClick={loadPreseasonData}
              className="px-3 py-1.5 text-sm bg-blue-50 text-blue-600 rounded hover:bg-blue-100 transition-colors"
            >
              Refresh Status
            </button>
          </div>
          <div className="space-y-3">
            <div
              className={`flex items-center justify-between p-3 rounded-lg border ${
                hiringComplete
                  ? "bg-green-50 border-green-200"
                  : "bg-gray-50 border-gray-200"
              }`}
            >
              <div className="flex items-center gap-3">
                {hiringComplete ? (
                  <CheckCircle className="w-5 h-5 text-green-600" />
                ) : (
                  <AlertCircle className="w-5 h-5 text-orange-500" />
                )}
                <span
                  className={
                    hiringComplete
                      ? "text-gray-700"
                      : "text-gray-900 font-medium"
                  }
                >
                  Hire Scouting Staff (4 scouts required - one of each
                  archetype)
                </span>
              </div>
              <div className="flex items-center gap-2">
                {hiringComplete && !cpuStaffingTriggered && (
                  <button
                    onClick={triggerCPUStaffing}
                    disabled={cpuStaffingInProgress}
                    className="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {cpuStaffingInProgress
                      ? "Staffing CPU..."
                      : "Staff CPU Teams"}
                  </button>
                )}
                {cpuStaffingTriggered && (
                  <span className="text-green-600 text-xs font-medium">
                    CPU Staffed ✓
                  </span>
                )}
                {!hiringComplete && (
                  <span className="text-orange-600 text-sm font-medium">
                    Required
                  </span>
                )}
              </div>
            </div>

            <div
              className={`flex items-center justify-between p-3 rounded-lg border ${
                prioritiesSet
                  ? "bg-green-50 border-green-200"
                  : hiringComplete
                    ? "bg-yellow-50 border-yellow-200"
                    : "bg-gray-50 border-gray-200 opacity-50"
              }`}
            >
              <div className="flex items-center gap-3">
                {prioritiesSet ? (
                  <CheckCircle className="w-5 h-5 text-green-600" />
                ) : (
                  <AlertCircle className="w-5 h-5 text-yellow-500" />
                )}
                <span
                  className={
                    prioritiesSet
                      ? "text-gray-700"
                      : "text-gray-900 font-medium"
                  }
                >
                  Assign Scout Priorities (Primary → Quaternary)
                </span>
              </div>
              {!prioritiesSet && hiringComplete && (
                <span className="text-yellow-600 text-sm font-medium">
                  Required
                </span>
              )}
              {!hiringComplete && (
                <span className="text-gray-400 text-sm">
                  Complete hiring first
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Scout Hiring Section */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-4 flex items-center gap-2">
            <Users className="w-6 h-6 text-blue-600" />
            Scouting Department
          </h2>
          <div className="mb-6">
            <p className="text-gray-600 mb-4">
              Build your scouting department by hiring one scout of each
              archetype. Each archetype has unique strengths that will help you
              evaluate draft prospects.
            </p>
            <ScoutHiring />
          </div>
        </div>

        {/* Priority Assignment Section */}
        {hiringComplete && (
          <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-4 flex items-center gap-2">
              <Target className="w-6 h-6 text-purple-600" />
              Scout Priority Assignment
            </h2>
            <div className="mb-6">
              <p className="text-gray-600 mb-4">
                Assign your scouts to priority levels. This determines how many
                scouting points they receive each week and affects their
                accuracy. Priorities are locked once the regular season begins.
              </p>
              <PriorityAssignment />
            </div>
          </div>
        )}

        {/* Ready to Start Season */}
        {hiringComplete && prioritiesSet && (
          <div className="bg-green-50 border-2 border-green-200 rounded-lg p-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold text-gray-900 mb-2 flex items-center gap-2">
                  <CheckCircle className="w-6 h-6 text-green-600" />
                  Ready for Regular Season!
                </h3>
                <p className="text-gray-700">
                  Your scouting department is fully set up. You can now advance
                  to the regular season and begin scouting draft prospects.
                </p>
              </div>
              <Link
                href="/draft"
                className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium flex items-center gap-2"
              >
                View Draft Prospects <ArrowRight className="w-5 h-5" />
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
