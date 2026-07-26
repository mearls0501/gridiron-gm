"use client";

import { useCallback, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { LogIn, LogOut, UserPlus, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase-client";

type Mode = "sign-in" | "sign-up";

/**
 * Minimal email/password gate for the home page.
 *
 * Save games are owned by a Supabase auth user and protected by RLS, so the
 * app cannot do anything useful until someone is signed in. Children render
 * only once a session exists; a small bar exposes the current email and sign out.
 */
export default function AuthGate({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [checking, setChecking] = useState(true);

  const [mode, setMode] = useState<Mode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session ?? null);
      setChecking(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange(
      (_event, nextSession) => {
        setSession(nextSession);
        setChecking(false);
      }
    );

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  const handleSubmit = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      setError(null);
      setNotice(null);

      if (!email.trim() || !password) {
        setError("Email and password are required.");
        return;
      }

      setSubmitting(true);
      try {
        if (mode === "sign-up") {
          const { data, error: signUpError } = await supabase.auth.signUp({
            email: email.trim(),
            password,
          });

          if (signUpError) {
            setError(signUpError.message);
            return;
          }

          if (!data.session) {
            setNotice(
              "Account created. Check your email to confirm the address, then sign in."
            );
            setMode("sign-in");
          }
        } else {
          const { error: signInError } = await supabase.auth.signInWithPassword({
            email: email.trim(),
            password,
          });

          if (signInError) {
            setError(signInError.message);
            return;
          }
        }

        setPassword("");
      } catch (submitError) {
        setError(
          submitError instanceof Error
            ? submitError.message
            : "Authentication failed. Try again."
        );
      } finally {
        setSubmitting(false);
      }
    },
    [email, mode, password]
  );

  const handleSignOut = useCallback(async () => {
    setError(null);
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) {
      setError(signOutError.message);
    }
  }, []);

  if (checking) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <div className="flex items-center gap-3 text-slate-300">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span>Checking your session…</span>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-10">
            <h1 className="text-5xl font-black text-white mb-3 tracking-tight">
              GRIDIRON GM
            </h1>
            <p className="text-slate-300">
              Sign in to reach your saved franchises.
            </p>
          </div>

          <form
            onSubmit={handleSubmit}
            className="bg-slate-800/80 border border-slate-700 rounded-2xl p-8 shadow-2xl space-y-5"
          >
            <div className="flex gap-2 p-1 bg-slate-900/60 rounded-lg">
              <button
                type="button"
                onClick={() => {
                  setMode("sign-in");
                  setError(null);
                  setNotice(null);
                }}
                className={`flex-1 py-2 rounded-md text-sm font-medium transition-colors ${
                  mode === "sign-in"
                    ? "bg-blue-600 text-white"
                    : "text-slate-300 hover:text-white"
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode("sign-up");
                  setError(null);
                  setNotice(null);
                }}
                className={`flex-1 py-2 rounded-md text-sm font-medium transition-colors ${
                  mode === "sign-up"
                    ? "bg-purple-600 text-white"
                    : "text-slate-300 hover:text-white"
                }`}
              >
                Sign Up
              </button>
            </div>

            <div>
              <label
                htmlFor="auth-email"
                className="block text-sm font-medium text-slate-300 mb-2"
              >
                Email
              </label>
              <input
                id="auth-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full px-4 py-2 rounded-lg bg-slate-900 border border-slate-600 text-white placeholder:text-slate-500 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div>
              <label
                htmlFor="auth-password"
                className="block text-sm font-medium text-slate-300 mb-2"
              >
                Password
              </label>
              <input
                id="auth-password"
                type="password"
                autoComplete={
                  mode === "sign-up" ? "new-password" : "current-password"
                }
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-4 py-2 rounded-lg bg-slate-900 border border-slate-600 text-white placeholder:text-slate-500 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            {error && (
              <p className="text-sm text-red-300 bg-red-900/40 border border-red-700 rounded-lg px-4 py-2">
                {error}
              </p>
            )}
            {notice && (
              <p className="text-sm text-emerald-200 bg-emerald-900/40 border border-emerald-700 rounded-lg px-4 py-2">
                {notice}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full flex items-center justify-center gap-2 px-6 py-3 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {submitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : mode === "sign-up" ? (
                <UserPlus className="w-4 h-4" />
              ) : (
                <LogIn className="w-4 h-4" />
              )}
              {mode === "sign-up" ? "Create Account" : "Sign In"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="bg-slate-950 border-b border-slate-800 px-6 py-3 flex items-center justify-between">
        <span className="text-sm text-slate-400">
          Signed in as{" "}
          <span className="text-slate-200 font-medium">
            {session.user.email}
          </span>
        </span>
        <button
          onClick={handleSignOut}
          className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-slate-800 text-slate-200 hover:bg-slate-700 transition-colors"
        >
          <LogOut className="w-4 h-4" />
          Sign Out
        </button>
      </div>
      {children}
    </>
  );
}
