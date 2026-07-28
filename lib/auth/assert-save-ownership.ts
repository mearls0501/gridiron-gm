import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Ownership assertion for route handlers.
 *
 * Today ~115 routes read `saveGameId` straight out of the request body and act
 * on it with the module-level anon client. Because `saveGameId` originates in
 * localStorage and is just a UUID in a POST body, substituting someone else's
 * value gives full control of their save.
 *
 * After 20260727120100_rls_lockdown.sql, a route that runs as `authenticated`
 * (via requireUser -> createRouteClient) is already protected: the RLS policies
 * will simply return zero rows for a save the caller does not own. This helper
 * exists so routes fail *loudly* with a 403 instead of quietly behaving as
 * though the save were empty — which is much harder to debug and easy to
 * mistake for a data bug.
 *
 * Usage:
 *
 *   const auth = await requireUser(req);
 *   if (!auth.ok) return auth.response;
 *   const { supabase } = auth.context;
 *
 *   const guard = await assertSaveOwnership(supabase, saveGameId);
 *   if (!guard.ok) return guard.response;
 *
 *   // ...proceed; every subsequent query is RLS-scoped to this user
 */

export type OwnershipResult =
  | { ok: true }
  | { ok: false; response: NextResponse };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function badRequest(message: string): NextResponse {
  return NextResponse.json({ error: message }, { status: 400 });
}

function forbidden(): NextResponse {
  return NextResponse.json(
    { error: "Save game not found or not owned by the signed-in user." },
    { status: 403 }
  );
}

/**
 * Confirm the signed-in caller owns `saveGameId`.
 *
 * `supabase` MUST be a client bound to the caller's JWT (createRouteClient).
 * Passing a service-role client here defeats the purpose — it would return
 * ok:true for any save in the project.
 */
export async function assertSaveOwnership(
  supabase: SupabaseClient,
  saveGameId: unknown
): Promise<OwnershipResult> {
  if (typeof saveGameId !== "string" || saveGameId.length === 0) {
    return { ok: false, response: badRequest("saveGameId is required.") };
  }

  // Reject anything that isn't a UUID before it reaches PostgREST. Several
  // existing routes interpolate caller-supplied ids directly into `.or(...)`
  // filter strings (trades/list, player-roster, playoffs/tiebreakers), where a
  // crafted value can alter the filter. Validate at the boundary.
  if (!UUID_RE.test(saveGameId)) {
    return { ok: false, response: badRequest("saveGameId must be a UUID.") };
  }

  const { data, error } = await supabase
    .from("save_games")
    .select("id")
    .eq("id", saveGameId)
    .maybeSingle();

  if (error) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: `Could not verify save game ownership: ${error.message}` },
        { status: 500 }
      ),
    };
  }

  // Under RLS a save owned by someone else is indistinguishable from a save
  // that does not exist. Both are a 403 — do not leak which.
  if (!data) {
    return { ok: false, response: forbidden() };
  }

  return { ok: true };
}

/** Narrow a UUID-shaped string without hitting the database. */
export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}
