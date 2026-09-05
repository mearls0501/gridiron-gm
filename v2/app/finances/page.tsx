"use client";

import { useMemo, useState } from "react";
import { useGame } from "@/lib/store/game";
import {
  capHit,
  capSavingsFromCut,
  deadMoney,
  formatMoney,
  teamCap,
  teamRoster,
} from "@/lib/core/select";
import {
  applyOfficeExtension,
  applyRestructure,
  isOfficeExtensionEligible,
  officeExtensionTerms,
  restructurePreview,
} from "@/lib/core/offseason/contracts";
import { POSITION_GROUP, POSITIONS, Player } from "@/lib/core/types";
import {
  Bar,
  Button,
  Card,
  Cell,
  cx,
  Empty,
  OvrBadge,
  PlayerLink,
  PosBadge,
  Row,
  Stat,
  Table,
} from "@/components/ui";

/**
 * Contract office.
 *
 * Cap hit = base salary + prorated signing bonus; cutting accelerates the
 * remaining proration into dead money. Extend replaces an own-roster deal.
 * Restructure converts this year's base into bonus and spreads it — the
 * button the Hub already told the GM to press.
 */

const GROUP_ORDER: string[] = Array.from(new Set(POSITIONS.map((p) => POSITION_GROUP[p])));

function baseSalary(p: Player): number {
  return p.contract?.baseSalary[0] ?? 0;
}

function proration(p: Player): number {
  const c = p.contract;
  if (!c || c.bonusProrationYears <= 0) return 0;
  return Math.round(c.signingBonus / c.bonusProrationYears);
}

