"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { clsx } from "clsx";

const LINKS = [
  { href: "/", label: "Franchises", matches: (path: string) => path === "/" || path.startsWith("/franchises") },
  { href: "/characters", label: "Characters", matches: (path: string) => path.startsWith("/characters") },
  { href: "/exits", label: "Exits", matches: (path: string) => path.startsWith("/exits") },
] as const;

export function NavLinks({ className }: { className?: string }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Primary" className={clsx("flex items-stretch justify-between gap-2 overflow-x-auto [scrollbar-width:none] md:justify-start md:gap-6", className)}>
      {LINKS.map((link) => {
        const active = link.matches(pathname);
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? "page" : undefined}
            className={clsx(
              "relative flex shrink-0 items-center text-sm transition-colors duration-150",
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
