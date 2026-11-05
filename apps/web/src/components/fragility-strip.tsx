import Link from "next/link";
import type { FranchiseRow } from "@linchpin/shared";
import { BAND_TOKEN, FRAGILITY_DOMAIN, bandOf, bandRegions, domainPosition } from "@/lib/fragility";
import { formatSigned } from "@/lib/format";

const WIDTH = 640;
const HEIGHT = 132;
const PAD_X = 8;
const AXIS_Y = 108;
const DOT_RADIUS = 5;
const ROW_STEP = 12;
const MAX_STACK = 7;
const TICKS = [-2, -1, 0, 1, 2] as const;

interface PlacedDot {
  row: FranchiseRow & { fragility: number };
  x: number;
  y: number;
}

/** Dodge dots upward so franchises with similar fragility stay individually clickable. */
function placeDots(rows: Array<FranchiseRow & { fragility: number }>): PlacedDot[] {
  const placed: PlacedDot[] = [];
  const sorted = [...rows].sort((a, b) => a.fragility - b.fragility);
  for (const row of sorted) {
    const x = PAD_X + domainPosition(row.fragility) * (WIDTH - PAD_X * 2);
    let level = 0;
    while (
      level < MAX_STACK &&
      placed.some((dot) => Math.abs(dot.x - x) < DOT_RADIUS * 2 + 1 && dot.y === AXIS_Y - 14 - level * ROW_STEP)
    ) {
      level += 1;
    }
    placed.push({ row, x, y: AXIS_Y - 14 - level * ROW_STEP });
  }
  return placed;
}

export function FragilityStrip({ rows }: { rows: FranchiseRow[] }) {
  const scored = rows.filter((row): row is FranchiseRow & { fragility: number } => row.fragility !== null);
  const dots = placeDots(scored);
  const span = WIDTH - PAD_X * 2;
  return (
    <figure className="w-full">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="w-full" role="img" aria-label="Fragility distribution across scored franchises">
        {bandRegions().map((region) => (
          <g key={region.id}>
            <rect
              x={PAD_X + region.start * span}
              y={AXIS_Y - 4}
              width={(region.end - region.start) * span}
              height={4}
              fill={BAND_TOKEN[region.id]}
              opacity={0.85}
            />
            <text
              x={PAD_X + ((region.start + region.end) / 2) * span}
              y={HEIGHT - 2}
              textAnchor="middle"
              fontSize={12}
              fill="var(--text-faint)"
            >
              {region.label}
            </text>
          </g>
        ))}
        {TICKS.filter((tick) => tick >= FRAGILITY_DOMAIN.min && tick <= FRAGILITY_DOMAIN.max).map((tick) => {
          const x = PAD_X + domainPosition(tick) * span;
          return (
            <g key={tick}>
              <line x1={x} x2={x} y1={8} y2={AXIS_Y - 4} stroke="var(--chart-grid)" />
              <text x={x} y={AXIS_Y + 10} textAnchor="middle" fontSize={12} fill="var(--text-faint)" className="num">
                {formatSigned(tick, 0)}
              </text>
            </g>
          );
        })}
        {dots.map((dot) => (
          <Link key={dot.row.id} href={`/franchises/${dot.row.id}`}>
            <circle
              cx={dot.x}
              cy={dot.y}
              r={DOT_RADIUS}
              fill={BAND_TOKEN[bandOf(dot.row.fragility).id]}
              stroke="var(--bg)"
              strokeWidth={1.5}
              className="cursor-pointer transition-opacity duration-150 hover:opacity-70"
            >
              <title>{`${dot.row.canonicalName}  ${formatSigned(dot.row.fragility)}`}</title>
            </circle>
          </Link>
        ))}
      </svg>
    </figure>
  );
}
