import type { ReactNode } from "react";

export function PageTitle({
  eyebrow,
  title,
  aside,
}: {
  eyebrow?: ReactNode;
  title: string;
  aside?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-6 pt-12 pb-8">
      <div className="flex min-w-0 flex-col gap-2">
        {eyebrow ? <div className="text-sm text-muted">{eyebrow}</div> : null}
        <h1 className="font-display text-display leading-none text-ink">{title}</h1>
      </div>
      {aside}
    </div>
  );
}
