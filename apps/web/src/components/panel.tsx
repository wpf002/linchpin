import type { ReactNode } from "react";
import { clsx } from "clsx";

export function Panel({
  title,
  action,
  children,
  className,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={clsx("rounded-[var(--radius-ui)] border border-line bg-surface", className)}>
      <header className="flex items-center justify-between gap-4 border-b border-line px-4 py-3">
        <h2 className="text-sm font-medium text-ink">{title}</h2>
        {action}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

export function EmptyState({ title, detail }: { title: string; detail?: string }) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-12 text-center">
      <p className="text-base text-ink">{title}</p>
      {detail ? <p className="max-w-md text-sm text-muted">{detail}</p> : null}
    </div>
  );
}
