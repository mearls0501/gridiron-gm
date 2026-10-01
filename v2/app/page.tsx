"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useGame } from "@/lib/store/game";
import { shouldDismissSimMenu } from "@/lib/view/simMenu";
import { PHASE_LABEL } from "@/components/Shell";
import {
  Button, Card, Cell, Empty, OvrBadge, Pill, PlayerLink, PosBadge, Row, Stat, Table, TeamMark, cx,
} from "@/components/ui";
import {
  capHit, computeRecords, formatMoney, irCount, recordString, rosterIssues, teamCap,
} from "@/lib/core/select";
import { userNextGame, isOnBye, injuredPlayers, weekGames } from "@/lib/core/season/engine";
import { roundLabel } from "@/lib/core/season/playoffs";
import { divisionStandings, seasonHasResults } from "@/lib/core/season/standings";
import {
  applyFifthYearOption, applyFranchiseTag, applyTagExtension, clubFranchiseTaggedPlayer,
  declineFifthYearOption, expiringPlayers, fifthYearOptionPlayers, fifthYearOptionSalary,
  franchiseTagSalary, OFFSEASON_STEPS, reconcileRoster,
  skipTagExtension, tagExtensionPlayers, tagExtensionTerms,
} from "@/lib/core/offseason";
import { Rng } from "@/lib/core/rng";
import { tradeBoardAssetLabel } from "@/lib/view/tradeBoard";
import { REGULAR_SEASON_WEEKS, ROSTER_LIMIT, TRADE_DEADLINE_WEEK, isHarsh, weatherLabel, type GameState } from "@/lib/core/types";
import { SeasonReviewPanels, SeasonReviewSummary } from "@/components/SeasonReview";
import { presentSeasonReview } from "@/lib/view/seasonReview";
import { hubCampCutdownCopy, hubCampFloorCopy, rosterCapView } from "@/lib/view/rosterCap";
import { teamLeaders } from "@/lib/view/teamLeaders";
import { PRIVATE_VISIT_CAP, calendarView } from "@/lib/core/scouting";

/** Live label while Hub simTo yields between weeks. */
function hubSimLabel(state: GameState): string {
  if (state.phase === "regular") return `Simming… Week ${state.week}`;
  if (state.phase === "playoffs") {
    const round = state.playoffs?.round;
    return round ? `Simming… ${roundLabel(round)}` : "Simming… Playoffs";
  }
  const phase = PHASE_LABEL[state.phase];
  return phase ? `Simming… ${phase}` : "Simming…";
}

/** One row in the Sim dropdown. */
function SimOption({ label, hint, onClick }: { label: string; hint: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left px-3 py-2.5 hover:bg-[var(--color-surface-2)] transition-colors cursor-pointer"
    >
      <span className="block text-xs font-medium">{label}</span>
      <span className="block text-[11px] text-[var(--color-muted)] mt-0.5">{hint}</span>
    </button>
  );
}

/**
 * The hub.
 *
 * One rule drives this screen: whatever the franchise needs next, the button
 * for it is here. The previous build hid week advancement on an admin page and
 * told users to click a button that did not exist — this is the fix for that.
 */
