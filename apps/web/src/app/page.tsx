import Link from "next/link";
import { Suspense } from "react";
import { screenerQuerySchema } from "@linchpin/shared";
import { FragilityStrip } from "@/components/fragility-strip";
import { PageTitle } from "@/components/page-title";
import { EmptyState } from "@/components/panel";
import { ScreenerFilters } from "@/components/screener-filters";
import { ScreenerTable } from "@/components/screener-table";
import { fetchScreener } from "@/lib/api";
import { formatCount } from "@/lib/format";
import { flattenSearchParams, type RawSearchParams } from "@/lib/search-params";

/** The strip shows the whole scored universe regardless of table filters. */
const STRIP_LIMIT = 200;

export default async function ScreenerPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const params = flattenSearchParams(await searchParams);
  const parsed = screenerQuerySchema.safeParse(params);
  const query = parsed.success ? parsed.data : screenerQuerySchema.parse({});
  const [page, universe] = await Promise.all([
    fetchScreener(query),
    fetchScreener({ limit: STRIP_LIMIT, sort: "fragility", order: "desc" }),
  ]);
  const scored = universe.rows.filter((row) => row.fragility !== null).length;
  const exits = universe.rows.reduce((sum, row) => sum + row.exitEventCount, 0);

  return (
    <>
      <PageTitle
        title="Franchise Fragility"
        aside={
          <dl className="flex gap-8 text-sm">
            <Count label="Franchises" value={universe.total} />
            <Count label="Scored" value={scored} />
            <Count label="Suppressed" value={universe.rows.length - scored} hint="Roster coverage below 70%." />
            <Count label="Exit Events" value={exits} />
          </dl>
        }
      />
      <section className="mb-12 rounded-[var(--radius-ui)] border border-line bg-surface p-4 sm:p-6">
        <FragilityStrip rows={universe.rows} />
      </section>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
        <Suspense>
          <ScreenerFilters />
        </Suspense>
        <span className="num text-sm text-faint">{formatCount(page.total)} Results</span>
      </div>
      {page.rows.length === 0 ? (
        <div className="rounded-[var(--radius-ui)] border border-line bg-surface">
          <EmptyState title="No Matches" detail="No franchise matches these filters." />
        </div>
      ) : (
        <ScreenerTable rows={page.rows} query={query} params={params} />
      )}
      <Pager params={params} cursor={query.cursor} limit={query.limit} nextCursor={page.nextCursor} />
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

function Pager({
  params,
  cursor,
  limit,
  nextCursor,
}: {
  params: Record<string, string>;
  cursor: number;
  limit: number;
  nextCursor: number | null;
}) {
  if (cursor === 0 && nextCursor === null) return null;
  const href = (target: number) => `?${new URLSearchParams({ ...params, cursor: String(target) }).toString()}`;
  const linkClass =
    "rounded-[var(--radius-ui)] border border-line px-3 py-2 text-sm text-muted transition-colors duration-150 hover:border-line-strong hover:text-ink";
  return (
    <nav className="mt-4 flex justify-end gap-2" aria-label="Pagination">
      {cursor > 0 ? (
        <Link href={href(Math.max(0, cursor - limit))} className={linkClass}>
          Previous
        </Link>
      ) : null}
      {nextCursor !== null ? (
        <Link href={href(nextCursor)} className={linkClass}>
          Next
        </Link>
      ) : null}
    </nav>
  );
}
