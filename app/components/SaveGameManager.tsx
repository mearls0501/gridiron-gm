"use client";

import { useState, useEffect } from "react";
import { useGameStore } from "@/lib/store/game-store";
import { Save, FolderOpen, Trash2, X, Plus } from "lucide-react";
import { authFetch } from "@/lib/auth/browser-auth";

interface SaveGame {
  id: string;
  save_name: string;
  description: string | null;
  current_season: number;
  current_week: number;
  selected_team_id: string | null;
  game_state: any;
  metadata: any;
  created_at: string;
  updated_at: string;
  last_played_at: string;
}

export default function SaveGameManager({
  onClose,
  onLoad,
}: {
  onClose: () => void;
  onLoad?: () => void;
}) {
  const {
    currentSeason,
    currentWeek,
    selectedTeamId,
    saveGameId,
    setCurrentSeason,
    setCurrentWeek,
    setSelectedTeam,
    setSaveGameId,
    initializeFromStorage,
  } = useGameStore();

  // Ensure store is initialized on mount
  useEffect(() => {
    initializeFromStorage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [saveGames, setSaveGames] = useState<SaveGame[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showSaveForm, setShowSaveForm] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [saveDescription, setSaveDescription] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    loadSaveGames();
  }, []);

  async function loadSaveGames() {
    setLoading(true);
    try {
      const res = await authFetch("/api/save-game");
      const data = await res.json();
      if (res.status === 401) {
        console.warn("Not signed in; cannot list save games.");
        setSaveGames([]);
        return;
      }
      if (data.success) {
        setSaveGames(data.saveGames || []);
        if (data.message) {
          // Table doesn't exist - show message but don't error
          console.warn(data.message);
        }
      }
    } catch (error) {
      console.error("Error loading save games:", error);
    } finally {
      setLoading(false);
    }
  }

  async function saveGame() {
    if (!saveName.trim()) {
      alert("Please enter a save name");
      return;
    }

    // Ensure we have valid season and week values
    const seasonToSave = currentSeason || 2025;
    const weekToSave =
      currentWeek !== undefined && currentWeek !== null ? currentWeek : 0;

    if (!seasonToSave || weekToSave === undefined || weekToSave === null) {
      alert(
        `Cannot save: Missing game state. Season: ${seasonToSave}, Week: ${weekToSave}`
      );
      return;
    }

    // If we have an active saveGameId, check if the name is different
    // This helps prevent accidentally updating a save with a different name
    if (saveGameId && saveGames.length > 0) {
      const currentSave = saveGames.find((sg) => sg.id === saveGameId);
      if (currentSave && currentSave.save_name !== saveName.trim()) {
        const confirmUpdate = confirm(
          `You have an active save game "${currentSave.save_name}".\n\n` +
          `Saving with name "${saveName.trim()}" will UPDATE your current save game (ID: ${saveGameId.substring(0, 8)}...).\n\n` +
          `This will preserve all your current season data (games, stats, rosters).\n\n` +
          `Do you want to continue?`
        );
        if (!confirmUpdate) {
          return;
        }
      }
    }

    setSaving(true);
    try {
      // CRITICAL: Always pass saveGameId if it exists to UPDATE the current save
      // This prevents accidentally creating a new save and breaking the current season
      const res = await authFetch("/api/save-game", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          saveName: saveName.trim(),
          description: saveDescription.trim() || null,
          currentSeason: seasonToSave,
          currentWeek: weekToSave,
          selectedTeamId: selectedTeamId || null,
          saveGameId: saveGameId || null, // Pass current saveGameId to update, not create new
          gameState: {
            // Can add more game state here if needed
            timestamp: new Date().toISOString(),
          },
        }),
      });

      const data = await res.json();
      if (data.success) {
        // Only update saveGameId if we created a NEW save (not updating existing)
        // If we updated an existing save, the ID should remain the same
        if (data.saveGame?.id) {
          // Only update if we don't already have this saveGameId (new save was created)
          if (!saveGameId || saveGameId !== data.saveGame.id) {
            setSaveGameId(data.saveGame.id);
            console.log(`[SaveGameManager] Switched to new save: ${data.saveGame.id}`);
          } else {
            console.log(`[SaveGameManager] Updated existing save: ${data.saveGame.id}`);
          }
        }
        await loadSaveGames();
        setShowSaveForm(false);
        setSaveName("");
        setSaveDescription("");
        alert("Game saved successfully!");
      } else {
        // Show detailed error message
        let errorMsg = data.error || "Failed to save game";
        if (data.instructions) {
          errorMsg += "\n\n" + data.instructions.join("\n");
          if (data.sqlFile) {
            errorMsg += `\n\nSQL file: ${data.sqlFile}`;
          }
        }
        alert(errorMsg);
      }
    } catch (error) {
      console.error("Error saving game:", error);
      alert("Failed to save game");
    } finally {
      setSaving(false);
    }
  }

  async function loadGame(saveId: string) {
    try {
      const res = await authFetch("/api/load-game", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ saveId }),
      });

      const data = await res.json();
      if (data.success && data.gameState) {
        // Restore game state
        setCurrentSeason(data.gameState.currentSeason);
        setCurrentWeek(data.gameState.currentWeek);
        if (data.gameState.selectedTeamId) {
          setSelectedTeam(data.gameState.selectedTeamId);
        }

        // Set save_game_id in store
        if (data.saveGameId) {
          setSaveGameId(data.saveGameId);
        }

        // Call onLoad callback if provided
        if (onLoad) {
          onLoad();
        }

        onClose();
        alert(`Game loaded: ${data.saveGame.save_name}`);
      } else {
        alert(data.error || "Failed to load game");
      }
    } catch (error) {
      console.error("Error loading game:", error);
      alert("Failed to load game");
    }
  }

  async function deleteGame(saveId: string, saveName: string) {
    if (
      !confirm(
        `Are you sure you want to delete "${saveName}"? This cannot be undone.`
      )
    ) {
      return;
    }

    setDeleting(saveId);
    try {
      const res = await authFetch(`/api/save-game?id=${saveId}`, {
        method: "DELETE",
      });

      const data = await res.json();
      if (data.success) {
        await loadSaveGames();
      } else {
        alert(data.error || "Failed to delete save game");
      }
    } catch (error) {
      console.error("Error deleting save game:", error);
      alert("Failed to delete save game");
    } finally {
      setDeleting(null);
    }
  }

  // Debug: Log when component renders
  useEffect(() => {
    console.log("[SaveGameManager] Component mounted/rendered");
  }, []);

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999] p-4"
      onClick={(e) => {
        // Close when clicking the backdrop
        if (e.target === e.currentTarget) {
          console.log("[SaveGameManager] Backdrop clicked, closing");
          onClose();
        }
      }}
    >
      <div
        className="bg-white rounded-xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-8 py-6 text-white flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold mb-1">Save Game Manager</h2>
            <p className="text-blue-100 text-sm">
              Save and load your game progress
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-white hover:text-blue-200 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-8">
          {/* Save Current Game */}
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-900">
                Save Current Game
              </h3>
              <button
                onClick={() => {
                  // Pre-fill save name with current save's name if it exists
                  if (saveGameId && saveGames.length > 0) {
                    const currentSave = saveGames.find((sg) => sg.id === saveGameId);
                    if (currentSave) {
                      setSaveName(currentSave.save_name);
                      setSaveDescription(currentSave.description || "");
                    }
                  }
                  setShowSaveForm(!showSaveForm);
                }}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Plus className="w-4 h-4" />
                {saveGameId ? "Update Save" : "New Save"}
              </button>
            </div>

            {showSaveForm && (
              <div className="bg-slate-50 rounded-lg p-6 mb-4 border border-slate-200">
                {saveGameId && (
                  <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <p className="text-sm text-blue-800">
                      <strong>Updating current save:</strong> This will update your active save game and preserve all your current season data (games, stats, rosters).
                    </p>
                  </div>
                )}
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Save Name *
                    </label>
                    <input
                      type="text"
                      value={saveName}
                      onChange={(e) => setSaveName(e.target.value)}
                      placeholder="My Season 2025"
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-slate-900 bg-white placeholder:text-slate-400"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Description (optional)
                    </label>
                    <textarea
                      value={saveDescription}
                      onChange={(e) => setSaveDescription(e.target.value)}
                      placeholder="Week 5, 3-1 record, leading division..."
                      rows={3}
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-slate-900 bg-white placeholder:text-slate-400"
                    />
                  </div>
                  <div className="flex gap-3">
                    <button
                      onClick={saveGame}
                      disabled={saving || !saveName.trim()}
                      className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {saving ? "Saving..." : "Save Game"}
                    </button>
                    <button
                      onClick={() => {
                        setShowSaveForm(false);
                        setSaveName("");
                        setSaveDescription("");
                      }}
                      className="px-6 py-2 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="text-sm text-blue-800">
                <p className="font-medium mb-1">Current Game State:</p>
                <p>
                  Season {currentSeason || 2025} • Week{" "}
                  {currentWeek !== undefined && currentWeek !== null
                    ? currentWeek
                    : 0}
                </p>
                {selectedTeamId && (
                  <p className="mt-1">Team Selected: {selectedTeamId}</p>
                )}
                {(!currentSeason ||
                  currentWeek === undefined ||
                  currentWeek === null) && (
                  <p className="mt-2 text-orange-700 font-medium">
                    ⚠️ Warning: Some game state values are missing. Defaults
                    will be used when saving.
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Load Saved Games */}
          <div>
            <h3 className="text-lg font-semibold text-slate-900 mb-4">
              Saved Games
            </h3>
            {loading ? (
              <div className="text-center py-8">
                <p className="text-slate-500">Loading save games...</p>
              </div>
            ) : saveGames.length === 0 ? (
              <div className="text-center py-8 bg-slate-50 rounded-lg border border-slate-200">
                <p className="text-slate-500">No saved games found</p>
                <p className="text-slate-400 text-sm mt-2">
                  Create a save to get started
                </p>
                <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg text-left">
                  <p className="text-sm font-medium text-yellow-800 mb-2">
                    ⚠️ Save games table may not exist
                  </p>
                  <p className="text-xs text-yellow-700 mb-2">
                    If you see an error when saving, run the migration:
                  </p>
                  <ol className="text-xs text-yellow-700 list-decimal list-inside space-y-1">
                    <li>Go to Supabase Dashboard → SQL Editor</li>
                    <li>
                      Run:{" "}
                      <code className="bg-yellow-100 px-1 rounded">
                        supabase/migrations/create_save_games.sql
                      </code>
                    </li>
                  </ol>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {saveGames.map((save) => (
                  <div
                    key={save.id}
                    className="bg-slate-50 rounded-lg p-4 border border-slate-200 hover:border-blue-300 transition-colors"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h4 className="font-semibold text-slate-900 mb-1">
                          {save.save_name}
                        </h4>
                        {save.description && (
                          <p className="text-sm text-slate-600 mb-2">
                            {save.description}
                          </p>
                        )}
                        <div className="flex items-center gap-4 text-xs text-slate-500">
                          <span>
                            Season {save.current_season} • Week{" "}
                            {save.current_week}
                          </span>
                          <span>•</span>
                          <span>
                            Last played:{" "}
                            {new Date(save.last_played_at).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 ml-4">
                        <button
                          onClick={() => loadGame(save.id)}
                          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
                        >
                          <FolderOpen className="w-4 h-4" />
                          Load
                        </button>
                        <button
                          onClick={() => deleteGame(save.id, save.save_name)}
                          disabled={deleting === save.id}
                          className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
                        >
                          {deleting === save.id ? (
                            "Deleting..."
                          ) : (
                            <Trash2 className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
