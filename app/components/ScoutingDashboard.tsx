"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase-client";
import { useGameStore } from "@/lib/store/game-store";
import {
  EyeOff,
  TrendingUp,
  AlertTriangle,
  CheckCircle,
  Sparkles,
  AlertCircle,
  Target,
  BarChart3,
  FileText,
  Zap,
  Shield,
  Award,
  Clock,
  DollarSign,
  XCircle,
  X,
} from "lucide-react";

interface ScoutingReport {
  id: string;
  prospect_id: string;
  total_points_invested: number;
  scouting_progress: number;
  overall_min?: number;
  overall_max?: number;
  overall_estimate?: number;
  potential_min?: number;
  potential_max?: number;
  potential_estimate?: number;
  accuracy_percentage: number;
  confidence_level: "high" | "medium" | "low";
  traits_scouted: Record<string, any>; // Can be {low, high, estimate} or number or string
  athletic_bands?: Record<string, any>; // Can be {low, high} or "Elite"/"Good"/"Average"
  character_assessment?: Record<string, any>; // Can be {low, high}, {value, confidence}, or string
  injury_risk?: "low" | "medium" | "high";
  scheme_fit?: string;
  scout_notes?: string;
  methods_used?: string[];
  scouted_at: string;
  prospect?: {
    full_name: string;
    position: string;
    college: string | null;
  };
}

interface ScoutingResources {
  scouting_budget: number;
  // Note: scouting_points and points_regenerated_per_week are deprecated
  // Points are now tracked per-scout in scout_priority table
}

interface Prospect {
  id: string;
  full_name: string;
  position: string;
  college: string | null;
  age: number;
  overall: number;
  potential: number;
  season: number;
}

const scoutingMethods = [
  {
    value: "initial",
    label: "Initial Scouting",
    cost: 1,
    description: "Basic overview - OVR/POT bands, round projection",
    availableInSeason: true, // Available during regular season
  },
  {
    value: "game_tape",
    label: "Game Tape Review",
    cost: 3,
    description: "Film study - reveals traits, technique, scheme fit",
    availableInSeason: true, // Available during regular season
  },
  {
    value: "combine",
    label: "NFL Combine",
    cost: 5,
    description: "Athletic measurables (Athletic Analyst sees actual bands)",
    availableInSeason: false, // Offseason only
  },
  {
    value: "interview",
    label: "Team Interview",
    cost: 3,
    description: "Character assessment (Character Coach sees bust/boom risk)",
    availableInSeason: false, // Offseason only
  },
  {
    value: "medical",
    label: "Medical Evaluation",
    cost: 4,
    description: "Durability assessment (Character Coach gets reliable info)",
    availableInSeason: false, // Offseason only
  },
];

/**
 * Calculate projected draft round based on overall rating (public perception)
 */
function getProjectedRound(overall: number): number {
  // Round 1: 85-99 (top 32)
  if (overall >= 85) return 1;
  // Round 2: 80-84 (next 32)
  if (overall >= 80) return 2;
  // Round 3: 75-79 (next 32)
  if (overall >= 75) return 3;
  // Round 4: 70-74 (next 32)
  if (overall >= 70) return 4;
  // Round 5: 65-69 (next 32)
  if (overall >= 65) return 5;
  // Round 6: 60-64 (next 32)
  if (overall >= 60) return 6;
  // Round 7: 55-59 (next 32)
  if (overall >= 55) return 7;
  // Undrafted: <55
  return 8;
}

/**
 * Calculate projected round from scouted rating
 */
function getScoutedRound(scoutedOverall: number): number {
  return getProjectedRound(scoutedOverall);
}

/**
 * Determine if prospect is a gem, bust, or normal
 */
function getProspectType(
  projectedRound: number,
  scoutedOverall?: number
): "gem" | "bust" | "normal" | null {
  if (!scoutedOverall) return null;

  const scoutedRound = getScoutedRound(scoutedOverall);

  // Gem: Projected late (round 4+) but scouted as early (round 1-2)
  // Or projected round 3+ but scouted as round 1
  if (projectedRound >= 4 && scoutedRound <= 2) return "gem";
  if (projectedRound >= 3 && scoutedRound === 1) return "gem";

  // Bust: Projected early (round 1-2) but scouted as late (round 4+)
  // Or projected round 1 but scouted as round 3+
  if (projectedRound <= 2 && scoutedRound >= 4) return "bust";
  if (projectedRound === 1 && scoutedRound >= 3) return "bust";

  // Normal: Within 1 round of projection
  return "normal";
}

