import type { ReactNode } from "react";

/**
 * A figure with its caption underneath. The caption carries a tooltip because app screens carry no prose.
 * The detail sits on the caption line so every stat in a row is two lines tall and the figures line up.
 */
export function Stat({
  label,
  value,
  detail,
  hint,
}: {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  hint?: string;
}) {
  return (
    <div className="flex min-w-0 flex-col-reverse justify-end gap-1">
      <dt className="flex flex-wrap items-baseline gap-x-2 text-sm text-muted" title={hint}>
        {label}
        {detail ? <span className="text-xs text-faint">{detail}</span> : null}
      </dt>
      <dd className="num text-lg leading-tight text-ink">{value}</dd>
    </div>
  );
}
