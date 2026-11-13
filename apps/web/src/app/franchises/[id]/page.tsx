import type { Metadata } from "next";
import Link from "next/link";
import type { FranchiseDetail } from "@linchpin/shared";
import { CastStage } from "@/components/cast-stage";
import { Face, Poster } from "@/components/face";
import { EmptyState, Panel } from "@/components/panel";
import { ReleaseTimeline } from "@/components/release-timeline";
import { fetchFranchise } from "@/lib/api";
import { orNotFound } from "@/lib/load";
import { formatDate, formatYear, label } from "@/lib/format";
import { BAND_TOKEN, bandOf } from "@/lib/fragility";
import { BAND_HINT, NOT_ENOUGH_CAST, NOT_ENOUGH_CAST_HINT, changeInWords } from "@/lib/words";

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
        <Panel title="Cast">
          {franchise.characters.length === 0 ? (
            <EmptyState title="No Characters With Data" />
          ) : (
            <CastStage characters={franchise.characters} scored={scored} />
          )}
        </Panel>
        <Panel title="Releases and Exits">
          {franchise.releases.length + franchise.exitEvents.length === 0 ? (
            <EmptyState title="No Releases" />
          ) : (
            <ReleaseTimeline releases={franchise.releases} exitEvents={franchise.exitEvents} />
          )}
        </Panel>
        {franchise.exitEvents.length > 0 ? (
          <Panel title="Cast Exits">
            <ul>
              {franchise.exitEvents.map((event) => (
                <ExitRow key={event.id} event={event} />
              ))}
            </ul>
          </Panel>
        ) : null}
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
                    <span className="text-muted">Next</span> {measuredNames[1]}
                  </span>
                ) : null}
              </p>
            ) : null}
          </>
        ) : (
          <p className="text-muted" title={NOT_ENOUGH_CAST_HINT}>
            {NOT_ENOUGH_CAST}
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
        <span className="text-sm text-ink">{changeInWords(event.didEstimate)}</span>
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
