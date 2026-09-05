"use client";

import Link from "next/link";
import { useState } from "react";
import { useGame } from "@/lib/store/game";
import {
  GAME_RECORD_KEYS, GAME_RECORD_LABEL, GameRecordKey, RecordEntry, TeamRecordEntry,
} from "@/lib/core/types";
import {
  blankRecordBook, careerRecords, CAREER_KEYS, CAREER_LABEL, CareerKey,
  franchiseCareerRecords, LeaderEntry, seasonRecords,
} from "@/lib/core/season/records";
import {
  Card, Cell, Empty, Pill, PlayerLink, PosBadge, Row, Table, Tabs, TeamMark,
} from "@/components/ui";

/**
 * The record book.
 *
 * Single-game marks are read straight out of `state.records`, because box
 * scores only survive for the current season and a leaderboard derived at
 * display time would forget every earlier year. Season, career and franchise
 * lists are derived on demand from the players' own stat lines, which are kept
 * forever — so nothing on this page can drift away from what actually happened.
 *
 * Read-only: this page never calls apply().
 */

type Tab = "game" | "season" | "career" | "franchise" | "team";

const TABS: { value: Tab; label: string }[] = [
  { value: "game", label: "Single Game" },
  { value: "season", label: "Season" },
  { value: "career", label: "Career" },
  { value: "franchise", label: "Franchise" },
  { value: "team", label: "Team" },
];

