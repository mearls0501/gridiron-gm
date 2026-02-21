"use client";

import { X, Settings, Check, AlertTriangle } from "lucide-react";
import { useGameStore, GameSettings, DEFAULT_SETTINGS } from "@/lib/store/game-store";

interface GameSettingsModalProps {
  onClose: () => void;
}

export default function GameSettingsModal({ onClose }: GameSettingsModalProps) {
  const { settings, updateSettings } = useGameStore();

  const toggleSetting = (key: keyof GameSettings) => {
    updateSettings({ [key]: !settings[key] });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden transform transition-all scale-100">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Settings className="w-5 h-5 text-slate-600" />
            Game Settings
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider">Automation</h3>
            
            <SettingToggle
              label="Auto Scouting"
              description="CPU automatically assigns weekly scouting points."
              enabled={settings.autoScouting}
              onChange={() => toggleSetting("autoScouting")}
            />
            
            <SettingToggle
              label="Auto Depth Chart"
              description="CPU automatically reorders depth chart after injuries/signings."
              enabled={settings.autoDepthChart}
              onChange={() => toggleSetting("autoDepthChart")}
            />
            
            <SettingToggle
              label="Auto Roster Moves"
              description="CPU handles cuts, signings, and injury placement."
              enabled={settings.autoRosterMoves}
              onChange={() => toggleSetting("autoRosterMoves")}
              warning="Use with caution. CPU may cut players you like."
            />

            <SettingToggle
                label="Auto Training"
                description="CPU manages weekly training focus."
                enabled={settings.autoTraining}
                onChange={() => toggleSetting("autoTraining")}
            />
          </div>

          <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 text-sm text-blue-700">
            <p className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>Enabling automation allows you to skip manual tasks during the weekly progression. Manual tasks are blocking by default.</span>
            </p>
          </div>
        </div>

        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

function SettingToggle({
  label,
  description,
  enabled,
  onChange,
  warning,
}: {
  label: string;
  description: string;
  enabled: boolean;
  onChange: () => void;
  warning?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4 p-3 rounded-lg hover:bg-slate-50 transition-colors border border-transparent hover:border-slate-100">
      <div className="flex-1">
        <h4 className="font-medium text-gray-900">{label}</h4>
        <p className="text-sm text-gray-500">{description}</p>
        {warning && enabled && (
            <p className="text-xs text-orange-600 mt-1 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> {warning}
            </p>
        )}
      </div>
      <button
        onClick={onChange}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
          enabled ? "bg-blue-600" : "bg-gray-200"
        }`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
            enabled ? "translate-x-6" : "translate-x-1"
          }`}
        />
      </button>
    </div>
  );
}

