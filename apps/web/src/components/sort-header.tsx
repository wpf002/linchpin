import Link from "next/link";
import { clsx } from "clsx";

/** Column header that toggles a `sort` and `order` search param and resets paging. */
export function SortHeader({
  column,
  label,
  current,
  params,
  align = "left",
  hint,
}: {
  column: string;
  label: string;
  current: { sort: string; order: "asc" | "desc" };
  params: Record<string, string>;
  align?: "left" | "right";
  hint?: string;
}) {
  const active = current.sort === column;
  const nextOrder = active && current.order === "desc" ? "asc" : "desc";
  const query = new URLSearchParams({ ...params, sort: column, order: nextOrder });
  query.delete("cursor");
  return (
    <th
      scope="col"
      aria-sort={active ? (current.order === "asc" ? "ascending" : "descending") : "none"}
      className={clsx("px-3 py-3 font-medium", align === "right" && "text-right")}
    >
      <Link
        href={`?${query.toString()}`}
        scroll={false}
        title={hint}
        className={clsx(
          "inline-flex items-center gap-1 transition-colors duration-150",
          active ? "text-ink" : "text-muted hover:text-ink",
        )}
      >
        {label}
        <span aria-hidden="true" className={clsx("text-accent", !active && "invisible")}>
          {current.order === "asc" ? "↑" : "↓"}
        </span>
      </Link>
    </th>
  );
}
