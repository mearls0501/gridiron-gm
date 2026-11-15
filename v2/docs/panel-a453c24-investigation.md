# Panel a453c24 — the trim fingerprint, four minimum rewrites, and coherence seed 1

Read-only. No sim change, no test change, no `scripts/` edit, no `baselines.json` edit, no re-lock, no dial. Nothing here is signed. Matt signs any fix.

The sections from "0. The four problems" through Appendix C are the 2026-11-12 panel at `a453c24` and the 2026-11-14 addendum at `61b3a70`. They are not a description of current main. Current main is the next section.

Head under test for those sections: main `a453c24` (#222). Studio `gate:full:serial`, 5 seeds, 2026-11-11, **GATE FAIL, 4 problems**. Comparison panel: `ddc62bd`.

## Status on main `5b922ec`, 2026-11-15

Checked against `origin/main` `5b922ec` (#251). Docs only. No re-lock. The calibration freeze stands.

### The lock

`lib/core/trimIdentity.test.ts` on that commit locks **1443** cuts and rng **1785272726** (`CUTS` is 1443 ids; `RNG_AFTER` is 1785272726). `docs/HANDOFF.md` records the same pair for #251. The count is the length of `CUTS`, not a new measurement.

The test file's header lists every literal since the #218 hoist. The hoist lock was 1506 / 2450416366 and is not a re-lock. After it, the literal was re-locked **13** times. Each of these 13 values is a commit on `main`, and each commit's `RNG_AFTER` is a different number:

| | commit | cuts | rng | read on the Studio |
|---|---|---:|---:|---|
| hoist, #218 | `f69ecea` | 1506 | 2450416366 | no |
| 1, #222 | `a453c24` | 1587 | 19218870 | yes: the panel in section 1 read **1564** |
| 2, #229 | `9e74d34` | 1600 | 2524091302 | no |
| 3, #235 | `8ac573b` | 1606 | 2799512845 | no |
| 4, #238 | `00aa818` | 1551 | 2367991772 | no |
| 5, #241 | `ab90614` | 1568 | 457073510 | no |
| 6, #243 | `995fd2a` | 1601 | 3915903688 | no |
| 7, #244 | `7aec8c0` | 1545 | 2793437930 | no |
| 8, #245 | `21d51e9` | 1555 | 3609848918 | no |
| 9, #246 | `61b3a70` | 1530 | 3780634271 | no |
| 10, #247 | `df6e8c1` | 1584 | 93739137 | no |
| 11, #249 | `ed69556` | 1400 | 571563341 | no |
| 12, #250 | `3929425` | 1532 | 1008900677 | no |
| 13, #251 | `5b922ec` | 1443 | 1785272726 | no |

"About 12" is 13. The Studio has run this test once, on the `a453c24` panel, and that reading disagreed with the lock then in force. The current literal, and the 12 re-locks after #222, have not been read on the Studio.

The re-lock commits do not name a Node version. They say "this VM". The runs in this note that name one, and #248's report, name Node 22.23.4. This refresh was run on Node 22.23.4 (below). One scratchpad probe in `docs/proposal-studio-panel-and-camp-nudge-2026-11-11.md` names Node 22.22.0; that probe did not re-lock. There is no `.nvmrc`, no `.node-version`, and no `engines` field in `package.json` or `v2/package.json`. Nothing in the repo pins Node.

### What this VM read

Linux x64, 4 cores. Worktree of `5b922ec`, `v2/`. No source, baseline, or lock was edited.

- Node **v22.23.4**, V8 12.4.254.21-node.57, ICU 78.3. `npx tsc --noEmit` exited 0.
- `npm test` on that same Node exited 0 (20:09:34Z–20:43:33Z). The trim line was `ok    trim identity — seed 42 opens 2030, 1443 cuts, rng 1785272726`.
- Node **v24.22.1**, V8 13.6.233.17-node.58, ICU 78.3, same machine, same commit. `trimIdentity.test.ts` exited 1: `cut count 1423` against 1443. The assertion stops at the count, so that run did not read the rng. Wall time 2m 40s (19:38:00Z–19:40:40Z), with `npm test` also running.
- The check-3 script, same commit, `GG_CAMP_NUDGE` and `GG_SEED` unset. Node 22.23.4, 2m 30s: `cuts 1443`, and `rng=1785272726` on the `2030 preseason` line. The id list equalled `CUTS`. Node 24.22.1, 2m 24s: `cuts 1423`, `rng=3000811523` on that line. The two traces matched through step 26 (`2026 offseason-draft`, rng 2871135022). Step 27 (`2026 offseason-final`) still had rng 3648421777 on both, and the roster did not: Node 22 had rostered 2424, ovrSum 153255, salSum 12072774426, log 1894, cutRows 84; Node 24 had rostered 2422, ovrSum 153164, salSum 12070639426, log 1897, cutRows 86. The parent rng had not moved to a different value at the end of the first step whose roster differed.

`Math.pow` is not the same build on those two Nodes. The probe in check 2, 200,000 values, on this VM:

| | Node 22.23.4 | Node 24.22.1 |
|---|---|---|
| pow / `**` | `d029b384abaa89d69799538968ba17a5` | `444c7b55d5286c8b394fa0f71da211b8` |
| exp | `a6fcbb2a8e64049e8af24be6862cfaab` | same |
| log | `a081b19d2ac5974f7e4a7ee7b575eb3e` | same |
| cos | `757e3100ca2f75917fb3cd9aaa940bdb` | same |
| sqrt | `00082db8f9ef2ef6354fadf094c848cb` | same |
| localeCompare | Davis \| Davis II \| Davis Jr. \| de la Cruz \| Delacruz \| O'Neil \| Oneil \| Smith \| Smith-Jones \| St. James \| Stjames | same |

`sqrt` matching is the copy check. `pow` differing is a real last-bit change on one machine. It is not, by itself, the cut list.

### The four bargains, and Baltimore at 69

#235 merged as `8ac573b`. On `5b922ec`, `coverAfterCarryover` (`lib/core/offseason/contracts.ts` 2436) still restructures first (`applyRestructure` / `applyVoidYears`, lines 2446–2468) and keeps `rewriteToMinimum` as the last resort (2478–2498).

The ten-season reading that the bargains were gone is the addendum below, at `61b3a70`: `verify.ts 10`, seed 20260727, **1062/1063**, no minimum-rewrite bargain, and Baltimore, a CPU club, opening 2033 with **69** active. That run has not been repeated at `5b922ec`. #247, #249, #250 and #251 landed after it and changed cap and carryover behaviour. This note does not claim the ten-season book is clean on current main.

The 69-man mechanism is still in the code at `5b922ec`. `spendToFloor` (2004) builds its candidate list from every body on the club (`teamId`, not retired, not a prospect; lines 2018–2020). It does not require an active player. `spendLegalCpuBackToFloor` (2076) calls it after the roll. Draft #248 (`claude/spend-to-floor-active-only`, head `76f4f1e`, base `61b3a70`) is the proposed filter. It is still a draft. It is not on main.

### Decisions still needing Matt's sign-off

1. **Coherence seed 1, 82.07.** Section 3. 119 of 145 at `a453c24`. The note recommends accepting it as noise, the same call as seed 2. Not signed. Not re-measured on `5b922ec`.
2. **The $0.9M bargain class.** Treat it as fixed by #235's restructure-first cover, or not. The evidence is one ten-season VM run at `61b3a70` with no bargain. There is no Studio panel of that cover, and no ten-season run at `5b922ec`. The same `61b3a70` run is where Baltimore opened at 69. Signing "fixed" does not sign #248.
3. **A Node pin.** Proposal only, in the section below. Not applied. Not a re-lock.

### Three read-only Studio checks

Run these on the Mac Studio, from a detached worktree of `origin/main`, not from the everyday checkout. They replace the three commands in the old proposal, which point at `~/Projects/gg-a453c24-panel` and at Appendix B. Do not run those.

Run the blocks with bash. They do not run the gate, `verify`, or `gate:lock`. They do not write a tracked file or `baselines.json`. Logs and the two scripts go under `~/Projects/gg-panels/`, which is outside the clone. The clone path is the one already written in `docs/proposal-studio-panel-and-camp-nudge-2026-11-11.md`. If the clone is somewhere else, set `REPO` to it.

#### Setup

```bash
REPO=~/Projects/gridiron-gm
cd "$REPO"
git fetch origin
SHA=$(git rev-parse origin/main)
WT=~/Projects/gg-trim-$SHA
LOG=~/Projects/gg-panels/trim-$SHA
mkdir -p "$LOG"
git worktree add --detach "$WT" "$SHA"
```

If `git worktree add` reports that `$WT` already exists, use it only when `git -C "$WT" rev-parse HEAD` prints `$SHA` and `git -C "$WT" status --short` prints nothing. Otherwise pick a new path.

#### Check 1 — which tree, which Node

Runtime: a few seconds, plus `git fetch`. No sim.

```bash
cd "$WT"
{
  echo "sha=$(git rev-parse HEAD)"
  echo "status:"
  git status --short
  echo "node=$(node -v)"
  echo "v8=$(node -p process.versions.v8)"
  echo "icu=$(node -p process.versions.icu)"
  echo "platform=$(node -p process.platform)/$(node -p process.arch)"
  echo "cores=$(sysctl -n hw.ncpu)"
  echo "uname=$(uname -mrs)"
} | tee "$LOG/identity.txt"
```

Capture `$LOG/identity.txt`.

How to read it. `status:` must be empty. A dirty worktree is not a reading. Record the full `sha`. `5b922ec` was main when this section was written; a later main is the right tree, and the lock in `v2/lib/core/trimIdentity.test.ts` on that sha is the number to compare in check 3. Record `node`, `v8`, `icu`, and `platform`. The commit does not record a Node version. The comparison machine for this section is Linux x64, Node 22.23.4, V8 12.4.254.21-node.57, ICU 78.3, which is where the Node 22 trace above was read. A different Node major is the first fact to put next to a different cut count. This check does not say whether the sim agrees.

#### Dependencies, once

Checks 2 and 3 need `tsx`. If `$WT/v2/node_modules/.bin/tsx` is missing:

```bash
(cd "$WT/v2" && npm ci)
git -C "$WT" status --short
```

`npm ci` writes gitignored `node_modules` only. The status command must still print nothing. Do not commit. This is not one of the three checks.

#### Check 2 — math last bits

Runtime: under a second on this VM (200,000 values).

The script is written outside the repo.

```bash
cat > "$LOG/mathprobe.js" << 'EOF'
const crypto = require("crypto");
let s = 12345;
const r = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
const fns = { pow: (x, y) => Math.pow(x, y), starstar: (x, y) => x ** y, exp: (x, y) => Math.exp(-y * 3), log: (x) => Math.log(x), cos: (x) => Math.cos(x), sqrt: (x) => Math.sqrt(x) };
const h = Object.fromEntries(Object.keys(fns).map((k) => [k, crypto.createHash("md5")]));
const b = Buffer.alloc(8);
for (let i = 0; i < 200000; i++) {
  const x = 0.01 + r() * 120, y = 0.1 + r() * 3;
  for (const k in fns) { b.writeDoubleBE(fns[k](x, y)); h[k].update(b); }
}
console.log(`node ${process.version} v8 ${process.versions.v8} ${process.platform}/${process.arch} icu ${process.versions.icu}`);
for (const k in h) console.log(k.padEnd(9), h[k].digest("hex"));
console.log("localeCompare", ["O'Neil", "Oneil", "St. James", "Stjames", "Davis II", "Davis", "Davis Jr.", "de la Cruz", "Delacruz", "Smith-Jones", "Smith"].sort((a, c) => a.localeCompare(c)).join(" | "));
EOF
node "$LOG/mathprobe.js" | tee "$LOG/mathprobe.txt"
```

Capture `$LOG/mathprobe.txt`.

How to read it.

- `sqrt` must be `00082db8f9ef2ef6354fadf094c848cb`. If it is not, the script was copied wrong. Stop.
- Compare the other five hashes and the `localeCompare` line with the table above.
- `pow` equal to the Node 22.23.4 hash means this Node's `Math.pow` matches that build on these inputs. `pow` equal to the Node 24.22.1 hash means it matches the other build. On this Linux box those two hashes differ. The cut counts those two Nodes actually produced are the `trimIdentity` lines above, not this table.
- `exp`, `log`, `cos`, and `localeCompare` matched across those two Nodes here. A Studio line that differs on one of those is a new split, not the one measured here.
- This probe does not run the season. A matching `pow` does not prove the cut list matches.

#### Check 3 — the seed-42 walk to the 2030 cut

Runtime: one core, a few minutes. The same walk as `trimIdentity.test.ts`. On this 4-core VM, with the two Nodes running together and `npm test` also running, the script took 2m 30s on Node 22.23.4 and 2m 24s on Node 24.22.1. The `a453c24` test on a quieter run printed in 3m 41s.

This is not a panel and not the gate. `GG_CAMP_NUDGE` and `GG_SEED` are unset. The script lives under `$LOG`, with absolute imports, so nothing is written into the worktree. Stdout goes to `$LOG`.

```bash
cat > "$LOG/trimTrace.ts" << EOF
import { newGame } from "$WT/v2/lib/core/newGame";
import { advance } from "$WT/v2/lib/core/season/engine";
import { advanceOffseason, isOffseason } from "$WT/v2/lib/core/offseason";
import { preseasonWeeksLeft } from "$WT/v2/lib/core/preseason";
import type { GameState } from "$WT/v2/lib/core/types";

const TARGET = 2030;

function fp(st: GameState): string {
  let rostered = 0, ovr = 0, cap = 0, cuts = 0;
  for (const p of st.players) {
    if (p.teamId !== null && !p.prospect && !p.retired) {
      rostered++; ovr += p.ovr;
      cap += p.contract ? (p.contract.baseSalary[0] ?? 0) + p.contract.signingBonus : 0;
    }
  }
  for (const e of st.log) if (e.cut) cuts++;
  return \`rng=\${st.rngState} players=\${st.players.length} rostered=\${rostered} ovrSum=\${ovr} salSum=\${cap} log=\${st.log.length} cutRows=\${cuts}\`;
}
let step = 0;
function mark(st: GameState, what: string): void {
  console.log(\`\${String(step++).padStart(4)} \${st.season} \${st.phase.padEnd(18)} wk=\${String(st.week ?? "").padEnd(3)} \${what.padEnd(10)} \${fp(st)}\`);
}

console.log(\`node \${process.version} v8 \${process.versions.v8} \${process.platform}/\${process.arch} GG_CAMP_NUDGE=\${process.env.GG_CAMP_NUDGE ?? ""} GG_SEED=\${process.env.GG_SEED ?? ""}\`);
const st = newGame({ seed: 42 });
mark(st, "newGame");
advance(st); mark(st, "advance");
outer: while (true) {
  let g = 0;
  while (st.phase === "regular" && g++ < 40) { advance(st); mark(st, "advance"); }
  let p = 0;
  while (st.phase !== "offseason-recap" && p++ < 12) { advance(st); mark(st, "advance"); }
  let o = 0;
  while (isOffseason(st.phase) && o++ < 20) {
    const weeks = st.phase === "offseason-final" ? preseasonWeeksLeft(st) : -1;
    if (st.phase === "offseason-final" && weeks === 0 && st.season + 1 === TARGET) break outer;
    advanceOffseason(st); mark(st, "offseason");
  }
  if (st.phase !== "preseason") throw new Error(\`stuck in \${st.season} \${st.phase}\`);
  advance(st); mark(st, "advance");
}
const before = new Set(st.log);
advanceOffseason(st); mark(st, "CUTDOWN");
const cuts = st.log.flatMap((e) => (e.cut && typeof e.playerId === "number" && !before.has(e) ? [e.playerId] : []));
console.log(\`cuts \${cuts.length}\`);
console.log(cuts.join(","));
EOF
env -u GG_CAMP_NUDGE -u GG_SEED "$WT/v2/node_modules/.bin/tsx" "$LOG/trimTrace.ts" > "$LOG/trim-trace.txt"
git -C "$WT" status --short
tail -n 5 "$LOG/trim-trace.txt"
```

The `git status` line must print nothing. If it prints `trimTrace.ts` or `trim-trace.txt`, the redirect or the script path was inside the worktree. Delete that file and do not commit it.

Capture the whole `$LOG/trim-trace.txt`. The header line, the `2030 preseason` line, and the `cuts N` line are the three that decide the result. The comma-separated ids are the cut list.

How to read it.

- The header must show an empty `GG_CAMP_NUDGE` and an empty `GG_SEED`. If either is set, the walk is not the test's walk. Re-run the command as written.
- On `5b922ec` the locked endpoint is **1443** cuts and rng **1785272726**. That is `cuts 1443`, and `rng=1785272726` on the `2030 preseason` line. This VM's Node 22.23.4 trace printed that pair, and its id list equalled `CUTS`.
- If the Studio prints that pair, this machine matches the lock through the opening-2030 cut. Stop. Do not re-lock.
- `cuts 1423` and `rng=3000811523` is what Node 24.22.1 printed on this Linux x64 VM, from the same script. That is the Node-major split measured here. It is not a Studio reading, and it is not a reason to re-lock.
- Anything else: do not edit the test. Compare fingerprint lines, not only `rng=`. On this VM the two Nodes matched through step 26 and differed at step 27 with the **same** rng (3648421777) and a different roster, as written above. A Studio file that parts at a different step is a different split. Appendix B is `a453c24`. Appendix C is `61b3a70`. Neither is the reference for this commit.

### Proposal: pin the Node version

Not applied. No file in this PR adds the pin.

The lock and the agent VMs that name a version are on Node 22.23.4. Check 2 shows Node 24.22.1's `Math.pow` does not hash to the same value, on the same Linux x64 machine. A pin makes that visible before the next re-lock. It does not make two Node majors agree.

Proposed, and only if Matt signs it:

- `v2/.nvmrc` containing `22.23.4`.
- `v2/package.json` `"engines": { "node": "22.23.4" }`. npm warns on a mismatch. It does not refuse one unless `engine-strict` is set. Leave `engine-strict` off unless Matt wants the install to fail.
- Nothing at the repo root. The app and the test script are under `v2/`.

Do not re-lock `trimIdentity` in the same change. The pin is a record of the Node the current literal was measured on.

The Studio log `gate-full-5seed.log` was not in this workspace. Everything below is the panel summary, the code, and replays on a 4-core Linux VM (x64, Node 22.23.4) from a scratch copy of `a453c24`. Where the VM did not replay a Studio line, that is said.

## 0. The four problems

The summary names three failures and the gate counted four. `scripts/gate.ts` pushes one line per failing step exit (line 427) and one per metric outside its lock (lines 404–411). `verify` fails twice: once on its exit code and once on `verify.failures` against `max: 0`. So the four should be:

```
FAIL  trimidentity  exited 1
FAIL  verify  exited 1
FAIL  verify.failures  4  expected <= 0
FAIL  coherence  exited 1
```

Line numbers for `lib/` and `scripts/` in this note are from `a453c24`. Those for `docs/HANDOFF.md` are from main `933bfc6`.

That list is read from the gate code, not from the log. Confirm against the last lines of `gate-full-5seed.log`.

## 1. `trimIdentity`: 1564 on the Studio, 1587 locked

### What is settled

- **The lock is right for the code.** The #222 lock head is `0200ceb` ("Re-lock the seed-42 offer and cutdown fingerprints"). Its tree and `a453c24`'s tree are the same object, `50c8c19`. There is no code delta between the lock and the merge.
- **This VM reproduces the lock at `a453c24`.** `npx tsx lib/core/trimIdentity.test.ts` printed `ok trim identity — seed 42 opens 2030, 1587 cuts, rng 19218870` (3 m 41 s).
- **The entry point is the same.** The gate step is that same command (`scripts/gate.ts` 123 and 211). The gate adds `GG_SEED` to the child's environment (line 295). Nothing on this walk reads it: the only reader is `scripts/metrics.ts` 67, and the test imports only `newGame`, `advance`, `advanceOffseason` and `preseasonWeeksLeft`.
- **"1564 on every seed" is one league, five times.** The test is hard-wired to seed 42. Five identical readings say the Studio is deterministic with itself. They say nothing more.
- **Not the camp nudge.** `GG_CAMP_NUDGE=1` at `a453c24` gives **1653** cuts, not 1564. `WAIVER_TIME` only prints timings.
- **Year 0 agrees across the two machines.** The Studio held the seed-42 `userOffers` pair (tag 1779302491, FA 1323223106). Those are the `rngState` at this walk's first `offseason-tag` and `offseason-fa`. Coherence never plays an offseason. Here it reproduces the Studio's seed-1 82.07 and its panel mean 88.12 at `a453c24`, and all five of the Studio's `ddc62bd` readings at `b5c2a21` (section 3).

So the Studio and the VM play seed 42 identically through the first season and the first free agency, and are in different leagues by the opening-2030 cut. The lock was measured on an agent VM: `0200ceb` is a Cursor agent commit, and the Linux VM used here reproduces it. The Studio is the first other machine to run this test: `trimIdentity.test.ts` arrived in #218 on 2026-11-05, and the last Studio panel on `main` before this one was `ddc62bd` on 2026-10-27.

### This is not new

The same split, same commit and same seed, is already written down three times for `verify` seed `20260727`:

- `docs/panel-cf73d64-investigation.md` 78: matches the Studio through 2027, then diverges.
- `docs/panel-65e1284-investigation.md` 62: matches through 2028, then diverges.
- `docs/panel-a76092b-investigation.md` 7, 46, 123: the 52% club and all four bargain names did not replay.

It happened again on this panel (section 2). Each note treated it as a property of "this VM" and moved on. Nobody has root-caused it. `determinism` passes on both machines because it replays a seed against itself on one machine. It has never compared two machines.

### What is not settled

**The first differing cut.** The test asserts the count before it compares any id (`trimIdentity.test.ts` 158), so the Studio log holds `cut count 1564` and no list. The Studio's cuts are not in this workspace.

**The cause.** I do not have it. What I ruled in or out here:

- Node 22.23.4's `Math.pow`, `Math.exp` and `Math.log` are V8's own code, not the system math library. On 200,000 fixed inputs they differ from glibc on 9.9%, 9.8% and 3.1%. So "macOS libm against glibc" is not the mechanism. A different Node major, or an arm64 build that fuses multiply-adds inside those routines, could still move a last bit. `lib/core` has 25 `Math.pow` call sites outside tests, three `Math.exp`, and one `Math.log` with a `Math.cos` (`scouting.ts` 70). A last-bit change can only matter where a value is rounded, floored, or compared for a tie.
- `localeCompare` is in `hallOfFame.ts` (273, 330, 579) and one draft-board UI sort (`offseason/draft.ts` 935). It depends on the ICU build.
- I tried to run an arm64 Node under emulation on this VM. The session's permission check refused to execute a downloaded binary, so that test was not run. A different x64 Node major was not tried for the same reason.
- The Studio worktree could be dirty or on a different Node. I cannot see it.

### Consequence for #229

#229 moved the lock to **1600 / 2524091302**, measured the same way, on a VM. That sentence described main on the day it was written. The literal has been re-locked since. The current lock and the Studio commands are in the 2026-11-15 section. Do not treat 1600 as the current literal.

### Proposed — UNSIGNED

1. **Do not re-lock.** A Studio-measured literal would turn the test red on every agent VM, which is where it runs after each edit. A VM-measured literal is red on the Studio. Until the split is explained, this canary can only be green on one kind of machine.
2. **Three read-only commands on the Studio**, none of them a panel. The commands originally written here pointed at `~/Projects/gg-a453c24-panel` and at Appendix B. Do not run those. The commands for a worktree of current main are in the 2026-11-15 section. Appendix A is the historical probe text; the 2026-11-15 check 2 is the same probe, written outside the repo.
3. **Then one decision**, with that step in hand: fix the machine-dependent operation so one literal holds everywhere, or sign the canary as a per-machine check.

I would not accept this one as noise. It is deterministic on each machine. It also means a save file from an Apple Silicon browser may not replay on an x64 one after the first offseason, which is what invariant 1 is for.

## 2. Four $0.9M bargains

### What the check sees

`verify` ignores `GG_SEED`. All five panel entries are one league, seed `20260727`, ten seasons (`scripts/gate.ts` 229, `scripts/verify.ts` 641). `verify.failures` 4 is four failed checks in that one league, printed five times. The check runs once per offseason and prints one name with a count (`verify.ts` 481–486). So the four names are four different offseasons, and a line can say "2 bargains" and still name one.

`$0.9M` is the cap hit of a one-year `LEAGUE_MINIMUM` deal. `signMinimum` refuses anyone over 66 overall (`USER_FILL_OVR`, `contracts.ts` 1740). The only writer that puts that deal on a better player is `rewriteToMinimum` (`lib/core/offseason/contracts.ts` 2291–2298), reached from `coverAfterCarryover` (2323–2362) or from the cutdown hatch `rewriteLargestHits` (2301–2309).

### Replay on this VM

The four Studio names (Ingersoll II, Moore II, Rodriguez, Grimaldi) did not replay. This is the split from section 1. The VM's ten-season run at `a453c24` is **1061/1063**:

| Bracket | Check | Detail |
|---|---|---|
| 2031 | bargain | Columbus (CPU), Andres Montoya, QB, 72, age 28. Asked $21.3M, hit $0.90M, 1 year. Log, 2032 week 0: "CMB restructured Andres Montoya (QB) to the league minimum — forced by the cap, was $28.8M after carryover" |
| 2032 | healthy starters play a full season | 55 of 442 started fewer than 12 games. 12.4% against a ceiling of 12% (`verify.ts` 437) |

The second row is not a bargain and is not on the Studio summary. It is one season, 0.4 points over, on a league the Studio did not play. I did not chase it. Check whether the Studio log has that line.

VM champions at `a453c24`, for finding the year the Studio log parts from it: 2026 Philadelphia, 2027 Memphis, 2028 Kansas City, 2029 New Orleans, 2030 Jacksonville, 2031 Atlanta, 2032 Hartford, 2033 Brooklyn, 2034 Columbus, 2035 Chicago.

### Same root cause as Sanchez

Yes, on the evidence available. Sanchez was "PHI, Quinn Sanchez, DT, 77, $11.1M ask, was $4.0M, after carryover" (`docs/panel-a76092b-investigation.md` 127). Montoya is the same writer, the same log suffix, and the same shape: a CPU club whose book went negative when the new carryover replaced the old one. The Studio's four are the same check failing with the same $0.9M hit, and that hit has one writer. Their asks, clubs and weeks are in the Studio log and not here, so I have not traced them one by one.

Sanchez himself is gone from this league. The VM run at `a453c24` has no failed check through the 2030 bracket, which is the 552/552 that `docs/HANDOFF.md` 30 records for `verify.ts 5`.

### Which merge exposed them

- **#222** touches `sim/game.ts` and two tests under `lib/`. Nothing in `offseason/`. It changes every game from week 1, so every later book is a different book. It chose which four players, not whether there are four.
- **#223** is the archived division place (`progression.ts`, `standings.ts`, and `hallOfFame.ts` reading it) and the Hub sim stop (`lib/store`). **#225** is `hallOfFame.ts`. **#226** is `scripts/determinism.ts`. None reaches a contract.
- The class comes from **#214** (`f96e356`). The last panel on that branch, `a76092b`, also read four (Allen, Thigpen, Everhart, Quarles). #214 merged on 2026-11-05 and `main` was not panelled again until this run. `ddc62bd` reads zero because it predates #214.

So against `ddc62bd` these are new. Against the last #214 panel the count is the same four, with new names.

The VM shows the same thing on one machine. `b5c2a21` is main one commit before #222. Its ten-season run is **1059/1063**: four failed bargain checks, five players, every one "after carryover".

| Bracket | `b5c2a21`, this VM | Ask | Was |
|---|---|---:|---:|
| 2030 | PHI, Quinn Sanchez, DT, 77 | $11.1M | $4.0M |
| 2032 | PHI, Cam Rutledge, TE, 81 | $17.5M | $24.9M |
| 2032 | KC, Mateo Okafor, OT, 69 | $6.7M | $9.4M |
| 2033 | TB, Silas Baker, S, 91 | $33.0M | $30.8M |
| 2035 | BUF, Aaron Whitlock, CB, 68 | $5.8M | $5.4M |

Those are the five names the `a76092b` replay printed. So on this machine main already failed this check four times in ten seasons before #222, and #222 moved it to one. The five-season `verify` only ever showed Sanchez because the other four come in seasons seven to ten.

### Proposed — UNSIGNED

Do not edit the bargain check. The two shapes in `docs/panel-a76092b-investigation.md` 139–144 still stand and neither is signed: stop the rewrite and live with a short roster, or spend back up after a rewrite. Nothing on this panel adds a third.

If Matt's acceptance of Sanchez was acceptance of the post-carryover rewrite as a class, these four are that class and can be accepted the same way. If it was acceptance of one deal, then this is the second panel in a row to read four, and the hatch is routine, not rare. That is Matt's call. I would not call it noise. It is a signed mechanism, and it fired in four of ten offseasons on the Studio on two panels running.

Before either, paste the four `FAIL  no free agent signed…` lines and the four matching "restructured … after carryover" log rows from the Studio. If any of the four lacks the "after carryover" suffix, it is the cutdown hatch instead, and that would be new.

## 3. Coherence seed 1 at 82.07

### It reproduces

`GG_SEED=1 npx tsx scripts/coherence.ts 5` at `a453c24` on this VM: `##M coherence.outlierExplainedPct 82.06896551724138`, exit 1. That is 119 of 145. The floor needs 124.

All five seeds, both commits, this VM. `b5c2a21` is the parent of `a453c24`. Its numbers equal the Studio's `ddc62bd` row to the digit, and the `a453c24` mean equals the Studio's 88.12.

| | seed 1 | seed 2 | seed 3 | seed 4 | seed 5 | mean |
|---|---:|---:|---:|---:|---:|---:|
| `b5c2a21` (before #222) | 89.61 | 83.67 | 85.71 | 86.43 | 92.81 | 87.65 |
| `a453c24` | **82.07** | 86.67 | 90.51 | 94.03 | 87.34 | 88.12 |

Four seeds are inside. Three went up and two went down. The mean rose 0.47.

By kind, games and share explained:

| | receiving 200+ | rushing 150+ | passing 400+ |
|---|---|---|---|
| seed 1, before | 16, 100% | 82, 90% | 56, 86% |
| seed 1, after | 19, 100% | 75, 76% | 51, 84% |
| all five, before | 76, 100% | 448, 86% | 203, 86% |
| all five, after | 79, 100% | 441, 85% | 189, 89% |

Pooled over the panel, rushing moved one point and passing went up three. Seed 1's rushing fell 14 points on 75 games while seed 4's rose 10 on 89.

### The outlier games

Seed 1 has 26 unexplained games: 18 rushing and 8 passing.

Rushing. Fourteen of the 18 are a 66–73 back on 30 or more team carries, against a front that is not 2.5 points under the league mean. That is volume with no talent label, the shape the seed-2 note already described. Two are a talent label alone: Prescott (RB 74, 213 on 27, 28 team carries) and Hernandez (RB 79, 163 on 24, 28 team carries), each two carries short of "high volume". Two have nothing: Davis II (RB 71, 179 on 15) and Nguyen (RB 70, 173 on 17). The biggest line, Brown (RB 73), 252 on 33 with 47 team carries while leading, is a 73 against an average front.

Passing. Five are a 64–69 quarterback on 44–56 attempts against a 72–79 secondary. Three are a talent label alone: Jennings (weak secondary, 41 attempts, one short), Hawthorne and Flores (elite QB on 40 and 31 attempts).

Nothing in the 26 is a broken box score. No line is out of range for its carries or attempts.

### Could #222 have caused it

#222 changes who is targeted and who is credited with a tackle. The rushing labels read the back's overall against the league, the opposing front's rating, team carries, the margin and the weather (`scripts/coherence.ts` 130–139). None reads a target or a tackle. The tackle coin is a side stream. What #222 did to seed 1 is what #205 did to seed 2: it changed the play stream, so the five leagues are a different sample.

### The guard

Three panels in a row have one seed under 85, and a different seed each time: seed 4 at 82.0 on `89bca4d`, seed 2 at 83.7 on `ddc62bd`, seed 1 at 82.07 here. The ten readings in the first table run 82.07 to 94.03, with a standard deviation near 3.8 around a mean near 88. At that spread about one reading in five lands under 85, so a five-seed panel with a per-seed floor fails more often than it passes on unchanged behaviour. This is the case `AGENTS.md` describes under "When a guard is the thing that is wrong".

### Proposed — UNSIGNED

Accept seed 1 as noise, the same call as seed 2.

Separately, and only if Matt wants this to stop recurring: grade `coherence.outlierExplainedPct` at the panel mean and leave the per-seed number reported, which is what #204 signed for `staff.leagueOvrDelta`. The mean has been 87.1, 87.65 and 88.12 on the last three panels against the same 85. That is a `scripts/` change and a lead decision. I am not proposing a different floor.

## Appendix A — the two probes

Neither file is in the repo. Both are read-only and write nothing but stdout.

`mathprobe.js`, run with `node mathprobe.js` from anywhere:

```js
const crypto = require("crypto");
let s = 12345;
const r = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
const fns = { pow: (x, y) => Math.pow(x, y), starstar: (x, y) => x ** y, exp: (x, y) => Math.exp(-y * 3), log: (x) => Math.log(x), cos: (x) => Math.cos(x), sqrt: (x) => Math.sqrt(x) };
const h = Object.fromEntries(Object.keys(fns).map((k) => [k, crypto.createHash("md5")]));
const b = Buffer.alloc(8);
for (let i = 0; i < 200000; i++) {
  const x = 0.01 + r() * 120, y = 0.1 + r() * 3;
  for (const k in fns) { b.writeDoubleBE(fns[k](x, y)); h[k].update(b); }
}
console.log(`node ${process.version} v8 ${process.versions.v8} ${process.platform}/${process.arch} icu ${process.versions.icu}`);
for (const k in h) console.log(k.padEnd(9), h[k].digest("hex"));
console.log("localeCompare", ["O'Neil", "Oneil", "St. James", "Stjames", "Davis II", "Davis", "Davis Jr.", "de la Cruz", "Delacruz", "Smith-Jones", "Smith"].sort((a, c) => a.localeCompare(c)).join(" | "));
```

This VM:

```
node v22.23.4 v8 12.4.254.21-node.57 linux/x64 icu 78.3
pow       d029b384abaa89d69799538968ba17a5
starstar  d029b384abaa89d69799538968ba17a5
exp       a6fcbb2a8e64049e8af24be6862cfaab
log       a081b19d2ac5974f7e4a7ee7b575eb3e
cos       757e3100ca2f75917fb3cd9aaa940bdb
sqrt      00082db8f9ef2ef6354fadf094c848cb
localeCompare Davis | Davis II | Davis Jr. | de la Cruz | Delacruz | O'Neil | Oneil | Smith | Smith-Jones | St. James | Stjames
```

`sqrt` must match on any machine. If it does not, the probe was copied wrong.

`trimTrace.ts`, saved in the worktree's `v2/` and run with `npx tsx trimTrace.ts > trim-trace-studio.txt`. Delete it afterwards.

```ts
import { newGame } from "./lib/core/newGame";
import { advance } from "./lib/core/season/engine";
import { advanceOffseason, isOffseason } from "./lib/core/offseason";
import { preseasonWeeksLeft } from "./lib/core/preseason";
import type { GameState } from "./lib/core/types";

const TARGET = 2030;

function fp(st: GameState): string {
  let rostered = 0, ovr = 0, cap = 0, cuts = 0;
  for (const p of st.players) {
    if (p.teamId !== null && !p.prospect && !p.retired) {
      rostered++; ovr += p.ovr;
      cap += p.contract ? (p.contract.baseSalary[0] ?? 0) + p.contract.signingBonus : 0;
    }
  }
  for (const e of st.log) if (e.cut) cuts++;
  return `rng=${st.rngState} players=${st.players.length} rostered=${rostered} ovrSum=${ovr} salSum=${cap} log=${st.log.length} cutRows=${cuts}`;
}
let step = 0;
function mark(st: GameState, what: string): void {
  console.log(`${String(step++).padStart(4)} ${st.season} ${st.phase.padEnd(18)} wk=${String(st.week ?? "").padEnd(3)} ${what.padEnd(10)} ${fp(st)}`);
}

console.log(`node ${process.version} v8 ${process.versions.v8} ${process.platform}/${process.arch} GG_CAMP_NUDGE=${process.env.GG_CAMP_NUDGE ?? ""} GG_SEED=${process.env.GG_SEED ?? ""}`);
const st = newGame({ seed: 42 });
mark(st, "newGame");
advance(st); mark(st, "advance");
outer: while (true) {
  let g = 0;
  while (st.phase === "regular" && g++ < 40) { advance(st); mark(st, "advance"); }
  let p = 0;
  while (st.phase !== "offseason-recap" && p++ < 12) { advance(st); mark(st, "advance"); }
  let o = 0;
  while (isOffseason(st.phase) && o++ < 20) {
    const weeks = st.phase === "offseason-final" ? preseasonWeeksLeft(st) : -1;
    if (st.phase === "offseason-final" && weeks === 0 && st.season + 1 === TARGET) break outer;
    advanceOffseason(st); mark(st, "offseason");
  }
  if (st.phase !== "preseason") throw new Error(`stuck in ${st.season} ${st.phase}`);
  advance(st); mark(st, "advance");
}
const before = new Set(st.log);
advanceOffseason(st); mark(st, "CUTDOWN");
const cuts = st.log.flatMap((e) => (e.cut && typeof e.playerId === "number" && !before.has(e) ? [e.playerId] : []));
console.log(`cuts ${cuts.length}`);
console.log(cuts.join(","));
```

## Appendix B — the VM's trace at `a453c24`

Linux x64, Node 22.23.4. The phase shown is the phase after the step. Weekly lines are left out; ask for the full 125 if the split lands inside a season.

```
step season phase         rng              players      rostered      cut rows in log
   0 2026 preseason        rng=2291626074   players=3009 rostered=1696 cutRows=0
   1 2026 regular          rng=2568877029   players=3009 rostered=1696 cutRows=0
  23 2026 offseason-recap  rng=1779302491   players=3028 rostered=1835 cutRows=32
  24 2026 offseason-tag    rng=1779302491   players=3028 rostered=1715 cutRows=32
  25 2026 offseason-fa     rng=1323223106   players=3028 rostered=1329 cutRows=32
  26 2026 offseason-draft  rng=3198417307   players=3028 rostered=1467 cutRows=32
  27 2026 offseason-final  rng=1888373461   players=3028 rostered=2362 cutRows=56
  28 2026 offseason-final  rng=1888373461   players=3028 rostered=2222 cutRows=271
  29 2026 offseason-final  rng=1888373461   players=3028 rostered=2222 cutRows=271
  30 2026 offseason-final  rng=1888373461   players=3028 rostered=2222 cutRows=271
  31 2027 preseason        rng=1256537791   players=3683 rostered=2057 cutRows=982
  32 2027 regular          rng=3319310080   players=3683 rostered=2054 cutRows=1010
  54 2027 offseason-recap  rng=3922203982   players=3683 rostered=2074 cutRows=1075
  55 2027 offseason-tag    rng=3922203982   players=3683 rostered=1922 cutRows=1075
  56 2027 offseason-fa     rng=179063853    players=3683 rostered=1391 cutRows=1075
  57 2027 offseason-draft  rng=1854858163   players=3683 rostered=1611 cutRows=1075
  58 2027 offseason-final  rng=202379432    players=3683 rostered=2707 cutRows=1097
  59 2027 offseason-final  rng=202379432    players=3683 rostered=2479 cutRows=1360
  60 2027 offseason-final  rng=202379432    players=3683 rostered=2479 cutRows=1360
  61 2027 offseason-final  rng=202379432    players=3683 rostered=2479 cutRows=1360
  62 2028 preseason        rng=3865511058   players=4175 rostered=2038 cutRows=1272
  63 2028 regular          rng=856615975    players=4175 rostered=2025 cutRows=1294
  85 2028 offseason-recap  rng=3624104863   players=4175 rostered=2054 cutRows=1356
  86 2028 offseason-tag    rng=3624104863   players=4175 rostered=1954 cutRows=1358
  87 2028 offseason-fa     rng=2615283605   players=4175 rostered=1478 cutRows=1358
  88 2028 offseason-draft  rng=2226476214   players=4175 rostered=1672 cutRows=1358
  89 2028 offseason-final  rng=934915765    players=4175 rostered=2848 cutRows=1383
  90 2028 offseason-final  rng=934915765    players=4175 rostered=2744 cutRows=1611
  91 2028 offseason-final  rng=934915765    players=4175 rostered=2744 cutRows=1611
  92 2028 offseason-final  rng=934915765    players=4175 rostered=2744 cutRows=1611
  93 2029 preseason        rng=303080095    players=4586 rostered=2114 cutRows=1556
  94 2029 regular          rng=1144894726   players=4586 rostered=2096 cutRows=1614
 116 2029 offseason-recap  rng=1915053907   players=4586 rostered=2128 cutRows=1760
 117 2029 offseason-tag    rng=1915053907   players=4586 rostered=2001 cutRows=1760
 118 2029 offseason-fa     rng=4249658290   players=4586 rostered=1486 cutRows=1760
 119 2029 offseason-draft  rng=5895682      players=4586 rostered=1745 cutRows=1760
 120 2029 offseason-final  rng=651054540    players=4586 rostered=2999 cutRows=1788
 121 2029 offseason-final  rng=651054540    players=4586 rostered=2999 cutRows=2172
 122 2029 offseason-final  rng=651054540    players=4586 rostered=2999 cutRows=2172
 123 2029 offseason-final  rng=651054540    players=4586 rostered=2999 cutRows=2172
 124 2030 preseason        rng=19218870     players=4969 rostered=2210 cutRows=1967
```

The last line is the lock: 1587 cuts, rng 19218870. The cut list is `CUTS` in `lib/core/trimIdentity.test.ts` at `a453c24`.

## Addendum, 2026-11-14 — main `61b3a70` on the VM

This was current main on 2026-11-14. It is not current main. Matt asked for both of these that day. Read-only, scratch copy of main `61b3a70` (#246), same Linux x64 VM, Node 22.23.4. No Studio job. Line numbers in this section are from `61b3a70`.

### The trim lock and a fresh reference trace

`npx tsx lib/core/trimIdentity.test.ts` passes on the VM: `1530 cuts, rng 3780634271`. That is the 2026-11-14 lock at this commit. Since #229 the literal had been re-locked seven more times, each on a VM, and none of those seven had been read on the Studio. Four more re-locks landed after this addendum. The full count is in the 2026-11-15 section.

Appendix C is the VM trace for `61b3a70` only. Do not diff a Studio run of current main against Appendix B or Appendix C.

### Ten-season `verify`: the bargains are gone, and one roster is at 69

`npx tsx scripts/verify.ts 10`, seed `20260727`: **1062/1063**.

- **No bargain in ten seasons.** No "forced by the cap" row is behind any failed check. On this machine that check failed four times at `b5c2a21` and once at `a453c24`. The restructure-first cover from #235 is doing what it was signed for here. The Studio plays a different league after year 0, so this is not yet the Studio's answer.
- **New failure.** `after 2032 offseason: all 32 rosters at exactly 53 — 1 teams off`. Baltimore, a CPU club, opens 2033 with **69** on the active roster, $150.9M of space, and 34 hits under $1M.

VM champions at `61b3a70`: 2026 New Orleans, 2027 Brooklyn, 2028 Atlanta, 2029 Hartford, 2030 Hartford, 2031 Nashville, 2032 Tampa Bay, 2033 Pittsburgh, 2034 San Diego, 2035 San Francisco.

### Why Baltimore is at 69

Baltimore's count after each step of that offseason:

| after | active | all bodies | space |
|---|---:|---:|---:|
| tag | 42 | 44 | $188.3M |
| free agency | 50 | 52 | $166.3M |
| draft, camp filled | 90 | 92 | $128.2M |
| three preseason weeks | 90 | 97 | $124.2M |
| Start the Season | **69** | 69 | $150.9M |

Inside that last step the log reads, in order: nine waiver claims, each paired with a waive; **16** players "placed on the practice squad"; then 16 pairs of "BAL waived X" and "BAL signed Y (58–61 OVR) at $0.8M per year", where every X is one of the 16 just placed on the practice squad; then one extension. 53 + 16 = 69.

The writer is `spendToFloor` (`offseason/contracts.ts` 2004), called after the calendar rolls by `spendLegalCpuBackToFloor` (2076; `offseason/index.ts` 353). It picks the worst player at each position from every body on the club (2018–2020: `teamId`, not retired, not a prospect). That list includes the practice squad. It then cuts him and signs a free agent in his place (2058–2066). The new man has no `status`, so he is active (`select.ts` 35). `rosterCount` counts active players only (39). Replacing a practice-squad body with an active one adds one to the 53 each time. The guard in `spendLegalCpuBackToFloor` checks for exactly 53 once, before the loop, and nothing after it trims.

Before the roll the same function is safe because a cutdown `reconcileRoster` call follows it. After the roll nothing does: `refillCpuRostersAfterWaivers` (349) runs first, and it only acts on a club that is short or over the cap.

It needs a club that is legal, at 53, well under the spending floor after the roll, and carrying a practice squad whose worst bodies a street free agent beats by two points. `spendLegalCpuBackToFloor` came in with #214. This is the first run I have seen it leave a club over 53: neither VM run in section 2 has the line, and it is not on the Studio summary for `a453c24`. I have not shown which later merge made Baltimore's book this cheap. The 34 hits under $1M and #241/#243 (minimum deals carry no bonus) point that way, but that is a guess.

### Proposed — UNSIGNED

In `spendToFloor`, choose the player to replace from the active roster only. One line, the roster filter at 2018–2020. It changes which swaps a club under the floor makes before the roll as well, so the seed-42 fingerprints may move and would need a signed re-lock. I have not built or measured it.

Not proposed: a trim after `spendLegalCpuBackToFloor`. That would cut 16 players the club just signed.

## Appendix C — the VM's trace at `61b3a70`

```
step season phase         rng              players      rostered      cut rows in log
   0 2026 preseason        rng=2291626074   players=3009 rostered=1696 cutRows=0
   1 2026 regular          rng=2568877029   players=3009 rostered=1696 cutRows=0
  23 2026 offseason-recap  rng=2748412837   players=3021 rostered=1831 cutRows=38
  24 2026 offseason-tag    rng=2748412837   players=3021 rostered=1710 cutRows=42
  25 2026 offseason-fa     rng=20755560     players=3021 rostered=1307 cutRows=42
  26 2026 offseason-draft  rng=4088433856   players=3021 rostered=1492 cutRows=42
  27 2026 offseason-final  rng=450447221    players=3021 rostered=2359 cutRows=65
  28 2026 offseason-final  rng=450447221    players=3021 rostered=2242 cutRows=293
  29 2026 offseason-final  rng=450447221    players=3021 rostered=2242 cutRows=293
  30 2026 offseason-final  rng=450447221    players=3021 rostered=2242 cutRows=293
  31 2027 preseason        rng=4113578847   players=3687 rostered=2106 cutRows=1137
  32 2027 regular          rng=4107175905   players=3687 rostered=2111 cutRows=1191
  54 2027 offseason-recap  rng=708748799    players=3687 rostered=2115 cutRows=1232
  55 2027 offseason-tag    rng=708748799    players=3687 rostered=1977 cutRows=1232
  56 2027 offseason-fa     rng=3283965370   players=3687 rostered=1415 cutRows=1232
  57 2027 offseason-draft  rng=1872098827   players=3687 rostered=1606 cutRows=1232
  58 2027 offseason-final  rng=3754869328   players=3687 rostered=2734 cutRows=1276
  59 2027 offseason-final  rng=3754869328   players=3687 rostered=2567 cutRows=1508
  60 2027 offseason-final  rng=3754869328   players=3687 rostered=2567 cutRows=1508
  61 2027 offseason-final  rng=3754869328   players=3687 rostered=2567 cutRows=1508
  62 2028 preseason        rng=3123033658   players=4221 rostered=2105 cutRows=1378
  63 2028 regular          rng=1944789682   players=4221 rostered=2094 cutRows=1406
  85 2028 offseason-recap  rng=2116749190   players=4221 rostered=2110 cutRows=1572
  86 2028 offseason-tag    rng=2116749190   players=4221 rostered=2006 cutRows=1572
  87 2028 offseason-fa     rng=4259529982   players=4221 rostered=1442 cutRows=1572
  88 2028 offseason-draft  rng=1719450793   players=4221 rostered=1657 cutRows=1572
  89 2028 offseason-final  rng=4275269261   players=4221 rostered=2900 cutRows=1599
  90 2028 offseason-final  rng=4275269261   players=4221 rostered=2809 cutRows=2023
  91 2028 offseason-final  rng=4275269261   players=4221 rostered=2809 cutRows=2023
  92 2028 offseason-final  rng=4275269261   players=4221 rostered=2809 cutRows=2023
  93 2029 preseason        rng=3643433591   players=4631 rostered=2097 cutRows=1807
  94 2029 regular          rng=839546537    players=4631 rostered=2094 cutRows=1844
 116 2029 offseason-recap  rng=2652749652   players=4631 rostered=2125 cutRows=1945
 117 2029 offseason-tag    rng=2652749652   players=4631 rostered=2004 cutRows=1946
 118 2029 offseason-fa     rng=2644258646   players=4631 rostered=1460 cutRows=1946
 119 2029 offseason-draft  rng=871473821    players=4631 rostered=1709 cutRows=1946
 120 2029 offseason-final  rng=117502645    players=4631 rostered=2977 cutRows=1974
 121 2029 offseason-final  rng=117502645    players=4631 rostered=2993 cutRows=2334
 122 2029 offseason-final  rng=117502645    players=4631 rostered=2993 cutRows=2334
 123 2029 offseason-final  rng=117502645    players=4631 rostered=2993 cutRows=2334
 124 2030 preseason        rng=3780634271   players=4977 rostered=2219 cutRows=1918
```

The last line is main's lock: 1530 cuts, rng 3780634271.
