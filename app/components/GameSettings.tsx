"use client";

import { useState, useEffect } from "react";
import { useGameStore } from "@/lib/store/game-store";
import { Settings, Save, RotateCcw, Info, CheckCircle } from "lucide-react";
import { authFetch } from "@/lib/auth/browser-auth";

interface GameSettingsData {
  injury_management: "auto" | "manual";
  depth_chart_management: "auto" | "manual";
  scouting_management: "auto" | "manual";
  contract_management: "auto" | "manual";
  roster_management: "auto" | "manual";
}

const DEFAULT_SETTINGS: GameSettingsData = {
  injury_management: "manual",
  depth_chart_management: "manual",
  scouting_management: "manual",
  contract_management: "manual",
  roster_management: "manual",
};

export default function GameSettings() {
  const { saveGameId } = useGameStore();
  const [settings, setSettings] = useState<GameSettingsData>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    loadSettings();
  }, [saveGameId]);

  async function loadSettings() {
    if (!saveGameId) {
      setSettings(DEFAULT_SETTINGS);
      setLoading(false);
      return;
    }

    try {
      const response = await authFetch(
        `/api/game-settings?saveGameId=${saveGameId}`
      );
      const data = await response.json();

      if (data.settings) {
        setSettings(data.settings);
      } else {
        setSettings(DEFAULT_SETTINGS);
      }
    } catch (error) {
      console.error("Error loading game settings:", error);
      setSettings(DEFAULT_SETTINGS);
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    if (!saveGameId) {
      alert("Please save your game first before changing settings.");
      return;
    }

    try {
      setSaving(true);
      const response = await authFetch("/api/game-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          saveGameId,
          settings,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        alert(`Error: ${error.error}`);
        return;
      }

      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (error) {
      console.error("Error saving settings:", error);
      alert("Failed to save settings. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  function handleReset() {
    if (
      confirm(
        "Are you sure you want to reset all settings to manual mode? This will require you to complete all tasks yourself."
      )
    ) {
      setSettings(DEFAULT_SETTINGS);
    }
  }

  function updateSetting(
    key: keyof GameSettingsData,
    value: "auto" | "manual"
  ) {
    setSettings((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  }

  const settingLabels: Record<keyof GameSettingsData, { name: string; description: string }> = {
    injury_management: {
      name: "Injury Management",
      description: "Auto: CPU handles injured player decisions. Manual: You manage the injury reserve list.",
    },
    depth_chart_management: {
      name: "Depth Chart Management",
      description: "Auto: CPU reorders depth charts when players are injured or perform poorly. Manual: You control the depth chart.",
    },
    scouting_management: {
      name: "Scouting Management",
      description: "Auto: CPU automatically scouts prospects during the season. Manual: You assign scouting targets.",
    },
    contract_management: {
      name: "Contract Management",
      description: "Auto: CPU makes contract decisions for expiring deals. Manual: You negotiate all contracts.",
    },
    roster_management: {
      name: "Roster Management",
      description: "Auto: CPU cuts players to meet roster limits. Manual: You decide who to cut.",
    },
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <p className="text-gray-600">Loading settings...</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-lg">
      {/* Header */}
      <div className="border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Settings className="w-6 h-6 text-blue-600" />
            <div>
              <h2 className="text-xl font-bold text-gray-900">Game Settings</h2>
              <p className="text-sm text-gray-600">
                Configure automation preferences for your franchise
              </p>
            </div>
          </div>
          {saved && (
            <div className="flex items-center gap-2 text-green-600">
              <CheckCircle className="w-5 h-5" />
              <span className="font-semibold">Saved!</span>
            </div>
          )}
        </div>
      </div>

      {/* Info Banner */}
      <div className="bg-blue-50 border-b border-blue-100 px-6 py-4">
        <div className="flex items-start gap-3">
          <Info className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
          <div className="text-sm text-blue-900">
            <p className="font-semibold mb-1">About Automation Settings</p>
            <p>
              <strong>AUTO mode:</strong> The CPU handles these tasks for you automatically, allowing you to focus on strategy.
              <br />
              <strong>MANUAL mode:</strong> You must complete these tasks yourself before advancing to the next phase.
            </p>
          </div>
        </div>
      </div>

      {/* Settings List */}
      <div className="divide-y divide-gray-200">
        {(Object.keys(settingLabels) as Array<keyof GameSettingsData>).map((key) => (
          <div key={key} className="px-6 py-5">
            <div className="flex items-start justify-between">
              <div className="flex-1 mr-6">
                <h3 className="text-base font-semibold text-gray-900 mb-1">
                  {settingLabels[key].name}
                </h3>
                <p className="text-sm text-gray-600">
                  {settingLabels[key].description}
                </p>
              </div>
              <div className="flex items-center gap-2 bg-gray-100 rounded-lg p-1">
                <button
                  onClick={() => updateSetting(key, "manual")}
                  className={`px-4 py-2 rounded-md text-sm font-semibold transition-all ${
                    settings[key] === "manual"
                      ? "bg-white text-gray-900 shadow"
                      : "text-gray-600 hover:text-gray-900"
                  }`}
                >
                  Manual
                </button>
                <button
                  onClick={() => updateSetting(key, "auto")}
                  className={`px-4 py-2 rounded-md text-sm font-semibold transition-all ${
                    settings[key] === "auto"
                      ? "bg-blue-600 text-white shadow"
                      : "text-gray-600 hover:text-gray-900"
                  }`}
                >
                  Auto
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="border-t border-gray-200 px-6 py-4 bg-gray-50 flex items-center justify-between">
        <button
          onClick={handleReset}
          className="flex items-center gap-2 px-4 py-2 text-gray-700 hover:bg-gray-200 rounded-lg transition-colors"
        >
          <RotateCcw className="w-4 h-4" />
          Reset to Manual
        </button>
        <button
          onClick={handleSave}
          disabled={saving || !saveGameId}
          className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-semibold"
        >
          <Save className="w-4 h-4" />
          {saving ? "Saving..." : "Save Settings"}
        </button>
      </div>
    </div>
  );
}

