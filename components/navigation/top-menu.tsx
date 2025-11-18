import Link from "next/link";
import type { ReactNode } from "react";

type NavItem = {
  label: string;
  description: string;
  href?: string;
  accent?: "primary" | "secondary";
};

const overviewItems: NavItem[] = [
  { label: "Franchise Hub", description: "Team dashboard", href: "/" },
  { label: "Roster", description: "Depth chart", href: "/teams" },
  { label: "Players", description: "Scouting DB", href: "/players" },
  { label: "Draft Center", description: "Prospects", href: "/draft" },
];

const operationsItems: NavItem[] = [
  { label: "Transactions", description: "Trades & FA" },
  { label: "Strategy", description: "Playbooks" },
  { label: "Sim Central", description: "Control room", href: "/sim" },
  { label: "Admin", description: "League ops", href: "/admin" },
];

const statusPills = [
  { label: "Record", value: "2-0", detail: "1st AFC South" },
  { label: "Cap Space", value: "$42.7M", detail: "Room to maneuver" },
  { label: "Morale", value: "88", detail: "Trending up" },
];

const quickActions = [
  { label: "Continue", accent: "primary" as const },
  { label: "Sim Day", accent: "secondary" as const },
  { label: "Save", accent: undefined },
];

const buttonStyles = {
  primary: "bg-yellow-400 text-gray-900 shadow-lg shadow-yellow-400/40",
  secondary: "bg-white/10 border border-white/20",
  default:
    "bg-gradient-to-b from-gray-800 to-gray-900 border border-white/5 text-white",
};

export default function TopMenu() {
  return (
    <header className="relative z-50 w-full text-white shadow-[0_15px_45px_rgba(0,0,0,0.65)]">
      <div className="bg-gradient-to-r from-gray-950 via-gray-900 to-gray-800 border-b border-white/5">
        <div className="max-w-7xl mx-auto px-6 py-4 grid gap-6 lg:grid-cols-[1.5fr_auto]">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs uppercase tracking-[0.35em] text-white/60">
              <span className="text-yellow-300">Gridiron GM</span>
              <span>Gridiron Football League</span>
              <span>Week 3 • 2032 Season</span>
            </div>
            <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:gap-6">
              <div>
                <p className="text-sm uppercase text-white/50">Controlled Franchise</p>
                <p className="text-3xl font-semibold tracking-wide">San Antonio Gauchos</p>
              </div>
              <div className="flex flex-1 flex-wrap gap-3">
                {statusPills.map((pill) => (
                  <div
                    key={pill.label}
                    className="min-w-[130px] rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm"
                  >
                    <p className="text-[11px] uppercase tracking-wide text-white/50">
                      {pill.label}
                    </p>
                    <p className="text-lg font-semibold">{pill.value}</p>
                    <p className="text-xs text-white/60">{pill.detail}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="flex flex-col justify-between gap-4 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm">
            <div>
              <p className="text-[11px] uppercase tracking-[0.4em] text-white/50">Next Event</p>
              <p className="text-lg font-semibold">vs. Chicago Cyclones</p>
              <p className="text-xs text-white/60">Sunday • 1:00 PM • Alamodome</p>
            </div>
            <div className="flex flex-wrap gap-3">
              {quickActions.map((action) => (
                <button
                  key={action.label}
                  type="button"
                  className={[
                    "flex-1 min-w-[120px] rounded-xl px-4 py-2 text-sm font-semibold uppercase tracking-wider transition hover:scale-[1.02]",
                    action.accent === "primary"
                      ? buttonStyles.primary
                      : action.accent === "secondary"
                      ? buttonStyles.secondary
                      : buttonStyles.default,
                  ].join(" ")}
                >
                  {action.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="bg-gradient-to-b from-gray-900 to-gray-950">
        <div className="max-w-7xl mx-auto px-6 py-3 space-y-3">
          <SectionLabel>Franchise Overview</SectionLabel>
          <div className="grid gap-3 md:grid-cols-4">
            {overviewItems.map((item) => (
              <NavCard key={item.label} item={item} />
            ))}
          </div>
          <SectionLabel>Operations & League</SectionLabel>
          <div className="grid gap-3 md:grid-cols-4">
            {operationsItems.map((item) => (
              <NavCard key={item.label} item={item} />
            ))}
          </div>
        </div>
      </div>
    </header>
  );
}

function NavCard({ item }: { item: NavItem }) {
  const content = (
    <div
      className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 transition hover:border-yellow-300/70 hover:bg-white/10"
    >
      <p className="text-[11px] uppercase tracking-[0.3em] text-white/40">
        {item.description}
      </p>
      <p className="text-lg font-semibold text-white">{item.label}</p>
    </div>
  );

  if (!item.href) {
    return (
      <div role="presentation" className="opacity-60">
        {content}
      </div>
    );
  }

  return (
    <Link href={item.href} className="block">
      {content}
    </Link>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="text-[11px] uppercase tracking-[0.4em] text-white/40">
      {children}
    </p>
  );
}
