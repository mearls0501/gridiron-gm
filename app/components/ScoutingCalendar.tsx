"use client";

import React, { useState, useMemo } from "react";
import {
  Calendar,
  Clock,
  MapPin,
  Users,
  Trophy,
  Star,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Eye,
  Clipboard,
  Activity,
  MessageSquare,
  Stethoscope,
  Play,
  Lock,
  Unlock,
} from "lucide-react";

// Types
type ScoutingPhase =
  | "regular_season"
  | "bowl_season"
  | "senior_bowl"
  | "combine"
  | "pro_days"
  | "pre_draft"
  | "draft";

interface ScoutingEvent {
  id: string;
  name: string;
  type: "combine" | "pro_day" | "senior_bowl" | "interview" | "medical" | "game_tape" | "draft";
  startWeek: number;
  endWeek: number;
  phase: ScoutingPhase;
  description: string;
  availableActions: string[];
  location?: string;
  participants?: number;
}

interface ScheduledScoutingAction {
  id: string;
  prospectId: string;
  prospectName: string;
  position: string;
  scoutId: string;
  scoutName: string;
  actionType: string;
  eventId: string;
  week: number;
  status: "scheduled" | "completed" | "missed";
}

// NFL Scouting Calendar Configuration
const SCOUTING_PHASES: Record<
  ScoutingPhase,
  { name: string; weeks: [number, number]; color: string; icon: React.ReactNode }
> = {
  regular_season: {
    name: "Regular Season",
    weeks: [1, 18],
    color: "bg-blue-100 border-blue-300 text-blue-800",
    icon: <Play className="w-4 h-4" />,
  },
  bowl_season: {
    name: "Bowl Season",
    weeks: [19, 22],
    color: "bg-purple-100 border-purple-300 text-purple-800",
    icon: <Trophy className="w-4 h-4" />,
  },
  senior_bowl: {
    name: "Senior Bowl Week",
    weeks: [23, 24],
    color: "bg-amber-100 border-amber-300 text-amber-800",
    icon: <Star className="w-4 h-4" />,
  },
  combine: {
    name: "NFL Combine",
    weeks: [25, 27],
    color: "bg-green-100 border-green-300 text-green-800",
    icon: <Activity className="w-4 h-4" />,
  },
  pro_days: {
    name: "Pro Day Circuit",
    weeks: [28, 35],
    color: "bg-cyan-100 border-cyan-300 text-cyan-800",
    icon: <MapPin className="w-4 h-4" />,
  },
  pre_draft: {
    name: "Pre-Draft Visits",
    weeks: [36, 40],
    color: "bg-rose-100 border-rose-300 text-rose-800",
    icon: <MessageSquare className="w-4 h-4" />,
  },
  draft: {
    name: "NFL Draft",
    weeks: [41, 42],
    color: "bg-emerald-100 border-emerald-300 text-emerald-800",
    icon: <Clipboard className="w-4 h-4" />,
  },
};

// Default scouting events
const DEFAULT_EVENTS: ScoutingEvent[] = [
  {
    id: "senior-bowl",
    name: "Reese's Senior Bowl",
    type: "senior_bowl",
    startWeek: 23,
    endWeek: 24,
    phase: "senior_bowl",
    description: "Top seniors showcase their skills in Mobile, Alabama",
    availableActions: ["game_tape", "interview"],
    location: "Mobile, AL",
    participants: 130,
  },
  {
    id: "nfl-combine",
    name: "NFL Scouting Combine",
    type: "combine",
    startWeek: 25,
    endWeek: 27,
    phase: "combine",
    description: "Official NFL Combine in Indianapolis",
    availableActions: ["combine", "interview", "medical"],
    location: "Indianapolis, IN",
    participants: 330,
  },
  {
    id: "pro-days-sec",
    name: "SEC Pro Days",
    type: "pro_day",
    startWeek: 28,
    endWeek: 30,
    phase: "pro_days",
    description: "SEC school individual workouts",
    availableActions: ["combine", "interview"],
    location: "Various SEC Schools",
  },
  {
    id: "pro-days-big10",
    name: "Big Ten Pro Days",
    type: "pro_day",
    startWeek: 29,
    endWeek: 31,
    phase: "pro_days",
    description: "Big Ten school individual workouts",
    availableActions: ["combine", "interview"],
    location: "Various Big Ten Schools",
  },
  {
    id: "pro-days-pac12",
    name: "Pac-12 Pro Days",
    type: "pro_day",
    startWeek: 30,
    endWeek: 32,
    phase: "pro_days",
    description: "Pac-12 school individual workouts",
    availableActions: ["combine", "interview"],
    location: "Various Pac-12 Schools",
  },
  {
    id: "pro-days-acc",
    name: "ACC Pro Days",
    type: "pro_day",
    startWeek: 31,
    endWeek: 33,
    phase: "pro_days",
    description: "ACC school individual workouts",
    availableActions: ["combine", "interview"],
    location: "Various ACC Schools",
  },
  {
    id: "pro-days-big12",
    name: "Big 12 Pro Days",
    type: "pro_day",
    startWeek: 32,
    endWeek: 34,
    phase: "pro_days",
    description: "Big 12 school individual workouts",
    availableActions: ["combine", "interview"],
    location: "Various Big 12 Schools",
  },
  {
    id: "pre-draft-visits",
    name: "Pre-Draft Facility Visits",
    type: "interview",
    startWeek: 36,
    endWeek: 40,
    phase: "pre_draft",
    description: "30 official pre-draft visits allowed per team",
    availableActions: ["interview", "medical"],
    location: "Team Facilities",
    participants: 30,
  },
  {
    id: "nfl-draft",
    name: "NFL Draft",
    type: "draft",
    startWeek: 41,
    endWeek: 42,
    phase: "draft",
    description: "The main event - 7 rounds of selections",
    availableActions: [],
    location: "Draft City",
  },
];

