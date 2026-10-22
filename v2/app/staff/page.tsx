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
import { ensureOwners, isPendingForcedMove, ownerJobView, patienceScaleLabel } from "@/lib/core/owner";
import { ownerCardPace, ownerCardVerdict, ownerMarginSub } from "@/lib/view/ownerPace";
import { schemeById } from "@/lib/core/staff";
import { coachTermLabel, staffCardFields } from "@/lib/view/staffDesk";
import {
  leanWord,
  lensWord,
  roleWord,
  scoutRecordText,
  scoutRecords,
  userScouts,
} from "@/lib/core/scoutStaff";
import { formatMoney } from "@/lib/core/select";
import {
  Button, Card, Cell, Empty, Pill, Row, Stat, Table, TeamMark,
} from "@/components/ui";

/**
 * The people desk: HC / OC / DC / STC and the owner.
 *
 * Staff budget / schemes still live on /front-office. This page is the
 * named coaches and the owner whose patience makes `firingEnabled` real.
 */

const ROLE_TITLE: Record<CoachRole, string> = {
  hc: "Head Coach",
  oc: "Offensive Coordinator",
  dc: "Defensive Coordinator",
  stc: "Special Teams Coordinator",
};

function schemeName(id: string | undefined): string {
  return schemeById(id)?.name ?? "—";
}

function CoachCard({
  person,
  role,
  season,
  canEdit,
  onFire,
  onHire,
}: {
  person: CoachPerson | undefined;
  role: CoachRole;
  season: number;
  canEdit: boolean;
  onFire: () => void;
  onHire: () => void;
}) {
  const fields = staffCardFields(role);
  const term = person ? coachTermLabel(person, season) : null;
  const dials = person
    ? ([
        ["Off", person.offense],
        ["Def", person.defense],
        ["Dev", person.development],
        ["Agg", person.aggression],
        ["Pass", person.passBias >= 0 ? `+${person.passBias.toFixed(2)}` : person.passBias.toFixed(2)],
        ["Shad", person.shadowTendency.toFixed(2)],
      ] as const).filter(([k]) => fields.dials.includes(k))
    : [];
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
      {!person || !term ? (
        <Empty title="This chair is empty" hint="Hire from the market." />
      ) : (
        <div className="space-y-3">
          <div className={fields.scheme ? "grid gap-2 sm:grid-cols-3" : "grid gap-2 sm:grid-cols-2"}>
            <Stat label="Contract" value={term.value} sub={term.sub} />
            <Stat label="Salary" value={formatMoney(person.salary)} sub="cash / year · not cap" />
            {fields.scheme && <Stat label="Scheme" value={schemeName(person.scheme)} />}
          </div>
          <div className={fields.dials.length > 4 ? "grid grid-cols-3 gap-2 text-center sm:grid-cols-6" : "grid grid-cols-2 gap-2 text-center sm:grid-cols-4"}>
            {dials.map(([k, v]) => (
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
  const pace = state && job ? ownerCardPace(state, teamId, job) : null;
  const verdict = state && job ? ownerCardVerdict(state, teamId, job) : null;

  const market = useMemo(() => {
    if (!state || !hiring) return [];
    const pool = state.coachMarket ?? [];
    if (hiring === "hc") return pool;
    return pool.filter((c) => c.role === hiring);
  }, [state, rev, hiring]);

  if (!state || !team) return null;
  void rev;

  const cardSeat = verdict?.seat ?? job?.seat;
  const seatTone =
    cardSeat === "fired" ? "bad" : cardSeat === "hot" ? "warn" : cardSeat === "early" || cardSeat === "watched" ? "accent" : "good";
  const seatStatTone =
    !job?.firingEnabled ? "good" as const
    : cardSeat === "safe" ? "good" as const
    : cardSeat === "fired" ? "bad" as const
    : cardSeat === "early" ? undefined
    : "warn" as const;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Staff</h1>
          <p className="text-xs text-[var(--color-muted)] mt-0.5">
            Head coach, coordinators, and the owner. An empty coordinator chair costs the club. Budget still lives on Front Office.
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
            value={job ? (job.firingEnabled ? cardSeat : "guaranteed") : "—"}
            tone={seatStatTone}
          />
        </div>
      </div>

      {job && pace && (
        <Card
          title={`Owner · ${job.owner.name}`}
          subtitle={`${job.posture} club · expects about ${job.expectedWins} wins`}
          actions={<Pill tone={seatTone}>{job.firingEnabled ? cardSeat : "firing off"}</Pill>}
        >
          <div className="grid gap-2 sm:grid-cols-4 mb-3">
            <Stat label="Patience" value={job.owner.patience.toFixed(2)} sub={patienceScaleLabel()} />
            <Stat
              label="Weighted wins"
              value={pace.weightedWins.toFixed(1)}
              sub={ownerMarginSub(job, pace)}
            />
            <Stat
              label="Last season"
              value={job.recentWins == null ? "—" : job.recentWins.toFixed(job.recentWins % 1 ? 1 : 0)}
              sub={`${job.seasonsWithGm} season${job.seasonsWithGm === 1 ? "" : "s"} in the chair`}
            />
            <Stat
              label="Would fire"
              value={verdict?.wouldFire ?? "—"}
              sub={verdict?.wouldFire === "early" ? "after five games" : undefined}
              tone={verdict?.wouldFire === "yes" ? "bad" : verdict?.wouldFire === "no" ? "good" : undefined}
            />
          </div>
          <p className="text-sm text-[var(--color-muted)]">{verdict?.line}</p>
          {isPendingForcedMove(state) && (
            <p className="text-sm text-[var(--color-bad)] mt-2">
              Forced move is on the desk — <a className="underline" href="/forced-move">take an open chair or retire</a>.
            </p>
          )}
        </Card>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {COACH_ROLES.map((role) => (
          <CoachCard
            key={role}
            role={role}
            season={state.season}
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

      {mine && (
        <Card
          title="College scouting"
          subtitle="Five people. Lenses and leans, not grades. Accuracy is the scouting share of the staff budget."
        >
          <div className="space-y-3">
            {(() => {
              const records = scoutRecords(state);
              return userScouts(state).map((scout) => {
              const record = records.find((r) => r.scoutId === scout.id);
              return (
                <div key={scout.id} className="border-b border-[var(--color-line-soft)] pb-3 last:border-0 last:pb-0">
                  <div className="text-sm font-medium">{scout.name}</div>
                  <div className="text-xs text-[var(--color-muted)] mt-0.5">
                    {roleWord(scout)} · {leanWord(scout.lean)} · {lensWord(scout)}
                  </div>
                  <div className="text-xs text-[var(--color-faint)] mt-1">
                    {record ? scoutRecordText(record) : "No draft picks on file."}
                  </div>
                </div>
              );
            });
            })()}
          </div>
        </Card>
      )}

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
