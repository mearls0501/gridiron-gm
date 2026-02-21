"use client";

import { useState } from "react";
import { Users, Loader2, Check, AlertCircle } from "lucide-react";

export default function SeedFreeAgentsPage() {
  const [count, setCount] = useState(200);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSeed() {
    if (count < 1 || count > 1000) {
      setError("Count must be between 1 and 1000");
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch("/api/free-agents/seed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ count }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to seed free agents");
      }

      setSuccess(data.message);
      setTimeout(() => setSuccess(null), 5000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to seed free agents");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-4xl mx-auto mt-12 p-6">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <Users className="w-8 h-8 text-blue-600" />
          <h1 className="text-4xl font-bold">Seed Free Agents</h1>
        </div>
        <p className="text-gray-600">
          Generate free agent players for the database. This should only be done once during initial setup.
        </p>
      </div>

      {/* Success Message */}
      {success && (
        <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg flex items-center gap-3">
          <Check className="w-5 h-5 text-green-600" />
          <p className="text-green-800">{success}</p>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-600" />
          <p className="text-red-800">{error}</p>
        </div>
      )}

      {/* Warning */}
      <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
        <h3 className="font-bold text-yellow-900 mb-2">⚠️ Important Notes</h3>
        <ul className="list-disc list-inside text-sm text-yellow-800 space-y-1">
          <li>Free agents are shared across all save games</li>
          <li>This will add new free agents to the existing pool (not replace them)</li>
          <li>Requires SUPABASE_SERVICE_ROLE_KEY environment variable</li>
          <li>Normally this is done automatically during game creation</li>
        </ul>
      </div>

      {/* Seed Form */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Number of Free Agents to Generate
          </label>
          <input
            type="number"
            min="1"
            max="1000"
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            disabled={loading}
          />
          <p className="mt-1 text-sm text-gray-500">
            Recommended: 200 players. Max: 1000
          </p>
        </div>

        <button
          onClick={handleSeed}
          disabled={loading || count < 1 || count > 1000}
          className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:text-gray-600 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Generating free agents...
            </>
          ) : (
            <>
              <Users className="w-5 h-5" />
              Seed Free Agents
            </>
          )}
        </button>
      </div>

      {/* Environment Variable Check */}
      <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <h3 className="font-bold text-blue-900 mb-2">Environment Setup</h3>
        <p className="text-sm text-blue-800 mb-2">
          Make sure you have set the following environment variable:
        </p>
        <code className="block bg-blue-100 text-blue-900 px-3 py-2 rounded text-sm font-mono">
          SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
        </code>
        <p className="text-sm text-blue-700 mt-2">
          Find this in: Supabase Dashboard → Settings → API → service_role key
        </p>
      </div>

      {/* Instructions */}
      <div className="mt-6 p-4 bg-gray-50 border border-gray-200 rounded-lg">
        <h3 className="font-bold text-gray-900 mb-2">How Free Agents Work</h3>
        <ol className="list-decimal list-inside text-sm text-gray-700 space-y-1">
          <li>Free agents are stored in the <code className="bg-gray-200 px-1 rounded">players</code> table with <code className="bg-gray-200 px-1 rounded">is_free_agent = true</code></li>
          <li>They are shared across all save games (seed data)</li>
          <li>Each save game has its own availability records in <code className="bg-gray-200 px-1 rounded">free_agent_availability</code></li>
          <li>When a player is signed, only their availability record is updated</li>
          <li>The Game Setup Wizard automatically seeds free agents if none exist</li>
        </ol>
      </div>
    </div>
  );
}



