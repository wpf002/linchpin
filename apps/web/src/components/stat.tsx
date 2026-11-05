import type { ReactNode } from "react";

/** A labelled figure. The label carries a tooltip because app screens carry no prose. */
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
    <div className="flex min-w-0 flex-col gap-1">
      <dt className="text-xs uppercase tracking-wide text-faint" title={hint}>
        {label}
      </dt>
      <dd className="num text-lg font-medium text-ink">{value}</dd>
      {detail ? <dd className="text-xs text-muted">{detail}</dd> : null}
    </div>
  );
}
