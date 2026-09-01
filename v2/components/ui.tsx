"use client";

import Link from "next/link";
import { ReactNode } from "react";
import { Player, Position, Team } from "@/lib/core/types";
import { ovrTier } from "@/lib/core/ratings";

/** Shared primitives. Every page composes these so the app reads as one product. */

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

// ---------------------------------------------------------------------------

export function Card({
  title, subtitle, actions, children, className, padded = true,
}: {
  title?: ReactNode; subtitle?: ReactNode; actions?: ReactNode;
  children: ReactNode; className?: string; padded?: boolean;
}) {
  return (
    <section
      className={cx(
        "bg-[var(--color-surface)] border border-[var(--color-line)] rounded-xl overflow-hidden",
        className
      )}
    >
      {(title || actions) && (
        <header className="flex items-center justify-between gap-3 px-4 py-3 border-b border-[var(--color-line-soft)]">
          <div className="min-w-0">
            {title && <h2 className="text-sm font-semibold truncate">{title}</h2>}
            {subtitle && <p className="text-xs text-[var(--color-muted)] mt-0.5 truncate">{subtitle}</p>}
          </div>
          {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
        </header>
      )}
      <div className={padded ? "p-4" : ""}>{children}</div>
    </section>
  );
}

export function Button({
  children, onClick, href, variant = "default", size = "md", disabled, title, type = "button", className,
}: {
  children: ReactNode; onClick?: () => void; href?: string;
  variant?: "default" | "primary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  disabled?: boolean; title?: string; type?: "button" | "submit"; className?: string;
}) {
  const variants = {
    default: "bg-[var(--color-surface-2)] hover:bg-[var(--color-surface-3)] border-[var(--color-line)] text-[var(--color-text)]",
    primary: "bg-[var(--color-accent)] hover:brightness-110 border-transparent text-[#06101f] font-semibold",
    ghost: "bg-transparent hover:bg-[var(--color-surface-2)] border-transparent text-[var(--color-muted)] hover:text-[var(--color-text)]",
    danger: "bg-transparent hover:bg-[#3a1d1d] border-[#4a2626] text-[var(--color-bad)]",
  };
  const sizes = { sm: "px-2.5 py-1 text-xs", md: "px-3.5 py-1.5 text-sm", lg: "px-5 py-2.5 text-sm" };
  const cls = cx(
    "border rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer",
    variants[variant], sizes[size], className
  );
  if (href && !disabled) {
    return (
      <Link href={href} title={title} className={cx("inline-block", cls)} onClick={onClick}>
        {children}
      </Link>
    );
  }
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cls}
    >
      {children}
    </button>
  );
}

export function Stat({ label, value, sub, tone }: {
  label: string; value: ReactNode; sub?: ReactNode; tone?: "good" | "bad" | "warn";
}) {
  const toneClass =
    tone === "good" ? "text-[var(--color-good)]"
    : tone === "bad" ? "text-[var(--color-bad)]"
    : tone === "warn" ? "text-[var(--color-warn)]"
    : "";
  return (
    <div className="bg-[var(--color-surface-2)] border border-[var(--color-line-soft)] rounded-lg px-3 py-2.5">
      <div className="text-[10px] uppercase tracking-wider text-[var(--color-faint)]">{label}</div>
      <div className={cx("text-lg font-semibold tnum mt-0.5", toneClass)}>{value}</div>
      {sub && <div className="text-[11px] text-[var(--color-muted)] mt-0.5">{sub}</div>}
    </div>
  );
}

export function Pill({ children, tone = "default" }: {
  children: ReactNode;
  tone?: "default" | "good" | "bad" | "warn" | "accent";
}) {
  const tones = {
    default: "bg-[var(--color-surface-3)] text-[var(--color-muted)]",
    good: "bg-[#14351f] text-[var(--color-good)]",
    bad: "bg-[#3a1d1d] text-[var(--color-bad)]",
    warn: "bg-[#3a2f14] text-[var(--color-warn)]",
    accent: "bg-[var(--color-accent-dim)] text-[var(--color-accent)]",
  };
  return (
    <span className={cx("inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium", tones[tone])}>
      {children}
    </span>
  );
}

