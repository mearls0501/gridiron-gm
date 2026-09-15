"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useGame } from "@/lib/store/game";
import {
  HofReason,
  presentFranchiseHistory,
  presentLeagueHall,
  reasonLine,
} from "@/lib/core/hallOfFame";
import { retireUserNumber, userRetireCandidates } from "@/lib/core/jersey";
import {
  Button, Card, Cell, Empty, Pill, PlayerLink, PosBadge, Row, Stat, Table, TeamMark,
} from "@/components/ui";

/**
 * Franchise archive, league Hall of Fame, and the retired-numbers wall.
 *
 * Induction writes happen in recap. Retiring a number is the one user
 * write on this page — one per season.
 */

function L(label: string) {
  return <span className="block text-left">{label}</span>;
}

function reasonTone(r: HofReason): "good" | "accent" | "warn" | "default" {
  if (r.kind === "champion") return "good";
  if (r.kind === "award") return "accent";
  if (r.kind === "leader") return "warn";
  return "default";
}

export default function HistoryPage() {
  const state = useGame((s) => s.state);
  const rev = useGame((s) => s.rev);
  const apply = useGame((s) => s.apply);
  const [retireId, setRetireId] = useState<string>("");

  const team = state?.teams[state.userTeamId];
  const retired = useMemo(
    () => (team?.retiredNumbers ?? []).slice().sort((a, b) => a.number - b.number),
    [team?.retiredNumbers, rev],
  );
  const candidates = useMemo(
    () => (state ? userRetireCandidates(state) : []),
    [state, rev],
  );

  if (!state || !team) return null;
  void rev;

  const view = presentFranchiseHistory(state);
  const league = presentLeagueHall(state);
  const retireUsed = state.jerseyRetireSeason === state.season;

  const span =
    view.firstSeason != null && view.lastSeason != null
      ? view.firstSeason === view.lastSeason
        ? String(view.firstSeason)
        : `${view.firstSeason}–${view.lastSeason}`
      : "no seasons archived";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Franchise History</h1>
          <p className="text-xs text-[var(--color-muted)] mt-0.5">
            {view.city} {view.name} · {span}
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <Link href="/records" className="text-[var(--color-accent)] hover:underline">
            Record Book
          </Link>
          <Link href="/league" className="text-[var(--color-accent)] hover:underline">
            League archive
          </Link>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <TeamMark team={team} size={40} />
        <div className="grid flex-1 gap-2 sm:grid-cols-5">
          <Stat label="Seasons archived" value={view.years.length} />
          <Stat
            label="Championships"
            value={view.championships}
            tone={view.championships > 0 ? "good" : undefined}
          />
          <Stat
            label="League Hall"
            value={league.inducteeCount}
            tone={league.inducteeCount > 0 ? "good" : undefined}
          />
          <Stat label="Franchise ring" value={view.hallOfFame.length} />
          <Stat label="Retired numbers" value={retired.length} />
        </div>
      </div>

      <Card
        title="League Hall of Fame"
        subtitle="One class a year, five seasons after retirement"
        padded={false}
      >
        {league.empty ? (
          <Empty
            title="No one has been inducted yet."
            hint={league.rule}
          />
        ) : (
          <ul className="divide-y divide-[var(--color-line-soft)]">
            {league.classes.map((clas) => (
              <li key={clas.season} className="px-4 py-3">
                <div className="flex items-baseline justify-between gap-3 mb-2">
                  <h2 className="text-sm font-semibold">Class of {clas.season}</h2>
                  <span className="text-[11px] text-[var(--color-faint)] tnum">
                    {clas.inductees.length} inductee{clas.inductees.length === 1 ? "" : "s"}
                  </span>
                </div>
                <div className="flex flex-col gap-1.5">
                  {clas.inductees.map(({ entry, player }) => (
                    <div key={entry.playerId} className="flex items-center gap-2 min-w-0">
                      {player ? <PosBadge pos={player.pos} /> : null}
                      {player ? (
                        <PlayerLink p={player} className="min-w-0 text-sm" />
                      ) : (
                        <span className="text-xs text-[var(--color-faint)]">#{entry.playerId}</span>
                      )}
                      <span className="text-[11px] text-[var(--color-muted)] tnum ml-auto shrink-0">
                        {entry.firstSeason != null && entry.lastSeason != null
                          ? `${entry.firstSeason}–${entry.lastSeason}`
                          : "—"}
                        {entry.championships > 0
                          ? ` · ${entry.championships} title${entry.championships === 1 ? "" : "s"}`
                          : ""}
                      </span>
                    </div>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
        {!league.empty && (
          <p className="px-4 py-3 text-[11px] text-[var(--color-faint)] border-t border-[var(--color-line-soft)]">
            {league.rule}
          </p>
        )}
      </Card>

      <Card
        title="Seasons"
        subtitle="Records, finish, awards, and league leaders from the archive"
        padded={false}
      >
        {view.emptyHistory ? (
          <Empty
            title="No seasons in the books yet."
            hint="Finish a season to start the archive. Awards and leaders are taken from that year's history row — nothing is invented here."
            action={
              <Link href="/" className="text-xs text-[var(--color-accent)] hover:underline">
                Back to Hub
              </Link>
            }
          />
        ) : (
          <Table
            head={[
              "Season",
              L("Record"),
              L("Finish"),
              L("Title"),
              L("Awards"),
              L("Leaders"),
            ]}
          >
            {view.years.map((y) => {
              const champ = state.teams[y.championId];
              return (
                <Row key={y.season} highlight={y.champion}>
                  <Cell align="left">
                    <Link
                      href={`/standings?season=${y.season}`}
                      className="hover:text-[var(--color-accent)] transition-colors"
                    >
                      {y.season}
                    </Link>
                  </Cell>
                  <Cell align="left" className="tnum">
                    {y.record ?? "—"}
                  </Cell>
                  <Cell align="left" className="text-[var(--color-muted)]">
                    {y.finish ?? "—"}
                  </Cell>
                  <Cell align="left">
                    {y.champion ? (
                      <Pill tone="good">Champion</Pill>
                    ) : y.runnerUp ? (
                      <Pill tone="warn">Runner-up</Pill>
                    ) : champ ? (
                      <span className="flex items-center gap-2 min-w-0">
                        <TeamMark team={champ} size={16} />
                        <span className="truncate text-[var(--color-muted)]">{champ.abbr}</span>
                      </span>
                    ) : (
                      <span className="text-[var(--color-faint)]">—</span>
                    )}
                  </Cell>
                  <Cell align="left">
                    {y.awards.length === 0 ? (
                      <span className="text-[var(--color-faint)]">—</span>
                    ) : (
                      <span className="flex flex-wrap gap-x-2 gap-y-1">
                        {y.awards.map((a) => (
                          <span key={`${y.season}-${a.key}`} className="flex items-center gap-1 min-w-0">
                            <Pill tone="accent">{a.label}</Pill>
                            {a.player && <PlayerLink p={a.player} className="text-xs" />}
                          </span>
                        ))}
                      </span>
                    )}
                  </Cell>
                  <Cell align="left">
                    {y.leaders.length === 0 ? (
                      <span className="text-[var(--color-faint)]">—</span>
                    ) : (
                      <span className="flex flex-col gap-0.5">
                        {y.leaders.map((l) => (
                          <span key={`${y.season}-${l.key}`} className="text-xs text-[var(--color-muted)]">
                            {l.label}
                            {l.value ? ` ${l.value}` : ""}
                            {l.player ? " · " : ""}
                            {l.player && <PlayerLink p={l.player} className="text-xs" />}
                          </span>
                        ))}
                      </span>
                    )}
                  </Cell>
                </Row>
              );
            })}
          </Table>
        )}
      </Card>

      {!view.emptyHistory && (
        <Card title="Timeline" subtitle="The same years, in order" padded={false}>
          <ul className="divide-y divide-[var(--color-line-soft)]">
            {view.timeline.map((beat) => (
              <li key={beat.season} className="flex items-start gap-3 px-4 py-2.5">
                <span className="text-xs font-semibold tnum shrink-0 w-12">{beat.season}</span>
                <span className="text-xs text-[var(--color-muted)] min-w-0">{beat.text}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card
        title="Franchise Hall of Fame"
        subtitle="Club legends from the threshold below — the ring as computed today"
        padded={false}
      >
        {view.emptyHof ? (
          <Empty
            title="No one has qualified yet."
            hint={view.hofRule}
          />
        ) : (
          <Table
            head={[
              L("Player"),
              "Seasons",
              L("Years"),
              L("Why"),
            ]}
          >
            {view.hallOfFame.map((row) => (
              <Row key={row.player.id}>
                <Cell align="left">
                  <span className="flex items-center gap-2 min-w-0">
                    <PosBadge pos={row.player.pos} />
                    <PlayerLink p={row.player} className="min-w-0" />
                  </span>
                </Cell>
                <Cell className="tnum">{row.seasons}</Cell>
                <Cell align="left" className="text-[var(--color-muted)] tnum">
                  {row.firstSeason != null && row.lastSeason != null
                    ? `${row.firstSeason}–${row.lastSeason}`
                    : "—"}
                </Cell>
                <Cell align="left">
                  <span className="flex flex-wrap gap-1">
                    {row.reasons.map((r) => (
                      <Pill key={reasonLine(r)} tone={reasonTone(r)}>
                        {reasonLine(r)}
                      </Pill>
                    ))}
                  </span>
                </Cell>
              </Row>
            ))}
          </Table>
        )}
        {!view.emptyHof && (
          <p className="px-4 py-3 text-[11px] text-[var(--color-faint)] border-t border-[var(--color-line-soft)]">
            {view.hofRule}
          </p>
        )}
      </Card>

      <Card
        title="Retired Numbers"
        subtitle="Numbers this club will not issue again. One user retirement per season."
      >
        {retired.length === 0 ? (
          <Empty
            title="No numbers have been retired yet."
            hint="A Hall inductee with eight seasons at this club goes on the wall automatically. You may also retire one number yourself each season."
          />
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3">
            {retired.map((row) => {
              const wearer = state.players.find((p) => p.id === row.playerId);
              return (
                <div
                  key={`${row.number}-${row.playerId}`}
                  className="rounded-lg border border-[var(--color-line)] bg-[var(--color-surface-2)] px-3 py-3 text-center"
                >
                  <div className="text-2xl font-semibold tnum">{row.number}</div>
                  <div className="mt-1 text-[11px] text-[var(--color-muted)] truncate">
                    {wearer ? (
                      <PlayerLink p={wearer} className="text-[11px]" />
                    ) : (
                      `${row.firstName} ${row.lastName}`
                    )}
                  </div>
                  <div className="mt-0.5 text-[10px] uppercase tracking-wider text-[var(--color-faint)]">
                    {row.pos} · {row.season} · {row.reason === "user" ? "Club" : "Hall"}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <div className="mt-4 flex flex-wrap items-end gap-2">
          <label className="min-w-[220px] flex-1">
            <span className="block text-[10px] uppercase tracking-wider text-[var(--color-faint)] mb-1">
              Retire a number
            </span>
            <select
              value={retireId}
              onChange={(e) => setRetireId(e.target.value)}
              disabled={retireUsed || candidates.length === 0}
              className="w-full bg-[var(--color-surface-2)] border border-[var(--color-line)] rounded-lg px-3 py-1.5 text-sm outline-none focus:border-[var(--color-accent)]"
            >
              <option value="">
                {retireUsed
                  ? "Already used this season"
                  : candidates.length === 0
                    ? "No eligible numbers"
                    : "Choose a player"}
              </option>
              {candidates.map((p) => (
                <option key={p.id} value={String(p.id)}>
                  #{p.number} {p.firstName} {p.lastName} ({p.pos})
                </option>
              ))}
            </select>
          </label>
          <Button
            variant="primary"
            size="sm"
            disabled={retireUsed || !retireId}
            onClick={() => {
              const id = Number(retireId);
              if (!Number.isFinite(id)) return;
              apply((s) => {
                const res = retireUserNumber(s, id);
                if (!res.ok) return res.reason;
                setRetireId("");
                return `Retired ${res.ok ? `#${res.number}` : "number"}`;
              });
            }}
          >
            Retire
          </Button>
        </div>
      </Card>
    </div>
  );
}
