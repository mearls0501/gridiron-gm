# Practice squad: 6-veteran cap and international slot

**UNSIGNED.** Proposal only. Matt signs any change. This note changes no code, no test, no `scripts/` file and no `docs/baselines.json` row. No re-lock, no dial retune, no panel.

Tree: branch `claude/gracious-allen-i8ij43`, `HEAD` `72ac945`. Every file:line below is from that tree. Probes ran with `npx tsx` from `v2/`. Scripts are in the session scratchpad (`wf/psvets.ts`, `wf/psvets2.ts`, `wf/count.ts`, `wf/fix.ts`). They import repo modules read-only.

ROADMAP lists this under the long tail (`docs/ROADMAP.md` 145–151): "The 6-veteran PS cap and international PS slot. Real, not urgent."

## Verdict

The 6-veteran cap can be added at one choke point, `placeOnPs`. Every route onto a practice squad already goes through it, and both CPU callers already handle a refusal. It needs one new per-player fact the sim does not have: accrued seasons. Without that fact, the only proxy is `yearsPro`, which `nfl-reference.md` §4 already rejected.

The international slot should not ship now. The sim has no international players and no field that could mark one. The slot would be a 17th seat nobody can fill.

Neither rule is traced. `nfl-reference.md` §4 names the 16-man squad as a published rule and explicitly omits both of these (lines 614–626). It cites the design calendar, not the CBA. No CBA practice-squad article is cited anywhere in that file. The rule text has to land in `nfl-reference.md` §4 first, with its source, before any code below.

## What the code does today

**One limit, no composition rule.** `PRACTICE_SQUAD_LIMIT = 16` (`lib/core/types.ts` 1603). The comment above it (1598–1602) says it is a published rule from `docs/front-office-design-2026-07-28.md` Part 5, not computed from T/D/S/P. `PS_ELEVATIONS_PER_PLAYER = 3` (1606). The design table (`docs/front-office-design-2026-07-28.md` 329) reads "16 (+1 international), max 6 vested veterans". That table is a design calendar, not a primary source.

**`nfl-reference.md` §4 omits both rules on purpose** (`docs/nfl-reference.md` 614–626): "Skip the +1 international PS slot." "The 6-vested-veteran PS cap is omitted: `yearsPro` is not an accrued-season count, and inventing one would be a new career-accrual system. Ungated published rules."

**The sim has no accrued seasons.** `Player.yearsPro` (`lib/core/types.ts` 270) goes up by one for every non-retired, non-prospect player every offseason (`lib/core/offseason/progression.ts` 253–257). Free agents and unsigned players count too. It measures years since entry, not seasons on a payroll. `SeasonStatLine.games` (`types.ts` 204) counts box-score appearances only (`lib/core/season/stats.ts` 78–84). An active player who never takes a snap and a player on IR get no game. Neither field is the CBA's full-pay-status count.

**There is no international marker.** `Player` has no origin, nationality or pathway field. `ProspectProfile` (`types.ts` 1010–1021) carries `college`, class year, measurements and risk grades only.

**One write site.** `p.status = "ps"` is set in one place, `placeOnPs` (`lib/core/rosterStatus.ts` 99–119). Its only guard is the 16 count (106–108). `canPlaceOnPs` (32–40) mirrors it for the UI. `practiceSquadCount` (`lib/core/select.ts` 55–61) is the count.

**Three callers put bodies on a squad:**

