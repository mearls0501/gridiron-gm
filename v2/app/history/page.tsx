"use client";

import Link from "next/link";
import { useGame } from "@/lib/store/game";
import {
  HofReason,
  presentFranchiseHistory,
  reasonLine,
} from "@/lib/core/hallOfFame";
import {
  Card, Cell, Empty, Pill, PlayerLink, PosBadge, Row, Stat, Table, TeamMark,
} from "@/components/ui";

/**
 * Franchise archive: every completed season plus the Hall of Fame.
 *
 * Reads `state.history` and retiree stat lines. Nothing is written.
 * Eligibility lives in `lib/core/hallOfFame.ts` and is the whole rule.
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

  if (!state) return null;
  void rev;

  const team = state.teams[state.userTeamId];
  const view = presentFranchiseHistory(state);

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
        <div className="grid flex-1 gap-2 sm:grid-cols-3">
          <Stat label="Seasons archived" value={view.years.length} />
          <Stat
            label="Championships"
            value={view.championships}
            tone={view.championships > 0 ? "good" : undefined}
          />
          <Stat label="Hall of Fame" value={view.hallOfFame.length} />
        </div>
      </div>

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
        title="Hall of Fame"
        subtitle="Franchise legends from the threshold below"
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
    </div>
  );
}
