import Link from "next/link";
import { formatCount } from "@/lib/format";

const LINK_CLASS =
  "rounded-[var(--radius-ui)] border border-line px-3 py-2 text-sm text-muted transition-colors duration-150 hover:border-line-strong hover:text-ink";

/** Offset paging over the current search params. Renders nothing when everything fits on one page. */
export function Pager({
  params,
  cursor,
  limit,
  nextCursor,
  shown,
  total,
}: {
  params: Record<string, string>;
  cursor: number;
  limit: number;
  nextCursor: number | null;
  shown: number;
  total: number;
}) {
  if (cursor === 0 && nextCursor === null) return null;
  const href = (target: number) => `?${new URLSearchParams({ ...params, cursor: String(target) }).toString()}`;
  return (
    <nav className="mt-4 flex items-center justify-end gap-4" aria-label="Pagination">
      <span className="num text-sm text-faint">
        {formatCount(cursor + 1)}–{formatCount(cursor + shown)} of {formatCount(total)}
      </span>
      <span className="flex gap-2">
        {cursor > 0 ? (
          <Link href={href(Math.max(0, cursor - limit))} className={LINK_CLASS}>
            Previous
          </Link>
        ) : null}
        {nextCursor !== null ? (
          <Link href={href(nextCursor)} className={LINK_CLASS}>
            Next
          </Link>
        ) : null}
      </span>
    </nav>
  );
}