export default function ScoutingDashboard() {
  const { selectedTeamId, currentSeason, currentWeek, saveGameId } = useGameStore();
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [reports, setReports] = useState<ScoutingReport[]>([]);
  const [resources, setResources] = useState<ScoutingResources | null>(null);
  const [scouts, setScouts] = useState<Array<{
    id: string;
    name: string;
    archetype: string;
    priority: { level: number; weekly_points: number } | null;
    availablePoints?: number;
  }>>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProspect, setSelectedProspect] = useState<string | null>(null);
  // Determine if we're in offseason (after week 18 or before week 1)
  const isOffseason = currentWeek > 18 || currentWeek < 1;
  
  // Filter available scouting methods based on season timing
  const availableMethods = scoutingMethods.filter((method) => 
    method.availableInSeason || isOffseason
  );
  
  const [selectedMethod, setSelectedMethod] = useState<string>(
    availableMethods.length > 0 ? availableMethods[0].value : "initial"
  );
  const [scouting, setScouting] = useState(false);

  // Update selected method if current selection becomes unavailable
  useEffect(() => {
    const available = scoutingMethods.filter((method) => 
      method.availableInSeason || isOffseason
    );
    if (!available.some((m) => m.value === selectedMethod)) {
      if (available.length > 0) {
        setSelectedMethod(available[0].value);
      }
    }
  }, [isOffseason, selectedMethod]);
  const [filter, setFilter] = useState<
    "all" | "scouted" | "unscouted" | "gems" | "busts"
  >("all");
  const [sortBy, setSortBy] = useState<string>("overall");
  const [initializing, setInitializing] = useState(false);
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error" | "info";
  } | null>(null);
  const initializationAttempted = useRef(false); // Track if we've tried to initialize
  const initializationErrorShown = useRef(false); // Track if we've shown the error

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (selectedProspect) {
      // Save current scroll position
      const scrollY = window.scrollY;
      document.body.style.position = 'fixed';
      document.body.style.top = `-${scrollY}px`;
      document.body.style.width = '100%';
      document.body.style.overflow = 'hidden';
      
      return () => {
        // Restore scroll position when modal closes
        document.body.style.position = '';
        document.body.style.top = '';
        document.body.style.width = '';
        document.body.style.overflow = '';
        window.scrollTo(0, scrollY);
      };
    }
  }, [selectedProspect]);

  const initializeScouting = useCallback(async () => {
    if (!selectedTeamId || initializing || initializationAttempted.current) return;

    initializationAttempted.current = true;
    setInitializing(true);
    try {
      const res = await fetch("/api/scouting/initialize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamId: selectedTeamId, season: currentSeason, saveGameId }),
      });

      if (!res.ok) {
        const errorData = await res
          .json()
          .catch(() => ({ error: "Unknown error" }));
        const errorMessage = errorData.error || errorData.message || res.statusText || "Failed to initialize scouting";
        console.error(
          "Failed to initialize scouting:",
          errorMessage,
          errorData.details ? `\nDetails: ${errorData.details}` : ""
        );
        // Show error to user only once
        if (!initializationErrorShown.current) {
          initializationErrorShown.current = true;
          setToast({
            message: `Failed to initialize scouting: ${errorMessage}. Please check the console for details.`,
            type: "error",
          });
        }
        // Reset the attempt flag after a delay so user can retry manually
        setTimeout(() => {
          initializationAttempted.current = false;
        }, 5000);
        return;
      }

      const data = await res.json();
      if (data.success) {
        // Reload data after initialization
        const resourcesUrl = saveGameId
          ? `/api/scouting/resources?teamId=${selectedTeamId}&season=${currentSeason}&currentWeek=${currentWeek}&saveGameId=${saveGameId}`
          : `/api/scouting/resources?teamId=${selectedTeamId}&season=${currentSeason}&currentWeek=${currentWeek}`;
        const resourcesRes = await fetch(resourcesUrl);
        if (resourcesRes.ok) {
          const resourcesData = await resourcesRes.json();
          if (resourcesData.success) {
            setResources(resourcesData.resources);
          }
        }
        
        // Show appropriate message based on whether it was already initialized
        if (data.alreadyInitialized) {
          setToast({
            message: data.message || "Scouting is already initialized.",
            type: "info",
          });
        } else {
          setToast({
            message: data.message || "Scouting initialized successfully!",
            type: "success",
          });
        }
        
        // Reset flags on success
        initializationAttempted.current = false;
        initializationErrorShown.current = false;
      } else {
        console.error("Scouting initialization returned success: false", data);
        setToast({
          message: data.message || "Scouting initialization failed. Please try again.",
          type: "error",
        });
      }
    } catch (error) {
      console.error("Error initializing scouting:", error);
      if (!initializationErrorShown.current) {
        initializationErrorShown.current = true;
        setToast({
          message: `Error initializing scouting: ${error instanceof Error ? error.message : "Unknown error"}`,
          type: "error",
        });
      }
      // Reset the attempt flag after a delay
      setTimeout(() => {
        initializationAttempted.current = false;
      }, 5000);
    } finally {
      setInitializing(false);
    }
  }, [selectedTeamId, currentSeason, currentWeek]);

  const loadData = useCallback(async () => {
    if (!selectedTeamId) return;

    setLoading(true);
    try {
      // Load prospects
      // Draft prospects are for the current season's draft
      // Year 1 prospects are generated in Year 1 preseason and scouted throughout Year 1
      const draftSeason = currentSeason;
      
      let prospectsQuery = supabase
        .from("draft_prospects")
        .select("*");
      
      // Filter by save_game_id first (most important filter)
      if (saveGameId) {
        prospectsQuery = prospectsQuery.eq("save_game_id", saveGameId);
      } else {
        prospectsQuery = prospectsQuery.is("save_game_id", null);
      }
      
      // Filter by current season
      prospectsQuery = prospectsQuery.eq("season", draftSeason);
      
      const { data: prospectsData, error: prospectsError } = await prospectsQuery
        .order("overall", { ascending: false });

      if (prospectsError) {
        console.error("Error loading prospects:", prospectsError);
        console.error("Prospects query error details:", {
          message: prospectsError.message,
          code: prospectsError.code,
          details: prospectsError.details,
        });
        setProspects([]);
      } else {
        console.log(`Loaded ${prospectsData?.length || 0} prospects for season ${draftSeason} with saveGameId: ${saveGameId}`);
        if (prospectsData && prospectsData.length > 0) {
          // Log a sample to verify the data
          console.log("Sample prospect:", {
            id: prospectsData[0].id,
            name: prospectsData[0].full_name,
            season: prospectsData[0].season,
            save_game_id: prospectsData[0].save_game_id,
          });
        }
        setProspects(prospectsData || []);
      }

      // Load scouted prospects (new system)
      try {
        let scoutedQuery = supabase
          .from("scouted_prospects")
          .select("*")
          .eq("team_id", selectedTeamId);
        
        if (saveGameId) {
          scoutedQuery = scoutedQuery.eq("save_game_id", saveGameId);
        } else {
          scoutedQuery = scoutedQuery.is("save_game_id", null);
        }
        
        const { data: scoutedData, error: scoutedError } = await scoutedQuery;
        
        if (scoutedError) {
          console.error("Error loading scouted prospects:", scoutedError);
          setReports([]);
        } else {
          // Convert scouted_prospects to ScoutingReport format for compatibility
          const convertedReports = (scoutedData || []).map((sp: any) => ({
            id: sp.id,
            prospect_id: sp.prospect_id,
            overall_min: sp.est_overall_low,
            overall_max: sp.est_overall_high,
            overall_estimate: sp.est_overall_low && sp.est_overall_high 
              ? Math.round((sp.est_overall_low + sp.est_overall_high) / 2)
              : undefined,
            potential_min: sp.est_potential_low,
            potential_max: sp.est_potential_high,
            potential_estimate: sp.est_potential_low && sp.est_potential_high
              ? Math.round((sp.est_potential_low + sp.est_potential_high) / 2)
              : undefined,
            confidence_level: sp.confidence 
              ? (sp.confidence >= 70 ? "high" : sp.confidence >= 50 ? "medium" : "low")
              : "low",
            traits_scouted: sp.trait_reveals || {},
            athletic_bands: sp.athletic_bands || {},
            character_assessment: sp.psych_reveals || {},
            injury_risk: sp.psych_reveals?.durability 
              ? (sp.psych_reveals.durability.includes("High") ? "high" : sp.psych_reveals.durability.includes("Low") ? "low" : "medium")
              : undefined,
            scheme_fit: sp.scheme_fit,
            scouted_at: sp.created_at,
            updated_at: sp.updated_at,
            // Legacy fields for compatibility
            total_points_invested: 0,
            scouting_progress: sp.confidence || 0,
            accuracy_percentage: sp.confidence || 0,
          }));
          
          // Filter to only include reports for prospects we loaded
          const prospectIds = new Set((prospectsData || []).map((p: any) => p.id));
          const filteredReports = convertedReports.filter((r: any) => prospectIds.has(r.prospect_id));
          
          setReports(filteredReports);
        }
      } catch (reportsError) {
        console.error("Error fetching scouted prospects:", reportsError);
        setReports([]);
      }

      // Load resources
      try {
        const resourcesUrl = saveGameId
          ? `/api/scouting/resources?teamId=${selectedTeamId}&season=${currentSeason}&currentWeek=${currentWeek}&saveGameId=${saveGameId}`
          : `/api/scouting/resources?teamId=${selectedTeamId}&season=${currentSeason}&currentWeek=${currentWeek}`;
        const resourcesRes = await fetch(resourcesUrl);
        if (!resourcesRes.ok) {
          console.error("Failed to fetch resources:", resourcesRes.statusText);
          // Resources don't exist - set to null but don't auto-initialize
          // Auto-initialization will be handled by a separate effect
          setResources(null);
        } else {
          const resourcesData = await resourcesRes.json();
          if (resourcesData.success) {
            setResources(resourcesData.resources);
            // Reset attempt flags on successful load
            initializationAttempted.current = false;
            initializationErrorShown.current = false;
          } else {
            // Resources don't exist
            setResources(null);
          }
        }
      } catch (resourcesError) {
        console.error("Error fetching scouting resources:", resourcesError);
        setResources(null);
      }

      // Load scouts with priorities and weekly points (consolidated API call)
      if (saveGameId) {
        try {
          // Fetch team scouts with priorities and weekly points in a single API call
          const scoutsUrl = `/api/scouting/team-scouts?teamId=${selectedTeamId}&saveGameId=${saveGameId}&season=${currentSeason}&week=${currentWeek}&_t=${Date.now()}`;
          const scoutsRes = await fetch(scoutsUrl);
          if (scoutsRes.ok) {
            const scoutsData = await scoutsRes.json();
            if (scoutsData.success && scoutsData.scouts) {
              // Scouts already include availablePoints from the consolidated endpoint
              const scoutsWithPoints = scoutsData.scouts.map((scout: any) => {
                return {
                  id: scout.id,
                  name: scout.name,
                  archetype: scout.archetype,
                  priority: scout.priority,
                  availablePoints: scout.availablePoints || 0,
                };
              });

              console.log("✅ Setting scouts state:", scoutsWithPoints);
              setScouts(scoutsWithPoints);
            }
          }
        } catch (scoutsError) {
          console.error("Error fetching scouts:", scoutsError);
          setScouts([]);
        }
      }
    } catch (error) {
      console.error("Error loading scouting data:", error);
    } finally {
      setLoading(false);
    }
  }, [selectedTeamId, currentSeason, currentWeek, saveGameId]);

  useEffect(() => {
    // Reset attempt flags when team or season changes
    initializationAttempted.current = false;
    initializationErrorShown.current = false;
    
    if (selectedTeamId) {
      loadData();
    } else {
      setLoading(false);
      setProspects([]);
      setReports([]);
      setResources(null);
    }
  }, [selectedTeamId, currentSeason, loadData]);

  // Separate effect to auto-initialize scouting when resources are missing
  // This prevents circular dependencies with loadData
  useEffect(() => {
    if (!selectedTeamId || initializing || initializationAttempted.current || loading) {
      return;
    }

    // Only auto-initialize if resources are null (meaning they don't exist)
    if (resources === null && !initializationAttempted.current) {
      // Small delay to avoid race conditions
      const timer = setTimeout(() => {
        initializeScouting();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [selectedTeamId, resources, initializing, loading, initializeScouting]);

  async function scoutProspect() {
    if (!selectedProspect || !selectedTeamId) return;

    setScouting(true);
    try {
      // Map old method names to new action types
      const actionTypeMap: Record<string, string> = {
        initial: "initial",
        tape: "game_tape",
        game_tape: "game_tape",
        combine: "combine",
        interview: "interview",
        medical: "medical",
      };
      
      const actionType = actionTypeMap[selectedMethod] || selectedMethod;

      const res = await fetch("/api/scout-prospect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamId: selectedTeamId,
          prospectId: selectedProspect,
          actionType: actionType,
          saveGameId,
          season: currentSeason,
          week: currentWeek,
        }),
      });

      const data = await res.json();
      if (data.success) {
        console.log("Scouting successful, response:", {
          success: data.success,
          result: data.result,
          scout: data.scout,
          pointsUsed: data.pointsUsed,
        });
        
        // Small delay to ensure database write completes
        await new Promise(resolve => setTimeout(resolve, 300));
        
        // Force reload data - specifically reload scouts with updated points
        console.log("Reloading scouting data...");
        
        // Reload all data including scouts - loadData will handle refreshing scouts
        await loadData();
        
        setSelectedProspect(null);
        setToast({
          message: `Scouting complete! Scout: ${data.scout?.name || "Unknown"} (${data.scout?.archetype || "Unknown"}) - ${data.pointsUsed || 0} pts used`,
          type: "success",
        });
        // Auto-dismiss toast after 4 seconds
        setTimeout(() => setToast(null), 4000);
      } else {
        // Show detailed error message
        let errorMsg = data.error || "Failed to scout prospect";
        setToast({
          message: errorMsg,
          type: "error",
        });
        // Auto-dismiss error toast after 6 seconds
        setTimeout(() => setToast(null), 6000);
      }
    } catch (error) {
      console.error("Error scouting prospect:", error);
      setToast({
        message: "Failed to scout prospect. Check console for details.",
        type: "error",
      });
      // Auto-dismiss error toast after 6 seconds
      setTimeout(() => setToast(null), 6000);
    } finally {
      setScouting(false);
    }
  }

  function getProspectReport(prospectId: string): ScoutingReport | null {
    // Get the aggregated report for this prospect (one per team/prospect)
    const report = reports.find((r) => r.prospect_id === prospectId);
    if (!report && reports.length > 0) {
      // Debug: log when we can't find a report for a prospect
      console.debug(`No report found for prospect ${prospectId}. Available report prospect_ids:`, 
        reports.map(r => r.prospect_id).slice(0, 5));
    }
    return report || null;
  }

  function getScoutingStatus(prospectId: string): {
    scouted: boolean;
    confidence: "high" | "medium" | "low" | null;
    overallEstimate?: number;
  } {
    const report = getProspectReport(prospectId);
    if (!report) {
      return { scouted: false, confidence: null };
    }

    return {
      scouted: true,
      confidence: report.confidence_level,
      overallEstimate: report.overall_estimate,
    };
  }

  /**
   * Get revealed attribute value from scouting report
   * Returns the estimate if available, or null if not scouted
   */
  function getRevealedAttribute(
    report: ScoutingReport | null,
    attributeKey: string,
    source: "trait" | "athletic" | "psych" = "trait"
  ): number | string | null {
    if (!report) return null;

    let value: any = null;
    if (source === "trait" && report.traits_scouted) {
      value = report.traits_scouted[attributeKey];
      if (value && typeof value === "object") {
        if ("estimate" in value) {
          return value.estimate;
        }
        if ("low" in value && "high" in value) {
          return Math.round((value.low + value.high) / 2);
        }
      } else if (typeof value === "number") {
        return value;
      }
    } else if (source === "athletic" && report.athletic_bands) {
      value = report.athletic_bands[attributeKey];
      if (value && typeof value === "object") {
        if ("low" in value && "high" in value) {
          return `${value.low}-${value.high}`;
        }
      } else if (typeof value === "string") {
        return value; // "Elite", "Good", "Average"
      }
    } else if (source === "psych" && report.character_assessment) {
      value = report.character_assessment[attributeKey];
      if (value && typeof value === "object") {
        if ("low" in value && "high" in value) {
          return Math.round((value.low + value.high) / 2);
        }
        if ("value" in value) {
          return value.value;
        }
      } else if (typeof value === "string") {
        return value;
      }
    }

    return null;
  }

  const filteredProspects = prospects.filter((p) => {
    if (filter === "scouted") {
      return getProspectReport(p.id) !== null;
    }
    if (filter === "unscouted") {
      return getProspectReport(p.id) === null;
    }
    if (filter === "gems" || filter === "busts") {
      const report = getProspectReport(p.id);
      if (!report || !report.overall_estimate) return false;
      const projectedRound = getProjectedRound(p.overall);
      const type = getProspectType(projectedRound, report.overall_estimate);
      return type === (filter === "gems" ? "gem" : "bust");
    }
    return true;
  });

  const sortedProspects = [...filteredProspects].sort((a, b) => {
    const aStatus = getScoutingStatus(a.id);
    const bStatus = getScoutingStatus(b.id);

    if (sortBy === "overall") {
      const aVal = aStatus.overallEstimate ?? a.overall;
      const bVal = bStatus.overallEstimate ?? b.overall;
      return bVal - aVal;
    }
    if (sortBy === "confidence") {
      const confOrder = { high: 3, medium: 2, low: 1, null: 0 };
      return (
        confOrder[bStatus.confidence || "null"] -
        confOrder[aStatus.confidence || "null"]
      );
    }
    return 0;
  });

  if (!selectedTeamId) {
    return (
      <div className="bg-white rounded-xl shadow-lg p-8">
        <p className="text-slate-500">
          Please select a team to view scouting data.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-lg p-8">
        <p className="text-slate-500">Loading scouting data...</p>
        {initializing && (
          <p className="text-slate-400 text-sm mt-2">
            Initializing scouting system...
          </p>
        )}
      </div>
    );
  }

  if (!resources) {
    return (
      <div className="bg-white rounded-xl shadow-lg p-8">
        <p className="text-slate-500 mb-4">Scouting not initialized</p>
        <button
          onClick={initializeScouting}
          disabled={initializing}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {initializing ? "Initializing..." : "Initialize Scouting"}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {toast && (
        <div 
          className="fixed top-4 right-4 z-[100]"
          style={{
            animation: "fadeInSlideDown 0.3s ease-out",
          }}
        >
          <div
            className={`rounded-xl shadow-2xl border-2 p-4 min-w-[320px] max-w-md backdrop-blur-sm ${
              toast.type === "success"
                ? "bg-gradient-to-r from-green-600 to-green-700 border-green-500"
                : toast.type === "error"
                  ? "bg-gradient-to-r from-red-600 to-red-700 border-red-500"
                  : "bg-gradient-to-r from-blue-600 to-blue-700 border-blue-500"
            } text-white`}
          >
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 mt-0.5">
                {toast.type === "success" ? (
                  <CheckCircle className="w-6 h-6" />
                ) : toast.type === "error" ? (
                  <AlertCircle className="w-6 h-6" />
                ) : (
                  <Target className="w-6 h-6" />
                )}
              </div>
              <div className="flex-1">
                <p className="font-semibold text-sm leading-tight">{toast.message}</p>
              </div>
              <button
                onClick={() => setToast(null)}
                className="flex-shrink-0 text-white/80 hover:text-white transition-colors p-1 hover:bg-white/10 rounded"
                aria-label="Close notification"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Resources Header - NFL Style */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 rounded-xl shadow-2xl p-6 border border-slate-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="bg-blue-600 p-3 rounded-lg">
              <Target className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-white">
                Scouting Department
              </h2>
              <p className="text-slate-300 text-sm mt-0.5">
                {currentSeason} Draft Class Evaluation ({prospects.length} prospects loaded)
              </p>
            </div>
          </div>
          <div className="flex gap-6 flex-wrap">
            {/* Scout Weekly Points */}
            {scouts.length > 0 && (
              <div className="bg-slate-800/50 rounded-lg px-6 py-4 border border-slate-700 flex-1 min-w-[300px]">
                <div className="flex items-center gap-2 mb-3">
                  <Zap className="w-4 h-4 text-yellow-400" />
                  <div className="text-xs text-slate-400 uppercase tracking-wide">Weekly Scouting Points</div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {scouts.map((scout) => {
                    const priorityLabels: Record<number, string> = {
                      1: "Primary",
                      2: "Secondary",
                      3: "Tertiary",
                      4: "Quaternary",
                    };
                    const priorityColors: Record<number, string> = {
                      1: "text-purple-400",
                      2: "text-blue-400",
                      3: "text-yellow-400",
                      4: "text-slate-400",
                    };
                    
                    return (
                      <div key={scout.id} className="bg-slate-900/50 rounded p-2 border border-slate-700">
                        <div className="flex items-center justify-between mb-1">
                          <div className="text-xs font-semibold text-slate-300 truncate">
                            {scout.name}
                          </div>
                          {scout.priority && (
                            <span className={`text-xs font-bold ${priorityColors[scout.priority.level] || "text-slate-400"}`}>
                              {priorityLabels[scout.priority.level] || `P${scout.priority.level}`}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <div className={`text-lg font-bold ${scout.availablePoints && scout.availablePoints > 0 ? "text-yellow-400" : "text-slate-500"}`}>
                            {scout.availablePoints || 0}
                          </div>
                          <div className="text-xs text-slate-500">
                            / {scout.priority?.weekly_points || 0} pts
                          </div>
                        </div>
                        <div className="text-xs text-slate-600 mt-0.5 capitalize">
                          {scout.archetype?.replace('_', ' ')}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="text-xs text-slate-500 mt-2 italic">
                  Points regenerate each week based on priority
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Scouting Modal - Enhanced */}
      {selectedProspect && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-60 backdrop-blur-sm flex items-start justify-center z-50 p-4 overflow-y-auto"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setSelectedProspect(null);
            }
          }}
          style={{ 
            paddingTop: '2rem',
            paddingBottom: '2rem'
          }}
        >
          <div 
            className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full overflow-hidden border-2 border-slate-200 mt-8 mb-8"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-8 py-6 text-white">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-2xl font-bold mb-1">Scout Prospect</h3>
                  <p className="text-blue-100 text-sm">
                    {isOffseason 
                      ? "Offseason - All scouting methods available"
                      : `Week ${currentWeek} - In-season methods only`}
                  </p>
                </div>
                <button
                  onClick={() => setSelectedProspect(null)}
                  className="text-white hover:text-blue-200 transition-colors p-2 hover:bg-white/10 rounded-lg"
                >
                  <XCircle className="w-6 h-6" />
                </button>
              </div>
            </div>

            <div className="p-8">
              <div className="space-y-6">
                {/* Scouting Methods Grid */}
                <div>
                  <label className="block text-sm font-semibold mb-4 text-slate-700 uppercase tracking-wide">
                    Scouting Methods
                  </label>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {scoutingMethods.map((method) => {
                      // Note: In new system, points are per-scout. The API will auto-select a scout with enough points.
                      // For now, we'll allow all methods (the API will check if any scout has enough points)
                      const canAfford = true; // API will handle point checking
                      const isSelected = selectedMethod === method.value;
                      const isAvailable = method.availableInSeason || isOffseason;
                      
                      return (
                        <button
                          key={method.value}
                          onClick={() => isAvailable && canAfford && setSelectedMethod(method.value)}
                          disabled={!canAfford || !isAvailable}
                          className={`p-4 rounded-lg border-2 text-left transition-all relative ${
                            !isAvailable
                              ? "border-slate-200 bg-slate-100 opacity-40 cursor-not-allowed"
                              : isSelected
                                ? "border-blue-600 bg-blue-50 shadow-md"
                                : canAfford
                                  ? "border-slate-200 hover:border-blue-300 hover:bg-slate-50"
                                  : "border-slate-200 bg-slate-100 opacity-50 cursor-not-allowed"
                          }`}
                        >
                          {!isAvailable && (
                            <div className="absolute top-2 right-2">
                              <span className="px-2 py-0.5 bg-slate-500 text-white text-xs font-bold rounded">
                                Offseason Only
                              </span>
                            </div>
                          )}
                          <div className="flex items-start justify-between mb-2">
                            <div className="font-semibold text-slate-900">{method.label}</div>
                            <div className={`px-2 py-1 rounded text-xs font-bold ${
                              canAfford && isAvailable
                                ? "bg-blue-100 text-blue-700"
                                : "bg-red-100 text-red-700"
                            }`}>
                              {method.cost} pts
                            </div>
                          </div>
                          <p className="text-sm text-slate-600">{method.description}</p>
                          {!isAvailable && (
                            <p className="text-xs text-slate-500 mt-1 italic">
                              Available during offseason only
                            </p>
                          )}
                          {isAvailable && (
                            <p className="text-xs text-slate-500 mt-1 italic">
                              Points checked per-scout automatically
                            </p>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Cost Summary */}
                <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm text-slate-600">Selected Method Cost</div>
                      <div className="text-2xl font-bold text-slate-900">
                        {scoutingMethods.find((m) => m.value === selectedMethod)?.cost || 0} pts
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm text-slate-600">Scout Selection</div>
                      <div className="text-lg font-bold text-blue-600">
                        Auto-Selected
                      </div>
                      <div className="text-xs text-slate-500 mt-1">
                        Best scout chosen automatically
                      </div>
                    </div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-4">
                  <button
                    onClick={scoutProspect}
                  disabled={
                    scouting ||
                    !availableMethods.some((m) => m.value === selectedMethod)
                  }
                    className="flex-1 px-6 py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg hover:from-blue-700 hover:to-blue-800 disabled:opacity-50 disabled:cursor-not-allowed font-semibold shadow-lg transition-all flex items-center justify-center gap-2"
                  >
                    {scouting ? (
                      <>
                        <Clock className="w-5 h-5 animate-spin" />
                        Scouting in Progress...
                      </>
                    ) : (
                      <>
                        <Target className="w-5 h-5" />
                        Execute Scouting
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => setSelectedProspect(null)}
                    className="px-6 py-3 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 font-semibold transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Filters - Enhanced */}
      <div className="bg-white rounded-xl shadow-lg p-6 border border-slate-200">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs font-semibold text-slate-700 uppercase mb-2 tracking-wide">
              Filter Prospects
            </label>
            <div className="flex gap-2 flex-wrap">
              {[
                { value: "all", label: "All", icon: BarChart3 },
                { value: "scouted", label: "Scouted", icon: CheckCircle },
                { value: "unscouted", label: "Unscouted", icon: EyeOff },
                { value: "gems", label: "Gems", icon: Sparkles },
                { value: "busts", label: "Busts", icon: AlertCircle },
              ].map(({ value, label, icon: Icon }) => (
                <button
                  key={value}
                  onClick={() => setFilter(value as any)}
                  className={`px-4 py-2 rounded-lg font-medium text-sm transition-all flex items-center gap-2 ${
                    filter === value
                      ? "bg-blue-600 text-white shadow-md"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="min-w-[180px]">
            <label className="block text-xs font-semibold text-slate-700 uppercase mb-2 tracking-wide">
              Sort By
            </label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg text-slate-900 bg-white font-medium focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="overall">Overall Rating</option>
              <option value="confidence">Scouting Confidence</option>
            </select>
          </div>
          <div className="ml-auto text-right">
            <div className="text-xs text-slate-500 uppercase tracking-wide mb-1">Prospects</div>
            <div className="text-lg font-bold text-slate-900">
              {sortedProspects.length} <span className="text-slate-500 font-normal text-sm">/ {prospects.length}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Prospects List - Enhanced */}
      <div className="bg-white rounded-xl shadow-lg overflow-hidden border border-slate-200">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-2 border-slate-300 bg-gradient-to-r from-slate-50 to-slate-100">
                <th className="text-left py-4 px-4 font-bold text-slate-800 text-xs uppercase tracking-wider">
                  Player
                </th>
                <th className="text-left py-4 px-4 font-bold text-slate-800 text-xs uppercase tracking-wider">
                  Pos
                </th>
                <th className="text-left py-4 px-4 font-bold text-slate-800 text-xs uppercase tracking-wider">
                  College
                </th>
                <th className="text-right py-4 px-4 font-bold text-slate-800 text-xs uppercase tracking-wider">
                  Proj. Round
                </th>
                <th className="text-right py-4 px-4 font-bold text-slate-800 text-xs uppercase tracking-wider">
                  Overall
                </th>
                <th className="text-right py-4 px-4 font-bold text-slate-800 text-xs uppercase tracking-wider">
                  Potential
                </th>
                <th className="text-center py-4 px-4 font-bold text-slate-800 text-xs uppercase tracking-wider">
                  Speed
                </th>
                <th className="text-center py-4 px-4 font-bold text-slate-800 text-xs uppercase tracking-wider">
                  Strength
                </th>
                <th className="text-center py-4 px-4 font-bold text-slate-800 text-xs uppercase tracking-wider">
                  Awareness
                </th>
                <th className="text-center py-4 px-4 font-bold text-slate-800 text-xs uppercase tracking-wider">
                  Instincts
                </th>
                <th className="text-center py-4 px-4 font-bold text-slate-800 text-xs uppercase tracking-wider">
                  Technique
                </th>
                <th className="text-center py-4 px-4 font-bold text-slate-800 text-xs uppercase tracking-wider">
                  Leadership
                </th>
                <th className="text-center py-4 px-4 font-bold text-slate-800 text-xs uppercase tracking-wider">
                  Type
                </th>
                <th className="text-center py-4 px-4 font-bold text-slate-800 text-xs uppercase tracking-wider">
                  Scouting
                </th>
                <th className="text-center py-4 px-4 font-bold text-slate-800 text-xs uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedProspects.map((prospect) => {
                const status = getScoutingStatus(prospect.id);
                const report = getProspectReport(prospect.id);
                const projectedRound = getProjectedRound(prospect.overall);
                const prospectType = getProspectType(
                  projectedRound,
                  status.overallEstimate
                );

                return (
                  <tr
                    key={prospect.id}
                    className={`border-b border-slate-100 hover:bg-slate-50 transition-all ${
                      prospectType === "gem"
                        ? "bg-gradient-to-r from-green-50 to-transparent border-l-4 border-l-green-500"
                        : prospectType === "bust"
                          ? "bg-gradient-to-r from-red-50 to-transparent border-l-4 border-l-red-500"
                          : ""
                    }`}
                  >
                    <td className="py-4 px-4">
                      <div className="font-bold text-slate-900 text-base">
                        {prospect.full_name}
                      </div>
                      {prospectType && (
                        <div className="mt-1">
                          {prospectType === "gem" && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs font-semibold">
                              <Sparkles className="w-3 h-3" />
                              Hidden Gem
                            </span>
                          )}
                          {prospectType === "bust" && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-100 text-red-700 rounded text-xs font-semibold">
                              <AlertCircle className="w-3 h-3" />
                              Overrated
                            </span>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="py-4 px-4">
                      <span className="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-blue-100 text-blue-700 font-bold text-sm">
                        {prospect.position}
                      </span>
                    </td>
                    <td className="py-4 px-4 text-slate-700 font-medium">
                      {prospect.college || "—"}
                    </td>
                    <td className="text-right py-4 px-4">
                      {projectedRound <= 7 ? (
                        <div className="flex items-center justify-end gap-2">
                          <span className={`inline-flex items-center justify-center w-12 h-12 rounded-full font-bold text-sm ${
                            projectedRound === 1
                              ? "bg-purple-100 text-purple-700"
                              : projectedRound === 2
                                ? "bg-blue-100 text-blue-700"
                                : projectedRound <= 3
                                  ? "bg-indigo-100 text-indigo-700"
                                  : "bg-slate-100 text-slate-700"
                          }`}>
                            {projectedRound}
                          </span>
                        </div>
                      ) : (
                        <span className="inline-flex items-center px-3 py-1 bg-slate-200 text-slate-600 rounded-full text-xs font-semibold">
                          UDFA
                        </span>
                      )}
                    </td>
                    <td className="text-right py-4 px-4">
                      {status.scouted && status.overallEstimate ? (
                        <div className="flex flex-col items-end">
                          <span className={`text-2xl font-bold ${
                            status.overallEstimate >= 85
                              ? "text-purple-600"
                              : status.overallEstimate >= 80
                                ? "text-blue-600"
                                : status.overallEstimate >= 75
                                  ? "text-indigo-600"
                                  : "text-slate-700"
                          }`}>
                            {status.overallEstimate}
                          </span>
                          {report?.overall_min && report?.overall_max && (
                            <span className="text-xs text-slate-500 mt-0.5">
                              {report.overall_min}-{report.overall_max}
                            </span>
                          )}
                        </div>
                      ) : (
                        <div className="flex items-center justify-end">
                          <span className="text-slate-400 text-lg font-bold">??</span>
                        </div>
                      )}
                    </td>
                    <td className="text-right py-4 px-4">
                      {report?.potential_estimate ? (
                        <div className="flex flex-col items-end">
                          <span className={`text-2xl font-bold ${
                            report.potential_estimate >= 90
                              ? "text-green-600"
                              : report.potential_estimate >= 85
                                ? "text-emerald-600"
                                : "text-slate-700"
                          }`}>
                            {report.potential_estimate}
                          </span>
                          {report.potential_min && report.potential_max && (
                            <span className="text-xs text-slate-500 mt-0.5">
                              {report.potential_min}-{report.potential_max}
                            </span>
                          )}
                        </div>
                      ) : (
                        <div className="flex items-center justify-end">
                          <span className="text-slate-400 text-lg font-bold">??</span>
                        </div>
                      )}
                    </td>
                    {/* Speed */}
                    <td className="text-center py-4 px-4">
                      {(() => {
                        const speed = getRevealedAttribute(report, "speed", "athletic") || 
                                     getRevealedAttribute(report, "speed", "trait");
                        if (speed) {
                          if (typeof speed === "string") {
                            return (
                              <span className={`text-xs font-semibold ${
                                speed === "Elite" ? "text-purple-600" : 
                                speed === "Good" ? "text-blue-600" : "text-slate-600"
                              }`}>
                                {speed}
                              </span>
                            );
                          }
                          if (typeof speed === "number") {
                            return (
                              <span className={`text-sm font-bold ${
                                speed >= 85 ? "text-purple-600" : 
                                speed >= 70 ? "text-blue-600" : "text-slate-700"
                              }`}>
                                {speed}
                              </span>
                            );
                          }
                          if (typeof speed === "string" && speed.includes("-")) {
                            return <span className="text-xs text-slate-600">{speed}</span>;
                          }
                        }
                        return <span className="text-slate-400 text-sm">??</span>;
                      })()}
                    </td>
                    {/* Strength */}
                    <td className="text-center py-4 px-4">
                      {(() => {
                        const strength = getRevealedAttribute(report, "strength", "athletic") || 
                                        getRevealedAttribute(report, "strength", "trait");
                        if (strength) {
                          if (typeof strength === "string") {
                            return (
                              <span className={`text-xs font-semibold ${
                                strength === "Elite" ? "text-purple-600" : 
                                strength === "Good" ? "text-blue-600" : "text-slate-600"
                              }`}>
                                {strength}
                              </span>
                            );
                          }
                          if (typeof strength === "number") {
                            return (
                              <span className={`text-sm font-bold ${
                                strength >= 85 ? "text-purple-600" : 
                                strength >= 70 ? "text-blue-600" : "text-slate-700"
                              }`}>
                                {strength}
                              </span>
                            );
                          }
                          if (typeof strength === "string" && strength.includes("-")) {
                            return <span className="text-xs text-slate-600">{strength}</span>;
                          }
                        }
                        return <span className="text-slate-400 text-sm">??</span>;
                      })()}
                    </td>
                    {/* Awareness */}
                    <td className="text-center py-4 px-4">
                      {(() => {
                        const awareness = getRevealedAttribute(report, "awareness", "trait");
                        if (awareness && typeof awareness === "number") {
                          return (
                            <span className={`text-sm font-bold ${
                              awareness >= 85 ? "text-purple-600" : 
                              awareness >= 70 ? "text-blue-600" : "text-slate-700"
                            }`}>
                              {awareness}
                            </span>
                          );
                        }
                        return <span className="text-slate-400 text-sm">??</span>;
                      })()}
                    </td>
                    {/* Instincts */}
                    <td className="text-center py-4 px-4">
                      {(() => {
                        const instincts = getRevealedAttribute(report, "instincts", "trait");
                        if (instincts && typeof instincts === "number") {
                          return (
                            <span className={`text-sm font-bold ${
                              instincts >= 85 ? "text-purple-600" : 
                              instincts >= 70 ? "text-blue-600" : "text-slate-700"
                            }`}>
                              {instincts}
                            </span>
                          );
                        }
                        return <span className="text-slate-400 text-sm">??</span>;
                      })()}
                    </td>
                    {/* Technique */}
                    <td className="text-center py-4 px-4">
                      {(() => {
                        const technique = getRevealedAttribute(report, "technique", "trait");
                        if (technique && typeof technique === "number") {
                          return (
                            <span className={`text-sm font-bold ${
                              technique >= 85 ? "text-purple-600" : 
                              technique >= 70 ? "text-blue-600" : "text-slate-700"
                            }`}>
                              {technique}
                            </span>
                          );
                        }
                        return <span className="text-slate-400 text-sm">??</span>;
                      })()}
                    </td>
                    {/* Leadership */}
                    <td className="text-center py-4 px-4">
                      {(() => {
                        const leadership = getRevealedAttribute(report, "leadership", "psych");
                        if (leadership) {
                          if (typeof leadership === "number") {
                            return (
                              <span className={`text-sm font-bold ${
                                leadership >= 85 ? "text-purple-600" : 
                                leadership >= 70 ? "text-blue-600" : "text-slate-700"
                              }`}>
                                {leadership}
                              </span>
                            );
                          }
                          if (typeof leadership === "string") {
                            return <span className="text-xs text-slate-600">{leadership}</span>;
                          }
                        }
                        return <span className="text-slate-400 text-sm">??</span>;
                      })()}
                    </td>
                    <td className="text-center py-4 px-4">
                      {prospectType === "gem" && (
                        <div className="flex flex-col items-center gap-1">
                          <div className="flex items-center gap-1.5">
                            <Sparkles className="w-5 h-5 text-green-600" />
                            <span className="text-xs font-bold text-green-700 uppercase tracking-wide">
                              Gem
                            </span>
                          </div>
                          <span className="text-xs text-green-600 font-medium">
                            Hidden Value
                          </span>
                        </div>
                      )}
                      {prospectType === "bust" && (
                        <div className="flex flex-col items-center gap-1">
                          <div className="flex items-center gap-1.5">
                            <AlertCircle className="w-5 h-5 text-red-600" />
                            <span className="text-xs font-bold text-red-700 uppercase tracking-wide">
                              Bust
                            </span>
                          </div>
                          <span className="text-xs text-red-600 font-medium">
                            Overrated
                          </span>
                        </div>
                      )}
                      {prospectType === "normal" && status.scouted && (
                        <span className="text-xs text-slate-500 font-medium">Normal</span>
                      )}
                      {!prospectType && !status.scouted && (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>
                    <td className="text-center py-4 px-4">
                      {status.scouted && report ? (
                        <div className="flex flex-col items-center gap-2 min-w-[120px]">
                          {/* Confidence Badge */}
                          <div className="flex items-center gap-1.5">
                            {status.confidence === "high" && (
                              <div className="flex items-center gap-1 px-2 py-1 bg-green-100 rounded-full">
                                <CheckCircle className="w-3.5 h-3.5 text-green-600" />
                                <span className="text-xs font-bold text-green-700 uppercase">
                                  High
                                </span>
                              </div>
                            )}
                            {status.confidence === "medium" && (
                              <div className="flex items-center gap-1 px-2 py-1 bg-yellow-100 rounded-full">
                                <TrendingUp className="w-3.5 h-3.5 text-yellow-600" />
                                <span className="text-xs font-bold text-yellow-700 uppercase">
                                  Med
                                </span>
                              </div>
                            )}
                            {status.confidence === "low" && (
                              <div className="flex items-center gap-1 px-2 py-1 bg-orange-100 rounded-full">
                                <AlertTriangle className="w-3.5 h-3.5 text-orange-600" />
                                <span className="text-xs font-bold text-orange-700 uppercase">
                                  Low
                                </span>
                              </div>
                            )}
                          </div>
                          {/* Progress Bar */}
                          <div className="w-full">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs font-semibold text-slate-700">
                                {report.scouting_progress}%
                              </span>
                              <span className="text-xs text-slate-500">
                                {report.total_points_invested} pts
                              </span>
                            </div>
                            <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                              <div
                                className={`h-2 rounded-full transition-all ${
                                  report.scouting_progress >= 70
                                    ? "bg-green-500"
                                    : report.scouting_progress >= 40
                                      ? "bg-yellow-500"
                                      : "bg-orange-500"
                                }`}
                                style={{ width: `${report.scouting_progress}%` }}
                              />
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center gap-1">
                          <EyeOff className="w-5 h-5 text-slate-400" />
                          <span className="text-xs text-slate-500 font-medium">Unscouted</span>
                        </div>
                      )}
                    </td>
                    <td className="text-center py-4 px-4">
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setSelectedProspect(prospect.id);
                        }}
                        className="px-4 py-2 bg-gradient-to-r from-blue-600 to-blue-700 text-white text-sm font-semibold rounded-lg hover:from-blue-700 hover:to-blue-800 shadow-md transition-all flex items-center gap-2"
                      >
                        <Target className="w-4 h-4" />
                        Scout
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {sortedProspects.length === 0 && (
          <div className="p-12 text-center border-t border-slate-200">
            <EyeOff className="w-16 h-16 text-slate-300 mx-auto mb-4" />
            <p className="text-slate-500 text-lg font-semibold mb-2">No prospects found</p>
            <p className="text-slate-400 text-sm">
              {filter !== "all" 
                ? "Try adjusting your filters"
                : "No draft prospects available for this season"}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
