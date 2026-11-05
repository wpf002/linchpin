import type { CharacterDetail } from "@linchpin/shared";
import { formatCompact, formatDate } from "@/lib/format";

const WIDTH = 960;
const HEIGHT = 240;
const PAD = { top: 16, right: 16, bottom: 28, left: 48 } as const;
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

/** Daily Wikipedia pageviews on a linear axis, off-cycle windows shaded. */
export function AttentionChart({ series }: { series: Point[] }) {
  const points = [...series].sort((a, b) => toTime(a.measuredOn) - toTime(b.measuredOn));
  const first = points[0];
  const last = points.at(-1);
  if (!first || !last) return null;
  const start = toTime(first.measuredOn);
  const end = Math.max(toTime(last.measuredOn), start + MS_PER_DAY);
  const peak = Math.max(...points.map((point) => point.rawValue), 1);
  const innerWidth = WIDTH - PAD.left - PAD.right;
  const innerHeight = HEIGHT - PAD.top - PAD.bottom;
  const x = (time: number) => PAD.left + ((time - start) / (end - start)) * innerWidth;
  const y = (value: number) => PAD.top + innerHeight - (value / peak) * innerHeight;
  const path = points
    .map((point, index) => `${index === 0 ? "M" : "L"}${x(toTime(point.measuredOn)).toFixed(1)},${y(point.rawValue).toFixed(1)}`)
    .join("");
  const area = `${path}L${x(end).toFixed(1)},${y(0)}L${x(start).toFixed(1)},${y(0)}Z`;
  const grid = Array.from({ length: GRID_LINES + 1 }, (_, index) => (peak / GRID_LINES) * index);

  return (
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="w-full" role="img" aria-label="Daily attention series">
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
          <line x1={PAD.left} x2={WIDTH - PAD.right} y1={y(value)} y2={y(value)} stroke="var(--chart-grid)" />
          <text x={PAD.left - 8} y={y(value) + 4} textAnchor="end" fontSize="12" fill="var(--text-faint)">
            {formatCompact(value)}
          </text>
        </g>
      ))}
      <path d={area} fill="var(--accent)" opacity="0.08" />
      <path d={path} fill="none" stroke="var(--chart-line)" strokeWidth="1.25" strokeLinejoin="round" />
      <text x={PAD.left} y={HEIGHT - 6} fontSize="12" fill="var(--text-faint)">
        {formatDate(first.measuredOn)}
      </text>
      <text x={WIDTH - PAD.right} y={HEIGHT - 6} textAnchor="end" fontSize="12" fill="var(--text-faint)">
        {formatDate(last.measuredOn)}
      </text>
    </svg>
  );
}
