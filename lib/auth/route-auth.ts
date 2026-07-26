/**
 * Route-handler helpers for authenticated, RLS-enforced Supabase access.
 *
 * `createRouteClient` builds a per-request Supabase client that forwards the
 * caller's bearer token. Because the client uses the anon key plus the caller's
 * JWT, PostgREST runs every statement as the `authenticated` role with
 * `auth.uid()` populated, so the save_games RLS policies are what actually
 * enforce ownership — the route filters are defence in depth, not the barrier.
 */

import { NextResponse } from "next/server";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export function getBearerToken(req: Request): string | null {
  const header = req.headers.get("authorization");
  if (!header) return null;

  const [scheme, ...rest] = header.trim().split(/\s+/);
  if (!scheme || scheme.toLowerCase() !== "bearer") return null;

  const token = rest.join(" ").trim();
  return token.length > 0 ? token : null;
}

/**
 * Create a Supabase client that acts as the caller identified by `token`.
 */
export function createRouteClient(token: string): SupabaseClient {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Missing Supabase environment variables. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY."
    );
  }

  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: { Authorization: `Bearer ${token}` },
    },
  });
}

export interface AuthedRouteContext {
  supabase: SupabaseClient;
  user: User;
  token: string;
}

export type RequireUserResult =
  | { ok: true; context: AuthedRouteContext }
  | { ok: false; response: NextResponse };

function unauthorized(message: string): NextResponse {
  return NextResponse.json(
    { error: message, unauthenticated: true },
    { status: 401 }
  );
}

/**
 * Require an authenticated caller. Returns either an RLS-scoped Supabase client
 * bound to that user, or a ready-to-return 401 response.
 */
export async function requireUser(req: Request): Promise<RequireUserResult> {
  const token = getBearerToken(req);

  if (!token) {
    return {
      ok: false,
      response: unauthorized("Authentication required. Sign in to access save games."),
    };
  }

  let client: SupabaseClient;
  try {
    client = createRouteClient(token);
  } catch (error) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error:
            error instanceof Error ? error.message : "Supabase is not configured",
        },
        { status: 500 }
      ),
    };
  }

  const { data, error } = await client.auth.getUser(token);

  if (error || !data?.user) {
    return {
      ok: false,
      response: unauthorized("Invalid or expired session. Sign in again."),
    };
  }

  return { ok: true, context: { supabase: client, user: data.user, token } };
}

/**
 * True when PostgREST rejected the statement because an RLS policy denied it —
 * i.e. the caller referenced a save game they do not own.
 */
export function isRowLevelSecurityError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;

  const maybeError = error as { code?: string; message?: string };
  return (
    maybeError.code === "42501" ||
    (maybeError.message?.includes("row-level security") ?? false)
  );
}

export function forbiddenSaveGameResponse(): NextResponse {
  return NextResponse.json(
    { error: "Save game not found or not owned by the signed-in user." },
    { status: 403 }
  );
}
