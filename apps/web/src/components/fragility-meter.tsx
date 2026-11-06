import { BAND_TOKEN, NO_SCORE_HINT, bandOf, domainPosition } from "@/lib/fragility";
import { formatSigned } from "@/lib/format";

const ZERO = domainPosition(0);

/** Diverging bar from zero. Null renders as No Score, never as a dimmed value. */
export function FragilityMeter({ value }: { value: number | null }) {
  if (value === null) {
    return (
      <span className="text-xs uppercase tracking-wide text-faint" title={NO_SCORE_HINT}>
        No Score
      </span>
    );
  }
  const band = bandOf(value);
  const position = domainPosition(value);
  const left = Math.min(position, ZERO);
  const width = Math.abs(position - ZERO);
  const color = BAND_TOKEN[band.id];
  return (
    <span className="flex items-center justify-end gap-3">
      <span className="hidden text-xs sm:inline" style={{ color }}>
        {band.label}
      </span>
      <span className="relative h-2 w-24 rounded-sm bg-raised" aria-hidden="true">
        <span className="absolute inset-y-[-2px] w-px bg-line-strong" style={{ left: `${ZERO * 100}%` }} />
        <span
          className="absolute inset-y-0 rounded-sm"
          style={{ left: `${left * 100}%`, width: `${Math.max(width * 100, 1)}%`, background: color }}
        />
      </span>
      <span className="num w-12 text-right text-sm font-medium text-ink">{formatSigned(value, 2)}</span>
    </span>
  );
}
