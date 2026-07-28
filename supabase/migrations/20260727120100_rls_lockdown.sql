-- 20260727120100_rls_lockdown.sql
--
-- Replaces the permissive RLS posture with real ownership enforcement.
--
-- Before this migration (confirmed against the live project):
--   * ERROR: RLS not enabled at all on public.player_team_assignments and public.teams
--   * WARN:  76 tables carry `USING (true) WITH CHECK (true)` FOR ALL with no TO clause,
--            so the bundled anon key grants full read/write on every save in the project
--
-- After:
--   * 66 tables with save_game_id     -> owns_save_game(save_game_id)
--   * 15 child tables without it      -> ownership inherited through their parent FK
--   * players / teams                 -> world-readable seed data, writable only by service_role
--   * save_games                      -> unchanged (already owner-scoped)
--
-- REQUIRES 20260727120000_backfill_save_game_ownership.sql (defines owns_save_game).
--
-- !! DEPLOYMENT ORDER !!
-- Server route handlers currently import the browser ANON client and will start
-- returning empty result sets the moment this lands. Ship lib/supabase-server.ts
-- and the app/api import swap in the same deploy. See docs/rls-rollout.md.
--
-- Safe to run more than once.

begin;

-- ---------------------------------------------------------------------------
-- 0. Sanity: the helper must exist
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regprocedure('public.owns_save_game(uuid)') is null then
    raise exception 'owns_save_game(uuid) is missing. Apply 20260727120000_backfill_save_game_ownership.sql first.';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1. Drop every always-true policy in the public schema.
--
--    Skips policies granted only to service_role (those are intentional) and
--    skips players/teams, which are handled explicitly in section 4.
-- ---------------------------------------------------------------------------
do $$
declare
  r record;
  dropped integer := 0;
begin
  for r in
    select tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename not in ('players', 'teams', 'save_games')
      and coalesce(qual, 'true') = 'true'
      and coalesce(with_check, 'true') = 'true'
      and not (roles::text[] = array['service_role'])
  loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
    dropped := dropped + 1;
  end loop;
  raise notice 'dropped % always-true policies', dropped;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Every table that carries save_game_id: enable RLS + owner policy.
--
--    Driven off information_schema rather than a hardcoded list so tables added
--    later are picked up by re-running this migration.
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
  n integer := 0;
begin
  for t in
    select c.relname
    from pg_class c
    join pg_namespace ns on ns.oid = c.relnamespace
    where ns.nspname = 'public'
      and c.relkind = 'r'
      and c.relname <> 'save_games'
      and exists (
        select 1 from information_schema.columns col
        where col.table_schema = 'public'
          and col.table_name = c.relname
          and col.column_name = 'save_game_id'
      )
  loop
    execute format('alter table public.%I enable row level security', t);

    execute format(
      'drop policy if exists %I on public.%I',
      'owner_all_' || t, t
    );
    execute format(
      'create policy %I on public.%I for all to authenticated '
      || 'using (public.owns_save_game(save_game_id)) '
      || 'with check (public.owns_save_game(save_game_id))',
      'owner_all_' || t, t
    );

    execute format(
      'drop policy if exists %I on public.%I',
      'service_all_' || t, t
    );
    execute format(
      'create policy %I on public.%I for all to service_role using (true) with check (true)',
      'service_all_' || t, t
    );

    -- RLS predicate is a lookup on this column on every row; index it.
    execute format(
      'create index if not exists %I on public.%I (save_game_id)',
      t || '_save_game_id_rls_idx', t
    );

    n := n + 1;
  end loop;
  raise notice 'applied owner policy to % save-scoped tables', n;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Child tables with no save_game_id of their own.
--    Ownership is inherited through the parent FK.
--
--    (child, parent_table, child_fk_column, parent_key_column)
--    Parent must itself expose save_game_id.
--
--    Fails closed: where the FK is nullable (awards.season_id, game_events.game_id,
--    injuries.season_id, player_contracts.season_id, salary_cap_ledger.season_id),
--    a row with a NULL parent is visible to nobody but service_role. That is the
--    safe direction, but it means orphaned rows silently disappear from the UI.
--    The real fix is to add save_game_id to these tables — tracked under P2 in
--    docs/priority-plan-2026-07-26.md.
-- ---------------------------------------------------------------------------
do $$
declare
  m record;
