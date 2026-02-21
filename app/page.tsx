"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Play, FolderOpen, Plus } from "lucide-react";
import { useGameStore } from "@/lib/store/game-store";
import GameSetupWizard from "./components/GameSetupWizard";
import SaveGameManager from "./components/SaveGameManager";

export default function Home() {
  const { saveGameId, selectedTeamId } = useGameStore();
  const [showWizard, setShowWizard] = useState(false);
  const [showSaveManager, setShowSaveManager] = useState(false);
  const router = useRouter();

  // Debug: Log state changes
  useEffect(() => {
    console.log(
      "[Home] State changed - showSaveManager:",
      showSaveManager,
      "showWizard:",
      showWizard
    );
  }, [showSaveManager, showWizard]);

  function handleContinueGame() {
    // Check if we have a save game loaded
    if (saveGameId) {
      // Load the game and navigate to my team
      router.push("/teams/my-team");
    } else {
      // No game loaded, show save manager to load one
      setShowSaveManager(true);
    }
  }

  function handleLoadGame() {
    console.log("[Home] Load Game clicked, setting showSaveManager to true");
    setShowSaveManager(true);
  }

  function handleSaveManagerClose() {
    setShowSaveManager(false);
  }

  function handleGameLoaded() {
    // Navigate to the game after loading
    router.push("/teams/my-team");
  }

  function handleStartNewGame() {
    setShowWizard(true);
  }

  function handleWizardComplete(teamId: string) {
    setShowWizard(false);
    router.push("/teams/my-team");
  }

  function handleWizardCancel() {
    setShowWizard(false);
  }

  if (showWizard) {
    return (
      <GameSetupWizard
        onComplete={handleWizardComplete}
        onCancel={handleWizardCancel}
      />
    );
  }

  return (
    <>
      {showSaveManager && (
        <SaveGameManager
          onClose={handleSaveManagerClose}
          onLoad={handleGameLoaded}
        />
      )}
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
        <div className="max-w-5xl w-full">
          {/* Header */}
          <div className="text-center mb-16">
            <h1 className="text-7xl font-black text-white mb-6 tracking-tight">
              GRIDIRON GM
            </h1>
            <p className="text-2xl text-slate-300 font-light">
              Build your franchise. Lead your team to victory.
            </p>
          </div>

          {/* Game Options */}
          <div className="grid md:grid-cols-3 gap-8">
            {/* Continue Game */}
            <button
              onClick={handleContinueGame}
              className="group relative bg-gradient-to-br from-blue-600 to-blue-700 rounded-2xl shadow-2xl hover:shadow-blue-500/50 transition-all duration-300 p-10 border-2 border-blue-500/30 hover:border-blue-400 hover:scale-105 transform"
            >
              <div className="flex flex-col items-center text-center">
                <div className="w-20 h-20 bg-white/20 rounded-full flex items-center justify-center mb-6 group-hover:bg-white/30 transition-colors backdrop-blur-sm">
                  <Play className="w-10 h-10 text-white" fill="white" />
                </div>
                <h2 className="text-2xl font-bold text-white mb-3">
                  Continue Game
                </h2>
                <p className="text-blue-100 text-sm leading-relaxed">
                  Resume your current game or load a saved game
                </p>
              </div>
            </button>

            {/* Load Game */}
            <button
              onClick={() => {
                console.log(
                  "[Home] Load Game button clicked - BEFORE setState"
                );
                setShowSaveManager(true);
                console.log("[Home] Load Game button clicked - AFTER setState");
              }}
              type="button"
              className="group relative bg-gradient-to-br from-green-600 to-green-700 rounded-2xl shadow-2xl hover:shadow-green-500/50 transition-all duration-300 p-10 border-2 border-green-500/30 hover:border-green-400 hover:scale-105 transform cursor-pointer"
            >
              <div className="flex flex-col items-center text-center">
                <div className="w-20 h-20 bg-white/20 rounded-full flex items-center justify-center mb-6 group-hover:bg-white/30 transition-colors backdrop-blur-sm">
                  <FolderOpen className="w-10 h-10 text-white" fill="white" />
                </div>
                <h2 className="text-2xl font-bold text-white mb-3">
                  Load Game
                </h2>
                <p className="text-green-100 text-sm leading-relaxed">
                  Browse and select a saved game
                </p>
              </div>
            </button>

            {/* Start New Game */}
            <button
              onClick={handleStartNewGame}
              className="group relative bg-gradient-to-br from-purple-600 to-purple-700 rounded-2xl shadow-2xl hover:shadow-purple-500/50 transition-all duration-300 p-10 border-2 border-purple-500/30 hover:border-purple-400 hover:scale-105 transform"
            >
              <div className="flex flex-col items-center text-center">
                <div className="w-20 h-20 bg-white/20 rounded-full flex items-center justify-center mb-6 group-hover:bg-white/30 transition-colors backdrop-blur-sm">
                  <Plus className="w-10 h-10 text-white" strokeWidth={3} />
                </div>
                <h2 className="text-2xl font-bold text-white mb-3">
                  Start New Game
                </h2>
                <p className="text-purple-100 text-sm leading-relaxed">
                  Create a new league and pick your team
                </p>
              </div>
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
