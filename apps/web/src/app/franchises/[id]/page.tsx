import type { Metadata } from "next";
import Link from "next/link";
import { FranchiseWorkbench } from "@/components/franchise-workbench";
import { PageTitle } from "@/components/page-title";
import { EmptyState, Panel } from "@/components/panel";
import { ReleaseTimeline } from "@/components/release-timeline";
import { Stat } from "@/components/stat";
import { fetchFranchise } from "@/lib/api";
import { orNotFound } from "@/lib/load";
import { formatDate, formatLogChange, formatNumber, formatPercent, formatSigned, formatYear, label } from "@/lib/format";
import { ROSTER_COMPLETE_DISPLAY_FLOOR } from "@linchpin/shared";
import { BAND_TOKEN, COVERAGE_HINT, NO_SCORE_HINT, bandOf } from "@/lib/fragility";

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
  const lead = franchise.characters[0];
  // The two study columns are left out when no exit on this franchise has been studied.
  const hasStudiedExit = franchise.exitEvents.some(
    (event) => event.preCarryScore !== null || event.didEstimate !== null,
  );

  return (
    <>
      <PageTitle
        eyebrow={
          <span className="flex flex-wrap items-center gap-2">
            <Link href="/" className="hover:text-ink">
              Franchises
            </Link>
            <span className="text-faint">/</span>
            <span>
              {label(franchise.medium)} · {label(franchise.status)} · {formatYear(franchise.firstRelease)}
            </span>
          </span>
        }
        title={franchise.canonicalName}
        aside={
          franchise.scoredOn ? (
            <span className="text-xs text-faint">
              Scored {formatDate(franchise.scoredOn)} · <span className="font-mono">{franchise.modelVersion}</span>
            </span>
          ) : null
        }
      />
      <dl className="mb-16 grid grid-cols-2 items-start gap-x-8 gap-y-8 border-y border-line py-8 lg:grid-cols-[2fr_1fr_1fr_1fr_1fr] lg:items-end">
        <FragilityFigure value={franchise.fragility} />
        <Stat
          label="Lead Share"
          value={formatPercent(franchise.top1Share, 0)}
          detail={scored ? lead?.canonicalName : undefined}
          hint="Share of the franchise's attention on its top character."
        />
        <Stat label="Top 3" value={formatPercent(franchise.top3Share, 0)} />
        <Stat
          label="HHI"
          value={formatNumber(franchise.hhi, 3)}
          hint="Sum of squared attention shares. 1.0 means one character has it all."
        />
        <Stat
          label="Coverage"
          value={
            <span className={franchise.rosterComplete >= ROSTER_COMPLETE_DISPLAY_FLOOR ? undefined : "text-fail"}>
              {formatPercent(franchise.rosterComplete, 0)}
            </span>
          }
          detail={`${franchise.rosterSize} Characters`}
          hint={COVERAGE_HINT}
        />
      </dl>

      {franchise.characters.length === 0 ? (
        <Panel title="Cast">
          <EmptyState title="No Characters With Data" />
        </Panel>
      ) : (
        <FranchiseWorkbench franchiseId={franchise.id} characters={franchise.characters} scored={scored} />
      )}

      <div className="mt-16 flex flex-col gap-16">
        <Panel
          title="Releases and Exits"
          action={<span className="num text-sm text-muted">{franchise.releases.length}</span>}
        >
          {franchise.releases.length + franchise.exitEvents.length === 0 ? (
            <EmptyState title="No Releases" />
          ) : (
            <ReleaseTimeline releases={franchise.releases} exitEvents={franchise.exitEvents} />
          )}
        </Panel>
        <Panel title="Cast Exits" action={<span className="num text-sm text-muted">{franchise.exitEvents.length}</span>}>
          {franchise.exitEvents.length === 0 ? (
            <EmptyState title="No Cast Exits" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px]">
                <thead className="border-b border-ink text-left text-sm text-muted">
                  <tr>
                    <th className="px-3 py-3 font-medium">Date</th>
                    <th className="px-3 py-3 font-medium">Character</th>
                    <th className="px-3 py-3 font-medium">Type</th>
                    {hasStudiedExit ? (
                      <>
                        <th className="px-3 py-3 text-right font-medium">Share Before</th>
                        <th className="px-3 py-3 text-right font-medium">Change After</th>
                      </>
                    ) : null}
                    <th className="px-3 py-3 font-medium">Source</th>
                  </tr>
                </thead>
                <tbody>
                  {franchise.exitEvents.map((event) => (
                    <tr key={event.id} className="border-b border-line last:border-b-0">
                      <td className="num px-3 py-3 text-muted">{formatDate(event.eventDate)}</td>
                      <td className="px-3 py-3 text-ink">
                        {event.characterName ?? event.personName ?? ""}
                        {event.verified ? null : <span className="ml-2 text-xs text-faint">Unverified</span>}
                      </td>
                      <td className="px-3 py-3 text-muted">{label(event.exitType)}</td>
                      {hasStudiedExit ? (
                        <>
                          <td className="num px-3 py-3 text-right text-muted">
                            {event.preCarryScore === null ? "" : formatPercent(event.preCarryScore)}
                          </td>
                          <td className="num px-3 py-3 text-right text-ink">
                            {event.didEstimate === null ? "" : formatLogChange(event.didEstimate)}
                          </td>
                        </>
                      ) : null}
                      <td className="px-3 py-3">
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

/** The page's one large figure. Below the coverage floor it reads No Score, never a dimmed number. */
function FragilityFigure({ value }: { value: number | null }) {
  const band = value === null ? null : bandOf(value);
  return (
    <div className="col-span-2 flex flex-col-reverse gap-2 lg:col-span-1">
      <dt
        className="text-sm text-muted"
        title={
          value === null
            ? NO_SCORE_HINT
            : "Higher means more of the attention sits with one character. Built from HHI, the lead's share and how much the cast absorbs an exit."
        }
      >
        Fragility
        {band ? (
          <span className="ml-2 font-medium" style={{ color: BAND_TOKEN[band.id] }}>
            {band.label}
          </span>
        ) : null}
      </dt>
      <dd className={`font-display text-display leading-none ${value === null ? "text-faint" : "text-ink"}`}>
        {value === null ? "No Score" : formatSigned(value, 2)}
      </dd>
    </div>
  );
}
