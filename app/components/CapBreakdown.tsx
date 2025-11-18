"use client";

import { Users } from "lucide-react";
import { formatCurrency } from "@/lib/utils/format";

interface CapBreakdownProps {
  capBreakdown: Array<[string, number]>;
  totalCapHit: number;
}

const COLORS = [
  "#3b82f6", // blue
  "#10b981", // green
  "#f59e0b", // amber
  "#ef4444", // red
  "#8b5cf6", // purple
  "#ec4899", // pink
  "#06b6d4", // cyan
  "#84cc16", // lime
];

export function CapBreakdown({ capBreakdown, totalCapHit }: CapBreakdownProps) {
  // Handle undefined or null capBreakdown
  if (!capBreakdown || !Array.isArray(capBreakdown) || capBreakdown.length === 0) {
    return (
      <div>
        <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
          <Users className="w-5 h-5 text-gray-600" />
          Cap by Position
        </h3>
        <p className="text-gray-500 text-sm">No cap data available</p>
      </div>
    );
  }

  return (
    <div>
      <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
        <Users className="w-5 h-5 text-gray-600" />
        Cap by Position
      </h3>
      <div className="space-y-2">
        {capBreakdown.map(([pos, cap], index) => {
          const percentage = totalCapHit > 0 ? (cap / totalCapHit) * 100 : 0;
          return (
            <div key={pos} className="space-y-1">
              <div className="flex justify-between items-center text-sm">
                <span className="font-medium text-gray-900">{pos}</span>
                <span className="text-gray-700">
                  {formatCurrency(cap)} ({percentage.toFixed(1)}%)
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="h-2 rounded-full transition-all"
                  style={{
                    width: `${percentage}%`,
                    backgroundColor: COLORS[index % COLORS.length],
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

