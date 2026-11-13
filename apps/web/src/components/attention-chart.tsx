"use client";

import { useState, type PointerEvent } from "react";
import type { CharacterDetail } from "@linchpin/shared";
import { formatCompact, formatCount, formatDate } from "@/lib/format";
import { useMeasuredWidth } from "@/lib/use-measured-width";

const FALLBACK_WIDTH = 960;
const HEIGHT = 260;
const PAD = { top: 28, right: 16, bottom: 28, left: 48 } as const;
const GRID_LINES = 4;
const MS_PER_DAY = 86_400_000;

type Point = CharacterDetail["series"][number];

function toTime(iso: string): number {
  return Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);
}

/** Contiguous runs of off-cycle days, drawn as shaded bands behind the line. */
function offCycleRuns(points: Point[]): Array<{ start: number; end: number }> {
  const runs: Array<{ start: number; end: number }> = [];
  for (const point of points) {
    if (!point.isOffCycle) continue;
    const time = toTime(point.measuredOn);
    const last = runs.at(-1);
    if (last && time - last.end <= MS_PER_DAY) last.end = time;
    else runs.push({ start: time, end: time });
  }
  return runs;
}

/** Index of the point whose date is closest to the given time. Points are sorted by date. */
function nearestIndex(points: Point[], time: number): number {
  let best = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  points.forEach((point, index) => {
    const distance = Math.abs(toTime(point.measuredOn) - time);
    if (distance < bestDistance) {
      best = index;
      bestDistance = distance;
    }
  });
  return best;
}

/** Daily Wikipedia pageviews on a linear axis, off-cycle windows shaded. */
export function AttentionChart({ series }: { series: Point[] }) {
  const [ref, width] = useMeasuredWidth<HTMLDivElement>(FALLBACK_WIDTH);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const points = [...series].sort((a, b) => toTime(a.measuredOn) - toTime(b.measuredOn));
  const first = points[0];
  const last = points.at(-1);
  if (!first || !last) return null;

  const start = toTime(first.measuredOn);
  const end = Math.max(toTime(last.measuredOn), start + MS_PER_DAY);
  const peak = Math.max(...points.map((point) => point.rawValue), 1);
  const innerWidth = width - PAD.left - PAD.right;
  const innerHeight = HEIGHT - PAD.top - PAD.bottom;
  const x = (time: number) => PAD.left + ((time - start) / (end - start)) * innerWidth;
  const y = (value: number) => PAD.top + innerHeight - (value / peak) * innerHeight;
  const path = points
    .map((point, index) => `${index === 0 ? "M" : "L"}${x(toTime(point.measuredOn)).toFixed(1)},${y(point.rawValue).toFixed(1)}`)
    .join("");
  const area = `${path}L${x(end).toFixed(1)},${y(0)}L${x(start).toFixed(1)},${y(0)}Z`;
  const grid = Array.from({ length: GRID_LINES + 1 }, (_, index) => (peak / GRID_LINES) * index);
  const hovered = hoverIndex === null ? null : (points[hoverIndex] ?? null);

  function track(event: PointerEvent<SVGSVGElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const ratio = (event.clientX - bounds.left - PAD.left) / innerWidth;
    const time = start + Math.min(1, Math.max(0, ratio)) * (end - start);
    setHoverIndex(nearestIndex(points, time));
  }

  return (
    <div ref={ref} className="w-full overflow-hidden contain-inline-size">
      <svg
        width={width}
        height={HEIGHT}
        role="img"
        aria-label="Daily page views"
        onPointerMove={track}
        onPointerLeave={() => setHoverIndex(null)}
      >
        {offCycleRuns(points).map((run) => (
          <rect
            key={run.start}
            x={x(run.start)}
            y={PAD.top}
            width={Math.max(x(run.end + MS_PER_DAY) - x(run.start), 1)}
            height={innerHeight}
            fill="var(--chart-off-cycle)"
          />
        ))}
        {grid.map((value) => (
          <g key={value}>
            <line x1={PAD.left} x2={width - PAD.right} y1={y(value)} y2={y(value)} stroke="var(--chart-grid)" />
            <text x={PAD.left - 8} y={y(value) + 4} textAnchor="end" fontSize={12} fill="var(--text-faint)" className="num">
              {formatCompact(value)}
            </text>
          </g>
        ))}
        <path d={area} fill="var(--chart-line)" opacity={0.08} />
        <path d={path} fill="none" stroke="var(--chart-line)" strokeWidth={1.25} strokeLinejoin="round" />
        {hovered ? (
          <g pointerEvents="none">
            <line
              x1={x(toTime(hovered.measuredOn))}
              x2={x(toTime(hovered.measuredOn))}
              y1={PAD.top}
              y2={PAD.top + innerHeight}
              stroke="var(--border-strong)"
            />
            <circle cx={x(toTime(hovered.measuredOn))} cy={y(hovered.rawValue)} r={4} fill="var(--accent)" />
          </g>
        ) : null}
        <text x={width - PAD.right} y={14} textAnchor="end" fontSize={12} fill="var(--text-muted)" className="num">
          {hovered
            ? `${formatDate(hovered.measuredOn)} · ${formatCount(hovered.rawValue)} Views${hovered.isOffCycle ? " · Off-Season" : ""}`
            : `Peak ${formatCount(peak)} Views`}
        </text>
        <text x={PAD.left} y={HEIGHT - 6} fontSize={12} fill="var(--text-faint)">
          {formatDate(first.measuredOn)}
        </text>
        <text x={width - PAD.right} y={HEIGHT - 6} textAnchor="end" fontSize={12} fill="var(--text-faint)">
          {formatDate(last.measuredOn)}
        </text>
      </svg>
    </div>
  );
}
