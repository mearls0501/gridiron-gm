import { supabase } from "@/lib/supabase-client";
import Link from "next/link";
import { formatCurrency } from "@/lib/utils/format";
import { DollarSign } from "lucide-react";
import { SalaryCapChart } from "@/app/components/SalaryCapChart";
import { CapBreakdown } from "@/app/components/CapBreakdown";

export default async function TeamRosterPage({ params }: { params: Promise<{ id: string }> | { id: string } }) {
  // Handle both sync and async params (Next.js 15+ uses async params)
  const resolvedParams = await Promise.resolve(params);
  const teamId = resolvedParams.id;

  // 1. Fetch team info - use the ID directly (could be UUID or numeric)
  const { data: team, error: teamError } = await supabase
    .from("teams")
    .select("*")
    .eq("id", teamId)
    .single();

  // 2. Fetch players on this team
  const { data: players, error: playersError } = await supabase
    .from("players")
    .select("*")
    .eq("team_id", teamId)
    .order("position", { ascending: true });

  // Salary Cap Calculations
  let totalCapHit = 0;
  const capByPosition: Record<string, number> = {};

  players?.forEach((p) => {
    totalCapHit += p.contract_year_1 ?? 0;

    if (!capByPosition[p.position]) {
      capByPosition[p.position] = 0;
    }
    capByPosition[p.position] += p.contract_year_1 ?? 0;
  });

  const SALARY_CAP = team?.salary_cap_total ?? 255000000;
  const remainingCap = SALARY_CAP - totalCapHit;

  const capBreakdownSorted = Object.entries(capByPosition).sort(
    (a, b) => b[1] - a[1]
  );

  // Prepare data for chart
  const chartData = capBreakdownSorted.map(([name, value]) => ({
    name,
    value,
  }));

  if (teamError) {
    console.error("Team fetch error:", teamError);
    return (
      <div className="max-w-4xl mx-auto mt-12 p-10">
        <div className="text-red-600">
          <h2 className="text-2xl font-bold mb-2">Team not found</h2>
          <p className="text-sm">Error: {teamError.message}</p>
          <p className="text-sm mt-2">Team ID: {teamId}</p>
        </div>
        <Link href="/teams" className="text-blue-600 underline mt-4 inline-block">
          ← Back to Teams
        </Link>
      </div>
    );
  }

  if (!team) {
    return (
      <div className="max-w-4xl mx-auto mt-12 p-10">
        <div className="text-red-600">
          <h2 className="text-2xl font-bold mb-2">Team not found</h2>
          <p className="text-sm">No team found with ID: {teamId}</p>
        </div>
        <Link href="/teams" className="text-blue-600 underline mt-4 inline-block">
          ← Back to Teams
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-6 py-12 pb-20">
      <Link 
        href="/teams" 
        className="inline-flex items-center text-blue-600 hover:text-blue-700 font-medium mb-6 transition-colors"
      >
        <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back to Teams
      </Link>

      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-2 text-gray-900">
          {team.name} <span className="text-2xl text-gray-600">({team.abbreviation})</span>
        </h1>
        <div className="flex items-center gap-4 text-gray-600">
          <span className="font-medium">{team.conference}</span>
          <span>•</span>
          <span>{team.division}</span>
          <span>•</span>
          <span>Expected Wins: <strong className="text-gray-900">{team.owner_expected_wins}</strong></span>
        </div>
      </div>

      {/* Salary Cap Summary */}
      <div className="mb-10 p-6 bg-white rounded-lg border shadow-sm">
        <div className="flex items-center gap-3 mb-6">
          <DollarSign className="w-8 h-8 text-blue-600" />
          <h2 className="text-3xl font-bold">Salary Cap Summary</h2>
        </div>

        {/* Cap Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
            <div className="text-sm text-blue-600 font-medium mb-1">Total Cap</div>
            <div className="text-2xl font-bold text-gray-900">
              {formatCurrency(SALARY_CAP)}
            </div>
          </div>
          <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
            <div className="text-sm text-gray-600 font-medium mb-1">Current Cap Hit</div>
            <div className="text-2xl font-bold text-gray-900">
              {formatCurrency(totalCapHit)}
            </div>
          </div>
          <div className={`p-4 rounded-lg border ${
            remainingCap < 0 
              ? "bg-red-50 border-red-200" 
              : "bg-green-50 border-green-200"
          }`}>
            <div className={`text-sm font-medium mb-1 ${
              remainingCap < 0 ? "text-red-600" : "text-green-600"
            }`}>
              Remaining Cap
            </div>
            <div className={`text-2xl font-bold ${
              remainingCap < 0 ? "text-red-700" : "text-green-700"
            }`}>
              {formatCurrency(remainingCap)}
            </div>
          </div>
        </div>

        {/* Chart and Breakdown */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Pie Chart */}
          <SalaryCapChart chartData={chartData} />

          {/* Position Breakdown */}
          <CapBreakdown 
            capBreakdown={capBreakdownSorted} 
            totalCapHit={totalCapHit}
          />
        </div>
      </div>

      <div className="mb-6">
        <h2 className="text-3xl font-bold mb-2 text-gray-900">Roster</h2>
        <p className="text-gray-600">{players?.length || 0} players</p>
      </div>

      {playersError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 mb-6">
          Error loading players: {playersError.message}
        </div>
      )}

      {(!players || players.length === 0) && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-8 text-center text-gray-500">
          No players found for this team.
        </div>
      )}

      <div className="grid grid-cols-1 gap-4">
        {players?.map((p) => (
          <Link
            key={p.id}
            href={`/players/${p.id}`}
            className="block bg-white rounded-lg shadow-md p-5 border border-gray-200 hover:shadow-lg hover:border-blue-300 transition-all group"
          >
            <div className="flex justify-between items-start">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <h3 className="font-bold text-lg text-gray-900 group-hover:text-blue-600">
                    {p.full_name}
                  </h3>
                  <span className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-sm font-medium">
                    {p.position}
                  </span>
                </div>
                <div className="flex items-center gap-4 text-sm text-gray-600 mb-2">
                  <span>OVR: <strong className="text-gray-900">{p.overall}</strong></span>
                  <span>POT: <strong className="text-gray-900">{p.potential}</strong></span>
                  <span>Age: <strong className="text-gray-900">{p.age}</strong></span>
                </div>
                <p className="text-sm text-gray-500">College: {p.college}</p>
              </div>

              <div className="text-right ml-6">
                <p className="text-xs text-gray-500 mb-1">Contract</p>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between gap-4">
                    <span className="text-gray-600">Y1:</span>
                    <span className="font-medium text-gray-900">${(p.contract_year_1 || 0).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-gray-600">Y2:</span>
                    <span className="font-medium text-gray-900">${(p.contract_year_2 || 0).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-gray-600">Y3:</span>
                    <span className="font-medium text-gray-900">${(p.contract_year_3 || 0).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-gray-600">Y4:</span>
                    <span className="font-medium text-gray-900">${(p.contract_year_4 || 0).toLocaleString()}</span>
                  </div>
                  <div className="pt-1 mt-1 border-t border-gray-200">
                    <div className="flex justify-between gap-4">
                      <span className="text-gray-600">Bonus:</span>
                      <span className="font-semibold text-blue-600">${(p.signing_bonus || 0).toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
