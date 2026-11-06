"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { FranchiseRow } from "@linchpin/shared";
import { BAND_TOKEN, FRAGILITY_DOMAIN, bandOf, bandRegions, domainPosition } from "@/lib/fragility";
import { formatSigned } from "@/lib/format";
import { useMeasuredWidth } from "@/lib/use-measured-width";

const FALLBACK_WIDTH = 1280;
const NARROW_WIDTH = 560;
const PAD_X = 16;
const LABEL_SPACE = 28;
const AXIS_SPACE = 44;
const BAND_HEIGHT = 4;
const DOT_GAP = 2;
const TICKS = [-2, -1, 0, 1, 2] as const;
/** Named dots at each end of the distribution, before collision checks. */
const HIGH_LABELS = 4;
const LOW_LABELS = 3;
/** Rough glyph width at 12px, used only to keep labels from overlapping. */
const CHAR_WIDTH = 6.6;
const LABEL_GAP = 12;

type ScoredRow = FranchiseRow & { fragility: number };

interface Dot {
  row: ScoredRow;
  x: number;
  level: number;
}

/** Stacks dots into bins one dot wide, lowest fragility first. */
function stackDots(rows: ScoredRow[], width: number, binWidth: number): Dot[] {
  const span = width - PAD_X * 2;
  const levels = new Map<number, number>();
  return [...rows]
    .sort((a, b) => a.fragility - b.fragility)
    .map((row) => {
      const bin = Math.round((domainPosition(row.fragility) * span) / binWidth);
      const level = levels.get(bin) ?? 0;
      levels.set(bin, level + 1);
      return { row, x: PAD_X + Math.min(bin * binWidth, span), level };
    });
}

interface Label {
  dot: Dot;
  anchor: "start" | "end";
  from: number;
  to: number;
}

function toLabel(dot: Dot, width: number): Label {
  const textWidth = dot.row.canonicalName.length * CHAR_WIDTH;
  const anchor = dot.x + textWidth > width - PAD_X ? "end" : "start";
  return anchor === "start"
    ? { dot, anchor, from: dot.x, to: dot.x + textWidth }
    : { dot, anchor, from: dot.x - textWidth, to: dot.x };
}

/** The most and least fragile franchises, named when their labels do not collide. */
function pickLabels(dots: Dot[], width: number): Label[] {
  const tops = dots.filter((dot) => !dots.some((other) => other.x === dot.x && other.level > dot.level));
  const candidates = [...tops.slice(-HIGH_LABELS).reverse(), ...tops.slice(0, LOW_LABELS)];
  const kept: Label[] = [];
  for (const dot of candidates) {
    const label = toLabel(dot, width);
    const collides = kept.some(
      (other) => other.dot.level === dot.level && label.from < other.to + LABEL_GAP && other.from < label.to + LABEL_GAP,
    );
    if (!collides && !kept.some((other) => other.dot === dot)) kept.push(label);
  }
  return kept;
}

/** Every scored franchise as one dot on the fragility axis. */
export function FragilityStrip({ rows }: { rows: FranchiseRow[] }) {
  const [ref, width] = useMeasuredWidth<HTMLDivElement>(FALLBACK_WIDTH);
  const [activeId, setActiveId] = useState<string | null>(null);
  const radius = width < NARROW_WIDTH ? 3.5 : 5;
  const step = radius * 2 + DOT_GAP;

  const { dots, labels } = useMemo(() => {
    const scored = rows.filter((row): row is ScoredRow => row.fragility !== null);
    const stacked = stackDots(scored, width, step);
    return { dots: stacked, labels: pickLabels(stacked, width) };
  }, [rows, width, step]);

  const tallest = dots.reduce((max, dot) => Math.max(max, dot.level + 1), 1);
  const baseline = LABEL_SPACE + tallest * step + DOT_GAP;
  const height = baseline + AXIS_SPACE;
  const span = width - PAD_X * 2;
  const dotY = (dot: Dot) => baseline - BAND_HEIGHT - DOT_GAP - radius - dot.level * step;
  const active = dots.find((dot) => dot.row.id === activeId) ?? null;
  const shown = active ? [toLabel(active, width)] : labels;

  return (
    <div ref={ref} className="w-full overflow-hidden contain-inline-size">
      <svg width={width} height={height} role="img" aria-label={`Fragility of ${dots.length} scored franchises`}>
        {TICKS.filter((tick) => tick >= FRAGILITY_DOMAIN.min && tick <= FRAGILITY_DOMAIN.max).map((tick) => {
          const x = PAD_X + domainPosition(tick) * span;
          return (
            <g key={tick}>
              <line x1={x} x2={x} y1={LABEL_SPACE} y2={baseline - BAND_HEIGHT} stroke="var(--chart-grid)" />
              <text x={x} y={baseline + 16} textAnchor="middle" fontSize={12} fill="var(--text-faint)" className="num">
                {formatSigned(tick, 0)}
              </text>
            </g>
          );
        })}
        {bandRegions().map((region) => (
          <g key={region.id}>
            <rect
              x={PAD_X + region.start * span}
              y={baseline - BAND_HEIGHT}
              width={(region.end - region.start) * span}
              height={BAND_HEIGHT}
              fill={BAND_TOKEN[region.id]}
            />
            <text
              x={PAD_X + ((region.start + region.end) / 2) * span}
              y={baseline + 36}
              textAnchor="middle"
              fontSize={12}
              fill="var(--text-muted)"
            >
              {region.label}
            </text>
          </g>
        ))}
        {dots.map((dot) => (
          <Link
            key={dot.row.id}
            href={`/franchises/${dot.row.id}`}
            aria-label={`${dot.row.canonicalName}, fragility ${formatSigned(dot.row.fragility)}`}
            onMouseEnter={() => setActiveId(dot.row.id)}
            onMouseLeave={() => setActiveId(null)}
            onFocus={() => setActiveId(dot.row.id)}
            onBlur={() => setActiveId(null)}
          >
            <circle
              cx={dot.x}
              cy={dotY(dot)}
              r={radius}
              fill={BAND_TOKEN[bandOf(dot.row.fragility).id]}
              opacity={active && active !== dot ? 0.35 : 1}
              stroke={active === dot ? "var(--text)" : "none"}
              strokeWidth={1.5}
              className="transition-opacity duration-150"
            />
          </Link>
        ))}
        {shown.map((label) => (
          <text
            key={label.dot.row.id}
            x={label.dot.x + (label.anchor === "start" ? -radius : radius)}
            y={dotY(label.dot) - radius - 6}
            textAnchor={label.anchor}
            fontSize={12}
            fill={active ? "var(--text)" : "var(--text-muted)"}
            stroke="var(--bg)"
            strokeWidth={4}
            paintOrder="stroke"
            pointerEvents="none"
          >
            {label.dot.row.canonicalName}
            {active ? ` ${formatSigned(label.dot.row.fragility)}` : ""}
          </text>
        ))}
      </svg>
    </div>
  );
}
