"use client";

import { useGameStore } from "@/lib/store/game-store";
import { Calendar, CheckCircle, AlertCircle } from "lucide-react";
import Link from "next/link";

export default function PhaseNavigator() {
  const { currentSeason, currentWeek, seasonPhase } = useGameStore();

  const phaseInfo = {
    preseason: {
      label: "Preseason",
      color: "blue",
      link: "/preseason",
      description: "Prepare for the season",
    },
    regular_season: {
      label: "Regular Season",
      color: "green",
      link: "/regular-season",
      description: `Week ${currentWeek} of 18`,
    },
    playoffs: {
      label: "Playoffs",
      color: "purple",
      link: "/league/playoffs",
      description: "Postseason",
    },
    offseason: {
      label: "Offseason",
      color: "slate",
      link: "/offseason",
      description: "Prepare for next season",
    },
  };

  const currentPhaseInfo = seasonPhase
    ? phaseInfo[seasonPhase as keyof typeof phaseInfo]
    : null;

  if (!currentPhaseInfo) return null;

  const colorClasses: Record<string, string> = {
    blue: "bg-blue-100 text-blue-700 border-blue-300",
    green: "bg-green-100 text-green-700 border-green-300",
    purple: "bg-purple-100 text-purple-700 border-purple-300",
    slate: "bg-slate-100 text-slate-700 border-slate-300",
  };

  return (
    <Link
      href={currentPhaseInfo.link}
      className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg border-2 ${
        colorClasses[currentPhaseInfo.color]
      } hover:shadow-md transition-all font-semibold`}
    >
      <Calendar className="w-5 h-5" />
      <div className="text-left">
        <div className="text-sm leading-none">
          {currentSeason} {currentPhaseInfo.label}
        </div>
        <div className="text-xs opacity-80 leading-none mt-0.5">
          {currentPhaseInfo.description}
        </div>
      </div>
    </Link>
  );
}

