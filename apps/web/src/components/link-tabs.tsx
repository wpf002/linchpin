import Link from "next/link";
import { clsx } from "clsx";

export interface LinkTab {
  href: string;
  label: string;
  active: boolean;
}

/** A row of links that switch a search param. The active one carries the accent underline. */
export function LinkTabs({ label, tabs }: { label: string; tabs: LinkTab[] }) {
  return (
    <nav aria-label={label} className="flex items-center gap-4">
      {tabs.map((tab) => (
        <Link
          key={tab.label}
          href={tab.href}
          scroll={false}
          aria-current={tab.active ? "page" : undefined}
          className={clsx(
            "border-b-2 py-1 text-sm whitespace-nowrap transition-colors duration-150",
            tab.active ? "border-accent text-ink" : "border-transparent text-muted hover:text-ink",
          )}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