// Action availability by phase
const ACTION_AVAILABILITY: Record<string, ScoutingPhase[]> = {
  initial: ["regular_season", "bowl_season", "senior_bowl", "combine", "pro_days", "pre_draft"],
  game_tape: ["regular_season", "bowl_season", "senior_bowl"],
  combine: ["combine", "pro_days"],
  interview: ["senior_bowl", "combine", "pro_days", "pre_draft"],
  medical: ["combine", "pre_draft"],
};

// Helper to get current phase
function getCurrentPhase(week: number): ScoutingPhase {
  for (const [phase, config] of Object.entries(SCOUTING_PHASES)) {
    if (week >= config.weeks[0] && week <= config.weeks[1]) {
      return phase as ScoutingPhase;
    }
  }
  return "regular_season";
}

// Helper to check if action is available
function isActionAvailable(action: string, week: number): boolean {
  const phase = getCurrentPhase(week);
  return ACTION_AVAILABILITY[action]?.includes(phase) ?? false;
}

// Week Display Component
function WeekCell({
  week,
  currentWeek,
  events,
  scheduledActions,
  onWeekClick,
}: {
  week: number;
  currentWeek: number;
  events: ScoutingEvent[];
  scheduledActions: ScheduledScoutingAction[];
  onWeekClick?: (week: number) => void;
}) {
  const phase = getCurrentPhase(week);
  const phaseConfig = SCOUTING_PHASES[phase];
  const weekEvents = events.filter((e) => week >= e.startWeek && week <= e.endWeek);
  const weekActions = scheduledActions.filter((a) => a.week === week);

  const isPast = week < currentWeek;
  const isCurrent = week === currentWeek;
  const isFuture = week > currentWeek;

  return (
    <div
      onClick={() => onWeekClick?.(week)}
      className={`
        relative p-2 border rounded-lg cursor-pointer transition-all
        ${isPast ? "opacity-50" : ""}
        ${isCurrent ? "ring-2 ring-blue-500 ring-offset-2" : ""}
        ${phaseConfig.color}
        hover:shadow-md
      `}
    >
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-bold">W{week}</span>
        {weekEvents.length > 0 && (
          <div className="flex -space-x-1">
            {weekEvents.slice(0, 2).map((event) => (
              <div
                key={event.id}
                className="w-4 h-4 rounded-full bg-white border-2 flex items-center justify-center"
                title={event.name}
              >
                {event.type === "combine" && <Activity className="w-2 h-2" />}
                {event.type === "pro_day" && <MapPin className="w-2 h-2" />}
                {event.type === "senior_bowl" && <Star className="w-2 h-2" />}
                {event.type === "interview" && <MessageSquare className="w-2 h-2" />}
                {event.type === "draft" && <Clipboard className="w-2 h-2" />}
              </div>
            ))}
          </div>
        )}
      </div>
      {weekActions.length > 0 && (
        <div className="text-xs">
          <span className="bg-white/50 px-1 rounded">{weekActions.length} actions</span>
        </div>
      )}
    </div>
  );
}

// Main Calendar Component
interface ScoutingCalendarProps {
  currentWeek: number;
  season: number;
  events?: ScoutingEvent[];
  scheduledActions?: ScheduledScoutingAction[];
  onScheduleAction?: (week: number, prospectId: string, actionType: string) => void;
  onWeekSelect?: (week: number) => void;
  compact?: boolean;
}

