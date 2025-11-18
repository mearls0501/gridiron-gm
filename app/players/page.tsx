// app/players/page.tsx
"use client";

import { useState, useEffect, useMemo, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase-client";
import Link from "next/link";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { useDebounce } from "use-debounce";
import { Search, ArrowUpDown, ArrowUp, ArrowDown, Users, Filter } from "lucide-react";
import { formatCurrency } from "@/lib/utils/format";

// Position list for dropdown filter
const positions = [
  "All","QB","RB","WR","TE","OT","OG","C",
  "DE","DT","LB","CB","S","K","P"
];

interface Player {
  id: string;
  full_name: string;
  position: string;
  age: number;
  overall: number;
  potential: number;
  college: string;
  team_id: string | null;
  contract_year_1: number;
  contract_year_2: number;
  contract_year_3: number;
  contract_year_4: number;
  signing_bonus: number;
  teams?: { name: string; abbreviation: string } | { name: string; abbreviation: string }[] | null;
}

function PlayersPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [players, setPlayers] = useState<Player[]>([]);
  interface Team {
    id: string;
    name: string;
    abbreviation: string;
  }
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState("");

  const selectedPosition = searchParams.get("position") || "All";
  const selectedTeam = searchParams.get("team") || "All";
  const search = searchParams.get("search") || "";
  const [debouncedSearch] = useDebounce(search, 300);

  useEffect(() => {
    fetchTeams();
  }, []);

  useEffect(() => {
    fetchPlayers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPosition, selectedTeam, debouncedSearch]);

  async function fetchTeams() {
    try {
      const { data, error: teamsError } = await supabase
        .from("teams")
        .select("id, name, abbreviation")
        .order("name", { ascending: true });

      if (!teamsError && data) {
        setTeams(data || []);
      }
    } catch (err) {
      console.error("Error fetching teams:", err);
    }
  }

  async function fetchPlayers() {
    setLoading(true);
    setError(null);

    try {
      let query = supabase.from("players").select(`
        id,
        full_name,
        position,
        age,
        overall,
        potential,
        college,
        team_id,
        contract_year_1,
        contract_year_2,
        contract_year_3,
        contract_year_4,
        signing_bonus,
        teams ( name, abbreviation )
      `).order("overall", { ascending: false });

      // Apply filters
      if (selectedPosition !== "All") {
        query = query.eq("position", selectedPosition);
      }

      if (selectedTeam !== "All") {
        query = query.eq("team_id", selectedTeam);
      }

      if (debouncedSearch) {
        query = query.ilike("full_name", `%${debouncedSearch}%`);
      }

      const { data, error: queryError } = await query;

      if (queryError) {
        setError(queryError.message);
      } else {
        setPlayers(data || []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load players");
    } finally {
      setLoading(false);
    }
  }

  function handlePositionChange(pos: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (pos === "All") {
      params.delete("position");
    } else {
      params.set("position", pos);
    }
    router.push(`/players?${params.toString()}`);
  }

  function handleTeamChange(teamId: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (teamId === "All") {
      params.delete("team");
    } else {
      params.set("team", teamId);
    }
    router.push(`/players?${params.toString()}`);
  }

  function handleSearchChange(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set("search", value);
    } else {
      params.delete("search");
    }
    router.push(`/players?${params.toString()}`);
    setGlobalFilter(value);
  }

  // Table columns definition
  const columns = useMemo<ColumnDef<Player>[]>(
    () => [
      {
        accessorKey: "full_name",
        header: ({ column }) => (
          <button
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="flex items-center gap-1 hover:text-blue-600"
          >
            Name
            {column.getIsSorted() === "asc" ? (
              <ArrowUp className="w-3 h-3" />
            ) : column.getIsSorted() === "desc" ? (
              <ArrowDown className="w-3 h-3" />
            ) : (
              <ArrowUpDown className="w-3 h-3 opacity-50" />
            )}
          </button>
        ),
        cell: ({ row }) => {
          const player = row.original;
          return (
            <Link
              href={`/players/${player.id}`}
              className="font-semibold text-blue-600 hover:text-blue-800"
            >
              {player.full_name}
            </Link>
          );
        },
      },
      {
        accessorKey: "position",
        header: ({ column }) => (
          <button
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="flex items-center gap-1 hover:text-blue-600"
          >
            Pos
            {column.getIsSorted() === "asc" ? (
              <ArrowUp className="w-3 h-3" />
            ) : column.getIsSorted() === "desc" ? (
              <ArrowDown className="w-3 h-3" />
            ) : (
              <ArrowUpDown className="w-3 h-3 opacity-50" />
            )}
          </button>
        ),
        cell: ({ getValue }) => (
          <span className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-sm font-medium">
            {getValue() as string}
          </span>
        ),
      },
      {
        accessorKey: "overall",
        header: ({ column }) => (
          <button
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="flex items-center gap-1 hover:text-blue-600"
          >
            OVR
            {column.getIsSorted() === "asc" ? (
              <ArrowUp className="w-3 h-3" />
            ) : column.getIsSorted() === "desc" ? (
              <ArrowDown className="w-3 h-3" />
            ) : (
              <ArrowUpDown className="w-3 h-3 opacity-50" />
            )}
          </button>
        ),
        cell: ({ getValue }) => (
          <span className="text-sm font-semibold text-gray-900">
            {getValue() as number}
          </span>
        ),
      },
      {
        accessorKey: "potential",
        header: ({ column }) => (
          <button
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="flex items-center gap-1 hover:text-blue-600"
          >
            POT
            {column.getIsSorted() === "asc" ? (
              <ArrowUp className="w-3 h-3" />
            ) : column.getIsSorted() === "desc" ? (
              <ArrowDown className="w-3 h-3" />
            ) : (
              <ArrowUpDown className="w-3 h-3 opacity-50" />
            )}
          </button>
        ),
        cell: ({ getValue }) => (
          <span className="text-sm text-gray-700">{getValue() as number}</span>
        ),
      },
      {
        accessorKey: "age",
        header: ({ column }) => (
          <button
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="flex items-center gap-1 hover:text-blue-600"
          >
            Age
            {column.getIsSorted() === "asc" ? (
              <ArrowUp className="w-3 h-3" />
            ) : column.getIsSorted() === "desc" ? (
              <ArrowDown className="w-3 h-3" />
            ) : (
              <ArrowUpDown className="w-3 h-3 opacity-50" />
            )}
          </button>
        ),
        cell: ({ getValue }) => (
          <span className="text-sm text-gray-700">{getValue() as number}</span>
        ),
      },
      {
        accessorKey: "college",
        header: "College",
        cell: ({ getValue }) => (
          <span className="text-sm text-gray-700">{getValue() as string}</span>
        ),
      },
      {
        id: "team",
        header: "Team",
        cell: ({ row }) => {
          const player = row.original;
          const team = Array.isArray(player.teams) && player.teams.length > 0
            ? player.teams[0]
            : typeof player.teams === "object" && player.teams !== null && !Array.isArray(player.teams)
              ? player.teams
              : null;

          if (!team || !player.team_id) {
            return <span className="text-gray-400">-</span>;
          }

          return (
            <Link
              href={`/teams/${player.team_id}`}
              className="text-blue-600 hover:text-blue-800 font-medium"
            >
              {team.abbreviation}
            </Link>
          );
        },
      },
      {
        accessorKey: "contract_year_1",
        header: ({ column }) => (
          <button
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="flex items-center gap-1 hover:text-blue-600 text-right"
          >
            Y1
            {column.getIsSorted() === "asc" ? (
              <ArrowUp className="w-3 h-3" />
            ) : column.getIsSorted() === "desc" ? (
              <ArrowDown className="w-3 h-3" />
            ) : (
              <ArrowUpDown className="w-3 h-3 opacity-50" />
            )}
          </button>
        ),
        cell: ({ getValue }) => (
          <span className="text-sm text-right text-gray-700 block">
            {formatCurrency(getValue() as number)}
          </span>
        ),
      },
      {
        accessorKey: "contract_year_2",
        header: "Y2",
        cell: ({ getValue }) => (
          <span className="text-sm text-right text-gray-700 block">
            {formatCurrency(getValue() as number)}
          </span>
        ),
      },
      {
        accessorKey: "contract_year_3",
        header: "Y3",
        cell: ({ getValue }) => (
          <span className="text-sm text-right text-gray-700 block">
            {formatCurrency(getValue() as number)}
          </span>
        ),
      },
      {
        accessorKey: "contract_year_4",
        header: "Y4",
        cell: ({ getValue }) => (
          <span className="text-sm text-right text-gray-700 block">
            {formatCurrency(getValue() as number)}
          </span>
        ),
      },
    ],
    []
  );

  // Filter players based on global filter (client-side for instant feedback)
  const filteredPlayers = useMemo(() => {
    if (!globalFilter) return players;
    const filter = globalFilter.toLowerCase();
    return players.filter(
      (p) =>
        p.full_name.toLowerCase().includes(filter) ||
        p.position.toLowerCase().includes(filter) ||
        p.college.toLowerCase().includes(filter)
    );
  }, [players, globalFilter]);

  const table = useReactTable({
    data: filteredPlayers,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onSortingChange: setSorting,
    state: {
      sorting,
    },
  });

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto mt-12 p-6">
        <h1 className="text-4xl font-bold mb-6">Players</h1>
        <p className="text-gray-600">Loading players...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-6xl mx-auto mt-12 p-6">
        <h1 className="text-4xl font-bold mb-6">Players</h1>
        <div className="p-6 text-red-600">Error loading players: {error}</div>
      </div>
    );
  }

  return (
    <div className="ootp-container">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <Users className="w-8 h-8 text-blue-600" />
          <h1 className="ootp-page-title">Players</h1>
        </div>
        <p className="ootp-text-secondary">Browse and search all players in the league</p>
      </div>

      {/* Filters */}
      <div className="ootp-panel mb-6">
        <div className="ootp-panel-header">
          <div className="flex items-center gap-2">
            <Filter className="w-5 h-5" />
            <span>Filters</span>
          </div>
        </div>
        <div className="ootp-panel-body">
        <div className="flex flex-wrap gap-4">
          {/* Position Filter */}
          <div className="flex-1 min-w-[150px]">
            <label className="block text-sm font-medium text-gray-700 mb-2">Position</label>
            <select
              value={selectedPosition}
              className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              onChange={(e) => handlePositionChange(e.target.value)}
            >
              {positions.map((pos) => (
                <option key={pos} value={pos}>{pos}</option>
              ))}
            </select>
          </div>

          {/* Team Filter */}
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-medium text-gray-700 mb-2">Team</label>
            <select
              value={selectedTeam}
              className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              onChange={(e) => handleTeamChange(e.target.value)}
            >
              <option value="All">All Teams</option>
              {teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name} ({team.abbreviation})
                </option>
              ))}
            </select>
          </div>

          {/* Search Bar */}
          <div className="flex-1 min-w-[250px]">
            <label className="block text-sm font-medium text-gray-700 mb-2">Search</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search by name, position, college..."
                value={search}
                onChange={(e) => handleSearchChange(e.target.value)}
                className="w-full border border-gray-300 rounded-lg pl-10 pr-4 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>
        </div>
        {filteredPlayers.length !== players.length && (
          <div className="mt-4 text-sm ootp-text-muted">
            Showing {filteredPlayers.length} of {players.length} players
          </div>
        )}
        </div>
      </div>

      {/* Player Table */}
      <div className="ootp-table-container">
        <table className="ootp-table">
            <thead>
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <th
                      key={header.id}
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {table.getRowModel().rows.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} className="px-6 py-12 text-center text-gray-500">
                    No players found
                  </td>
                </tr>
              ) : (
                table.getRowModel().rows.map((row) => (
                  <tr
                    key={row.id}
                    className="hover:bg-blue-50 cursor-pointer transition-colors"
                    onClick={() => router.push(`/players/${row.original.id}`)}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td
                        key={cell.id}
                        className="px-6 py-4 whitespace-nowrap"
                        onClick={(e) => {
                          // Prevent navigation when clicking on links
                          if (cell.column.id === "full_name" || cell.column.id === "team") {
                            e.stopPropagation();
                          }
                        }}
                      >
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext()
                        )}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        {table.getRowModel().rows.length > 0 && (
          <div className="ootp-panel-footer">
            <div className="text-sm ootp-text-muted">
              Showing {table.getRowModel().rows.length} of {players.length} players
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function PlayersPage() {
  return (
    <Suspense fallback={
      <div className="ootp-container">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <Users className="w-8 h-8 text-blue-600" />
            <h1 className="ootp-page-title">Players</h1>
          </div>
          <p className="ootp-text-secondary">Browse and search all players in the league</p>
        </div>
        <div className="ootp-panel">
          <div className="ootp-panel-body">
            <div className="text-center py-12">
              <p className="ootp-text-muted">Loading...</p>
            </div>
          </div>
        </div>
      </div>
    }>
      <PlayersPageContent />
    </Suspense>
  );
}
