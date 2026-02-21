"use client";

import React, { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase-client";
import Link from "next/link";
import { X } from "lucide-react";

interface Player {
  id: string;
  full_name: string;
  position: string;
  age: number;
  college: string | null;
  archetype: string | null;
  overall: number;
  potential: number;
  team_id: string | null;
  
  // Physical
  spd?: number;
  acc?: number;
  agi?: number;
  str?: number;
  
  // QB/Passing
  thp?: number;
  sac?: number;
  mac?: number;
  dac?: number;
  tup?: number;
  pac?: number;
  dec?: number;
  awr?: number;
  
  // Ball Carrier
  btk?: number;
  car?: number;
  vsn?: number;
  rtr?: number;
  pblk?: number;
  rblk?: number;
  iblk?: number;
  agg?: number;
  
  // Receiving
  rls?: number;
  rte?: number;
  cth?: number;
  cit?: number;
  yac?: number;
  
  // Defensive Line
  pmv?: number;
  fmv?: number;
  bsh?: number;
  pur?: number;
  
  // LB/Defense
  tak?: number;
  cov?: number;
  mcv?: number;
  zcv?: number;
  prs?: number;
  
  // Kicking
  kpw?: number;
  kac?: number;
  
  // Mental
  football_iq?: number;
  motor?: number;
  work_ethic?: number;
  coachability?: number;
  leadership?: number;
  durability?: number;
  consistency?: number;
}

interface Team {
  name: string;
  abbreviation: string;
}

function ComparePlayersContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [players, setPlayers] = useState<Player[]>([]);
  const [teams, setTeams] = useState<Map<string, Team>>(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPlayers();
  }, [searchParams]);

  async function loadPlayers() {
    const playerIds = searchParams.get("players")?.split(",").filter(Boolean) || [];
    
    if (playerIds.length === 0) {
      setLoading(false);
      return;
    }

    const { data } = await supabase
      .from("players")
      .select("*")
      .in("id", playerIds);

    if (data) {
      setPlayers(data);
      
      // Load teams
      const teamIds = [...new Set(data.map(p => p.team_id).filter(Boolean))];
      if (teamIds.length > 0) {
        const { data: teamsData } = await supabase
          .from("teams")
          .select("id, name, abbreviation")
          .in("id", teamIds);

        if (teamsData) {
          const teamMap = new Map();
          teamsData.forEach(t => teamMap.set(t.id, t));
          setTeams(teamMap);
        }
      }
    }

    setLoading(false);
  }

  function removePlayer(playerId: string) {
    const currentIds = searchParams.get("players")?.split(",").filter(Boolean) || [];
    const newIds = currentIds.filter(id => id !== playerId);
    
    if (newIds.length === 0) {
      router.push("/players");
    } else {
      router.push(`/players/compare?players=${newIds.join(",")}`);
    }
  }

  function addAnother() {
    router.push("/players");
  }

  const attributeCategories = [
    {
      name: "Overall",
      attrs: [
        { key: "overall", label: "Overall" },
        { key: "potential", label: "Potential" },
        { key: "age", label: "Age" },
      ],
    },
    {
      name: "Physical",
      attrs: [
        { key: "spd", label: "Speed" },
        { key: "acc", label: "Acceleration" },
        { key: "agi", label: "Agility" },
        { key: "str", label: "Strength" },
      ],
    },
    {
      name: "Passing",
      attrs: [
        { key: "thp", label: "Throw Power" },
        { key: "sac", label: "Short Acc" },
        { key: "mac", label: "Medium Acc" },
        { key: "dac", label: "Deep Acc" },
        { key: "tup", label: "Throw Under Pressure" },
        { key: "pac", label: "Play Action" },
      ],
    },
    {
      name: "Receiving",
      attrs: [
        { key: "rls", label: "Release" },
        { key: "rte", label: "Route Running" },
        { key: "cth", label: "Catching" },
        { key: "cit", label: "Catch in Traffic" },
        { key: "yac", label: "YAC" },
      ],
    },
    {
      name: "Ball Carrier",
      attrs: [
        { key: "btk", label: "Break Tackle" },
        { key: "car", label: "Carrying" },
        { key: "vsn", label: "Vision" },
        { key: "rtr", label: "Route Tech" },
        { key: "agg", label: "Aggression" },
      ],
    },
    {
      name: "Blocking",
      attrs: [
        { key: "pblk", label: "Pass Block" },
        { key: "rblk", label: "Run Block" },
        { key: "iblk", label: "Impact Block" },
      ],
    },
    {
      name: "Defense",
      attrs: [
        { key: "tak", label: "Tackle" },
        { key: "cov", label: "Coverage" },
        { key: "mcv", label: "Man Coverage" },
        { key: "zcv", label: "Zone Coverage" },
        { key: "prs", label: "Press" },
        { key: "pmv", label: "Power Moves" },
        { key: "fmv", label: "Finesse Moves" },
        { key: "bsh", label: "Block Shed" },
        { key: "pur", label: "Pursuit" },
      ],
    },
    {
      name: "Mental",
      attrs: [
        { key: "football_iq", label: "Football IQ" },
        { key: "awr", label: "Awareness" },
        { key: "dec", label: "Decision Making" },
        { key: "motor", label: "Motor" },
        { key: "work_ethic", label: "Work Ethic" },
        { key: "coachability", label: "Coachability" },
        { key: "leadership", label: "Leadership" },
        { key: "durability", label: "Durability" },
        { key: "consistency", label: "Consistency" },
      ],
    },
  ];

  if (loading) {
    return (
      <div className="ootp-container">
        <p>Loading comparison...</p>
      </div>
    );
  }

  if (players.length === 0) {
    return (
      <div className="ootp-container">
        <h1 className="ootp-page-title mb-6">Compare Players</h1>
        <p className="text-gray-600 mb-4">No players selected for comparison.</p>
        <Link href="/players" className="text-blue-600 hover:underline">
          ← Back to Players
        </Link>
      </div>
    );
  }

  return (
    <div className="ootp-container">
      <div className="flex items-center justify-between mb-6">
        <h1 className="ootp-page-title">Compare Players</h1>
        <Link href="/players" className="text-blue-600 hover:underline">
          ← Back to Players
        </Link>
      </div>

      {players.length < 3 && (
        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded text-blue-700 text-sm">
          You can compare up to 3 players. <button onClick={addAnother} className="underline font-semibold">Add another player</button>
        </div>
      )}

      {/* Player Headers */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        {players.map((player) => {
          const team = player.team_id ? teams.get(player.team_id) : null;
          return (
            <div key={player.id} className="bg-white border border-gray-300 rounded-lg p-4 relative">
              <button
                onClick={() => removePlayer(player.id)}
                className="absolute top-2 right-2 text-gray-400 hover:text-red-600"
                title="Remove from comparison"
              >
                <X className="w-5 h-5" />
              </button>
              
              <Link href={`/players/${player.id}`} className="text-xl font-bold text-blue-600 hover:underline block mb-2">
                {player.full_name}
              </Link>
              
              <div className="text-sm text-gray-600 space-y-1">
                <div>
                  <span className="font-semibold">{player.position}</span> • Age {player.age}
                </div>
                {team && (
                  <div>{team.abbreviation}</div>
                )}
                {player.college && (
                  <div className="italic">{player.college}</div>
                )}
                {player.archetype && (
                  <div className="text-xs text-gray-500">{player.archetype}</div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Comparison Table */}
      <div className="bg-white border border-gray-300 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-100 border-b border-gray-300">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Attribute</th>
                {players.map((player) => (
                  <th key={player.id} className="px-4 py-3 text-center text-sm font-semibold text-gray-700">
                    {player.full_name.split(" ").pop()}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {attributeCategories.map((category) => {
                const hasAnyValue = category.attrs.some(attr =>
                  players.some(p => p[attr.key as keyof Player] !== undefined && p[attr.key as keyof Player] !== null)
                );

                if (!hasAnyValue) return null;

                return (
                  <React.Fragment key={category.name}>
                    <tr className="bg-gray-50">
                      <td colSpan={players.length + 1} className="px-4 py-2 font-bold text-gray-900">
                        {category.name}
                      </td>
                    </tr>
                    {category.attrs.map((attr) => {
                      const hasValue = players.some(p => p[attr.key as keyof Player] !== undefined && p[attr.key as keyof Player] !== null);
                      if (!hasValue) return null;

                      const values = players.map(p => p[attr.key as keyof Player] as number | undefined);
                      const maxValue = Math.max(...values.filter(v => v !== undefined) as number[]);

                      return (
                        <tr key={attr.key} className="hover:bg-gray-50">
                          <td className="px-4 py-2 text-sm text-gray-700">{attr.label}</td>
                          {players.map((player, idx) => {
                            const value = player[attr.key as keyof Player] as number | undefined;
                            const isMax = value !== undefined && value === maxValue && maxValue > 0;

                            return (
                              <td
                                key={player.id}
                                className={`px-4 py-2 text-center text-sm font-semibold ${
                                  isMax ? "bg-green-50 text-green-700" : "text-gray-900"
                                }`}
                              >
                                {value ?? "-"}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default function ComparePlayersPage() {
  return (
    <Suspense fallback={
      <div className="ootp-container">
        <p>Loading...</p>
      </div>
    }>
      <ComparePlayersContent />
    </Suspense>
  );
}

