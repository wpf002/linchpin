import { clsx } from "clsx";
import { Face } from "./face";

/** Ring geometry in a 100-unit viewBox. The stroke sits just inside the box edge. */
const RING_STROKE = 4;
const RING_RADIUS = 50 - RING_STROKE / 2;
/** pathLength on the arc, so a dash length reads as a percentage of the ring. */
const RING_UNITS = 100;

/**
 * A portrait inside a ring. The filled part of the ring is the share of attention.
 * A null share draws no ring: the figure is withheld, not shown as zero.
 */
export function RingFace({
  name,
  imageUrl,
  share,
  title,
  className,
}: {
  name: string;
  imageUrl: string | null;
  share: number | null;
  title?: string;
  className?: string;
}) {
  return (
    <span className={clsx("relative inline-block aspect-square shrink-0", className)}>
      {share === null ? null : (
        <svg viewBox="0 0 100 100" aria-hidden="true" className="absolute inset-0 size-full -rotate-90" fill="none">
          <circle cx="50" cy="50" r={RING_RADIUS} strokeWidth={RING_STROKE} className="stroke-line" />
          {share > 0 ? (
            <circle
              cx="50"
              cy="50"
              r={RING_RADIUS}
              strokeWidth={RING_STROKE}
              strokeLinecap="round"
              pathLength={RING_UNITS}
              strokeDasharray={`${share * RING_UNITS} ${RING_UNITS}`}
              className="stroke-ink"
            />
          ) : null}
        </svg>
      )}
      <span className="absolute inset-[9%] flex">
        <Face name={name} imageUrl={imageUrl} title={title} className="w-full" />
      </span>
    </span>
  );
}
