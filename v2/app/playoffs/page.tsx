"use client";

import Link from "next/link";
import { useGame } from "@/lib/store/game";
import { Conference, Game, PlayoffRound } from "@/lib/core/types";
import {
  bracketRounds, roundLabel, seedsFor, survivors,
} from "@/lib/core/season/playoffs";
import { computeRecords, recordString } from "@/lib/core/select";
import {
  Card, Cell, Empty, Pill, Row, Stat, Table, TeamMark, cx,
} from "@/components/ui";

/**
 * The bracket.
 *
 * Seeds come straight from `state.playoffs.seeds` (frozen when the postseason
 * opened), and the matchups come from the games themselves via `bracketRounds`
 * rather than being re-derived here — the bracket the user sees is the bracket
 * the simulation played.
 */

/** Left-aligned header cell (Table right-aligns everything after column 0). */
function L(label: string) {
  return <span className="block text-left">{label}</span>;
}

const ROUND_HINT: Record<PlayoffRound, string> = {
  WC: "Top seed rests. 2v7, 3v6, 4v5.",
  DIV: "Reseeded — the best remaining seed hosts the worst.",
  CONF: "Winner advances to the Championship.",
  SB: "One game for the title.",
};

export default function PlayoffsPage() {
  const state = useGame((s) => s.state);
  const rev = useGame((s) => s.rev);

  if (!state) return null;
  void rev; // re-render on every mutation; GameState is mutated in place

  const ps = state.playoffs;

  if (!ps) {
    return (
      <div className="space-y-4">
        <div>
          <h1 className="text-lg font-semibold">Playoffs</h1>
          <p className="text-xs text-[var(--color-muted)] mt-0.5">{state.season} postseason</p>
        </div>
        <Card>
          <Empty
            title="The bracket has not been set."
            hint="Seeding is locked in the moment the regular season ends. Play out the remaining weeks and the fourteen qualifiers will appear here."
          />
        </Card>
      </div>
    );
  }

  const userTeamId = state.userTeamId;
  const records = computeRecords(state);
  const seedByTeam = new Map<number, number>();
  for (const s of ps.seeds) seedByTeam.set(s.teamId, s.seed);

  const alive = new Set<number>([...survivors(state, "AFC"), ...survivors(state, "NFC")]);
  const rounds = bracketRounds(state);
  const champion = ps.complete && ps.championId !== null ? state.teams[ps.championId] : null;
  const userTeam = state.teams[userTeamId];

  function seedLabel(teamId: number): string {
    const s = seedByTeam.get(teamId);
    return s === undefined ? "—" : `#${s}`;
  }

  function BracketGame({ g }: { g: Game }) {
    const homeWon = g.played && g.homeScore > g.awayScore;
    const awayWon = g.played && g.awayScore > g.homeScore;
    const isUser = g.homeId === userTeamId || g.awayId === userTeamId;

    const side = (teamId: number, score: number, won: boolean) => {
      const t = state!.teams[teamId];
      const mine = teamId === userTeamId;
      return (
        <div className="flex items-center gap-2 py-1">
          <span className="w-7 shrink-0 text-[11px] tnum text-[var(--color-faint)]">
            {seedLabel(teamId)}
          </span>
          <TeamMark team={t} size={22} />
          <span
            className={cx(
              "truncate text-sm",
              won && "font-semibold",
              !g.played && "text-[var(--color-muted)]",
              mine && "text-[var(--color-accent)]"
            )}
          >
            {t.city} {t.name}
          </span>
          <span className={cx("ml-auto text-sm tnum shrink-0", won ? "font-semibold" : "text-[var(--color-muted)]")}>
            {g.played ? score : "—"}
          </span>
        </div>
      );
    };

    const body = (
      <div
        className={cx(
          "rounded-lg border px-3 py-2 transition-colors",
          isUser
            ? "border-[var(--color-accent)] bg-[var(--color-accent-dim)]/30"
            : "border-[var(--color-line-soft)] bg-[var(--color-surface-2)]",
          g.played && "hover:bg-[var(--color-surface-3)]"
        )}
      >
        {side(g.awayId, g.awayScore, awayWon)}
        {side(g.homeId, g.homeScore, homeWon)}
        <div className="flex items-center justify-between gap-2 mt-1.5 pt-1.5 border-t border-[var(--color-line-soft)]">
          <span className="text-[10px] uppercase tracking-wider text-[var(--color-faint)]">
            {g.playoffRound === "SB"
              ? "Neutral site"
              : `${state!.teams[g.homeId].abbr} hosts`}
          </span>
          <span className="text-[10px] text-[var(--color-accent)]">
            {g.played ? "Box score →" : "Not played"}
          </span>
        </div>
      </div>
    );

    return g.played ? (
      <Link href={`/game/${g.id}`} className="block">
        {body}
      </Link>
    ) : (
      body
    );
  }

  function SeedTable({ conf }: { conf: Conference }) {
    const seeds = seedsFor(state!, conf);
    if (seeds.length === 0) {
      return <Empty title={`No ${conf} seeds recorded.`} />;
    }
    return (
      <Table head={["Seed", L("Team"), "Record", "PF", "PA", "Status"]}>
        {seeds.map((s) => {
          const t = state!.teams[s.teamId];
          const r = records.get(s.teamId);
          const stillIn = alive.has(s.teamId);
          return (
            <Row key={s.teamId} highlight={s.teamId === userTeamId}>
              <Cell align="left" className="text-[var(--color-faint)]">{s.seed}</Cell>
              <Cell align="left">
                <span className="flex items-center gap-2 min-w-0">
                  <TeamMark team={t} size={20} />
                  <span className={cx("truncate", s.teamId === userTeamId && "font-semibold")}>
                    {t.city} {t.name}
                  </span>
                  {s.seed === 1 && <Pill tone="accent">Bye</Pill>}
                </span>
              </Cell>
              <Cell>{r ? recordString(r) : "—"}</Cell>
              <Cell>{r ? r.pf : "—"}</Cell>
              <Cell>{r ? r.pa : "—"}</Cell>
              <Cell>
                {ps!.complete && ps!.championId === s.teamId ? (
                  <Pill tone="accent">Champion</Pill>
                ) : stillIn ? (
                  <Pill tone="good">Alive</Pill>
                ) : (
                  <Pill tone="bad">Out</Pill>
                )}
              </Cell>
            </Row>
          );
        })}
      </Table>
    );
  }

  const userAlive = alive.has(userTeamId);
  const userInBracket = seedByTeam.has(userTeamId);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Playoffs</h1>
          <p className="text-xs text-[var(--color-muted)] mt-0.5">
            {state.season} postseason ·{" "}
            {ps.complete ? "Complete" : `${roundLabel(ps.round)} up next`}
          </p>
        </div>
        <Link href="/schedule" className="text-xs text-[var(--color-accent)] hover:underline">
          Full schedule
        </Link>
      </div>

      {champion && (
        <Card>
          <div className="flex flex-wrap items-center gap-4">
            <TeamMark team={champion} size={56} />
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-wider text-[var(--color-accent)]">
                {state.season} Champions
              </div>
              <div className="text-xl font-semibold truncate">
                {champion.city} {champion.name}
              </div>
              <div className="text-xs text-[var(--color-muted)] mt-0.5 tnum">
                {seedLabel(champion.id)} seed ·{" "}
                {(() => {
                  const r = records.get(champion.id);
                  return r ? `${recordString(r)} in the regular season` : "record unavailable";
                })()}
              </div>
            </div>
            {champion.id === userTeamId && (
              <div className="ml-auto">
                <Pill tone="accent">Your franchise</Pill>
              </div>
            )}
          </div>
        </Card>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Round" value={ps.complete ? "Final" : roundLabel(ps.round)} />
        <Stat label="Teams Alive" value={alive.size} sub={`of ${ps.seeds.length} qualifiers`} />
        <Stat
          label={userTeam.abbr}
          value={userInBracket ? `${seedLabel(userTeamId)} seed` : "Missed"}
          tone={userInBracket ? (userAlive ? "good" : "bad") : "bad"}
          sub={
            userInBracket
              ? userAlive
                ? "Still playing"
                : "Eliminated"
              : "Did not qualify"
          }
        />
        <Stat
          label="Champion"
          value={champion ? champion.abbr : "TBD"}
          tone={champion && champion.id === userTeamId ? "good" : undefined}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="AFC Seeds" subtitle="Seeded when the regular season closed" padded={false}>
          <SeedTable conf="AFC" />
        </Card>
        <Card title="NFC Seeds" subtitle="Seeded when the regular season closed" padded={false}>
          <SeedTable conf="NFC" />
        </Card>
      </div>

      <div className="space-y-4">
        {rounds.map(({ round, games }) => (
          <Card
            key={round}
            title={roundLabel(round)}
            subtitle={ROUND_HINT[round]}
            actions={
              round === ps.round && !ps.complete ? <Pill tone="accent">Current</Pill> : undefined
            }
          >
            {games.length === 0 ? (
              <Empty
                title="This round has not been drawn yet."
                hint="Matchups appear once the previous round finishes."
              />
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {games.map((g) => (
                  <BracketGame key={g.id} g={g} />
                ))}
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
