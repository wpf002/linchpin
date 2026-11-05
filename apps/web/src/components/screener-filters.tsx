"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { ROSTER_COMPLETE_DISPLAY_FLOOR, franchiseStatusSchema, mediumSchema } from "@linchpin/shared";
import { label } from "@/lib/format";

const SEARCH_DEBOUNCE_MS = 250;

const controlClass =
  "h-9 rounded-[var(--radius-ui)] border border-line bg-surface px-3 text-sm text-ink transition-colors duration-150 hover:border-line-strong disabled:opacity-50";

export function ScreenerFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [search, setSearch] = useState(params.get("q") ?? "");

  function update(key: string, value: string | null) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete("cursor");
    startTransition(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }));
  }

  useEffect(() => {
    if (search === (params.get("q") ?? "")) return;
    const timer = setTimeout(() => update("q", search.trim() || null), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // update is recreated each render; the debounce only tracks the typed value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const hideSuppressed = params.get("minRosterComplete") !== null;

  return (
    <div className="flex flex-wrap items-center gap-3" aria-busy={pending}>
      <label className="relative">
        <span className="sr-only">Search Franchises</span>
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search"
          className={`${controlClass} w-56 placeholder:text-faint`}
        />
      </label>
      <label>
        <span className="sr-only">Medium</span>
        <select
          className={controlClass}
          value={params.get("medium") ?? ""}
          onChange={(event) => update("medium", event.target.value || null)}
        >
          <option value="">All Media</option>
          {mediumSchema.options.map((medium) => (
            <option key={medium} value={medium}>
              {label(medium)}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span className="sr-only">Status</span>
        <select
          className={controlClass}
          value={params.get("status") ?? ""}
          onChange={(event) => update("status", event.target.value || null)}
        >
          <option value="">Any Status</option>
          {franchiseStatusSchema.options.map((status) => (
            <option key={status} value={status}>
              {label(status)}
            </option>
          ))}
        </select>
      </label>
      <label className="flex h-9 cursor-pointer items-center gap-2 text-sm text-muted hover:text-ink">
        <input
          type="checkbox"
          className="size-4 accent-[var(--accent)]"
          checked={hideSuppressed}
          onChange={(event) =>
            update("minRosterComplete", event.target.checked ? String(ROSTER_COMPLETE_DISPLAY_FLOOR) : null)
          }
        />
        Scored Only
      </label>
      {pending ? <span className="text-xs text-faint">Updating</span> : null}
    </div>
  );
}
