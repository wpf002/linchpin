"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { clsx } from "clsx";

const LINKS = [
  { href: "/", label: "Screener", matches: (path: string) => path === "/" || path.startsWith("/franchises") || path.startsWith("/characters") },
  { href: "/validation", label: "Validation", matches: (path: string) => path.startsWith("/validation") },
] as const;

export function NavLinks() {
  const pathname = usePathname();
  return (
    <nav aria-label="Primary" className="flex h-full items-stretch gap-6">
      {LINKS.map((link) => {
        const active = link.matches(pathname);
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? "page" : undefined}
            className={clsx(
              "relative flex items-center text-sm transition-colors duration-150",
              active ? "text-ink" : "text-muted hover:text-ink",
            )}
          >
            {link.label}
            {active ? <span className="absolute inset-x-0 bottom-0 h-0.5 bg-accent" /> : null}
          </Link>
        );
      })}
    </nav>
  );
}
