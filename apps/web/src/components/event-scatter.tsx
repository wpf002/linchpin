"use client";

import type { EventStudyRow } from "@linchpin/shared";
import { formatLogChange, formatPercent } from "@/lib/format";
import { useMeasuredWidth } from "@/lib/use-measured-width";

const FALLBACK_WIDTH = 640;
const HEIGHT = 320;
const PAD = { top: 24, right: 16, bottom: 40, left: 64 } as const;
const X_TICKS = [0, 0.25, 0.5, 0.75, 1] as const;
const Y_GRID = 5;
const MIN_EXTENT = 0.5;
/**
 * Axis limit in log points. One exit at +4.3 would otherwise flatten the other
 * points onto the zero line. Points beyond the limit sit on the edge as triangles.
 */
const MAX_EXTENT = 2;
const POINT_RADIUS = 4.5;
const MARKER = 6;

type Point = EventStudyRow & { preCarryScore: number };

function describe(row: Point): string {
  const parts = [
    row.characterName ?? "Unmatched",
    row.franchiseName,
    `Share ${formatPercent(row.preCarryScore)}`,
    formatLogChange(row.didEstimate),
  ];
  if (row.announced) parts.push("Announced");
  return parts.join(" · ");
}

function triangle(x: number, y: number, up: boolean): string {
  const tip = up ? y - MARKER : y + MARKER;
  const base = up ? y + MARKER / 2 : y - MARKER / 2;
  return `${x},${tip} ${x - MARKER},${base} ${x + MARKER},${base}`;
}

/** Pre-exit carry against realised attention change. Announced exits are hollow: their pre-window is contaminated. */
export function EventScatter({ rows }: { rows: EventStudyRow[] }) {
  const [ref, width] = useMeasuredWidth<HTMLDivElement>(FALLBACK_WIDTH);
  const points = rows.filter((row): row is Point => row.preCarryScore !== null);
  const largest = Math.max(MIN_EXTENT, ...points.map((row) => Math.abs(row.didEstimate)));
  const extent = Math.min(MAX_EXTENT, largest);
  const innerWidth = width - PAD.left - PAD.right;
  const innerHeight = HEIGHT - PAD.top - PAD.bottom;
  const x = (value: number) => PAD.left + value * innerWidth;
  const y = (value: number) => PAD.top + ((extent - value) / (2 * extent)) * innerHeight;
  const yTicks = Array.from({ length: Y_GRID }, (_, index) => -extent + (2 * extent * index) / (Y_GRID - 1));

  return (
    <div ref={ref} className="w-full overflow-hidden contain-inline-size">
      <svg width={width} height={HEIGHT} role="img" aria-label="Share before exit against change after exit">
        {yTicks.map((tick) => (
          <g key={tick}>
            <line x1={PAD.left} x2={width - PAD.right} y1={y(tick)} y2={y(tick)} stroke="var(--chart-grid)" />
            <text x={PAD.left - 8} y={y(tick) + 4} textAnchor="end" fontSize={12} fill="var(--text-faint)" className="num">
              {formatLogChange(tick)}
            </text>
          </g>
        ))}
        <line x1={PAD.left} x2={width - PAD.right} y1={y(0)} y2={y(0)} stroke="var(--border-strong)" />
        {X_TICKS.map((tick) => (
          <text key={tick} x={x(tick)} y={HEIGHT - 20} textAnchor="middle" fontSize={12} fill="var(--text-faint)" className="num">
            {formatPercent(tick, 0)}
          </text>
        ))}
        <text x={width - PAD.right} y={HEIGHT - 4} textAnchor="end" fontSize={12} fill="var(--text-muted)">
          Share Before Exit
        </text>
        <text x={PAD.left} y={12} fontSize={12} fill="var(--text-muted)">
          Change After Exit
        </text>
        {points.map((row) => {
          const offScale = Math.abs(row.didEstimate) > extent;
          const fill = row.announced ? "none" : "var(--chart-line)";
          return (
            <a key={row.exitEventId} href={`/franchises/${row.franchiseId}`} aria-label={describe(row)}>
              {offScale ? (
                <polygon
                  points={triangle(x(row.preCarryScore), y(Math.sign(row.didEstimate) * extent), row.didEstimate > 0)}
                  fill={fill}
                  stroke="var(--chart-line)"
                  strokeWidth={1.5}
                >
                  <title>{`${describe(row)} · Off Scale`}</title>
                </polygon>
              ) : (
                <circle
                  cx={x(row.preCarryScore)}
                  cy={y(row.didEstimate)}
                  r={POINT_RADIUS}
                  fill={fill}
                  stroke="var(--chart-line)"
                  strokeWidth={1.5}
                  opacity={0.85}
                >
                  <title>{describe(row)}</title>
                </circle>
              )}
            </a>
          );
        })}
      </svg>
    </div>
  );
}
