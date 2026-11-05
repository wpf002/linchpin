import { formatNumber } from "@/lib/format";

const WIDTH = 640;
const ROW_HEIGHT = 44;
const PAD_X = 120;
const PAD_RIGHT = 24;
const DOMAIN = { min: -0.5, max: 0.75 } as const;
const TICKS = [-0.5, -0.25, 0, 0.25, 0.5, 0.75] as const;

export interface IntervalRow {
  label: string;
  point: number | null;
  lower: number | null;
  upper: number | null;
  emphasis: boolean;
}

/** Rank IC point estimates with bootstrap intervals against the pre-registered threshold. */
export function IntervalChart({ rows, threshold }: { rows: IntervalRow[]; threshold: number }) {
  const height = rows.length * ROW_HEIGHT + 40;
  const x = (value: number) => {
    const clamped = Math.min(DOMAIN.max, Math.max(DOMAIN.min, value));
    return PAD_X + ((clamped - DOMAIN.min) / (DOMAIN.max - DOMAIN.min)) * (WIDTH - PAD_X - PAD_RIGHT);
  };
  const axisY = rows.length * ROW_HEIGHT + 8;
  return (
    <svg viewBox={`0 0 ${WIDTH} ${height}`} className="w-full" role="img" aria-label="Rank IC with intervals">
      {TICKS.map((tick) => (
        <g key={tick}>
          <line x1={x(tick)} x2={x(tick)} y1={0} y2={axisY} stroke="var(--chart-grid)" />
          <text x={x(tick)} y={axisY + 18} textAnchor="middle" fontSize="12" fill="var(--text-faint)">
            {formatNumber(tick, 2)}
          </text>
        </g>
      ))}
      <line x1={x(0)} x2={x(0)} y1={0} y2={axisY} stroke="var(--border-strong)" />
      <line x1={x(threshold)} x2={x(threshold)} y1={0} y2={axisY} stroke="var(--accent)" strokeDasharray="4 3" />
      <text x={x(threshold) + 4} y={10} fontSize="12" fill="var(--accent)">
        {formatNumber(threshold, 2)}
      </text>
      {rows.map((row, index) => {
        const y = index * ROW_HEIGHT + ROW_HEIGHT / 2 + 4;
        const color = row.emphasis ? "var(--chart-line)" : "var(--text-muted)";
        return (
          <g key={row.label}>
            <text x={0} y={y + 4} fontSize="14" fill={row.emphasis ? "var(--text)" : "var(--text-muted)"}>
              {row.label}
            </text>
            {row.point === null ? (
              <text x={x(0) + 8} y={y + 4} fontSize="12" fill="var(--text-faint)">
                Not Computed
              </text>
            ) : (
              <>
                {row.lower !== null && row.upper !== null ? (
                  <line x1={x(row.lower)} x2={x(row.upper)} y1={y} y2={y} stroke={color} strokeWidth="2" />
                ) : null}
                <circle cx={x(row.point)} cy={y} r={5} fill={color} />
              </>
            )}
          </g>
        );
      })}
    </svg>
  );
}
