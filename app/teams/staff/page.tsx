'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase-client';
import { formatCurrency } from '@/lib/utils/format';
import { generateCoachingStaff } from '@/lib/coach-generator';
import { Award, Users, TrendingUp, Target, AlertCircle, X, Plus } from 'lucide-react';
import Link from 'next/link';

interface StaffMember {
  id: string;
  team_id: string | null;
  name: string;
  role: string;
  rating: number;
  specialty: string | null;
  experience: number;
  contract_year_1: number;
  contract_year_2: number;
  contract_year_3: number;
  contract_year_4: number;
}

const roleLabels: Record<string, string> = {
  head_coach: 'Head Coach',
  offensive_coordinator: 'Offensive Coordinator',
  defensive_coordinator: 'Defensive Coordinator',
  special_teams_coordinator: 'Special Teams Coordinator',
  qb_coach: 'QB Coach',
  rb_coach: 'RB Coach',
  wr_coach: 'WR Coach',
  te_coach: 'TE Coach',
  ol_coach: 'OL Coach',
  dl_coach: 'DL Coach',
  lb_coach: 'LB Coach',
  db_coach: 'DB Coach',
};

export default function StaffPage() {
  const [team, setTeam] = useState<any>(null);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [availableCoaches, setAvailableCoaches] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCoach, setSelectedCoach] = useState<StaffMember | null>(null);
  const [showResignModal, setShowResignModal] = useState(false);
  const [showHireModal, setShowHireModal] = useState(false);
  const [contractYears, setContractYears] = useState<number[]>([0, 0, 0, 0]);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    loadTeamAndStaff();
  }, []);

  async function loadTeamAndStaff() {
    try {
      let selectedTeamId: string | null = null;
      if (typeof window !== 'undefined') {
        selectedTeamId = localStorage.getItem('selectedTeamId');
      }

      if (!selectedTeamId) {
        const { useGameStore } = await import('@/lib/store/game-store');
        selectedTeamId = useGameStore.getState().selectedTeamId;
      }

      if (!selectedTeamId) {
        router.push('/');
        return;
      }

      const { data: teamData, error: teamError } = await supabase
        .from('teams')
        .select('*')
        .eq('id', selectedTeamId)
        .single();

      if (teamError || !teamData) {
        console.error('Error loading team:', teamError);
        return;
      }

      setTeam(teamData);

      // Fetch coaching staff for this team
      const { data: staffData, error: staffError } = await supabase
        .from('coaching_staff')
        .select('*')
        .eq('team_id', selectedTeamId)
        .order('role', { ascending: true });

      if (staffError) {
        console.error('Error loading staff:', staffError);
        // If table doesn't exist or no staff, initialize
        if (staffError.code === 'PGRST116' || (staffData || []).length === 0) {
          await initializeStaff(selectedTeamId);
          return;
        }
      } else {
        setStaff(staffData || []);
      }

      // Fetch available coaches (team_id is null)
      const { data: availableData, error: availableError } = await supabase
        .from('coaching_staff')
        .select('*')
        .is('team_id', null)
        .order('rating', { ascending: false })
        .limit(20);

      if (!availableError && availableData) {
        setAvailableCoaches(availableData);
      }
    } catch (err) {
      console.error('Error loading staff:', err);
    } finally {
      setLoading(false);
    }
  }

  async function initializeStaff(teamId: string) {
    try {
      const newStaff = generateCoachingStaff(teamId);
      const staffToInsert = newStaff.map((s) => ({
        ...s,
        team_id: teamId,
      }));

      const { error: insertError } = await supabase
        .from('coaching_staff')
        .insert(staffToInsert);

      if (insertError) {
        console.error('Error initializing staff:', insertError);
      } else {
        // Reload staff
        await loadTeamAndStaff();
      }
    } catch (err) {
      console.error('Error initializing staff:', err);
    }
  }

  // Group staff by role type
  const headCoach = staff.find((s) => s.role === 'head_coach');
  const coordinators = staff.filter((s) =>
    ['offensive_coordinator', 'defensive_coordinator', 'special_teams_coordinator'].includes(s.role)
  );
  const positionCoaches = staff.filter(
    (s) => !['head_coach', 'offensive_coordinator', 'defensive_coordinator', 'special_teams_coordinator'].includes(s.role)
  );

  // Calculate staff stats
  const avgRating =
    staff.length > 0 ? Math.round(staff.reduce((sum, s) => sum + s.rating, 0) / staff.length) : 0;
  const totalStaffSalary = staff.reduce((sum, s) => sum + (s.contract_year_1 || 0), 0);

  function isExpiringContract(coach: StaffMember): boolean {
    return !coach.contract_year_1 || coach.contract_year_1 === 0;
  }

  async function handleResign(coach: StaffMember) {
    setSelectedCoach(coach);
    // Suggest contract based on current rating
    const baseSalary = (coach.rating / 100) * 2_000_000; // Rough estimate
    setContractYears([
      Math.round(baseSalary),
      Math.round(baseSalary * 1.05),
      Math.round(baseSalary * 1.1),
      Math.round(baseSalary * 1.15),
    ]);
    setShowResignModal(true);
    setError(null);
  }

  async function handleHire(coach: StaffMember) {
    setSelectedCoach(coach);
    // Suggest contract based on rating
    const baseSalary = (coach.rating / 100) * 2_000_000;
    setContractYears([
      Math.round(baseSalary),
      Math.round(baseSalary * 1.05),
      Math.round(baseSalary * 1.1),
      Math.round(baseSalary * 1.15),
    ]);
    setShowHireModal(true);
    setError(null);
  }

  async function submitResign() {
    if (!selectedCoach || !team) return;

    setProcessing(true);
    setError(null);

    try {
      const response = await fetch('/api/coaches/resign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          coachId: selectedCoach.id,
          teamId: team.id,
          contractYears: contractYears.filter((y) => y > 0),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Failed to re-sign coach');
        return;
      }

      await loadTeamAndStaff();
      setShowResignModal(false);
      setSelectedCoach(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setProcessing(false);
    }
  }

  async function submitHire() {
    if (!selectedCoach || !team) return;

    setProcessing(true);
    setError(null);

    try {
      const response = await fetch('/api/coaches/hire', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          coachId: selectedCoach.id,
          teamId: team.id,
          contractYears: contractYears.filter((y) => y > 0),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Failed to hire coach');
        return;
      }

      await loadTeamAndStaff();
      setShowHireModal(false);
      setSelectedCoach(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setProcessing(false);
    }
  }

  if (loading) {
    return (
      <div className="ootp-container">
        <div className="text-center py-12">
          <p className="text-gray-600">Loading staff...</p>
        </div>
      </div>
    );
  }

  if (!team) {
    return (
      <div className="ootp-container">
        <div className="text-center py-12">
          <p className="text-red-600 mb-4">Team not found</p>
          <Link href="/" className="text-blue-600 hover:underline">
            Go to Home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="ootp-container">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="ootp-page-title">{team.name} Coaching Staff</h1>
            <div className="flex items-center gap-4 mt-2 text-sm text-gray-600">
              <span>
                {team.conference} {team.division}
              </span>
            </div>
          </div>
          <Link
            href="/teams/my-team"
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
          >
            Back to My Team
          </Link>
        </div>
        <div className="h-1 w-24 bg-gradient-to-r from-blue-600 to-blue-400"></div>
      </div>

      {/* Staff Summary */}
      <div className="ootp-grid ootp-grid-4 mb-8">
        <div className="ootp-panel">
          <div className="ootp-panel-header">Total Staff</div>
          <div className="ootp-panel-body">
            <div className="text-3xl font-bold text-gray-900">{staff.length}</div>
            <div className="text-sm text-gray-600">Coaches</div>
          </div>
        </div>
        <div className="ootp-panel">
          <div className="ootp-panel-header">Avg Rating</div>
          <div className="ootp-panel-body">
            <div className="text-3xl font-bold text-gray-900">{avgRating}</div>
            <div className="text-sm text-gray-600">Overall</div>
          </div>
        </div>
        <div className="ootp-panel">
          <div className="ootp-panel-header">Total Salary</div>
          <div className="ootp-panel-body">
            <div className="text-3xl font-bold text-gray-900">
              {formatCurrency(totalStaffSalary)}
            </div>
            <div className="text-sm text-gray-600">Annual</div>
          </div>
        </div>
        <div className="ootp-panel">
          <div className="ootp-panel-header">Experience</div>
          <div className="ootp-panel-body">
            <div className="text-3xl font-bold text-gray-900">
              {staff.length > 0
                ? Math.round(staff.reduce((sum, s) => sum + s.experience, 0) / staff.length)
                : 0}
            </div>
            <div className="text-sm text-gray-600">Avg Years</div>
          </div>
        </div>
      </div>

      {/* Head Coach */}
      {headCoach && (
        <div className="ootp-panel mb-8">
          <div className="ootp-panel-header flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Award className="w-5 h-5" />
              Head Coach
            </div>
            {isExpiringContract(headCoach) && (
              <button
                onClick={() => handleResign(headCoach)}
                className="px-3 py-1 text-sm bg-orange-100 text-orange-700 rounded hover:bg-orange-200"
              >
                Re-sign
              </button>
            )}
          </div>
          <div className="ootp-panel-body">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-2xl font-bold text-gray-900 mb-2">{headCoach.name}</h3>
                <div className="flex items-center gap-4 text-sm text-gray-600 mb-3">
                  <span>
                    Rating: <strong className="text-gray-900">{headCoach.rating}</strong>
                  </span>
                  <span>
                    Experience: <strong className="text-gray-900">{headCoach.experience} years</strong>
                  </span>
                  {headCoach.specialty && (
                    <span>
                      Specialty: <strong className="text-gray-900">{headCoach.specialty}</strong>
                    </span>
                  )}
                </div>
                <div className="text-sm text-gray-600">
                  <p>
                    Salary: <strong className="text-gray-900">{formatCurrency(headCoach.contract_year_1 || 0)}/year</strong>
                  </p>
                  {isExpiringContract(headCoach) && (
                    <p className="text-orange-600 mt-1">
                      <AlertCircle className="w-4 h-4 inline mr-1" />
                      Contract expiring
                    </p>
                  )}
                </div>
              </div>
              <div className="text-right">
                <div className="w-24 h-24 bg-blue-100 rounded-full flex items-center justify-center">
                  <span className="text-3xl font-bold text-blue-600">{headCoach.rating}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Coordinators */}
      {coordinators.length > 0 && (
        <div className="ootp-panel mb-8">
          <div className="ootp-panel-header">Coordinators</div>
          <div className="ootp-panel-body">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {coordinators.map((member) => (
                <div
                  key={member.id}
                  className="p-4 bg-gray-50 rounded-lg border border-gray-200 hover:border-blue-300 transition-colors"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h4 className="font-bold text-gray-900">{member.name}</h4>
                      <p className="text-sm text-gray-600">{roleLabels[member.role] || member.role}</p>
                    </div>
                    <div className="text-right">
                      <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                        <span className="text-lg font-bold text-blue-600">{member.rating}</span>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-1 text-sm text-gray-600">
                    {member.specialty && (
                      <p>
                        Specialty: <strong className="text-gray-900">{member.specialty}</strong>
                      </p>
                    )}
                    <p>
                      Experience: <strong className="text-gray-900">{member.experience} years</strong>
                    </p>
                    <p>
                      Salary: <strong className="text-gray-900">{formatCurrency(member.contract_year_1 || 0)}</strong>
                    </p>
                    {isExpiringContract(member) && (
                      <button
                        onClick={() => handleResign(member)}
                        className="mt-2 px-2 py-1 text-xs bg-orange-100 text-orange-700 rounded hover:bg-orange-200"
                      >
                        Re-sign
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Position Coaches */}
      {positionCoaches.length > 0 && (
        <div className="ootp-panel mb-8">
          <div className="ootp-panel-header">Position Coaches</div>
          <div className="ootp-panel-body p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Role</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Rating</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Specialty</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Experience</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Salary</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {positionCoaches.map((member) => (
                    <tr key={member.id} className="hover:bg-blue-50">
                      <td className="px-6 py-4 whitespace-nowrap font-semibold text-gray-900">{member.name}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                        {roleLabels[member.role] || member.role}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-sm font-medium">
                          {member.rating}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                        {member.specialty || '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{member.experience} years</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {formatCurrency(member.contract_year_1 || 0)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        {isExpiringContract(member) && (
                          <button
                            onClick={() => handleResign(member)}
                            className="text-orange-600 hover:text-orange-800"
                          >
                            Re-sign
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Available Coaches */}
      {availableCoaches.length > 0 && (
        <div className="ootp-panel">
          <div className="ootp-panel-header flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5" />
              Available Coaches
            </div>
          </div>
          <div className="ootp-panel-body p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Role</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Rating</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Specialty</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Experience</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {availableCoaches.map((coach) => {
                    // Check if team already has this role
                    const hasRole = staff.some((s) => s.role === coach.role);
                    return (
                      <tr key={coach.id} className="hover:bg-blue-50">
                        <td className="px-6 py-4 whitespace-nowrap font-semibold text-gray-900">{coach.name}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                          {roleLabels[coach.role] || coach.role}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-sm font-medium">
                            {coach.rating}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                          {coach.specialty || '-'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{coach.experience} years</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          {hasRole ? (
                            <span className="text-gray-400">Role filled</span>
                          ) : (
                            <button
                              onClick={() => handleHire(coach)}
                              className="text-blue-600 hover:text-blue-800"
                            >
                              Hire
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Re-sign Modal */}
      {showResignModal && selectedCoach && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold text-gray-900">Re-sign {selectedCoach.name}</h2>
                <button onClick={() => setShowResignModal(false)} className="text-gray-400 hover:text-gray-600">
                  <X className="w-6 h-6" />
                </button>
              </div>
            </div>
            <div className="p-6">
              {error && (
                <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">{error}</div>
              )}
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Contract Years</label>
                  <div className="grid grid-cols-4 gap-2">
                    {[0, 1, 2, 3].map((index) => (
                      <div key={index}>
                        <label className="block text-xs text-gray-600 mb-1">Year {index + 1}</label>
                        <input
                          type="number"
                          value={contractYears[index] || 0}
                          onChange={(e) => {
                            const newYears = [...contractYears];
                            newYears[index] = parseInt(e.target.value) || 0;
                            setContractYears(newYears);
                          }}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                          min="0"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            <div className="p-6 border-t border-gray-200 flex justify-end gap-4">
              <button
                onClick={() => setShowResignModal(false)}
                className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={submitResign}
                disabled={processing || contractYears[0] === 0}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {processing ? 'Processing...' : 'Re-sign Coach'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Hire Modal */}
      {showHireModal && selectedCoach && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold text-gray-900">Hire {selectedCoach.name}</h2>
                <button onClick={() => setShowHireModal(false)} className="text-gray-400 hover:text-gray-600">
                  <X className="w-6 h-6" />
                </button>
              </div>
            </div>
            <div className="p-6">
              {error && (
                <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">{error}</div>
              )}
              <div className="space-y-4">
                <div>
                  <p className="text-sm text-gray-600 mb-2">
                    Role: <strong>{roleLabels[selectedCoach.role] || selectedCoach.role}</strong>
                  </p>
                  <p className="text-sm text-gray-600 mb-4">
                    Rating: <strong>{selectedCoach.rating}</strong>
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Contract Years</label>
                  <div className="grid grid-cols-4 gap-2">
                    {[0, 1, 2, 3].map((index) => (
                      <div key={index}>
                        <label className="block text-xs text-gray-600 mb-1">Year {index + 1}</label>
                        <input
                          type="number"
                          value={contractYears[index] || 0}
                          onChange={(e) => {
                            const newYears = [...contractYears];
                            newYears[index] = parseInt(e.target.value) || 0;
                            setContractYears(newYears);
                          }}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                          min="0"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            <div className="p-6 border-t border-gray-200 flex justify-end gap-4">
              <button
                onClick={() => setShowHireModal(false)}
                className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={submitHire}
                disabled={processing || contractYears[0] === 0}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {processing ? 'Processing...' : 'Hire Coach'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
