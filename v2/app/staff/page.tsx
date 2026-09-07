"use client";

import { useEffect, useMemo, useState } from "react";
import { useGame } from "@/lib/store/game";
import {
  CoachPerson,
  CoachRole,
  Team,
} from "@/lib/core/types";
import {
  COACH_ROLES,
  ensureCoachMarket,
  ensureCoaches,
  fireCoach,
  hireCoach,
  roleLabel,
  staffSlot,
} from "@/lib/core/coaches";
import { ensureOwners, ownerJobView } from "@/lib/core/owner";
import { schemeById } from "@/lib/core/staff";
import { formatMoney } from "@/lib/core/select";
import {
  Button, Card, Cell, Empty, Pill, Row, Stat, Table, TeamMark,
} from "@/components/ui";

/**
 * The people desk: HC / OC / DC and the owner.
 *
 * Staff budget / schemes still live on /front-office. This page is the
 * named coaches and the owner whose patience makes `firingEnabled` real.
 */

const ROLE_TITLE: Record<CoachRole, string> = {
  hc: "Head Coach",
  oc: "Offensive Coordinator",
  dc: "Defensive Coordinator",
};

function schemeName(id: string | undefined): string {
  return schemeById(id)?.name ?? "—";
}

function CoachCard({
  person,
  role,
  canEdit,
  onFire,
  onHire,
}: {
  person: CoachPerson | undefined;
  role: CoachRole;
  canEdit: boolean;
  onFire: () => void;
  onHire: () => void;
}) {
  return (
    <Card
      title={ROLE_TITLE[role]}
      subtitle={person ? person.name : "Vacant"}
      actions={
        canEdit ? (
          person ? (
            <Button size="sm" variant="danger" onClick={onFire}>Fire</Button>
          ) : (
            <Button size="sm" variant="primary" onClick={onHire}>Hire</Button>
          )
        ) : undefined
      }
    >
      {!person ? (
        <Empty title="This chair is empty" hint="Hire from the market, or wait for the offseason carousel to run." />
      ) : (
        <div className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-3">
            <Stat label="Contract" value={`${person.yearsRemaining} yr left`} sub={`${person.years} year deal`} />
            <Stat label="Salary" value={formatMoney(person.salary)} sub="cash / year · not cap" />
            <Stat label="Scheme" value={schemeName(person.scheme)} />
          </div>
          <div className="grid grid-cols-3 gap-2 text-center sm:grid-cols-6">
            {([
              ["Off", person.offense],
              ["Def", person.defense],
              ["Dev", person.development],
              ["Agg", person.aggression],
              ["Pass", person.passBias >= 0 ? `+${person.passBias.toFixed(2)}` : person.passBias.toFixed(2)],
              ["Shad", person.shadowTendency.toFixed(2)],
            ] as const).map(([k, v]) => (
              <div key={k} className="rounded-lg border border-[var(--color-line-soft)] bg-[var(--color-surface-2)] px-2 py-2">
                <div className="text-[10px] uppercase tracking-wider text-[var(--color-faint)]">{k}</div>
                <div className="tnum text-sm font-semibold mt-0.5">{v}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

export default function StaffPage() {
  const state = useGame((s) => s.state);
  const rev = useGame((s) => s.rev);
  const apply = useGame((s) => s.apply);
  const [viewId, setViewId] = useState<number | null>(null);
  const [hiring, setHiring] = useState<CoachRole | null>(null);

  useEffect(() => {
    if (!state) return;
    if (state.teams[state.userTeamId]?.coaches && state.teams[state.userTeamId]?.owner) return;
    apply((s) => { ensureCoaches(s); ensureOwners(s); });
  }, [state, apply]);

  const teamId = viewId ?? state?.userTeamId ?? 0;
  const team: Team | undefined = state?.teams[teamId];
  const mine = teamId === state?.userTeamId;
  const job = state ? ownerJobView(state, teamId) : null;

  const market = useMemo(() => {
    if (!state || !hiring) return [];
    const pool = state.coachMarket ?? [];
    if (hiring === "hc") return pool;
    return pool.filter((c) => c.role === hiring);
  }, [state, rev, hiring]);

  if (!state || !team) return null;
  void rev;

  const seatTone =
    job?.seat === "fired" ? "bad" : job?.seat === "hot" ? "warn" : job?.seat === "watched" ? "accent" : "good";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Staff</h1>
          <p className="text-xs text-[var(--color-muted)] mt-0.5">
            Head coach, coordinators, and the owner. Budget still lives on Front Office.
          </p>
        </div>
        <label className="text-xs text-[var(--color-muted)] flex items-center gap-2">
          Club
          <select
            className="bg-[var(--color-surface-2)] border border-[var(--color-line)] rounded-lg px-2 py-1 text-sm text-[var(--color-text)]"
            value={teamId}
            onChange={(e) => { setViewId(Number(e.target.value)); setHiring(null); }}
          >
            {state.teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.city} {t.name}{t.id === state.userTeamId ? " · you" : ""}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex items-center gap-3">
        <TeamMark team={team} size={40} />
        <div className="grid flex-1 gap-2 sm:grid-cols-3">
          <Stat label="Head coach" value={staffSlot(team, "hc")?.name ?? "Vacant"} />
          <Stat label="Owner" value={team.owner?.name ?? "—"} />
          <Stat
            label="Job security"
            value={job ? (job.firingEnabled ? job.seat : "guaranteed") : "—"}
            tone={job?.firingEnabled ? (job.seat === "safe" ? "good" : job.seat === "fired" ? "bad" : "warn") : "good"}
          />
        </div>
      </div>

      {job && (
        <Card
          title={`Owner · ${job.owner.name}`}
          subtitle={`${job.posture} club · expects about ${job.expectedWins} wins`}
          actions={<Pill tone={seatTone}>{job.firingEnabled ? job.seat : "firing off"}</Pill>}
        >
          <div className="grid gap-2 sm:grid-cols-4 mb-3">
            <Stat label="Patience" value={job.owner.patience.toFixed(2)} sub="0 impatient · 1 patient" />
            <Stat label="Heat" value={Math.round(job.heat)} sub={`fire at ${Math.round(job.threshold)}`} />
            <Stat
              label="Last season"
              value={job.recentWins == null ? "—" : job.recentWins.toFixed(job.recentWins % 1 ? 1 : 0)}
              sub={`${job.seasonsWithGm} season${job.seasonsWithGm === 1 ? "" : "s"} in the chair`}
            />
            <Stat
              label="Would fire"
              value={job.wouldFire ? "yes" : "no"}
              tone={job.wouldFire ? "bad" : "good"}
            />
          </div>
          <p className="text-sm text-[var(--color-muted)]">{job.line}</p>
        </Card>
      )}

      <div className="grid gap-3 lg:grid-cols-3">
        {COACH_ROLES.map((role) => (
          <CoachCard
            key={role}
            role={role}
            person={staffSlot(team, role)}
            canEdit={mine}
            onFire={() => apply((s) => {
              const r = fireCoach(s, teamId, role);
              return r.ok ? `Fired the ${roleLabel(role)}` : r.reason;
            })}
            onHire={() => {
              apply((s) => { ensureCoachMarket(s); });
              setHiring(role);
            }}
          />
        ))}
      </div>

      {hiring && mine && (
        <Card
          title={`Hire a ${ROLE_TITLE[hiring]}`}
          subtitle="Unemployed coaches. Their dials replace the vacant chair in the call sheet."
          actions={<Button size="sm" variant="ghost" onClick={() => setHiring(null)}>Close</Button>}
        >
          {market.length === 0 ? (
            <Empty title="The market is empty" hint="Fire someone or wait for the carousel." />
          ) : (
            <Table
              head={["Coach", "Was", "Scheme", "Off", "Def", "Deal", ""]}
            >
              {market.map((c) => (
                <Row key={c.id}>
                  <Cell align="left">{c.name}</Cell>
                  <Cell>{ROLE_TITLE[c.role]}</Cell>
                  <Cell>{schemeName(c.scheme)}</Cell>
                  <Cell>{c.offense}</Cell>
                  <Cell>{c.defense}</Cell>
                  <Cell>{formatMoney(c.salary)}</Cell>
                  <Cell>
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={() => apply((s) => {
                        const r = hireCoach(s, teamId, c.id, hiring);
                        if (r.ok) setHiring(null);
                        return r.ok ? `Hired ${c.name}` : r.reason;
                      })}
                    >
                      Hire
                    </Button>
                  </Cell>
                </Row>
              ))}
            </Table>
          )}
        </Card>
      )}
    </div>
  );
}
