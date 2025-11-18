"use client";

import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from "recharts";
import { formatCurrency } from "@/lib/utils/format";
import { TrendingUp } from "lucide-react";

interface ChartData {
  name: string;
  value: number;
}

interface SalaryCapChartProps {
  chartData: ChartData[];
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

export function SalaryCapChart({ chartData }: SalaryCapChartProps) {
  // Handle undefined or null chartData
  if (!chartData || !Array.isArray(chartData) || chartData.length === 0) {
    return null;
  }

  return (
    <div>
      <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
        <TrendingUp className="w-5 h-5 text-gray-600" />
        Cap Distribution
      </h3>
      <ResponsiveContainer width="100%" height={300}>
        <PieChart>
          <Pie
            data={chartData as Array<{ name: string; value: number; [key: string]: string | number }>}
            cx="50%"
            cy="50%"
            labelLine={false}
            label={(props: { name?: string; percent?: number }) => {
              const percent = props.percent;
              const name = props.name;
              return percent && percent > 0.05 && name ? `${name}: ${(percent * 100).toFixed(0)}%` : "";
            }}
            outerRadius={100}
            fill="#8884d8"
            dataKey="value"
          >
            {chartData.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={COLORS[index % COLORS.length]}
              />
            ))}
          </Pie>
          <Tooltip
            formatter={(value: number) => formatCurrency(value)}
          />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

