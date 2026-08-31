"use client";

import { useMemo, useState } from "react";
import { useGame } from "@/lib/store/game";
import { playerName } from "@/lib/core/ratings";
import { teamRoster } from "@/lib/core/select";
import {
  MAX_FOCUS,
  MIN_BUCKET,
  NEUTRAL_SHARE,
  SCHEMES,
  STAFF_BUCKETS,
  STAFF_POINTS,
  Scheme,
  StaffBucket,
  developmentFocus,
  injuryRiskMultiplier,
  normaliseBudget,
  schemeById,
  schemeFit,
  staffBudget,
} from "@/lib/core/staff";
import { PRIVATE_VISIT_CAP } from "@/lib/core/scouting";
import { Player, StaffBudget } from "@/lib/core/types";
import {
  Button, Card, Cell, cx, Empty, OvrBadge, Pill, PosBadge, Row, Stat, Table,
} from "@/components/ui";

/**
 * The front office.
 *
 * One pool of points, four places to put them, and no way to fund everything.
 * That is the whole screen and it is the whole strategy: every club in this
 * league has the same cap and the same hundred points, so the only thing
 * separating two front offices is what they decided mattered.
 *
 * Two rules about what is shown here.
 *
 * The consequences are stated in football, not in multipliers. "Your medical
 * staff is thin — expect more soft-tissue injuries" is a thing a general
 * manager would be told; `injuryRiskMultiplier = 1.23` is not. The one place
 * numbers do appear is where the player is being asked to compare two of his
 * own players against each other, because that is a comparison and prose makes
 * comparisons worse.
 *
 * And nothing here decides anything. `normaliseBudget` owns what a legal
 * allocation is, `schemeFit` owns who suits an identity, and this screen only
 * reads them — the same split the trade screen keeps with `evaluateOffer`.
 */

const BUCKET_LABEL: Record<StaffBucket, string> = {
  development: "Player Development",
  scouting: "Scouting",
  training: "Training & Medical",
  scheme: "Scheme Installation",
};

const BUCKET_BLURB: Record<StaffBucket, string> = {
  development:
    "Coaches who make players better. Fund it broadly and the whole roster grows faster; concentrate it and one man can reach a level he was never going to reach on his own.",
  scouting:
    "Eyes on the draft class. Funding the desk changes how well your people read a prospect; the calendar still decides when they can look, and every club gets the same 30 official visits.",
  training:
    "Strength staff, medical staff, sports science. Fewer soft-tissue injuries, quicker returns, and bodies that age a little more slowly.",
  scheme:
    "Practice time spent installing your identity. A committed scheme makes the players who suit it play above their rating — and the ones who don't play below it.",
};

/** Plain-language read on what a share currently buys. */
function verdict(bucket: StaffBucket, share: number): { text: string; tone: "good" | "bad" | "warn" | "default" } {
  const rel = share / NEUTRAL_SHARE;
  if (bucket === "training") {
    if (rel >= 1.6) return { text: "Best in the league. Your stars stay on the field.", tone: "good" };
    if (rel >= 1.15) return { text: "Well staffed. Fewer soft-tissue problems than most.", tone: "good" };
    if (rel <= 0.5) return { text: "Skeletal. You will lose people you cannot afford to lose.", tone: "bad" };
    if (rel <= 0.85) return { text: "Thin. Expect more time missed than the league average.", tone: "warn" };
    return { text: "League average.", tone: "default" };
  }
  if (bucket === "development") {
    if (rel >= 1.6) return { text: "A development factory. Young players get considerably better here.", tone: "good" };
    if (rel >= 1.15) return { text: "Strong. Your projects have a real chance.", tone: "good" };
    if (rel <= 0.5) return { text: "Nobody is coaching anybody up. What you draft is what you get.", tone: "bad" };
    if (rel <= 0.85) return { text: "Light. Players will tend to stall short of what they could be.", tone: "warn" };
    return { text: "League average.", tone: "default" };
  }
  if (bucket === "scouting") {
    if (rel >= 1.6) return { text: "You will go into the draft knowing more than anyone.", tone: "good" };
    if (rel >= 1.15) return { text: "A good look at the class.", tone: "good" };
    if (rel <= 0.5) return { text: "You are drafting nearly blind.", tone: "bad" };
    if (rel <= 0.85) return { text: "You will be guessing on more of the board than you would like.", tone: "warn" };
    return { text: "League average.", tone: "default" };
  }
  if (rel >= 1.6) return { text: "A hard identity. Fit will decide who plays.", tone: "good" };
  if (rel >= 1.15) return { text: "A clear identity your players are built around.", tone: "good" };
  if (rel <= 0.5) return { text: "You do not really have a scheme, just a depth chart.", tone: "bad" };
  if (rel <= 0.85) return { text: "Loosely installed. The identity is mostly on paper.", tone: "warn" };
  return { text: "League average.", tone: "default" };
}

