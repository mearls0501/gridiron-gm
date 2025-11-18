'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase-client';
import { Play, FolderOpen, Plus, Loader2 } from 'lucide-react';
import GameSetupWizard from './components/GameSetupWizard';
import SaveGameManager from './components/SaveGameManager';

export default function Home() {
  const [hasExistingGame, setHasExistingGame] = useState<boolean | null>(null);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [showWizard, setShowWizard] = useState(false);
  const [showSaveManager, setShowSaveManager] = useState(false);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    checkGameState();
  }, []);

  async function checkGameState() {
    try {
      // Check if teams exist (indicates a game has been set up)
      const { count: teamCount } = await supabase
        .from('teams')
        .select('*', { count: 'exact', head: true });

      // Check for stored selected team (only in browser)
      let storedTeamId: string | null = null;
      if (typeof window !== 'undefined') {
        storedTeamId = localStorage.getItem('selectedTeamId');
      }
      
      setHasExistingGame((teamCount || 0) > 0);
      setSelectedTeamId(storedTeamId);
    } catch (error) {
      console.error('Error checking game state:', error);
      setHasExistingGame(false);
    } finally {
      setLoading(false);
    }
  }

  function handleContinueGame() {
    if (selectedTeamId) {
      router.push('/teams/my-team');
    } else {
      router.push('/teams');
    }
  }

  function handleLoadGame() {
    setShowSaveManager(true);
  }

  function handleSaveManagerClose() {
    setShowSaveManager(false);
  }

  function handleGameLoaded() {
    // Refresh the page to ensure all components pick up the new game state
    window.location.reload();
  }

  function handleStartNewGame() {
    setShowWizard(true);
  }

  function handleWizardComplete(teamId: string) {
    setSelectedTeamId(teamId);
    setShowWizard(false);
    router.push('/teams/my-team');
  }

  function handleWizardCancel() {
    setShowWizard(false);
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-blue-600" />
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (showWizard) {
    return <GameSetupWizard onComplete={handleWizardComplete} onCancel={handleWizardCancel} />;
  }

  if (showSaveManager) {
    return <SaveGameManager onClose={handleSaveManagerClose} onLoad={handleGameLoaded} />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-4">
      <div className="max-w-4xl w-full">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-5xl font-bold text-gray-900 mb-4">Gridiron GM</h1>
          <p className="text-xl text-gray-600">Build your franchise. Lead your team to victory.</p>
        </div>

        {/* Game Options */}
        <div className="grid md:grid-cols-3 gap-6">
          {/* Continue Game */}
          {hasExistingGame && (
            <button
              onClick={handleContinueGame}
              className="group relative bg-white rounded-lg shadow-lg hover:shadow-xl transition-all duration-300 p-8 border-2 border-transparent hover:border-blue-500"
            >
              <div className="flex flex-col items-center text-center">
                <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mb-4 group-hover:bg-blue-500 transition-colors">
                  <Play className="w-8 h-8 text-blue-600 group-hover:text-white transition-colors" />
                </div>
                <h2 className="text-xl font-bold text-gray-900 mb-2">Continue Game</h2>
                <p className="text-gray-600 text-sm">
                  {selectedTeamId ? 'Resume your current game' : 'Continue your saved game'}
                </p>
              </div>
            </button>
          )}

          {/* Load Game */}
          {hasExistingGame && (
            <button
              onClick={handleLoadGame}
              className="group relative bg-white rounded-lg shadow-lg hover:shadow-xl transition-all duration-300 p-8 border-2 border-transparent hover:border-green-500"
            >
              <div className="flex flex-col items-center text-center">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4 group-hover:bg-green-500 transition-colors">
                  <FolderOpen className="w-8 h-8 text-green-600 group-hover:text-white transition-colors" />
                </div>
                <h2 className="text-xl font-bold text-gray-900 mb-2">Load Game</h2>
                <p className="text-gray-600 text-sm">Browse and select a saved game</p>
              </div>
            </button>
          )}

          {/* Start New Game */}
          <button
            onClick={handleStartNewGame}
            className="group relative bg-white rounded-lg shadow-lg hover:shadow-xl transition-all duration-300 p-8 border-2 border-transparent hover:border-purple-500"
          >
            <div className="flex flex-col items-center text-center">
              <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mb-4 group-hover:bg-purple-500 transition-colors">
                <Plus className="w-8 h-8 text-purple-600 group-hover:text-white transition-colors" />
              </div>
              <h2 className="text-xl font-bold text-gray-900 mb-2">Start New Game</h2>
              <p className="text-gray-600 text-sm">Create a new league and pick your team</p>
            </div>
          </button>
        </div>

        {/* Info Section */}
        {!hasExistingGame && (
          <div className="mt-12 bg-blue-50 border border-blue-200 rounded-lg p-6 text-center">
            <p className="text-gray-700">
              <strong>Welcome!</strong> Start by creating a new game to set up your league.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
