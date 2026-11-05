import type { FranchiseDetail } from "@linchpin/shared";
import { formatDate, formatYear, label } from "@/lib/format";

const WIDTH = 960;
const HEIGHT = 96;
const PAD_X = 16;
const AXIS_Y = 56;
const MS_PER_DAY = 86_400_000;
const MIN_SPAN_DAYS = 365;

/** Release calendar against exit events. Releases are ticks, exits are markers above the axis. */
export function ReleaseTimeline({
  releases,
  exitEvents,
}: {
  releases: FranchiseDetail["releases"];
  exitEvents: FranchiseDetail["exitEvents"];
}) {
  const dates = [...releases.map((release) => release.releasedOn), ...exitEvents.map((event) => event.eventDate)].map(
    (iso) => Date.parse(`${iso.slice(0, 10)}T00:00:00Z`),
  );
  if (dates.length === 0) return null;
  const start = Math.min(...dates);
  const end = Math.max(Math.max(...dates), start + MIN_SPAN_DAYS * MS_PER_DAY);
  const x = (iso: string) =>
    PAD_X + ((Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) - start) / (end - start)) * (WIDTH - PAD_X * 2);
  const startYear = new Date(start).getUTCFullYear();
  const endYear = new Date(end).getUTCFullYear();
  const yearStep = Math.max(1, Math.ceil((endYear - startYear) / 10));
  const years: number[] = [];
  for (let year = startYear + 1; year <= endYear; year += yearStep) years.push(year);

  return (
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="w-full" role="img" aria-label="Release calendar and exit events">
      <line x1={PAD_X} x2={WIDTH - PAD_X} y1={AXIS_Y} y2={AXIS_Y} stroke="var(--border-strong)" />
      {years.map((year) => {
        const position = x(`${year}-01-01`);
        return (
          <g key={year}>
            <line x1={position} x2={position} y1={AXIS_Y} y2={AXIS_Y + 6} stroke="var(--border-strong)" />
            <text x={position} y={AXIS_Y + 22} textAnchor="middle" fontSize="12" fill="var(--text-faint)">
              {year}
            </text>
          </g>
        );
      })}
      {releases.map((release) => (
        <line
          key={release.id}
          x1={x(release.releasedOn)}
          x2={x(release.releasedOn)}
          y1={AXIS_Y - 10}
          y2={AXIS_Y}
          stroke="var(--text-muted)"
          strokeWidth="2"
        >
          <title>{`${release.title} · ${formatDate(release.releasedOn)}`}</title>
        </line>
      ))}
      {exitEvents.map((event) => {
        const position = x(event.eventDate);
        return (
          <g key={event.id}>
            <line x1={position} x2={position} y1={14} y2={AXIS_Y} stroke="var(--frag-load-bearing)" strokeDasharray="2 3" />
            <circle
              cx={position}
              cy={12}
              r={5}
              fill={event.verified ? "var(--frag-load-bearing)" : "var(--surface)"}
              stroke="var(--frag-load-bearing)"
              strokeWidth="1.5"
            >
              <title>{`${event.characterName ?? event.personName ?? "Exit"} · ${label(event.exitType)} · ${formatDate(event.eventDate)}${event.verified ? "" : " · Unverified"}`}</title>
            </circle>
          </g>
        );
      })}
      <text x={PAD_X} y={HEIGHT - 2} fontSize="12" fill="var(--text-faint)">
        {formatYear(new Date(start).toISOString())}
      </text>
    </svg>
  );
}