function fitWord(fit: number): { label: string; tone: "good" | "bad" | "warn" | "default" } {
  if (fit >= 0.45) return { label: "Ideal", tone: "good" };
  if (fit >= 0.15) return { label: "Fits", tone: "good" };
  if (fit <= -0.45) return { label: "Wrong fit", tone: "bad" };
  if (fit <= -0.15) return { label: "Awkward", tone: "warn" };
  return { label: "Neutral", tone: "default" };
}

export default function FrontOfficePage() {
  const state = useGame((s) => s.state);
  const apply = useGame((s) => s.apply);
  const [draft, setDraft] = useState<StaffBudget | null>(null);

  const team = state ? state.teams[state.userTeamId] : null;
  const saved = team ? staffBudget(team) : null;
  const budget = draft ?? saved;

  const roster = useMemo(
    () => (state && team ? teamRoster(state, team.id) : []),
    [state, team]
  );

  /**
   * Who is worth developing.
   *
   * Sorted by how much of him is still unrealised, because that is the whole
   * question the development staff answers — a 31-year-old who has been what he
   * is for six years cannot be coached into anything.
   */
  const projects = useMemo(
    () =>
      roster
        .filter((p) => p.age < p.peakAge)
        .map((p) => ({ p, room: p.pot - p.ovr, locked: p.pot - p.ceiling }))
        .sort((a, b) => b.room - a.room),
    [roster]
  );

  if (!state || !team || !budget || !saved) {
    return <Empty title="No franchise loaded" hint="Start or load a save first." />;
  }

  const focus = developmentFocus(team);
  const dirty = STAFF_BUCKETS.some((k) => Math.round(budget[k]) !== Math.round(saved[k]));
  const totalNow = STAFF_BUCKETS.reduce((a, k) => a + budget[k], 0);

  const setBucket = (bucket: StaffBucket, value: number) => {
    // Everything else absorbs the change proportionally, so the pool always
    // adds up and the player never has to do the arithmetic themselves.
    const next = { ...budget, [bucket]: value } as StaffBudget;
    const others = STAFF_BUCKETS.filter((k) => k !== bucket);
    const room = STAFF_POINTS - value;
    const otherTotal = others.reduce((a, k) => a + budget[k], 0);
    for (const k of others) {
      next[k] = otherTotal > 0 ? (budget[k] / otherTotal) * room : room / others.length;
    }
    setDraft(next);
  };

  const commit = () => {
    const final = normaliseBudget(budget);
    apply((s) => {
      s.teams[s.userTeamId].staff = final;
      return "Staff budget set";
    });
    setDraft(null);
  };

  const toggleFocus = (p: Player) => {
    apply((s) => {
      const t = s.teams[s.userTeamId];
      const cur = t.devFocus ?? [];
      if (cur.includes(p.id)) {
        t.devFocus = cur.filter((x) => x !== p.id);
        return `${playerName(p)} is no longer a development priority`;
      }
      if (cur.length >= MAX_FOCUS) {
        return `You can only build around ${MAX_FOCUS} players. Drop somebody first.`;
      }
      t.devFocus = [...cur, p.id];
      return `The staff is building around ${playerName(p)}`;
    });
  };

  const pickScheme = (scheme: Scheme) => {
    apply((s) => {
      const t = s.teams[s.userTeamId];
      if (scheme.side === "offense") t.offScheme = scheme.id;
      else t.defScheme = scheme.id;
      return `${scheme.name} installed`;
    });
  };

  const offScheme = schemeById(team.offScheme);
  const defScheme = schemeById(team.defScheme);

  /** How the current identity reads across the men who actually play. */
  const fitRows = useMemo(() => {
    return roster
      .map((p) => {
        const s = p.teamId !== null ? (["QB", "RB", "WR", "TE", "OT", "OG", "C"] as string[]).includes(p.pos) ? offScheme : defScheme : null;
        return { p, scheme: s, fit: schemeFit(p, s) };
      })
      .filter((r) => r.fit !== 0)
      .sort((a, b) => b.fit - a.fit);
  }, [roster, offScheme, defScheme]);

  const bestFits = fitRows.slice(0, 5);
  const worstFits = fitRows.slice(-5).reverse();

  return (
    <div className="space-y-4">
      <Card
        title="Staff Budget"
        subtitle={`${STAFF_POINTS} points a season. Every club gets the same hundred — what separates you from them is where they go.`}
        actions={
          dirty ? (
            <>
              <Button variant="ghost" size="sm" onClick={() => setDraft(null)}>Discard</Button>
              <Button size="sm" onClick={commit}>Commit budget</Button>
            </>
          ) : (
            <Pill>Committed</Pill>
          )
        }
      >
        <div className="space-y-5">
          {STAFF_BUCKETS.map((bucket) => {
            const points = budget[bucket];
            const share = totalNow > 0 ? points / totalNow : NEUTRAL_SHARE;
            const v = verdict(bucket, share);
            return (
              <div key={bucket}>
                <div className="flex items-baseline justify-between gap-3 mb-1">
                  <div className="text-sm font-medium">{BUCKET_LABEL[bucket]}</div>
                  <div className="tnum text-sm text-[var(--color-muted)]">
                    {Math.round(points)} pts
                    <span className="text-[var(--color-faint)]"> · {Math.round(share * 100)}%</span>
                  </div>
                </div>
                <input
                  type="range"
                  min={MIN_BUCKET}
                  max={STAFF_POINTS - MIN_BUCKET * (STAFF_BUCKETS.length - 1)}
                  value={Math.round(points)}
                  onChange={(e) => setBucket(bucket, Number(e.target.value))}
                  className="w-full accent-[var(--color-accent)]"
                  aria-label={BUCKET_LABEL[bucket]}
                />
                <p className="text-xs text-[var(--color-muted)] mt-1">{BUCKET_BLURB[bucket]}</p>
                <p
                  className={cx(
                    "text-xs mt-1 font-medium",
                    v.tone === "good" && "text-[var(--color-good)]",
                    v.tone === "bad" && "text-[var(--color-bad)]",
                    v.tone === "warn" && "text-[var(--color-warn)]"
                  )}
                >
                  {v.text}
                </p>
              </div>
            );
          })}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-5">
          <Stat
            label="Private visits"
            value={PRIVATE_VISIT_CAP}
            sub="NFL cap each season"
          />
          <Stat
            label="Injury risk"
            value={`${Math.round(injuryRiskMultiplier({ ...team, staff: normaliseBudget(budget) }) * 100)}%`}
            sub="of league average"
            tone={
              injuryRiskMultiplier({ ...team, staff: normaliseBudget(budget) }) > 1.05
                ? "bad"
                : injuryRiskMultiplier({ ...team, staff: normaliseBudget(budget) }) < 0.95
                ? "good"
                : undefined
            }
          />
          <Stat label="Building around" value={`${focus.length} / ${MAX_FOCUS}`} sub="players" />
          <Stat label="Identity" value={offScheme?.name ?? "—"} sub={defScheme?.name ?? "—"} />
        </div>
      </Card>

      <Card
        title="Development Focus"
        subtitle={`Up to ${MAX_FOCUS} players. The staff, the reps and the game plan get built around them — and around nobody else.`}
      >
        {projects.length === 0 ? (
          <Empty title="Nobody left to develop" hint="Every player on this roster is at or past his peak." />
        ) : (
          <>
            <p className="text-xs text-[var(--color-muted)] mb-3">
              <strong className="text-[var(--color-text)]">Unrealised</strong> is how far short of his own
              potential a player currently sits. <strong className="text-[var(--color-text)]">Locked</strong> is
              the part of that his career was on track to never reach — and it is the part your coaches can buy
              back. Nothing can take a player past his potential.
            </p>
            <Table head={["", "Pos", "Player", "Age", "OVR", "Unrealised", "Locked"]}>
              {projects.slice(0, 18).map(({ p, room, locked }) => {
                const on = focus.includes(p.id);
                return (
                  <Row key={p.id} highlight={on}>
                    <Cell align="left">
                      <Button
                        size="sm"
                        variant={on ? "default" : "ghost"}
                        onClick={() => toggleFocus(p)}
                        title={on ? "Stop building around him" : "Build around him"}
                      >
                        {on ? "Priority" : "Add"}
                      </Button>
                    </Cell>
                    <Cell align="left"><PosBadge pos={p.pos} /></Cell>
                    <Cell align="left">{playerName(p)}</Cell>
                    <Cell>{p.age}</Cell>
                    <Cell><OvrBadge ovr={p.ovr} size="sm" /></Cell>
                    <Cell>{room > 0 ? `+${room}` : "—"}</Cell>
                    <Cell>
                      {locked > 0 ? <Pill tone="accent">{`+${locked}`}</Pill> : <span className="text-[var(--color-faint)]">—</span>}
                    </Cell>
                  </Row>
                );
              })}
            </Table>
          </>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {(["offense", "defense"] as const).map((side) => {
          const current = side === "offense" ? offScheme : defScheme;
          return (
            <Card
              key={side}
              title={side === "offense" ? "Offensive Identity" : "Defensive Identity"}
              subtitle={current?.blurb}
            >
              <div className="space-y-2">
                {SCHEMES.filter((s) => s.side === side).map((s) => {
                  const on = current?.id === s.id;
                  // How this identity would read across the roster you have.
                  const scores = roster.map((p) => schemeFit(p, s)).filter((f) => f !== 0);
                  const suits = scores.filter((f) => f >= 0.15).length;
                  const misfits = scores.filter((f) => f <= -0.15).length;
                  return (
                    <button
                      key={s.id}
                      onClick={() => pickScheme(s)}
                      className={cx(
                        "w-full text-left px-3 py-2.5 rounded-lg border transition-colors",
                        on
                          ? "border-[var(--color-accent)] bg-[var(--color-accent-dim)]"
                          : "border-[var(--color-line-soft)] bg-[var(--color-surface-2)] hover:border-[var(--color-line)]"
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium">{s.name}</span>
                        <span className="text-[11px] tnum text-[var(--color-muted)]">
                          <span className="text-[var(--color-good)]">{suits} suit</span>
                          {" · "}
                          <span className="text-[var(--color-bad)]">{misfits} don&apos;t</span>
                        </span>
                      </div>
                      <p className="text-xs text-[var(--color-muted)] mt-0.5">{s.blurb}</p>
                    </button>
                  );
                })}
              </div>
            </Card>
          );
        })}
      </div>

      <Card
        title="Who Your Scheme Suits"
        subtitle="Fit is measured against what the position is graded on, so a lesser player can suit an identity better than a better one."
      >
        {fitRows.length === 0 ? (
          <Empty title="No opinions yet" hint="Install an identity to see who it suits." />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {[
              { label: "Built for it", rows: bestFits },
              { label: "Playing out of position", rows: worstFits },
            ].map(({ label, rows }) => (
              <div key={label}>
                <div className="text-[10px] uppercase tracking-wider text-[var(--color-faint)] mb-2">{label}</div>
                <Table head={["Pos", "Player", "OVR", "Fit"]}>
                  {rows.map(({ p, fit }) => {
                    const w = fitWord(fit);
                    return (
                      <Row key={p.id}>
                        <Cell align="left"><PosBadge pos={p.pos} /></Cell>
                        <Cell align="left">{playerName(p)}</Cell>
                        <Cell><OvrBadge ovr={p.ovr} size="sm" /></Cell>
                        <Cell><Pill tone={w.tone}>{w.label}</Pill></Cell>
                      </Row>
                    );
                  })}
                </Table>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
