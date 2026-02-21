"use client";

import { useState, useEffect } from "react";
import { useGameStore } from "@/lib/store/game-store";
import {
  Users,
  DollarSign,
  X,
  CheckCircle,
  AlertCircle,
  UserPlus,
  UserMinus,
} from "lucide-react";

interface Scout {
  id: string;
  name: string;
  archetype: string;
  evaluation: number;
  football_iq: number;
  athletic_analysis: number;
  psych_insight: number;
  medical_read: number;
  analytics: number;
  confidence: number;
  experience: number;
  communication: number;
  salary: number;
  reputation: number;
  loyalty: number;
  qb_specialist: number;
  wr_specialist: number;
  ol_specialist: number;
  dl_specialist: number;
  db_specialist: number;
  rb_specialist: number;
}

interface ScoutContract {
  id: string;
  scout_id: string;
  salary: number;
  contract_years: number;
  role: string;
}

interface HiredScout extends Scout {
  contract: ScoutContract;
}

const ARCHETYPE_NAMES: Record<string, string> = {
  evaluator: "The Evaluator",
  tape_grinder: "The Tape Grinder",
  character_coach: "The Character Coach",
  athletic_analyst: "The Athletic Analyst",
};

const ARCHETYPE_DESCRIPTIONS: Record<string, string> = {
  evaluator: "Sees the big board before anyone else. Strengths: OVR/POT estimates, round projection.",
  tape_grinder: "Football is played on tape, not spreadsheets. Strengths: On-field traits, technique, scheme fit.",
  character_coach: "Knows the man behind the helmet. Strengths: Personality, leadership, bust/boom detection.",
  athletic_analyst: "Every movement tells a story. Strengths: Athleticism, combine interpretation, comps.",
};