1. **Waiver clears, all clubs, user included.** `stashOrFreeAgent` (`lib/core/waivers.ts` 237–270) parks an unclaimed player on his old club's squad when `psN(bag) < PRACTICE_SQUAD_LIMIT` and his hit fits (242–245). It calls `placeOnPs` (248). If `placeOnPs` refuses, it already puts him back and falls through to free agency (253–264). The remaining guarantee is booked only when the entry has `bookedAtCut` (258–259); an older entry clears with no charge. Players are taken in queue order. No one chooses which unclaimed man gets the seat.
2. **CPU in-season slot free.** `freeActiveSlot` (`lib/core/offseason/contracts.ts` 1708–1714) tries `placeOnPs` on `worstSurplus` (1709–1711). If that refuses, it falls through to `cutWorstSurplus` (1713), which calls `moveWorstSurplus` → `worstSurplus` again (1645–1647, 1918–1929). The roster has not changed, so it picks the same man and waives him. Callers: `autoActivateFromIr` via `applyCpuIrAndFill` (`lib/core/season/engine.ts` 270–276; `lib/core/season/playoffs.ts` 250–251) and `dressEmergencyQuarterbacks` (`lib/core/emergencyQb.ts` 75–78).
3. **User `/roster` "Place on PS".** The button shows when `canPlaceOnPs` is true (`app/roster/page.tsx` 521). Clicking it does not call `placeOnPs`. It runs `cutRefusal`, then `cutPlayer` (524–531): the player goes to waivers and lands on the squad only through path 1. `moveWorstSurplus` ignores its `"ps"` destination and always waives (`contracts.ts` 1918–1929), so the cutdown stash in `reconcileRoster` (1578–1585) also ends at path 1.

**Squads fold every year.** At Start the Season, `foldPracticeSquad` (`rosterStatus.ts` 147–154) clears every PS status for CPU clubs (`lib/core/offseason/index.ts` 265) and then the user club (279). The cutdown re-waives the extras and path 1 rebuilds the squads. A squad's makeup lasts from one cutdown to the next.

**The user cannot release a PS player.** The Practice Squad card offers only "Elevate from PS" (`app/roster/page.tsx` 600–618). Elevation clears the slot (`rosterStatus.ts` 134–136). Any refusal text has to point at elevation or at releasing the incoming player, because there is no other way to open a seat.

## The rule, and what is missing from `nfl-reference.md`

The rule as the design table and secondary summaries describe it: a 16-man squad; at most 6 of the 16 may be veterans past the normal practice-squad eligibility line; one more seat, outside the 16, for an International Player Pathway player.

None of the numbers that define it is in `nfl-reference.md`:

| needed | in `nfl-reference.md`? | primary source that would supply it |
|---|---|---|
| 6 veterans per squad | No. §4 (614–626) omits it. | The NFL–NFLPA CBA practice-squad article (believed to be 2020 CBA Article 33; that article number is itself untraced and unverified here), and the later NFL–NFLPA agreement that set the 16-man squad. The exact article section is not in this repo. |
| "Veteran" line: how many accrued seasons make a PS veteran | No. The design table says "vested veterans". Secondary summaries describe an accrued-season line instead. These are not the same population. | Same CBA article. |
| Accrued season: games on full-pay status that earn one | No. | 2020 CBA definition of an Accrued Season (veteran free-agency article; article number not verified here). The 6 in `ACCRUED_SEASON_GAMES` below is untraced. |
| +1 international slot, and whether that player can be elevated | No. §4 says "Skip". | NFL Football Operations International Player Pathway announcements. nflverse `rosters` / `players` carry no pathway flag. |

Per invariant 7, nothing below is a calibration target. These are published roster rules, the same class as the 16, 8, 4 and 3 already in §4. They still need the text and its source added to §4 before code lands. Until then, the constants below stay as **untraced placeholders**, named in the decisions list, and no axis is gated.

## Measured on this tree

**Probe 1: how many PS players would count as veterans.** `wf/psvets.ts` walks seed 42 exactly as `atCutdownDoor` does in `lib/core/trimIdentity.test.ts` 132–150, through the door that opens 2030. It scans every club's squad after each `advance` / `advanceOffseason` step. At the first `offseason-tag` it read parent rng **1779302491**, the `userOffers` tag literal, so the walk matches the canary. Run time 3m06s.

Two veteran definitions, because the sim has no real one:

- **D1, upper bound:** `yearsPro >= 3`. This counts free-agent years and is what §4 rejected.
- **D2, lower bound:** three or more `stats` lines with `games >= 6`. This counts only appearances. Generated players have no history before 2026, so D2 starts at zero. The 3 and the 6 are probe choices, not traced numbers.

