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
    <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-6 pt-12 pb-8 sm:pt-16">
      <div className="flex min-w-0 flex-col gap-3">
        {eyebrow ? <div className="text-sm text-muted">{eyebrow}</div> : null}
        <h1 className="font-display text-display leading-none text-ink [overflow-wrap:anywhere]">
          {title}
        </h1>
      </div>
      {aside}
    </div>
  );
}
