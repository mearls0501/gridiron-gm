# RLS rollout

Three migrations plus three library files. Written 2026-07-26 against the live `gridiron-gm` project (`arsjxqwyzccvrilpdhad`).

## What this fixes

Verified against the live database, not inferred from the repo:

| Finding | Before |
|---|---|
| **All 11 saves orphaned** | `auth.users` is empty, all `save_games.user_id` are NULL, and `20260726193431` scoped the only policy to `user_id = auth.uid()::text`. Nothing matches — every existing save is unreachable. |
| **RLS off entirely** | `player_team_assignments` (the roster table) and `teams` — no RLS, no policies. |
| **76 always-true policies** | `USING (true) WITH CHECK (true)` FOR ALL, no `TO` clause. The anon key shipped in the browser bundle grants full read/write across every save. |
| **Storage wide open** | `draft-classes` bucket: public, no size limit, no MIME allowlist, and `anon` holds SELECT + INSERT + **UPDATE + DELETE**. Anyone could enumerate, overwrite, or delete every uploaded draft class. |
| **3 mutable `search_path` functions** | `update_updated_at_column`, `update_schedules_updated_at`, `set_relationship_canonical_keys`. |

Coverage was checked against the live catalog: **83 tables total — 65 save-scoped, 13 child tables via parent FK, 4 shared seed tables, plus `save_games`. Zero uncovered.**

## Apply order

Order matters. `owns_save_game()` must exist before the lockdown runs, and the lockdown's own verification block will abort the transaction if anything is still open.

```bash
supabase db push
# or paste in order via the SQL editor:
#   20260727120000_backfill_save_game_ownership.sql
#   20260727120100_rls_lockdown.sql
#   20260727120200_harden_functions_and_storage.sql
```

Then, **signed in as your account**, once:

```sql
select public.claim_legacy_save_games();  -- returns 11
```

That function refuses to run unless the project has exactly one account, so a second person who registers cannot use it to take your saves. Drop it before you open the app to anyone else.

## The part that will break, and why

`20260727120100` is the one with teeth. Right now ~115 of ~120 route handlers import the module-level **anon** client from `lib/supabase-client.ts`, and the UI never sends an Authorization header. The moment policies require `authenticated` + ownership, those routes start returning empty result sets — not errors, empty sets, which read like data loss.

So do not apply the lockdown until the app is ready for it. The three library files make that migration mechanical:

**`lib/api-client.ts`** — `apiFetch()` / `apiJson()`, drop-in for `fetch`, attaches the Supabase access token.

**`lib/auth/assert-save-ownership.ts`** — `assertSaveOwnership()` turns "RLS silently returned nothing" into an explicit 403. Also rejects non-UUID `saveGameId` at the boundary, which closes the PostgREST filter-injection path in `trades/list`, `player-roster.ts`, and `playoffs/tiebreakers.ts`.

**`lib/supabase-server.ts`** — `getServiceRoleClient()`, RLS-bypassing, for genuinely league-wide work only (seeding `players`/`teams`, repair tooling). Deliberately *not* the default answer: using it in user-triggered routes would re-introduce the exact "trust the caller's saveGameId" hole this work closes.

Per-route migration is two edits:

```ts
// page
- const res = await fetch("/api/simulate-week", { method: "POST", body });
+ const res = await apiFetch("/api/simulate-week", { method: "POST", body });

// route
- import { supabase } from "@/lib/supabase-client";
+ const auth = await requireUser(req);
+ if (!auth.ok) return auth.response;
+ const { supabase } = auth.context;
+ const guard = await assertSaveOwnership(supabase, saveGameId);
+ if (!guard.ok) return guard.response;
```

`requireUser()` already exists in `lib/auth/route-auth.ts` and is correct — it just has five callers.

### Suggested sequencing

1. Apply `...120000` (backfill) and `...120200` (functions + storage) now. Neither changes gameplay table access; both are safe on their own.
2. Claim your saves.
3. Migrate routes to `apiFetch` + `requireUser`, starting with the ones on the critical path: `simulate-week`, `simulate-advance`, `save-game`, `load-game`, `draft/*`, `free-agency/*`.
4. Apply `...120100` (lockdown) once the client sends tokens.
5. Re-run the Supabase security advisor to confirm 0 errors.

Steps 1–2 fix your orphaned saves today. Step 4 is the gate before first deploy — nothing is deployed yet, so the exposed anon key is localhost-only for now, but it stops being theoretical the moment this goes up.

## Known gaps left open on purpose

- **Nullable parent FKs fail closed.** `awards.season_id`, `game_events.game_id`, `injuries.season_id`, `player_contracts.season_id`, `salary_cap_ledger.season_id` are nullable. A row with a NULL parent becomes invisible to everyone but `service_role`. Safe direction, but the real fix is adding `save_game_id` to those five tables (P2).
- **Player progression stays a no-op.** The existing "Block updates on players" policy already means `lib/simulation/player-development.ts` updates zero rows while reporting success. Section 4 makes that explicit rather than fixing it — progression needs to move to a per-save table (P3).
- **`app/api/admin/run-migration` is untouched.** `exec_sql` does not exist in the live database, so it currently does nothing while returning `success: true`. Delete the route; it is a loaded gun.
