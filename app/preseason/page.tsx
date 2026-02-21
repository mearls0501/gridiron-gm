"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase-client";
import { useGameStore } from "@/lib/store/game-store";
import { ChecklistItem, StageProgress } from "@/lib/progression/types";
import {
  Users,
  AlertCircle,
  CheckCircle,
  ArrowRight,
  Target,
  FileText,
  Play,
  Loader2,
  ListChecks,
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
    settings,
    setCurrentWeek,
    setCurrentSeason,
    setSeasonPhase,
  } = useGameStore();

  const [season, setSeason] = useState<SeasonData | null>(null);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState<StageProgress | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [generatingClass, setGeneratingClass] = useState(false);
  const [cpuStaffingInProgress, setCpuStaffingInProgress] = useState(false);
  const [advancing, setAdvancing] = useState(false);

  const loadPreseasonData = useCallback(async () => {
    if (!saveGameId || !selectedTeamId) {
      console.warn(
        "[Preseason] Cannot load data - missing saveGameId or selectedTeamId",
        {
          saveGameId,
          selectedTeamId,
        }
      );
      return;
    }

    try {
      setLoading(true);

      // Get active season
      let seasonQuery = supabase
        .from("seasons")
        .select("*")
        .eq("is_active", true);

      if (saveGameId) {
        seasonQuery = seasonQuery.eq("save_game_id", saveGameId);
      } else {
        seasonQuery = seasonQuery.is("save_game_id", null);
      }

      const { data: seasonData, error: seasonError } =
        await seasonQuery.maybeSingle();

      if (seasonError && seasonError.code !== "PGRST116") {
        // PGRST116 is "not found" which is handled by maybeSingle returning null
        console.error("[Preseason] Error loading season:", seasonError);
        alert(
          `Failed to load season data: ${seasonError.message || JSON.stringify(seasonError)}`
        );
        return;
      }

      if (!seasonData) {
        console.warn(
          "[Preseason] No active season found - attempting to get or create season"
        );
        // Try to get or create season using the season manager
        try {
          const { getOrCreateSeason } = await import(
            "@/lib/seasons/season-manager"
          );
          const seasonResult = await getOrCreateSeason(
            currentSeason,
            saveGameId || null,
            {
              phase: "preseason",
              currentWeek: 0,
              isActive: true,
            }
          );

          if (seasonResult.error || !seasonResult.season) {
            console.error(
              "[Preseason] Failed to create season:",
              seasonResult.error
            );
            alert(
              "No active season found and could not create one. Please contact support."
            );
            return;
          }

          console.log(
            "[Preseason] Created/retrieved season:",
            seasonResult.season
          );
          setSeason(seasonResult.season);
        } catch (createErr) {
          console.error("[Preseason] Exception creating season:", createErr);
          alert("Failed to load or create season. Please refresh the page.");
          return;
        }
      } else {
        console.log("[Preseason] Loaded season:", seasonData);
        setSeason(seasonData);

        // CRITICAL: Sync game store with database values to ensure consistency
        if (
          seasonData.year !== undefined &&
          seasonData.year !== currentSeason
        ) {
          console.log(
            `[Preseason] Syncing season from DB: ${currentSeason} -> ${seasonData.year}`
          );
          setCurrentSeason(seasonData.year);
        }

        if (
          seasonData.current_week !== undefined &&
          seasonData.current_week !== null &&
          seasonData.current_week !== currentWeek
        ) {
          console.log(
            `[Preseason] Syncing week from DB: ${currentWeek} -> ${seasonData.current_week}`
          );
          setCurrentWeek(seasonData.current_week);
        }

        if (seasonData.phase && seasonData.phase !== seasonPhase) {
          console.log(
            `[Preseason] Syncing phase from DB: ${seasonPhase} -> ${seasonData.phase}`
          );
          setSeasonPhase(seasonData.phase);
        }
      }

      // Get progress from API
      const response = await fetch("/api/progression/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamId: selectedTeamId,
          saveGameId,
          season: seasonData?.year || currentSeason,
          week: seasonData?.current_week || currentWeek,
          phase: "preseason",
          settings,
        }),
      });

      const data = await response.json();
      if (data.progress) {
        setProgress(data.progress);
      }
    } catch (err) {
      console.error("Error loading preseason data:", err);
    } finally {
      setLoading(false);
    }
  }, [saveGameId, selectedTeamId, currentSeason, currentWeek, settings]);

  useEffect(() => {
    loadPreseasonData();
  }, [loadPreseasonData]);

  const handleGenerateClass = async () => {
    if (!saveGameId || !season) return;

    setGeneratingClass(true);
    try {
      const response = await fetch("/api/generate-draft-class", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          season: season.year,
          saveGameId,
        }),
      });

      const data = await response.json();
      if (data.success) {
        await loadPreseasonData(); // Refresh progress
      } else {
        alert(`Failed to generate class: ${data.error}`);
      }
    } catch (error) {
      console.error("Error generating draft class:", error);
    } finally {
      setGeneratingClass(false);
    }
  };

  const triggerCPUStaffing = async () => {
    if (!selectedTeamId || !saveGameId || !season) return;

    setCpuStaffingInProgress(true);
    try {
      const response = await fetch("/api/scouting/complete-hiring", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamId: selectedTeamId,
          saveGameId,
          season: season.year,
        }),
      });

      const data = await response.json();
      if (data.success) {
        console.log(`✅ CPU auto-staffing complete`);
        // Refresh to update any CPU status indicators if we had them
      }
    } catch (error) {
      console.error("Error triggering CPU staffing:", error);
    } finally {
      setCpuStaffingInProgress(false);
    }
  };

  const handleAdvanceToSeason = async () => {
    console.log("[Preseason] handleAdvanceToSeason called", {
      saveGameId,
      season: season?.year,
      canAdvance: progress?.canAdvance,
      blockingReason: progress?.blockingReason,
    });

    if (!saveGameId) {
      console.error("[Preseason] Missing saveGameId", { saveGameId });
      alert("Missing save game. Please select a save game first.");
      return;
    }

    if (!season) {
      console.error("[Preseason] Missing season data", { season });
      alert(
        "Missing season data. Please wait for the page to finish loading, or refresh the page."
      );
      // Try to reload the season data
      console.log("[Preseason] Attempting to reload season data...");
      await loadPreseasonData();
      // Check again after reload
      if (!season) {
        alert("Still unable to load season data. Please refresh the page.");
        return;
      }
    }

    if (progress?.blockingReason) {
      console.warn("[Preseason] Blocked by:", progress.blockingReason);
      alert(`Cannot advance: ${progress.blockingReason}`);
      return;
    }

    if (!progress?.canAdvance) {
      console.warn("[Preseason] Cannot advance - progress.canAdvance is false");
      alert("Please complete all required tasks before advancing");
      return;
    }

    console.log("[Preseason] Starting advance to regular season...");
    setAdvancing(true);
    try {
      console.log("[Preseason] Calling /api/simulate-advance with:", {
        season: season.year,
        currentWeek: 0,
        advanceType: "regular_season",
        saveGameId,
      });

      const response = await fetch("/api/simulate-advance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          season: season.year,
          currentWeek: 0,
          advanceType: "regular_season",
          saveGameId,
        }),
      });

      console.log("[Preseason] Response status:", response.status, response.ok);

      if (!response.ok) {
        const errorData = await response
          .json()
          .catch(() => ({ error: "Unknown error" }));
        console.error("[Preseason] Response error:", errorData);
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      // Read stream properly handling SSE format
      const reader = response.body?.getReader();
      if (!reader) {
        console.error("[Preseason] No response stream reader available");
        throw new Error("No response stream");
      }

      console.log("[Preseason] Starting to read stream...");

      const decoder = new TextDecoder();
      let done = false;
      let buffer = "";
      let hasCompleted = false;

      while (!done && !hasCompleted) {
        const { value, done: streamDone } = await reader.read();
        done = streamDone;

        if (value) {
          const chunk = decoder.decode(value, { stream: true });
          buffer += chunk;
          console.log("[Preseason] Received chunk:", chunk.substring(0, 100));

          // Process complete SSE messages (lines ending with \n\n)
          const lines = buffer.split("\n\n");
          buffer = lines.pop() || ""; // Keep incomplete line in buffer

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              try {
                const jsonStr = line.substring(6); // Remove "data: " prefix
                const data = JSON.parse(jsonStr);
                console.log("[Preseason] Parsed SSE message:", data);

                if (data.type === "complete") {
                  hasCompleted = true;
                  console.log("[Preseason] ✅ Advance complete:", data);

                  // Update game store
                  setCurrentWeek(1);
                  setSeasonPhase("regular_season");

                  // Reload data to get updated season
                  await loadPreseasonData();

                  // Redirect to schedule
                  console.log("[Preseason] Redirecting to /league/schedule");
                  window.location.href = "/league/schedule";
                  return;
                } else if (data.type === "error") {
                  console.error("[Preseason] Error in stream:", data);
                  throw new Error(data.error || "Unknown error");
                }
              } catch (parseError) {
                console.warn(
                  "[Preseason] Failed to parse SSE message:",
                  line,
                  parseError
                );
              }
            }
          }
        }
      }

      // If we get here without completing, something went wrong
      if (!hasCompleted) {
        console.error(
          "[Preseason] Stream ended without completion message. Buffer:",
          buffer
        );
        throw new Error("Stream ended without completion message");
      }
    } catch (error) {
      console.error("[Preseason] Error advancing to season:", error);
      alert(
        `Failed to advance to regular season: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    } finally {
      setAdvancing(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-10 h-10 text-blue-600 animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Loading Preseason...</p>
        </div>
      </div>
    );
  }

  if (!selectedTeamId || !saveGameId) {
    return (
      <div className="p-8 text-center">
        <AlertCircle className="w-12 h-12 text-orange-500 mx-auto mb-4" />
        <h2 className="text-xl font-bold mb-2">Setup Required</h2>
        <p className="text-gray-600 mb-4">
          Please select a team and load a save game.
        </p>
        <p className="text-sm text-gray-500 mb-4">
          Current state: selectedTeamId={selectedTeamId ? "set" : "missing"},
          saveGameId={saveGameId ? "set" : "missing"}
        </p>
        <Link href="/" className="text-blue-600 hover:underline">
          Return Home
        </Link>
      </div>
    );
  }

  if (!season && !loading) {
    return (
      <div className="p-8 text-center">
        <AlertCircle className="w-12 h-12 text-orange-500 mx-auto mb-4" />
        <h2 className="text-xl font-bold mb-2">Season Not Found</h2>
        <p className="text-gray-600 mb-4">
          No active season found for this save game.
        </p>
        <button
          onClick={loadPreseasonData}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Retry Loading
        </button>
      </div>
    );
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case "locked":
        return (
          <div className="w-5 h-5 rounded-full border-2 border-gray-300" />
        ); // Empty circle
      case "pending":
        return <AlertCircle className="w-5 h-5 text-orange-500" />;
      default:
        return (
          <div className="w-5 h-5 rounded-full border-2 border-gray-300" />
        );
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 mb-6 overflow-hidden">
          <div className="bg-linear-to-r from-blue-900 via-blue-800 to-blue-900 px-8 py-8">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-black text-white tracking-tight mb-2">
                  {season?.year} Preseason
                </h1>
                <p className="text-blue-100 text-lg">
                  Complete the checklist below to prepare for the Regular Season
                </p>
              </div>
              <div className="bg-blue-950/50 backdrop-blur-sm rounded-lg px-6 py-4 border border-blue-500/30">
                <div className="text-sm text-blue-200 uppercase tracking-wider font-semibold mb-1">
                  Progress
                </div>
                <div className="text-3xl font-bold text-white">
                  {progress?.completionPercentage}%
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column: Checklist */}
          <div className="lg:col-span-1 space-y-6">
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
                <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                  <ListChecks className="w-5 h-5 text-blue-600" />
                  Checklist
                </h2>
                <span className="text-xs font-medium px-2 py-1 bg-slate-200 text-slate-600 rounded-full">
                  {
                    progress?.items.filter((i) => i.status === "completed")
                      .length
                  }{" "}
                  / {progress?.items.length}
                </span>
              </div>
              <div className="divide-y divide-slate-100">
                {progress?.items.map((item) => (
                  <div
                    key={item.id}
                    className={`p-4 hover:bg-slate-50 transition-colors ${item.status === "completed" ? "bg-slate-50/30" : ""}`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5">{getStatusIcon(item.status)}</div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-1">
                          <h3
                            className={`font-semibold ${item.status === "completed" ? "text-gray-700" : "text-gray-900"}`}
                          >
                            {item.label}
                          </h3>
                          {item.isRequired && item.status !== "completed" && (
                            <span className="text-[10px] font-bold uppercase tracking-wider text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded">
                              Required
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-500 mb-3 leading-relaxed">
                          {item.description}
                        </p>

                        {item.status !== "completed" &&
                          item.status !== "locked" && (
                            <div className="flex gap-2">
                              {item.id === "generate_prospects" ? (
                                <button
                                  onClick={handleGenerateClass}
                                  disabled={generatingClass}
                                  className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1.5"
                                >
                                  {generatingClass && (
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                  )}
                                  {item.actionLabel}
                                </button>
                              ) : item.id === "hire_staff" &&
                                !cpuStaffingInProgress ? (
                                <div className="flex gap-2">
                                  <Link
                                    href={item.actionUrl || "#"}
                                    className="text-xs bg-white border border-slate-300 text-slate-700 px-3 py-1.5 rounded font-medium hover:bg-slate-50"
                                  >
                                    {item.actionLabel}
                                  </Link>
                                  <button
                                    onClick={triggerCPUStaffing}
                                    className="text-xs text-blue-600 hover:text-blue-800 hover:underline px-2 py-1.5 font-medium"
                                  >
                                    Auto-fill CPU
                                  </button>
                                </div>
                              ) : item.id === "salary_cap" ? (
                                <div className="flex gap-2">
                                  <Link
                                    href={item.actionUrl || "#"}
                                    className="text-xs bg-white border border-red-300 text-red-700 px-3 py-1.5 rounded font-medium hover:bg-red-50"
                                  >
                                    Manage Contracts
                                  </Link>
                                  <button
                                    onClick={async () => {
                                      if (!selectedTeamId || !saveGameId)
                                        return;

                                      if (
                                        !confirm(
                                          "Auto-fix will cut your highest-paid, lowest-rated players until you're under the cap. Continue?"
                                        )
                                      ) {
                                        return;
                                      }

                                      try {
                                        const response = await fetch(
                                          "/api/salary-cap/auto-fix",
                                          {
                                            method: "POST",
                                            headers: {
                                              "Content-Type":
                                                "application/json",
                                            },
                                            body: JSON.stringify({
                                              teamId: selectedTeamId,
                                              saveGameId,
                                            }),
                                          }
                                        );

                                        const data = await response.json();
                                        if (data.success) {
                                          alert(data.message);
                                          await loadPreseasonData(); // Refresh
                                        } else {
                                          alert(
                                            `Failed to auto-fix: ${data.error}`
                                          );
                                        }
                                      } catch (error) {
                                        console.error(
                                          "Error auto-fixing cap:",
                                          error
                                        );
                                        alert("Failed to auto-fix salary cap");
                                      }
                                    }}
                                    className="text-xs bg-red-600 text-white px-3 py-1.5 rounded font-medium hover:bg-red-700"
                                  >
                                    Auto-Fix
                                  </button>
                                </div>
                              ) : (
                                <Link
                                  href={item.actionUrl || "#"}
                                  className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded font-medium hover:bg-blue-700 inline-flex items-center gap-1"
                                >
                                  {item.actionLabel}{" "}
                                  <ArrowRight className="w-3 h-3" />
                                </Link>
                              )}
                            </div>
                          )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="p-4 bg-slate-50 border-t border-slate-100">
                <button
                  onClick={(e) => {
                    console.log("[Preseason] Button clicked!", {
                      canAdvance: progress?.canAdvance,
                      advancing,
                      progress,
                    });
                    e.preventDefault();
                    handleAdvanceToSeason();
                  }}
                  disabled={!progress?.canAdvance || advancing}
                  className={`w-full py-3 px-4 rounded-lg font-bold text-white flex items-center justify-center gap-2 transition-all ${
                    progress?.canAdvance
                      ? "bg-green-600 hover:bg-green-700 shadow-md hover:shadow-lg"
                      : "bg-slate-300 cursor-not-allowed text-slate-500"
                  }`}
                >
                  {advancing ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Starting Season...
                    </>
                  ) : (
                    <>
                      <Play className="w-5 h-5 fill-current" />
                      Start Regular Season
                    </>
                  )}
                </button>
                {!progress?.canAdvance && (
                  <p className="text-xs text-center text-slate-500 mt-2">
                    Complete all required tasks to continue
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Right Column: Interactive Modules */}
          <div className="lg:col-span-2 space-y-6">
            {/* Dynamic Content based on what's pending */}
            {/* Show ScoutHiring even when completed so users can manage their scouts */}
            {(progress?.items.find((i) => i.id === "hire_staff")?.status ===
              "pending" ||
              progress?.items.find((i) => i.id === "hire_staff")?.status ===
                "completed") && (
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                    <Users className="w-6 h-6 text-blue-600" />
                    Scouting Department
                  </h2>
                  <Link
                    href="/scouts"
                    className="text-sm text-blue-600 hover:underline"
                  >
                    View All Scouts
                  </Link>
                </div>
                {progress?.items.find((i) => i.id === "hire_staff")?.status ===
                "pending" ? (
                  <p className="text-gray-600 mb-6">
                    You need to hire 4 scouts (one of each archetype) to
                    maximize your draft success.
                  </p>
                ) : (
                  <p className="text-gray-600 mb-6">
                    Manage your scouting department. You can fire scouts and
                    hire new ones.
                  </p>
                )}
                <ScoutHiring />
              </div>
            )}

            {progress?.items.find((i) => i.id === "assign_priorities")
              ?.status === "pending" &&
              progress?.items.find((i) => i.id === "hire_staff")?.status ===
                "completed" && (
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                      <Target className="w-6 h-6 text-purple-600" />
                      Scout Priorities
                    </h2>
                  </div>
                  <p className="text-gray-600 mb-6">
                    Assign priority levels to your scouts. This determines their
                    effectiveness and point generation.
                  </p>
                  <PriorityAssignment />
                </div>
              )}

            {progress?.canAdvance && (
              <div className="bg-linear-to-br from-green-50 to-emerald-50 rounded-xl border border-green-100 p-8 text-center">
                <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
                  <CheckCircle className="w-8 h-8" />
                </div>
                <h2 className="text-2xl font-bold text-green-900 mb-2">
                  All Systems Go!
                </h2>
                <p className="text-green-700 max-w-md mx-auto mb-6">
                  You have completed all preseason tasks. Your team is ready for
                  the regular season.
                </p>
                <button
                  onClick={handleAdvanceToSeason}
                  className="px-8 py-4 bg-green-600 text-white rounded-lg hover:bg-green-700 font-bold shadow-lg hover:shadow-xl transition-all transform hover:-translate-y-0.5"
                >
                  Start Regular Season
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
