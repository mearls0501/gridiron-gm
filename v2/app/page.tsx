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