begin
  for m in
    select * from (values
      ('big_board_entries',                 'team_big_boards',        'board_id',     'id'),
      ('meeting_participants',              'meetings',               'meeting_id',   'id'),
      ('scout_biases',                      'scout_profiles',         'scout_profile_id', 'id'),
      ('scout_position_specialties',        'scout_profiles',         'scout_profile_id', 'id'),
      ('scouted_player_attribute_estimates','scouted_player_reports', 'report_id',    'id'),
      ('scouted_player_report_scouts',      'scouted_player_reports', 'report_id',    'id'),
      ('trade_history',                     'trades',                 'trade_id',     'id'),
      ('trade_items',                       'trades',                 'trade_id',     'id'),
      ('awards',                            'seasons',                'season_id',    'id'),
      ('game_events',                       'games',                  'game_id',      'id'),
      ('injuries',                          'seasons',                'season_id',    'id'),
      ('player_contracts',                  'seasons',                'season_id',    'id'),
      ('salary_cap_ledger',                 'seasons',                'season_id',    'id')
    ) as v(child, parent, fk_col, parent_key)
  loop
    -- Skip quietly if the shape isn't what we expect on this database.
    if to_regclass('public.' || m.child) is null
       or to_regclass('public.' || m.parent) is null
       or not exists (
         select 1 from information_schema.columns
         where table_schema='public' and table_name=m.child and column_name=m.fk_col
       )
    then
      raise notice 'skipping % (table or column % not present)', m.child, m.fk_col;
      continue;
    end if;

    execute format('alter table public.%I enable row level security', m.child);

    execute format('drop policy if exists %I on public.%I', 'owner_all_' || m.child, m.child);
    execute format(
      'create policy %I on public.%I for all to authenticated '
      || 'using (exists (select 1 from public.%I p where p.%I = public.%I.%I and public.owns_save_game(p.save_game_id))) '
      || 'with check (exists (select 1 from public.%I p where p.%I = public.%I.%I and public.owns_save_game(p.save_game_id)))',
      'owner_all_' || m.child, m.child,
      m.parent, m.parent_key, m.child, m.fk_col,
      m.parent, m.parent_key, m.child, m.fk_col
    );

    execute format('drop policy if exists %I on public.%I', 'service_all_' || m.child, m.child);
    execute format(
      'create policy %I on public.%I for all to service_role using (true) with check (true)',
      'service_all_' || m.child, m.child
    );

    execute format(
      'create index if not exists %I on public.%I (%I)',
      m.child || '_' || m.fk_col || '_rls_idx', m.child, m.fk_col
    );
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Global seed data: players, teams, coaches, player_contract_seed_data.
--
--    These are shared by every save and have no ownership dimension.
--    World-readable; writes restricted to service_role.
--
--    NOTE: this makes explicit what is already true in production — the existing
--    "Block updates on players" policy means lib/simulation/player-development.ts
--    silently updates 0 rows. Player progression must move to a per-save table
--    (see P3 in docs/priority-plan-2026-07-26.md); it is NOT fixed here.
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['players', 'teams', 'coaches', 'player_contract_seed_data']
  loop
    if to_regclass('public.' || t) is null then
      continue;
    end if;

    execute format('alter table public.%I enable row level security', t);

    execute format('drop policy if exists %I on public.%I', 'seed_read_' || t, t);
    execute format(
      'create policy %I on public.%I for select to anon, authenticated using (true)',
      'seed_read_' || t, t
    );

    execute format('drop policy if exists %I on public.%I', 'seed_write_' || t, t);
    execute format(
      'create policy %I on public.%I for all to service_role using (true) with check (true)',
      'seed_write_' || t, t
    );
  end loop;
end;
$$;

-- Retire the older hand-written players policies now superseded by the above.
drop policy if exists "Allow read on players"   on public.players;
drop policy if exists "Block inserts on players" on public.players;
drop policy if exists "Block updates on players" on public.players;
drop policy if exists "Block deletes on players" on public.players;

-- ---------------------------------------------------------------------------
-- 5. Verification. Fails the transaction if anything is still wide open.
-- ---------------------------------------------------------------------------
do $$
declare
  no_rls text[];
  wide_open text[];
begin
  select coalesce(array_agg(c.relname order by c.relname), '{}')
    into no_rls
  from pg_class c
  join pg_namespace ns on ns.oid = c.relnamespace
  where ns.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity = false;

  select coalesce(array_agg(distinct tablename order by tablename), '{}')
    into wide_open
  from pg_policies
  where schemaname = 'public'
    and coalesce(qual, 'true') = 'true'
    and coalesce(with_check, 'true') = 'true'
    and not (roles::text[] = array['service_role'])
    and not (cmd = 'SELECT' and policyname like 'seed_read_%');

  if array_length(no_rls, 1) is not null then
    raise exception 'RLS still disabled on: %', array_to_string(no_rls, ', ');
  end if;

  if array_length(wide_open, 1) is not null then
    raise exception 'Always-true policies remain on: %', array_to_string(wide_open, ', ');
  end if;

  raise notice 'RLS lockdown verified: no unprotected tables, no always-true policies.';
end;
$$;

commit;
