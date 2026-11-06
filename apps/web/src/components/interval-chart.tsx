"use client";

import { formatNumber } from "@/lib/format";
import { useMeasuredWidth } from "@/lib/use-measured-width";

const FALLBACK_WIDTH = 640;
const ROW_HEIGHT = 44;
const LABEL_WIDTH = 128;
const PAD_RIGHT = 24;
const TOP = 16;
const AXIS_SPACE = 28;
const DOMAIN = { min: -0.75, max: 0.75 } as const;
const TICKS = [-0.75, -0.5, -0.25, 0, 0.25, 0.5, 0.75] as const;
/** Below this width every other tick label is dropped. */
const DENSE_TICK_WIDTH = 480;

export interface IntervalRow {
  label: string;
  point: number | null;
  lower: number | null;
  upper: number | null;
  emphasis: boolean;
}

/** Rank IC point estimates with bootstrap intervals against the pre-registered threshold. */
export function IntervalChart({ rows, threshold }: { rows: IntervalRow[]; threshold: number }) {
  const [ref, width] = useMeasuredWidth<HTMLDivElement>(FALLBACK_WIDTH);
  const axisY = TOP + rows.length * ROW_HEIGHT;
  const height = axisY + AXIS_SPACE;
  const x = (value: number) => {
    const clamped = Math.min(DOMAIN.max, Math.max(DOMAIN.min, value));
    return LABEL_WIDTH + ((clamped - DOMAIN.min) / (DOMAIN.max - DOMAIN.min)) * (width - LABEL_WIDTH - PAD_RIGHT);
  };
  const ticks = width < DENSE_TICK_WIDTH ? TICKS.filter((_, index) => index % 2 === 1) : TICKS;

  return (
    <div ref={ref} className="w-full overflow-hidden contain-inline-size">
      <svg width={width} height={height} role="img" aria-label="Rank IC with intervals">
        {ticks.map((tick) => (
          <g key={tick}>
            <line x1={x(tick)} x2={x(tick)} y1={TOP} y2={axisY} stroke="var(--chart-grid)" />
            <text x={x(tick)} y={axisY + 20} textAnchor="middle" fontSize={12} fill="var(--text-faint)" className="num">
              {formatNumber(tick, 2)}
            </text>
          </g>
        ))}
        <line x1={x(0)} x2={x(0)} y1={TOP} y2={axisY} stroke="var(--border-strong)" />
        <line x1={x(threshold)} x2={x(threshold)} y1={TOP} y2={axisY} stroke="var(--accent)" strokeDasharray="4 3" />
        <text x={x(threshold) + 6} y={12} fontSize={12} fill="var(--accent)" className="num">
          Gate {formatNumber(threshold, 2)}
        </text>
        {rows.map((row, index) => {
          const y = TOP + index * ROW_HEIGHT + ROW_HEIGHT / 2;
          const color = row.emphasis ? "var(--chart-line)" : "var(--text-muted)";
          return (
            <g key={row.label}>
              <text x={0} y={y + 4} fontSize={14} fill={row.emphasis ? "var(--text)" : "var(--text-muted)"}>
                {row.label}
              </text>
              {row.point === null ? (
                <text x={x(0) + 8} y={y + 4} fontSize={12} fill="var(--text-faint)">
                  Not Computed
                </text>
              ) : (
                <>
                  {row.lower !== null && row.upper !== null ? (
                    <line x1={x(row.lower)} x2={x(row.upper)} y1={y} y2={y} stroke={color} strokeWidth={2}>
                      <title>{`${formatNumber(row.lower, 3)} to ${formatNumber(row.upper, 3)}`}</title>
                    </line>
                  ) : null}
                  <circle cx={x(row.point)} cy={y} r={5} fill={color}>
                    <title>{formatNumber(row.point, 3)}</title>
                  </circle>
                </>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
