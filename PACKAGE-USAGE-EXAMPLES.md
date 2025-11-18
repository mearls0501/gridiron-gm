# Package Usage Examples for Gridiron GM

Quick reference for using the installed packages in your game.

## 📊 @tanstack/react-table - Player Roster Table

```tsx
'use client';

import { useMemo } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  ColumnDef,
  flexRender,
} from '@tanstack/react-table';

interface Player {
  id: string;
  full_name: string;
  position: string;
  overall: number;
  contract_year_1: number;
}

export function PlayerRosterTable({ players }: { players: Player[] }) {
  const columns = useMemo<ColumnDef<Player>[]>(
    () => [
      {
        accessorKey: 'full_name',
        header: 'Name',
      },
      {
        accessorKey: 'position',
        header: 'Pos',
      },
      {
        accessorKey: 'overall',
        header: 'OVR',
        cell: ({ getValue }) => (
          <span className="font-bold">{getValue() as number}</span>
        ),
      },
      {
        accessorKey: 'contract_year_1',
        header: 'Salary',
        cell: ({ getValue }) => {
          const value = getValue() as number;
          return `$${(value / 1000000).toFixed(2)}M`;
        },
      },
    ],
    []
  );

  const table = useReactTable({
    data: players,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  return (
    <table>
      <thead>
        {table.getHeaderGroups().map(headerGroup => (
          <tr key={headerGroup.id}>
            {headerGroup.headers.map(header => (
              <th
                key={header.id}
                onClick={header.column.getToggleSortingHandler()}
              >
                {flexRender(header.column.columnDef.header, header.getContext())}
              </th>
            ))}
          </tr>
        ))}
      </thead>
      <tbody>
        {table.getRowModel().rows.map(row => (
          <tr key={row.id}>
            {row.getVisibleCells().map(cell => (
              <td key={cell.id}>
                {flexRender(cell.column.columnDef.cell, cell.getContext())}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

## 📈 Recharts - Salary Cap Visualization

```tsx
'use client';

import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';

interface CapData {
  name: string;
  value: number;
}