export function ScoutingCalendar({
  currentWeek,
  season,
  events = DEFAULT_EVENTS,
  scheduledActions = [],
  onScheduleAction,
  onWeekSelect,
  compact = false,
}: ScoutingCalendarProps) {
  const [selectedWeek, setSelectedWeek] = useState<number | null>(null);
  const [viewMonth, setViewMonth] = useState(0); // 0-based month offset

  const currentPhase = getCurrentPhase(currentWeek);
  const phaseConfig = SCOUTING_PHASES[currentPhase];

  // Get available actions for current week
  const availableActions = useMemo(() => {
    return Object.entries(ACTION_AVAILABILITY)
      .filter(([_, phases]) => phases.includes(currentPhase))
      .map(([action]) => action);
  }, [currentPhase]);

  // Events happening this week
  const currentEvents = events.filter(
    (e) => currentWeek >= e.startWeek && currentWeek <= e.endWeek
  );

  // Upcoming events
  const upcomingEvents = events
    .filter((e) => e.startWeek > currentWeek)
    .sort((a, b) => a.startWeek - b.startWeek)
    .slice(0, 3);

  const handleWeekClick = (week: number) => {
    setSelectedWeek(week);
    onWeekSelect?.(week);
  };

  if (compact) {
    // Compact view - just show current phase and available actions
    return (
      <div className="bg-white rounded-lg border p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-gray-500" />
            <span className="font-medium">Week {currentWeek}</span>
          </div>
          <div className={`px-3 py-1 rounded-full text-sm font-medium ${phaseConfig.color}`}>
            {phaseConfig.name}
          </div>
        </div>

        <div className="space-y-2">
          <div className="text-sm text-gray-600">Available Actions:</div>
          <div className="flex flex-wrap gap-2">
            {availableActions.map((action) => (
              <span
                key={action}
                className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full"
              >
                <Unlock className="w-3 h-3" />
                {action.replace("_", " ")}
              </span>
            ))}
            {Object.keys(ACTION_AVAILABILITY)
              .filter((a) => !availableActions.includes(a))
              .map((action) => (
                <span
                  key={action}
                  className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 text-gray-500 text-xs rounded-full"
                >
                  <Lock className="w-3 h-3" />
                  {action.replace("_", " ")}
                </span>
              ))}
          </div>
        </div>

        {currentEvents.length > 0 && (
          <div className="mt-3 pt-3 border-t">
            <div className="text-sm font-medium text-amber-700 flex items-center gap-1">
              <AlertTriangle className="w-4 h-4" />
              Active Events
            </div>
            {currentEvents.map((event) => (
              <div key={event.id} className="text-sm text-gray-600 mt-1">
                {event.name} - {event.location}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Full calendar view
  return (
    <div className="bg-white rounded-xl shadow-lg border">
      {/* Header */}
      <div className="p-6 border-b">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-blue-100 rounded-xl">
              <Calendar className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">Scouting Calendar</h2>
              <p className="text-sm text-gray-500">{season} Draft Season</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className={`px-4 py-2 rounded-lg ${phaseConfig.color} flex items-center gap-2`}>
              {phaseConfig.icon}
              <span className="font-medium">{phaseConfig.name}</span>
            </div>
            <div className="text-sm text-gray-500">
              Week {currentWeek} of 42
            </div>
          </div>
        </div>
      </div>

      {/* Current Phase Info */}
      <div className="p-4 bg-gray-50 border-b">
        <div className="grid grid-cols-2 gap-4">
          {/* Available Actions */}
          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-2">Available This Phase</h3>
            <div className="flex flex-wrap gap-2">
              {availableActions.map((action) => (
                <span
                  key={action}
                  className="inline-flex items-center gap-1 px-3 py-1.5 bg-green-100 text-green-800 text-sm rounded-lg"
                >
                  <Unlock className="w-4 h-4" />
                  {action === "initial" && "Initial Scouting"}
                  {action === "game_tape" && "Game Tape Review"}
                  {action === "combine" && "Combine Testing"}
                  {action === "interview" && "Interviews"}
                  {action === "medical" && "Medical Evaluation"}
                </span>
              ))}
            </div>
          </div>

          {/* Locked Actions */}
          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-2">Locked Until Later</h3>
            <div className="flex flex-wrap gap-2">
              {Object.keys(ACTION_AVAILABILITY)
                .filter((a) => !availableActions.includes(a))
                .map((action) => (
                  <span
                    key={action}
                    className="inline-flex items-center gap-1 px-3 py-1.5 bg-gray-200 text-gray-500 text-sm rounded-lg"
                  >
                    <Lock className="w-4 h-4" />
                    {action === "initial" && "Initial Scouting"}
                    {action === "game_tape" && "Game Tape Review"}
                    {action === "combine" && "Combine Testing"}
                    {action === "interview" && "Interviews"}
                    {action === "medical" && "Medical Evaluation"}
                  </span>
                ))}
            </div>
          </div>
        </div>
      </div>

      {/* Current Events */}
      {currentEvents.length > 0 && (
        <div className="p-4 bg-amber-50 border-b">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-5 h-5 text-amber-600" />
            <h3 className="font-medium text-amber-900">Active Events This Week</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {currentEvents.map((event) => (
              <div
                key={event.id}
                className="p-3 bg-white rounded-lg border border-amber-200"
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-gray-900">{event.name}</span>
                  {event.location && (
                    <span className="text-xs text-gray-500 flex items-center gap-1">
                      <MapPin className="w-3 h-3" />
                      {event.location}
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-600 mt-1">{event.description}</p>
                {event.participants && (
                  <div className="text-xs text-gray-500 mt-2 flex items-center gap-1">
                    <Users className="w-3 h-3" />
                    {event.participants} prospects participating
                  </div>
                )}
                <div className="flex gap-1 mt-2">
                  {event.availableActions.map((action) => (
                    <span
                      key={action}
                      className="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded"
                    >
                      {action.replace("_", " ")}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Timeline View */}
      <div className="p-4">
        <h3 className="font-medium text-gray-900 mb-3">Season Timeline</h3>

        {/* Phase Legend */}
        <div className="flex flex-wrap gap-2 mb-4">
          {Object.entries(SCOUTING_PHASES).map(([phase, config]) => (
            <div
              key={phase}
              className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs ${config.color} ${
                phase === currentPhase ? "ring-2 ring-offset-1 ring-blue-500" : ""
              }`}
            >
              {config.icon}
              {config.name}
            </div>
          ))}
        </div>

        {/* Week Grid */}
        <div className="grid grid-cols-7 gap-2">
          {Array.from({ length: 42 }, (_, i) => i + 1).map((week) => (
            <WeekCell
              key={week}
              week={week}
              currentWeek={currentWeek}
              events={events}
              scheduledActions={scheduledActions}
              onWeekClick={handleWeekClick}
            />
          ))}
        </div>
      </div>

      {/* Upcoming Events */}
      {upcomingEvents.length > 0 && (
        <div className="p-4 border-t bg-gray-50">
          <h3 className="font-medium text-gray-900 mb-3">Upcoming Events</h3>
          <div className="space-y-2">
            {upcomingEvents.map((event) => (
              <div
                key={event.id}
                className="flex items-center justify-between p-3 bg-white rounded-lg border"
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`p-2 rounded-lg ${SCOUTING_PHASES[event.phase].color}`}
                  >
                    {SCOUTING_PHASES[event.phase].icon}
                  </div>
                  <div>
                    <div className="font-medium text-gray-900">{event.name}</div>
                    <div className="text-sm text-gray-500">
                      Week {event.startWeek} - {event.endWeek}
                    </div>
                  </div>
                </div>
                <div className="text-sm text-gray-500">
                  {event.startWeek - currentWeek} weeks away
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Selected Week Details */}
      {selectedWeek && (
        <div className="p-4 border-t">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-medium text-gray-900">Week {selectedWeek} Details</h3>
            <button
              onClick={() => setSelectedWeek(null)}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              Close
            </button>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <h4 className="text-sm font-medium text-gray-700 mb-2">Phase</h4>
              <div
                className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg ${
                  SCOUTING_PHASES[getCurrentPhase(selectedWeek)].color
                }`}
              >
                {SCOUTING_PHASES[getCurrentPhase(selectedWeek)].icon}
                {SCOUTING_PHASES[getCurrentPhase(selectedWeek)].name}
              </div>
            </div>

            <div>
              <h4 className="text-sm font-medium text-gray-700 mb-2">
                Available Actions
              </h4>
              <div className="flex flex-wrap gap-1">
                {Object.entries(ACTION_AVAILABILITY)
                  .filter(([_, phases]) => phases.includes(getCurrentPhase(selectedWeek)))
                  .map(([action]) => (
                    <span
                      key={action}
                      className="text-xs px-2 py-1 bg-green-100 text-green-700 rounded"
                    >
                      {action.replace("_", " ")}
                    </span>
                  ))}
              </div>
            </div>
          </div>

          {/* Events this week */}
          {events.filter(
            (e) => selectedWeek >= e.startWeek && selectedWeek <= e.endWeek
          ).length > 0 && (
            <div className="mt-4">
              <h4 className="text-sm font-medium text-gray-700 mb-2">Events</h4>
              <div className="space-y-2">
                {events
                  .filter((e) => selectedWeek >= e.startWeek && selectedWeek <= e.endWeek)
                  .map((event) => (
                    <div
                      key={event.id}
                      className="p-2 bg-gray-100 rounded-lg text-sm"
                    >
                      <div className="font-medium">{event.name}</div>
                      <div className="text-gray-500">{event.location}</div>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Export helper functions
export { getCurrentPhase, isActionAvailable, SCOUTING_PHASES, ACTION_AVAILABILITY };
export type { ScoutingPhase, ScoutingEvent, ScheduledScoutingAction };
