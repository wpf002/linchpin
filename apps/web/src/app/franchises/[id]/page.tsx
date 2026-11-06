import type { Metadata } from "next";
import Link from "next/link";
import { CoverageBadge } from "@/components/coverage-badge";
import { FragilityMeter } from "@/components/fragility-meter";
import { FranchiseWorkbench } from "@/components/franchise-workbench";
import { PageTitle } from "@/components/page-title";
import { EmptyState, Panel } from "@/components/panel";
import { ReleaseTimeline } from "@/components/release-timeline";
import { Stat } from "@/components/stat";
import { fetchFranchise } from "@/lib/api";
import { orNotFound } from "@/lib/load";
import { formatDate, formatLogChange, formatNumber, formatPercent, formatYear, label } from "@/lib/format";

type Props = { params: Promise<{ id: string }> };

function load(id: string) {
  return orNotFound(fetchFranchise(id));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const franchise = await load((await params).id);
  return { title: franchise.canonicalName };
}

export default async function FranchisePage({ params }: Props) {
  const franchise = await load((await params).id);
  const scored = franchise.fragility !== null;

  return (
    <>
      <PageTitle
        eyebrow={
          <span className="flex flex-wrap items-center gap-2">
            <Link href="/" className="hover:text-ink">
              Screener
            </Link>
            <span className="text-faint">/</span>
            <span>
              {label(franchise.medium)} · {label(franchise.status)} · {formatYear(franchise.firstRelease)}
            </span>
          </span>
        }
        title={franchise.canonicalName}
        aside={
          <span title="0.6 z(HHI) + 0.25 z(top-1 share) − 0.15 z(substitutability). Substitutability weight drops when unmeasured.">
            <FragilityMeter value={franchise.fragility} />
          </span>
        }
      />
      <dl className="mb-12 grid grid-cols-2 gap-6 border-y border-line py-6 sm:grid-cols-3 lg:grid-cols-5">
        <Stat
          label="Coverage"
          value={<CoverageBadge value={franchise.rosterComplete} />}
          detail={`${franchise.rosterSize} Characters`}
          hint="Share of the main cast linked to a verified article. Figures are withheld below 70%."
        />
        <Stat label="HHI" value={formatNumber(franchise.hhi, 3)} hint="Sum of squared carry shares." />
        <Stat label="Top 1" value={formatPercent(franchise.top1Share)} />
        <Stat label="Top 3" value={formatPercent(franchise.top3Share)} />
        <Stat label="Scored" value={formatDate(franchise.scoredOn)} detail={franchise.modelVersion} />
      </dl>

      {franchise.characters.length === 0 ? (
        <Panel title="Carry Distribution">
          <EmptyState title="No Scored Characters" detail="Run the scoring job after ingest." />
        </Panel>
      ) : (
        <FranchiseWorkbench franchiseId={franchise.id} characters={franchise.characters} scored={scored} />
      )}

      <div className="mt-12 flex flex-col gap-6">
        <Panel
          title="Releases and Exits"
          action={<span className="text-xs text-faint">{franchise.releases.length} Releases</span>}
        >
          {franchise.releases.length + franchise.exitEvents.length === 0 ? (
            <EmptyState title="No Release Calendar" />
          ) : (
            <ReleaseTimeline releases={franchise.releases} exitEvents={franchise.exitEvents} />
          )}
        </Panel>
        <Panel title="Exit Events" action={<span className="text-xs text-faint">{franchise.exitEvents.length}</span>}>
          {franchise.exitEvents.length === 0 ? (
            <EmptyState title="No Exit Events" />
          ) : (
            <div className="-m-4 overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-4 py-3 font-medium">Date</th>
                    <th className="px-4 py-3 font-medium">Character</th>
                    <th className="px-4 py-3 font-medium">Type</th>
                    <th className="px-4 py-3 text-right font-medium">Pre-Exit Carry</th>
                    <th className="px-4 py-3 text-right font-medium">Attention Change</th>
                    <th className="px-4 py-3 font-medium">Source</th>
                  </tr>
                </thead>
                <tbody>
                  {franchise.exitEvents.map((event) => (
                    <tr key={event.id} className="border-b border-line last:border-b-0">
                      <td className="num px-4 py-3 text-muted">{formatDate(event.eventDate)}</td>
                      <td className="px-4 py-3 text-ink">
                        {event.characterName ?? event.personName ?? "—"}
                        {event.verified ? null : <span className="ml-2 text-xs text-faint">Unverified</span>}
                      </td>
                      <td className="px-4 py-3 text-muted">{label(event.exitType)}</td>
                      <td className="num px-4 py-3 text-right text-muted">{formatPercent(event.preCarryScore)}</td>
                      <td className="num px-4 py-3 text-right text-ink">{formatLogChange(event.didEstimate)}</td>
                      <td className="px-4 py-3">
                        <a
                          href={event.sourceUrl}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="text-accent hover:text-accent-strong"
                        >
                          Source
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>
    </>
  );
}
