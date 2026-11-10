/**
 * Hub, Season Review, and History must print the same division place.
 *
 * The place is `divisionStandings` (win pct, head-to-head, division record,
 * conference record, point differential, points for, team id). A sort that
 * stops at point differential is the off-by-one the two pages disagreed on.
 *
 * Run: npx tsx lib/view/divisionRank.test.ts
 */
import assert from "node:assert/strict";
import { newGame } from "../core/newGame";
import { advanceOffseason } from "../core/offseason";
import { advance } from "../core/season/engine";
import { divisionRankLabel, divisionStandings } from "../core/season/standings";
import { winPct } from "../core/select";
import { presentFranchiseHistory } from "../core/hallOfFame";
import { defaultSettings, type GameState } from "../core/types";
import { presentSeasonReview } from "./seasonReview";
import { runSimTo } from "../store/simTo";

function place(n: number): string {
  return `${n}${["st", "nd", "rd", "th"][Math.min(n - 1, 3)]}`;
}

function pointDiffRank(st: GameState, division: string, season: number): number {
  const rows = divisionStandings(st, division, season).slice().sort(
    (a, b) => winPct(b) - winPct(a) || (b.pf - b.pa) - (a.pf - a.pa),
  );
  return rows.findIndex((r) => r.teamId === st.userTeamId) + 1;
}

const st = newGame({ seed: 42 });
st.settings = defaultSettings();
st.settings.firingEnabled = false;
advance(st);
runSimTo(st, "champion");
assert.equal(st.phase, "offseason-recap");

const team = st.teams[st.userTeamId];
const season = st.season;
const official = divisionStandings(st, team.division, season);
const officialRank = official.findIndex((r) => r.teamId === team.id) + 1;
const label = `${place(officialRank)} in ${team.division}`;
assert.equal(divisionRankLabel(st, team.id, season), label);
assert.notEqual(
  pointDiffRank(st, team.division, season),
  officialRank,
  "seed 42's first season is a tie point differential gets wrong",
);

assert.equal(presentSeasonReview(st).userFinish, label);
const pending = presentFranchiseHistory(st).years.find((y) => y.season === season);
assert.equal(pending?.pending, true);
assert.equal(pending?.finish, label);

advanceOffseason(st);
st.games = st.games.filter((g) => g.season !== season);
const archivedLabel = divisionRankLabel(st, st.userTeamId, season);
const archived = presentFranchiseHistory(st).years.find((y) => y.season === season);
assert.equal(archived?.pending, false);
assert.equal(archivedLabel, label);
assert.equal(archived?.finish, label);
assert.equal(presentSeasonReview(st).userFinish, label);

console.log("ok    divisionRank — hub, season review, and history share the standings order");
