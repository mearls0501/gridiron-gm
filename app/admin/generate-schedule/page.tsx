'use client';

import { useState } from 'react';
import { useGameStore } from '@/lib/store/game-store';

export default function GenerateSchedulePage() {
  const { saveGameId } = useGameStore();
  const [season, setSeason] = useState('2025');
  const [loading, setLoading] = useState(false);
  interface ScheduleResult {
    success: boolean;
    message: string;
    gameCount: number;
  }
  const [result, setResult] = useState<ScheduleResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch('/api/generate-schedule', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          season: parseInt(season),
          saveGameId: saveGameId || null,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to generate schedule');
      }

      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-lg shadow-md p-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-6">
            Schedule Information
          </h1>

          <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4 mb-6">
            <p className="text-yellow-800 font-medium mb-2">ℹ️ Schedules are Auto-Generated</p>
            <p className="text-yellow-700 text-sm">
              Schedules are automatically generated when you view the schedule page.
              No database storage is required. Each season&apos;s schedule is generated on-demand.
            </p>
          </div>

          <div className="space-y-6">
            <div>
              <label htmlFor="season" className="block text-sm font-medium text-gray-700 mb-2">
                Season Year (for preview)
              </label>
              <input
                id="season"
                type="number"
                value={season}
                onChange={(e) => setSeason(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="2025"
              />
            </div>

            <button
              onClick={handleGenerate}
              disabled={loading}
              className="w-full bg-blue-600 text-white py-3 px-6 rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:text-gray-700 disabled:cursor-not-allowed transition-colors font-medium"
            >
              {loading ? 'Generating Preview...' : 'Preview Schedule Generation'}
            </button>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-md p-4">
                <p className="text-red-800 font-medium">Error:</p>
                <p className="text-red-700">{error}</p>
              </div>
            )}

            {result && (
              <div className="bg-green-50 border border-green-200 rounded-md p-4">
                <p className="text-green-800 font-medium mb-2">Success!</p>
                <div className="text-green-700 space-y-1">
                  <p>{result.message}</p>
                  <p className="font-semibold">Total Games: {result.gameCount}</p>
                  {result.gameCount === 272 ? (
                    <p className="text-green-600 font-bold">✓ Exactly 272 games generated!</p>
                  ) : (
                    <p className="text-orange-600 font-bold">
                      ⚠ Warning: Expected 272 games, got {result.gameCount}
                    </p>
                  )}
                </div>
              </div>
            )}

            <div className="bg-blue-50 border border-blue-200 rounded-md p-4 mt-6">
              <p className="text-blue-900 font-medium mb-2">Schedule Details:</p>
              <ul className="text-blue-800 space-y-1 text-sm">
                <li>• 32 teams in 8 divisions</li>
                <li>• Each team plays 17 games over 18 weeks</li>
                <li>• Each team has 1 bye week (typically weeks 6-14)</li>
                <li>• Division opponents play each other twice (home & away)</li>
                <li>• Total games: 272 (32 teams × 17 games ÷ 2)</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

