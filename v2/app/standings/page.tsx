"use client";

import { Fragment, Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useGame } from "@/lib/store/game";
import { Conference, TeamRecord } from "@/lib/core/types";
import { recordString, winPct } from "@/lib/core/select";
import {
  divisionStandings, conferenceStandings, leagueStandings, computeSeeds,
} from "@/lib/core/season/standings";
import { DIVISIONS } from "@/lib/core/names";
import { Card, Cell, Pill, Row, Table, Tabs, TeamMark, cx } from "@/components/ui";

/**
 * Standings by division, conference (with the seven-seed playoff cut) and the
 * whole league. Everything is derived from game results on every render, so it
 * cannot drift from the schedule.
 */

type Tab = "division" | "conference" | "league";

function L(label: string) {
  return <span className="block text-left">{label}</span>;
}

function pct(r: TeamRecord): string {
  return winPct(r).toFixed(3).replace(/^0/, "");
}

function diff(r: TeamRecord): string {
  const d = r.pf - r.pa;
  return d > 0 ? `+${d}` : `${d}`;
}

function subRecord(w: number, l: number, t: number): string {
  return t > 0 ? `${w}-${l}-${t}` : `${w}-${l}`;
}

export default function StandingsPage() {
  return (
    <Suspense fallback={null}>
      <StandingsBody />
    </Suspense>
  );
}

