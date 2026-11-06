"use client";

import type { FranchiseDetail } from "@linchpin/shared";
import { formatDate, label } from "@/lib/format";
import { useMeasuredWidth } from "@/lib/use-measured-width";

const FALLBACK_WIDTH = 960;
const HEIGHT = 88;
const PAD_X = 16;
const AXIS_Y = 56;
const MS_PER_DAY = 86_400_000;
const MIN_SPAN_DAYS = 365;
/** Minimum pixels between year labels. */
const YEAR_LABEL_SPACING = 56;

function toTime(iso: string): number {
  return Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);
}

/** Release calendar against exit events. Releases are ticks, exits are markers above the axis. */
export function ReleaseTimeline({
  releases,
  exitEvents,
}: {
  releases: FranchiseDetail["releases"];
  exitEvents: FranchiseDetail["exitEvents"];
}) {
  const [ref, width] = useMeasuredWidth<HTMLDivElement>(FALLBACK_WIDTH);
  const dates = [...releases.map((release) => release.releasedOn), ...exitEvents.map((event) => event.eventDate)].map(toTime);
  if (dates.length === 0) return null;
  const start = Math.min(...dates);
  const end = Math.max(Math.max(...dates), start + MIN_SPAN_DAYS * MS_PER_DAY);
  const span = width - PAD_X * 2;
  const x = (time: number) => PAD_X + ((time - start) / (end - start)) * span;
  const startYear = new Date(start).getUTCFullYear();
  const endYear = new Date(end).getUTCFullYear();
  const maxLabels = Math.max(1, Math.floor(span / YEAR_LABEL_SPACING));
  const yearStep = Math.max(1, Math.ceil((endYear - startYear + 1) / maxLabels));
  const years: number[] = [];
  for (let year = startYear; year <= endYear; year += yearStep) years.push(year);

  return (
    <div ref={ref} className="w-full overflow-hidden contain-inline-size">
      <svg width={width} height={HEIGHT} role="img" aria-label="Release calendar and exit events">
        <line x1={PAD_X} x2={width - PAD_X} y1={AXIS_Y} y2={AXIS_Y} stroke="var(--border-strong)" />
        {years.map((year) => {
          const position = Math.max(x(Date.UTC(year, 0, 1)), PAD_X);
          return (
            <g key={year}>
              <line x1={position} x2={position} y1={AXIS_Y} y2={AXIS_Y + 6} stroke="var(--border-strong)" />
              <text x={position} y={AXIS_Y + 24} textAnchor="middle" fontSize={12} fill="var(--text-faint)" className="num">
                {year}
              </text>
            </g>
          );
        })}
        {releases.map((release) => (
          <line
            key={release.id}
            x1={x(toTime(release.releasedOn))}
            x2={x(toTime(release.releasedOn))}
            y1={AXIS_Y - 10}
            y2={AXIS_Y}
            stroke="var(--text-muted)"
            strokeWidth={2}
          >
            <title>{`${release.title} · ${formatDate(release.releasedOn)}`}</title>
          </line>
        ))}
        {exitEvents.map((event) => {
          const position = x(toTime(event.eventDate));
          return (
            <g key={event.id}>
              <line x1={position} x2={position} y1={14} y2={AXIS_Y} stroke="var(--frag-load-bearing)" strokeDasharray="2 3" />
              <circle
                cx={position}
                cy={12}
                r={5}
                fill={event.verified ? "var(--frag-load-bearing)" : "var(--surface)"}
                stroke="var(--frag-load-bearing)"
                strokeWidth={1.5}
              >
                <title>{`${event.characterName ?? event.personName ?? "Exit"} · ${label(event.exitType)} · ${formatDate(event.eventDate)}${event.verified ? "" : " · Unverified"}`}</title>
              </circle>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
