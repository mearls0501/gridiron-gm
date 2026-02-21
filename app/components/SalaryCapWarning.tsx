"use client";

import { useState, useEffect } from "react";
import { AlertTriangle, DollarSign } from "lucide-react";
import { useGameStore } from "@/lib/store/game-store";
import Link from "next/link";

export default function SalaryCapWarning() {
  const { selectedTeamId, saveGameId } = useGameStore();
  const [capStatus, setCapStatus] = useState<{
    isCompliant: boolean;
    capOverage: number;
    currentCapHit: number;
    percentUsed: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [fixing, setFixing] = useState(false);

  useEffect(() => {
    if (selectedTeamId && saveGameId) {
      checkCapStatus();
    }
  }, [selectedTeamId, saveGameId]);

  async function checkCapStatus() {
    if (!selectedTeamId || !saveGameId) return;

    try {
      const response = await fetch("/api/salary-cap/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamId: selectedTeamId,
          saveGameId,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setCapStatus(data);
      }
    } catch (error) {
      console.error("Error checking cap status:", error);
    } finally {
      setLoading(false);
    }
  }

  async function handleAutoFix() {
    if (!selectedTeamId || !saveGameId) return;

    if (
      !confirm(
        "Auto-fix will cut your highest-paid, lowest-rated players until you're under the cap. Continue?"
      )
    ) {
      return;
    }

    setFixing(true);
    try {
      const response = await fetch("/api/salary-cap/auto-fix", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamId: selectedTeamId,
          saveGameId,
        }),
      });

      const data = await response.json();
      if (data.success) {
        alert(data.message);
        await checkCapStatus(); // Refresh status
        window.location.reload(); // Refresh page to update rosters
      } else {
        alert(`Failed to auto-fix: ${data.error}`);
      }
    } catch (error) {
      console.error("Error auto-fixing cap:", error);
      alert("Failed to auto-fix salary cap");
    } finally {
      setFixing(false);
    }
  }

  if (loading || !capStatus || capStatus.isCompliant) {
    return null; // Don't show anything if under cap
  }

  return (
    <div className="mb-6 bg-red-50 border-2 border-red-300 rounded-lg p-6">
      <div className="flex items-start gap-4">
        <AlertTriangle className="w-8 h-8 text-red-600 flex-shrink-0 mt-1" />
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <h3 className="text-lg font-bold text-red-900">
              Salary Cap Violation
            </h3>
            <DollarSign className="w-5 h-5 text-red-600" />
          </div>
          <p className="text-red-800 mb-4">
            Your team is{" "}
            <span className="font-bold">
              ${(capStatus.capOverage / 1000000).toFixed(1)}M over the salary
              cap
            </span>{" "}
            ({(capStatus.percentUsed).toFixed(1)}% of cap used). You cannot
            simulate games or advance weeks until you're cap compliant.
          </p>
          <div className="flex items-center gap-3">
            <Link
              href="/teams/contracts"
              className="px-4 py-2 bg-white border-2 border-red-300 text-red-700 rounded-lg font-semibold hover:bg-red-50 transition-colors"
            >
              Manage Contracts
            </Link>
            <button
              onClick={handleAutoFix}
              disabled={fixing}
              className="px-4 py-2 bg-red-600 text-white rounded-lg font-semibold hover:bg-red-700 transition-colors disabled:opacity-50"
            >
              {fixing ? "Fixing..." : "Auto-Fix (Cut Players)"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}



