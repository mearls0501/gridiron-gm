-- Tighten RLS so save games are private to their owning Supabase auth user.
--
-- Before this migration:
--   * save_games had a single "Allow all on save_games" FOR ALL policy with
--     USING (true) / WITH CHECK (true) applied to every role, so anon and any
--     authenticated user could read, edit and delete every save in the project.
--   * game_settings / phase_progress / roster_validation each had a
--     "Public access via save_games on <table>" policy granted to
--     {authenticated, anon} that only checked that SOME save_games row existed
--     with the referenced id -- i.e. no ownership check at all.
--
-- After this migration:
--   * service_role keeps full access on all four tables (server-side admin and
--     seed endpoints continue to work).
--   * authenticated users can only touch save_games rows where
--     user_id = auth.uid()::text (save_games.user_id is TEXT, auth.uid() is UUID).
--   * the three child tables are reachable by authenticated users only through a
--     save_games row they own, enforced in both USING and WITH CHECK.
--   * the anon-role public compatibility policies are removed for these tables.
--
-- LEGACY DATA BEHAVIOUR (intentional):
--   save_games.user_id is nullable and pre-auth saves were written with
--   user_id = NULL. Those rows do not satisfy user_id = auth.uid()::text, so they
--   become invisible and unmodifiable to every authenticated user. They are NOT
--   deleted -- they remain readable/writable via service_role and can be claimed
--   later by backfilling user_id with the intended owner's auth uid, e.g.:
--
--     update public.save_games
--        set user_id = '<auth-user-uuid>'
--      where user_id is null and save_name = '<save name>';
--
--   Rows in game_settings / phase_progress / roster_validation that hang off a
--   null-user save are hidden by the same rule and reappear once the parent save
--   is claimed. No child rows are deleted here either.

-- ---------------------------------------------------------------- save_games

alter table public.save_games enable row level security;

drop policy if exists "Allow all on save_games" on public.save_games;
drop policy if exists "Public access on save_games" on public.save_games;
drop policy if exists "Service role full access on save_games" on public.save_games;
drop policy if exists "Users manage own save_games" on public.save_games;

create policy "Service role full access on save_games"
  on public.save_games
  for all
  to service_role
  using (true)
  with check (true);

create policy "Users manage own save_games"
  on public.save_games
  for all
  to authenticated
  using (user_id = auth.uid()::text)
  with check (user_id = auth.uid()::text);

-- ------------------------------------------------------------- game_settings

alter table public.game_settings enable row level security;

drop policy if exists "Public access via save_games on game_settings" on public.game_settings;
drop policy if exists "Service role full access on game_settings" on public.game_settings;
drop policy if exists "Users manage own game_settings" on public.game_settings;

create policy "Service role full access on game_settings"
  on public.game_settings
  for all
  to service_role
  using (true)
  with check (true);

create policy "Users manage own game_settings"
  on public.game_settings
  for all
  to authenticated
  using (
    exists (
      select 1
        from public.save_games sg
       where sg.id = game_settings.save_game_id
         and sg.user_id = auth.uid()::text
    )
  )
  with check (
    exists (
      select 1
        from public.save_games sg
       where sg.id = game_settings.save_game_id
         and sg.user_id = auth.uid()::text
    )
  );

-- ------------------------------------------------------------ phase_progress

alter table public.phase_progress enable row level security;

drop policy if exists "Public access via save_games on phase_progress" on public.phase_progress;
drop policy if exists "Service role full access on phase_progress" on public.phase_progress;
drop policy if exists "Users manage own phase_progress" on public.phase_progress;

create policy "Service role full access on phase_progress"
  on public.phase_progress
  for all
  to service_role
  using (true)
  with check (true);

create policy "Users manage own phase_progress"
  on public.phase_progress
  for all
  to authenticated
  using (
    exists (
      select 1
        from public.save_games sg
       where sg.id = phase_progress.save_game_id
         and sg.user_id = auth.uid()::text
    )
  )
  with check (
    exists (
      select 1
        from public.save_games sg
       where sg.id = phase_progress.save_game_id
         and sg.user_id = auth.uid()::text
    )
  );

-- --------------------------------------------------------- roster_validation

alter table public.roster_validation enable row level security;

drop policy if exists "Public access via save_games on roster_validation" on public.roster_validation;
drop policy if exists "Service role full access on roster_validation" on public.roster_validation;
drop policy if exists "Users manage own roster_validation" on public.roster_validation;

create policy "Service role full access on roster_validation"
  on public.roster_validation
  for all
  to service_role
  using (true)
  with check (true);

create policy "Users manage own roster_validation"
  on public.roster_validation
  for all
  to authenticated
  using (
    exists (
      select 1
        from public.save_games sg
       where sg.id = roster_validation.save_game_id
         and sg.user_id = auth.uid()::text
    )
  )
  with check (
    exists (
      select 1
        from public.save_games sg
       where sg.id = roster_validation.save_game_id
         and sg.user_id = auth.uid()::text
    )
  );

comment on column public.save_games.user_id is
  'Owning Supabase auth user id (auth.users.id as text). NULL marks a legacy pre-auth save, which RLS hides from all authenticated users until backfilled.';