export default function ScoutHiring() {
  const { selectedTeamId, currentSeason, saveGameId } = useGameStore();
  const [availableScouts, setAvailableScouts] = useState<Scout[]>([]);
  const [hiredScouts, setHiredScouts] = useState<HiredScout[]>([]);
  const [budget, setBudget] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [hiring, setHiring] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Reset state when saveGameId changes to prevent data bleeding
    if (saveGameId) {
      setHiredScouts([]);
      setBudget(0);
      setAvailableScouts([]);
      setError(null);
    }
    
    if (selectedTeamId && saveGameId) {
      loadData();
    }
  }, [selectedTeamId, saveGameId, currentSeason]);

  async function loadData() {
    if (!selectedTeamId || !saveGameId) {
      if (!selectedTeamId) {
        setError("No team selected. Please select a team first.");
      } else if (!saveGameId) {
        setError("No save game loaded. Please save your game first.");
      }
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Initialize scouting system if needed (this will create resources and generate scout pool)
      const initRes = await fetch("/api/scouting/initialize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamId: selectedTeamId,
          season: currentSeason,
          saveGameId,
        }),
      });
      
      // Don't fail if initialization fails - might already be initialized
      if (!initRes.ok) {
        const initData = await initRes.json();
        console.log("Scouting initialization check:", initData.error || "Already initialized");
      }

      // Load available scouts
      const scoutsRes = await fetch(
        `/api/scouting/available-scouts?saveGameId=${saveGameId}`
      );
      const scoutsData = await scoutsRes.json();
      if (scoutsData.success) {
        setAvailableScouts(scoutsData.scouts || []);
      } else {
        setError(scoutsData.error || "Failed to load available scouts");
      }

      // Load hired scouts (filtered by saveGameId)
      if (!saveGameId) {
        console.error("Cannot load hired scouts: saveGameId is missing");
        setHiredScouts([]);
      } else {
        console.log(`[ScoutHiring] Loading hired scouts for team ${selectedTeamId}, saveGameId: ${saveGameId}`);
        const hiredRes = await fetch(
          `/api/scouting/team-scouts?teamId=${selectedTeamId}&saveGameId=${saveGameId}&season=${currentSeason}`
        );
        const hiredData = await hiredRes.json();
        
        console.log(`[ScoutHiring] API response:`, {
          success: hiredData.success,
          scoutCount: hiredData.scouts?.length || 0,
          error: hiredData.error
        });
        
        if (hiredData.success) {
          // Defensive check: ensure all scouts belong to this save game
          const scouts = (hiredData.scouts || []).filter((scout: any) => {
            if (!scout.contract) {
              console.warn(`[ScoutHiring] Scout ${scout.id} missing contract`);
              return false;
            }
            // Strictly check save_game_id matches
            if (saveGameId && scout.contract.save_game_id !== saveGameId) {
              console.warn(`[ScoutHiring] Scout ${scout.id} has wrong save_game_id: expected ${saveGameId}, got ${scout.contract.save_game_id}`);
              return false;
            }
            return true;
          });
          
          console.log(`[ScoutHiring] After filtering: ${scouts.length} scouts (from ${hiredData.scouts?.length || 0} total)`);
          
          // Log if we filtered out any scouts
          if (hiredData.scouts && hiredData.scouts.length !== scouts.length) {
            console.warn(`[ScoutHiring] ⚠️ Filtered out ${hiredData.scouts.length - scouts.length} scouts that don't belong to save game ${saveGameId}`);
            console.warn(`[ScoutHiring] Expected saveGameId: ${saveGameId}`);
            console.warn(`[ScoutHiring] Filtered scouts had save_game_ids:`, hiredData.scouts.map((s: any) => ({
              scoutId: s.id,
              saveGameId: s.contract?.save_game_id
            })));
          }
          
          setHiredScouts(scouts);
          
          // Log final count
          console.log(`[ScoutHiring] ✅ Final: ${scouts.length} hired scouts for team ${selectedTeamId} in save game ${saveGameId}`);
        } else {
          console.error("[ScoutHiring] Failed to load hired scouts:", hiredData.error);
          setHiredScouts([]);
        }
      }

      // Load budget
      const budgetRes = await fetch(
        `/api/scouting/resources?teamId=${selectedTeamId}&season=${currentSeason}&saveGameId=${saveGameId}`
      );
      const budgetData = await budgetRes.json();
      if (budgetData.success && budgetData.resources) {
        setBudget(budgetData.resources.scouting_budget || 0);
      } else if (!budgetData.success) {
        console.error("Failed to load budget:", budgetData.error);
        // Don't set error here - budget might not be initialized yet
      }
    } catch (err) {
      console.error("Error loading scouting data:", err);
      setError("Failed to load scouting data");
    } finally {
      setLoading(false);
    }
  }

  async function handleHire(scoutId: string) {
    if (!selectedTeamId || !saveGameId) return;

    setHiring(true);
    setError(null);

    try {
      const res = await fetch("/api/scouting/hire", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamId: selectedTeamId,
          scoutId,
          saveGameId,
          season: currentSeason,
          contractYears: 1,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to hire scout");
      }

      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to hire scout");
    } finally {
      setHiring(false);
    }
  }

  async function handleFire(scoutId: string) {
    if (!selectedTeamId || !saveGameId) return;

    if (!confirm("Are you sure you want to fire this scout?")) {
      return;
    }

    setHiring(true);
    setError(null);

    try {
      const res = await fetch("/api/scouting/fire", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamId: selectedTeamId,
          scoutId,
          saveGameId,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to fire scout");
      }

      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fire scout");
    } finally {
      setHiring(false);
    }
  }

  const totalSpent = hiredScouts.reduce(
    (sum, scout) => sum + Number(scout.contract.salary),
    0
  );
  const remainingBudget = budget - totalSpent;
  const hasAllArchetypes =
    hiredScouts.length === 4 &&
    new Set(hiredScouts.map((s) => s.archetype)).size === 4;

  // Group available scouts by archetype
  const scoutsByArchetype: Record<string, Scout[]> = {
    evaluator: [],
    tape_grinder: [],
    character_coach: [],
    athletic_analyst: [],
  };

  availableScouts.forEach((scout) => {
    if (scoutsByArchetype[scout.archetype]) {
      scoutsByArchetype[scout.archetype].push(scout);
    }
  });

  const hiredArchetypes = new Set(hiredScouts.map((s) => s.archetype));

  if (loading) {
    return (
      <div className="p-6">
        <div className="text-center">Loading scouting department...</div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <Users className="w-6 h-6" />
          Scouting Department
        </h2>
        <div className="flex items-center gap-4">
          <div className="text-sm">
            <span className="text-gray-600">Budget: </span>
            <span className="font-semibold">${budget.toLocaleString()}</span>
          </div>
          <div className="text-sm">
            <span className="text-gray-600">Spent: </span>
            <span className="font-semibold">${totalSpent.toLocaleString()}</span>
          </div>
          <div className="text-sm">
            <span className="text-gray-600">Remaining: </span>
            <span
              className={`font-semibold ${
                remainingBudget < 0 ? "text-red-600" : "text-green-600"
              }`}
            >
              ${remainingBudget.toLocaleString()}
            </span>
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded">
          {error}
        </div>
      )}

      {hasAllArchetypes && (
        <div className="bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded flex items-center gap-2">
          <CheckCircle className="w-5 h-5" />
          <span>Scouting department complete! All 4 archetypes hired.</span>
        </div>
      )}

      {!hasAllArchetypes && (
        <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-3 rounded flex items-center gap-2">
          <AlertCircle className="w-5 h-5" />
          <span>
            You must hire exactly 4 scouts, one of each archetype: Evaluator,
            Tape Grinder, Character Coach, Athletic Analyst
          </span>
        </div>
      )}

      {/* Hired Scouts */}
      <div>
        <h3 className="text-xl font-semibold mb-4">Hired Scouts ({hiredScouts.length}/4)</h3>
        {hiredScouts.length === 0 ? (
          <div className="text-gray-500 text-center py-8">
            No scouts hired yet. Hire scouts from the available pool below.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {hiredScouts.map((scout) => (
              <div
                key={scout.id}
                className="border rounded-lg p-4 bg-white shadow-sm"
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h4 className="font-semibold text-lg">{scout.name}</h4>
                    <p className="text-sm text-gray-600">
                      {ARCHETYPE_NAMES[scout.archetype] || scout.archetype}
                    </p>
                  </div>
                  <button
                    onClick={() => handleFire(scout.id)}
                    disabled={hiring}
                    className="text-red-600 hover:text-red-800 p-1"
                    title="Fire scout"
                  >
                    <UserMinus className="w-5 h-5" />
                  </button>
                </div>
                <p className="text-xs text-gray-500 mb-3">
                  {ARCHETYPE_DESCRIPTIONS[scout.archetype]}
                </p>
                <div className="grid grid-cols-2 gap-2 text-sm mb-3">
                  <div>
                    <span className="text-gray-600">Salary: </span>
                    <span className="font-semibold">
                      ${Number(scout.contract.salary).toLocaleString()}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-600">Reputation: </span>
                    <span className="font-semibold">{scout.reputation}</span>
                  </div>
                  <div>
                    <span className="text-gray-600">Experience: </span>
                    <span className="font-semibold">{scout.experience} yrs</span>
                  </div>
                  <div>
                    <span className="text-gray-600">Contract: </span>
                    <span className="font-semibold">
                      {scout.contract.contract_years} year(s)
                    </span>
                  </div>
                </div>
                <div className="text-xs text-gray-500">
                  Key Attributes: Eval {scout.evaluation}, Football IQ{" "}
                  {scout.football_iq}, {scout.archetype === "athletic_analyst" && `Athletic ${scout.athletic_analysis}, `}
                  {scout.archetype === "character_coach" && `Psych ${scout.psych_insight}, `}
                  {scout.archetype === "tape_grinder" && `Football IQ ${scout.football_iq}, `}
                  Analytics {scout.analytics}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Available Scouts */}
      <div>
        <h3 className="text-xl font-semibold mb-4">Available Scouts</h3>
        {Object.entries(scoutsByArchetype).map(([archetype, scouts]) => {
          const isHired = hiredArchetypes.has(archetype);
          return (
            <div key={archetype} className="mb-6">
              <h4 className="font-semibold mb-2 flex items-center gap-2">
                {ARCHETYPE_NAMES[archetype] || archetype}
                {isHired && (
                  <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">
                    Hired
                  </span>
                )}
              </h4>
              {scouts.length === 0 ? (
                <div className="text-gray-500 text-sm py-2">
                  No {archetype} scouts available
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {scouts.slice(0, 6).map((scout) => (
                    <div
                      key={scout.id}
                      className="border rounded-lg p-3 bg-gray-50 hover:bg-gray-100 transition"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <h5 className="font-semibold">{scout.name}</h5>
                          <p className="text-xs text-gray-600">
                            Rep: {scout.reputation} | Exp: {scout.experience} yrs
                          </p>
                        </div>
                        {!isHired && (
                          <button
                            onClick={() => handleHire(scout.id)}
                            disabled={
                              hiring ||
                              remainingBudget < Number(scout.salary) ||
                              hiredScouts.length >= 4
                            }
                            className="text-blue-600 hover:text-blue-800 p-1 disabled:opacity-50 disabled:cursor-not-allowed"
                            title="Hire scout"
                          >
                            <UserPlus className="w-5 h-5" />
                          </button>
                        )}
                      </div>
                      <div className="text-sm mb-2">
                        <div className="flex items-center justify-between">
                          <span className="text-gray-600">Salary:</span>
                          <span
                            className={`font-semibold ${
                              remainingBudget < Number(scout.salary)
                                ? "text-red-600"
                                : "text-green-600"
                            }`}
                          >
                            ${Number(scout.salary).toLocaleString()}
                          </span>
                        </div>
                      </div>
                      <div className="text-xs text-gray-500">
                        Eval: {scout.evaluation} | IQ: {scout.football_iq} |
                        Analytics: {scout.analytics}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