export default function Hub() {
  const state = useGame((s) => s.state);
  const advance = useGame((s) => s.advance);
  const apply = useGame((s) => s.apply);
  const simTo = useGame((s) => s.simTo);
  const busy = useGame((s) => s.busy);
  const simming = useGame((s) => s.simming);
  const simLabel = useGame((s) => s.simLabel);
  const [confirming, setConfirming] = useState(false);
  const [simMenu, setSimMenu] = useState(false);
  const simMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!simMenu) return;
    const onPointerDown = (e: PointerEvent) => {
      const insideControl = !!(
        simMenuRef.current &&
        e.target instanceof Node &&
        simMenuRef.current.contains(e.target)
      );
      if (shouldDismissSimMenu({ type: e.type, insideControl })) setSimMenu(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (shouldDismissSimMenu({ type: e.type, key: e.key, insideControl: true })) {
        setSimMenu(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [simMenu]);

  const runSim = (target: Parameters<typeof simTo>[0]) => {
    setSimMenu(false);
    void simTo(target);
  };

  const derived = useMemo(() => {
    if (!state) return null;
    const team = state.teams[state.userTeamId];
    const recs = computeRecords(state);
    const rec = recs.get(team.id)!;
    const cap = teamCap(state, team.id);
    const next = userNextGame(state);
    const bye = isOnBye(state, team.id);
    const injured = injuredPlayers(state, team.id);
    const onIr = irCount(state, team.id);
    const issues = rosterIssues(state, team.id);
    const clip = rosterCapView(state, team.id);
    const div = divisionStandings(state, team.division);
    const divRank = seasonHasResults(state)
      ? div.findIndex((r) => r.teamId === team.id) + 1
      : 0;
    const roster = state.players.filter(
      (p) => p.teamId === team.id && !p.retired && !p.prospect
    );
    const topPerformers = teamLeaders(state, team.id);
    const lastResults = weekGames(state, Math.max(1, state.week - 1)).filter((g) => g.played);
    return { team, rec, cap, next, bye, injured, onIr, issues, clip, div, divRank, roster, topPerformers, lastResults };
  }, [state]);

  if (!state || !derived) return null;
  const { team, rec, cap, next, bye, injured, onIr, issues, clip, divRank, roster, topPerformers } = derived;
  const cal = calendarView(state);
  const offers = state.tradeOffers ?? [];

  const isOffseason = state.phase.startsWith("offseason");
  const step = OFFSEASON_STEPS[state.phase];
  const isRecap = state.phase === "offseason-recap";
  const recap = isRecap || state.phase.startsWith("offseason")
    ? presentSeasonReview(state)
    : null;
  const userSeasonGames = recap?.userGames ?? [];

  const primaryLabel = (() => {
    if (state.phase === "preseason") return "Start the Season";
    if (state.phase === "regular") return bye ? `Advance Week ${state.week} (Bye)` : `Play Week ${state.week}`;
    if (state.phase === "playoffs") {
      return state.playoffs?.complete ? "Continue to the Offseason" : `Sim ${state.playoffs?.round ?? ""} Round`;
    }
    return step?.action ?? "Continue";
  })();

  const blocking = issues.filter((i) => i.kind !== "underLimit" || state.phase === "preseason");
  const canAdvance = !(state.phase === "preseason" && blocking.length > 0);

  const doAdvance = () => {
    setConfirming(false);
    advance();
  };

  return (
    <div className="space-y-4">
      {/* ---- Action bar ---------------------------------------------------- */}
      <Card padded={false} className="overflow-visible">
        <div className="p-4 flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <TeamMark team={team} size={44} />
            <div className="min-w-0">
              <h1 className="text-lg font-semibold truncate">
                {team.city} {team.name}
              </h1>
              <p className="text-xs text-[var(--color-muted)] tnum">
                {state.season} {PHASE_LABEL[state.phase]}
                {state.phase === "regular" && ` · Week ${state.week} of ${REGULAR_SEASON_WEEKS}`}
                {" · "}
                {recordString(rec)} · {divRank > 0 ? `${divRank}${["st", "nd", "rd", "th"][Math.min(divRank - 1, 3)]} in ${team.division}` : team.division}
                {" · "}
                {cal.label} · {cal.visitsRemaining}/{PRIVATE_VISIT_CAP} visits
              </p>
            </div>
          </div>

          <div className="sm:ml-auto flex items-center gap-2">
            {!canAdvance && (
              <span className="text-xs text-[var(--color-warn)] max-w-[220px]">
                Fix your roster before the season starts.
              </span>
            )}
            {confirming ? (
              <>
                <Button variant="primary" size="lg" onClick={doAdvance}>Confirm</Button>
                <Button variant="ghost" size="lg" onClick={() => setConfirming(false)}>Cancel</Button>
              </>
            ) : (
              <>
                {(state.phase === "regular" || state.phase === "playoffs") && (
                  <div className="relative" ref={simMenuRef}>
                    <Button
                      size="lg"
                      disabled={busy || simming}
                      onClick={() => setSimMenu(!simMenu)}
                    >
                      {simming ? hubSimLabel(state) : "Sim ▾"}
                    </Button>
                    {simMenu && (
                      <div className="absolute right-0 top-full mt-1 z-30 w-60 bg-[var(--color-surface-3)] border border-[var(--color-line)] rounded-lg shadow-xl overflow-hidden">
                        {state.phase === "regular" && state.week < TRADE_DEADLINE_WEEK && (
                          <SimOption
                            label={`To the Trade Deadline (Wk ${TRADE_DEADLINE_WEEK})`}
                            hint="Stops while you can still make moves"
                            onClick={() => runSim("deadline")}
                          />
                        )}
                        {state.phase === "regular" && (
                          <SimOption
                            label="To End of Regular Season"
                            hint="Lands on the seeded playoff field"
                            onClick={() => runSim("seasonEnd")}
                          />
                        )}
                        <SimOption
                          label="Through the Playoffs"
                          hint="Crowns a champion, stops at the offseason"
                          onClick={() => runSim("champion")}
                        />
                      </div>
                    )}
                  </div>
                )}
                <Button
                  variant="primary"
                  size="lg"
                  disabled={busy || simming || !canAdvance}
                  onClick={() => (isOffseason || state.phase === "preseason" ? setConfirming(true) : doAdvance())}
                >
                  {simming ? (simLabel ?? hubSimLabel(state)) : primaryLabel}
                </Button>
              </>
            )}
          </div>
        </div>

        {isOffseason && step && (
          <div className="px-4 pb-4 -mt-1">
            <div className="bg-[var(--color-surface-2)] border border-[var(--color-line-soft)] rounded-lg px-3 py-2.5">
              <div className="text-xs font-medium">{simming && simLabel ? simLabel : step.title}</div>
              <div className="text-xs text-[var(--color-muted)] mt-0.5">
                {hubCampFloorCopy(clip) ?? hubCampCutdownCopy(clip) ?? step.description}
              </div>
              {isRecap && recap && (
                <SeasonReviewSummary state={state} view={recap} />
              )}
              <div className="flex gap-2 mt-2">
                {state.phase === "offseason-tag" && (
                  <span className="text-xs text-[var(--color-muted)]">
                    Tag one name below, or Continue to let the window close.
                  </span>
                )}
                {state.phase === "offseason-final" && (
                  <span className="text-xs text-[var(--color-muted)]">
                    Fifth-year option and tagged-player extension are on the desk below, or Continue.
                  </span>
                )}
                {state.phase === "offseason-fa" && (
                  <Link href="/free-agency"><Button size="sm">Go to Free Agency</Button></Link>
                )}
                {state.phase === "offseason-draft" && (
                  <Link href="/draft"><Button size="sm">Go to the Draft Room</Button></Link>
                )}
                {state.phase === "offseason-final" && (
                  <Link href="/roster"><Button size="sm">Review the Roster</Button></Link>
                )}
                {(state.waivers?.length ?? 0) > 0 && (
                  <Link href="/roster">
                    <Button size="sm" variant="ghost">
                      {state.waivers!.length} on waivers — claim on /roster
                    </Button>
                  </Link>
                )}
              </div>
            </div>
          </div>
        )}
      </Card>
