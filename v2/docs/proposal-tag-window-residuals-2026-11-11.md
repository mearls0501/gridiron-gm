# Tag-window residuals: void bonus and the Tag button check

**BUILT 2026-11-12.** Matt asked for this build ("do the tag-window residuals"). Changes 1–5 and decisions 1–4 were taken as proposed. Decisions 5–7 were left as written (see `HANDOFF.md`, 2026-11-12). No re-lock. No panel.

Tree: branch `claude/gracious-allen-i8ij43`, head `72ac945` (main `9e74d34`, #229). Every file:line below is from this tree.

## Verdict

#229 left two holes, and the first one is larger than its note said.

1. **Void bonus.** A tag-window Meet asking replaces an expiring deal before `expireContracts` runs. The void-year bonus the roll would have accelerated is never booked. The tag-window meter also leaves that bonus out when the player is **not** re-signed. Today the screen overstates coming-year room by the void remainder either way, and the click erases the dead money for real.
2. **Tag button.** The button still checks the closing-year book (`teamCap().space + currentHit`). The header shows `tagWindowCap`. Measured on seed 42, the button refuses a tag the meter has room for. After the user re-signs his other expiring players, the button allows a tag that leaves the meter $4.1M below zero.

The fix uses the same coming-year book for both clicks, and it stays off the CPU path. `applyFranchiseTag` keeps its current check by default. The UI passes one new argument. Headless leagues never call either user branch, so the seed-42 `userOffers` and `trimIdentity` canaries do not move.

A third hole is reported here but not fixed here. Any extension of a deal with 2+ years left drops that deal's future bonus proration, in every phase.

## Current behaviour

### The roll books void bonus; the extension does not

`runFreeAgencyOpen` runs `clearDeadCap` (`lib/core/offseason/index.ts` line 121), then `reapplyRetirementDead` (line 127), then `expireContracts` (line 128). Dead money booked by `expireContracts` therefore lands **after** the wipe, on the new league year.

`expireContracts` (`lib/core/offseason/contracts.ts` lines 606–637) skips a tagged player (line 611) and a `startsNextLeagueYear` deal (lines 613–616). Every other deal is decremented. When `yearsRemaining` reaches 0, it books `remainingBonusProration` of the rolled deal as dead (lines 626–629). For a normal final year that is $0, because `bonusProrationYears` equals `years`. For a deal with void years it is the void remainder: `bonusProrationYears - years` annual slices (`lib/core/select.ts` lines 104–121). `docs/nfl-reference.md` §4, "Void years", is the published rule: "When the real years expire the deal voids and remaining unamortized bonus accelerates onto the next league year as dead money."

In `offseason-tag`, `applyOfficeExtension` builds the new deal, sets `startsNextLeagueYear` (line 960), checks it against `tagWindowCap(...).space` (lines 962–964), and assigns `p.contract = contract` (line 973). Nothing books the old deal's leftover. Then `expireContracts` skips the new deal because of the flag (lines 613–616), so the old deal's void remainder is gone.

`tagWindowCap` (lines 243–262) sets `dead` to `retirementDeadPending` only (line 252). It does not count the void remainder that the roll will accelerate for an expiring player who is **not** re-signed. The user can also add void years to an expiring deal from `/finances` during the tag window (`app/finances/page.tsx` line 118 calls `applyVoidYears`; `addVoidYearsPreview` allows a one-year deal, `contracts.ts` lines 1094–1121). That click changes nothing on the tag-window meter today and costs dead money at FA.

The Tag button has the same leftover hole. `applyFranchiseTag` replaces the contract at line 180 and books nothing. `expireContracts` skips the tagged tender (line 611). This path feeds CPU tags (`runCpuFranchiseTags` calls it at line 334).

### The Tag button checks a different year than the header

The Tag card renders only in `offseason-tag` (`app/page.tsx` line 420). Its button calls `applyFranchiseTag(s, s.userTeamId, p.id, rng)` (line 457). The check inside is:

```ts
  const currentHit = capHit(p.contract);                       // contracts.ts:167
  const apy = franchiseTagSalary(state, p);
  const contract = startContractNow(state, makeContract(rng, apy, 1, state.season, defaultGuaranteedYears(apy, 1)));
  const hit = capHit(contract);
  const cap = teamCap(state, teamId);
  const available = cap.space + currentHit;                   // contracts.ts:172
```

The header (`components/Shell.tsx` line 125), the Hub stat (`app/page.tsx` line 142), `/finances` (line 95) and `/roster` (line 139) read `screenCap`, which is `tagWindowCap` in this phase (`lib/view/resignStep.ts` lines 14–16).

The two numbers differ in three ways:

- `teamCap` charges every other expiring player his closing hit. `tagWindowCap` charges him $0 (`nextSeasonCapHit`, `contracts.ts` lines 195–207).
- `teamCap` subtracts the closing `deadCap` and `salaryPaidOut` (`select.ts` lines 252–273). `tagWindowCap` subtracts only `retirementDeadPending`.
- A tag-window re-sign carries `startsNextLeagueYear`, so `capHit` returns 0 for it (`select.ts` line 140). Each Meet asking therefore **raises** `teamCap().space` by the old closing hit, while `tagWindowCap` falls by the new year-1 hit.

The first two make the button stricter than the header. The third makes it looser after re-signs.

CPU tags run while `state.phase` is already `"offseason-tag"`. `runRecap` sets the phase (`index.ts` line 113) before `advanceOffseason` calls `runCpuFranchiseTags` (line 375), and the `offseason-tag` case calls it again (line 383). A fix that switches on phase inside `applyFranchiseTag` would move CPU tags. The fix has to come from the caller.

`makeContract` takes no draws (`lib/core/generate.ts` line 210, `void rng`). The tender's hit can be computed and checked without touching any stream.

## Measured on this tree

Read-only probe, not committed (`npx tsx` on a scratch `.mts`, every check on `structuredClone`s). Seed 42, five tag windows (2026–2030), about 4 minutes. The walk printed the locked pair at the first window and the first FA open: tag **1779302491**, FA **1323223106**.

**Tag button vs meter, as dealt.** 133 user expiring players across five windows. 132 agree. One disagrees: 2026, QB Lee, tender $36.526M. The button's available figure is $34.168M, so it refuses. `tagWindowCap.space` is $101.513M. The header would show about $65.0M of room after the tag, and the button says no.

**Tag button vs meter, after re-signs.** 2026: Meet asking on all 13 other expiring players. `teamCap().space` rose from $33.239M to $105.144M. `tagWindowCap.space` fell from $101.513M to $32.458M. The button's available figure for Lee became $106.073M, so it allows the $36.526M tender. The meter would read **−$4.068M** after the tag. Later windows (2027–2030) had enough room that both checks passed; the user club is unmanaged on a headless walk and carries $124M–$354M of room by then.

**Void bonus, extended vs walked.** Each window: add 4 void years to the user's largest expiring hit, then compare the roll with and without Meet asking. Results:

| Season | Player | Void remainder at the roll | `deadCap` after roll, walked | `deadCap` after roll, extended | Lost |
|---|---|---:|---:|---:|---:|
| 2026 | OT Wilson II | $4.747M | $23.807M | $19.060M | $4.747M |
| 2027 | QB Carter Jr. | $3.520M | $3.520M | $0.000M | $3.520M |
| 2028 | CB Ivey | $0.960M | $3.635M | $2.675M | $0.960M |
| 2029 | TE Rutledge | $1.624M | $3.174M | $1.550M | $1.624M |
| 2030 | EDGE Ingersoll | $0.580M | $1.430M | $0.850M | $0.580M |

In every row the lost amount equals the void remainder to the dollar printed. The click did not move `rngState`. In 2026 the meter read $101.513M before the click whether or not the voids were planted, which is the second half of the hole: the walked player's $4.747M of coming-year dead is not on the screen either.

**CPU tags over void deals.** Across the same five offseasons the league had 3 expiring deals with a void remainder ($21.379M in total). No CPU club tagged any of them. On seed 42 the CPU leftover hole has not fired before 2030.

**Multi-year extensions (separate hole).** Fresh seed 42, phase set to `offseason-tag`. All 39 user deals with 2+ years left carry bonus beyond this year, $54.319M in total. Meet asking on QB Ramirez (4 years left, $6.825M of future proration) succeeded. After the roll the old $6.825M is not on the new deal and is not dead money. It is gone. The same assignment runs outside the tag window (line 973), so this is every extension, not a tag-window effect.

## Proposed diff

All edits are user-path only. No change to `teamCap`, `clearDeadCap`, `expireContracts`, `runCpuFranchiseTags`, `upcomingSeasonCommitted`, or the default behaviour of `applyFranchiseTag`.

### 1. One helper: the bonus the roll would accelerate

`lib/core/offseason/contracts.ts`, beside `comingYearCapHit`:

```ts
/**
 * Bonus `expireContracts` would book as dead for this player at the next
 * roll: the void-year remainder of an expiring deal. $0 for a tagged
 * tender, a deal that starts next league year, or 2+ years left.
 */
export function rolloverDeadAtExpiry(state: GameState, p: Player): number {
  const c = p.contract;
  if (!c || c.startsNextLeagueYear || c.yearsRemaining !== 1) return 0;
  if (isFranchiseTagged(state, p.id)) return 0;
  return Math.round(remainingBonusProration({ ...c, yearsRemaining: 0 }));
}
```

With `yearsRemaining` set to 0, `remainingBonusProration` is `annual * (bonusProrationYears - years)`, which is what `expireContracts` computes after its decrement (lines 618 and 627). It is $0 for a deal with no void years.

### 2. One team field: rollover dead that a replaced deal still owes

`lib/core/types.ts`, after `retirementDeadPending` (line 456):

```ts
  /**
   * Void-year bonus from an expiring deal the user replaced in the tag
   * window (re-sign or tag). The roll would have accelerated it onto the
   * new league year; it is posted there after the FA-open wipe. Missing = 0.
   */
  rolloverDeadPending?: number;
```

No `save.ts` normalisation. A missing field is 0 everywhere it is read. Headless leagues never set it, so their saves serialise byte-for-byte as today.

`lib/core/offseason/progression.ts` `reapplyRetirementDead` (lines 217–223), add after the retirement re-post:

```ts
    const rollover = t.rolloverDeadPending ?? 0;
    if (rollover > 0) addDeadCap(state, t.id, rollover);
    if (t.rolloverDeadPending !== undefined) delete t.rolloverDeadPending;
```

This keeps the dollars on the same side of the wipe as `expireContracts`' void acceleration. The field is deleted only where it exists, so no team gains a key.

### 3. The meter shows the rollover dead

`tagWindowCap` (lines 243–262):

```ts
  let charges = 0;
  let rollover = 0;
  let players = 0;
  for (const p of state.players) {
    if (p.teamId !== teamId || p.retired || p.prospect) continue;
    charges += comingYearCapHit(state, p);
    rollover += rolloverDeadAtExpiry(state, p);
    players++;
  }
  const t = state.teams[teamId];
  const dead = (t?.retirementDeadPending ?? 0) + (t?.rolloverDeadPending ?? 0) + rollover;
```

`tagWindowCap` has three readers: `screenCap` (`resignStep.ts` line 15), `applyOfficeExtension`'s tag branch (line 963), and, after change 5, the user Tag. No CPU path reads it. `upcomingSeasonCommitted` (lines 215–225), which prices CPU tags, is untouched.

### 4. Tag-window Meet asking books the replaced deal's rollover dead

`applyOfficeExtension`, after the refusal block and before `p.contract = contract` (line 973):

```ts
  if (tagWindow) bookRolloverDead(state, teamId, p);
  if (!tagWindow) settlePaidWeeks(state, p, teamId);
  p.contract = contract;
```

with, beside the helper:

```ts
function bookRolloverDead(state: GameState, teamId: number, p: Player): void {
  const leftover = rolloverDeadAtExpiry(state, p);
  const t = state.teams[teamId];
  if (leftover > 0 && t) t.rolloverDeadPending = (t.rolloverDeadPending ?? 0) + leftover;
}
```

On the meter the leftover moves from the `rollover` sum to `rolloverDeadPending`. `dead` does not change. The meter still falls by exactly year 1, which is what `resignStep.test.ts` line 251 locks today. After the roll, `deadCap` is the same whether the player was re-signed or walked.

### 5. The Tag button checks the coming-year meter

`applyFranchiseTag` gains a fifth argument with the current behaviour as its default:

```ts
export function applyFranchiseTag(
  state: GameState, teamId: number, playerId: number, rng: Rng,
  meter: "closing" | "comingYear" = "closing",
): SignResult {
  // ... unchanged through the contract build (line 169) ...
  const comingYear = meter === "comingYear";
  const hit = comingYear ? annualCapHit(contract) : capHit(contract);
  const available = comingYear
    ? tagWindowCap(state, teamId).space
    : teamCap(state, teamId).space + currentHit;
  if (hit > available) { /* unchanged refusal text */ }

  if (comingYear) bookRolloverDead(state, teamId, p);
  p.contract = contract;
  // ... unchanged ...
```

The coming-year branch does not add `currentHit` back. The expiring player is already $0 on that meter. The tender is year 1 of a deal the roll skips (`expireContracts` line 611), and `comingYearCapHit` already charges it at `annualCapHit` (line 233). In the offseason `startContractNow` is a no-op (`select.ts` lines 209–216), so `annualCapHit` and `capHit` agree on the tender.

`app/page.tsx` line 457:

```ts
const r = applyFranchiseTag(s, s.userTeamId, p.id, rng, "comingYear");
```

The card is inside `state.phase === "offseason-tag"` (line 420), so the argument is always right for this button. `runCpuFranchiseTags` (line 334), `owner.ts` (lines 506 and 524 through `runCpuFranchiseTags`), and every existing test call pass four arguments and keep the closing-year check.

The tagged row text, "tagged — $X this year" (`app/page.tsx` line 433, `capHit` of the tender), is the same dollar figure as the coming-year charge. It needs no change.

### Not in this diff

- **CPU tag over a void deal.** `applyFranchiseTag`'s default path still drops the void remainder. Booking it for CPU clubs would change their post-roll `deadCap`, their FA room, and with that the parent draws in bidding. Measured: zero occurrences on seed 42 through the 2030 window, 3 eligible deals league-wide in five years. That is a separate decision with its own panel.
- **Extensions of 2+ year deals.** Every extension drops the old deal's future proration (measured above, $6.825M on one QB). The realistic treatment is to keep the old proration on the books. `docs/nfl-reference.md` has no rule for bonus proration when a deal is extended or renegotiated. The primary source is the 2020 NFL-NFLPA CBA Article 13 text on renegotiated and extended contracts (`docs/nfl-reference.md` §4 cites Article 13 Sections 6–7 only for proration over the contract term; whether those sections settle the extension case is not verified here), checked against Over The Cap per-player cap histories for extensions signed over existing proration. Until that is traced into §4, this stays a reported hole and ungated.
- **The void-year desk preview** (`addVoidYearsPreview`, lines 1094–1121) quotes closing-year savings in the tag window. With change 3 the meter will show the rollover cost. The preview text is a separate UI change.
- **Tag-window cut or trade of an expiring void deal.** Cuts and trades are open in `offseason-tag` (`cutRefusal` has no phase gate, `contracts.ts` lines 663–668; `tradeWindowOpen` returns true for every offseason phase, `lib/core/trades.ts` lines 311–314). `cutPlayer` books the remainder on `deadCap` (`contracts.ts` lines 691–695), and `clearDeadCap` wipes it at FA open (`select.ts` lines 332–337). Measured (review probe, seed 42 fresh, phase set to `offseason-tag`, OT Wilson II with 4 void years, L = $4.747M): after the roll `deadCap` is $4.747M walked and $0.000M cut. Today the meter reads the same for both ($90.038M). With change 3 the walked meter falls by L and the cut meter does not, so the cut shows as L of room and the dollars vanish. Whether a pre-league-year release lands on the closing year is not in `docs/nfl-reference.md` §4 (it has the wipe and "No June-1 split", not the timing of a release against a void date). Not fixed here; Matt should know change 3 makes this visible.
- **Re-sign before the void date as a carry-forward.** Change 4 books the void remainder as dead, the same as walking. The alternative is to fold it into the new deal's proration. That needs the same untraced CBA rule as the bullet above. This proposal takes the traced rule (§4 "Void years": acceleration onto the next league year).

## Regression test

All new cases go in `lib/view/resignStep.test.ts`. It is already `resignstep` in both gate tiers (`scripts/gate.ts` lines 95 and 184) and in the `package.json` `test` script. No new file, no `scripts/` edit. `lib/core/franchiseTag.test.ts` stays as it is and keeps locking the default path.

1. **Walked void deal is on the meter.** Phase `offseason-tag`. Plant an expiring user player. `applyVoidYears` succeeds. `L = rolloverDeadAtExpiry(st, p)` is above 0. `tagWindowCap(...).dead` equals `retirementDeadPending + L`. Clone, run `clearDeadCap`, `reapplyRetirementDead`, `expireContracts`. `deadCap` equals `retirementDeadPending + L`.
2. **Extended void deal books the same dollars.** Same plant. Record meter `dead` and `space`. `submitOfficeOffer(..., true)` succeeds. `rngState` unchanged. Meter `dead` unchanged. Meter `space` falls by `annualCapHit` of the new deal (tolerance $1). `team.rolloverDeadPending === L`. After the same three calls, `deadCap` equals case 1's, and `rolloverDeadPending` is absent from the team object.
3. **No void, no field.** Meet asking on an expiring deal with `bonusProrationYears === years`. `rolloverDeadPending` stays `undefined`.
4. **Tag button, stricter case.** Plant `deadCap` so `teamCap().space + capHit(old)` is below the tender and `tagWindowCap(...).space` is above it (the QB Lee shape). The default call refuses with "Not enough cap space". The `"comingYear"` call on a clone succeeds, and the meter falls by `annualCapHit` of the tender (tolerance $1).
5. **Tag button, looser case.** Meet asking on every other expiring player until `tagWindowCap(...).space` is below the tender while `teamCap().space + capHit(old)` is above it. `"comingYear"` refuses, and the reason quotes the meter's available figure. The default call on a clone still succeeds; that line locks the CPU check as unchanged.
6. **Tag over a void deal.** Planted void on the tag target. `"comingYear"` books `L` to `rolloverDeadPending`; meter `dead` does not change. The default call on a clone leaves `rolloverDeadPending` undefined (current CPU behaviour, locked on purpose until Matt signs the CPU decision).
7. **Off-window read.** Phase `offseason-fa`: `screenCap(...).dead` is still `team.deadCap`. The existing case at lines 272–282 already does this (the `screenCap` assert is line 280); extend it to set `rolloverDeadPending` and confirm `teamCap` ignores it.

Then `npx tsx lib/view/resignStep.test.ts`, `npx tsx lib/core/franchiseTag.test.ts`, `npx tsx lib/core/retirementDead.test.ts`, `npx tsx lib/core/userOffers.test.ts`, and `npx tsx lib/core/trimIdentity.test.ts`.

## Gate, canaries

No headless path calls `submitOfficeOffer`, the `"comingYear"` branch, or `tagWindowCap`. `rolloverDeadPending` is never set on a headless league, and `reapplyRetirementDead` writes nothing when it is absent. No change adds or removes an RNG draw: `makeContract` takes none, and `contractOfficeChildRng` does not write `state.rngState` (`contracts.ts` lines 888–895). **The proposal does not move the parent RNG before either canary point.**

| Check | Why it stays | What would move it |
|---|---|---|
| `userOffers` seed 42, tag `1779302491` / FA `1323223106` (`lib/core/userOffers.test.ts` lines 129 and 133) | The walk is headless (`advance` / `advanceOffseason` only, lines 117–127, then line 131). CPU tags go through `applyFranchiseTag`'s default `"closing"` check, byte-identical. `reapplyRetirementDead` runs between the two literals (`index.ts` line 127) and reads an absent field. The probe printed this pair on the unchanged tree. | Switching `applyFranchiseTag` on `state.phase` instead of an argument (CPU tags run in `offseason-tag`, `index.ts` lines 113, 375, 383). Booking rollover dead on the CPU default path. Writing `rolloverDeadPending = 0` on every team. Stop and revert that part. Do not edit the literals. |
| `trimIdentity` seed 42 opening 2030, 1600 cuts, rng `2524091302` (`lib/core/trimIdentity.test.ts` line 21) | Headless walk (`advanceOffseason`, lines 144 and 156). No user re-sign or user tag. No CPU tag over a void deal happened on seed 42 through the 2030 window (measured), so even the deferred CPU fix would not reach this point; it is still not in this diff. | Same as above, plus any edit to `expireContracts` or `clearDeadCap`. |
| `drift.deadMoneyPct` | Report-only, no band (`docs/nfl-reference.md` §4, ~5–8% Over The Cap). Read at preseason from `Team.deadCap` (`scripts/drift.ts` line 259). Headless clubs never set the new field. | The CPU-tag void booking listed under "Not in this diff". That one would raise it slightly. |
| `drift.franchiseTagsPerSeason` (locked 14 ±4) | CPU tags keep the closing check and `tenderFitsHeadroom` (`contracts.ts` lines 269–272). | Any change to the default check or to `upcomingSeasonCommitted`. |
| `drift.capBustSeasons`, `drift.topCapPctMean`, `drift.medianPayrollPct` | In-season snapshots of `teamCap` and `annualCapHit`. Neither function changes. User clicks are absent from headless runs. | An edit to `teamCap`, `capHit`, or `annualCapHit`. |
| `verify`, `determinism` | No new `Math.random` / `Date`; no new draw; the save stays plain JSON (one optional number). | n/a |
| `e2e.mjs`, `e2e-desks.mjs` | They look for "Cap Space", "Meet asking" and the tag-window rows (`noteTagResignStep`, `e2e-desks.mjs` lines 28–40). They do not click Tag and do not assert a dollar figure. | A changed button label or card structure. This diff changes neither. |

No `baselines.json` edit. No metric moves on the headless path, so there is nothing to re-lock and no panel to run for this change. The deferred CPU-tag decision, if signed, would need its own `drift` read.

## Untraced numbers

The fix itself uses no real-NFL rate. The rule it relies on, void remainder accelerating onto the next league year, is `docs/nfl-reference.md` §4 "Void years". Two things it does not settle are not in that file:

- How bonus proration is treated when a deal is extended or renegotiated before it voids or expires (carry-forward vs acceleration). Primary source: CBA Article 13 text (section not verified here), checked against Over The Cap per-player cap histories of real extensions. Ungated.
- How often real clubs tag or re-sign a player whose deal carries void years. Primary source: Over The Cap / Spotrac contract histories joined to the tag list. Not needed for this fix. Ungated.

## Decisions for Matt

1. **Book the void remainder of a user-replaced expiring deal as next-league-year dead** (changes 1, 2, 4), the same dollars the roll books when he walks. Or leave it dropped.
2. **Show that rollover dead on the tag-window meter** for expiring players who are not re-signed (change 3). Without it, the meter overstates coming-year room by the void remainder, and decision 1 would make re-signing look more expensive than walking.
3. **New optional field `Team.rolloverDeadPending`, posted in `reapplyRetirementDead`.** The alternative is to reuse `retirementDeadPending`, which avoids a field but mislabels the dollars.
4. **User Tag checks `tagWindowCap`** through a `"comingYear"` argument passed only from `app/page.tsx` line 457, with `"closing"` as the default so CPU tags and the `userOffers` canary do not move (change 5). That includes booking a tagged void deal's remainder on the user path.
5. **Leave CPU tags over void deals as they are** for now (default path keeps dropping the remainder; zero occurrences on seed 42 through 2030). Or open a separate packet with a `drift` read.
6. **Leave the 2+ year extension hole reported, not fixed**, until the CBA extension-proration rule is traced into `docs/nfl-reference.md` §4.
7. **Accept that change 3 exposes the tag-window cut / trade dodge** (an expiring void deal cut or traded before Continue loses its remainder in the wipe, and the meter will show that as room). Or gate change 3 on a decision for that path first.

## Review (2026-11-11)

Adversarial pass on this tree (`72ac945`). Every file:line was opened. The seed-42 2026 window was re-measured with a read-only probe (about 10 s): rng 1779302491 at the tag window; 14 expiring; `tagWindowCap.space` $101.513M, `teamCap().space` $33.239M; QB Lee is the only disagreement (tender $36.526M, button $34.168M); after Meet asking on the other 13, `teamCap` $105.144M, meter $32.458M, button $106.073M (meter −$4.068M after a tag); OT Wilson II void remainder $4.747M, `deadCap` after roll $23.807M walked vs $19.060M extended, `rngState` unchanged. Fresh seed 42: 39 deals with 2+ years, $54.319M future proration; Ramirez $6.825M, `deadCap` $0 after the roll. The 2027–2030 rows and the CPU-tag counts were not re-run.

Changed in this doc:
- `generate.ts` `void rng` is line 210, not 209.
- `userOffers.test.ts`: the literals are lines 129 and 133 (not 126 and 130); the walk is lines 117–127, then `advanceOffseason` at 131.
- `resignStep.test.ts` off-window case is lines 272–282 (assert at 280), not line 277.
- `e2e-desks.mjs` tag-window check is `noteTagResignStep`, lines 28–40, not line 28 alone.
- The CBA "Article 13 §6–7" pointer for extension treatment was presented as the governing text. `nfl-reference.md` §4 cites those sections only for proration over the term. Relabelled as an unverified pointer; the axis stays ungated.
- Added the tag-window cut / trade residual under "Not in this diff" (measured) and decision 7.

Checked and left as written: every other citation in `contracts.ts`, `select.ts`, `index.ts`, `progression.ts`, `types.ts`, `resignStep.ts`, `app/page.tsx`, `Shell.tsx`, `finances`, `roster`, `owner.ts`, `gate.ts`, `drift.ts` line 259, `baselines.json` (`franchiseTagsPerSeason` 14 ±4; no `deadMoneyPct` band). The §4 "Void years" quote and the ~5–8% Over The Cap note are in `nfl-reference.md` §4. No other real-NFL rate is used.

Invariants: no new draw (`makeContract` ignores its rng; `contractOfficeChildRng` does not write `state.rngState`; probe confirms). No dependency. The sim does not read the new field or the meter. No tuning toward any band; no `baselines.json` edit.

Canaries: `submitOfficeOffer`, `applyVoidYears` (user), `cutPlayer` (user) and the proposed `"comingYear"` branch are called only from `app/`. `tagWindowCap` is read only by `screenCap` and `applyOfficeExtension`. CPU tags run at `index.ts` lines 375 and 383 and from `owner.ts` 506/524, all through the 4-argument default. `reapplyRetirementDead` already writes `retirementDeadPending = 0` on every team; the proposed `delete` runs only where the new field exists. The claim holds: neither the `userOffers` pair nor the `trimIdentity` point moves, provided the implementation keeps the default argument and never writes the field on headless teams.

Open:
- Tag-window cut / trade of an expiring void deal (above). Change 3 makes it look like free room.
- Change 3 also makes tag-window Meet asking stricter for every other player by the walkers' void remainder. That is intended but is a user-visible behaviour change that the regression plan does not test directly.
- Extension proration and CPU-tag void booking stay reported, unfixed, ungated.

