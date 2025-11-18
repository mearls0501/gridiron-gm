// app/teams/page.tsx
import Link from "next/link";
import { supabase } from "@/lib/supabase-client";

export default async function TeamsPage() {
  const { data: teams, error } = await supabase.from("teams").select("*");

  if (error) {
    console.error("Supabase Error:", error);
    return <div>Error loading teams: {error.message}</div>;
  }

  return (
    <div className="ootp-container">
      <div className="mb-8">
        <h1 className="ootp-page-title">Browse all teams in the league</h1>
      </div>

      <div className="ootp-grid ootp-grid-3">
        {teams?.map((team) => (
          <Link
            key={team.id}
            href={`/teams/${team.id}`}
            className="ootp-card"
          >
            <div className="ootp-card-body">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h2 className="text-xl font-bold text-gray-900 group-hover:text-blue-600">
                    {team.name}
                  </h2>
                  <p className="text-sm font-medium text-gray-500 mt-1">
                    {team.abbreviation}
                  </p>
                </div>
                <svg className="w-5 h-5 text-gray-400 group-hover:text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
              
              <div className="space-y-2">
                <div className="flex items-center text-sm ootp-text-secondary">
                  <span className="font-medium">{team.conference}</span>
                  <span className="mx-2">•</span>
                  <span>{team.division}</span>
                </div>
                
                <div className="pt-2 border-t" style={{ borderColor: 'var(--table-border)' }}>
                  <div className="flex justify-between text-sm">
                    <span className="ootp-text-secondary">Owner Goal:</span>
                    <span className="font-medium text-gray-900">{team.owner_goal}</span>
                  </div>
                  <div className="flex justify-between text-sm mt-1">
                    <span className="ootp-text-secondary">Expected Wins:</span>
                    <span className="font-medium text-gray-900">{team.owner_expected_wins}</span>
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



