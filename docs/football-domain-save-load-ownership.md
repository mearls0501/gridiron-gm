# Football domain learning: game setup, save/load, auth ownership, save-game isolation

Date researched: 2026-07-28

> **SCOPE WARNING (added 2026-07-30): v1 ONLY.** Everything below concerns the
> root Next.js + Supabase app. v2 — the live build — has a hard invariant of
> no backend, no auth, no server (`v2/AGENTS.md` invariant 5); its save is one
> serializable document in IndexedDB with export/import, guarded by
> `codeccheck` and the determinism harness. Do not action this document's
> recommendations against v2.

## Focus

Priority #1 in Matt's corrected build order: make the player able to start a franchise, pick a team, persist it, reload it, resume the exact phase/week, and trust that every save-scoped system is isolated to the signed-in owner.

This is not a football-rules topic; it is the foundation that lets every football system become testable. Cap/contracts, scouting, progression, and CPU logic are only useful after the franchise spine can be created, persisted, resumed, and protected.

## Sources reviewed

- Supabase Auth docs: JWT-backed authentication, client SDK session handling, Auth + RLS integration.
- Supabase Row Level Security docs: exposed schemas need RLS enabled; policies act like implicit `WHERE` clauses; unauthenticated `auth.uid()` is `null`; `WITH CHECK` is required for inserts/updates.
- Supabase Data API security docs: grants decide object reachability, RLS decides row reachability; use both controls; default privileges can expose new public objects unless audited.
- Football GM FAQ: browser-local save storage is convenient but fragile; persistent storage helps but does not eliminate browser-data loss; export/import backups are the practical safety valve; cross-device play is awkward without cloud saves.
- Current Gridiron GM codebase: `AuthGate`, `requireUser`, `apiFetch`, `assertSaveOwnership`, `/api/save-game`, `/api/load-game`, and `20260727120100_rls_lockdown.sql`.

## Current Gridiron GM state

What is already directionally right:

- `app/page.tsx` wraps the home content in `AuthGate`, so the main game is no longer anonymous by default.
- `/api/save-game` and `/api/load-game` call `requireUser(req)`, create a Supabase client bound to the caller's JWT, and scope reads/writes to `user.id`.
- `save_games` stores `user_id`, `current_season`, `current_week`, `selected_team_id`, `game_state`, `metadata`, `updated_at`, and `last_played_at`.
- `lib/auth/assert-save-ownership.ts` exists and explicitly documents the problem: many routes still trust caller-supplied `saveGameId` and need a loud 403 guard.
- `20260727120100_rls_lockdown.sql` replaces wide-open policies with owner policies across save-scoped tables and indexes `save_game_id` for RLS performance.

The remaining risk is not the top-level save route. The risk is the long tail of gameplay routes and UI calls:

- `lib/api-client.ts` says only a small set of routes used `requireUser` when it was written, while the UI still had many bare `fetch("/api/...")` calls.
- Current search still shows many bare API calls in screens like `GameSetupWizard`, free agency, scouting, roster management, playoffs, and salary cap.
- Any gameplay route that imports a module-level Supabase client and accepts `saveGameId` from the request body can become either a data leak or a silent no-op after strict RLS.

## Domain takeaways

1. **Save/load is the build foundation, not a convenience feature.** In a long-horizon GM sim, the save is the product. If a user cannot resume the exact franchise state after setup, week simulation, or offseason advancement, every deeper football system becomes untrustworthy.

2. **Cloud saves are the right default for Gridiron GM.** Football GM's local-browser model keeps costs low, but its FAQ makes the downside explicit: browser storage can disappear, mobile browsers can evict data, and cross-device play requires export/import. Because Gridiron GM already has Supabase Auth, it should lean into cloud saves instead of copying local-only persistence.

3. **Every save-scoped write needs two protections: bearer-token route auth and database RLS.** Supabase's model is clear: grants make objects reachable, RLS decides rows. Route filters are useful for explicit errors, but the database policy has to be the real barrier.

4. **`WITH CHECK` matters as much as `USING`.** A route that can read only owned rows can still become dangerous if inserts/updates can create rows pointing at another save. Owner policies need both `USING (owns_save_game(save_game_id))` and `WITH CHECK (owns_save_game(save_game_id))`.

5. **Resume state should be a normalized save manifest, not only an opaque `game_state` blob.** The database already has `current_season`, `current_week`, and `selected_team_id`; extend the same idea to `current_phase`, `phase_step`, `active_screen`, `setup_completed_at`, `last_advance_run_id`, and versioned migration metadata. Keep the blob for UI/game payloads, but do not make it the only source of truth.

