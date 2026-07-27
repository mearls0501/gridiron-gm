/**
 * Randomized seed sweep. The fixed-seed harness passed while random browser
 * seeds still failed, so correctness has to be checked across many leagues.
 */
import { newGame } from "../lib/core/newGame";
import { advance } from "../lib/core/season/engine";
import { advanceOffseason, isOffseason } from "../lib/core/offseason";
import { teamCap, rosterCount } from "../lib/core/select";
import { ROSTER_LIMIT } from "../lib/core/types";

const N = Number(process.argv[2] ?? 30);
const SEASONS = Number(process.argv[3] ?? 2);
let bad = 0;

for (let i = 0; i < N; i++) {
  const seed = 100000 + i * 7919;
  let st;
  try { st = newGame({ seed }); }
  catch (e) { console.log(`seed ${seed}: newGame THREW ${(e as Error).message}`); bad++; continue; }

  const overAtStart = st.teams.filter((t) => teamCap(st, t.id).space < 0).length;
  const badRosters = st.teams.filter((t) => rosterCount(st, t.id) !== ROSTER_LIMIT).length;
  if (overAtStart || badRosters) {
    console.log(`seed ${seed}: START over-cap=${overAtStart} bad-rosters=${badRosters}`);
    bad++;
  }

  try {
    for (let s = 0; s < SEASONS; s++) {
      advance(st);
      let g = 0; while (st.phase === "regular" && g++ < 40) advance(st);
      g = 0; while (st.phase === "playoffs" && g++ < 12) advance(st);
      g = 0; while (isOffseason(st.phase) && g++ < 12) advanceOffseason(st);
      if (st.phase !== "preseason") { console.log(`seed ${seed}: stuck in ${st.phase}`); bad++; break; }
      const over = st.teams.filter((t) => teamCap(st, t.id).space < 0).length;
      const rost = st.teams.filter((t) => rosterCount(st, t.id) !== ROSTER_LIMIT).length;
      if (over || rost) { console.log(`seed ${seed} season ${st.season}: over-cap=${over} bad-rosters=${rost}`); bad++; }
    }
  } catch (e) {
    console.log(`seed ${seed}: THREW ${(e as Error).message}`);
    bad++;
  }
}
console.log(`\n${N} leagues x ${SEASONS} seasons — ${bad === 0 ? "ALL CLEAN" : bad + " PROBLEM SEEDS"}`);
process.exit(bad === 0 ? 0 : 1);
