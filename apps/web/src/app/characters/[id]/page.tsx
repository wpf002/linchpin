import type { Metadata } from "next";
import Link from "next/link";
import { ROSTER_COMPLETE_DISPLAY_FLOOR, type CharacterDetail } from "@linchpin/shared";
import { AttentionChart } from "@/components/attention-chart";
import { Poster } from "@/components/face";
import { EmptyState, Panel } from "@/components/panel";
import { RingFace } from "@/components/ring-face";
import { fetchCharacter } from "@/lib/api";
import { label } from "@/lib/format";
import { orNotFound } from "@/lib/load";
import {
  CONFIDENCE_LABEL,
  NOT_ENOUGH_CAST,
  NOT_ENOUGH_CAST_HINT,
  confidenceLevel,
  rankLabel,
  stayingPower,
} from "@/lib/words";

type Props = { params: Promise<{ id: string }> };

function load(id: string) {
  return orNotFound(fetchCharacter(id));
}

/** A share is shown only when the show's cast coverage clears the floor and the character has signal. */
function hasShare(character: CharacterDetail): boolean {
  return character.franchise.rosterComplete >= ROSTER_COMPLETE_DISPLAY_FLOOR && character.confidence > 0;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const character = await load((await params).id);
  return { title: character.canonicalName };
}

export default async function CharacterPage({ params }: Props) {
  const character = await load((await params).id);

  return (
    <>
      <Hero character={character} />
      <div className="flex flex-col gap-16">
        <Panel
          title="Page Views"
          hint="Daily, from Wikipedia."
          action={
            <span className="flex items-center gap-2 text-sm text-muted">
              <span
                className="inline-block size-2.5"
                style={{ background: "var(--chart-off-cycle)", outline: "1px solid var(--border)" }}
              />
              Off-Season
            </span>
          }
        >
          {character.series.length === 0 ? <EmptyState title="No Data" /> : <AttentionChart series={character.series} />}
        </Panel>
        <Link
          href={`/characters/${character.id}/signals`}
          className="self-start text-sm text-accent hover:text-accent-strong"
        >
          Raw Data
        </Link>
      </div>
    </>
  );
}

function Hero({ character }: { character: CharacterDetail }) {
  const { franchise } = character;
  const showShare = hasShare(character);
  return (
    <header className="grid items-end gap-x-12 gap-y-8 pt-12 pb-16 sm:grid-cols-[220px_minmax(0,1fr)] sm:pt-16">
      <RingFace
        name={character.canonicalName}
        imageUrl={character.imageUrl}
        share={showShare ? character.carryScore : null}
        className="w-40 sm:w-full"
      />
      <div className="flex min-w-0 flex-col gap-4">
        <p className="flex flex-wrap items-center gap-2 text-sm text-muted">
          <Link href="/characters" className="hover:text-ink">
            Characters
          </Link>
          <span className="text-faint">/</span>
          <span>
            {character.portrayedBy ? `Played by ${character.portrayedBy}` : "Uncredited"} · {label(character.status)}
          </span>
        </p>
        <h1 className="font-display text-display leading-none text-ink [overflow-wrap:anywhere]">
          {character.canonicalName}
        </h1>
        <Standing character={character} showShare={showShare} />
        <Link
          href={`/franchises/${franchise.id}`}
          className="group mt-2 flex items-center gap-3 self-start text-muted transition-colors duration-150 hover:text-ink"
        >
          <Poster name={franchise.canonicalName} imageUrl={franchise.imageUrl} className="w-12" />
          <span className="font-display text-lg leading-tight">{franchise.canonicalName}</span>
        </Link>
      </div>
    </header>
  );
}

/** Where the character stands in the cast, in words. Withheld below the cast coverage floor. */
function Standing({ character, showShare }: { character: CharacterDetail; showShare: boolean }) {
  if (character.franchise.rosterComplete < ROSTER_COMPLETE_DISPLAY_FLOOR) {
    return (
      <p className="text-muted" title={NOT_ENOUGH_CAST_HINT}>
        {NOT_ENOUGH_CAST}
      </p>
    );
  }
  if (!showShare) {
    return (
      <p className="text-muted" title="No Wikipedia page views.">
        No Views
      </p>
    );
  }
  return (
    <>
      <p className="font-display text-lg leading-tight text-ink">
        {rankLabel(character.rankInFranchise)} ·{" "}
        <Link href={`/franchises/${character.franchise.id}`} className="hover:text-accent-strong">
          {character.franchise.canonicalName}
        </Link>
      </p>
      <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
        <span>{CONFIDENCE_LABEL[confidenceLevel(character.confidence)]}</span>
        {character.durabilityRatio === null ? null : <span>{stayingPower(character.durabilityRatio)}</span>}
      </p>
    </>
  );
}
