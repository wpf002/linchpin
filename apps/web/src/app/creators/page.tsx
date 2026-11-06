import type { Metadata } from "next";
import Link from "next/link";
import { KILL_CRITERIA, creatorsQuerySchema, type CreatorRow } from "@linchpin/shared";
import { Face, Poster } from "@/components/face";
import { PageTitle } from "@/components/page-title";
import { Pager } from "@/components/pager";
import { EmptyState } from "@/components/panel";
import { QueryForm } from "@/components/query-form";
import { fetchCreators } from "@/lib/api";
import { formatPercent, formatSigned, label } from "@/lib/format";
import { flattenSearchParams, type RawSearchParams } from "@/lib/search-params";
import { versusBilling } from "@/lib/words";

export const metadata: Metadata = { title: "Creators" };

const REQUIRED_PROJECTS = KILL_CRITERIA.minCreatorProjects;
const FINISHED_HINT = `A person is compared with their billing after ${REQUIRED_PROJECTS} finished projects.`;

/** How the person's draw compares with their billing. Always labeled low confidence: the sample is a few projects. */
function Residual({ score }: { score: CreatorRow["score"] }) {
  if (!score) return <span className="text-sm text-faint">Needs {REQUIRED_PROJECTS} Projects</span>;
  return (
    <span
      className="flex flex-col sm:items-end"
      title={`${formatSigned(score.residual, 2)} against billing · ${score.projectCount} Projects · Confidence ${formatPercent(score.confidence, 0)}`}
    >
      <span className="font-medium text-ink">{versusBilling(score.residual)}</span>
      <span className="text-xs text-blocked">Low Confidence</span>
    </span>
  );
}

function CreatorRowItem({ row, showResidual }: { row: CreatorRow; showResidual: boolean }) {
  const hidden = row.franchiseCount - row.franchises.length;
  return (
    <li className="flex flex-wrap items-center gap-x-6 gap-y-4 border-b border-line py-4 last:border-b-0">
      <Face name={row.name} imageUrl={row.imageUrl} className="w-16" />
      <div className="flex min-w-0 flex-1 basis-48 flex-col gap-1">
        <span className="font-display text-lg leading-tight text-ink [overflow-wrap:anywhere]">{row.name}</span>
        <span className="text-sm text-muted" title={FINISHED_HINT}>
          {row.roles.map((role) => label(role)).join(" · ")} · {row.completedCount} Finished
        </span>
      </div>
      <ul className="flex items-center gap-2">
        {row.franchises.map((franchise) => (
          <li key={franchise.id}>
            <Link
              href={`/franchises/${franchise.id}`}
              title={franchise.canonicalName}
              className="block w-10 transition-transform duration-200 ease-out hover:-translate-y-1"
            >
              <Poster name={franchise.canonicalName} imageUrl={franchise.imageUrl} />
            </Link>
          </li>
        ))}
        {hidden > 0 ? <li className="num text-sm text-faint">+{hidden}</li> : null}
      </ul>
      {showResidual ? (
        <div className="w-full sm:w-40 sm:text-right">
          <Residual score={row.score} />
        </div>
      ) : null}
    </li>
  );
}

export default async function CreatorsPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const params = flattenSearchParams(await searchParams);
  const parsed = creatorsQuerySchema.safeParse(params);
  const query = parsed.success ? parsed.data : creatorsQuerySchema.parse({});
  const page = await fetchCreators(query);
  // With no one scored yet the comparison would be one repeated label on every row, so it is left out.
  const showResidual = page.scoredTotal > 0;

  return (
    <>
      <PageTitle title="Creators" aside={<QueryForm placeholder="Person" value={query.q} preserved={{}} />} />
      {page.rows.length === 0 ? (
        <EmptyState title="No Matches" />
      ) : (
        <ul className="border-t-2 border-ink">
          {page.rows.map((row) => (
            <CreatorRowItem key={row.personId} row={row} showResidual={showResidual} />
          ))}
        </ul>
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