| point (seed 42) | PS bodies | largest squad | D1 veterans | D1 most on one club | clubs over 6 (D1) | excess over 6 (D1) | user squad (D1) | D2 most on one club |
|---|---:|---:|---:|---:|---:|---:|---|---:|
| 2026 REG week 2 | 0 | 0 | 0 | 0 | 0 | 0 | — | 0 |
| 2026 REG week 10 | 26 | 3 | 20 | 3 | 0 | 0 | — | 0 |
| 2026 REG week 18 | 55 | 5 | 40 | 4 | 0 | 0 | — | 0 |
| 2027 preseason (after cutdown) | 328 | 16 | 134 | 9 | 6 | 9 | 15, 7 vets | 0 |
| 2027 REG week 10 | 286 | 16 | 116 | 9 | 4 | 6 | 15, 7 vets | 0 |
| 2028 preseason | 275 | 16 | 73 | 7 | 1 | 1 | 16, 5 vets | 0 |
| 2028 REG week 18 | 255 | 16 | 75 | 8 | 1 | 2 | 16, 5 vets | 1 |
| 2029 preseason | 346 | 16 | 57 | 6 | 0 | 0 | — | 2 |
| 2029 REG week 18 | 318 | 16 | 55 | 6 | 0 | 0 | — | 3 |

What it shows:

- No club passes 6 on either definition before the first cutdown (2027 preseason). The first step with any club over 6 under D1 is that cutdown. Under D2 no club passes 6 at any point through the 2030 door.
- Under D1 the cap binds at the first two cutdowns, then stops. Nine excess bodies league-wide in 2027, one in 2028, none in 2029. Those are generated veterans from `newGame` working their way out. The steady state is well under 6 per club. The rule would mostly bite in the opening seasons.
- The headless user club is over under D1 in 2027 (7 of 15). Path 1 parks the user's unclaimed waives too.

**Probe 2: league at `newGame`.** `wf/count.ts`, seed 42: 3,009 players, 1,836 non-prospect. `yearsPro` spread: 0:243, 1:174, 2:151, 3:230, 4:183, 5:219, 6:182, 7:137, 8:119, 9:82, 10+:116. 1,268 of 1,836 (69%) have `yearsPro >= 3`.

**Probe 3: test fixtures that fill a squad.** `wf/fix.ts` counts D1 veterans among the first 16 unslotted user players, which is how the fixtures pick bodies. Seed 6 (`waivers.test.ts` 153): 11. Seed 49 (`retirementDead.test.ts` 273): 12. Seed 42: 10. Seed 7: 8. On D1 or on the fallback below, those fixtures break at the 7th veteran. That is a fixture change, covered under Regression.

Not measured: a real full-pay accrued count. It does not exist yet. Nothing here runs a panel, `gate:full`, drift or careers.

## Proposed change

The design keeps one write site and touches neither CPU caller. The existing refusal fallbacks in `waivers.ts` 253–264 and `contracts.ts` 1713 already do the right thing when `placeOnPs` says no.

### 1. Constants (`lib/core/types.ts`, beside 1603)

```ts
/**
 * Practice-squad veterans and the accrued-season line. UNTRACED until
 * docs/nfl-reference.md §4 cites the CBA practice-squad article.
 */
export const PS_VETERAN_LIMIT = 6;
/** A PS veteran has at least this many accrued seasons. */
export const PS_VETERAN_MIN_ACCRUED = 3;
/** Regular-season club games on full-pay status (53 or IR) that earn an accrued season. */
export const ACCRUED_SEASON_GAMES = 6;
```

`PS_VETERAN_MIN_ACCRUED = 3` means "more than two accrued seasons". The design table's "vested" usually means more. That is decision 2.

### 2. Two optional Player fields (`lib/core/types.ts`, after `psElevations` at 307)

```ts
/** Accrued seasons. Missing = `yearsPro`, so older saves and generated veterans load. */
accruedSeasons?: number;
/** This regular season's club games on the 53 or IR. Missing = 0. Cleared at progression. */
fullPayGames?: number;
```

Missing means the old value, as with `status`, `irGames` and `psElevations`. `JSON.stringify` round-trips both.

### 3. Count full-pay games (`lib/core/rosterStatus.ts`, beside `tickIrGames` at 163–170)

