"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { clsx } from "clsx";
import { searchResponseSchema, type SearchResponse } from "@linchpin/shared";
import { label } from "@/lib/format";

const DEBOUNCE_MS = 200;
const MIN_QUERY_LENGTH = 2;
const FOCUS_KEY = "/";
const EDITABLE_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);

type Group = "Franchises" | "Characters";

interface Option {
  key: string;
  href: string;
  name: string;
  context: string;
  group: Group;
}

type Results = { kind: "idle" } | { kind: "ready"; options: Option[] } | { kind: "error" };

function toOptions(response: SearchResponse): Option[] {
  return [
    ...response.franchises.map((franchise) => ({
      key: `franchise-${franchise.id}`,
      href: `/franchises/${franchise.id}`,
      name: franchise.canonicalName,
      context: label(franchise.medium),
      group: "Franchises" as const,
    })),
    ...response.characters.map((character) => ({
      key: `character-${character.id}`,
      href: `/characters/${character.id}`,
      name: character.canonicalName,
      context: character.franchiseName,
      group: "Characters" as const,
    })),
  ];
}

function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (EDITABLE_TAGS.has(target.tagName) || target.isContentEditable);
}

/** Header search across franchises and characters. Arrow keys move, Enter opens, Escape closes. */
export function GlobalSearch() {
  const router = useRouter();
  const listId = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Results>({ kind: "idle" });
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const term = query.trim();
    if (term.length < MIN_QUERY_LENGTH) {
      setResults({ kind: "idle" });
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/search?${new URLSearchParams({ q: term }).toString()}`, {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`Search failed (${response.status})`);
        setResults({ kind: "ready", options: toOptions(searchResponseSchema.parse(await response.json())) });
        setActiveIndex(0);
      } catch (error) {
        if (controller.signal.aborted) return;
        console.error("search failed", error);
        setResults({ kind: "error" });
      }
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  useEffect(() => {
    function focusOnShortcut(event: globalThis.KeyboardEvent) {
      if (event.key !== FOCUS_KEY || event.metaKey || event.ctrlKey || event.altKey || isTyping(event.target)) return;
      event.preventDefault();
      inputRef.current?.focus();
    }
    window.addEventListener("keydown", focusOnShortcut);
    return () => window.removeEventListener("keydown", focusOnShortcut);
  }, []);

  const options = results.kind === "ready" ? results.options : [];
  const expanded = open && results.kind !== "idle";

  function go(option: Option) {
    setOpen(false);
    setQuery("");
    inputRef.current?.blur();
    router.push(option.href);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
      return;
    }
    if (options.length === 0) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      setOpen(true);
      setActiveIndex((index) => (index + step + options.length) % options.length);
      return;
    }
    const selected = options[activeIndex];
    if (event.key === "Enter" && selected) {
      event.preventDefault();
      go(selected);
    }
  }

  return (
    <div className="relative min-w-0 flex-1 md:w-64 md:flex-none">
      <input
        ref={inputRef}
        type="search"
        role="combobox"
        aria-label="Search Franchises and Characters"
        aria-expanded={expanded}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={expanded && options[activeIndex] ? `${listId}-${activeIndex}` : undefined}
        placeholder="Search"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
        className="h-9 w-full rounded-[var(--radius-ui)] border border-line bg-surface pl-3 pr-8 text-sm text-ink transition-colors duration-150 placeholder:text-faint hover:border-line-strong"
      />
      <kbd
        aria-hidden="true"
        className="pointer-events-none absolute right-2 top-1/2 hidden -translate-y-1/2 rounded-sm border border-line px-1 font-mono text-xs text-faint md:block"
      >
        {FOCUS_KEY}
      </kbd>
      {expanded ? (
        <ul
          id={listId}
          role="listbox"
          aria-label="Search Results"
          className="rise absolute right-0 top-full z-30 mt-2 max-h-96 w-[min(360px,calc(100vw-32px))] overflow-y-auto rounded-[var(--radius-ui)] border border-line-strong bg-raised py-2 shadow-lg"
        >
          {results.kind === "error" ? (
            <li role="presentation" className="px-3 py-2 text-sm text-fail">
              Search Unavailable
            </li>
          ) : null}
          {results.kind === "ready" && options.length === 0 ? (
            <li role="presentation" className="px-3 py-2 text-sm text-muted">
              No Matches
            </li>
          ) : null}
          {options.map((option, index) => (
            <OptionRow
              key={option.key}
              id={`${listId}-${index}`}
              option={option}
              heading={options[index - 1]?.group === option.group ? null : option.group}
              active={index === activeIndex}
              onHover={() => setActiveIndex(index)}
              onChoose={() => go(option)}
            />
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function OptionRow({
  id,
  option,
  heading,
  active,
  onHover,
  onChoose,
}: {
  id: string;
  option: Option;
  heading: Group | null;
  active: boolean;
  onHover: () => void;
  onChoose: () => void;
}) {
  return (
    <>
      {heading ? (
        <li role="presentation" className="px-3 pb-1 pt-2 text-xs uppercase tracking-wide text-faint">
          {heading}
        </li>
      ) : null}
      <li
        id={id}
        role="option"
        aria-selected={active}
        onMouseEnter={onHover}
        // mousedown would blur the input and close the list before the click lands
        onMouseDown={(event) => event.preventDefault()}
        onClick={onChoose}
        className={clsx(
          "flex cursor-pointer items-baseline justify-between gap-4 px-3 py-2 text-sm",
          active ? "bg-hover text-ink" : "text-muted",
        )}
      >
        <span className="truncate">{option.name}</span>
        <span className="shrink-0 text-xs text-faint">{option.context}</span>
      </li>
    </>
  );
}
