import type { Metadata } from "next";
import Link from "next/link";
import { KILL_CRITERIA, creatorsQuerySchema, type CreatorRow } from "@linchpin/shared";
import { PageTitle } from "@/components/page-title";
import { Pager } from "@/components/pager";
import { EmptyState } from "@/components/panel";
import { QueryForm } from "@/components/query-form";
import { fetchCreators } from "@/lib/api";
import { formatCount, formatPercent, formatSigned, label } from "@/lib/format";
import { flattenSearchParams, type RawSearchParams } from "@/lib/search-params";

export const metadata: Metadata = { title: "Creators" };

const REQUIRED_PROJECTS = KILL_CRITERIA.minCreatorProjects;

/** Completed projects against the count a residual needs. */
function Completed({ count }: { count: number }) {
  return (
    <span className="flex items-center justify-end gap-3">
      <span className="flex gap-px" aria-hidden="true">
        {Array.from({ length: REQUIRED_PROJECTS }, (_, index) => (
          <span key={index} className={index < count ? "h-2 w-3 bg-ink" : "h-2 w-3 bg-raised"} />
        ))}
      </span>
      <span className="num w-6 text-right text-ink">{count}</span>
    </span>
  );
}

function Residual({ score }: { score: CreatorRow["score"] }) {
  if (!score) {
    return (
      <span className="text-sm text-faint">Needs {REQUIRED_PROJECTS} Projects</span>
    );
  }
  return (
    <span className="flex flex-col items-end gap-1">
      <span className="num text-ink">{formatSigned(score.residual, 2)}</span>
      <span className="num text-xs text-blocked">Low Confidence {formatPercent(score.confidence, 0)}</span>
    </span>
  );
}

export default async function CreatorsPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const params = flattenSearchParams(await searchParams);
  const parsed = creatorsQuerySchema.safeParse(params);
  const query = parsed.success ? parsed.data : creatorsQuerySchema.parse({});
  const page = await fetchCreators(query);
  // With no residual in the universe the column would be one repeated word, so it is left out.
  const showResidual = page.scoredTotal > 0;

  return (
    <>
      <PageTitle
        title="Creators"
        aside={
          <div className="flex w-full flex-wrap items-center gap-x-8 gap-y-4 sm:w-auto">
            <dl className="flex items-baseline gap-8">
              <Count label="People" value={page.total} />
              <Count
                label="Scored"
                value={page.scoredTotal}
                hint={`At least ${REQUIRED_PROJECTS} finished projects.`}
              />
            </dl>
            <QueryForm placeholder="Person" value={query.q} preserved={{}} />
          </div>
        }
      />
      {page.rows.length === 0 ? (
        <EmptyState title="No Matches" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse">
            <thead className="border-b border-ink text-left text-sm text-muted">
              <tr>
                <th scope="col" className="px-3 py-3 font-medium">
                  Person
                </th>
                <th scope="col" className="px-3 py-3 font-medium">
                  Franchises
                </th>
                <th
                  scope="col"
                  className="px-3 py-3 text-right font-medium"
                  title="Projects that have ended."
                >
                  Finished
                </th>
                {showResidual ? (
                  <th
                    scope="col"
                    className="px-3 py-3 text-right font-medium"
                    title="Average attention share minus what billing position predicts."
                  >
                    Vs. Billing
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {page.rows.map((row) => (
                <tr key={row.personId} className="border-b border-line last:border-b-0 hover:bg-hover">
                  <td className="px-3 py-3">
                    <span className="flex flex-col gap-1">
                      <span className="font-display text-lg leading-tight text-ink">{row.name}</span>
                      <span className="text-xs text-faint">{row.roles.map((role) => label(role)).join(" · ")}</span>
                    </span>
                  </td>
                  <td className="px-3 py-3 text-muted">
                    {row.franchises.map((franchise, index) => (
                      <span key={franchise.id}>
                        {index > 0 ? ", " : ""}
                        <Link href={`/franchises/${franchise.id}`} className="hover:text-ink">
                          {franchise.canonicalName}
                        </Link>
                      </span>
                    ))}
                    {row.franchiseCount > row.franchises.length ? (
                      <span className="num text-faint"> +{row.franchiseCount - row.franchises.length}</span>
                    ) : null}
                  </td>
                  <td className="px-3 py-3">
                    <Completed count={row.completedCount} />
                  </td>
                  {showResidual ? (
                    <td className="px-3 py-3 text-right">
                      <Residual score={row.score} />
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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

function Count({ label: name, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <dd className="num text-lg leading-none text-ink">{formatCount(value)}</dd>
      <dt className="text-sm text-muted" title={hint}>
        {name}
      </dt>
    </div>
  );
}
