"use client";

import { useState, useEffect } from "react";
import { useGameStore } from "@/lib/store/game-store";
import ScoutingDashboard from "@/app/components/ScoutingDashboard";

export default function ScoutingPage() {
  const { currentSeason, saveGameId } = useGameStore();
  const [season, setSeason] = useState<number>(currentSeason);
  const [generating, setGenerating] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setSeason(currentSeason);
  }, [currentSeason]);

  async function generateDraft() {
    setGenerating(true);
    setError("");
    setDownloadUrl("");
    setSuccess(false);

    try {
      if (!saveGameId) {
        setError("No save game selected. Please load a save game first.");
        setGenerating(false);
        return;
      }

      const res = await fetch("/api/generate-draft-class", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ season, saveGameId }),
      });

      // Check if response is CSV (when Supabase is not configured)
      const contentType = res.headers.get("content-type");
      if (contentType?.includes("text/csv")) {
        // Download the CSV file directly
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `draft_${season}.csv`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        setDownloadUrl("");
        setSuccess(true);
      } else {
        // Handle JSON response (when Supabase is configured)
        const data = await res.json();

        if (!res.ok) {
          // Response was not OK, show detailed error
          const errorMsg =
            data.error || data.message || "Failed to generate draft class";
          console.error("Draft class generation error:", data);
          setError(
            `${errorMsg}${data.errors ? ` Errors: ${JSON.stringify(data.errors)}` : ""}`
          );
          setGenerating(false);
          return;
        }

        if (data.success) {
          setDownloadUrl(data.url || "");
          setSuccess(true);
          setError(""); // Clear any previous errors
          // Show success message with details
          if (data.insertedCount !== undefined || data.dbCount !== undefined) {
            console.log(`Draft class generated:`, {
              expected: data.prospectCount,
              inserted: data.insertedCount,
              inDatabase: data.dbCount,
            });
          }
          // Reload data if needed
        } else {
          // Partial success or warning
          const errorMsg =
            data.message || data.error || "Something went wrong.";
          console.warn("Draft class generation warning:", data);
          // Show detailed error information
          let detailedError = errorMsg;
          if (
            data.errors &&
            Array.isArray(data.errors) &&
            data.errors.length > 0
          ) {
            const errorDetails = data.errors
              .map(
                (
                  e:
                    | string
                    | {
                        batch: number;
                        error: string;
                        code?: string;
                        details?: string;
                      }
                ) => {
                  if (typeof e === "string") return e;
                  return `Batch ${e.batch}: ${e.error}${e.code ? ` (${e.code})` : ""}${e.details ? ` - ${e.details}` : ""}`;
                }
              )
              .join("\n");
            detailedError = `${errorMsg}\n\nError details:\n${errorDetails}`;
          }
          setError(detailedError);
          // Prospects will reload when ScoutingDashboard refreshes
        }
      }
    } catch (err) {
      console.error("Network error generating draft class:", err);
      setError(
        `Network error: ${err instanceof Error ? err.message : "Failed to generate draft class"}`
      );
    }

    setGenerating(false);
  }

  if (!mounted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-gray-50 to-slate-100">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="bg-white rounded-xl shadow-lg p-8">
            <p className="text-slate-500">Loading...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-gray-50 to-slate-100">
      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="bg-white rounded-xl shadow-lg border border-slate-200 mb-6 overflow-hidden">
          <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 px-8 py-6">
            <h1 className="text-3xl font-black text-white tracking-tight mb-2">
              Scouting Dashboard
            </h1>
            <div className="flex items-center gap-4 mt-4">
              <div>
                <label className="text-xs text-slate-400 uppercase tracking-wider block mb-1">
                  Season
                </label>
                <input
                  type="number"
                  value={season}
                  onChange={(e) => setSeason(parseInt(e.target.value) || 2025)}
                  className="px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="ml-auto">
                <button
                  onClick={generateDraft}
                  disabled={generating}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {generating ? "Generating..." : "Generate Draft Class"}
                </button>
              </div>
            </div>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <p className="text-red-700 font-medium">{error}</p>
          </div>
        )}

        {success && downloadUrl && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6 flex items-center justify-between">
            <p className="text-green-700 font-medium">
              Draft class generated successfully!
            </p>
            <a
              href={downloadUrl}
              download
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 transition-colors text-sm"
            >
              Download CSV
            </a>
          </div>
        )}

        {/* Scouting Dashboard */}
        <ScoutingDashboard />
      </div>
    </div>
  );
}


