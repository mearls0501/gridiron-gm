"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ReactNode, useState } from "react";
import { useGame } from "@/lib/store/game";
import {
  ATTR_KEYS, ATTR_LABEL, AttrKey, Player, Position, SeasonStatLine,
} from "@/lib/core/types";
import { POSITION_WEIGHTS, ovrTier, relevantAttrs } from "@/lib/core/ratings";
import { attrBand } from "@/lib/core/scouting";
import { capHit, deadMoney, formatMoney } from "@/lib/core/select";
import { careerTotals, cmpPct, fgPct, passerRating, ypc, ypr } from "@/lib/core/season/stats";
import { askingPrice } from "@/lib/core/offseason/contracts";
import {
  Bar, Button, Card, Cell, Empty, OvrBadge, Pill, PosBadge, Row, Stat, Table, TeamMark, cx,
} from "@/components/ui";

/**
 * Player card.
 *
 * The one hard rule here: a draft prospect's true ability is never rendered.
 * Prospects get their scouted band and nothing else, because the whole point of
 * spending scouting points is that the band narrows.
 */

/** Left-aligned header cell (Table right-aligns everything after column 0). */
function L(label: string) {
  return <span className="block text-left">{label}</span>;
}

type StatKind = "passing" | "rushing" | "receiving" | "defense" | "kicking" | "snaps";

function statKindFor(pos: Position): StatKind {
  switch (pos) {
    case "QB": return "passing";
    case "RB": return "rushing";
    case "WR":
    case "TE": return "receiving";
    case "EDGE":
    case "DT":
    case "LB":
    case "CB":
    case "S": return "defense";
    case "K":
    case "P": return "kicking";
    default: return "snaps";
  }
}

const STAT_HEAD: Record<StatKind, string[]> = {
  passing: ["Cmp/Att", "Pct", "Yds", "TD", "INT", "Sk", "Rtg", "Rush", "RuYds"],
  rushing: ["Att", "Yds", "YPC", "TD", "Fum", "Rec", "ReYds", "ReTD"],
  receiving: ["Tgt", "Rec", "Yds", "YPR", "TD", "Fum"],
  defense: ["Tkl", "Sacks", "INT", "PD", "FF"],
  kicking: ["FG", "Pct", "Long", "XP", "Punts", "Avg"],
  snaps: ["Snaps"],
};

function statCells(kind: StatKind, l: SeasonStatLine): ReactNode {
  switch (kind) {
    case "passing":
      return (
        <>
          <Cell>{l.passCmp}/{l.passAtt}</Cell>
          <Cell>{l.passAtt > 0 ? cmpPct(l).toFixed(1) : "—"}</Cell>
          <Cell className="font-semibold">{l.passYds}</Cell>
          <Cell>{l.passTd}</Cell>
          <Cell>{l.passInt}</Cell>
          <Cell>{l.sacked}</Cell>
          <Cell>{l.passAtt > 0 ? passerRating(l).toFixed(1) : "—"}</Cell>
          <Cell>{l.rushAtt}</Cell>
          <Cell>{l.rushYds}</Cell>
        </>
      );
    case "rushing":
      return (
        <>
          <Cell>{l.rushAtt}</Cell>
          <Cell className="font-semibold">{l.rushYds}</Cell>
          <Cell>{l.rushAtt > 0 ? ypc(l).toFixed(1) : "—"}</Cell>
          <Cell>{l.rushTd}</Cell>
          <Cell>{l.fumbles}</Cell>
          <Cell>{l.rec}</Cell>
          <Cell>{l.recYds}</Cell>
          <Cell>{l.recTd}</Cell>
        </>
      );
    case "receiving":
      return (
        <>
          <Cell>{l.targets}</Cell>
          <Cell>{l.rec}</Cell>
          <Cell className="font-semibold">{l.recYds}</Cell>
          <Cell>{l.rec > 0 ? ypr(l).toFixed(1) : "—"}</Cell>
          <Cell>{l.recTd}</Cell>
          <Cell>{l.fumbles}</Cell>
        </>
      );
    case "defense":
      return (
        <>
          <Cell className="font-semibold">{l.tackles}</Cell>
          <Cell>{l.sacks.toFixed(1)}</Cell>
          <Cell>{l.ints}</Cell>
          <Cell>{l.passDef}</Cell>
          <Cell>{l.ff}</Cell>
        </>
      );
    case "kicking":
      return (
        <>
          <Cell className="font-semibold">{l.fgm}/{l.fga}</Cell>
          <Cell>{l.fga > 0 ? fgPct(l).toFixed(1) : "—"}</Cell>
          <Cell>{l.longFg > 0 ? l.longFg : "—"}</Cell>
          <Cell>{l.xpm}/{l.xpa}</Cell>
          <Cell>{l.punts}</Cell>
          <Cell>{l.punts > 0 ? (l.puntYds / l.punts).toFixed(1) : "—"}</Cell>
        </>
      );
    case "snaps":
      return <Cell className="font-semibold">{l.snaps}</Cell>;
  }
}