```ts
/** Credit one full-pay game to every 53 or IR player whose club played. Regular season only. */
export function tickFullPayGames(state: GameState, teamIds: Iterable<number>): void {
  if (state.phase !== "regular") return;
  const played = new Set(teamIds);
  for (const p of state.players) {
    if (p.teamId === null || p.retired || p.prospect || p.status === "ps") continue;
    if (!played.has(p.teamId)) continue;
    p.fullPayGames = (p.fullPayGames ?? 0) + 1;
  }
}
```

Call it in `lib/core/season/engine.ts` after the `played` set is built (127–131) and before the `fillRng` draw at 132 and `applyCpuIrAndFill` at 133, so the kickoff roster earns the game rather than the post-game IR shuffle. Line 132 draws `rng.int` from the parent; the tick must not move it. Do not call it from `playoffs.ts`. No draw.

### 4. Credit the season (`lib/core/offseason/progression.ts` 257)

```ts
p.accruedSeasons = accruedSeasons(p) + ((p.fullPayGames ?? 0) >= ACCRUED_SEASON_GAMES ? 1 : 0);
delete p.fullPayGames;
p.yearsPro += 1;
```

The credit line goes **before** `p.yearsPro += 1` (257), so `accruedSeasons(p)` reads the pre-increment fallback. (Review fix: the first draft put it after the increment, which reads the post-increment `yearsPro` and gives 6, contradicting the next paragraph.) This sits inside the loop that already draws for `developPlayer`. It draws nothing itself, so the loop's draw count and order do not change.

**Order matters here.** As written, the first credit materializes `yearsPro` before the `+= 1`. A generated player with `yearsPro 4` and a full season becomes 5 accrued, not 6. That keeps the fallback equal to "every year before this save counted".

### 5. The rule (`lib/core/rosterStatus.ts`)

```ts
export function accruedSeasons(p: Player): number {
  return p.accruedSeasons ?? p.yearsPro;
}
export function isPsVeteran(p: Player): boolean {
  return accruedSeasons(p) >= PS_VETERAN_MIN_ACCRUED;
}
export function psVeteranCount(state: GameState, teamId: number): number {
  let n = 0;
  for (const p of state.players) {
    if (p.teamId === teamId && !p.retired && !p.prospect && p.status === "ps" && isPsVeteran(p)) n++;
  }
  return n;
}
/** Null when the veteran line does not block him. */
export function psVeteranRefusal(state: GameState, p: Player, teamId: number): string | null {
  if (!isPsVeteran(p)) return null;
  const n = psVeteranCount(state, teamId);
  if (n < PS_VETERAN_LIMIT) return null;
  return `Practice squad already holds ${n} of ${PS_VETERAN_LIMIT} veterans. ` +
    `${p.firstName} ${p.lastName} has ${accruedSeasons(p)} accrued seasons.`;
}
```

In `placeOnPs`, after the 16 check (106–108):

```ts
const vet = psVeteranRefusal(state, p, p.teamId);
if (vet) return { ok: false, reason: vet };
```

`canPlaceOnPs` (32–40) stays count-only on purpose, so the user still sees the button and gets the reason (see 7).

### 6. CPU fills: no edit

- **Waiver clears.** `placeOnPs` refuses a 7th veteran. `stashOrFreeAgent` already resets him (`waivers.ts` 253–256) and clears him to free agency with the remaining guarantee booked (257–264). He is a free agent, which is what the NFL rule would make him. Queue order still decides who gets the six seats, as it decides who gets the sixteen today.
- **In-season slot free.** `freeActiveSlot` falls to `cutWorstSurplus` (`contracts.ts` 1713), which waives the same `worstSurplus` man. He reaches path 1 next window and clears to free agency if the cap still binds.
- **No preference for non-veterans.** The CPU does not try a second, non-veteran surplus body when the worst one is a veteran. That would be a new selection rule and would move cutdown identity more. That is decision 5.

### 7. User `/roster` refusal (`app/roster/page.tsx` 521–534)

In the Place on PS handler, before `cutPlayer`, refuse with the text below. Count this club's veterans already waiting on the wire, so two clicks in one window cannot both promise a seat:

