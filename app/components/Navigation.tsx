"use client";

import Link from "next/link";
import { useState, useEffect, useRef } from "react";
import { useGameStore } from "@/lib/store/game-store";
import SaveGameManager from "./SaveGameManager";
import { Save, FolderOpen } from "lucide-react";

interface MenuItem {
  label: string;
  href?: string;
  submenu?: { label: string; href: string }[];
}

export default function Navigation() {
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const [showSaveManager, setShowSaveManager] = useState(false);
  const [mounted, setMounted] = useState(false);

  const { seasonPhase } = useGameStore();
  
  // Only check phase after component mounts to avoid hydration mismatch
  useEffect(() => {
    setMounted(true);
  }, []);

  const isOffseason = mounted && seasonPhase === "offseason";
  const isPreseason = mounted && seasonPhase === "preseason";

  const menuItems: MenuItem[] = [
    {
      label: "Home",
      href: "/",
    },
    ...(isOffseason
      ? [
          {
            label: "Offseason",
            href: "/offseason",
          },
        ]
      : []),
    ...(isPreseason
      ? [
          {
            label: "Preseason",
            href: "/preseason",
          },
        ]
      : []),
    {
      label: "League",
      submenu: [
        { label: "League Home", href: "/league" },
        { label: "Standings", href: "/league/standings" },
        { label: "Schedule", href: "/league/schedule" },
        { label: "Statistics", href: "/league/stats" },
        { label: "Playoffs", href: "/league/playoffs" },
        { label: "Leaders", href: "/league/leaders" },
        { label: "Transactions", href: "/league/transactions" },
        { label: "All Scouts", href: "/scouts" },
      ],
    },
    {
      label: "Team",
      submenu: [
        { label: "All Teams", href: "/teams" },
        { label: "My Team", href: "/teams/my-team" },
        { label: "Roster", href: "/teams/roster" },
        { label: "Depth Chart", href: "/teams/depth-chart" },
        { label: "Schedule", href: "/teams/schedule" },
        { label: "Finances", href: "/teams/finances" },
        { label: "Staff", href: "/teams/staff" },
      ],
    },
    {
      label: "Players",
      submenu: [
        { label: "All Players", href: "/players" },
        { label: "Search Players", href: "/players/search" },
        { label: "Free Agents", href: "/free-agents" },
        { label: "Scouting", href: "/scouting" },
        { label: "Top Prospects", href: "/players/prospects" },
      ],
    },
    {
      label: "Draft",
      submenu: [
        { label: "Draft Home", href: "/draft" },
        { label: "Draft Picks", href: "/draft/picks" },
        { label: "Draft Board", href: "/draft/board" },
        { label: "Draft History", href: "/draft/history" },
      ],
    },
    {
      label: "Actions",
      submenu: [
        { label: "Make Trade", href: "/actions/trade" },
        { label: "Sign Free Agent", href: "/actions/sign" },
        { label: "Cut Player", href: "/actions/cut" },
        { label: "Adjust Depth Chart", href: "/teams/depth-chart" },
        { label: "Set Lineups", href: "/actions/lineups" },
      ],
    },
    {
      label: "Reports",
      submenu: [
        { label: "Team Reports", href: "/reports/team" },
        { label: "Player Reports", href: "/reports/players" },
        { label: "League Reports", href: "/reports/league" },
        { label: "Financial Reports", href: "/reports/financial" },
        { label: "Scouting Reports", href: "/reports/scouting" },
      ],
    },
    {
      label: "Admin",
      submenu: [
        { label: "League Settings", href: "/admin/settings" },
        { label: "Generate Schedule", href: "/admin/generate-schedule" },
        { label: "Simulation", href: "/admin/sim" },
        { label: "Commissioner Tools", href: "/admin/commissioner" },
        { label: "Database", href: "/admin/database" },
      ],
    },
  ];

  return (
    <>
      {showSaveManager && (
        <SaveGameManager
          onClose={() => setShowSaveManager(false)}
          onLoad={() => {
            setShowSaveManager(false);
            window.location.reload();
          }}
        />
      )}
      <div
        className="w-full"
        style={{
          background:
            "linear-gradient(to bottom, var(--nav-bg-primary), var(--nav-bg-secondary))",
          boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
        }}
      >
      {/* Top Menu Bar */}
      <nav
        className="w-full text-white border-b-2"
        style={{ borderColor: "#1a202c" }}
      >
        <div className="max-w-full">
          {/* Main Navigation Bar */}
          <div
            className="flex items-center px-4 py-0"
            style={{ background: "var(--nav-bg-primary)" }}
          >
            {/* Branding */}
            <Link
              href="/"
              className="text-lg font-bold tracking-wide px-4 py-3 border-r transition-all"
              style={{
                background: "linear-gradient(to bottom, #2563eb, #1e40af)",
                borderColor: "#1a202c",
                color: "white",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background =
                  "linear-gradient(to bottom, #1d4ed8, #1e3a8a)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background =
                  "linear-gradient(to bottom, #2563eb, #1e40af)";
              }}
            >
              Gridiron GM
            </Link>

            {/* Menu Items */}
            <div className="flex items-stretch">
              {menuItems.map((item) => (
                <div
                  key={item.label}
                  className="relative group"
                  onMouseEnter={() => setActiveDropdown(item.label)}
                  onMouseLeave={() => setActiveDropdown(null)}
                >
                  {item.href ? (
                    <Link
                      href={item.href}
                      className="block px-4 py-3 text-sm font-medium transition-colors border-r"
                      style={{
                        borderColor: "#1a202c",
                        color: "white",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = "var(--nav-hover)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = "transparent";
                      }}
                    >
                      {item.label}
                    </Link>
                  ) : (
                    <button
                      className="px-4 py-3 text-sm font-medium transition-colors border-r flex items-center gap-1"
                      style={{
                        borderColor: "#1a202c",
                        color: "white",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = "var(--nav-hover)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = "transparent";
                      }}
                    >
                      {item.label}
                      <svg
                        className="w-3 h-3"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19 9l-7 7-7-7"
                        />
                      </svg>
                    </button>
                  )}

                  {/* Dropdown Menu */}
                  {item.submenu && activeDropdown === item.label && (
                    <div
                      className="absolute left-0 top-full w-56 shadow-xl z-50 rounded-b-md"
                      style={{
                        background: "var(--nav-bg-tertiary)",
                        border: "1px solid #1a202c",
                        boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
                      }}
                    >
                      {item.submenu.map((subitem) => (
                        <Link
                          key={subitem.href}
                          href={subitem.href}
                          className="block px-4 py-2.5 text-sm transition-colors border-b last:border-b-0"
                          style={{
                            borderColor: "#1a202c",
                            color: "white",
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background =
                              "var(--nav-hover)";
                            e.currentTarget.style.color = "var(--nav-accent)";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = "transparent";
                            e.currentTarget.style.color = "white";
                          }}
                        >
                          {subitem.label}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Right side info */}
            <div className="ml-auto flex items-center gap-4 px-4 text-sm">
              <button
                onClick={() => setShowSaveManager(true)}
                className="flex items-center gap-2 px-3 py-1.5 rounded transition-colors"
                style={{
                  background: "rgba(255, 255, 255, 0.1)",
                  color: "white",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "rgba(255, 255, 255, 0.2)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "rgba(255, 255, 255, 0.1)";
                }}
                title="Save/Load Game"
              >
                <Save className="w-4 h-4" />
                <span className="hidden md:inline">Save</span>
              </button>
              <SeasonWeekSelector />
            </div>
          </div>
        </div>
      </nav>

      {/* Secondary Context Bar */}
      <div
        className="w-full border-b shadow-md"
        style={{
          background: "var(--nav-bg-secondary)",
          borderColor: "#1a202c",
        }}
      >
        <div className="max-w-full px-4 py-2">
          <div className="flex items-center gap-4 text-sm flex-wrap">
            <span className="font-medium" style={{ color: "#e5e7eb" }}>
              Quick Actions:
            </span>
            <Link
              href="/admin/sim"
              className="transition-colors"
              style={{ color: "#e5e7eb" }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = "var(--nav-accent)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = "#e5e7eb";
              }}
            >
              Simulate Games
            </Link>
            <span style={{ color: "#6b7280" }}>|</span>
            <Link
              href="/actions/trade"
              className="transition-colors"
              style={{ color: "#e5e7eb" }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = "var(--nav-accent)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = "#e5e7eb";
              }}
            >
              Make Trade
            </Link>
            <span style={{ color: "#6b7280" }}>|</span>
            <Link
              href="/free-agents"
              className="transition-colors"
              style={{ color: "#e5e7eb" }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = "var(--nav-accent)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = "#e5e7eb";
              }}
            >
              Browse Free Agents
            </Link>
            <span style={{ color: "#6b7280" }}>|</span>
            <Link
              href="/draft"
              className="transition-colors"
              style={{ color: "#e5e7eb" }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = "var(--nav-accent)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = "#e5e7eb";
              }}
            >
              View Draft Class
            </Link>
            {isOffseason && (
              <>
                <span style={{ color: "#6b7280" }}>|</span>
                <Link
                  href="/offseason"
                  className="transition-colors"
                  style={{ color: "#e5e7eb" }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = "var(--nav-accent)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = "#e5e7eb";
                  }}
                >
                  Offseason
                </Link>
              </>
            )}
            {isPreseason && (
              <>
                <span style={{ color: "#6b7280" }}>|</span>
                <Link
                  href="/preseason"
                  className="transition-colors"
                  style={{ color: "#e5e7eb" }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = "var(--nav-accent)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = "#e5e7eb";
                  }}
                >
                  Preseason
                </Link>
              </>
            )}
          </div>
        </div>
      </div>
      </div>
    </>
  );
}

function SeasonWeekSelector() {
  const { currentWeek, currentSeason, setCurrentWeek, setCurrentSeason } =
    useGameStore();
  const [showSeasonDropdown, setShowSeasonDropdown] = useState(false);
  const [showWeekDropdown, setShowWeekDropdown] = useState(false);
  const [mounted, setMounted] = useState(false);
  const seasonRef = useRef<HTMLDivElement>(null);
  const weekRef = useRef<HTMLDivElement>(null);

  // Only render after mount to avoid hydration mismatch
  useEffect(() => {
    setMounted(true);
  }, []);

  // Close dropdowns when clicking outside
  useEffect(() => {
    if (!mounted) return;

    function handleClickOutside(event: MouseEvent) {
      if (
        seasonRef.current &&
        !seasonRef.current.contains(event.target as Node)
      ) {
        setShowSeasonDropdown(false);
      }
      if (weekRef.current && !weekRef.current.contains(event.target as Node)) {
        setShowWeekDropdown(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [mounted]);

  // Render placeholder on server to avoid hydration mismatch
  if (!mounted) {
    return (
      <>
        <div
          className="flex items-center gap-2 px-3 py-1.5 rounded"
          style={{
            background: "var(--nav-bg-tertiary)",
            border: "1px solid #1a202c",
          }}
        >
          <span style={{ color: "#9ca3af" }}>Season:</span>
          <span className="font-semibold" style={{ color: "white" }}>
            2025
          </span>
        </div>
        <div
          className="flex items-center gap-2 px-3 py-1.5 rounded"
          style={{
            background: "var(--nav-bg-tertiary)",
            border: "1px solid #1a202c",
          }}
        >
          <span style={{ color: "#9ca3af" }}>Week:</span>
          <span className="font-semibold" style={{ color: "white" }}>
            1
          </span>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="relative" ref={seasonRef}>
        <button
          onClick={() => {
            setShowSeasonDropdown(!showSeasonDropdown);
            setShowWeekDropdown(false);
          }}
          className="flex items-center gap-2 px-3 py-1.5 rounded"
          style={{
            background: "var(--nav-bg-tertiary)",
            border: "1px solid #1a202c",
          }}
        >
          <span style={{ color: "#9ca3af" }}>Season:</span>
          <span className="font-semibold" style={{ color: "white" }}>
            {currentSeason}
          </span>
          <span style={{ color: "#9ca3af" }}>▼</span>
        </button>
        {showSeasonDropdown && (
          <div
            className="absolute right-0 mt-1 z-50 rounded shadow-lg"
            style={{
              background: "var(--nav-bg-secondary)",
              border: "1px solid #1a202c",
              minWidth: "120px",
            }}
          >
            {Array.from({ length: 5 }, (_, i) => currentSeason - 2 + i).map(
              (year) => (
                <button
                  key={year}
                  onClick={() => {
                    setCurrentSeason(year);
                    setShowSeasonDropdown(false);
                  }}
                  className="w-full text-left px-4 py-2 hover:bg-gray-700"
                  style={{ color: "white" }}
                >
                  {year}
                </button>
              )
            )}
          </div>
        )}
      </div>
      <div className="relative" ref={weekRef}>
        <button
          onClick={() => {
            setShowWeekDropdown(!showWeekDropdown);
            setShowSeasonDropdown(false);
          }}
          className="flex items-center gap-2 px-3 py-1.5 rounded"
          style={{
            background: "var(--nav-bg-tertiary)",
            border: "1px solid #1a202c",
          }}
        >
          <span style={{ color: "#9ca3af" }}>Week:</span>
          <span className="font-semibold" style={{ color: "white" }}>
            {currentWeek === 0 ? "Preseason" : currentWeek === 23 ? "Offseason" : currentWeek}
          </span>
          <span style={{ color: "#9ca3af" }}>▼</span>
        </button>
        {showWeekDropdown && (
          <div
            className="absolute right-0 mt-1 z-50 rounded shadow-lg max-h-96 overflow-y-auto"
            style={{
              background: "var(--nav-bg-secondary)",
              border: "1px solid #1a202c",
              minWidth: "180px",
            }}
          >
            {/* Preseason */}
            <div className="px-3 py-2 text-xs uppercase tracking-wide" style={{ color: "#9ca3af", background: "rgba(0,0,0,0.2)" }}>
              Preseason
            </div>
            <button
              onClick={() => {
                setCurrentWeek(0);
                setShowWeekDropdown(false);
              }}
              className="w-full text-left px-4 py-2 hover:bg-gray-700"
              style={{ color: "white" }}
            >
              Preseason (Week 0)
            </button>
            
            {/* Regular Season */}
            <div className="px-3 py-2 text-xs uppercase tracking-wide mt-2" style={{ color: "#9ca3af", background: "rgba(0,0,0,0.2)" }}>
              Regular Season
            </div>
            {Array.from({ length: 18 }, (_, i) => i + 1).map((week) => (
              <button
                key={week}
                onClick={() => {
                  setCurrentWeek(week);
                  setShowWeekDropdown(false);
                }}
                className="w-full text-left px-4 py-2 hover:bg-gray-700"
                style={{ color: "white" }}
              >
                Week {week}
              </button>
            ))}
            
            {/* Playoffs */}
            <div className="px-3 py-2 text-xs uppercase tracking-wide mt-2" style={{ color: "#9ca3af", background: "rgba(0,0,0,0.2)" }}>
              Playoffs
            </div>
            {[19, 20, 21, 22].map((week) => {
              const round = week === 19 ? "Wild Card" : week === 20 ? "Divisional" : week === 21 ? "Conference" : "Super Bowl";
              return (
                <button
                  key={week}
                  onClick={() => {
                    setCurrentWeek(week);
                    setShowWeekDropdown(false);
                  }}
                  className="w-full text-left px-4 py-2 hover:bg-gray-700"
                  style={{ color: "white" }}
                >
                  Week {week} ({round})
                </button>
              );
            })}
            
            {/* Offseason */}
            <div className="px-3 py-2 text-xs uppercase tracking-wide mt-2" style={{ color: "#9ca3af", background: "rgba(0,0,0,0.2)" }}>
              Offseason
            </div>
            <button
              onClick={() => {
                setCurrentWeek(23);
                setShowWeekDropdown(false);
              }}
              className="w-full text-left px-4 py-2 hover:bg-gray-700"
              style={{ color: "white" }}
            >
              Offseason (Week 23)
            </button>
          </div>
        )}
      </div>
    </>
  );
}
