import type { Metadata } from "next";
import Link from "next/link";
import { EVENT_WINDOWS, ROSTER_COMPLETE_DISPLAY_FLOOR, type CharacterDetail } from "@linchpin/shared";
import { AttentionChart } from "@/components/attention-chart";
import { Poster } from "@/components/face";
import { Numbers } from "@/components/numbers";
import { EmptyState, Panel } from "@/components/panel";
import { RingFace } from "@/components/ring-face";
import { SignalAudit } from "@/components/signal-audit";
import { Stat } from "@/components/stat";
import { fetchCharacter } from "@/lib/api";
import { formatDate, formatNumber, formatPercent, label } from "@/lib/format";
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
  const offCycleDays = character.series.filter((point) => point.isOffCycle).length;

  return (
    <>
      <Hero character={character} />
      <div className="flex flex-col gap-16">
        <Panel
          title="Attention"
          hint="Daily Wikipedia page views."
          action={
            <span className="flex items-center gap-2 text-sm text-muted">
              <span
                className="inline-block size-2.5"
                style={{ background: "var(--chart-off-cycle)", outline: "1px solid var(--border)" }}
              />
              Between Releases · {offCycleDays} Days
            </span>
          }
        >
          {character.series.length === 0 ? <EmptyState title="No Data" /> : <AttentionChart series={character.series} />}
        </Panel>
        <Numbers>
          <CharacterNumbers character={character} />
        </Numbers>
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
        title={showShare ? `${character.canonicalName} · ${formatPercent(character.carryScore, 0)}` : undefined}
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
        No Attention Data
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
        <span title={`Confidence ${formatPercent(character.confidence, 0)}`}>
          {CONFIDENCE_LABEL[confidenceLevel(character.confidence)]}
        </span>
        {character.durabilityRatio === null ? null : (
          <span title={`Share ${EVENT_WINDOWS.offCycleGapDays}+ days from a release vs. near one.`}>
            {stayingPower(character.durabilityRatio)}
          </span>
        )}
      </p>
    </>
  );
}

/** Exact figures and their sources. Shares stay out below the coverage floor; dates and raw rows don't. */
function CharacterNumbers({ character }: { character: CharacterDetail }) {
  const showShare = hasShare(character);
  return (
    <>
      <dl className="grid grid-cols-2 gap-8 sm:grid-cols-3 lg:grid-cols-5">
        {showShare ? <ShareStats character={character} /> : null}
        {character.billingOrder === null ? null : <Stat label="Billed" value={character.billingOrder} />}
        {character.lastSeenAt === null ? null : (
          <Stat
            label="Last Seen"
            value={formatDate(character.lastSeenAt)}
            detail={character.firstSeenAt === null ? undefined : `First Seen ${formatDate(character.firstSeenAt)}`}
          />
        )}
      </dl>
      {showShare ? <SignalAudit characterId={character.id} attribution={character.attribution} /> : null}
      <Link href={`/characters/${character.id}/signals`} className="self-start text-sm text-accent hover:text-accent-strong">
        Raw Data
      </Link>
    </>
  );
}

function ShareStats({ character }: { character: CharacterDetail }) {
  return (
    <>
      <Stat
        label="Attention Share"
        value={formatPercent(character.carryScore)}
        detail={`Confidence ${formatPercent(character.confidence, 0)}`}
        hint="Share of franchise attention."
      />
      {character.offCycleCarry === null ? null : (
        <Stat
          label="Between Releases"
          value={formatPercent(character.offCycleCarry)}
          hint={`Share ${EVENT_WINDOWS.offCycleGapDays}+ days from a release.`}
        />
      )}
      {character.durabilityRatio === null ? null : (
        <Stat
          label="Durability"
          value={formatNumber(character.durabilityRatio, 2)}
          hint="Between-release share ÷ release share. Above 1 holds."
        />
      )}
      {character.substitutability === null ? null : (
        <Stat
          label="Absorbed After Exit"
          value={formatPercent(character.substitutability)}
          hint="Share the rest of the cast gained after the exit."
        />
      )}
    </>
  );
}
