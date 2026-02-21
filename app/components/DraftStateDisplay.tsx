"use client";

import { Clock, Trophy } from "lucide-react";

interface DraftStateDisplayProps {
  currentRound: number | null;
  currentPickOverall: number | null;
  totalPicks: number;
  picksMade: number;
  teamOnClock?: {
    id: string;
    name: string;
    abbreviation: string;
  };
  isUserTurn: boolean;
  draftComplete: boolean;
}

export default function DraftStateDisplay({
  currentRound,
  currentPickOverall,
  totalPicks,
  picksMade,
  teamOnClock,
  isUserTurn,
  draftComplete,
}: DraftStateDisplayProps) {
  const progress = totalPicks > 0 ? (picksMade / totalPicks) * 100 : 0;
  const circumference = 2 * Math.PI * 45; // radius = 45
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  return (
    <div className="glass-panel rounded-xl p-6">
      {/* Status Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2
            className="text-2xl font-bold mb-1"
            style={{
              color: "var(--futuristic-neon-cyan)",
              textShadow:
                "0 0 10px rgba(0, 240, 255, 0.8), 0 0 20px rgba(0, 240, 255, 0.5)",
            }}
          >
            {draftComplete ? "Draft Complete" : "Draft In Progress"}
          </h2>
          {!draftComplete && currentRound && currentPickOverall && (
            <p
              className="text-sm"
              style={{ color: "var(--futuristic-text-secondary)" }}
            >
              Round {currentRound} • Pick #{currentPickOverall}
            </p>
          )}
        </div>
        {draftComplete ? (
          <Trophy
            className="w-8 h-8"
            style={{ color: "var(--futuristic-neon-purple)" }}
          />
        ) : (
          <Clock
            className={`w-8 h-8 ${isUserTurn ? "pulse-glow" : ""}`}
            style={{
              color: isUserTurn
                ? "var(--futuristic-neon-cyan)"
                : "var(--futuristic-text-muted)",
            }}
          />
        )}
      </div>

      {/* Circular Progress */}
      <div className="flex items-center justify-center mb-6">
        <div className="relative w-32 h-32">
          <svg className="progress-ring w-32 h-32" viewBox="0 0 100 100">
            {/* Background circle */}
            <circle
              cx="50"
              cy="50"
              r="45"
              fill="none"
              stroke="rgba(0, 240, 255, 0.1)"
              strokeWidth="8"
            />
            {/* Progress circle */}
            <circle
              className="progress-ring-circle"
              cx="50"
              cy="50"
              r="45"
              fill="none"
              stroke="url(#gradient)"
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              style={{
                transition: "stroke-dashoffset 0.5s ease-in-out",
              }}
            />
            {/* Gradient definition */}
            <defs>
              <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#00f0ff" />
                <stop offset="50%" stopColor="#a855f7" />
                <stop offset="100%" stopColor="#3b82f6" />
              </linearGradient>
            </defs>
          </svg>
          {/* Center text */}
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span
              className="text-2xl font-bold digital-display"
              style={{
                color: "var(--futuristic-neon-cyan)",
                textShadow:
                  "0 0 10px rgba(0, 240, 255, 0.8), 0 0 20px rgba(0, 240, 255, 0.5)",
              }}
            >
              {Math.round(progress)}%
            </span>
            <span
              className="text-xs mt-1"
              style={{ color: "var(--futuristic-text-secondary)" }}
            >
              Complete
            </span>
          </div>
        </div>
      </div>

      {/* Progress Stats */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="glass-card rounded-lg p-3 text-center">
          <div
            className="text-2xl font-bold"
            style={{ color: "var(--futuristic-neon-cyan)" }}
          >
            {picksMade}
          </div>
          <div
            className="text-xs mt-1"
            style={{ color: "var(--futuristic-text-secondary)" }}
          >
            Picks Made
          </div>
        </div>
        <div className="glass-card rounded-lg p-3 text-center">
          <div
            className="text-2xl font-bold"
            style={{ color: "var(--futuristic-electric-blue)" }}
          >
            {totalPicks - picksMade}
          </div>
          <div
            className="text-xs mt-1"
            style={{ color: "var(--futuristic-text-secondary)" }}
          >
            Remaining
          </div>
        </div>
      </div>

      {/* Team On Clock */}
      {!draftComplete && teamOnClock && (
        <div
          className={`glass-card rounded-lg p-4 border-2 transition-all ${isUserTurn ? "pulse-glow" : ""}`}
          style={{
            borderColor: isUserTurn
              ? "var(--futuristic-neon-cyan)"
              : "rgba(168, 85, 247, 0.5)",
          }}
        >
          <div className="flex items-center justify-between">
            <div>
              <div
                className="text-xs mb-1"
                style={{ color: "var(--futuristic-text-secondary)" }}
              >
                {isUserTurn ? "Your Turn" : "On the Clock"}
              </div>
              <div
                className="text-lg font-bold"
                style={{ color: "var(--futuristic-text-primary)" }}
              >
                {teamOnClock.name}
              </div>
              <div
                className="text-sm"
                style={{ color: "var(--futuristic-text-muted)" }}
              >
                {teamOnClock.abbreviation}
              </div>
            </div>
            {isUserTurn && (
              <div
                className="w-3 h-3 rounded-full pulse-glow"
                style={{ backgroundColor: "var(--futuristic-neon-cyan)" }}
              />
            )}
          </div>
        </div>
      )}

      {/* Draft Complete Message */}
      {draftComplete && (
        <div
          className="glass-card rounded-lg p-4 border-2 text-center"
          style={{ borderColor: "var(--futuristic-neon-purple)" }}
        >
          <Trophy
            className="w-8 h-8 mx-auto mb-2"
            style={{ color: "var(--futuristic-neon-purple)" }}
          />
          <div
            className="text-lg font-bold"
            style={{ color: "var(--futuristic-text-primary)" }}
          >
            All Picks Complete
          </div>
          <div
            className="text-sm mt-1"
            style={{ color: "var(--futuristic-text-secondary)" }}
          >
            {picksMade} players drafted
          </div>
        </div>
      )}
    </div>
  );
}
