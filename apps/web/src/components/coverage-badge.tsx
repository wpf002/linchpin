import { ROSTER_COMPLETE_DISPLAY_FLOOR } from "@linchpin/shared";
import { formatPercent } from "@/lib/format";
import { COVERAGE_HINT } from "@/lib/fragility";

/**
 * rosterComplete is the confidence flag for every concentration figure. It is
 * always shown beside them, and below the floor the figures are withheld.
 */
export function CoverageBadge({ value }: { value: number }) {
  const trusted = value >= ROSTER_COMPLETE_DISPLAY_FLOOR;
  return (
    <span className="inline-flex items-center gap-2" title={COVERAGE_HINT}>
      <span className="relative h-1 w-10 overflow-hidden rounded-full bg-line" aria-hidden="true">
        <span
          className="absolute inset-y-0 left-0 rounded-full"
          style={{
            width: `${Math.min(1, value) * 100}%`,
            background: trusted ? "var(--text-muted)" : "var(--fail)",
          }}
        />
        <span
          className="absolute inset-y-0 w-px bg-ink"
          style={{ left: `${ROSTER_COMPLETE_DISPLAY_FLOOR * 100}%` }}
        />
      </span>
      <span className={`num text-xs ${trusted ? "text-muted" : "text-fail"}`}>
        {formatPercent(value, 0)}
      </span>
    </span>
  );
}
