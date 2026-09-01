"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ReactNode, useEffect } from "react";
import { useGame } from "@/lib/store/game";
import { toastDismissApplies } from "@/lib/store/simToast";
import { showNewGameScreen } from "@/lib/view/newGameRoute";
import { computeRecords, recordString, teamCap, formatMoney } from "@/lib/core/select";
import { cx, TeamMark } from "./ui";
import { NewGameScreen } from "./NewGameScreen";

/**
 * App shell: navigation, phase banner, and the guard that keeps every screen
 * from having to defend against a null franchise.
 *
 * Every route in the app is reachable from this nav. Nothing is admin-only and
 * nothing 404s — the previous build shipped 13 dead nav links and hid the
 * season-advance control on an admin page.
 */

const NAV = [
  { href: "/", label: "Hub" },
  { href: "/week", label: "This Week" },
  { href: "/roster", label: "Roster" },
  { href: "/depth-chart", label: "Depth Chart" },
  { href: "/schedule", label: "Schedule" },
  { href: "/standings", label: "Standings" },
  { href: "/stats", label: "Stats" },
  { href: "/records", label: "Records" },
  { href: "/playoffs", label: "Playoffs" },
  { href: "/free-agency", label: "Free Agency" },
  { href: "/trades", label: "Trades" },
  { href: "/draft", label: "Draft" },
  { href: "/finances", label: "Finances" },
  { href: "/front-office", label: "Front Office" },
  { href: "/league", label: "League" },
];

export const PHASE_LABEL: Record<string, string> = {
  preseason: "Preseason",
  regular: "Regular Season",
  playoffs: "Playoffs",
  "offseason-recap": "Season Review",
  "offseason-fa": "Free Agency",
  "offseason-draft": "Draft",
  "offseason-final": "Roster Cutdown",
};

export function Shell({ children }: { children: ReactNode }) {
  const { state, hydrated, bootstrap, toast, error, setToast, setError } = useGame();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    if (!toast) return;
    const shown = toast;
    const t = setTimeout(() => {
      if (toastDismissApplies(shown, useGame.getState().toast)) setToast(null);
    }, 2600);
    return () => clearTimeout(t);
  }, [toast, setToast]);

  if (!hydrated) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-sm text-[var(--color-muted)]">Loading…</div>
      </div>
    );
  }

  if (!state || showNewGameScreen(pathname, true)) {
    return <NewGameScreen onDone={() => router.replace("/")} />;
  }

  const team = state.teams[state.userTeamId];
  const rec = computeRecords(state).get(team.id)!;
  const cap = teamCap(state, team.id);

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 bg-[var(--color-bg)]/95 backdrop-blur border-b border-[var(--color-line)]">
        <div className="max-w-[1400px] mx-auto px-4">
          <div className="flex items-center gap-3 h-14">
            <TeamMark team={team} size={30} />
            <div className="min-w-0">
              <div className="text-sm font-semibold leading-tight truncate">
                {team.city} {team.name}
              </div>
              <div className="text-[11px] text-[var(--color-muted)] leading-tight tnum">
                {state.season} · {PHASE_LABEL[state.phase] ?? state.phase}
                {state.phase === "regular" && ` · Week ${state.week}`}
                {" · "}
                {recordString(rec)}
              </div>
            </div>
            <div className="ml-auto flex items-center gap-4">
              <div className="hidden sm:block text-right">
                <div className="text-[10px] uppercase tracking-wider text-[var(--color-faint)]">Cap Space</div>
                <div
                  className={cx(
                    "text-xs font-semibold tnum",
                    cap.space < 0 ? "text-[var(--color-bad)]" : "text-[var(--color-good)]"
                  )}
                >
                  {formatMoney(cap.space)}
                </div>
              </div>
              <Link
                href="/saves"
                className="text-xs text-[var(--color-muted)] hover:text-[var(--color-text)] transition-colors"
              >
                Saves
              </Link>
              <Link
                href="/settings"
                className="text-xs text-[var(--color-muted)] hover:text-[var(--color-text)] transition-colors"
              >
                Settings
              </Link>
            </div>
          </div>

          <nav className="flex flex-wrap gap-0.5 -mb-px">
            {NAV.map((n) => {
              const active = n.href === "/" ? pathname === "/" : pathname.startsWith(n.href);
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  className={cx(
                    "px-3 py-2 text-xs font-medium whitespace-nowrap border-b-2 transition-colors",
                    active
                      ? "border-[var(--color-accent)] text-[var(--color-text)]"
                      : "border-transparent text-[var(--color-muted)] hover:text-[var(--color-text)]"
                  )}
                >
                  {n.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>

      <main className="max-w-[1400px] mx-auto px-4 py-5 animate-in">{children}</main>

      {toast && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 animate-up">
          <div className="bg-[var(--color-surface-3)] border border-[var(--color-line)] rounded-lg px-4 py-2.5 text-sm shadow-xl">
            {toast}
          </div>
        </div>
      )}

      {error && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 animate-up max-w-md">
          <div className="bg-[#3a1d1d] border border-[#5a2c2c] rounded-lg px-4 py-3 text-sm shadow-xl flex items-start gap-3">
            <span className="text-[var(--color-bad)]">{error}</span>
            <button
              onClick={() => setError(null)}
              className="text-[var(--color-muted)] hover:text-[var(--color-text)] shrink-0 cursor-pointer"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