6. **Setup should be an idempotent transaction or workflow, not a sequence of best-effort client calls.** `GameSetupWizard` currently triggers multiple routes: coaches, free agents, schedule, depth charts, save-game persistence. If one succeeds and a later one fails, the save can be partially initialized. A GM sim needs a server-side `create-franchise` orchestration route with durable step logs and retry-safe setup phases.

7. **Autosave/backup/export is not optional.** Football GM's export workflow is the safety valve for local data loss. Gridiron GM can do better: cloud autosave as default, rolling save snapshots before destructive phase advancement, and explicit export/import for portability/debugging.

8. **Strict RLS changes failure modes.** Under RLS, someone else's save often looks like zero rows. Routes should call `assertSaveOwnership` early so ownership failures return 403 instead of masquerading as empty rosters, missing schedules, or broken simulations.

## Practical build implications

### Build the franchise setup/save service before more football realism

Create a single server-side orchestration path for new game creation:

```text
POST /api/franchise/create
  input: saveName, selectedTeamId, leagueMode, settings
  transaction/workflow steps:
    1. create save_games row owned by auth.uid()
    2. initialize game_settings
    3. clone/seed save-scoped team/player/roster state
    4. generate schedule
    5. initialize coaches/scouts/free agents/depth charts
    6. write phase_progress = setup_complete / preseason_week_0
    7. write setup audit log and return canonical save manifest
```

The UI should call one endpoint and render setup progress from server state, not hope five separate client calls all succeeded.

### Introduce a save manifest contract

Add a typed manifest returned by load/create/save endpoints:

```ts
interface SaveManifest {
  saveGameId: string;
  ownerUserId: string;
  saveName: string;
  selectedTeamId: string;
  leagueMode: "nfl_franchise" | "english_pyramid";
  currentSeason: number;
  currentWeek: number;
  currentPhase: string;
  phaseStep: string | null;
  setupStatus: "not_started" | "in_progress" | "complete" | "failed";
  schemaVersion: number;
  engineVersion: string;
  lastAdvanceRunId: string | null;
  lastPlayedAt: string;
}
```

Use this manifest to drive resume routing. On login, the user should see: save name, team, season/week/phase, last played, and any setup/advance error needing repair.

### Migrate routes in dependency order

Do not try to harden all routes randomly. Start with the routes that determine whether a franchise can begin and advance:

1. setup/create/save/load/delete/settings/phase-progress
2. schedule generation and week simulation
3. roster/depth-chart initialization
4. player/team assignment and stats writes
5. scouting/draft/free agency routes
6. diagnostics/admin routes separated behind service-role/admin checks

Mechanical rule for each user-triggered gameplay route:

```ts
const auth = await requireUser(req);
if (!auth.ok) return auth.response;
const { supabase } = auth.context;
const guard = await assertSaveOwnership(supabase, saveGameId);
if (!guard.ok) return guard.response;
```

Then ensure the client uses `apiFetch` / `apiJson`, not bare `fetch`, for app API routes that require auth.

### Add a save integrity validator

Create a server-side validation endpoint or script that checks one save for:

- save exists and belongs to caller
- required companion rows exist: `game_settings`, `phase_progress`, roster/depth-chart state, schedule, current season
- all save-scoped rows have the same `save_game_id`
- no orphan child rows hidden by RLS parent policies
- setup status and current phase are internally consistent
- last simulation run completed or can be retried safely

This should power both QA and user-facing repair prompts.

### Add rolling snapshots before phase advancement

Before `simulate-week`, `simulate-advance`, offseason advancement, draft execution, or mass free-agency processing:

1. create `save_snapshots` row with manifest + key tables serialized or checkpointed
2. run the advancement with a durable `advance_run_id`
3. mark snapshot as `pre_<operation>`
4. if operation fails, allow restore or retry from the snapshot

This is the GM-sim equivalent of autosave before a major decision.

## Recommended next implementation step

Build **P1 Save Ownership + Resume Contract**:

1. Add `current_phase`, `phase_step`, `setup_status`, `schema_version`, `engine_version`, and `last_advance_run_id` to `save_games` or a `save_manifests` table.
2. Implement `GET /api/franchise/manifest?id=<saveId>` using `requireUser` + `assertSaveOwnership`.
3. Replace the home/save manager resume logic with the manifest contract.
4. Convert `GameSetupWizard` from multiple bare `fetch` calls to a single `apiJson('/api/franchise/create')` workflow or, as an interim step, convert every setup call to `apiFetch` and guard each route.
5. Add an auth+RLS smoke test that creates two temporary users and proves User B cannot load, update, simulate, or delete User A's save.

Bottom line: the next build should not add cap/contracts. It should make save creation/resume/isolation boringly reliable, because that is the substrate for every football mechanic that follows.
