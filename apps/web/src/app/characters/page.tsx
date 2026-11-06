import type { Metadata } from "next";
import Link from "next/link";
import { leadersQuerySchema, type LeaderRow, type LeadersQuery } from "@linchpin/shared";
import { Poster } from "@/components/face";
import { LinkTabs } from "@/components/link-tabs";
import { PageTitle } from "@/components/page-title";
import { Pager } from "@/components/pager";
import { EmptyState } from "@/components/panel";
import { QueryForm } from "@/components/query-form";
import { RingFace } from "@/components/ring-face";
import { fetchLeaders } from "@/lib/api";
import { formatPercent } from "@/lib/format";
import { flattenSearchParams, type RawSearchParams } from "@/lib/search-params";
import { CONFIDENCE_LABEL, confidenceLevel, stayingPower } from "@/lib/words";

export const metadata: Metadata = { title: "Characters" };

type Sort = LeadersQuery["sort"];

const SORT_TABS: { sort: Sort; label: string }[] = [
  { sort: "carryScore", label: "Biggest Share" },
  { sort: "offCycleCarry", label: "Between Releases" },
  { sort: "durabilityRatio", label: "Staying Power" },
];

/** A sort tab keeps the search term and starts again from the first page, largest first. */
function sortHref(q: string | undefined, sort: Sort): string {
  const query = new URLSearchParams(q ? { q, sort } : { sort });
  return `/characters?${query.toString()}`;
}

/** The ring follows the sort when the sort is itself a share. Durability is a ratio, so the ring stays on share. */
function ringShare(row: LeaderRow, sort: Sort): number {
  return sort === "offCycleCarry" ? (row.offCycleCarry ?? 0) : row.carryScore;
}

function ringHint(row: LeaderRow, sort: Sort): string {
  const figure = sort === "offCycleCarry" ? "Between Releases " : "";
  const confidence = CONFIDENCE_LABEL[confidenceLevel(row.confidence)];
  return `${row.canonicalName} · ${figure}${formatPercent(ringShare(row, sort), 0)} · ${confidence}`;
}

function CharacterTile({ row, rank, sort }: { row: LeaderRow; rank: number; sort: Sort }) {
  const level = confidenceLevel(row.confidence);
  return (
    <li className="flex min-w-0 flex-col items-center gap-3 text-center">
      <div className="relative w-28 sm:w-32">
        <Link href={`/characters/${row.id}`} className="block rounded-full transition-transform duration-200 ease-out hover:scale-105">
          <RingFace
            name={row.canonicalName}
            imageUrl={row.imageUrl}
            share={ringShare(row, sort)}
            title={ringHint(row, sort)}
            className="w-full"
          />
        </Link>
        <Link
          href={`/franchises/${row.franchise.id}`}
          title={row.franchise.canonicalName}
          className="absolute -right-2 bottom-0 w-9 rounded-[var(--radius-ui)] ring-2 ring-bg transition-transform duration-200 ease-out hover:-translate-y-1"
        >
          <Poster name={row.franchise.canonicalName} imageUrl={row.franchise.imageUrl} />
        </Link>
      </div>
      <div className="flex w-full min-w-0 flex-col">
        <Link href={`/characters/${row.id}`} className="font-display text-lg leading-tight text-ink [overflow-wrap:anywhere] hover:text-accent-strong">
          <span className="num mr-2 text-sm text-faint">{rank}</span>
          {row.canonicalName}
        </Link>
        <span className="truncate text-sm text-muted">{row.portrayedBy ?? row.franchise.canonicalName}</span>
        {sort === "durabilityRatio" && row.durabilityRatio !== null ? (
          <span className="text-xs text-faint">{stayingPower(row.durabilityRatio)}</span>
        ) : null}
        {level === "high" ? null : <span className="text-xs text-blocked">{CONFIDENCE_LABEL[level]}</span>}
      </div>
    </li>
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
      <div className="mb-12">
        <LinkTabs
          label="Sort"
          tabs={SORT_TABS.map((tab) => ({
            label: tab.label,
            href: sortHref(query.q, tab.sort),
            active: query.sort === tab.sort,
          }))}
        />
      </div>
      {page.rows.length === 0 ? (
        <EmptyState title="No Matches" />
      ) : (
        <ol className="grid grid-cols-2 gap-x-4 gap-y-12 sm:grid-cols-[repeat(auto-fill,minmax(168px,1fr))] sm:gap-x-6">
          {page.rows.map((row, index) => (
            <CharacterTile key={row.id} row={row} rank={query.cursor + index + 1} sort={query.sort} />
          ))}
        </ol>
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
