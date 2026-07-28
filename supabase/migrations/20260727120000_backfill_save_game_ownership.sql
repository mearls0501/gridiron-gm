-- 20260727120000_backfill_save_game_ownership.sql
--
-- Context: 20260726193431_restrict_save_games_to_owner.sql replaced the permissive
-- save_games policy with `user_id = auth.uid()::text` for the `authenticated` role.
-- At the time it shipped, all existing save_games rows had user_id IS NULL and
-- auth.users was empty, so every existing save became unreachable by any client.
--
-- This migration:
--   1. Makes ownership explicit and indexable.
--   2. Provides a one-time claim path for the pre-auth saves.
--   3. Self-disables the claim path once more than one account exists.
--
-- Safe to run more than once.

-- ---------------------------------------------------------------------------
-- 1. Ownership column hygiene
-- ---------------------------------------------------------------------------

create index if not exists save_games_user_id_idx
  on public.save_games (user_id);

comment on column public.save_games.user_id is
  'Owner. Matches auth.uid()::text. NULL means a pre-auth (legacy) save that has not been claimed.';

-- ---------------------------------------------------------------------------
-- 2. Ownership helper used by every RLS policy in the next migration
--
-- SECURITY DEFINER so the lookup against save_games does not recurse through
-- save_games' own RLS policy. STABLE so Postgres can cache it per statement.
-- ---------------------------------------------------------------------------

create or replace function public.owns_save_game(sg uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.save_games s
    where s.id = sg
      and s.user_id = (select auth.uid())::text
  );
$$;

revoke all on function public.owns_save_game(uuid) from public;
grant execute on function public.owns_save_game(uuid) to authenticated, service_role;

comment on function public.owns_save_game(uuid) is
  'True when the current JWT owns the given save game. Used by every gameplay RLS policy.';

-- ---------------------------------------------------------------------------
-- 3. One-time claim of legacy (pre-auth) saves
--
-- Deliberately narrow:
--   * caller must be authenticated
--   * only fires while the project has exactly ONE account, so it cannot be
--     used by a second person to steal the first person's saves
--   * only touches rows where user_id IS NULL
--
-- Call once from the app (or the SQL editor as the signed-in user) after you
-- register your account:   select public.claim_legacy_save_games();
--
-- DROP THIS FUNCTION before opening the app to more than one user.
-- ---------------------------------------------------------------------------

create or replace function public.claim_legacy_save_games()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  claimed integer;
  account_count integer;
begin
  if auth.uid() is null then
    raise exception 'claim_legacy_save_games: must be signed in';
  end if;

  select count(*) into account_count from auth.users;

  if account_count <> 1 then
    raise exception
      'claim_legacy_save_games: refusing to run with % accounts. This path only exists for the single-developer pre-auth backfill.',
      account_count;
  end if;

  update public.save_games
     set user_id = (select auth.uid())::text
   where user_id is null;

  get diagnostics claimed = row_count;
  return claimed;
end;
$$;

revoke all on function public.claim_legacy_save_games() from public;
grant execute on function public.claim_legacy_save_games() to authenticated;

comment on function public.claim_legacy_save_games() is
  'One-time backfill: assigns pre-auth save games to the sole registered account. Drop before multi-user.';
