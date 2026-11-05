import Link from "next/link";
import type { ScreenerQuery } from "@linchpin/shared";
import { clsx } from "clsx";

export function SortHeader({
  column,
  label,
  current,
  params,
  align = "left",
}: {
  column: ScreenerQuery["sort"];
  label: string;
  current: Pick<ScreenerQuery, "sort" | "order">;
  params: Record<string, string>;
  align?: "left" | "right";
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
