import type { EventStudyRow } from "@linchpin/shared";
import { formatLogChange, formatNumber, formatPercent } from "@/lib/format";

const WIDTH = 640;
const HEIGHT = 320;
const PAD = { top: 16, right: 16, bottom: 36, left: 56 } as const;
const X_TICKS = [0, 0.25, 0.5, 0.75, 1] as const;
const Y_GRID = 5;

/** Pre-exit carry against realised attention change. Announced exits are hollow: their pre-window is contaminated. */
export function EventScatter({ rows }: { rows: EventStudyRow[] }) {
  const points = rows.filter((row): row is EventStudyRow & { preCarryScore: number } => row.preCarryScore !== null);
  const extent = Math.max(0.5, ...points.map((row) => Math.abs(row.didEstimate)));
  const innerWidth = WIDTH - PAD.left - PAD.right;
  const innerHeight = HEIGHT - PAD.top - PAD.bottom;
  const x = (value: number) => PAD.left + value * innerWidth;
  const y = (value: number) => PAD.top + ((extent - value) / (2 * extent)) * innerHeight;
  const yTicks = Array.from({ length: Y_GRID }, (_, index) => -extent + (2 * extent * index) / (Y_GRID - 1));

  return (
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="w-full" role="img" aria-label="Pre-exit carry against attention change">
      {yTicks.map((tick) => (
        <g key={tick}>
          <line x1={PAD.left} x2={WIDTH - PAD.right} y1={y(tick)} y2={y(tick)} stroke="var(--chart-grid)" />
          <text x={PAD.left - 8} y={y(tick) + 4} textAnchor="end" fontSize="12" fill="var(--text-faint)">
            {formatNumber(tick, 1)}
          </text>
        </g>
      ))}
      <line x1={PAD.left} x2={WIDTH - PAD.right} y1={y(0)} y2={y(0)} stroke="var(--border-strong)" />
      {X_TICKS.map((tick) => (
        <text key={tick} x={x(tick)} y={HEIGHT - 16} textAnchor="middle" fontSize="12" fill="var(--text-faint)">
          {formatPercent(tick, 0)}
        </text>
      ))}
      <text x={WIDTH - PAD.right} y={HEIGHT - 2} textAnchor="end" fontSize="12" fill="var(--text-muted)">
        Pre-Exit Carry
      </text>
      <text x={PAD.left} y={PAD.top - 4} fontSize="12" fill="var(--text-muted)">
        Log Attention Change
      </text>
      {points.map((row) => (
        <a key={row.exitEventId} href={`/franchises/${row.franchiseId}`}>
          <circle
            cx={x(row.preCarryScore)}
            cy={y(row.didEstimate)}
            r={4.5}
            fill={row.announced ? "none" : "var(--accent)"}
            stroke="var(--accent)"
            strokeWidth="1.5"
            opacity="0.85"
          >
            <title>{`${row.characterName ?? "Unmatched"} · ${row.franchiseName} · carry ${formatPercent(row.preCarryScore)} · ${formatLogChange(row.didEstimate)}${row.announced ? " · Announced" : ""}`}</title>
          </circle>
        </a>
      ))}
    </svg>
  );
}
