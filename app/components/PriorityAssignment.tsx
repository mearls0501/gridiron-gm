"use client";

import { useState, useEffect } from "react";
import { useGameStore } from "@/lib/store/game-store";
import {
  Target,
  ArrowUp,
  ArrowDown,
  Lock,
  CheckCircle,
  AlertCircle,
} from "lucide-react";

interface Scout {
  id: string;
  name: string;
  archetype: string;
  contract?: {
    id: string;
    salary: number;
  };
  priority?: {
    level: number;
    weekly_points: number;
  };
}

const PRIORITY_NAMES: Record<number, string> = {
  1: "Primary",
  2: "Secondary",
  3: "Tertiary",
  4: "Quaternary",
};

const PRIORITY_POINTS: Record<number, number> = {
  1: 25,
  2: 15,
  3: 10,
  4: 5,
};

const ARCHETYPE_NAMES: Record<string, string> = {
  evaluator: "The Evaluator",
  tape_grinder: "The Tape Grinder",
  character_coach: "The Character Coach",
  athletic_analyst: "The Athletic Analyst",
};

export default function PriorityAssignment() {
  const { selectedTeamId, currentSeason, saveGameId } = useGameStore();
  const [scouts, setScouts] = useState<Scout[]>([]);
  const [loading, setLoading] = useState(true);
  const [assigning, setAssigning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [prioritiesLocked, setPrioritiesLocked] = useState(false);

  useEffect(() => {
    if (selectedTeamId && saveGameId && currentSeason) {
      loadData();
    }
  }, [selectedTeamId, saveGameId, currentSeason]);

  async function loadData() {
    if (!selectedTeamId || !saveGameId || !currentSeason) return;

    setLoading(true);
    setError(null);

    try {
      // Check if priorities are locked
      const lockRes = await fetch(
        `/api/scouting/assign-priority?teamId=${selectedTeamId}&saveGameId=${saveGameId}&season=${currentSeason}`
      );
      // This will fail if locked, but we'll check via the actual assignment

      // Load scouts with priorities
      const scoutsRes = await fetch(
        `/api/scouting/team-scouts?teamId=${selectedTeamId}&saveGameId=${saveGameId}&season=${currentSeason}`
      );
      const scoutsData = await scoutsRes.json();

      if (scoutsData.success) {
        setScouts(scoutsData.scouts || []);
      }

      // Check if we're in preseason (week 0 or 1, phase = preseason)
      // Priorities are locked once season starts (week > 1 or phase != preseason)
      const week = 1; // Default to week 1 for preseason
      setPrioritiesLocked(false); // Will be set based on actual season state
    } catch (err) {
      console.error("Error loading priority data:", err);
      setError("Failed to load priority data");
    } finally {
      setLoading(false);
    }
  }

  async function handleAssignPriority(scoutId: string, priority: number) {
    if (!selectedTeamId || !saveGameId || !currentSeason) return;

    if (prioritiesLocked) {
      setError("Priorities are locked. Cannot change during the season.");
      return;
    }

    setAssigning(true);
    setError(null);

    try {
      const res = await fetch("/api/scouting/assign-priority", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamId: selectedTeamId,
          scoutId,
          priority,
          saveGameId,
          season: currentSeason,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to assign priority");
      }

      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to assign priority");
    } finally {
      setAssigning(false);
    }
  }

  const assignedPriorities = new Set(
    scouts.filter((s) => s.priority).map((s) => s.priority!.level)
  );
  const allPrioritiesAssigned = [1, 2, 3, 4].every((p) =>
    assignedPriorities.has(p)
  );

  if (loading) {
    return (
      <div className="p-6">
        <div className="text-center">Loading priority assignments...</div>
      </div>
    );
  }

  if (scouts.length === 0) {
    return (
      <div className="p-6">
        <div className="text-center text-gray-500">
          No scouts hired. Hire scouts first before assigning priorities.
        </div>
      </div>
    );
  }

  if (scouts.length !== 4) {
    return (
      <div className="p-6">
        <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-3 rounded">
          You must hire exactly 4 scouts before assigning priorities.
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <Target className="w-6 h-6" />
          Scout Priority Assignment
        </h2>
        {prioritiesLocked && (
          <div className="flex items-center gap-2 text-gray-600">
            <Lock className="w-5 h-5" />
            <span>Locked</span>
          </div>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded">
          {error}
        </div>
      )}

      {allPrioritiesAssigned && !prioritiesLocked && (
        <div className="bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded flex items-center gap-2">
          <CheckCircle className="w-5 h-5" />
          <span>
            All priorities assigned! You can change them until the season starts.
          </span>
        </div>
      )}

      {!allPrioritiesAssigned && (
        <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-3 rounded flex items-center gap-2">
          <AlertCircle className="w-5 h-5" />
          <span>
            Assign all 4 priorities (Primary, Secondary, Tertiary, Quaternary)
            before the season starts.
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((priorityLevel) => {
          const scoutWithPriority = scouts.find(
            (s) => s.priority?.level === priorityLevel
          );
          const availableScouts = scouts.filter(
            (s) => !s.priority || s.priority.level === priorityLevel
          );

          return (
            <div
              key={priorityLevel}
              className="border-2 rounded-lg p-4 bg-white shadow-sm"
            >
              <div className="mb-4">
                <h3 className="font-semibold text-lg">
                  {PRIORITY_NAMES[priorityLevel]}
                </h3>
                <p className="text-sm text-gray-600">
                  {PRIORITY_POINTS[priorityLevel]} points/week
                </p>
              </div>

              {scoutWithPriority ? (
                <div className="space-y-3">
                  <div className="bg-blue-50 border border-blue-200 rounded p-3">
                    <div className="font-semibold">
                      {scoutWithPriority.name}
                    </div>
                    <div className="text-xs text-gray-600">
                      {ARCHETYPE_NAMES[scoutWithPriority.archetype] ||
                        scoutWithPriority.archetype}
                    </div>
                  </div>
                  {!prioritiesLocked && (
                    <button
                      onClick={() => handleAssignPriority(scoutWithPriority.id, 0)}
                      disabled={assigning}
                      className="w-full text-sm text-red-600 hover:text-red-800 py-2 border border-red-200 rounded hover:bg-red-50 disabled:opacity-50"
                    >
                      Remove
                    </button>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="text-sm text-gray-500 text-center py-4">
                    Not assigned
                  </div>
                  {!prioritiesLocked && (
                    <div className="space-y-1">
                      {availableScouts.map((scout) => (
                        <button
                          key={scout.id}
                          onClick={() =>
                            handleAssignPriority(scout.id, priorityLevel)
                          }
                          disabled={assigning}
                          className="w-full text-sm text-blue-600 hover:text-blue-800 py-2 border border-blue-200 rounded hover:bg-blue-50 disabled:opacity-50"
                        >
                          Assign {scout.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-6 p-4 bg-gray-50 rounded-lg">
        <h4 className="font-semibold mb-2">Priority System</h4>
        <ul className="text-sm text-gray-600 space-y-1">
          <li>
            <strong>Primary (25 pts/week):</strong> Highest priority scout,
            most accurate reveals
          </li>
          <li>
            <strong>Secondary (15 pts/week):</strong> Second priority, good
            accuracy
          </li>
          <li>
            <strong>Tertiary (10 pts/week):</strong> Third priority, standard
            accuracy
          </li>
          <li>
            <strong>Quaternary (5 pts/week):</strong> Lowest priority, basic
            scouting
          </li>
        </ul>
        <p className="text-xs text-gray-500 mt-2">
          Priorities are locked once the season starts and cannot be changed
          until next preseason.
        </p>
      </div>
    </div>
  );
}

