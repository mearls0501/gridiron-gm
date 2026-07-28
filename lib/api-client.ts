import { supabase } from "@/lib/supabase-client";

/**
 * Client-side fetch wrapper that attaches the caller's Supabase access token.
 *
 * This is the missing half of the RLS work. `requireUser()` in
 * lib/auth/route-auth.ts reads a bearer token off the request, but today only
 * five routes use it and the UI never sends one — every page calls
 * `fetch("/api/...")` bare. That is why the other ~115 routes fall back to the
 * module-level anon client and trust a caller-supplied saveGameId.
 *
 * Migrating a route is then two mechanical edits:
 *
 *   page:  fetch("/api/simulate-week", { method: "POST", body })
 *       -> apiFetch("/api/simulate-week", { method: "POST", body })
 *
 *   route: import { supabase } from "@/lib/supabase-client"
 *       -> const auth = await requireUser(req);
 *          if (!auth.ok) return auth.response;
 *          const { supabase } = auth.context;
 *
 * After both edits the route runs as `authenticated`, and the RLS policies from
 * 20260727120100_rls_lockdown.sql do the enforcing.
 */

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: unknown
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/**
 * Drop-in replacement for `fetch` against this app's own API routes.
 * Adds the bearer token and JSON content-type; leaves the response alone.
 */
export async function apiFetch(
  input: string,
  init: RequestInit = {}
): Promise<Response> {
  const headers = new Headers(init.headers);
  const auth = await authHeaders();

  for (const [k, v] of Object.entries(auth)) {
    headers.set(k, v);
  }

  if (init.body && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

  return fetch(input, { ...init, headers });
}

/**
 * `apiFetch` + JSON parsing + error throwing, for call sites that just want data.
 * Throws ApiError on non-2xx so callers can branch on `status === 401`.
 */
export async function apiJson<T = unknown>(
  input: string,
  init: RequestInit = {}
): Promise<T> {
  const res = await apiFetch(input, init);

  let body: unknown = null;
  const text = await res.text();
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }

  if (!res.ok) {
    const message =
      (body && typeof body === "object" && "error" in body
        ? String((body as { error: unknown }).error)
        : null) ?? `Request to ${input} failed with ${res.status}`;
    throw new ApiError(message, res.status, body);
  }

  return body as T;
}
