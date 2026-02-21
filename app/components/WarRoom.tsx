"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  Phone,
  PhoneOff,
  Clock,
  AlertTriangle,
  Bell,
  TrendingDown,
  TrendingUp,
  Target,
  Users,
  MessageSquare,
  ChevronRight,
  X,
  Check,
  Zap,
  Star,
  Eye,
  Volume2,
  VolumeX,
  Settings,
  Maximize2,
} from "lucide-react";
import {
  DraftPick,
  DraftProspect,
  DraftAlert,
  ScoutReaction,
  TradePackage,
  calculateTimePressure,
  getRoundTimeLimit,
  formatPick,
  generateScoutReaction,
  evaluateTradeFairness,
} from "@/lib/draft/draft-utils";

// Position colors
const POSITION_COLORS: Record<string, string> = {
  QB: "bg-red-500",
  RB: "bg-green-500",
  WR: "bg-blue-500",
  TE: "bg-purple-500",
  OT: "bg-amber-500",
  OG: "bg-amber-400",
  C: "bg-amber-300",
  DE: "bg-orange-500",
  DT: "bg-orange-400",
  LB: "bg-cyan-500",
  CB: "bg-indigo-500",
  S: "bg-violet-500",
  K: "bg-gray-400",
  P: "bg-gray-400",
};