/** Sacks are half-credited; everything else is a whole number. */
function fmt(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

/** Left-aligned header cell (Table right-aligns everything after column 0). */
function L(label: string) {
  return <span className="block text-left">{label}</span>;
}

export default function RecordsPage() {
  const state = useGame((s) => s.state);
  const rev = useGame((s) => s.rev);
  const [tab, setTab] = useState<Tab>("game");

  if (!state) return null;
  void rev; // re-render on every mutation; GameState is mutated in place

  // Old saves predate the record book; a blank one reads the same as an empty one.
  const book = state.records ?? blankRecordBook();
  const userTeam = state.teams[state.userTeamId];

  const gameCount = GAME_RECORD_KEYS.reduce((n, k) => n + (book.game[k]?.length ?? 0), 0);
  const teamCount =
    book.team.mostPoints.length + book.team.mostYards.length + book.team.biggestMargin.length;
  const bookEmpty = gameCount === 0 && teamCount === 0;

  function teamOf(id: number | null) {
    return id === null ? null : state!.teams[id] ?? null;
  }

  function TeamCell({ id }: { id: number | null }) {
    const t = teamOf(id);
    return t ? <TeamMark team={t} size={20} /> : <Pill>FA</Pill>;
  }

  function when(season: number, week: number) {
    return (
      <span className="whitespace-nowrap text-[var(--color-muted)]">
        {season} · Wk {week}
      </span>
    );
  }

  // -------------------------------------------------------------------------
  // Single game
  // -------------------------------------------------------------------------

  function GameCard({ k }: { k: GameRecordKey }) {
    const rows: RecordEntry[] = book.game[k] ?? [];
    return (
      <Card title={GAME_RECORD_LABEL[k]} subtitle="Best single games, all-time" padded={false}>
        {rows.length === 0 ? (
          <Empty title="No mark set yet." />
        ) : (
          <Table head={["Rk", L("Player"), "Val", L("Detail"), "When"]}>
            {rows.map((e, i) => (
              <Row key={`${e.playerId}-${e.season}-${e.week}-${i}`} highlight={e.teamId === state!.userTeamId}>
                <Cell align="left" className="text-[var(--color-faint)]">{i + 1}</Cell>
                <Cell align="left">
                  <span className="flex items-center gap-2 min-w-0">
                    <TeamCell id={e.teamId} />
                    <PosBadge pos={e.pos} />
                    <Link
                      href={`/player/${e.playerId}`}
                      className="truncate hover:text-[var(--color-accent)] transition-colors"
                    >
                      {e.playerName}
                    </Link>
                  </span>
                </Cell>
                <Cell className="font-semibold">{fmt(e.value)}</Cell>
                <Cell align="left" className="text-[var(--color-muted)] whitespace-nowrap">
                  {e.detail}
                </Cell>
                <Cell>{when(e.season, e.week)}</Cell>
              </Row>
            ))}
          </Table>
        )}
      </Card>
    );
  }

  // -------------------------------------------------------------------------
  // Season / career / franchise
  // -------------------------------------------------------------------------

  function LeaderCard({
    k, rows, showSeason, subtitle,
  }: {
    k: CareerKey; rows: LeaderEntry[]; showSeason: boolean; subtitle: string;
  }) {
    const head = showSeason
      ? ["Rk", L("Player"), "Season", "Val"]
      : ["Rk", L("Player"), "Val"];
    return (
      <Card title={CAREER_LABEL[k]} subtitle={subtitle} padded={false}>
        {rows.length === 0 ? (
          <Empty title="No mark set yet." />
        ) : (
          <Table head={head}>
            {rows.map((e, i) => (
              <Row
                key={`${e.player.id}-${e.season ?? "career"}`}
                highlight={e.teamId === state!.userTeamId}
              >
                <Cell align="left" className="text-[var(--color-faint)]">{i + 1}</Cell>
                <Cell align="left">
                  <span className="flex items-center gap-2 min-w-0">
                    <TeamCell id={e.teamId} />
                    <PosBadge pos={e.player.pos} />
                    <PlayerLink p={e.player} className="min-w-0" />
                  </span>
                </Cell>
                {showSeason && <Cell>{e.season ?? "—"}</Cell>}
                <Cell className="font-semibold">{fmt(e.value)}</Cell>
              </Row>
            ))}
          </Table>
        )}
      </Card>
    );
  }

  function LeaderGrid({
    lists, showSeason, subtitle,
  }: {
    lists: { k: CareerKey; rows: LeaderEntry[] }[]; showSeason: boolean; subtitle: string;
  }) {
    const filled = lists.filter((l) => l.rows.length > 0);
    if (filled.length === 0) {
      return (
        <Card>
          <Empty
            title="Nothing on the board yet."
            hint="These lists are built from completed seasons of player statistics."
          />
        </Card>
      );
    }
    return (
      <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
        {filled.map((l) => (
          <LeaderCard key={l.k} k={l.k} rows={l.rows} showSeason={showSeason} subtitle={subtitle} />
        ))}
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Team
  // -------------------------------------------------------------------------

  function TeamCard({ title, subtitle, rows }: {
    title: string; subtitle: string; rows: TeamRecordEntry[];
  }) {
    return (
      <Card title={title} subtitle={subtitle} padded={false}>
        {rows.length === 0 ? (
          <Empty title="No mark set yet." />
        ) : (
          <Table head={["Rk", L("Team"), "Val", L("Detail"), "When"]}>
            {rows.map((e, i) => {
              const t = teamOf(e.teamId);
              return (
                <Row key={`${e.teamId}-${e.season}-${e.week}-${i}`} highlight={e.teamId === state!.userTeamId}>
                  <Cell align="left" className="text-[var(--color-faint)]">{i + 1}</Cell>
                  <Cell align="left">
                    <span className="flex items-center gap-2 min-w-0">
                      {t ? <TeamMark team={t} size={20} /> : <Pill>—</Pill>}
                      <span className="truncate">{t ? `${t.city} ${t.name}` : "Unknown team"}</span>
                    </span>
                  </Cell>
                  <Cell className="font-semibold">{fmt(e.value)}</Cell>
                  <Cell align="left" className="text-[var(--color-muted)] whitespace-nowrap">
                    {e.detail}
                  </Cell>
                  <Cell>{when(e.season, e.week)}</Cell>
                </Row>
              );
            })}
          </Table>
        )}
      </Card>
    );
  }

  // -------------------------------------------------------------------------

  const subtitleFor: Record<Tab, string> = {
    game: "Best single games, all-time",
    season: "Best single seasons, all-time",
    career: "Career totals, all-time",
    franchise: `Career totals with the ${userTeam.name}`,
    team: "Single-game team marks",
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Record Book</h1>
          <p className="text-xs text-[var(--color-muted)] mt-0.5">
            {subtitleFor[tab]} · through {state.season}
            {" · "}
            <Link href="/history" className="text-[var(--color-accent)] hover:underline">
              Franchise History
            </Link>
          </p>
        </div>
        <Tabs<Tab> value={tab} onChange={setTab} options={TABS} />
      </div>

      {bookEmpty ? (
        <Card>
          <Empty
            title="The record book is empty."
            hint="Records populate as games are played — every finished game is checked against the all-time lists, and season and career marks build up from there."
            action={
              <Link href="/schedule" className="text-xs text-[var(--color-accent)] hover:underline">
                Go to the schedule
              </Link>
            }
          />
        </Card>
      ) : tab === "game" ? (
        <div className="grid gap-4 xl:grid-cols-2">
          {GAME_RECORD_KEYS.map((k) => (
            <GameCard key={k} k={k} />
          ))}
        </div>
      ) : tab === "season" ? (
        <LeaderGrid
          showSeason
          subtitle="Best single seasons"
          lists={CAREER_KEYS.map((k) => ({ k, rows: seasonRecords(state, k, 5) }))}
        />
      ) : tab === "career" ? (
        <LeaderGrid
          showSeason={false}
          subtitle="Career totals"
          lists={CAREER_KEYS.map((k) => ({ k, rows: careerRecords(state, k, 5) }))}
        />
      ) : tab === "franchise" ? (
        <div className="space-y-4">
          <Card>
            <div className="flex items-center gap-3">
              <TeamMark team={userTeam} size={36} />
              <div className="min-w-0">
                <div className="text-sm font-semibold truncate">
                  {userTeam.city} {userTeam.name} franchise leaders
                </div>
                <div className="text-xs text-[var(--color-muted)] mt-0.5">
                  Totals accumulated while on this roster only.
                </div>
              </div>
            </div>
          </Card>
          <LeaderGrid
            showSeason={false}
            subtitle={`With the ${userTeam.name}`}
            lists={CAREER_KEYS.map((k) => ({
              k, rows: franchiseCareerRecords(state, state.userTeamId, k, 5),
            }))}
          />
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2 2xl:grid-cols-3">
          <TeamCard title="Most points" subtitle="Single game" rows={book.team.mostPoints} />
          <TeamCard title="Most total yards" subtitle="Single game" rows={book.team.mostYards} />
          <TeamCard title="Biggest margin" subtitle="Single game" rows={book.team.biggestMargin} />
        </div>
      )}
    </div>
  );
}