function attrTone(v: number): "good" | "accent" | "warn" | "bad" {
  if (v >= 85) return "good";
  if (v >= 72) return "accent";
  if (v >= 58) return "warn";
  return "bad";
}

/**
 * One attribute line. For a prospect, `band` is the department's scouted RANGE
 * — centred on a stable wrong estimate, never on the truth. Rendering the true
 * number here was the leak that made every other scouting mechanic cosmetic:
 * true OVR is exactly recoverable from the attribute panel via position
 * weights, so the panel must never hold it for an undrafted man.
 */
function AttrRow({ k, v, band }: { k: AttrKey; v: number; band?: { low: number; high: number } }) {
  const mid = band ? Math.round((band.low + band.high) / 2) : v;
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs text-[var(--color-muted)] truncate">{ATTR_LABEL[k]}</span>
        <span className="text-xs font-semibold tnum">
          {band ? `${band.low}–${band.high}` : v}
        </span>
      </div>
      <Bar value={mid} tone={band ? "accent" : attrTone(v)} />
    </div>
  );
}

function scoutedBand(p: Player): string {
  if (p.scoutedOvrLow == null || p.scoutedOvrHigh == null) return "Unscouted";
  if (p.scoutedOvrLow === p.scoutedOvrHigh) return String(p.scoutedOvrLow);
  return `${p.scoutedOvrLow}–${p.scoutedOvrHigh}`;
}