```ts
const pending = (s.waivers ?? []).filter((w) => w.originalTeamId === s.userTeamId)
  .map((w) => s.players.find((x) => x.id === w.playerId))
  .filter((x): x is Player => !!x && isPsVeteran(x)).length;
const held = psVeteranCount(s, s.userTeamId);
if (live && isPsVeteran(live) && held + pending >= PS_VETERAN_LIMIT) {
  return { ok: false, reason:
    `${playerName(live)} has ${accruedSeasons(live)} accrued seasons. Your practice squad ` +
    `already holds ${held} of ${PS_VETERAN_LIMIT} veterans` +
    (pending ? `, with ${pending} more waiting on waivers` : "") +
    `. Elevate a veteran from the squad, or release ${playerName(live)} instead.` };
}
```

Example text: "Marcus Hale has 5 accrued seasons. Your practice squad already holds 6 of 6 veterans, with 1 more waiting on waivers. Elevate a veteran from the squad, or release Marcus Hale instead."

Nothing is waived when the refusal fires. Two small copy edits go with it: the card subtitle at 593 reads `${psList.length} of 16 · ${vets} of 6 veterans · …`, and the cutdown note at 352–354 adds "at most 6 veterans". A PS row may show `accruedSeasons` beside Elevations. That is optional.

### 8. International slot: not built

There is no population to put in it. Building one needs (a) a Player origin or pathway flag, (b) a generator rate for pathway players per year, and (c) the elevation rule for that seat. (b) is a rate. It is not in `nfl-reference.md`, and invariant 7 forbids inventing it. A constant `PRACTICE_SQUAD_LIMIT + 1` that only an unset flag could reach would be dead code. Leave the ROADMAP half open with this note as the reason. That is decision 4.

### 9. Save migration

**Over-cap squads in an existing save are grandfathered.** `migrate` (`lib/store/save.ts` 170–) does not touch `status`. A mid-season save with 7–9 veterans on a squad keeps them. `placeOnPs` refuses only new veterans while the count is at or above 6. The next Start the Season folds every squad (`offseason/index.ts` 265, 279), and the cutdown re-stashes under the cap. Reasons:

- A load-time waive would book dead money (`waivers.ts` 257–264) and change cap space on load. That is a hidden transaction the user did not make.
- A load-time waive needs a choice of who goes. Any ordering is a new rule.
- `lib/core/jersey.test.ts` 83 and 88 hold `migrate` to "does not touch parent RNG" and "deterministic". Grandfathering trivially keeps both.

**Missing fields need no backfill.** `accruedSeasons` missing reads `yearsPro`. `fullPayGames` missing reads 0. One edge case: a save loaded mid-season under the new code earns full-pay games only for the weeks left. A player past week 12 with 11 games so far would miss his credit that year. Optional backfill in `migrate`, phase `regular` only: `fullPayGames = current-season stats line .games` for rostered non-PS players. No draw. That undercounts IR and inactive weeks, so it is a floor. That is decision 6.

**Save size.** Two small integers per player. `"accruedSeasons":N,` is 18 bytes raw JSON. `fullPayGames` exists only between week 1 and progression. On 1,836 live players at `newGame` that is about 33 KB raw. Over a 20-season save that also keeps retired careers, it is a few hundred KB raw, before the codec. Not measured. `drift.saveMbAtEnd` (signed max 15.89, panel 14.89) and `drift.saveGrowthMbPerSeason` (max 0.61, panel 0.56) are the guards. Optional: `delete p.accruedSeasons` when a player retires, because nothing reads it after that.

## Regression test plan

New cases in `lib/core/rosterStatus.test.ts`. That file is already `irps` in both tiers (`scripts/gate.ts` 101, 190). No new file and no `scripts/` edit.

