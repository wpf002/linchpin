import type { Metadata } from "next";
import Link from "next/link";
import type { FranchiseDetail } from "@linchpin/shared";
import { CastStage } from "@/components/cast-stage";
import { Face, Poster } from "@/components/face";
import { Numbers } from "@/components/numbers";
import { EmptyState, Panel } from "@/components/panel";
import { ReleaseTimeline } from "@/components/release-timeline";
import { Stat } from "@/components/stat";
import { fetchFranchise } from "@/lib/api";
import { orNotFound } from "@/lib/load";
import { formatDate, formatNumber, formatPercent, formatSigned, formatYear, label } from "@/lib/format";
import { BAND_TOKEN, COVERAGE_HINT, bandOf } from "@/lib/fragility";
import {
  BAND_HINT,
  CONFIDENCE_LABEL,
  NOT_ENOUGH_CAST,
  NOT_ENOUGH_CAST_HINT,
  castTracked,
  changeInWords,
  confidenceLevel,
} from "@/lib/words";

type Props = { params: Promise<{ id: string }> };
type ExitEvent = FranchiseDetail["exitEvents"][number];

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
      <Hero franchise={franchise} />
      <div className="flex flex-col gap-16">
        <Panel title="Cast" action={<span className="num text-sm text-muted">{franchise.characters.length}</span>}>
          {franchise.characters.length === 0 ? (
            <EmptyState title="No Characters With Data" />
          ) : (
            <CastStage characters={franchise.characters} scored={scored} />
          )}
        </Panel>
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
        {franchise.exitEvents.length > 0 ? (
          <Panel title="Cast Exits" action={<span className="num text-sm text-muted">{franchise.exitEvents.length}</span>}>
            <ul>
              {franchise.exitEvents.map((event) => (
                <ExitRow key={event.id} event={event} />
              ))}
            </ul>
          </Panel>
        ) : null}
        <Numbers>
          <FranchiseNumbers franchise={franchise} />
        </Numbers>
      </div>
    </>
  );
}

function Hero({ franchise }: { franchise: FranchiseDetail }) {
  const band = franchise.fragility === null ? null : bandOf(franchise.fragility);
  const measuredNames = franchise.characters
    .filter((character) => character.confidence > 0)
    .map((character) => character.canonicalName);
  return (
    <header className="grid items-end gap-x-12 gap-y-8 pt-12 pb-16 sm:grid-cols-[220px_minmax(0,1fr)] sm:pt-16">
      <Poster name={franchise.canonicalName} imageUrl={franchise.imageUrl} className="w-40 sm:w-full" />
      <div className="flex min-w-0 flex-col gap-4">
        <p className="flex flex-wrap items-center gap-2 text-sm text-muted">
          <Link href="/" className="hover:text-ink">
            Franchises
          </Link>
          <span className="text-faint">/</span>
          <span>
            {label(franchise.medium)} · {label(franchise.status)} · {formatYear(franchise.firstRelease)}
          </span>
        </p>
        <h1 className="font-display text-display leading-none text-ink [overflow-wrap:anywhere]">
          {franchise.canonicalName}
        </h1>
        {band ? (
          <>
            <p className="font-medium" style={{ color: BAND_TOKEN[band.id] }} title={BAND_HINT[band.id]}>
              {band.label}
            </p>
            {measuredNames[0] ? (
              <p className="flex flex-wrap gap-x-4 font-display text-lg leading-tight text-ink">
                <span>
                  <span className="text-muted">Lead</span> {measuredNames[0]}
                </span>
                {measuredNames[1] ? (
                  <span>
                    <span className="text-muted">No. 2</span> {measuredNames[1]}
                  </span>
                ) : null}
              </p>
            ) : null}
          </>
        ) : (
          <p className="text-muted" title={NOT_ENOUGH_CAST_HINT}>
            {NOT_ENOUGH_CAST} · {castTracked(franchise.rosterComplete, franchise.rosterSize)}
          </p>
        )}
      </div>
    </header>
  );
}

