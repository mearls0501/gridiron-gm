-- Enable RLS on progression/settings tables created by 20240101000046_create_game_settings.sql.
--
-- Gridiron GM currently has no real authenticated save ownership model:
-- save_games.user_id is nullable text and existing save_games policy allows all access.
-- These policies intentionally preserve current app behavior while removing RLS-disabled
-- exposure on the three new public tables. A future auth migration should tighten both
-- save_games and these child tables together.

ALTER TABLE public.game_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.phase_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roster_validation ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access on game_settings" ON public.game_settings;
DROP POLICY IF EXISTS "Public access via save_games on game_settings" ON public.game_settings;
DROP POLICY IF EXISTS "Service role full access on phase_progress" ON public.phase_progress;
DROP POLICY IF EXISTS "Public access via save_games on phase_progress" ON public.phase_progress;
DROP POLICY IF EXISTS "Service role full access on roster_validation" ON public.roster_validation;
DROP POLICY IF EXISTS "Public access via save_games on roster_validation" ON public.roster_validation;

CREATE POLICY "Service role full access on game_settings"
  ON public.game_settings
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Public access via save_games on game_settings"
  ON public.game_settings
  FOR ALL
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.save_games sg
      WHERE sg.id = game_settings.save_game_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.save_games sg
      WHERE sg.id = game_settings.save_game_id
    )
  );

CREATE POLICY "Service role full access on phase_progress"
  ON public.phase_progress
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Public access via save_games on phase_progress"
  ON public.phase_progress
  FOR ALL
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.save_games sg
      WHERE sg.id = phase_progress.save_game_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.save_games sg
      WHERE sg.id = phase_progress.save_game_id
    )
  );

CREATE POLICY "Service role full access on roster_validation"
  ON public.roster_validation
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Public access via save_games on roster_validation"
  ON public.roster_validation
  FOR ALL
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.save_games sg
      WHERE sg.id = roster_validation.save_game_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.save_games sg
      WHERE sg.id = roster_validation.save_game_id
    )
  );

COMMENT ON POLICY "Public access via save_games on game_settings" ON public.game_settings
  IS 'Preserves current public save-game behavior. Tighten after save_games has authenticated ownership.';
COMMENT ON POLICY "Public access via save_games on phase_progress" ON public.phase_progress
  IS 'Preserves current public save-game behavior. Tighten after save_games has authenticated ownership.';
COMMENT ON POLICY "Public access via save_games on roster_validation" ON public.roster_validation
  IS 'Preserves current public save-game behavior. Tighten after save_games has authenticated ownership.';
