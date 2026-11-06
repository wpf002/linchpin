import type { ReactNode } from "react";
import { clsx } from "clsx";

/** A page section: a heavy top rule, a serif heading, then the content with no box around it. */
export function Panel({
  title,
  hint,
  action,
  children,
  className,
}: {
  title: string;
  /** Tooltip on the heading. Screens carry no explanatory prose. */
  hint?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={clsx("min-w-0 border-t-2 border-ink pt-4", className)}>
      <header className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
        <h2 className="font-display text-lg leading-tight text-ink" title={hint}>
          {title}
        </h2>
        {action}
      </header>
      {children}
    </section>
  );
}

export function EmptyState({ title, detail }: { title: string; detail?: string }) {
  return (
    <div className="flex flex-col gap-2 border-y border-line py-12">
      <p className="font-display text-lg text-muted">{title}</p>
      {detail ? <p className="max-w-md text-sm text-muted">{detail}</p> : null}
    </div>
  );
}
