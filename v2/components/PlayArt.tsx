import { PlayEvent } from "@/lib/core/types";
import { fieldX, snapArt } from "@/lib/view/playArt";

/**
 * One snap as a field strip: `leftTeamId`'s goal on the left. Line of
 * scrimmage, line to gain, and the ball's path. No formation is drawn — the
 * engine has none.
 */
export function PlayArt({
  event, leftTeamId, label,
}: { event: PlayEvent; leftTeamId: number; label?: string }) {
  const art = snapArt(event);
  const W = 100;
  const H = 18;
  const pad = 4;
  const x = (yd: number) => pad + (fieldX(yd, event.offenseId, leftTeamId) / 100) * (W - 2 * pad);
  const x0 = x(art.los);
  const x1 = x(art.end);
  const mid = (x0 + x1) / 2;
  const tone = art.glyph === "turnover" || art.glyph === "sack"
    ? "var(--color-bad)"
    : art.glyph === "penalty" ? "var(--color-warn)" : "var(--color-accent)";
  const arc = art.glyph === "pass" || art.glyph === "kick";
  const path = arc
    ? `M ${x0} ${H - 5} Q ${mid} ${art.glyph === "kick" ? 1 : 4} ${x1} ${H - 5}`
    : `M ${x0} ${H - 5} L ${x1} ${H - 5}`;
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full h-7 rounded-md border border-[var(--color-line)] bg-[#12261b]"
      role="img"
      aria-label={label ?? "Play diagram"}
      data-testid="play-art"
    >
      <rect x={0} y={0} width={pad} height={H} fill="white" opacity={0.08} />
      <rect x={W - pad} y={0} width={pad} height={H} fill="white" opacity={0.08} />
      {[10, 20, 30, 40, 50, 60, 70, 80, 90].map((m) => (
        <line key={m} x1={pad + m * 0.92} x2={pad + m * 0.92} y1={0} y2={H} stroke="white" strokeOpacity={0.12} strokeWidth={0.3} />
      ))}
      {art.lineToGain != null && (
        <line x1={x(art.lineToGain)} x2={x(art.lineToGain)} y1={0} y2={H} stroke="var(--color-warn)" strokeWidth={0.6} />
      )}
      {art.glyph !== "kick" && (
        <line x1={x0} x2={x0} y1={0} y2={H} stroke="#7aa7ff" strokeWidth={0.6} />
      )}
      {art.glyph !== "none" && (
        <path
          d={path}
          fill="none"
          stroke={tone}
          strokeWidth={0.9}
          strokeDasharray={art.glyph === "incomplete" || art.glyph === "penalty" ? "1.5 1" : undefined}
        />
      )}
      <circle cx={x1} cy={H - 5} r={1.6} fill={art.glyph === "turnover" ? "var(--color-bad)" : "white"} />
    </svg>
  );
}