function ExitRow({ event }: { event: ExitEvent }) {
  const name = event.characterName ?? event.personName ?? "";
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line py-3 last:border-b-0">
      <Face name={name} imageUrl={event.imageUrl} className="w-10" />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="flex flex-wrap items-baseline gap-x-2">
          {event.characterId ? (
            <Link href={`/characters/${event.characterId}`} className="font-medium text-ink hover:text-accent-strong">
              {name}
            </Link>
          ) : (
            <span className="font-medium text-ink">{name}</span>
          )}
        </span>
        <span className="text-sm text-muted">
          {label(event.exitType)} · {formatDate(event.eventDate)}
        </span>
      </div>
      {event.didEstimate === null ? null : (
        <span
          className="text-sm text-ink"
          title={
            event.preCarryScore === null
              ? undefined
              : `Share Before ${formatPercent(event.preCarryScore, 0)}`
          }
        >
          <span className="text-muted">Change</span> {changeInWords(event.didEstimate)}
        </span>
      )}
      <a
        href={event.sourceUrl}
        target="_blank"
        rel="noreferrer noopener"
        className="text-sm text-accent hover:text-accent-strong"
      >
        Source
      </a>
    </li>
  );
}

/** Exact figures. Below the coverage floor only the coverage itself is shown; shares are withheld. */
function FranchiseNumbers({ franchise }: { franchise: FranchiseDetail }) {
  const coverage = (
    <Stat
      label="Cast Tracked"
      value={formatPercent(franchise.rosterComplete, 0)}
      detail={`${franchise.rosterSize} Characters`}
      hint={COVERAGE_HINT}
    />
  );
  if (franchise.fragility === null) return <dl>{coverage}</dl>;
  const measured = franchise.characters.filter((character) => character.confidence > 0);
  return (
    <>
      <dl className="grid grid-cols-2 gap-8 sm:grid-cols-3 lg:grid-cols-5">
        <Stat
          label="Lead Weight"
          value={formatSigned(franchise.fragility, 2)}
          hint="Lead z-score vs. the cast."
        />
        <Stat label="Lead Share" value={formatPercent(franchise.top1Share, 0)} />
        <Stat label="Top 3" value={formatPercent(franchise.top3Share, 0)} />
        <Stat
          label="Concentration"
          value={formatNumber(franchise.hhi, 3)}
          hint="Sum of squared shares. 1.0 = one character."
        />
        {coverage}
      </dl>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[480px]">
          <thead className="border-b border-ink text-left text-sm text-muted">
            <tr>
              <th className="px-3 py-3 font-medium">Character</th>
              <th className="px-3 py-3 font-medium">Played By</th>
              <th className="px-3 py-3 text-right font-medium">Share</th>
              <th className="px-3 py-3 text-right font-medium">Confidence</th>
            </tr>
          </thead>
          <tbody>
            {measured.map((character) => (
              <tr key={character.id} className="border-b border-line last:border-b-0">
                <td className="px-3 py-3">
                  <Link href={`/characters/${character.id}`} className="text-ink hover:text-accent-strong">
                    {character.canonicalName}
                  </Link>
                </td>
                <td className="px-3 py-3 text-muted">{character.portrayedBy ?? ""}</td>
                <td className="num px-3 py-3 text-right text-ink">{formatPercent(character.carryScore)}</td>
                <td className="px-3 py-3 text-right text-sm text-muted">
                  {CONFIDENCE_LABEL[confidenceLevel(character.confidence)].replace(" Confidence", "")}{" "}
                  <span className="num">{formatPercent(character.confidence, 0)}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {franchise.scoredOn ? (
        <p className="text-xs text-faint">
          Scored {formatDate(franchise.scoredOn)} · <span className="font-mono">{franchise.modelVersion}</span>
        </p>
      ) : null}
    </>
  );
}
