import Link from "next/link";
import type { FranchiseRow, ScreenerQuery } from "@linchpin/shared";
import { CoverageBadge } from "./coverage-badge";
import { FragilityMeter } from "./fragility-meter";
import { SortHeader } from "./sort-header";
import { formatNumber, formatPercent, label } from "@/lib/format";

export function ScreenerTable({
  rows,
  query,
  params,
}: {
  rows: FranchiseRow[];
  query: Pick<ScreenerQuery, "sort" | "order">;
  params: Record<string, string>;
}) {
  return (
    <div className="overflow-x-auto rounded-[var(--radius-ui)] border border-line bg-surface">
      <table className="w-full min-w-[880px] border-collapse text-sm">
        <thead className="border-b border-line text-left text-xs uppercase tracking-wide">
          <tr>
            <SortHeader column="name" label="Franchise" current={query} params={params} />
            <th scope="col" className="px-3 py-3 font-medium text-muted">
              Lead
            </th>
            <SortHeader column="rosterSize" label="Roster" current={query} params={params} align="right" />
            <SortHeader column="top1Share" label="Top 1" current={query} params={params} align="right" />
            <th scope="col" className="px-3 py-3 text-right font-medium text-muted">
              Top 3
            </th>
            <SortHeader column="hhi" label="HHI" current={query} params={params} align="right" />
            <SortHeader column="fragility" label="Fragility" current={query} params={params} align="right" />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="group border-b border-line last:border-b-0 hover:bg-hover">
              <td className="px-3 py-3">
                <Link href={`/franchises/${row.id}`} className="flex flex-col gap-1">
                  <span className="font-medium text-ink group-hover:text-accent-strong">{row.canonicalName}</span>
                  <span className="text-xs text-faint">
                    {label(row.medium)} · {label(row.status)}
                    {row.exitEventCount > 0 ? ` · ${row.exitEventCount} Exits` : ""}
                  </span>
                </Link>
              </td>
              <td className="px-3 py-3 text-muted">
                {row.topCharacter && row.top1Share !== null ? (
                  <Link href={`/characters/${row.topCharacter.id}`} className="hover:text-ink">
                    {row.topCharacter.canonicalName}
                  </Link>
                ) : (
                  <span className="text-faint">—</span>
                )}
              </td>
              <td className="px-3 py-3 text-right">
                <span className="flex items-center justify-end gap-3">
                  <span className="num text-muted">{row.rosterSize}</span>
                  <CoverageBadge value={row.rosterComplete} />
                </span>
              </td>
              <td className="num px-3 py-3 text-right text-ink">{formatPercent(row.top1Share)}</td>
              <td className="num px-3 py-3 text-right text-muted">{formatPercent(row.top3Share)}</td>
              <td className="num px-3 py-3 text-right text-muted">{formatNumber(row.hhi, 3)}</td>
              <td className="px-3 py-3">
                <FragilityMeter value={row.fragility} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