export function OvrBadge({ ovr, size = "md" }: { ovr: number | string; size?: "sm" | "md" }) {
  const n = typeof ovr === "number" ? ovr : NaN;
  const tier = Number.isFinite(n) ? ovrTier(n).tone : "avg";
  const colors: Record<string, string> = {
    elite: "text-[var(--color-elite)] bg-[#2a2244]",
    great: "text-[var(--color-great)] bg-[#12303f]",
    good: "text-[var(--color-ok)] bg-[#12331f]",
    avg: "text-[var(--color-avg)] bg-[var(--color-surface-3)]",
    weak: "text-[var(--color-weak)] bg-[var(--color-surface-2)]",
    poor: "text-[var(--color-poor)] bg-[var(--color-surface-2)]",
  };
  return (
    <span
      className={cx(
        "inline-flex items-center justify-center rounded font-semibold tnum",
        colors[tier],
        size === "sm" ? "min-w-[26px] h-5 text-[11px] px-1" : "min-w-[32px] h-6 text-xs px-1.5"
      )}
    >
      {ovr}
    </span>
  );
}

export function PosBadge({ pos }: { pos: Position }) {
  return (
    <span className="inline-flex items-center justify-center min-w-[34px] h-5 rounded bg-[var(--color-surface-3)] text-[10px] font-semibold text-[var(--color-muted)]">
      {pos}
    </span>
  );
}

export function TeamMark({ team, size = 24 }: { team: Team; size?: number }) {
  return (
    <span
      className="inline-flex items-center justify-center rounded font-bold shrink-0"
      style={{
        width: size, height: size, background: team.primary,
        color: team.secondary, fontSize: size * 0.36,
        border: `1px solid ${team.secondary}33`,
      }}
    >
      {team.abbr.slice(0, 3)}
    </span>
  );
}

export function PlayerLink({ p, className }: { p: Player; className?: string }) {
  return (
    <Link
      href={`/player/${p.id}`}
      className={cx("hover:text-[var(--color-accent)] transition-colors truncate", className)}
    >
      {p.firstName} {p.lastName}
    </Link>
  );
}

export function Empty({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="text-center py-12 px-4">
      <p className="text-sm text-[var(--color-muted)]">{title}</p>
      {hint && <p className="text-xs text-[var(--color-faint)] mt-1.5 max-w-sm mx-auto">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Table({ head, children, className }: {
  head: ReactNode[]; children: ReactNode; className?: string;
}) {
  return (
    <div className={cx("overflow-x-auto", className)}>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--color-line)]">
            {head.map((h, i) => (
              <th
                key={i}
                className={cx(
                  "text-[10px] uppercase tracking-wider text-[var(--color-faint)] font-medium py-2 px-2.5 whitespace-nowrap",
                  i === 0 ? "text-left" : "text-right"
                )}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function Row({ children, onClick, highlight }: {
  children: ReactNode; onClick?: () => void; highlight?: boolean;
}) {
  return (
    <tr
      onClick={onClick}
      className={cx(
        "border-b border-[var(--color-line-soft)] last:border-0",
        onClick && "cursor-pointer",
        highlight ? "bg-[var(--color-accent-dim)]/40" : "hover:bg-[var(--color-surface-2)]"
      )}
    >
      {children}
    </tr>
  );
}

export function Cell({ children, align = "right", className }: {
  children: ReactNode; align?: "left" | "right"; className?: string;
}) {
  return (
    <td className={cx("py-2 px-2.5 tnum", align === "left" ? "text-left" : "text-right", className)}>
      {children}
    </td>
  );
}

export function Tabs<T extends string>({ value, onChange, options }: {
  value: T; onChange: (v: T) => void; options: { value: T; label: string }[];
}) {
  return (
    <div className="flex gap-1 bg-[var(--color-surface-2)] p-1 rounded-lg overflow-x-auto">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cx(
            "px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors cursor-pointer",
            value === o.value
              ? "bg-[var(--color-surface-3)] text-[var(--color-text)]"
              : "text-[var(--color-muted)] hover:text-[var(--color-text)]"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Bar({ value, max = 99, tone = "accent" }: {
  value: number; max?: number; tone?: "accent" | "good" | "warn" | "bad";
}) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const colors = {
    accent: "var(--color-accent)", good: "var(--color-good)",
    warn: "var(--color-warn)", bad: "var(--color-bad)",
  };
  return (
    <div className="h-1.5 w-full bg-[var(--color-surface-3)] rounded-full overflow-hidden">
      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: colors[tone] }} />
    </div>
  );
}