function StandingsBody() {
  const state = useGame((s) => s.state);
  const rev = useGame((s) => s.rev);
  const [tab, setTab] = useState<Tab>("division");
  const router = useRouter();
  const params = useSearchParams();

  if (!state) return null;
  void rev; // re-render on every mutation; GameState is mutated in place

  const pastSeasons = state.history
    .map((h) => h.season)
    .filter((s) => s !== state.season)
    .sort((a, b) => b - a);
  const requested = Number(params.get("season"));
  const viewingSeason =
    pastSeasons.includes(requested) ? requested : state.season;
  const archived = viewingSeason !== state.season;

  const userId = state.userTeamId;
  const seeds = new Map(computeSeeds(state, viewingSeason).map((s) => [s.teamId, s.seed]));

  const fullHead = [
    L("Team"), "W", "L", "T", "PCT", "PF", "PA", "DIFF", "DIV", "CONF",
  ];

  function teamCell(teamId: number, prefix?: string) {
    const t = state!.teams[teamId];
    return (
      <span className="flex items-center gap-2">
        {prefix !== undefined && (
          <span className="w-4 shrink-0 text-[var(--color-faint)] text-xs tnum">{prefix}</span>
        )}
        <TeamMark team={t} size={20} />
        <span className="truncate">
          {t.city} {t.name}
        </span>
        {teamId === userId && <Pill tone="accent">You</Pill>}
      </span>
    );
  }

  function fullRow(r: TeamRecord, prefix?: string) {
    return (
      <Row key={r.teamId} highlight={r.teamId === userId}>
        <Cell align="left">{teamCell(r.teamId, prefix)}</Cell>
        <Cell>{r.w}</Cell>
        <Cell>{r.l}</Cell>
        <Cell>{r.t}</Cell>
        <Cell>{pct(r)}</Cell>
        <Cell>{r.pf}</Cell>
        <Cell>{r.pa}</Cell>
        <Cell className={r.pf - r.pa > 0 ? "text-[var(--color-good)]" : r.pf - r.pa < 0 ? "text-[var(--color-bad)]" : ""}>
          {diff(r)}
        </Cell>
        <Cell>{subRecord(r.divW, r.divL, r.divT)}</Cell>
        <Cell>{subRecord(r.confW, r.confL, r.confT)}</Cell>
      </Row>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Standings</h1>
          <p className="text-xs text-[var(--color-muted)] mt-0.5">
            {archived
              ? `${viewingSeason} · final`
              : `${state.season} · through week ${state.week}`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {pastSeasons.length > 0 && (
            <select
              value={viewingSeason}
              onChange={(e) => {
                const next = Number(e.target.value);
                router.replace(next === state.season ? "/standings" : `/standings?season=${next}`);
              }}
              className="bg-[var(--color-surface-2)] border border-[var(--color-line)] rounded-lg px-2 py-1.5 text-xs outline-none focus:border-[var(--color-accent)] cursor-pointer"
              title="Season"
              aria-label="Season"
            >
              <option value={state.season}>{state.season}</option>
              {pastSeasons.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          )}
          <Tabs<Tab>
            value={tab}
            onChange={setTab}
            options={[
              { value: "division", label: "Division" },
              { value: "conference", label: "Conference" },
              { value: "league", label: "League" },
            ]}
          />
        </div>
      </div>

      {tab === "division" && (
        <div className="grid gap-4 lg:grid-cols-2">
          {DIVISIONS.map((d) => (
            <Card key={d} title={d} padded={false}>
              <Table head={fullHead}>
                {divisionStandings(state, d, viewingSeason).map((r) => fullRow(r))}
              </Table>
            </Card>
          ))}
        </div>
      )}

      {tab === "conference" && (
        <div className="grid gap-4 xl:grid-cols-2">
          {(["AFC", "NFC"] as Conference[]).map((conf) => {
            const rows = conferenceStandings(state, conf, viewingSeason);
            return (
              <Card key={conf} title={conf} subtitle="Top seven seeds make the playoffs" padded={false}>
                <Table head={[L("Team"), "Rec", "PCT", "PF", "PA", "DIFF", "CONF"]}>
                  {rows.map((r, i) => {
                    const node = (
                      <Row key={r.teamId} highlight={r.teamId === userId}>
                        <Cell align="left">{teamCell(r.teamId, String(i + 1))}</Cell>
                        <Cell>{recordString(r)}</Cell>
                        <Cell>{pct(r)}</Cell>
                        <Cell>{r.pf}</Cell>
                        <Cell>{r.pa}</Cell>
                        <Cell
                          className={
                            r.pf - r.pa > 0
                              ? "text-[var(--color-good)]"
                              : r.pf - r.pa < 0
                                ? "text-[var(--color-bad)]"
                                : ""
                          }
                        >
                          {diff(r)}
                        </Cell>
                        <Cell>{subRecord(r.confW, r.confL, r.confT)}</Cell>
                      </Row>
                    );
                    if (i !== 6) return node;
                    return (
                      <Fragment key={`seg-${r.teamId}`}>
                        {node}
                        <tr className="bg-[var(--color-surface-2)]">
                          <td
                            colSpan={7}
                            className="py-1 px-2.5 text-[10px] uppercase tracking-wider text-[var(--color-faint)] border-y border-dashed border-[var(--color-accent)]/50"
                          >
                            Playoff cut line
                          </td>
                        </tr>
                      </Fragment>
                    );
                  })}
                </Table>
              </Card>
            );
          })}
        </div>
      )}

      {tab === "league" && (
        <Card title="League" subtitle="All 32 teams by record" padded={false}>
          <Table head={[L("Team"), "Seed", "W", "L", "T", "PCT", "PF", "PA", "DIFF", "DIV", "CONF"]}>
            {leagueStandings(state, viewingSeason).map((r, i) => {
              const seed = seeds.get(r.teamId);
              return (
                <Row key={r.teamId} highlight={r.teamId === userId}>
                  <Cell align="left">{teamCell(r.teamId, String(i + 1))}</Cell>
                  <Cell>
                    {seed !== undefined ? (
                      <Pill tone="good">{seed}</Pill>
                    ) : (
                      <span className="text-[var(--color-faint)]">—</span>
                    )}
                  </Cell>
                  <Cell>{r.w}</Cell>
                  <Cell>{r.l}</Cell>
                  <Cell>{r.t}</Cell>
                  <Cell>{pct(r)}</Cell>
                  <Cell>{r.pf}</Cell>
                  <Cell>{r.pa}</Cell>
                  <Cell
                    className={cx(
                      r.pf - r.pa > 0 && "text-[var(--color-good)]",
                      r.pf - r.pa < 0 && "text-[var(--color-bad)]"
                    )}
                  >
                    {diff(r)}
                  </Cell>
                  <Cell>{subRecord(r.divW, r.divL, r.divT)}</Cell>
                  <Cell>{subRecord(r.confW, r.confL, r.confT)}</Cell>
                </Row>
              );
            })}
          </Table>
        </Card>
      )}
    </div>
  );
}
