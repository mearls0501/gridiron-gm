"use client";

import { useState, useEffect } from "react";
import { useGameStore } from "@/lib/store/game-store";
import { supabase } from "@/lib/supabase-client";
import ScoutingDashboard from "@/app/components/ScoutingDashboard";
import { AlertCircle, CheckCircle, Target, Users } from "lucide-react";
import Link from "next/link";

interface ScoutingValidation {
  isValid: boolean;
  requirements: {
    minimumScouted: number;
    scoutedInRange: number;
    totalInRange: number;
    percentageScouted: number;
  };
  recommendations: string[];
}

interface DraftPick {
  id: string;
  pick_overall: number;
  round: number;
  pick_in_round: number;
  owning_team_id: string;
  selected_player_id: string | null;
  status: string;
  teams?: {
    name: string;
    abbreviation: string;
  };
}

export default function DraftPage() {
  const { currentSeason, currentWeek } = useGameStore();
  const isInSeason = currentWeek >= 1 && currentWeek <= 18;
  const [season, setSeason] = useState<number>(currentSeason);
  const [generating, setGenerating] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [scoutingValidation, setScoutingValidation] = useState<ScoutingValidation | null>(null);
  const [draftPicks, setDraftPicks] = useState<DraftPick[]>([]);
  const [currentPick, setCurrentPick] = useState<DraftPick | null>(null);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
    setSeason(currentSeason);
    loadDraftData();
    loadScoutingValidation();
  }, [currentSeason]);

  useEffect(() => {
    if (mounted) {
      loadDraftData();
      loadScoutingValidation();
    }
  }, [season, mounted]);

  async function loadDraftData() {
    try {
      // Get selected team
      let teamId: string | null = null;
      if (typeof window !== "undefined") {
        teamId = localStorage.getItem("selectedTeamId");
      }
      if (!teamId) {
        const { useGameStore } = await import("@/lib/store/game-store");
        teamId = useGameStore.getState().selectedTeamId;
      }
      setSelectedTeamId(teamId);

      // Get draft picks for next season (draft is for season + 1)
      const draftSeason = season + 1;
      const { data: picks, error: picksError } = await supabase
        .from("draft_picks")
        .select(`
          *,
          teams!draft_picks_owning_team_id_fkey (name, abbreviation)
        `)
        .eq("season", draftSeason)
        .order("pick_overall", { ascending: true });

      if (picksError) {
        console.error("Error loading draft picks:", picksError);
      } else {
        setDraftPicks(picks || []);
        // Find current pick (first unused pick)
        const unusedPick = picks?.find((p) => !p.selected_player_id && p.status !== "used");
        setCurrentPick(unusedPick || null);
      }
    } catch (err) {
      console.error("Error loading draft data:", err);
    }
  }

  async function loadScoutingValidation() {
    try {
      let teamId: string | null = null;
      if (typeof window !== "undefined") {
        teamId = localStorage.getItem("selectedTeamId");
      }
      if (!teamId) {
        const { useGameStore } = await import("@/lib/store/game-store");
        teamId = useGameStore.getState().selectedTeamId;
      }

      if (!teamId) return;

      const response = await fetch("/api/scouting/validate-complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamId, season: season + 1 }),
      });

      if (response.ok) {
        const data = await response.json();
        setScoutingValidation(data);
      }
    } catch (err) {
      console.error("Error loading scouting validation:", err);
    }
  }

  async function generateDraft() {
    setGenerating(true);
    setError("");
    setDownloadUrl("");
    setSuccess(false);

    try {
      const res = await fetch("/api/generate-draft-class", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ season }),
      });

      // Check if response is CSV (when Supabase is not configured)
      const contentType = res.headers.get("content-type");
      if (contentType?.includes("text/csv")) {
        // Download the CSV file directly
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `draft_${season}.csv`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        setDownloadUrl("");
        setSuccess(true);
      } else {
        // Handle JSON response (when Supabase is configured)
        const data = await res.json();

        if (!res.ok) {
          // Response was not OK, show detailed error
          const errorMsg =
            data.error || data.message || "Failed to generate draft class";
          console.error("Draft class generation error:", data);
          setError(
            `${errorMsg}${data.errors ? ` Errors: ${JSON.stringify(data.errors)}` : ""}`
          );
          setGenerating(false);
          return;
        }

        if (data.success) {
          setDownloadUrl(data.url);
          setSuccess(true);
          // Show success message with details
          if (data.insertedCount !== undefined || data.dbCount !== undefined) {
            console.log(`Draft class generated:`, {
              expected: data.prospectCount,
              inserted: data.insertedCount,
              inDatabase: data.dbCount,
            });
          }
          // Prospects will reload when ScoutingDashboard refreshes
        } else {
          // Partial success or warning
          const errorMsg =
            data.message || data.error || "Something went wrong.";
          console.warn("Draft class generation warning:", data);
          // Show detailed error information
          let detailedError = errorMsg;
          if (
            data.errors &&
            Array.isArray(data.errors) &&
            data.errors.length > 0
          ) {
            const errorDetails = data.errors
              .map(
                (
                  e:
                    | string
                    | {
                        batch: number;
                        error: string;
                        code?: string;
                        details?: string;
                      }
                ) => {
                  if (typeof e === "string") return e;
                  return `Batch ${e.batch}: ${e.error}${e.code ? ` (${e.code})` : ""}${e.details ? ` - ${e.details}` : ""}`;
                }
              )
              .join("\n");
            detailedError = `${errorMsg}\n\nError details:\n${errorDetails}`;
          }
          setError(detailedError);
          // Prospects will reload when ScoutingDashboard refreshes
        }
      }
    } catch (err) {
      console.error("Network error generating draft class:", err);
      setError(
        `Network error: ${err instanceof Error ? err.message : "Failed to generate draft class"}`
      );
    }

    setGenerating(false);
  }


  if (!mounted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-gray-50 to-slate-100">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="bg-white rounded-xl shadow-lg p-8">
            <p className="text-slate-500">Loading...</p>
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
            <h1 className="text-3xl font-black text-white tracking-tight mb-2">
              Draft Class
            </h1>
            <div className="flex items-center gap-4 mt-4">
              <div>
                <label className="text-xs text-slate-400 uppercase tracking-wider block mb-1">
                  Season
                </label>
                <input
                  type="number"
                  value={season}
                  onChange={(e) => setSeason(parseInt(e.target.value) || 2025)}
                  className="px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="ml-auto">
                <button
                  onClick={generateDraft}
                  disabled={generating}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {generating ? "Generating..." : "Generate Draft Class"}
                </button>
              </div>
            </div>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <p className="text-red-700 font-medium">{error}</p>
          </div>
        )}

        {success && downloadUrl && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6 flex items-center justify-between">
            <p className="text-green-700 font-medium">
              Draft class generated successfully!
            </p>
            <a
              href={downloadUrl}
              download
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 transition-colors text-sm"
            >
              Download CSV
            </a>
          </div>
        )}

        {/* Scouting Validation Status - Only show during offseason */}
        {!isInSeason && scoutingValidation && (
          <div
            className={`mb-6 p-4 rounded-lg border ${
              scoutingValidation.isValid
                ? "bg-green-50 border-green-200"
                : "bg-orange-50 border-orange-200"
            }`}
          >
            <div className="flex items-start gap-3">
              {scoutingValidation.isValid ? (
                <CheckCircle className="w-6 h-6 text-green-600 mt-0.5" />
              ) : (
                <AlertCircle className="w-6 h-6 text-orange-600 mt-0.5" />
              )}
              <div className="flex-1">
                <h3 className="font-bold text-gray-900 mb-1">
                  {scoutingValidation.isValid
                    ? "Scouting Complete - Ready for Draft"
                    : "Scouting Incomplete - Complete Scouting Before Drafting"}
                </h3>
                <p className="text-sm text-gray-700 mb-2">
                  {scoutingValidation.requirements.scoutedInRange} /{" "}
                  {scoutingValidation.requirements.totalInRange} prospects scouted (
                  {scoutingValidation.requirements.percentageScouted}%)
                </p>
                {!scoutingValidation.isValid && scoutingValidation.recommendations.length > 0 && (
                  <ul className="text-sm text-gray-600 list-disc list-inside">
                    {scoutingValidation.recommendations.map((rec, idx) => (
                      <li key={idx}>{rec}</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Draft Board - Only show during offseason */}
        {!isInSeason && draftPicks.length > 0 && (
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
              <Target className="w-6 h-6 text-purple-600" />
              Draft Board - {season + 1}
            </h2>
            {currentPick && (
              <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm text-gray-600 mb-1">Current Pick</p>
                <p className="font-bold text-gray-900">
                  Pick #{currentPick.pick_overall} - Round {currentPick.round}, Pick{" "}
                  {currentPick.pick_in_round} -{" "}
                  {currentPick.teams && !Array.isArray(currentPick.teams)
                    ? currentPick.teams.name
                    : Array.isArray(currentPick.teams) && currentPick.teams.length > 0
                      ? currentPick.teams[0].name
                      : "Unknown Team"}
                </p>
                {selectedTeamId === currentPick.owning_team_id && (
                  <p className="text-sm text-blue-600 mt-2">
                    It's your turn to pick! Select a prospect below.
                  </p>
                )}
              </div>
            )}
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Pick
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Round
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Team
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {draftPicks.slice(0, 32).map((pick) => {
                    const team =
                      pick.teams && !Array.isArray(pick.teams)
                        ? pick.teams
                        : Array.isArray(pick.teams) && pick.teams.length > 0
                          ? pick.teams[0]
                          : null;
                    const isUsed = pick.selected_player_id || pick.status === "used";
                    const isCurrent = pick.id === currentPick?.id;
                    return (
                      <tr
                        key={pick.id}
                        className={`${
                          isCurrent ? "bg-blue-50" : isUsed ? "bg-gray-50" : "hover:bg-gray-50"
                        }`}
                      >
                        <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                          #{pick.pick_overall}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                          {pick.round}.{pick.pick_in_round}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                          {team ? team.abbreviation || team.name : "Unknown"}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {isUsed ? (
                            <span className="px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">
                              Selected
                            </span>
                          ) : isCurrent ? (
                            <span className="px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800">
                              Current
                            </span>
                          ) : (
                            <span className="px-2 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-800">
                              Upcoming
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {draftPicks.length > 32 && (
              <p className="text-sm text-gray-600 mt-4 text-center">
                Showing first 32 picks. Total: {draftPicks.length} picks
              </p>
            )}
          </div>
        )}

        {/* Scouting Dashboard */}
        <ScoutingDashboard />
      </div>
    </div>
  );
}
