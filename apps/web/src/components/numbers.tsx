import type { ReactNode } from "react";

/** The exact figures behind a page, closed until asked for. Styled as a Panel so it sits in the same rhythm. */
export function Numbers({ children }: { children: ReactNode }) {
  return (
    <details className="group min-w-0 border-t-2 border-ink pt-4">
      <summary className="flex cursor-pointer list-none items-baseline justify-between gap-4 font-display text-lg leading-tight text-ink [&::-webkit-details-marker]:hidden">
        Numbers
        <span className="font-sans text-sm text-muted group-open:hidden">Show</span>
        <span className="hidden font-sans text-sm text-muted group-open:inline">Hide</span>
      </summary>
      <div className="flex flex-col gap-8 pt-6">{children}</div>
    </details>
  );
}
