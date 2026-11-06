import Link from "next/link";
import type { FranchiseRow, ScreenerQuery } from "@linchpin/shared";
import { CoverageBadge } from "./coverage-badge";
import { FragilityMeter } from "./fragility-meter";
import { SortHeader } from "./sort-header";
import { formatNumber, formatPercent, label } from "@/lib/format";
import { NO_SCORE_HINT } from "@/lib/fragility";

interface Scores {
  top1Share: number;
  top3Share: number;
  hhi: number;
  fragility: number;
}

/** The API nulls every score below the coverage floor; a row is either fully scored or suppressed. */
function scoresOf(row: FranchiseRow): Scores | null {
  const { top1Share, top3Share, hhi, fragility } = row;
  if (top1Share === null || top3Share === null || hhi === null || fragility === null) return null;
  return { top1Share, top3Share, hhi, fragility };
}

/** Carry split into the lead, the next two, and everyone else. */
function Concentration({ top1Share, top3Share }: Pick<Scores, "top1Share" | "top3Share">) {
  const nextTwo = Math.max(0, top3Share - top1Share);
  return (
    <span className="flex items-center gap-3">
      <span className="flex h-2 w-32 gap-px overflow-hidden rounded-sm bg-raised" aria-hidden="true">
        <span className="bg-ink" style={{ width: `${top1Share * 100}%` }} />
        <span className="bg-faint" style={{ width: `${nextTwo * 100}%` }} />
      </span>
      <span className="num w-12 text-right text-ink">{formatPercent(top1Share)}</span>
      <span className="num w-12 text-right text-muted">{formatPercent(top3Share)}</span>
    </span>
  );
}

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
      <table className="w-full min-w-[960px] border-collapse text-sm">
        <thead className="border-b border-line text-left text-xs uppercase tracking-wide">
          <tr>
            <SortHeader column="name" label="Franchise" current={query} params={params} />
            <SortHeader column="rosterSize" label="Cast" current={query} params={params} />
            <th scope="col" className="px-3 py-3 font-medium text-muted">
              Lead
            </th>
            <SortHeader
              column="top1Share"
              label="Top 1 / Top 3"
              current={query}
              params={params}
              hint="Share of attention on the lead, then on the top three."
            />
            <SortHeader column="hhi" label="HHI" current={query} params={params} align="right" />
            <SortHeader column="fragility" label="Fragility" current={query} params={params} align="right" />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const scores = scoresOf(row);
            return (
              <tr key={row.id} className="group border-b border-line last:border-b-0 hover:bg-hover">
                <td className="px-3 py-3">
                  <Link href={`/franchises/${row.id}`} className="flex flex-col gap-1">
                    <span className="font-medium text-ink group-hover:text-accent-strong">{row.canonicalName}</span>
                    <span className="text-xs text-faint">
                      {label(row.medium)} · {label(row.status)}
                      {row.exitEventCount > 0 ? ` · ${row.exitEventCount} ${row.exitEventCount === 1 ? "Exit" : "Exits"}` : ""}
                    </span>
                  </Link>
                </td>
                <td className="px-3 py-3">
                  <span className="flex items-center gap-3">
                    <span className="num w-6 text-right text-muted">{row.rosterSize}</span>
                    <CoverageBadge value={row.rosterComplete} />
                  </span>
                </td>
                {scores ? (
                  <>
                    <td className="px-3 py-3 text-muted">
                      {row.topCharacter ? (
                        <Link href={`/characters/${row.topCharacter.id}`} className="hover:text-ink">
                          {row.topCharacter.canonicalName}
                        </Link>
                      ) : null}
                    </td>
                    <td className="px-3 py-3">
                      <Concentration top1Share={scores.top1Share} top3Share={scores.top3Share} />
                    </td>
                    <td className="num px-3 py-3 text-right text-muted">{formatNumber(scores.hhi, 3)}</td>
                    <td className="px-3 py-3">
                      <FragilityMeter value={scores.fragility} />
                    </td>
                  </>
                ) : (
                  <td
                    colSpan={4}
                    className="px-3 py-3 text-xs uppercase tracking-wide text-faint"
                    title={NO_SCORE_HINT}
                  >
                    No Score
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
