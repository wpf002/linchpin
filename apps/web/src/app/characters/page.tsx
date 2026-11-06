import type { Metadata } from "next";
import Link from "next/link";
import { leadersQuerySchema, type LeaderRow } from "@linchpin/shared";
import { PageTitle } from "@/components/page-title";
import { Pager } from "@/components/pager";
import { EmptyState } from "@/components/panel";
import { QueryForm } from "@/components/query-form";
import { SortHeader } from "@/components/sort-header";
import { fetchLeaders } from "@/lib/api";
import { formatCount, formatNumber, formatPercent, label } from "@/lib/format";
import { flattenSearchParams, type RawSearchParams } from "@/lib/search-params";

export const metadata: Metadata = { title: "Characters" };

/** Carry as a bar whose opacity tracks confidence, with both numbers printed. */
function Carry({ row }: { row: LeaderRow }) {
  return (
    <span className="flex items-center justify-end gap-3">
      <span className="relative hidden h-2 w-24 overflow-hidden rounded-sm bg-raised sm:block" aria-hidden="true">
        <span
          className="absolute inset-y-0 left-0 bg-ink"
          style={{ width: `${row.carryScore * 100}%`, opacity: 0.4 + row.confidence * 0.6 }}
        />
      </span>
      <span className="flex flex-col items-end gap-1">
        <span className="num text-ink">{formatPercent(row.carryScore)}</span>
        <span className="num text-xs text-faint">Confidence {formatPercent(row.confidence, 0)}</span>
      </span>
    </span>
  );
}

export default async function CharactersPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const params = flattenSearchParams(await searchParams);
  const parsed = leadersQuerySchema.safeParse(params);
  const query = parsed.success ? parsed.data : leadersQuerySchema.parse({});
  const page = await fetchLeaders(query);

  return (
    <>
      <PageTitle
        title="Characters"
        aside={
          <QueryForm
            placeholder="Character or Franchise"
            value={query.q}
            preserved={{ sort: query.sort, order: query.order }}
          />
        }
      />
      {page.rows.length === 0 ? (
        <div className="rounded-[var(--radius-ui)] border border-line bg-surface">
          <EmptyState title="No Matches" detail="No scored character matches this search." />
        </div>
      ) : (
        <div className="overflow-x-auto rounded-[var(--radius-ui)] border border-line bg-surface">
          <table className="w-full min-w-[880px] border-collapse text-sm">
            <thead className="border-b border-line text-left text-xs uppercase tracking-wide">
              <tr>
                <th scope="col" className="w-12 px-3 py-3 text-right font-medium text-muted">
                  Rank
                </th>
                <th scope="col" className="px-3 py-3 font-medium text-muted">
                  Character
                </th>
                <th scope="col" className="px-3 py-3 font-medium text-muted">
                  Franchise
                </th>
                <SortHeader
                  column="carryScore"
                  label="Carry"
                  current={query}
                  params={params}
                  align="right"
                  hint="Share of the franchise's character attention."
                />
                <SortHeader
                  column="offCycleCarry"
                  label="Off-Cycle"
                  current={query}
                  params={params}
                  align="right"
                  hint="Carry on days away from any release."
                />
                <SortHeader
                  column="durabilityRatio"
                  label="Durability"
                  current={query}
                  params={params}
                  align="right"
                  hint="Off-cycle attention relative to on-cycle attention."
                />
              </tr>
            </thead>
            <tbody>
              {page.rows.map((row, index) => (
                <tr key={row.id} className="group border-b border-line last:border-b-0 hover:bg-hover">
                  <td className="num px-3 py-3 text-right text-faint">{query.cursor + index + 1}</td>
                  <td className="px-3 py-3">
                    <Link href={`/characters/${row.id}`} className="flex flex-col gap-1">
                      <span className="font-medium text-ink group-hover:text-accent-strong">{row.canonicalName}</span>
                      <span className="text-xs text-faint">
                        {row.portrayedBy ? `${row.portrayedBy} · ` : ""}
                        {label(row.status)}
                      </span>
                    </Link>
                  </td>
                  <td className="px-3 py-3">
                    <Link href={`/franchises/${row.franchise.id}`} className="text-muted hover:text-ink">
                      {row.franchise.canonicalName}
                    </Link>
                  </td>
                  <td className="px-3 py-3">
                    <Carry row={row} />
                  </td>
                  <td className="num px-3 py-3 text-right text-muted">
                    {row.offCycleCarry === null ? "" : formatPercent(row.offCycleCarry)}
                  </td>
                  <td className="num px-3 py-3 text-right text-muted">
                    {row.durabilityRatio === null ? "" : formatNumber(row.durabilityRatio, 2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="mt-4 flex items-center justify-between gap-4">
        <span className="num text-sm text-faint">{formatCount(page.total)} Scored</span>
        <Pager
          params={params}
          cursor={query.cursor}
          limit={query.limit}
          nextCursor={page.nextCursor}
          shown={page.rows.length}
          total={page.total}
        />
      </div>
    </>
  );
}