export default function PlayerPage() {
  const params = useParams<{ id: string }>();
  const state = useGame((s) => s.state);
  const rev = useGame((s) => s.rev);
  const [showAllAttrs, setShowAllAttrs] = useState(false);

  if (!state) return null;
  void rev; // re-render on every mutation; GameState is mutated in place

  const raw = params?.id;
  const id = Number(Array.isArray(raw) ? raw[0] : raw);
  const p = Number.isFinite(id) ? state.players.find((x) => x.id === id) : undefined;

  if (!p) {
    return (
      <div className="space-y-4">
        <h1 className="text-lg font-semibold">Player</h1>
        <Card>
          <Empty
            title="No player with that id."
            hint="They may have retired out of the league, or the link came from a different franchise."
            action={
              <Link href="/roster" className="text-xs text-[var(--color-accent)] hover:underline">
                Back to your roster
              </Link>
            }
          />
        </Card>
      </div>
    );
  }

  const team = p.teamId !== null ? state.teams[p.teamId] : null;
  const isUserPlayer = p.teamId === state.userTeamId;
  const injured = p.injuryWeeks > 0;
  const weights = POSITION_WEIGHTS[p.pos];
  const key = relevantAttrs(p.pos)
    .slice()
    .sort((a, b) => (weights[b] ?? 0) - (weights[a] ?? 0));
  const keySet = new Set<AttrKey>(key);
  const rest = ATTR_KEYS.filter((k) => !keySet.has(k));

  const kind = statKindFor(p.pos);
  const seasons = p.stats.slice().sort((a, b) => a.season - b.season);
  const totals = careerTotals(p);
  const tier = p.prospect ? null : ovrTier(p.ovr);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">
            {p.firstName} {p.lastName}
          </h1>
          <p className="text-xs text-[var(--color-muted)] mt-0.5">
            {p.prospect
              ? `${p.draftClassSeason ?? state.season} draft class`
              : team
                ? `${team.city} ${team.name}`
                : "Unsigned free agent"}
          </p>
        </div>
        {isUserPlayer && <Pill tone="accent">Your roster</Pill>}
      </div>

      <Card>
        <div className="flex flex-wrap items-center gap-4">
          {team ? (
            <TeamMark team={team} size={48} />
          ) : (
            <span className="inline-flex items-center justify-center w-12 h-12 rounded bg-[var(--color-surface-3)] text-[10px] font-semibold text-[var(--color-muted)]">
              {p.prospect ? "DRAFT" : "FA"}
            </span>
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <PosBadge pos={p.pos} />
              <span className="text-base font-semibold truncate">
                {p.firstName} {p.lastName}
              </span>
              {p.retired && <Pill tone="bad">Retired</Pill>}
              {injured && (
                <Pill tone="bad">
                  {p.injuryDesc ?? "Injured"} · {p.injuryWeeks}w
                </Pill>
              )}
            </div>
            <div className="text-xs text-[var(--color-muted)] mt-1 tnum">
              Age {p.age} · {p.yearsPro === 0 ? "Rookie" : `${p.yearsPro} year${p.yearsPro === 1 ? "" : "s"} pro`}
              {team ? ` · ${team.division}` : ""}
              {p.draftedRound !== null && p.draftedPick !== null
                ? ` · Rd ${p.draftedRound}, pick ${p.draftedPick}`
                : ""}
            </div>
          </div>
          <div className="ml-auto flex items-center gap-3">
            {p.prospect ? (
              <div className="text-right">
                <div className="text-[10px] uppercase tracking-wider text-[var(--color-faint)]">
                  Scouted Grade
                </div>
                <div className="text-lg font-semibold tnum">{scoutedBand(p)}</div>
              </div>
            ) : (
              <>
                <div className="text-right">
                  <div className="text-[10px] uppercase tracking-wider text-[var(--color-faint)]">
                    Overall
                  </div>
                  <div className="mt-1">
                    <OvrBadge ovr={p.ovr} />
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] uppercase tracking-wider text-[var(--color-faint)]">
                    Potential
                  </div>
                  <div className="mt-1">
                    <OvrBadge ovr={p.pot} />
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {p.prospect ? (
          <>
            <Stat label="Scouted Grade" value={scoutedBand(p)} sub="Band narrows with scouting" />
            <Stat label="Scouting" value={`${Math.round(p.scouted)}%`} sub="Effort invested" />
            <Stat label="Age" value={p.age} />
            <Stat
              label="Class"
              value={p.draftClassSeason ?? "—"}
              sub={p.draftedRound !== null ? `Drafted Rd ${p.draftedRound}` : "Undrafted so far"}
            />
          </>
        ) : (
          <>
            <Stat label="Overall" value={p.ovr} sub={tier?.label} />
            <Stat label="Potential" value={p.pot} sub={p.pot > p.ovr ? `+${p.pot - p.ovr} to grow` : "At ceiling"} />
            <Stat label="Durability" value={p.durability} sub={injured ? "Currently hurt" : "Healthy"} tone={injured ? "bad" : undefined} />
            <Stat label="Peak Age" value={p.peakAge} sub={p.age < p.peakAge ? "Still rising" : "Past peak"} />
          </>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Contract" className="lg:col-span-1">
          {p.prospect ? (
            <div className="space-y-3">
              <p className="text-xs text-[var(--color-muted)]">
                Draft prospects sign rookie deals the moment they are picked. Nothing is owed until
                then.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <Stat label="Class" value={p.draftClassSeason ?? "—"} />
                <Stat label="Scouting" value={`${Math.round(p.scouted)}%`} />
              </div>
              <Link href="/draft" className="text-xs text-[var(--color-accent)] hover:underline">
                Go to the draft board
              </Link>
            </div>
          ) : p.teamId === null ? (
            <div className="space-y-3">
              <div className="text-sm">
                Free agent — asking{" "}
                <span className="font-semibold tnum">{formatMoney(askingPrice(state, p))}</span>/yr
              </div>
              <p className="text-xs text-[var(--color-muted)]">
                Offers below roughly 92% of that number get turned down.
              </p>
              <Link href="/free-agency" className="text-xs text-[var(--color-accent)] hover:underline">
                Open free agency
              </Link>
            </div>
          ) : p.contract === null ? (
            <Empty
              title="No active contract."
              hint="This player is on the roster without a deal on the books — it will be written at the next rollover."
            />
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Stat
                  label="Years Left"
                  value={p.contract.yearsRemaining}
                  sub={`of a ${p.contract.years}-year deal`}
                />
                <Stat label="Cap Hit" value={formatMoney(capHit(p.contract))} sub="This season" />
                <Stat
                  label="Base Salary"
                  value={formatMoney(p.contract.baseSalary[0] ?? 0)}
                  sub="This season"
                />
                <Stat
                  label="Signing Bonus"
                  value={formatMoney(p.contract.signingBonus)}
                  sub={
                    p.contract.bonusProrationYears > 0
                      ? `Prorated over ${p.contract.bonusProrationYears}y`
                      : "Fully accounted"
                  }
                />
              </div>
              <div className="rounded-lg border border-[var(--color-line-soft)] bg-[var(--color-surface-2)] px-3 py-2.5">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-xs text-[var(--color-muted)]">Dead money if cut</span>
                  <span className="text-sm font-semibold tnum text-[var(--color-bad)]">
                    {formatMoney(deadMoney(p.contract))}
                  </span>
                </div>
                <div className="flex items-baseline justify-between gap-2 mt-1">
                  <span className="text-xs text-[var(--color-muted)]">Cap saved by cutting</span>
                  <span
                    className={cx(
                      "text-sm font-semibold tnum",
                      capHit(p.contract) - deadMoney(p.contract) > 0
                        ? "text-[var(--color-good)]"
                        : "text-[var(--color-bad)]"
                    )}
                  >
                    {formatMoney(capHit(p.contract) - deadMoney(p.contract))}
                  </span>
                </div>
                {p.contract.guaranteedYears > 0 && (
                  <div className="text-[11px] text-[var(--color-faint)] mt-1.5">
                    {p.contract.guaranteedYears} guaranteed year
                    {p.contract.guaranteedYears === 1 ? "" : "s"} remaining.
                  </div>
                )}
              </div>
              {isUserPlayer && (
                <Link href="/finances" className="text-xs text-[var(--color-accent)] hover:underline">
                  See the whole cap sheet
                </Link>
              )}
            </div>
          )}
        </Card>

        <Card
          title={`Key Attributes — ${p.pos}`}
          subtitle={
            p.prospect
              ? "Scouted ranges — your department's read, not the truth"
              : "Weighted heaviest for this position"
          }
          className="lg:col-span-2"
          actions={
            <Button size="sm" variant="ghost" onClick={() => setShowAllAttrs(!showAllAttrs)}>
              {showAllAttrs ? "Hide the rest" : `Show all ${ATTR_KEYS.length}`}
            </Button>
          }
        >
          {p.prospect && p.profile && (
            <div className="mb-4 pb-3 border-b border-[var(--color-line-soft)] flex flex-wrap gap-x-6 gap-y-1 text-xs text-[var(--color-muted)]">
              <span>{p.profile.college}</span>
              <span>{p.profile.classYear.replace("RS_", "RS ")}</span>
              <span className="tnum">
                {Math.floor(p.profile.heightIn / 12)}&apos;{p.profile.heightIn % 12}&quot; · {p.profile.weightLb} lb
              </span>
              {p.profile.combine.forty != null && (
                <span className="tnum">40yd {p.profile.combine.forty.toFixed(2)}s</span>
              )}
              {p.profile.combine.vertical != null && (
                <span className="tnum">Vert {p.profile.combine.vertical}&quot;</span>
              )}
              {p.profile.combine.bench != null && (
                <span className="tnum">Bench {p.profile.combine.bench}</span>
              )}
            </div>
          )}
          {key.length === 0 ? (
            <Empty title="No weighted attributes for this position." />
          ) : (
            <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
              {key.map((k) => (
                <AttrRow
                  key={k}
                  k={k}
                  v={p.attrs[k]}
                  band={p.prospect ? attrBand(state, p, k) : undefined}
                />
              ))}
            </div>
          )}

          {showAllAttrs && (
            <div className="mt-5 pt-4 border-t border-[var(--color-line-soft)]">
              <div className="text-[10px] uppercase tracking-wider text-[var(--color-faint)] mb-3">
                Everything Else
              </div>
              {rest.length === 0 ? (
                <Empty title="Every attribute matters at this position." />
              ) : (
                <div className="grid gap-x-6 gap-y-2.5 sm:grid-cols-3 lg:grid-cols-4">
                  {rest.map((k) => {
                    const band = p.prospect ? attrBand(state, p, k) : null;
                    return (
                      <div key={k} className="flex items-baseline justify-between gap-2">
                        <span className="text-xs text-[var(--color-faint)] truncate">
                          {ATTR_LABEL[k]}
                        </span>
                        <span className="text-xs tnum text-[var(--color-muted)]">
                          {band ? `${band.low}–${band.high}` : p.attrs[k]}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </Card>
      </div>

      <Card title="Career Statistics" subtitle={`${p.pos} splits`} padded={false}>
        {seasons.length === 0 ? (
          <Empty
            title="No games played yet."
            hint={
              p.prospect
                ? "Prospects have no professional record until they are drafted and play."
                : "Season lines appear the first time this player takes a snap."
            }
          />
        ) : (
          <Table head={["Season", L("Team"), "GP", "GS", ...STAT_HEAD[kind]]}>
            {seasons.map((l) => {
              const lt = l.teamId !== null ? state.teams[l.teamId] : null;
              return (
                <Row key={l.season} highlight={l.season === state.season}>
                  <Cell align="left">{l.season}</Cell>
                  <Cell align="left">
                    {lt ? (
                      <span className="flex items-center gap-2 min-w-0">
                        <TeamMark team={lt} size={20} />
                        <span className="truncate">{lt.abbr}</span>
                      </span>
                    ) : (
                      <span className="text-[var(--color-faint)]">—</span>
                    )}
                  </Cell>
                  <Cell>{l.games}</Cell>
                  <Cell>{l.gamesStarted}</Cell>
                  {statCells(kind, l)}
                </Row>
              );
            })}
            <Row>
              <Cell align="left" className="font-semibold">Career</Cell>
              <Cell align="left" className="text-[var(--color-faint)]">
                {seasons.length} season{seasons.length === 1 ? "" : "s"}
              </Cell>
              <Cell className="font-semibold">{totals.games}</Cell>
              <Cell className="font-semibold">{totals.gamesStarted}</Cell>
              {statCells(kind, totals)}
            </Row>
          </Table>
        )}
      </Card>

      <Card title="Awards & Honors" subtitle={`${p.careerAwards.length} recorded`}>
        {p.careerAwards.length === 0 ? (
          <Empty
            title="No awards yet."
            hint="League honors are handed out during the season review each offseason."
          />
        ) : (
          <div className="flex flex-wrap gap-2">
            {p.careerAwards.map((a, i) => (
              <span
                key={`${a}-${i}`}
                className="inline-flex items-center px-2.5 py-1 rounded-lg bg-[var(--color-surface-2)] border border-[var(--color-line-soft)] text-xs"
              >
                {a}
              </span>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
