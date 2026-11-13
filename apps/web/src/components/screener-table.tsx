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

/** Attention split into the lead, the next two, and everyone else. */
function Concentration({ top1Share, top3Share }: Pick<Scores, "top1Share" | "top3Share">) {
  const nextTwo = Math.max(0, top3Share - top1Share);
  return (
    <span className="flex items-center gap-3">
      <span className="num w-12 text-right text-ink">{formatPercent(top1Share, 0)}</span>
      <span className="flex h-3 w-32 gap-px bg-raised" aria-hidden="true">
        <span className="bg-ink" style={{ width: `${top1Share * 100}%` }} />
        <span className="bg-faint" style={{ width: `${nextTwo * 100}%` }} />
      </span>
      <span className="num w-12 text-muted">{formatPercent(top3Share, 0)}</span>
    </span>
  );
}

function franchiseFacts(row: FranchiseRow): string {
  const exits = row.exitEventCount;
  const exitText = exits > 0 ? ` · ${exits} ${exits === 1 ? "Exit" : "Exits"}` : "";
  return `${label(row.medium)} · ${label(row.status)}${exitText}`;
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
    <div className="overflow-x-auto">
      <table className="w-full min-w-[960px] border-collapse">
        <thead className="border-b border-ink text-left text-sm">
          <tr>
            <SortHeader column="name" label="Franchise" current={query} params={params} />
            <th scope="col" className="px-3 py-3 font-medium text-muted">
              Lead
            </th>
            <SortHeader
              column="top1Share"
              label="Lead Share / Top 3"
              current={query}
              params={params}
              hint="Lead share / top 3 share."
            />
            <SortHeader
              column="hhi"
              label="Concentration"
              current={query}
              params={params}
              align="right"
              hint="Sum of squared shares. 1.0 = one character."
            />
            <SortHeader column="rosterSize" label="Cast" current={query} params={params} align="right" />
            <SortHeader column="fragility" label="Lead Weight" current={query} params={params} align="right" />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const scores = scoresOf(row);
            return (
              <tr key={row.id} className="group border-b border-line align-baseline hover:bg-hover">
                <td className="py-4 pr-3 pl-3">
                  <Link href={`/franchises/${row.id}`} className="flex flex-col gap-1">
                    <span
                      className={`font-display text-lg leading-tight group-hover:text-accent-strong ${scores ? "text-ink" : "text-muted"}`}
                    >
                      {row.canonicalName}
                    </span>
                    <span className="text-xs text-faint">{franchiseFacts(row)}</span>
                  </Link>
                </td>
                {scores ? (
                  <>
                    <td className="px-3 py-4 text-muted">
                      {row.topCharacter ? (
                        <Link href={`/characters/${row.topCharacter.id}`} className="hover:text-ink">
                          {row.topCharacter.canonicalName}
                        </Link>
                      ) : null}
                    </td>
                    <td className="px-3 py-4">
                      <Concentration top1Share={scores.top1Share} top3Share={scores.top3Share} />
                    </td>
                    <td className="num px-3 py-4 text-right text-muted">{formatNumber(scores.hhi, 3)}</td>
                  </>
                ) : (
                  <td colSpan={3} className="px-3 py-4 text-sm text-faint" title={NO_SCORE_HINT}>
                    No Score
                  </td>
                )}
                <td className="px-3 py-4">
                  <span className="flex items-center justify-end gap-3">
                    <CoverageBadge value={row.rosterComplete} />
                    <span className="num w-6 text-right text-muted">{row.rosterSize}</span>
                  </span>
                </td>
                <td className="px-3 py-4">{scores ? <FragilityMeter value={scores.fragility} /> : null}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
