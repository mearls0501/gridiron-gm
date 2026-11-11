/**
 * Hub, Season Review, and History must print the same division place.
 *
 * The place is the standings order (win pct, head-to-head, division record,
 * conference record, point differential, points for, team id). It is stamped
 * onto the archived season while that season's games are still on the save.
 * After rollover the games are gone, head-to-head reads nothing, and a
 * recompute can flip the place. History and Season Review read the stamp.
 * A row written before the field existed falls back to the recompute.
 *
 * Run: npx tsx lib/view/divisionRank.test.ts
 */
import assert from "node:assert/strict";
import { newGame } from "../core/newGame";
import { advanceOffseason } from "../core/offseason";
import { recordSeasonHistory } from "../core/offseason/progression";
import { advance } from "../core/season/engine";
import { divisionPlaceLabel, divisionRankLabel, divisionStandings } from "../core/season/standings";
import { winPct } from "../core/select";
import { presentFranchiseHistory } from "../core/hallOfFame";
import { defaultSettings, type Game, type GameState, type TeamRecord } from "../core/types";
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

function teamId(st: GameState, abbr: string): number {
  const team = st.teams.find((t) => t.abbr === abbr);
  assert.ok(team, abbr);
  return team.id;
}

function played(
  st: GameState, week: number, home: string, away: string, homeScore: number, awayScore: number,
): Game {
  return {
    id: st.nextGameId++,
    season: st.season,
    week,
    homeId: teamId(st, home),
    awayId: teamId(st, away),
    played: true,
    homeScore,
    awayScore,
    playoffRound: null,
    boxScore: null,
  };
}

function withoutPlace(records: TeamRecord[]): TeamRecord[] {
  return records.map((r) => {
    const copy = { ...r };
    delete copy.divisionPlace;
    return copy;
  });
}

// Boston beat Brooklyn, so head-to-head puts Boston first. Brooklyn's other
// division wins are the better division record, which is the next tiebreak
// once the games — and the head-to-head — are gone.
{
  const st = newGame({ seed: 1 });
  st.phase = "offseason-recap";
  st.games = [
    played(st, 1, "BOS", "BKN", 21, 20),
    played(st, 2, "BUF", "BOS", 24, 10),
    played(st, 3, "HAR", "BOS", 24, 10),
    played(st, 4, "BOS", "CLE", 20, 10),
    played(st, 5, "BOS", "PIT", 20, 10),
    played(st, 6, "BOS", "CIN", 20, 10),
    played(st, 7, "HOU", "BOS", 20, 10),
    played(st, 2, "BKN", "BUF", 24, 10),
    played(st, 3, "BKN", "HAR", 24, 10),
    played(st, 4, "BKN", "DEN", 20, 10),
    played(st, 5, "LV", "BKN", 30, 10),
    played(st, 6, "SD", "BKN", 30, 10),
    played(st, 7, "BKN", "KC", 20, 10),
  ];
  const bos = teamId(st, "BOS");
  const bkn = teamId(st, "BKN");
  const live = divisionRankLabel(st, bos, st.season);
  assert.equal(live, "1st in AFC East");
  assert.equal(divisionRankLabel(st, bkn, st.season), "2nd in AFC East");

  const history = recordSeasonHistory(st);
  st.history.push(history);
  const bosRow = history.standings.find((r) => r.teamId === bos);
  const bknRow = history.standings.find((r) => r.teamId === bkn);
  assert.equal(bosRow?.divisionPlace, 1);
  assert.equal(bknRow?.divisionPlace, 2);
  const byDiv = new Map<string, number[]>();
  for (const row of history.standings) {
    assert.equal(typeof row.divisionPlace, "number");
    assert.ok(row.divisionPlace! >= 1 && row.divisionPlace! <= 4);
    const division = st.teams[row.teamId].division;
    const list = byDiv.get(division) ?? [];
    list.push(row.divisionPlace!);
    byDiv.set(division, list);
  }
  for (const places of byDiv.values()) {
    assert.deepEqual([...places].sort((a, b) => a - b), [1, 2, 3, 4]);
  }

  st.games = [];
  const flipped = divisionRankLabel(st, bos, st.season);
  assert.equal(flipped, "1st in AFC East", "the stamp survives the games being dropped");
  const bare = withoutPlace(history.standings);
  const recomputed = divisionStandings(
    { ...st, history: [{ ...history, standings: bare }] },
    "AFC East",
    st.season,
  );
  assert.equal(recomputed[0].teamId, bkn, "without the stamp, division record puts Brooklyn first");
  assert.notEqual(
    divisionPlaceLabel(1, "AFC East"),
    `${place(recomputed.findIndex((r) => r.teamId === bos) + 1)} in AFC East`,
  );

  assert.equal(presentFranchiseHistory(st).years.find((y) => y.season === st.season)?.finish, live);
  assert.equal(presentSeasonReview(st).userFinish, live);

  const legacy = structuredClone(st);
  for (const row of legacy.history[0].standings) delete row.divisionPlace;
  assert.equal(
    presentFranchiseHistory(legacy).years.find((y) => y.season === st.season)?.finish,
    "2nd in AFC East",
  );
  assert.equal(presentSeasonReview(legacy).userFinish, "2nd in AFC East");
}

const st = newGame({ seed: 42 });
st.settings = defaultSettings();
st.settings.firingEnabled = false;
st.settings.pauseOnStartingQb = false;
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
const archivedRow = st.history.find((h) => h.season === season);
assert.equal(archivedRow?.standings.find((r) => r.teamId === team.id)?.divisionPlace, officialRank);
st.games = st.games.filter((g) => g.season !== season);
const archived = presentFranchiseHistory(st).years.find((y) => y.season === season);
assert.equal(archived?.pending, false);
assert.equal(archived?.finish, label);
assert.equal(presentSeasonReview(st).userFinish, label);
assert.equal(divisionRankLabel(st, st.userTeamId, season), label);

console.log("ok    divisionRank — hub, season review, and history share the standings order");
