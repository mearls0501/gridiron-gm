"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ReactNode, useEffect, useState } from "react";
import { useGame } from "@/lib/store/game";
import { toastDismissApplies } from "@/lib/store/simToast";
import { forcedMoveKeepsRoute, showNewGameScreen } from "@/lib/view/newGameRoute";
import { computeRecords, recordString, formatMoney } from "@/lib/core/select";
import { screenCap } from "@/lib/view/resignStep";
import { isPendingForcedMove } from "@/lib/core/owner";
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

type NavLink = { href: string; label: string };
type NavGroup = { title: string; links: NavLink[] };

/**
 * Every screen stays one click away, but the bar is five clusters rather than
 * seventeen equal words: what you do this week, your club, the league, the
 * three markets, and the building.
 */
const NAV_GROUPS: NavGroup[] = [
  { title: "Now", links: [
    { href: "/", label: "Hub" },
    { href: "/week", label: "This Week" },
  ] },
  { title: "Team", links: [
    { href: "/roster", label: "Roster" },
    { href: "/depth-chart", label: "Depth Chart" },
    { href: "/finances", label: "Finances" },
    { href: "/staff", label: "Staff" },
    { href: "/front-office", label: "Front Office" },
  ] },
  { title: "Players", links: [
    { href: "/free-agency", label: "Free Agency" },
    { href: "/trades", label: "Trades" },
    { href: "/draft", label: "Draft" },
  ] },
  { title: "Season", links: [
    { href: "/schedule", label: "Schedule" },
    { href: "/standings", label: "Standings" },
    { href: "/playoffs", label: "Playoffs" },
    { href: "/stats", label: "Stats" },
  ] },
  { title: "League", links: [
    { href: "/league", label: "League" },
    { href: "/records", label: "Records" },
    { href: "/history", label: "History" },
  ] },
];

export const PHASE_LABEL: Record<string, string> = {
  preseason: "Preseason",
  regular: "Regular Season",
  playoffs: "Playoffs",
  "offseason-recap": "Season Review",
  "offseason-tag": "Franchise Tag",
  "offseason-fa": "Free Agency",
  "offseason-draft": "Draft",
  "offseason-final": "Roster Cutdown",
};

