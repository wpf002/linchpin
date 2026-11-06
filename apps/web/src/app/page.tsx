import { Suspense } from "react";
import { screenerQuerySchema } from "@linchpin/shared";
import { FragilityStrip } from "@/components/fragility-strip";
import { PageTitle } from "@/components/page-title";
import { Pager } from "@/components/pager";
import { EmptyState } from "@/components/panel";
import { ScreenerFilters } from "@/components/screener-filters";
import { ScreenerTable } from "@/components/screener-table";
import { fetchAllFranchises, fetchScreener } from "@/lib/api";
import { formatCount } from "@/lib/format";
import { NO_SCORE_HINT } from "@/lib/fragility";
import { flattenSearchParams, type RawSearchParams } from "@/lib/search-params";

/** Paging params stay out of the export link: the CSV carries every matching row. */
const PAGING_PARAMS = ["cursor", "limit"] as const;

function exportHref(params: Record<string, string>): string {
  const query = new URLSearchParams(params);
  for (const name of PAGING_PARAMS) query.delete(name);
  const suffix = query.toString();
  return suffix ? `/api/export?${suffix}` : "/api/export";
}

export default async function ScreenerPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const params = flattenSearchParams(await searchParams);
  const parsed = screenerQuerySchema.safeParse(params);
  const query = parsed.success ? parsed.data : screenerQuerySchema.parse({});
  // The strip and the counts cover the whole universe regardless of table filters.
  const [page, universe] = await Promise.all([fetchScreener(query), fetchAllFranchises()]);
  const scored = universe.filter((row) => row.fragility !== null).length;
  const exits = universe.reduce((sum, row) => sum + row.exitEventCount, 0);

  return (
    <>
      <PageTitle
        title="Franchises"
        aside={
          <dl className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
            <Count label="Franchises" value={universe.length} />
            <Count label="Scored" value={scored} />
            <Count
              label="No Score"
              value={universe.length - scored}
              hint={NO_SCORE_HINT}
            />
            <Count label="Cast Exits" value={exits} />
          </dl>
        }
      />
      {scored > 0 ? (
        <section className="mb-12 rounded-[var(--radius-ui)] border border-line bg-surface p-4 sm:p-6">
          <FragilityStrip rows={universe} />
        </section>
      ) : null}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
        <Suspense>
          <ScreenerFilters />
        </Suspense>
        <div className="flex items-center gap-4">
          <span className="num text-sm text-faint">{formatCount(page.total)} Results</span>
          <a
            href={exportHref(params)}
            download
            className="flex h-9 items-center rounded-[var(--radius-ui)] border border-line px-3 text-sm text-muted transition-colors duration-150 hover:border-line-strong hover:text-ink active:bg-hover"
          >
            Export CSV
          </a>
        </div>
      </div>
      {page.rows.length === 0 ? (
        <div className="rounded-[var(--radius-ui)] border border-line bg-surface">
          <EmptyState title="No Matches" />
        </div>
      ) : (
        <ScreenerTable rows={page.rows} query={query} params={params} />
      )}
      <Pager
        params={params}
        cursor={query.cursor}
        limit={query.limit}
        nextCursor={page.nextCursor}
        shown={page.rows.length}
        total={page.total}
      />
    </>
  );
}

function Count({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div className="flex flex-col items-end gap-1">
      <dt className="text-xs uppercase tracking-wide text-faint" title={hint}>
        {label}
      </dt>
      <dd className="num text-lg text-ink">{formatCount(value)}</dd>
    </div>
  );
}