export function SalaryCapChart({ capData }: { capData: CapData[] }) {
  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8'];

  return (
    <ResponsiveContainer width="100%" height={300}>
      <PieChart>
        <Pie
          data={capData}
          cx="50%"
          cy="50%"
          labelLine={false}
          label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
          outerRadius={80}
          fill="#8884d8"
          dataKey="value"
        >
          {capData.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip formatter={(value: number) => `$${(value / 1000000).toFixed(2)}M`} />
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  );
}

// Usage:
// const capData = [
//   { name: 'Offense', value: 85000000 },
//   { name: 'Defense', value: 120000000 },
//   { name: 'Special Teams', value: 5000000 },
// ];
```

## 📝 React Hook Form - Trade Proposal Form

```tsx
'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

const tradeSchema = z.object({
  playerId: z.string().min(1, 'Select a player'),
  targetTeamId: z.string().min(1, 'Select a team'),
  draftPicks: z.array(z.string()).optional(),
});

type TradeFormData = z.infer<typeof tradeSchema>;

export function TradeProposalForm() {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<TradeFormData>({
    resolver: zodResolver(tradeSchema),
  });

  const onSubmit = (data: TradeFormData) => {
    // Handle trade proposal
    console.log('Trade proposal:', data);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <div>
        <label>Player to Trade</label>
        <select {...register('playerId')}>
          <option value="">Select player...</option>
        </select>
        {errors.playerId && <span>{errors.playerId.message}</span>}
      </div>

      <div>
        <label>Target Team</label>
        <select {...register('targetTeamId')}>
          <option value="">Select team...</option>
        </select>
        {errors.targetTeamId && <span>{errors.targetTeamId.message}</span>}
      </div>

      <button type="submit">Propose Trade</button>
    </form>
  );
}
```

## 🗂️ Zustand - Game State Management

```tsx
// lib/store/game-store.ts
import { create } from 'zustand';

interface GameState {
  currentWeek: number;
  currentSeason: number;
  selectedTeamId: string | null;
  setCurrentWeek: (week: number) => void;
  setCurrentSeason: (season: number) => void;
  setSelectedTeam: (teamId: string | null) => void;
}

export const useGameStore = create<GameState>((set) => ({
  currentWeek: 1,
  currentSeason: 2025,
  selectedTeamId: null,
  setCurrentWeek: (week) => set({ currentWeek: week }),
  setCurrentSeason: (season) => set({ currentSeason: season }),
  setSelectedTeam: (teamId) => set({ selectedTeamId: teamId }),
}));

// Usage in component:
'use client';

import { useGameStore } from '@/lib/store/game-store';

export function SeasonHeader() {
  const { currentWeek, currentSeason, setCurrentWeek } = useGameStore();

  return (
    <div>
      <h1>Season {currentSeason} - Week {currentWeek}</h1>
      <button onClick={() => setCurrentWeek(currentWeek + 1)}>
        Advance Week
      </button>
    </div>
  );
}
```

## 📅 date-fns - Date/Season Management

```tsx
import { format, addWeeks, addYears, differenceInDays } from 'date-fns';

// Format season dates
const seasonStart = new Date(2025, 8, 1); // September 1, 2025
const week1Date = addWeeks(seasonStart, 0);
const week2Date = addWeeks(seasonStart, 1);

// Calculate days until draft
const draftDate = new Date(2026, 3, 1); // April 1, 2026
const daysUntilDraft = differenceInDays(draftDate, new Date());

// Format dates for display
const formattedDate = format(seasonStart, 'MMMM d, yyyy'); // "September 1, 2025"
const weekLabel = format(week1Date, 'EEEE, MMMM d'); // "Monday, September 1"
```

## 🔢 Numeral - Number Formatting

```tsx
import numeral from 'numeral';

// Format currency
const salary = 25500000;
numeral(salary).format('$0,0'); // "$25,500,000"
numeral(salary).format('$0.0a'); // "$25.5M"

// Format percentages
const completionRate = 0.652;
numeral(completionRate).format('0.0%'); // "65.2%"

// Format large numbers
const attendance = 75000;
numeral(attendance).format('0,0'); // "75,000"
numeral(attendance).format('0.0a'); // "75.0k"
```

## 🎨 Lucide React - Icons

```tsx
import { 
  Trophy, 
  Users, 
  TrendingUp, 
  DollarSign,
  Calendar,
  BarChart3 
} from 'lucide-react';

export function StatCard({ title, value, icon }: { title: string; value: string; icon: string }) {
  const IconComponent = {
    trophy: Trophy,
    users: Users,
    trending: TrendingUp,
    dollar: DollarSign,
    calendar: Calendar,
    chart: BarChart3,
  }[icon] || Trophy;

  return (
    <div className="flex items-center gap-3">
      <IconComponent className="w-6 h-6 text-blue-600" />
      <div>
        <div className="text-sm text-gray-600">{title}</div>
        <div className="text-2xl font-bold">{value}</div>
      </div>
    </div>
  );
}
```

## 🔍 Zod - Data Validation

```tsx
import { z } from 'zod';

// Player schema
export const playerSchema = z.object({
  full_name: z.string().min(1, 'Name required'),
  position: z.enum(['QB', 'RB', 'WR', 'TE', 'OT', 'OG', 'C', 'DE', 'DT', 'LB', 'CB', 'S', 'K', 'P']),
  overall: z.number().min(0).max(99),
  potential: z.number().min(0).max(99),
  age: z.number().min(18).max(45),
  contract_year_1: z.number().min(0),
});

// Contract validation
export const contractSchema = z.object({
  contract_year_1: z.number().min(0),
  contract_year_2: z.number().min(0),
  contract_year_3: z.number().min(0),
  contract_year_4: z.number().min(0),
  signing_bonus: z.number().min(0),
}).refine((data) => {
  const total = data.contract_year_1 + data.contract_year_2 + 
                data.contract_year_3 + data.contract_year_4 + data.signing_bonus;
  return total <= 255000000; // Salary cap check
}, {
  message: 'Total contract exceeds salary cap',
});

// Usage
type Player = z.infer<typeof playerSchema>;
type Contract = z.infer<typeof contractSchema>;
```

## 🎯 Combined Example: Player Roster with Filters

```tsx
'use client';

import { useMemo, useState } from 'react';
import { useReactTable, getCoreRowModel, getFilteredRowModel, getSortedRowModel } from '@tanstack/react-table';
import { Search, Filter } from 'lucide-react';
import numeral from 'numeral';
import { useGameStore } from '@/lib/store/game-store';

export function AdvancedPlayerRoster({ players }: { players: Player[] }) {
  const [globalFilter, setGlobalFilter] = useState('');
  const { selectedTeamId } = useGameStore();

  const filteredPlayers = useMemo(() => {
    return players.filter(p => {
      if (selectedTeamId && p.team_id !== selectedTeamId) return false;
      if (globalFilter) {
        const search = globalFilter.toLowerCase();
        return p.full_name.toLowerCase().includes(search) ||
               p.position.toLowerCase().includes(search);
      }
      return true;
    });
  }, [players, selectedTeamId, globalFilter]);

  // ... table setup with @tanstack/react-table

  return (
    <div>
      <div className="flex gap-4 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            placeholder="Search players..."
            className="pl-10 w-full"
          />
        </div>
      </div>
      {/* Table component */}
    </div>
  );
}
```

