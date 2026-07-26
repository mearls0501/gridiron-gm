'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase-client';
import { useGameStore } from '@/lib/store/game-store';
import {
  AlertCircle,
  Users,
  Target,
  Activity,
  ListChecks,
  Settings as SettingsIcon,
  Calendar,
} from 'lucide-react';
import Link from 'next/link';
import PhaseProgressTracker from '@/app/components/PhaseProgressTracker';
import GameSettings from '@/app/components/GameSettings';
import SalaryCapWarning from '@/app/components/SalaryCapWarning';
import { authFetch } from '@/lib/auth/browser-auth';

interface GameSettingsData {
  injury_management: 'auto' | 'manual';
  depth_chart_management: 'auto' | 'manual';
  scouting_management: 'auto' | 'manual';
  contract_management: 'auto' | 'manual';
  roster_management: 'auto' | 'manual';
}

export default function RegularSeasonPage() {
  const { saveGameId, selectedTeamId, currentSeason, currentWeek, seasonPhase } = useGameStore();
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<GameSettingsData | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  
  // Task completion states
  const [injuriesManaged, setInjuriesManaged] = useState(false);
  const [depthChartUpdated, setDepthChartUpdated] = useState(false);
  const [scoutingAssigned, setScoutingAssigned] = useState(false);

  const loadRegularSeasonData = useCallback(async () => {
    if (!saveGameId || !selectedTeamId) return;

    try {
      setLoading(true);

      // Load game settings
      const response = await authFetch(`/api/game-settings?saveGameId=${saveGameId}`);
      const data = await response.json();
      setSettings(data.settings || null);

      // For AUTO mode tasks, automatically mark as completed
      if (data.settings) {
        setInjuriesManaged(data.settings.injury_management === 'auto');
        setDepthChartUpdated(data.settings.depth_chart_management === 'auto');
        setScoutingAssigned(data.settings.scouting_management === 'auto');
      }

      // TODO: Add actual checks for MANUAL mode tasks
      // For now, we'll assume tasks need to be done manually
      
    } catch (error) {
      console.error('Error loading regular season data:', error);
    } finally {
      setLoading(false);
    }
  }, [saveGameId, selectedTeamId]);

  useEffect(() => {
    loadRegularSeasonData();
  }, [loadRegularSeasonData]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-gray-50 to-slate-100">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="bg-white rounded-xl shadow-lg p-8">
            <p className="text-gray-600">Loading regular season...</p>
          </div>
        </div>
      </div>
    );
  }

  // Check if we're in regular season
  const isRegularSeason = seasonPhase === 'regular_season';

  if (!isRegularSeason) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-gray-50 to-slate-100">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="bg-white rounded-xl shadow-lg p-8">
            <div className="text-center">
              <AlertCircle className="w-16 h-16 text-orange-500 mx-auto mb-4" />
              <h2 className="text-2xl font-bold text-gray-900 mb-2">
                Not in Regular Season
              </h2>
              <p className="text-gray-600 mb-4">
                Current phase: <strong>{seasonPhase || 'Unknown'}</strong>
              </p>
              <Link
                href="/"
                className="inline-block px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Go to Home
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Build tasks based on settings
  const tasks = [
    {
      id: 'injuries',
      name: 'Manage Injuries',
      description:
        settings?.injury_management === 'auto'
          ? 'AUTO: Injuries are being managed automatically by the CPU'
          : 'Review injured players and make roster adjustments',
      completed: injuriesManaged,
      required: settings?.injury_management === 'manual',
      link: '/teams/roster',
      icon: <Activity className="w-4 h-4 text-red-600" />,
    },
    {
      id: 'depth-chart',
      name: 'Update Depth Chart',
      description:
        settings?.depth_chart_management === 'auto'
          ? 'AUTO: Depth charts are being updated automatically by the CPU'
          : 'Adjust your depth chart based on performance and injuries',
      completed: depthChartUpdated,
      required: settings?.depth_chart_management === 'manual',
      link: '/teams/depth-chart',
      icon: <ListChecks className="w-4 h-4 text-blue-600" />,
    },
    {
      id: 'scouting',
      name: 'Assign Scouting Targets',
      description:
        settings?.scouting_management === 'auto'
          ? 'AUTO: Scouting is being handled automatically by the CPU'
          : 'Review and scout draft prospects for the upcoming draft',
      completed: scoutingAssigned,
      required: settings?.scouting_management === 'manual',
      link: '/draft',
      icon: <Target className="w-4 h-4 text-purple-600" />,
    },
  ];

  // Calculate if can advance (all required tasks completed)
  const requiredTasks = tasks.filter(t => t.required);
  const canAdvance = requiredTasks.every(t => t.completed);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-gray-50 to-slate-100">
      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="bg-white rounded-xl shadow-lg border border-slate-200 mb-6 overflow-hidden">
          <div
            className="bg-gradient-to-r from-green-900 via-green-800 to-green-900 px-8 py-6"
            style={{
              background: "linear-gradient(to right, #065f46, #047857, #065f46)",
            }}
          >
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-black text-white tracking-tight mb-2">
                  {currentSeason} Regular Season
                </h1>
                <p className="text-slate-300">Week {currentWeek} - Manage your team</p>
              </div>
              <button
                onClick={() => setShowSettings(!showSettings)}
                className="flex items-center gap-2 px-4 py-2 bg-white bg-opacity-20 hover:bg-opacity-30 rounded-lg text-white transition-colors"
              >
                <SettingsIcon className="w-5 h-5" />
                {showSettings ? 'Hide' : 'Show'} Settings
              </button>
            </div>
          </div>
        </div>

        {/* Game Settings */}
        {showSettings && (
          <div className="mb-6">
            <GameSettings />
          </div>
        )}

        {/* Phase Progress Tracker */}
        <div className="mb-6">
          <PhaseProgressTracker
            phase="regular_season"
            season={currentSeason}
            tasks={tasks}
            canAdvance={canAdvance}
            advancingTo="Continue Season"
            showAdvanceButton={false}
          />
        </div>

        {/* Salary Cap Warning */}
        <SalaryCapWarning />

        {/* Info Banner */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-6">
          <div className="flex items-start gap-3">
            <Calendar className="w-5 h-5 text-blue-600 mt-0.5" />
            <div>
              <h3 className="font-semibold text-blue-900 mb-1">
                Regular Season Task Management
              </h3>
              <p className="text-blue-800 text-sm">
                During the regular season, you can manage injuries, depth charts, and scouting on a weekly basis.
                Configure your automation settings above to have the CPU handle these tasks automatically, or keep them on MANUAL to manage everything yourself.
              </p>
              <p className="text-blue-800 text-sm mt-2">
                To simulate games and advance through the season, use the <strong>Advance Week</strong> button on the home page or league schedule.
              </p>
            </div>
          </div>
        </div>

        {/* Quick Links */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Link
            href="/teams/roster"
            className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition-shadow border border-gray-200"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center">
                <Activity className="w-6 h-6 text-red-600" />
              </div>
              <div>
                <h3 className="font-bold text-gray-900">Injury Report</h3>
                <p className="text-sm text-gray-600">View injured players</p>
              </div>
            </div>
          </Link>

          <Link
            href="/teams/depth-chart"
            className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition-shadow border border-gray-200"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                <ListChecks className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <h3 className="font-bold text-gray-900">Depth Chart</h3>
                <p className="text-sm text-gray-600">Manage lineup</p>
              </div>
            </div>
          </Link>

          <Link
            href="/draft"
            className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition-shadow border border-gray-200"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                <Target className="w-6 h-6 text-purple-600" />
              </div>
              <div>
                <h3 className="font-bold text-gray-900">Scouting</h3>
                <p className="text-sm text-gray-600">Scout prospects</p>
              </div>
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}

