# Phase 5: LLM narration behind a thin proxy

**UNSIGNED.** This is a proposal. It does not change the sim, a test, `scripts/`, `docs/baselines.json`, a canary, or `AGENTS.md`. Matt signs any change, including the invariant 5 wording it asks for.

Tree: branch `claude/gracious-allen-i8ij43` at `72ac945`, the merge of `9e74d34` (#229) onto the branch. `main` in this clone is `aa114db`. Every file:line below is from `72ac945`. Probe: one seed-42 season, run with `npx tsx` from a scratch script. It imports repo modules and writes nothing back to the repo.

## Verdict

Phase 5 can ship without touching the simulation, the save, or the parent RNG. Prose is extra text beside the deterministic text that is already on screen. It is built from the same view models those screens render. A Next.js route on Vercel holds the key. The client reaches that route with the game's only `fetch`, and caches prose in a separate IndexedDB database, never in `GameState`. The proposal needs three signatures:

1. An amendment to invariant 5.
2. A monthly spend ceiling.
3. A choice between raw HTTP and the `@anthropic-ai/sdk` package for the one server file.

## What the brief rests on

- `AGENTS.md` lines 12–14: "No database, no backend, no API keys, no network." Lines 60–63 (invariant 5): "Do not call an API. Do not introduce a server." Lines 65–68 allow it, but only in the future tense: "An LLM may eventually write prose the player is already looking at … behind a thin proxy. It will never be in a decision loop."
- `docs/ROADMAP.md` lines 159–163 (Phase 5): scouting-report prose, season recaps, and a press conference after a loss. Thin proxy, keys off the client, fully optional so offline play survives, never in a decision loop. Status: not started.
- `docs/HANDOFF.md` lines 5495–5496: "Phase 5 stays LLM narration (scouting prose, season recaps, pressers)."
- `lib/core/season/briefing.ts` lines 17–22: the weekly briefing is "one deterministic digest … No RNG, no mutation — the same save renders the same briefing forever, which is exactly the property an eventual LLM narrator would sit on top of."

As shipped, invariant 5 forbids this proposal. Lines 65–68 describe what the proposal builds, but the text above them has to change before code lands. The wording to sign is under Proposed change §6.

## Current behaviour, by surface

### Network

The tree has no network code. A grep for `fetch(` over `app/`, `lib/` and `components/` returns nothing. There is no `app/api/` directory. `next.config.ts` lines 6–14 set no `output: "export"`, so a Next route handler is allowed on Vercel. Production is `https://gridiron-gm-nine.vercel.app` (`docs/playtest-1028-resign-cap-space.md` line 3; `docs/HANDOFF.md` line 8307). `package.json` lines 34–39 list four runtime dependencies (`next`, `react`, `react-dom`, `zustand`). There is no Anthropic SDK.

### Scouting report

`prospectReports` (`lib/core/scouting-reports.ts` lines 442–514) writes the file on one prospect. It is assembled from phrase tables, keyed by `hash32(state.seed, p.id, 0x5c07)` (line 448). It reads the user's scouted bands through `attrBand` (lines 450–453), not the truth: "a wrong band writes a wrong report — that is the game" (lines 434–441). The module header (lines 30–32) says: "stable hashes only, no RNG draws, no stored state, no save growth." The draft page renders the report under "The File" (`app/draft/page.tsx` lines 1170–1183).

### Season recap

`presentSeasonReview` (`lib/view/seasonReview.ts` lines 285–351) is "Read-only … Nothing is written. Nothing is invented" (lines 6–14). It returns record, finish, champion, awards with stat lines, leaders, retirements, development rows and user games (`SeasonReviewView`, lines 75–90). The champion is a `championId` number, not a name, so the recap payload builder must resolve it to a city and nickname. `DevelopmentRow` carries a whole `player: Player` object (lines 57–63), so the builder must copy fields out, never spread the row. `app/recap/page.tsx` line 45 builds the view and line 64 renders it through `SeasonReviewPanels` (`components/SeasonReview.tsx`).

### Post-loss press conference

No press conference exists today. The nearest surface is `buildBriefing(state).yourGame` (`briefing.ts` lines 388–406). That is a `GameStory` with `won`, `final`, `turningPoint`, `stars` and `duds` (lines 33–40), built by `buildGameStory` (lines 111–151). The Hub week page renders it as "The Week That Was" (`app/week/page.tsx` lines 89–132; the `Card` closes at line 131).

### Settings

`GameSettings` (`lib/core/types.ts` lines 819–836) lives on the save (`types.ts` line 1559). Its contract is: "None of these may alter the simulation itself … Settings gate what the game DOES ABOUT events, never whether they happen." The user types free text in two places, not one. The first is the franchise name (`app/settings/page.tsx` lines 55–62, `maxLength={40}`; also `components/NewGameScreen.tsx` lines 95–99, with no `maxLength`), stored as `state.name` (`lib/core/generate.ts` line 556). The second is the war-room scout's note on a prospect (`app/draft/page.tsx` lines 1145–1160), stored as `BoardNote.note` (`lib/core/types.ts` line 1079) in `state.scouting.board` (line 1092). That note input sits on the same panel as "The File", the scouting surface this proposal narrates. The save id embeds the seed: `save-${seed}-${season}` (`generate.ts` line 555).

### Persistence

Saves live in IndexedDB database `gridiron-gm`, `DB_VERSION = 1`, stores `saves` and `meta` (`lib/store/save.ts` lines 31–47).

### Determinism guard

`scripts/determinism.ts` hashes `GameState` without `createdAt`/`updatedAt` (lines 41–49). It replays one season and the playoffs (lines 72–88) and bans `Math.random`, `Date.now`, `new Date()` and `performance.now` outside `rng.ts` and two store files (lines 151–159), with a budget of three in `generate.ts` (line 164). The scan walks `lib/` and `app/` only (lines 200–201), so `components/` is not scanned. It does not scan for `fetch`.

## Measured on this tree (`72ac945`)

Probe: `newGame({ seed: 42 })`. Each presenter is wrapped in a check that hashes the state (same `META_KEYS` exclusion as `determinism.ts`) and reads `rngState` before and after the call. The probe made these calls:

- Preseason: `gradeContext` once, then `boardGrade`, `consensusGrade`, `prospectTraits` and `prospectReports` for the department's top 100 prospects.
- Every regular-season week: `advance`, then `buildBriefing`.
- After the playoffs: `presentSeasonReview` at `offseason-recap`.

The payload sizes below are `JSON.stringify` lengths of the field whitelist proposed under §2.

| Read | Value |
|---|---|
| Presenter calls checked | 120 |
| Calls that changed the state hash or `rngState` | **0** |
| Phase at end | `offseason-recap` |
| `rngState` at end | **1779302491**, the `userOffers` tag literal (`lib/core/userOffers.test.ts` line 129) |
| User club, seed 42 | Boston, 17 games, **12 losses** (5-12) |
| Scouting payload, 100 prospects | mean **775** chars, max **974** |
| Presser payload, 12 losses | mean **521** chars, max **647** |
| Recap payload | **1,576** chars |

Reviewer reproduction (2026-11-11, same tree, independent scratch script): every presenter call counted individually (1 `gradeContext` over all 1,173 prospects, 4 calls × top 100, 17 `buildBriefing`, 1 `presentSeasonReview`) is 420 calls, **0** of which changed the state hash or `rngState`. `rngState` read **1779302491** at `offseason-recap` and again at `offseason-tag`. Boston, 5-12, 12 losses. The "120" above counts per-prospect groups, not single calls. Payload sizes depend on the exact field spelling: the reviewer's whitelist read scouting mean 844 / max 1,073 and presser mean 504 / max 630. Both are under the 4,096 cap. 54 of the 100 scouting payloads carry digits inside report text (`#12 on our board`), which matters for the number check in §4.

The canary's own path stops at `offseason-tag` and reads 1779302491 there. The probe stops one phase earlier, at `offseason-recap`, with the same value. Together the two runs mean 120 presenter calls on the way did not move the parent stream, and the recap → tag step draws nothing on this seed. All three presenters the proposal reads are pure today.

These are not measured: token counts, latency, and refusal rates. Exact tokens need `POST /v1/messages/count_tokens`, which needs a key and network. Neither was used. The token figures below assume about 4 characters per token. They are estimates and are labelled that way.

## Proposed change

### 1. Proxy shape

Add one server file, `app/api/narrate/route.ts`. It is a Next.js route handler and deploys as a Vercel function. It is the only server code in the repo.

- **Input.** `POST` with JSON `{ v: 1, kind: "scouting" | "recap" | "presser", payload: {...} }`. Any other `kind` gets 400. A body over 4 KB gets 413. The measured max payload is 1,576 chars, so 4 KB leaves headroom.
- **Validation.** The route validates `payload` against a fixed, per-kind field whitelist (§2). It rejects any unknown key, any non-string or non-number leaf, and any string over 200 chars. No free-text prompt crosses the wire. The system prompt and the instruction text live only in `route.ts`. The proxy is therefore not a general LLM relay: a caller can only ask for one of three prose shapes about structured fields.
- **Key.** `process.env.ANTHROPIC_API_KEY` is set in the Vercel project environment. It never has a `NEXT_PUBLIC_` prefix, so Next never bundles it to the client. With no key, or with `NARRATION_ENABLED !== "1"`, the route returns `503 { ok: false }` and makes no upstream call. That makes `NARRATION_ENABLED` the kill switch.
- **Upstream call.** One `POST https://api.anthropic.com/v1/messages` with these settings:
  - headers `anthropic-version: 2026-10-21` and `x-api-key`
  - `model: "claude-haiku-5-5"`
  - `max_tokens` 350 for scouting and presser, 600 for recap
  - `thinking: { type: "disabled" }` with `output_config: { effort: "low" }` (Haiku 5.5 accepts disabled thinking at effort `high` or below)
  - no `temperature`, which 400s on `2026-10-21`
  - These settings are for Haiku 5.5 only. `claude-sonnet-5-5` returns 400 on `thinking: { type: "disabled" }`; a Sonnet recap (Decision 3) must omit `thinking` or send `{ type: "between_tools" }` at effort `high` or below. The model ids, the prices in §5, the `temperature` rule and the Haiku thinking rule were checked against the Claude API reference cached 2026-11-03. They are not NFL numbers, they do not need `nfl-reference.md`, and they should be re-checked live before signing.

  `AbortSignal.timeout(8000)` bounds the call, and the route does not retry it.
- **Output.** `200 { ok: true, text }` only when all three hold: `stop_reason` is `end_turn`, the text passes the number check (§4), and it is under 2,000 chars. In every other case the route returns `200 { ok: false }`. The client never sees an Anthropic error body, a model id or usage figures.
- **Abuse.** The route accepts only same-origin requests (`Origin` must equal the deployment host). This stops other web pages from calling it from a browser. It does not stop a script, which can set any `Origin` header it likes. The firewall rule and the spend limit below are the only real bounds. It adds no counter store, because that would be a new service. Two settings bound spend: a Vercel Firewall rate-limit rule on `/api/narrate`, set in the dashboard with no code, and an Anthropic workspace monthly spend limit, which is the hard ceiling. The cap amount is a decision for Matt.
- **No bring-your-own key.** The brief says keys stay off the client. A user-pasted key would live in the browser, so it is out.

### 2. What game state is sent, and what never is

The client builds the payload from the view model the screen is already rendering, never from `GameState` directly. Every leaf is a string or number that the screen prints.

| kind | fields (all from what the screen shows) | source |
|---|---|---|
| `scouting` | `name`, `pos`, `college`, `board` (grade label), `market` (consensus label), `traits[]` (`label`, `verdict`, `certain`), `reports[]` (`who` = source role, `text`) | `boardGrade` / `consensusGrade` (`scouting-reports.ts` 166–190), `prospectTraits` (219–230), `prospectReports` (442–514) |
| `presser` | `club` (city + name), `final`, `turningPoint`, `stars[]` and `duds[]` (`name`, `pos`, `team` abbr, `line`) | `GameStory` (`briefing.ts` 33–40) |
| `recap` | `season`, `record`, `finish`, `champion`, `awards[]` (`award`, `name`, `line`), `leaders[]` (`cat`, `name`, `value`), `development[]` (`name`, `delta`, `line`), `games[]` (`opp`, `home`, `us`, `them`) | `SeasonReviewView` (`seasonReview.ts` 75–90); `delta` is the development row's number, printed by `components/SeasonReview.tsx` line 137 |

The following must never be sent. The payload test asserts the absence of each key.

- **`seed`, `rngState`, and the save `id`.** The id embeds the seed (`generate.ts` line 555). The seed alone regenerates the league, including every hidden rating.
- **A prospect's true `ovr`, `pot`, `ceiling`, `attrs`, `scoutedOvrLow`/`High`, band numbers, and `cpuProspectView` output.** The war room never shows numbers (`scouting-reports.ts` lines 18–21). Prose written from the truth would leak it: if the model is handed true `pot`, "a future Pro Bowler" is a scouting cheat. Hidden `ceiling` "is never scoutable by anyone, ever" (`AGENTS.md`, scouting paragraph).
- **Other clubs' private state:** cap books, CPU beliefs, front-office dials, staff budgets.
- **Player or team `id` numbers.** The prose needs names, and an id helps nobody.
- **`state.name`, the board note, and any other user-typed text.** These are the two free-text inputs (franchise name: `app/settings/page.tsx` lines 58–62; scout's note: `app/draft/page.tsx` lines 1145–1160, `BoardNote.note`), and both are prompt-injection paths. The scouting payload must not read `state.scouting.board`. The club is named by its generated city and nickname.
- **Anything identifying the browser or the person.** The proxy logs nothing beyond Vercel's default request log.

### 3. Caching: not in the save

Prose is cached in a **separate** IndexedDB database, `gridiron-gm-narration`, with one object store. It does not go in `GameState`, and the database is not a third store in `gridiron-gm`.

- **Key:** `${saveId}|${kind}|${subject}|v${PROMPT_VERSION}|${fnv1a(JSON.stringify(payload))}`. `subject` is the prospect id, the game id or the season. It stays local and is never sent. The payload hash means a changed scouting band gets fresh prose, while an unchanged one reuses the cached prose.
- **Eviction:** at most 400 rows per `saveId`, oldest by a monotonically increasing insertion counter. No clock is read. This matters today, not only after a move: the source scan already walks all of `lib/` and `app/` (`scripts/determinism.ts` lines 200–201), so `lib/narration/*` and `app/api/narrate/route.ts` are scanned. `components/Narration.tsx` is not, so it must not read a clock either.
- **No save migration.** `lib/store/save.ts` and its `DB_VERSION` are untouched, so a failed upgrade of the narration database cannot brick a franchise. `exportSave` does not carry prose. An imported save shows the deterministic text and regenerates prose on view.

Why not the save. A working estimate is about **113 calls a season**: 100 scouting files + 12 pressers + 1 recap, using the probe's counts. It is not an upper bound. Seed 42 has 1,173 prospects in the class, and any of them can be focused. The cache key hashes the payload, so a prospect whose bands tighten after a visit or workout gets a fresh call on the next focus. At roughly 1.2 KB of prose each, about 0.14 MB a season goes on disk, or about 2.7 MB over 20 seasons. The signed growth lock is `drift.saveGrowthMbPerSeason` max **0.61**, a panel of 0.56 + 0.05 (`docs/baselines.json` lines 351–354). The end lock is `drift.saveMbAtEnd` max **15.89** against a 20 MB quota (lines 355–358). In-save prose would spend the 0.05 headroom roughly three times over every season in a real browser. `drift` runs headless and never narrates, so it would read green while real saves grew. That is the same blind-guard failure `AGENTS.md` warns about. The 1.2 KB figure is an estimate of 350 output tokens × ~3.5 chars, not a measurement.

The cost of keeping prose out of the save: a replayed or exported save shows different prose from the first viewing, unless the cache row survives. The facts do not change, because the deterministic text stays on screen (§4). Matt signs this trade.

### 4. Failure behaviour

The rule: **the screen is complete before any prose arrives, and complete if none ever does.**

- **Off by default.** The opt-in is a per-device toggle, held in `localStorage` key `gg.narration` and shown on `/settings` beside the franchise options. It does not go in `GameSettings`. An exported save opened in another browser must not start making network calls, and the save JSON stays byte-identical.
- **When a call is made.** Only when all four hold: the toggle is on, `navigator.onLine` is true, the panel is mounted on screen, and there is no cache hit.
  - Scouting: one call per prospect focused in the war room. There is no prefetch across the board.
  - Presser: when the week page shows a lost `yourGame`.
  - Recap: when `/recap` mounts.

  Hub sim, Sim-to, draft-night pacing and offseason stepping never call or await narration. `lib/store/game.ts` is not touched.
- **Rendering.** Prose appears in a separate labelled block ("Press room", "Scout's notes", "The year in words") below the existing deterministic text, which is never replaced. While the call is in flight the block shows nothing. It does not show a spinner that delays the page. When the call returns `ok: false`, times out, gets a 503, or the browser is offline, the block stays absent. A failure is not retried within a page view.
- **Number check, on the server and again on the client.** Every digit run in the prose must appear among the payload's numbers. "The payload's numbers" must mean every digit run found anywhere in the payload, including inside string leaves. The presser's `final` ("Riverboats 27, Summit 20") and stat `line`s, and the board-slot numbers in 54 of 100 scouting reports, are strings. A check against number leaves only would reject almost every presser. The check does not catch spelled-out numbers ("twenty years") or record claims without digits ("a franchise record"). The system prompt is the only guard against those. Otherwise the prose is dropped. Invariant 7 forbids an untraced NFL figure in a calibration number. This check stops the model from printing one to the player either ("most sacks since 1984"), and it stops invented stat lines.
- **Refusal.** Haiku 5.5 has no server-side fallback. Any `stop_reason` other than `end_turn` (refusal, `max_tokens`) is `ok: false`. The deterministic text is still there.

### 5. Cost envelope

Prices come from the Anthropic first-party per-MTok table as cached on 2026-11-03: Haiku 5.5 $0.10 in / $0.50 out (for prompts up to 100K tokens), Sonnet 5.5 $2.00 / $10.00. Re-check the live pricing page before signing. Tokens are estimated at about 4 chars each: a system prompt of about 600 tokens plus a payload of 130–400, so about **1,000 input** and at most **350 output** per call (600 for the recap).

| | per call | per user-season, ~113 calls | per 1,000 user-seasons |
|---|---:|---:|---:|
| `claude-haiku-5-5` | ~$0.0003 | ~$0.034 | ~$34 |
| `claude-sonnet-5-5` | ~$0.0055 | ~$0.62 | ~$620 |

These are probe-count seasons (top 100 files, every loss), not worst cases. A user who focuses more of the 1,173-prospect class, or re-focuses prospects after new intel, makes more calls. The workspace spend limit is the only hard bound. Prompt caching is not counted. A 600-token system prompt may sit below the model's minimum cacheable prefix, so the table assumes no cache hits. Vercel function invocations and duration are billed under Vercel's plan and are not estimated here.

Recommendation: ship on `claude-haiku-5-5`. Move one kind (the recap: once a season, longest payload) to `claude-sonnet-5-5` only if Matt reads Haiku's recaps and wants more. The workspace spend limit is the ceiling either way.

### 6. Diff (sketch)

New files: `app/api/narrate/route.ts`, `lib/narration/payload.ts`, `lib/narration/client.ts`, `components/Narration.tsx`. Edited files: three screens, `/settings`, `AGENTS.md`, and the #47 test registration.

`lib/narration/payload.ts`: pure, imports `lib/view` and `lib/core` types only, and contains no `fetch`.

```ts
export type NarrationKind = "scouting" | "presser" | "recap";
export const PROMPT_VERSION = 1;

export function presserPayload(state: GameState, story: GameStory) {
  const t = state.teams[state.userTeamId];
  const row = (s: StatLineNote) => ({ name: s.name, pos: s.pos, team: s.teamAbbr, line: s.line });
  return { club: `${t.city} ${t.name}`, final: story.final, turningPoint: story.turningPoint,
           stars: story.stars.map(row), duds: story.duds.map(row) };
}
// scoutingPayload(state, p, ctx) and recapPayload(state, view) follow the §2 table.
export const NEVER_SEND = ["seed", "rngState", "id", "ovr", "pot", "ceiling", "attrs",
  "scoutedOvrLow", "scoutedOvrHigh", "scoutedPotLow", "scoutedPotHigh", "teamId", "playerId",
  "gameId", "championId", "player", "note", "board"] as const;
// `GameStory` carries `gameId` and each `StatLineNote` carries `playerId`; `DevelopmentRow` carries `player`.
```

`lib/narration/client.ts`: the only `fetch` in the client bundle.

```ts
export async function narrate(saveId: string, kind: NarrationKind, subject: string, payload: object): Promise<string | null> {
  if (!narrationOn() || typeof navigator !== "undefined" && !navigator.onLine) return null;
  const key = cacheKey(saveId, kind, subject, payload);
  const hit = await cacheGet(key); if (hit) return hit;
  try {
    const r = await fetch("/api/narrate", { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ v: 1, kind, payload }), signal: AbortSignal.timeout(9000) });
    const j = await r.json();
    if (!j.ok || !numbersTrace(j.text, payload)) return null;
    await cachePut(saveId, key, j.text);
    return j.text;
  } catch { return null; }
}
```

`app/api/narrate/route.ts`, outline:

```ts
export async function POST(req: Request) {
  if (process.env.NARRATION_ENABLED !== "1" || !process.env.ANTHROPIC_API_KEY) return json(503, { ok: false });
  if (req.headers.get("origin") !== expectedOrigin(req)) return json(403, { ok: false });
  const raw = await req.text(); if (raw.length > 4096) return json(413, { ok: false });
  const body = parseAndWhitelist(raw); if (!body) return json(400, { ok: false });
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST", signal: AbortSignal.timeout(8000),
    headers: { "content-type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY,
               "anthropic-version": "2026-10-21" },
    body: JSON.stringify({ model: "claude-haiku-5-5", max_tokens: MAX[body.kind],
      thinking: { type: "disabled" }, output_config: { effort: "low" },
      system: SYSTEM[body.kind], messages: [{ role: "user", content: JSON.stringify(body.payload) }] }),
  }).catch(() => null);
  const m = res && res.ok ? await res.json() : null;
  const text = m?.stop_reason === "end_turn" ? m.content.filter((b: any) => b.type === "text").map((b: any) => b.text).join("") : "";
  return json(200, text && text.length < 2000 && numbersTrace(text, body.payload) ? { ok: true, text } : { ok: false });
}
```

`SYSTEM[kind]` tells the model to use only names and numbers in the payload, to state no real-NFL history or records, to write in the voice of the area scout, the head coach at the podium, or the beat writer, and to stay under 120 words (200 for the recap).

Screens, additive only:

- `app/draft/page.tsx`: after line 1183, `<Narration kind="scouting" …/>`
- `app/week/page.tsx`: inside the `yourGame` card when `!won`, after line 130 (the duds block) and before `</Card>` at line 131
- `app/recap/page.tsx`: after `<SeasonReviewPanels …/>` at line 64
- `/settings`: one checkbox that writes `localStorage`

`AGENTS.md` invariant 5, replace lines 60–68 with:

> ### 5. No backend, no LLM in the sim, no new dependencies
> Everything must survive `JSON.stringify` / `JSON.parse` unchanged. Do not add a package. The one server is `app/api/narrate/route.ts`; the one client network call is `lib/narration/client.ts`. Narration writes prose the player is already looking at — scouting file, season recap, post-loss presser — off by default, never stored on `GameState`, never imported by `lib/core`, `lib/store` or `lib/view`, never awaited by a sim step. Deterministic replay is what makes this codebase testable, and no prose is worth trading it away.

Lines 12–14 change to "No database, no API keys on the client, and no network in the simulation."

**Raw HTTP or the SDK.** Raw `fetch` keeps the "no new dependencies" rule whole. The `@anthropic-ai/sdk` package would bring typed errors and responses to the one server file, at the cost of one dependency. The proposal is written for raw HTTP. Matt chooses.

## Regression test plan

Two new test files. Each is registered in `package.json` `test` and as a named step in `scripts/gate.ts` FAST and FULL. That is the one permitted `scripts/` edit (#47 convention).

**`lib/narration/payload.test.ts`**, seed 42:

1. Replay the probe: build every scouting payload for the top 100 at preseason, a presser payload after each regular-season loss, and the recap payload at `offseason-recap`. After each build, the state hash (same `META_KEYS` exclusion) and `rngState` are unchanged.
2. At `offseason-recap`, `rngState === 1779302491`.
3. Walk every payload: no key in `NEVER_SEND`, every leaf a string or number, no string over 200 chars, `JSON.stringify` under 4,096 chars. The measured max is 1,576.
4. For every prospect in the payload set: none of `p.ovr`, `p.pot`, `p.ceiling` appears as a number leaf. This is a coarse check, because only verdict words and labels are sent.
4a. Set a board note with a sentinel string (`setBoardNote`, `lib/core/scouting.ts` line 819) on every top-100 prospect and a sentinel franchise name, then confirm no payload contains either sentinel.
5. Write a fake prose row through an in-memory cache adapter and confirm that `JSON.stringify(state)` gains no bytes.

**`lib/narration/boundary.test.ts`**, a source scan:

1. No file under `lib/core`, `lib/store` or `lib/view` imports `narration`.
2. `fetch(` appears only in `lib/narration/client.ts` and `app/api/narrate/route.ts`.
3. `ANTHROPIC_API_KEY` appears only in `route.ts`, and no file contains `NEXT_PUBLIC_ANTHROPIC`.
4. `route.ts` with a stubbed `globalThis.fetch`:
   - unknown `kind` → 400
   - 5 KB body → 413
   - no key → 503 and zero upstream calls
   - upstream 500, abort, `stop_reason: "refusal"` and `"max_tokens"` → `{ ok: false }`
   - prose containing a number absent from the payload → `{ ok: false }`
   - a well-formed `end_turn` → `{ ok: true }`

`scripts/determinism.ts` is unchanged. It already proves that the state a season produces is identical across replays, and this proposal adds no field to that state. Adding `fetch` to its `BANNED` list (allowing the two files above) would duplicate boundary test 2 at the source-scan layer. That is a `scripts/` edit, so it is listed as a decision, not part of the diff.

Browser check, run by hand once before sign-off: with the toggle off (the default), load `/draft`, `/week` after a loss, and `/recap`, and confirm in DevTools that no request goes to `/api/narrate`. `node scripts/e2e.mjs` is not edited.

## Gate, canaries

No engine, season, offseason, store or generation file changes. Every narration entry point is a pure read, measured at 0 of 120 mutations on this tree. **The proposal does not move the parent RNG before either canary point.** The headless path (`newGame`, `advance`, `advanceOffseason`) never imports `lib/narration`.

| Check | Why it stays | What would move it |
|---|---|---|
| Seed-42 `userOffers` canary, tag **1779302491** / FA **1323223106** (`lib/core/userOffers.test.ts` lines 129, 133) | The canary calls `advance` / `advanceOffseason` only. The probe reached `offseason-recap` at 1779302491 after 120 presenter calls. Narration adds no draw and no state field. | A payload builder that calls something that draws (e.g. a presenter rewritten to use `Rng`), or a narration setting stored on `GameState` and read by a sim step. Stop. Do not edit the literals. |
| `trimIdentity` seed-42 opening **2030**, **1600** cuts, rng **2524091302** (`lib/core/trimIdentity.test.ts` lines 20–21 constants, asserted at lines 158, 160, 164) | Same headless path through four offseasons. Nothing narration touches is on it. | Same as above. |
| `determinism` (hash, replay, round-trip, source scan) | `GameState` gains no field. The cache is a separate database. `route.ts` and `client.ts` use no banned API. Eviction uses a counter, not a clock. | Storing prose or a toggle on `GameState` changes the hash shape (replays would still match each other). A `Date.now()` in eviction fails the scan. |
| `drift.saveMbAtEnd` max 15.89, `drift.saveGrowthMbPerSeason` max 0.61 (`docs/baselines.json` 351–358) | Headless, and the prose is out of the save. Real browser saves also stay unchanged. | In-save caching. The guard would stay green while real saves grew by an estimated ~0.14 MB a season. |
| `verify`, `calibrate`, `statcheck`, `tails`, `conditions`, `coherence`, `leverage`, `sweep`, `careers`, `staff` | No sim file changes. | Nothing in this proposal. |
| `tsc --noEmit` | New files type-check against `next/server` types already present. No new package in the raw-HTTP option. | Choosing the SDK adds `@anthropic-ai/sdk` to `package.json`. |
| `node scripts/e2e.mjs` / `e2e-interact.mjs` | Narration is off by default. The new blocks render nothing until the toggle is on. | A block that renders a placeholder when off could shift a text match. Read it once. |

There is no real-NFL number in this proposal. It needs none from `docs/nfl-reference.md`, and it adds no target, band or metric, so the calibration freeze is untouched. The number check in §4 exists so that prose cannot introduce an untraced NFL figure on screen.

## Decisions for Matt

1. **Amend invariant 5** (and `AGENTS.md` lines 12–14) to the text in §6: one server route, one client `fetch`, prose never on `GameState`, never imported by `lib/core`, `lib/store` or `lib/view`.
2. **Dependency:** raw `fetch` to `/v1/messages` (no new package, recommended), or add `@anthropic-ai/sdk` for the one server file.
3. **Model:** `claude-haiku-5-5` for all three kinds (recommended), or `claude-sonnet-5-5` for the recap only. The Sonnet option needs a different `thinking` setting (§1); the route sketch as written would 400 on Sonnet.
4. **Spend ceiling:** the Anthropic workspace monthly limit, in dollars, plus a Vercel Firewall rate-limit rule on `/api/narrate`. Kill switch `NARRATION_ENABLED`.
5. **Cache location:** a separate `gridiron-gm-narration` IndexedDB database, out of the save (recommended), accepting that replayed or exported saves may show different prose. The alternative is in-save caching with a save-size re-lock, which conflicts with the calibration freeze.
6. **Toggle location:** a per-device `localStorage` toggle, off by default (recommended), not a `GameSettings` field.
7. **Scope of v1:** the three surfaces in ROADMAP Phase 5 only. The trade rationale named in invariant 5 (lines 65–66) is out of this packet.
8. **Guard layer:** keep the `fetch` boundary in the new `boundary.test.ts` (registration only), or also add `fetch` to `scripts/determinism.ts` `BANNED` (a lead `scripts/` edit).

## Review (2026-11-11)

Adversarial review against `72ac945`. Every file:line in the doc was opened. One seed-42 probe was re-run independently (scratch script, read-only, under a minute). Only this file was edited.

### What was changed

1. **Citations corrected.** `scouting-reports.ts` hash line 447 → 448, `attrBand` 449–452 → 450–453, grade functions 166–196 → 166–190. `SeasonReviewView` 75–89 → 75–90. `app/recap/page.tsx` line 45 builds the view, and line 64 renders it; the recap insertion point moved to line 64. `app/week/page.tsx` card 89–125 → 89–132; the presser insertion point was inside the duds map at line 125 and is now after line 130, before `</Card>` at 131. `scripts/determinism.ts` replay 71–88 → 72–88, banned list 151–161 → 151–159, plus the `generate.ts` budget (line 164). `trimIdentity.test.ts` "line 9" was a comment; the constants are lines 20–21 and the asserts are lines 158, 160 and 164.
2. **Free-text claim was wrong.** The doc said the franchise name is the only user-typed text. The war-room scout's note (`app/draft/page.tsx` 1145–1160, `BoardNote.note`, `types.ts` 1079) is a second one, on the same panel the scouting narration targets. It is now in the never-send list, in `NEVER_SEND`, and in a new payload test (4a). The new-game franchise-name input (`components/NewGameScreen.tsx` 95–99) has no `maxLength`.
3. **Number check made workable.** Presser and scouting numbers live inside string leaves (`final`, `line`, report text, in 54 of 100 reports). As written, the check would have dropped almost every presser. The doc now says digit runs are collected from string leaves too, and that spelled-out numbers and digit-free record claims are not caught.
4. **"Upper bound" relabelled.** 113 calls a season is the probe's working count, not a bound: the class is 1,173 prospects, and the payload-hash cache key re-calls after new intel. The cost table and the save-size argument now say so. The save-size conclusion (keep prose out of the save) is unchanged and is strengthened by this.
5. **Sonnet option fixed.** The route sketch sends `thinking: { type: "disabled" }`, which is a 400 on `claude-sonnet-5-5`. Decision 3 and §1 now say so. Model ids, prices, the `temperature` rule and the Haiku thinking rule match the Claude API reference cached 2026-11-03 and remain marked for a live re-check.
6. **Origin check overstated.** A script can forge `Origin`. The doc now says the firewall rule and the spend limit are the only real bounds.
7. **Determinism scan wording.** The scan already walks `lib/` and `app/` (lines 200–201), so the new files are scanned today. `components/` is not, and the doc now says `Narration.tsx` must not read a clock.
8. **Probe reproduced.** 420 individual presenter calls, 0 state or `rngState` changes. `rngState` = 1779302491 at both `offseason-recap` and `offseason-tag`. Boston 5-12, 12 losses. The reviewer's payload sizes differ by about 10% from the doc's because of field spelling; both are under the 4 KB cap.
9. **`NEVER_SEND` widened** to the id-bearing fields the source view models actually carry (`gameId`, `playerId`, `championId`, `player`).

### Invariants and the freeze

- **1 (seeded RNG):** holds. No draw, no clock in scanned files. `AbortSignal.timeout` and `navigator.onLine` are not banned and do not feed state.
- **2, 3, 4, 6:** not touched. No engine, depth-chart, players-array or staff code changes.
- **5:** the proposal violates invariant 5 as written today, and says so. It cannot land without the amendment Matt signs (Decision 1). The raw-HTTP option adds no package; the SDK option adds one.
- **7 / calibration freeze:** confirmed. The doc contains no real-NFL number, adds no target, band or metric, and tunes nothing. Its prices and model facts are vendor facts, not NFL calibration numbers, and are labelled as cached.
- **The sim reads nothing new.** The toggle lives in `localStorage`, the cache lives in a separate database, and no `lib/core`, `lib/store` or `lib/view` file imports narration.

### Canaries

Confirmed by reading and by the probe. The `userOffers` seed-42 path (`userOffers.test.ts` 115–133) and the `trimIdentity` seed-42 path (`trimIdentity.test.ts` 132–164) call only `newGame`, `advance` and `advanceOffseason`. Narration code runs only from mounted screens, after the user acts, and is never on the headless path. **The proposal does not move the parent RNG before tag 1779302491 / FA 1323223106 or before the 2030 opening (1,600 cuts, rng 2524091302).**

### Still open, for Matt or a rewrite

- The number check cannot stop spelled-out or digit-free invented facts. The prompt is the only guard.
- Spend has no per-user bound in code. The firewall rule and the workspace limit carry it all.
- Re-focusing prospects after new intel creates new cache keys and new calls. Whether the scouting key should hash only the board and market labels is undecided.
- Prices, model behaviour and the 2026-10-21 API rules must be re-checked live before signing.
- Payload sizes were measured with two slightly different field spellings (doc vs reviewer); the final whitelist should be re-measured in `payload.test.ts`.
- The task brief gives `main` as `9e74d34`; in this clone `main` is `aa114db`, as the doc says. The cited tree, `72ac945`, is the same either way.