1. **Veteran cap.** `newGame({ seed: 4 })`. Set `accruedSeasons = 5` on seven active user players and `accruedSeasons = 0` on ten. Place the six veterans: all ok. The seventh: `ok === false`, reason matches `/6 of 6 veterans/`, `status` unchanged, `practiceSquadCount` 6. Place the ten non-veterans: all ok. Count 16, veterans 6. `rngState` unchanged throughout.
2. **Line.** `accruedSeasons = 2` is not a veteran. `3` is. A player with no field and `yearsPro 3` is a veteran (fallback).
3. **Elevation frees a seat.** From case 1, elevate one veteran. The seventh veteran now places ok.
4. **Waiver clear refuses to free agency.** Six veterans on the user squad. Waive a seventh veteran with a guarantee and make him unclaimable (the `makeUnclaimable` shape in `waivers.test.ts`). `resolveWaivers`: he is a free agent, `teamId === null`, `contract === null`, the guarantee lands on `deadCap`. Mirrors the 16-full case at `waivers.test.ts` 151–.
5. **CPU slot free.** A CPU club with six PS veterans whose `worstSurplus` is a veteran. `freeActiveSlot` returns true. He is on `state.waivers`, not on the squad.
6. **Full-pay credit.** Phase `regular`. Tick a club 6 times for a 53 player, 6 for an IR player, 6 for a PS player, 5 for a 53 player. `runProgression` on a child `Rng`: +1, +1, +0, +0. `fullPayGames` is deleted. The draw count equals the same run with the tick removed (compare `rng.state`).
7. **Grandfather.** Plant eight PS veterans with `status = "ps"` directly. `migrate(st)` leaves all eight, `rngState` unchanged. `placeOnPs` of a ninth veteran refuses. `foldPracticeSquad` clears all eight.
8. **Round-trip.** `JSON.parse(JSON.stringify(st))` keeps `accruedSeasons` and `fullPayGames`.

**Fixtures that need `accruedSeasons = 0` on their planted extras.** These assert `placeOnPs(...).ok` on the first 16 unslotted user players. Probe 3 shows 10–12 of those are veterans by the fallback, so they go red. This is a fixture fix. It does not weaken an assertion: the tests are about the 16 count, waivers and dead money, not squad composition.

- `lib/core/waivers.test.ts` 154–158 (seed 6)
- `lib/core/waiverClearing.test.ts` 38–44 (`fillPs`, seeds 61–64). `fillPs` fills a CPU club, not the user club, so Probe 3 did not measure it; expect the same failure class.
- `lib/core/retirementDead.test.ts` 273–277 (seed 49)
- Check, may pass as is: `lib/core/rosterManagement.test.ts` 229–234 loops with `if (placeOnPs(...).ok) parked++` and needs ten non-veterans among the active roster. `lib/core/rosterStatus.test.ts` 245 expects 7 stashed from a cutdown. `lib/core/waivers.test.ts` 223 expects 5. Those three can lose a stash to the cap and need the same fixture line if they do.

UI: `node scripts/e2e.mjs` and `node scripts/e2e-interact.mjs` after the `/roster` copy change. They look for strings, not the subtitle count. Re-read their selectors before merge.

## Gate, canaries

The rule draws no RNG. `placeOnPs`, `tickFullPayGames` and the progression credit read and write fields only. The parent stream moves only when a refusal changes who is on a roster. After that, cap space, free-agent pools, fills and trades diverge.

