import type { Metadata } from "next";
import Link from "next/link";
import { EVENT_WINDOWS } from "@linchpin/shared";
import { AttentionChart } from "@/components/attention-chart";
import { PageTitle } from "@/components/page-title";
import { EmptyState, Panel } from "@/components/panel";
import { SignalAudit } from "@/components/signal-audit";
import { Stat } from "@/components/stat";
import { fetchCharacter } from "@/lib/api";
import { formatDate, formatNumber, formatPercent, label } from "@/lib/format";
import { orNotFound } from "@/lib/load";

type Props = { params: Promise<{ id: string }> };

function load(id: string) {
  return orNotFound(fetchCharacter(id));
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
      <PageTitle
        eyebrow={
          <span className="flex flex-wrap items-center gap-2">
            <Link href="/" className="hover:text-ink">
              Franchises
            </Link>
            <span className="text-faint">/</span>
            <Link href={`/franchises/${character.franchise.id}`} className="hover:text-ink">
              {character.franchise.canonicalName}
            </Link>
          </span>
        }
        title={character.canonicalName}
        aside={
          <div className="flex flex-col gap-1 text-sm text-muted sm:items-end">
            <span>{character.portrayedBy ?? "Uncredited"}</span>
            <span className="text-xs text-faint">
              {label(character.status)} · Rank {character.rankInFranchise}
              {character.billingOrder !== null ? ` · Billed ${character.billingOrder}` : ""}
            </span>
          </div>
        }
      />
      <dl className="mb-16 grid grid-cols-2 items-start gap-8 border-y border-line py-8 sm:grid-cols-3 lg:grid-flow-col lg:items-end lg:auto-cols-fr lg:grid-cols-none">
        <Stat
          label="Attention Share"
          value={formatPercent(character.carryScore)}
          detail={`Confidence ${formatPercent(character.confidence, 0)}`}
          hint="Share of the franchise's attention."
        />
        {character.offCycleCarry === null ? null : (
          <Stat
            label="Between Releases"
            value={formatPercent(character.offCycleCarry)}
            hint={`Share on days at least ${EVENT_WINDOWS.offCycleGapDays} days from a release.`}
          />
        )}
        {character.durabilityRatio === null ? null : (
          <Stat
            label="Durability"
            value={formatNumber(character.durabilityRatio, 2)}
            hint="Share between releases divided by share around releases. Above 1 means interest holds."
          />
        )}
        {character.substitutability === null ? null : (
          <Stat
            label="Absorbed After Exit"
            value={formatPercent(character.substitutability)}
            hint="How much of this character's attention the rest of the cast picked up after they left."
          />
        )}
        {character.lastSeenAt === null ? null : (
          <Stat
            label="Last Seen"
            value={formatDate(character.lastSeenAt)}
            detail={character.firstSeenAt === null ? undefined : `First Seen ${formatDate(character.firstSeenAt)}`}
          />
        )}
      </dl>

      <div className="flex flex-col gap-16">
        <Panel
          title="Attention"
          action={
            <span className="flex items-center gap-2 text-sm text-muted">
              <span className="inline-block size-2.5" style={{ background: "var(--chart-off-cycle)", outline: "1px solid var(--border)" }} />
              Between Releases · {offCycleDays} Days
            </span>
          }
        >
          {character.series.length === 0 ? (
            <EmptyState title="No Data" />
          ) : (
            <AttentionChart series={character.series} />
          )}
        </Panel>
        <Panel
          title="Sources"
          action={
            <Link href={`/characters/${character.id}/signals`} className="text-sm text-accent hover:text-accent-strong">
              Raw Data
            </Link>
          }
        >
          <SignalAudit characterId={character.id} attribution={character.attribution} />
        </Panel>
      </div>
    </>
  );
}
