/**
 * Browser-side authenticated fetch helper.
 *
 * Every save-game-scoped API route now requires a Supabase access token so that
 * row level security can scope reads/writes to the signed-in user. Client
 * components must call `authFetch` instead of the bare `fetch` for those routes.
 *
 * This module is browser-only by convention (it reads the persisted Supabase
 * session), but it is deliberately NOT marked `"use client"` so that it can be
 * imported from plain helper modules such as `lib/progression/task-validator`.
 */

import { supabase } from "@/lib/supabase-client";

export async function getAccessToken(): Promise<string | null> {
  const { data, error } = await supabase.auth.getSession();

  if (error) {
    console.warn("[auth] Unable to read Supabase session:", error.message);
    return null;
  }

  return data.session?.access_token ?? null;
}

export async function isSignedIn(): Promise<boolean> {
  return (await getAccessToken()) !== null;
}

/**
 * `fetch` with the current Supabase access token attached as a bearer token.
 *
 * When no session exists the request is still sent (without the header) so the
 * API route can answer with a consistent 401 payload instead of the caller
 * having to branch on two different failure shapes.
 */
export async function authFetch(
  input: RequestInfo | URL,
  init: RequestInit = {}
): Promise<Response> {
  const token = await getAccessToken();
  const headers = new Headers(init.headers);

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  return fetch(input, { ...init, headers });
}

/**
 * Convenience wrapper for JSON POST bodies, which is the shape every save-game
 * mutation in the app uses.
 */
export async function authFetchJson(
  input: RequestInfo | URL,
  body: unknown,
  init: RequestInit = {}
): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");

  return authFetch(input, {
    method: "POST",
    ...init,
    headers,
    body: JSON.stringify(body),
  });
}
