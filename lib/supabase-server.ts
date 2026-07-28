import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client. BYPASSES ROW LEVEL SECURITY.
 *
 * Use this ONLY for operations that are genuinely league-wide or administrative
 * and cannot be expressed as "this signed-in user acting on their own save":
 *
 *   - seeding the shared `players` / `teams` tables
 *   - background jobs with no user in scope
 *   - migration / repair tooling
 *
 * For anything a user triggers about their own save, use `requireUser()` from
 * lib/auth/route-auth.ts instead. That runs as the `authenticated` role, so the
 * RLS policies added in 20260727120100_rls_lockdown.sql are what enforce
 * ownership. Reaching for the service role there would silently re-introduce
 * the "trust the caller-supplied saveGameId" hole this work exists to close.
 *
 * Guarded at runtime against client-side import. If you add the `server-only`
 * package (`npm i server-only`), add `import "server-only";` above to turn this
 * into a build-time error instead.
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

let cached: SupabaseClient | null = null;

export function getServiceRoleClient(): SupabaseClient {
  if (typeof window !== "undefined") {
    throw new Error(
      "getServiceRoleClient() was called in the browser. The service-role key must never reach the client."
    );
  }

  if (cached) return cached;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Service-role Supabase client requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. " +
        "This operation cannot fall back to the anon key."
    );
  }

  cached = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  return cached;
}

/** True when the service role is configured. Lets routes degrade with a clear message. */
export function hasServiceRole(): boolean {
  return Boolean(supabaseUrl && serviceRoleKey);
}
