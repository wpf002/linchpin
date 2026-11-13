import { Suspense } from "react";
import {
  FRAGILITY_BANDS,
  fragilityBand,
  screenerQuerySchema,
  type FragilityBandId,
  type FranchiseRow,
  type ScreenerQuery,
} from "@linchpin/shared";
import { LeadWall } from "@/components/lead-wall";
import { LinkTabs } from "@/components/link-tabs";
import { PageTitle } from "@/components/page-title";
import { Pager } from "@/components/pager";
import { EmptyState, Panel } from "@/components/panel";
import { ScreenerFilters } from "@/components/screener-filters";
import { ScreenerTable } from "@/components/screener-table";
import { ShowTile } from "@/components/show-tile";
import { fetchAllFranchises, fetchScreener } from "@/lib/api";
import { flattenSearchParams, type RawSearchParams } from "@/lib/search-params";
import { BAND_HINT, NOT_ENOUGH_CAST, NOT_ENOUGH_CAST_HINT } from "@/lib/words";

const VIEW_PARAM = "view";
const TABLE_VIEW = "table";

/** Paging and view params stay out of the export link: the CSV carries every matching row. */
const NON_EXPORT_PARAMS = ["cursor", "limit", VIEW_PARAM] as const;

/** Most lead-heavy first, so the page opens on the shows one character carries. */
const BANDS_LEAD_HEAVY_FIRST = [...FRAGILITY_BANDS].reverse();

const TILE_GRID = "grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-[repeat(auto-fill,minmax(168px,1fr))] sm:gap-x-6";
const COMPACT_TILE_GRID = "grid grid-cols-3 gap-x-4 gap-y-6 sm:grid-cols-[repeat(auto-fill,minmax(120px,1fr))]";

function exportHref(params: Record<string, string>): string {
  const query = new URLSearchParams(params);
  for (const name of NON_EXPORT_PARAMS) query.delete(name);
  const suffix = query.toString();
  return suffix ? `/api/export?${suffix}` : "/api/export";
}

function viewHref(params: Record<string, string>, view: string | null): string {
  const query = new URLSearchParams(params);
  query.delete("cursor");
  if (view) query.set(VIEW_PARAM, view);
  else query.delete(VIEW_PARAM);
  const suffix = query.toString();
  return suffix ? `/?${suffix}` : "/";
}

function byLeadHeavy(a: FranchiseRow, b: FranchiseRow): number {
  return (b.fragility ?? 0) - (a.fragility ?? 0);
}

function groupByBand(rows: FranchiseRow[]): Map<FragilityBandId, FranchiseRow[]> {
  const groups = new Map<FragilityBandId, FranchiseRow[]>();
  for (const row of rows) {
    if (row.fragility === null) continue;
    const band = fragilityBand(row.fragility).id;
    groups.set(band, [...(groups.get(band) ?? []), row]);
  }
  return groups;
}

function PosterView({ rows }: { rows: FranchiseRow[] }) {
  if (rows.length === 0) return <EmptyState title="No Matches" />;
  const groups = groupByBand(rows);
  const unscored = rows.filter((row) => row.fragility === null);
  return (
    <div className="flex flex-col gap-16">
      {groups.size > 0 ? (
        <Panel title="Top Leads" hint="Face width = lead share.">
          <LeadWall rows={rows} />
        </Panel>
      ) : null}
      {BANDS_LEAD_HEAVY_FIRST.map((band) => {
        const members = groups.get(band.id);
        if (!members) return null;
        return (
          <Panel
            key={band.id}
            title={band.label}
            hint={BAND_HINT[band.id]}
          >
            <div className={TILE_GRID}>
              {[...members].sort(byLeadHeavy).map((row) => (
                <ShowTile key={row.id} row={row} />
              ))}
            </div>
          </Panel>
        );
      })}
      {unscored.length > 0 ? (
        <Panel
          title={NOT_ENOUGH_CAST}
          hint={NOT_ENOUGH_CAST_HINT}
        >
          <div className={COMPACT_TILE_GRID}>
            {unscored.map((row) => (
              <ShowTile key={row.id} row={row} compact />
            ))}
          </div>
        </Panel>
      ) : null}
    </div>
  );
}

async function TableView({ query, params }: { query: ScreenerQuery; params: Record<string, string> }) {
  const page = await fetchScreener(query);
  return (
    <>
      {page.rows.length === 0 ? (
        <EmptyState title="No Matches" />
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

export default async function ScreenerPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const params = flattenSearchParams(await searchParams);
  const isTable = params[VIEW_PARAM] === TABLE_VIEW;
  const parsed = screenerQuerySchema.safeParse(params);
  const query = parsed.success ? parsed.data : screenerQuerySchema.parse({});

  return (
    <>
      <PageTitle
        title="Franchises"
        aside={
          <LinkTabs
            label="View"
            tabs={[
              { label: "Posters", href: viewHref(params, null), active: !isTable },
              { label: "Table", href: viewHref(params, TABLE_VIEW), active: isTable },
            ]}
          />
        }
      />
      <div className="mb-12 flex flex-wrap items-center justify-between gap-4">
        <Suspense>
          <ScreenerFilters />
        </Suspense>
        {isTable ? (
          <a
            href={exportHref(params)}
            download
            className="flex h-9 items-center rounded-[var(--radius-ui)] border border-line px-3 text-sm text-muted transition-colors duration-150 hover:border-line-strong hover:text-ink active:bg-hover"
          >
            Export CSV
          </a>
        ) : null}
      </div>
      {isTable ? (
        <TableView query={query} params={params} />
      ) : (
        <PosterView
          rows={await fetchAllFranchises({
            q: query.q,
            medium: query.medium,
            status: query.status,
            minRosterComplete: query.minRosterComplete,
          })}
        />
      )}
    </>
  );
}