// Alert Component
function AlertBanner({ alert, onDismiss }: { alert: DraftAlert; onDismiss: () => void }) {
  const urgencyStyles = {
    low: "bg-gray-100 border-gray-300 text-gray-700",
    medium: "bg-blue-100 border-blue-300 text-blue-700",
    high: "bg-amber-100 border-amber-300 text-amber-700",
    critical: "bg-red-100 border-red-300 text-red-700 animate-pulse",
  };

  const icons = {
    falling: <TrendingDown className="w-5 h-5" />,
    rising: <TrendingUp className="w-5 h-5" />,
    trade_up: <Zap className="w-5 h-5" />,
    trade_down: <TrendingDown className="w-5 h-5" />,
    target_taken: <X className="w-5 h-5" />,
    value_pick: <Star className="w-5 h-5" />,
    reach: <AlertTriangle className="w-5 h-5" />,
    phone_ringing: <Phone className="w-5 h-5 animate-bounce" />,
  };

  return (
    <div
      className={`flex items-center justify-between p-3 border rounded-lg ${urgencyStyles[alert.urgency]}`}
    >
      <div className="flex items-center gap-3">
        {icons[alert.type]}
        <span className="font-medium">{alert.message}</span>
      </div>
      <button onClick={onDismiss} className="p-1 hover:bg-white/50 rounded">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

// Scout Reaction Bubble
function ScoutBubble({ reaction }: { reaction: ScoutReaction }) {
  const sentimentColors = {
    positive: "bg-green-50 border-green-200",
    negative: "bg-red-50 border-red-200",
    neutral: "bg-gray-50 border-gray-200",
    shocked: "bg-amber-50 border-amber-200",
  };

  return (
    <div className={`p-3 rounded-lg border ${sentimentColors[reaction.sentiment]}`}>
      <div className="flex items-center gap-2 mb-1">
        <div className="w-8 h-8 rounded-full bg-gray-300 flex items-center justify-center text-xs font-bold">
          {reaction.scoutName.charAt(0)}
        </div>
        <div>
          <div className="text-sm font-medium">{reaction.scoutName}</div>
          <div className="text-xs text-gray-500">{reaction.archetype}</div>
        </div>
      </div>
      <p className="text-sm italic">"{reaction.reaction}"</p>
    </div>
  );
}

// Trade Offer Card
function TradeOfferCard({
  trade,
  onAccept,
  onReject,
  onCounter,
}: {
  trade: TradePackage;
  onAccept: () => void;
  onReject: () => void;
  onCounter: () => void;
}) {
  const evaluation = evaluateTradeFairness(trade.picksRequested, trade.picksOffered);

  const verdictColors = {
    steal: "text-green-600 bg-green-100",
    fair: "text-blue-600 bg-blue-100",
    overpay: "text-amber-600 bg-amber-100",
    bad: "text-red-600 bg-red-100",
  };

  return (
    <div className="bg-white rounded-xl shadow-lg border-2 border-amber-400 p-4 animate-pulse-subtle">
      <div className="flex items-center gap-2 mb-3">
        <Phone className="w-5 h-5 text-amber-600 animate-bounce" />
        <span className="font-bold text-gray-900">Incoming Trade Offer</span>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <div className="text-xs text-gray-500 uppercase mb-1">You Give</div>
          <div className="space-y-1">
            {trade.picksRequested.map((pick) => (
              <div key={pick} className="p-2 bg-red-50 rounded text-sm font-medium">
                Pick #{pick}
              </div>
            ))}
          </div>
        </div>
        <div>
          <div className="text-xs text-gray-500 uppercase mb-1">You Get</div>
          <div className="space-y-1">
            {trade.picksOffered.map((pick) => (
              <div key={pick} className="p-2 bg-green-50 rounded text-sm font-medium">
                Pick #{pick}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between mb-4">
        <span className={`px-3 py-1 rounded-full text-sm font-medium ${verdictColors[evaluation.verdict]}`}>
          {evaluation.verdict === "steal" && "Great Deal!"}
          {evaluation.verdict === "fair" && "Fair Trade"}
          {evaluation.verdict === "overpay" && "Slight Overpay"}
          {evaluation.verdict === "bad" && "Bad Deal"}
        </span>
        <span className="text-sm text-gray-500">
          {evaluation.difference > 0 ? "+" : ""}{evaluation.difference} value
        </span>
      </div>

      {trade.message && (
        <div className="p-2 bg-gray-50 rounded mb-4 text-sm italic">
          "{trade.message}"
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={onAccept}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors"
        >
          <Check className="w-4 h-4" />
          Accept
        </button>
        <button
          onClick={onCounter}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
        >
          <MessageSquare className="w-4 h-4" />
          Counter
        </button>
        <button
          onClick={onReject}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors"
        >
          <PhoneOff className="w-4 h-4" />
          Decline
        </button>
      </div>
    </div>
  );
}

// Pick Clock
function PickClock({
  timeRemaining,
  totalTime,
  isYourPick,
}: {
  timeRemaining: number;
  totalTime: number;
  isYourPick: boolean;
}) {
  const { pressure, percentRemaining } = calculateTimePressure(timeRemaining, totalTime);

  const minutes = Math.floor(timeRemaining / 60);
  const seconds = timeRemaining % 60;

  const pressureColors = {
    relaxed: "text-green-600",
    normal: "text-blue-600",
    urgent: "text-amber-600",
    critical: "text-red-600 animate-pulse",
  };

  return (
    <div className={`text-center ${isYourPick ? "bg-blue-900" : "bg-gray-800"} rounded-xl p-4`}>
      <div className="text-xs text-gray-400 uppercase mb-1">
        {isYourPick ? "Your Time" : "On The Clock"}
      </div>
      <div className={`text-4xl font-mono font-bold ${pressureColors[pressure]}`}>
        {minutes}:{seconds.toString().padStart(2, "0")}
      </div>
      <div className="mt-2 h-2 bg-gray-700 rounded-full overflow-hidden">
        <div
          className={`h-full transition-all duration-1000 ${
            pressure === "critical"
              ? "bg-red-500"
              : pressure === "urgent"
                ? "bg-amber-500"
                : "bg-green-500"
          }`}
          style={{ width: `${percentRemaining}%` }}
        />
      </div>
    </div>
  );
}

// Board Prospect Row (simplified for war room)
function ProspectRow({
  prospect,
  rank,
  isTargeted,
  isAvailable,
  onSelect,
}: {
  prospect: DraftProspect;
  rank: number;
  isTargeted: boolean;
  isAvailable: boolean;
  onSelect: () => void;
}) {
  return (
    <div
      onClick={isAvailable ? onSelect : undefined}
      className={`flex items-center gap-3 p-2 rounded-lg transition-all ${
        !isAvailable
          ? "opacity-40 line-through bg-gray-100"
          : isTargeted
            ? "bg-blue-50 border-2 border-blue-400 cursor-pointer hover:bg-blue-100"
            : "bg-white border border-gray-200 cursor-pointer hover:bg-gray-50"
      }`}
    >
      <div className="w-8 text-center font-bold text-gray-400">#{rank}</div>
      <div className={`w-2 h-8 rounded ${POSITION_COLORS[prospect.position] || "bg-gray-400"}`} />
      <div className="flex-1">
        <div className="font-medium text-gray-900">{prospect.name}</div>
        <div className="text-xs text-gray-500">{prospect.position} - {prospect.college}</div>
      </div>
      {isTargeted && (
        <div className="px-2 py-1 bg-blue-600 text-white text-xs rounded-full">
          TARGET
        </div>
      )}
      {prospect.scoutedOverall && (
        <div className="text-sm font-medium text-gray-600">
          {prospect.scoutedOverall.low}-{prospect.scoutedOverall.high}
        </div>
      )}
    </div>
  );
}

// Main War Room Component
interface WarRoomProps {
  currentPick: DraftPick;
  allPicks: DraftPick[];
  prospects: DraftProspect[];
  takenProspectIds: Set<string>;
  yourTeamId: string;
  yourPicks: number[];
  targetProspectIds: string[];
  scouts: { id: string; name: string; archetype: string; personalityType?: string }[];
  timeRemaining: number;
  totalTime: number;
  alerts: DraftAlert[];
  tradeOffer?: TradePackage | null;
  onMakePick: (prospectId: string) => void;
  onDismissAlert: (alertId: string) => void;
  onAcceptTrade: () => void;
  onRejectTrade: () => void;
  onCounterTrade: () => void;
  onTradeUp: () => void;
  onTradeDown: () => void;
}

export function WarRoom({
  currentPick,
  allPicks,
  prospects,
  takenProspectIds,
  yourTeamId,
  yourPicks,
  targetProspectIds,
  scouts,
  timeRemaining,
  totalTime,
  alerts,
  tradeOffer,
  onMakePick,
  onDismissAlert,
  onAcceptTrade,
  onRejectTrade,
  onCounterTrade,
  onTradeUp,
  onTradeDown,
}: WarRoomProps) {
  const [scoutReactions, setScoutReactions] = useState<ScoutReaction[]>([]);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [showSettings, setShowSettings] = useState(false);

  const isYourPick = currentPick.currentTeamId === yourTeamId;
  const availableProspects = prospects.filter((p) => !takenProspectIds.has(p.id));

  // Sort by your board rank or consensus
  const sortedProspects = useMemo(() => {
    return [...availableProspects].sort((a, b) => {
      const rankA = a.yourBoardRank || a.consensusRank;
      const rankB = b.yourBoardRank || b.consensusRank;
      return rankA - rankB;
    });
  }, [availableProspects]);

  // Get targets still available
  const availableTargets = sortedProspects.filter((p) => targetProspectIds.includes(p.id));

  // Recent picks
  const recentPicks = allPicks
    .filter((p) => p.prospectId)
    .slice(-5)
    .reverse();

  // Add scout reaction when a pick is made
  const addScoutReaction = useCallback(
    (prospect: DraftProspect, pickNumber: number) => {
      if (scouts.length === 0) return;

      const randomScout = scouts[Math.floor(Math.random() * scouts.length)];
      const wasTargeted = targetProspectIds.includes(prospect.id);
      const reaction = generateScoutReaction(randomScout, prospect, pickNumber, wasTargeted);

      setScoutReactions((prev) => [reaction, ...prev.slice(0, 4)]);
    },
    [scouts, targetProspectIds]
  );

  // Best available (top 5 on your board)
  const bestAvailable = sortedProspects.slice(0, 5);

  // Active (non-dismissed) alerts
  const activeAlerts = alerts.filter((a) => !a.dismissed);

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header Bar */}
      <div className="bg-gray-800 border-b border-gray-700 px-6 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-bold">WAR ROOM</h1>
            <span className="text-gray-400">|</span>
            <span className="text-lg">{formatPick(currentPick.pickNumber)}</span>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={() => setSoundEnabled(!soundEnabled)}
              className="p-2 hover:bg-gray-700 rounded-lg"
            >
              {soundEnabled ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
            </button>
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="p-2 hover:bg-gray-700 rounded-lg"
            >
              <Settings className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-12 gap-4 p-4 h-[calc(100vh-60px)]">
        {/* Left Column - Clock & Controls */}
        <div className="col-span-3 space-y-4">
          {/* Pick Clock */}
          <PickClock
            timeRemaining={timeRemaining}
            totalTime={totalTime}
            isYourPick={isYourPick}
          />

          {/* Your Pick Status */}
          {isYourPick ? (
            <div className="bg-blue-600 rounded-xl p-4 text-center">
              <div className="text-lg font-bold mb-1">YOU'RE ON THE CLOCK!</div>
              <div className="text-blue-200">Select a prospect to draft</div>
            </div>
          ) : (
            <div className="bg-gray-800 rounded-xl p-4">
              <div className="text-sm text-gray-400 mb-2">Next Pick</div>
              <div className="font-bold">
                #{yourPicks.find((p) => p > currentPick.pickNumber) || "None remaining"}
              </div>
            </div>
          )}

          {/* Trade Buttons */}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={onTradeUp}
              className="flex items-center justify-center gap-2 p-3 bg-green-600 hover:bg-green-700 rounded-lg font-medium transition-colors"
            >
              <TrendingUp className="w-4 h-4" />
              Trade Up
            </button>
            <button
              onClick={onTradeDown}
              className="flex items-center justify-center gap-2 p-3 bg-amber-600 hover:bg-amber-700 rounded-lg font-medium transition-colors"
            >
              <TrendingDown className="w-4 h-4" />
              Trade Down
            </button>
          </div>

          {/* Scout Reactions */}
          <div className="bg-gray-800 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <Users className="w-5 h-5 text-gray-400" />
              <span className="font-medium">Scout Reactions</span>
            </div>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {scoutReactions.length === 0 ? (
                <div className="text-gray-500 text-sm text-center py-4">
                  Reactions will appear as picks are made
                </div>
              ) : (
                scoutReactions.map((reaction, i) => (
                  <ScoutBubble key={`${reaction.scoutId}-${i}`} reaction={reaction} />
                ))
              )}
            </div>
          </div>
        </div>

        {/* Center Column - Board */}
        <div className="col-span-6 space-y-4">
          {/* Alerts */}
          {activeAlerts.length > 0 && (
            <div className="space-y-2">
              {activeAlerts.map((alert) => (
                <AlertBanner
                  key={alert.id}
                  alert={alert}
                  onDismiss={() => onDismissAlert(alert.id)}
                />
              ))}
            </div>
          )}

          {/* Trade Offer Overlay */}
          {tradeOffer && (
            <TradeOfferCard
              trade={tradeOffer}
              onAccept={onAcceptTrade}
              onReject={onRejectTrade}
              onCounter={onCounterTrade}
            />
          )}

          {/* Best Available */}
          <div className="bg-gray-800 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Star className="w-5 h-5 text-amber-400" />
                <span className="font-medium">Best Available</span>
              </div>
              {availableTargets.length > 0 && (
                <span className="px-2 py-1 bg-blue-600 text-xs rounded-full">
                  {availableTargets.length} targets available
                </span>
              )}
            </div>
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {sortedProspects.slice(0, 20).map((prospect, i) => (
                <ProspectRow
                  key={prospect.id}
                  prospect={prospect}
                  rank={i + 1}
                  isTargeted={targetProspectIds.includes(prospect.id)}
                  isAvailable={!takenProspectIds.has(prospect.id)}
                  onSelect={() => isYourPick && onMakePick(prospect.id)}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Right Column - Recent Picks & Info */}
        <div className="col-span-3 space-y-4">
          {/* Recent Picks */}
          <div className="bg-gray-800 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <Clock className="w-5 h-5 text-gray-400" />
              <span className="font-medium">Recent Picks</span>
            </div>
            <div className="space-y-2">
              {recentPicks.length === 0 ? (
                <div className="text-gray-500 text-sm text-center py-4">
                  No picks made yet
                </div>
              ) : (
                recentPicks.map((pick) => (
                  <div
                    key={pick.pickNumber}
                    className="flex items-center gap-3 p-2 bg-gray-700 rounded-lg"
                  >
                    <div className="w-8 h-8 rounded-full bg-gray-600 flex items-center justify-center text-sm font-bold">
                      {pick.pickNumber}
                    </div>
                    <div className="flex-1">
                      <div className="font-medium">{pick.prospectName}</div>
                      <div className="text-xs text-gray-400">{pick.position}</div>
                    </div>
                    {pick.isTraded && (
                      <span className="text-xs text-amber-400">TRADE</span>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Your Targets */}
          <div className="bg-gray-800 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <Target className="w-5 h-5 text-blue-400" />
              <span className="font-medium">Your Targets</span>
            </div>
            <div className="space-y-2">
              {targetProspectIds.length === 0 ? (
                <div className="text-gray-500 text-sm text-center py-4">
                  No targets set
                </div>
              ) : (
                targetProspectIds.map((id) => {
                  const prospect = prospects.find((p) => p.id === id);
                  if (!prospect) return null;

                  const isTaken = takenProspectIds.has(id);

                  return (
                    <div
                      key={id}
                      className={`flex items-center gap-3 p-2 rounded-lg ${
                        isTaken ? "bg-red-900/30 line-through" : "bg-blue-900/30"
                      }`}
                    >
                      <div
                        className={`w-2 h-8 rounded ${POSITION_COLORS[prospect.position] || "bg-gray-400"}`}
                      />
                      <div className="flex-1">
                        <div className="font-medium">{prospect.name}</div>
                        <div className="text-xs text-gray-400">{prospect.position}</div>
                      </div>
                      {isTaken ? (
                        <X className="w-4 h-4 text-red-400" />
                      ) : (
                        <Check className="w-4 h-4 text-green-400" />
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Draft Progress */}
          <div className="bg-gray-800 rounded-xl p-4">
            <div className="text-sm text-gray-400 mb-2">Draft Progress</div>
            <div className="text-2xl font-bold mb-2">
              {allPicks.filter((p) => p.prospectId).length} / {allPicks.length}
            </div>
            <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500"
                style={{
                  width: `${(allPicks.filter((p) => p.prospectId).length / allPicks.length) * 100}%`,
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export type { DraftPick, DraftProspect, DraftAlert, ScoutReaction, TradePackage };