| check | moves? | why |
|---|---|---|
| `userOffers` seed 42, tag **1779302491** / FA **1323223106** (`lib/core/userOffers.test.ts` 129, 133) | **Should not move.** | The canary walks `newGame` → 2026 season → `offseason-tag` → `offseason-fa`. Probe 1 matched its tag literal. Under D1, the fallback's upper bound, no club held more than 5 PS veterans at any step before the first cutdown (review re-probe `wf/psmax.ts`: max 5, reached in the 2026 playoffs; tag rng 1779302491 and FA rng 1323223106 reproduced). A refusal needs a 7th veteran placed into a squad already holding 6, so none fires before 2027 preseason, after both literals. Caveat: the probe reads club counts at step boundaries only. A 6th and 7th veteran parked and then elevated inside one step would be missed; no such case is expected from a max of 5, but the canary test itself is the proof. `tickFullPayGames` and the progression credit draw nothing. **If either literal changes, the diff drew or reached a 2026 path. Revert that part. Do not re-lock.** |
| `trimIdentity` seed 42, opening 2030: **1600** cuts, rng **2524091302** (`lib/core/trimIdentity.test.ts` 20–21) | **Moves. Parent RNG moves before that point.** | The 2027 cutdown is the first refusal: 6 clubs over, 9 excess, D1. Under the proposed counter, the first progression (2026 offseason, before the 2027 cutdown) materializes `accruedSeasons` as old `yearsPro` plus a credit, which is at most D1's post-increment `yearsPro`. So it binds at most as much as D1 there, and likely somewhat less (a body that missed the credit drops below the line). It still binds. Those 9 clear to free agency with dead money booked. The 2028 offseason re-fills from a different pool, and the 2030 cut list and parent rng diverge. A re-lock needs Matt's signature after implementation, measured once, and is not part of this proposal. |
| `drift.saveMbAtEnd` (max 15.89) / `drift.saveGrowthMbPerSeason` (max 0.61) | Small rise. | Two optional integers per player. Est. a few hundred KB raw over 20 seasons. Not measured. Optional delete at retirement. |
| `drift.deadMoneyPct` (ungated emit, §4) | Up, slightly, in seasons 2–3. | A refused veteran clears with his remaining guarantee booked when `bookedAtCut` (`waivers.ts` 258–259). On path 2 a refused in-season park becomes a `cutPlayer` waive, which also books at the cut. Do not add a band. |
| `drift.capBustSeasons` (max 0), `drift.minPayrollSeasonsUnder55` (max 0), `drift.medianPayrollPct` (90.602 ±6) | Can move. | Different bodies stay on payroll after the first two cutdowns. |
| `drift.playerWeeksLost` (legacy 2158.23 ±700) | Unlikely. | It excludes PS (`nfl-reference.md` §6.7). Indirect only. |
| `careers.survivalMae` / `careers.careerLenMae` (known-open) | Can move. | A refused veteran becomes a free agent instead of a PS body. Veterans are not the rookie cohorts `careers` grades, so the effect should be small. Read it, do not tune toward it. |
| `drift.qbsPerClub53` (expect ≤ 3.0) | No. | §2.7b: PS quarterbacks are outside that cap. An emergency PS QB is elevated, not placed. |
| `calibrate`, `statcheck`, `tails`, `conditions`, `coherence`, `leverage` | Indirect only. | PS players do not play. The 53 changes only when a free-agent fill differs. |
| `verify`, `determinism` | Must pass. | No new API, no draw. `determinism` round-trips the two fields. |

No row in `docs/baselines.json` moves. No band is added for PS veteran counts. A report-only `##M` emit (max PS veterans per club) would be a `scripts/` edit, so it is a lead decision and is not proposed here.

## Decisions for Matt

1. **Trace first.** Add the CBA practice-squad article text (16, 6 veterans, the veteran line, the international seat) and the accrued-season definition to `nfl-reference.md` §4, replacing "omitted" / "Skip" at 614–618, with the source. No code before that. Sign or decline.
2. **The veteran line.** "More than two accrued seasons" (`PS_VETERAN_MIN_ACCRUED = 3`, the reading proposed here) or "vested" as the design table says (`docs/front-office-design-2026-07-28.md` 329). Pick the one the cited text supports.
3. **Accrued seasons.** Build the counter (`accruedSeasons`, `fullPayGames`, `ACCRUED_SEASON_GAMES = 6` once traced) with the `yearsPro` fallback, as proposed. Or ship on the `yearsPro >= 3` proxy alone, which reverses §4's stated reason for omitting the cap.
4. **International slot.** Defer, as proposed. It needs an origin field and a pathway rate that `nfl-reference.md` does not have. Or name the source for a rate.
5. **CPU selection.** Keep the existing worst-surplus and queue order, so a refused veteran is waived or cleared to free agency (proposed). Or add a "next non-veteran" preference, which is a new rule and moves cutdown identity more.
6. **Migration.** Grandfather over-cap squads until the next fold (proposed). Optionally backfill `fullPayGames` from the current-season stats line on a mid-season load.
7. **Fixtures.** Allow `accruedSeasons = 0` on planted extras in `waivers.test.ts`, `waiverClearing.test.ts` and `retirementDead.test.ts` (and the three "check" files if they go red).
8. **Canaries.** Confirm that `userOffers` must stay at 1779302491 / 1323223106. Pre-authorize, or not, one measured `trimIdentity` re-lock (cuts and rng from 1600 / 2524091302) after implementation.

