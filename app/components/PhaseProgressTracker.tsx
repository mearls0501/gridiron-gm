"use client";

import { useState, useEffect } from "react";
import {
  CheckCircle,
  Circle,
  AlertCircle,
  ArrowRight,
  Calendar,
  Target,
  Info,
} from "lucide-react";
import Link from "next/link";

interface Task {
  id: string;
  name: string;
  description?: string;
  completed: boolean;
  required: boolean;
  link?: string;
  icon?: React.ReactNode;
}

interface PhaseProgressTrackerProps {
  phase: "preseason" | "regular_season" | "playoffs" | "offseason";
  season: number;
  tasks: Task[];
  offseasonWeek?: number;
  canAdvance?: boolean;
  onAdvance?: () => void;
  advancingTo?: string;
  showAdvanceButton?: boolean;
}

export default function PhaseProgressTracker({
  phase,
  season,
  tasks,
  offseasonWeek,
  canAdvance = false,
  onAdvance,
  advancingTo,
  showAdvanceButton = true,
}: PhaseProgressTrackerProps) {
  const [expanded, setExpanded] = useState(true);

  const phaseLabels: Record<string, string> = {
    preseason: "Preseason",
    regular_season: "Regular Season",
    playoffs: "Playoffs",
    offseason: "Offseason",
  };

  const phaseColors: Record<string, string> = {
    preseason: "blue",
    regular_season: "green",
    playoffs: "purple",
    offseason: "slate",
  };

  const color = phaseColors[phase] || "blue";
  const phaseLabel = phaseLabels[phase] || phase;

  // Calculate progress
  const requiredTasks = tasks.filter((t) => t.required);
  const completedRequiredTasks = requiredTasks.filter((t) => t.completed);
  const optionalTasks = tasks.filter((t) => !t.required);
  const completedOptionalTasks = optionalTasks.filter((t) => t.completed);

  const requiredProgress =
    requiredTasks.length > 0
      ? Math.round((completedRequiredTasks.length / requiredTasks.length) * 100)
      : 100;

  const allTasksCompleted = requiredTasks.every((t) => t.completed);

  return (
    <div className="bg-white rounded-lg shadow-lg border border-gray-200 overflow-hidden">
      {/* Header */}
      <div
        className={`bg-gradient-to-r from-${color}-900 via-${color}-800 to-${color}-900 px-6 py-4`}
        style={{
          background:
            color === "blue"
              ? "linear-gradient(to right, #1e3a8a, #1e40af, #1e3a8a)"
              : color === "green"
                ? "linear-gradient(to right, #065f46, #047857, #065f46)"
                : color === "purple"
                  ? "linear-gradient(to right, #581c87, #6b21a8, #581c87)"
                  : "linear-gradient(to right, #0f172a, #1e293b, #0f172a)",
        }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Calendar className="w-6 h-6 text-white" />
            <div>
              <h2 className="text-xl font-bold text-white">
                {season} {phaseLabel}
                {phase === "offseason" && offseasonWeek !== undefined && (
                  <span className="ml-2 text-sm font-normal opacity-90">
                    Week {offseasonWeek + 1} of 3
                  </span>
                )}
              </h2>
              <p className="text-sm text-white opacity-80">
                {completedRequiredTasks.length} of {requiredTasks.length} required tasks
                completed
              </p>
            </div>
          </div>
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-white hover:bg-white hover:bg-opacity-20 rounded-lg px-3 py-2 transition-colors"
          >
            {expanded ? "Hide" : "Show"} Tasks
          </button>
        </div>

        {/* Progress Bar */}
        <div className="mt-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-white opacity-80">Progress</span>
            <span className="text-xs text-white font-semibold">{requiredProgress}%</span>
          </div>
          <div className="w-full bg-white bg-opacity-20 rounded-full h-2">
            <div
              className="bg-white h-2 rounded-full transition-all duration-500"
              style={{ width: `${requiredProgress}%` }}
            />
          </div>
        </div>
      </div>

      {/* Task List */}
      {expanded && (
        <div className="divide-y divide-gray-200">
          {/* Required Tasks */}
          {requiredTasks.length > 0 && (
            <div className="p-6">
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4 flex items-center gap-2">
                <Target className="w-4 h-4" />
                Required Tasks
              </h3>
              <div className="space-y-3">
                {requiredTasks.map((task) => (
                  <TaskItem key={task.id} task={task} />
                ))}
              </div>
            </div>
          )}

          {/* Optional Tasks */}
          {optionalTasks.length > 0 && (
            <div className="p-6 bg-gray-50">
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4 flex items-center gap-2">
                <Info className="w-4 h-4" />
                Optional Tasks ({completedOptionalTasks.length}/
                {optionalTasks.length})
              </h3>
              <div className="space-y-3">
                {optionalTasks.map((task) => (
                  <TaskItem key={task.id} task={task} />
                ))}
              </div>
            </div>
          )}

          {/* Advance Button */}
          {showAdvanceButton && (
            <div className="p-6 bg-gray-50">
              {allTasksCompleted && canAdvance ? (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-green-600">
                    <CheckCircle className="w-5 h-5" />
                    <span className="font-semibold">Ready to advance!</span>
                  </div>
                  {onAdvance && (
                    <button
                      onClick={onAdvance}
                      className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-semibold flex items-center gap-2 transition-colors"
                    >
                      {advancingTo || "Advance"} <ArrowRight className="w-5 h-5" />
                    </button>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-2 text-orange-600">
                  <AlertCircle className="w-5 h-5" />
                  <span className="text-sm">
                    Complete all required tasks before advancing
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {!expanded && tasks.length > 0 && (
        <div className="px-6 py-3 bg-gray-50 text-sm text-gray-600 text-center">
          Click "Show Tasks" to view checklist
        </div>
      )}
    </div>
  );
}

function TaskItem({ task }: { task: Task }) {
  const content = (
    <div
      className={`flex items-start justify-between p-4 rounded-lg border transition-all ${
        task.completed
          ? "bg-green-50 border-green-200"
          : task.required
            ? "bg-white border-orange-200"
            : "bg-white border-gray-200"
      }`}
    >
      <div className="flex items-start gap-3 flex-1">
        {task.completed ? (
          <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
        ) : (
          <Circle className="w-5 h-5 text-gray-400 mt-0.5 flex-shrink-0" />
        )}
        <div className="flex-1">
          <div className="flex items-center gap-2">
            {task.icon}
            <span
              className={`font-medium ${
                task.completed ? "text-gray-700 line-through" : "text-gray-900"
              }`}
            >
              {task.name}
            </span>
            {task.required && !task.completed && (
              <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-semibold">
                Required
              </span>
            )}
          </div>
          {task.description && (
            <p className="text-sm text-gray-600 mt-1">{task.description}</p>
          )}
        </div>
      </div>
      {task.link && !task.completed && (
        <Link
          href={task.link}
          className="ml-4 px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 transition-colors flex items-center gap-1 flex-shrink-0"
        >
          Go <ArrowRight className="w-4 h-4" />
        </Link>
      )}
    </div>
  );

  return content;
}