export default function FinancesPage() {
  const state = useGame((s) => s.state);
  const rev = useGame((s) => s.rev);
  const apply = useGame((s) => s.apply);

  const [showAll, setShowAll] = useState(false);

  const contracts = useMemo<Player[]>(() => {
    if (!state) return [];
    return teamRoster(state, state.userTeamId)
      .filter((p) => p.contract !== null)
      .sort((a, b) => capHit(b.contract) - capHit(a.contract) || a.id - b.id);
    // rev changes on every mutation; the state object itself is mutated in place.
  }, [state, rev]);

  const byGroup = useMemo(() => {
    const totals = new Map<string, { total: number; count: number }>();
    for (const g of GROUP_ORDER) totals.set(g, { total: 0, count: 0 });
    for (const p of contracts) {
      const g = POSITION_GROUP[p.pos];
      const entry = totals.get(g);
      if (entry) {
        entry.total += capHit(p.contract);
        entry.count += 1;
      }
    }
    return GROUP_ORDER.map((g) => ({ group: g, ...(totals.get(g) ?? { total: 0, count: 0 }) }))
      .sort((a, b) => b.total - a.total);
  }, [contracts]);

  if (!state) return null;

  const teamId = state.userTeamId;
  const team = state.teams[teamId];
  const cap = teamCap(state, teamId);
  const maxGroup = byGroup.reduce((m, g) => Math.max(m, g.total), 0);
  const rows = showAll ? contracts : contracts.slice(0, 25);
  const top5 = contracts.slice(0, 5).reduce((sum, p) => sum + capHit(p.contract), 0);
  const restructureTargets = contracts.filter((p) => restructurePreview(state, teamId, p).ok);

  function extend(p: Player) {
    apply((s) => {
      const terms = officeExtensionTerms(s, s.userTeamId, p);
      const r = applyOfficeExtension(s, s.userTeamId, p.id);
      if (!r.ok) return r.reason ?? "That extension was turned down.";
      return `Extended ${p.firstName} ${p.lastName} — ${terms.years}yr / ${formatMoney(terms.apy)} per year`;
    });
  }

  function restructure(p: Player) {
    apply((s) => {
      const preview = restructurePreview(s, s.userTeamId, p);
      const r = applyRestructure(s, s.userTeamId, p.id);
      if (!r.ok) return r.reason ?? "That deal could not be restructured.";
      return `Restructured ${p.firstName} ${p.lastName} — saved ${formatMoney(preview.savings)} this season`;
    });
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Salary Cap" value={formatMoney(cap.cap)} sub={`${state.season} season`} />
        <Stat
          label="Committed"
          value={formatMoney(cap.committed)}
          sub={`${Math.round((cap.committed / cap.cap) * 100)}% of the cap`}
        />
        <Stat
          label="Dead Money"
          value={formatMoney(cap.dead)}
          sub={cap.dead > 0 ? "Paid to players no longer here" : "None this season"}
          tone={cap.dead > 0 ? "warn" : undefined}
        />
        <Stat
          label="Cap Space"
          value={formatMoney(cap.space)}
          sub={cap.space < 0 ? "Over the cap" : `${cap.players} players under contract`}
          tone={cap.space < 0 ? "bad" : "good"}
        />
      </div>

      {cap.space < 0 && (
        <Card
          title={`Over the cap by ${formatMoney(-cap.space)}`}
          subtitle={
            restructureTargets.length > 0
              ? `${restructureTargets.length} deal${restructureTargets.length === 1 ? "" : "s"} can be restructured on this desk — convert this year's base into bonus.`
              : "No multi-year deal has convertible base. Release someone on the roster."
          }
        >
          {restructureTargets.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {restructureTargets.slice(0, 8).map((p) => {
                const preview = restructurePreview(state, teamId, p);
                return (
                  <Button key={p.id} size="sm" onClick={() => restructure(p)}>
                    {p.lastName} · save {formatMoney(preview.savings)}
                  </Button>
                );
              })}
            </div>
          )}
        </Card>
      )}

      <Card
        title="Cap allocation by position group"
        subtitle={
          contracts.length > 0
            ? `Top five contracts account for ${formatMoney(top5)} — ${Math.round((top5 / cap.cap) * 100)}% of the cap`
            : undefined
        }
      >
        {contracts.length === 0 ? (
          <Empty
            title="No contracts to allocate"
            hint="Sign players in free agency or auto-fill the roster and their cap charges will break down here."
          />
        ) : (
          <div className="space-y-3">
            {byGroup.map((g) => (
              <div key={g.group} className="flex items-center gap-3">
                <div className="w-10 shrink-0 text-xs font-semibold text-[var(--color-muted)]">
                  {g.group}
                </div>
                <div className="flex-1 min-w-0">
                  <Bar value={g.total} max={maxGroup || 1} />
                </div>
                <div className="w-20 shrink-0 text-right text-xs tnum">{formatMoney(g.total)}</div>
                <div className="w-24 shrink-0 text-right text-xs tnum text-[var(--color-faint)]">
                  {cap.cap > 0 ? `${((g.total / cap.cap) * 100).toFixed(1)}%` : "0.0%"} · {g.count}
                </div>
              </div>
            ))}
            <div className="flex items-center gap-3 pt-2 border-t border-[var(--color-line-soft)]">
              <div className="w-10 shrink-0 text-xs font-semibold">Dead</div>
              <div className="flex-1 min-w-0">
                <Bar value={cap.dead} max={maxGroup || 1} tone="bad" />
              </div>
              <div className="w-20 shrink-0 text-right text-xs tnum">{formatMoney(cap.dead)}</div>
              <div className="w-24 shrink-0 text-right text-xs tnum text-[var(--color-faint)]">
                {cap.cap > 0 ? `${((cap.dead / cap.cap) * 100).toFixed(1)}%` : "0.0%"} · —
              </div>
            </div>
          </div>
        )}
      </Card>

      <Card
        title={`${team.city} ${team.name} contracts`}
        subtitle={`${contracts.length} contract${contracts.length === 1 ? "" : "s"}, sorted by cap hit`}
        actions={
          contracts.length > 25 ? (
            <Button size="sm" onClick={() => setShowAll((v) => !v)}>
              {showAll ? "Show top 25" : `Show all ${contracts.length}`}
            </Button>
          ) : undefined
        }
        padded={false}
      >
        {contracts.length === 0 ? (
          <Empty
            title="No players under contract"
            hint="Every cap figure on this page is zero until the roster has signed players."
          />
        ) : (
          <Table head={["Player", "Pos", "Age", "OVR", "Cap Hit", "Base", "Bonus", "Yrs", "Dead if Cut", "Save if Cut", ""]}>
            {rows.map((p) => {
              const dead = deadMoney(p.contract);
              const savings = capSavingsFromCut(p.contract);
              const canExtend = isOfficeExtensionEligible(state, p);
              const ext = canExtend ? officeExtensionTerms(state, teamId, p) : null;
              const rest = restructurePreview(state, teamId, p);
              return (
                <Row key={p.id}>
                  <Cell align="left">
                    <PlayerLink p={p} className="font-medium" />
                  </Cell>
                  <Cell>
                    <PosBadge pos={p.pos} />
                  </Cell>
                  <Cell>{p.age}</Cell>
                  <Cell>
                    <OvrBadge ovr={p.ovr} size="sm" />
                  </Cell>
                  <Cell className="font-medium">{formatMoney(capHit(p.contract))}</Cell>
                  <Cell className="text-[var(--color-muted)]">{formatMoney(baseSalary(p))}</Cell>
                  <Cell className="text-[var(--color-muted)]">{formatMoney(proration(p))}</Cell>
                  <Cell>{p.contract?.yearsRemaining ?? 0}</Cell>
                  <Cell className={cx(dead > 0 && "text-[var(--color-bad)]")}>{formatMoney(dead)}</Cell>
                  <Cell className={cx(savings > 0 ? "text-[var(--color-good)]" : savings < 0 && "text-[var(--color-bad)]")}>
                    {formatMoney(savings)}
                  </Cell>
                  <Cell>
                    <div className="flex gap-1 justify-end">
                      <Button
                        size="sm"
                        disabled={!canExtend}
                        title={
                          ext
                            ? `${ext.years}yr / ${formatMoney(ext.apy)} per year`
                            : "A tagged tender is extended on the Hub."
                        }
                        onClick={() => extend(p)}
                      >
                        Extend
                      </Button>
                      <Button
                        size="sm"
                        disabled={!rest.ok}
                        title={rest.ok ? `Save ${formatMoney(rest.savings)} this year` : rest.reason}
                        onClick={() => restructure(p)}
                      >
                        Restructure
                      </Button>
                    </div>
                  </Cell>
                </Row>
              );
            })}
          </Table>
        )}
      </Card>

      {contracts.length > 0 && !showAll && contracts.length > rows.length && (
        <p className="text-xs text-[var(--color-faint)] text-center">
          Showing the {rows.length} largest cap hits of {contracts.length}.{" "}
          <button className="underline cursor-pointer hover:text-[var(--color-text)]" onClick={() => setShowAll(true)}>
            Show all
          </button>
        </p>
      )}
    </div>
  );
}