## Review (2026-11-11)

Adversarial review against the tree at `HEAD` `72ac945`. Every file:line in this doc was reopened. Probe 2 (`wf/count.ts`) and Probe 3 (`wf/fix.ts`) were re-run and reproduce exactly. A new probe, `wf/psmax.ts` (seed 42, about 3 minutes), re-walked the `userOffers` path and on to the 2027 cutdown.

**Changed in place:**

1. `atCutdownDoor` citation: `trimIdentity.test.ts` 88–106 was wrong; the function is at 132–150.
2. `ProspectProfile` starts at `types.ts` 1010, not 1009.
3. **Progression snippet bug.** The draft placed the credit line after `p.yearsPro += 1`, so `accruedSeasons(p)` read the post-increment `yearsPro`. That contradicted the doc's own "5 accrued, not 6" claim. The snippet now credits before the increment.
4. Engine insertion: named the parent `rng.int` draw at `engine.ts` 132 that the tick must sit before (or after) without moving.
5. `userOffers` canary: the doc said no club held more than 4 D1 veterans before the first cutdown. The re-probe reads **5** (2026 playoffs). The conclusion still holds, because a refusal needs a 7th veteran. Added the step-boundary caveat.
6. `trimIdentity` canary: "binds the same way" overstated it. The counter materializes at the 2026 offseason progression as old `yearsPro` + credit, which is ≤ D1. It binds at most as much as D1. The conclusion (parent RNG moves before 2030) still holds.
7. `waivers.ts`: the guarantee is booked only for `bookedAtCut` entries (258–259); path 2's fallback `cutPlayer` books the bonus at the cut (`contracts.ts` 686–695). Corrected both mentions.
8. NFL numbers: the CBA article numbers (Article 33, the accrued-season article) are not in `nfl-reference.md` and are now labelled unverified. The probe's D2 thresholds (3 seasons, 6 games) and `ACCRUED_SEASON_GAMES = 6` are labelled untraced probe/placeholder numbers.
9. `jersey.test.ts` path is `lib/core/jersey.test.ts`, asserts at 83 and 88.
10. `waiverClearing.test.ts` `fillPs` fills a CPU club; Probe 3 measured user clubs only. Noted.

**Checked and correct:** the one write site (`rosterStatus.ts` 110 is the only `status = "ps"` outside tests); both CPU callers of `placeOnPs` (`waivers.ts` 248, `contracts.ts` 1711) and their refusal fallbacks; `moveWorstSurplus` ignoring `"ps"`; `foldPracticeSquad` at `offseason/index.ts` 265 and 279; the `/roster` button, handler and card lines; `nfl-reference.md` §4 614–626, §2.7b, §6.7 and the `deadMoneyPct` ungated note; every `baselines.json` value quoted; the save codec (`lib/store/codec.ts` 120–141) passes Player fields through unchanged, so the two new fields round-trip.

**Invariants and freeze.** No new RNG draw anywhere (`placeOnPs`, `tickFullPayGames`, the progression credit are field reads and writes). No dependency. The play engine never reads `accruedSeasons` or `fullPayGames`. Both live on `state.players` (invariant 4). Nothing tunes toward a target, and no band is proposed. The 6, 3 and 6 constants stay untraced placeholders until decision 1 lands in §4 (invariant 7). The doc already says so.

**Open, for Matt or a rewrite:**

- No primary text for any of the three rule numbers is in the repo. Decision 1 gates everything.
- The `yearsPro` fallback re-imports the population §4 rejected for the opening seasons, and it is exactly when the cap binds. Decision 3 should be read with that in mind.
- The `userOffers` "should not move" claim rests on step-boundary counts; only running `lib/core/userOffers.test.ts` on the implementation proves it.
- The `trimIdentity` re-lock is certain, and its new numbers are not measurable until the code exists.
- Save-size impact is an estimate, not measured.