/** Play the Game exists only while there is a game to play; it joins "Now". */
function navGroups(phase: string): NavGroup[] {
  if (phase !== "regular") return NAV_GROUPS;
  return NAV_GROUPS.map((g) =>
    g.title === "Now" ? { ...g, links: [...g.links, { href: "/play", label: "Play the Game" }] } : g
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const { state, hydrated, bootstrap, toast, error, setToast, setError } = useGame();
  const pathname = usePathname();
  const router = useRouter();
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    setNavOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!state) return;
    if (!isPendingForcedMove(state) && !state.forcedMove?.retired) return;
    if (forcedMoveKeepsRoute(pathname)) return;
    router.replace("/forced-move");
  }, [state, pathname, router]);

  useEffect(() => {
    if (!toast) return;
    const shown = toast;
    const t = setTimeout(() => {
      if (toastDismissApplies(shown, useGame.getState().toast)) setToast(null);
    }, 4000);
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
  const cap = screenCap(state, team.id);
  const groups = navGroups(state.phase);

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : href === "/play" ? pathname === "/play" : pathname.startsWith(href);

  const linkClass = (href: string) =>
    cx(
      "px-2.5 py-2 text-xs font-medium whitespace-nowrap border-b-2 transition-colors",
      isActive(href)
        ? "border-[var(--color-accent)] text-[var(--color-text)]"
        : "border-transparent text-[var(--color-muted)] hover:text-[var(--color-text)]"
    );

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 bg-[var(--color-bg)]/95 backdrop-blur border-b border-[var(--color-line)]">
        <div className="max-w-[1400px] mx-auto px-4">
          <div className="flex items-center gap-3 h-14">
            <TeamMark team={team} size={30} />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold leading-tight truncate">
                {team.city} {team.name}
              </div>
              <div className="flex items-baseline gap-2 min-w-0 text-xs text-[var(--color-muted)] leading-tight tnum">
                <span className="truncate">
                  {state.season} · {PHASE_LABEL[state.phase] ?? state.phase}
                  {state.phase === "regular" && ` · Week ${state.week}`}
                </span>
                <span data-record className="shrink-0 whitespace-nowrap">{recordString(rec)}</span>
              </div>
            </div>
            <div className="ml-auto flex items-center gap-3 shrink-0">
              <button
                type="button"
                className="sm:hidden text-xs font-medium px-2.5 py-1.5 rounded-md border border-[var(--color-line)] text-[var(--color-text)] cursor-pointer"
                aria-expanded={navOpen}
                aria-controls="phone-nav"
                onClick={() => setNavOpen((v) => !v)}
              >
                {navOpen ? "Close" : "Menu"}
              </button>
              <div className="hidden sm:block text-right">
                <div className="text-[11px] uppercase tracking-wider text-[var(--color-faint)]">Cap Space</div>
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
                className="tap inline-flex items-center text-xs text-[var(--color-muted)] hover:text-[var(--color-text)] transition-colors"
              >
                Saves
              </Link>
              <Link
                href="/settings"
                className="tap inline-flex items-center text-xs text-[var(--color-muted)] hover:text-[var(--color-text)] transition-colors"
              >
                Settings
              </Link>
            </div>
          </div>

          <nav className="hidden sm:flex flex-wrap items-center -mb-px" data-nav="bar" aria-label="Main">
            {groups.map((g, gi) => (
              <div key={g.title} role="group" aria-label={g.title} className="flex items-center">
                {gi > 0 && <span aria-hidden className="mx-1.5 h-4 w-px bg-[var(--color-line)]" />}
                {g.links.map((n) => (
                  <Link
                    key={n.href}
                    href={n.href}
                    aria-current={isActive(n.href) ? "page" : undefined}
                    className={linkClass(n.href)}
                  >
                    {n.label}
                  </Link>
                ))}
              </div>
            ))}
          </nav>
          {navOpen && (
            <nav
              id="phone-nav"
              className="sm:hidden grid grid-cols-2 gap-x-4 gap-y-3 pt-1 pb-4"
              data-nav="menu"
              aria-label="Main"
            >
              {groups.map((g) => (
                <div key={g.title} className={g.links.length > 4 ? "row-span-2" : undefined}>
                  <div className="text-[11px] uppercase tracking-wider text-[var(--color-faint)] px-2 mb-0.5">
                    {g.title}
                  </div>
                  {g.links.map((n) => (
                    <Link
                      key={n.href}
                      href={n.href}
                      aria-current={isActive(n.href) ? "page" : undefined}
                      className={cx(
                        "tap flex items-center px-2 py-2.5 rounded-md text-sm font-medium",
                        isActive(n.href)
                          ? "bg-[var(--color-accent-dim)] text-[var(--color-text)]"
                          : "text-[var(--color-muted)] hover:text-[var(--color-text)]"
                      )}
                    >
                      {n.label}
                    </Link>
                  ))}
                </div>
              ))}
            </nav>
          )}
        </div>
      </header>

      <main className="max-w-[1400px] mx-auto px-4 py-5 animate-in">{children}</main>

      {toast && (
        <div role="status" aria-live="polite" className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 animate-up pointer-events-none">
          <div className="bg-[var(--color-surface-3)] border border-[var(--color-line)] rounded-lg px-4 py-2.5 text-sm shadow-xl">
            {toast}
          </div>
        </div>
      )}

      {error && (
        <div role="alert" className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 animate-up max-w-md">
          <div className="bg-[#3a1d1d] border border-[#5a2c2c] rounded-lg px-4 py-3 text-sm shadow-xl flex items-start gap-3">
            <span className="text-[var(--color-bad)]">{error}</span>
            <button
              onClick={() => setError(null)}
              aria-label="Dismiss"
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
