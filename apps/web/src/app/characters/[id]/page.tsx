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
              Screener
            </Link>
            <span className="text-faint">/</span>
            <Link href={`/franchises/${character.franchise.id}`} className="hover:text-ink">
              {character.franchise.canonicalName}
            </Link>
          </span>
        }
        title={character.canonicalName}
        aside={
          <div className="flex flex-col items-end gap-1 text-sm text-muted">
            <span>{character.portrayedBy ?? "Uncredited"}</span>
            <span className="text-xs text-faint">
              {label(character.status)} · Rank {character.rankInFranchise}
              {character.billingOrder !== null ? ` · Billed ${character.billingOrder}` : ""}
            </span>
          </div>
        }
      />
      <dl className="mb-12 grid grid-cols-2 gap-6 border-y border-line py-6 sm:grid-cols-3 lg:grid-cols-5">
        <Stat
          label="Carry Score"
          value={formatPercent(character.carryScore)}
          detail={`Confidence ${formatPercent(character.confidence, 0)}`}
          hint="Blended share of franchise attention across measured signals."
        />
        <Stat label="Off-Cycle Carry" value={formatPercent(character.offCycleCarry)} hint={`Carry on days at least ${EVENT_WINDOWS.offCycleGapDays} days from any release.`} />
        <Stat
          label="Durability"
          value={formatNumber(character.durabilityRatio, 2)}
          hint="Off-cycle carry divided by on-cycle carry. Above 1 means attention holds between releases."
        />
        <Stat label="Substitutability" value={formatPercent(character.substitutability)} hint="Share of franchise attention the rest of the roster held during this character's absences. 100% means fully absorbed." />
        <Stat label="Seen" value={formatDate(character.lastSeenAt)} detail={`From ${formatDate(character.firstSeenAt)}`} />
      </dl>

      <div className="flex flex-col gap-6">
        <Panel
          title="Attention"
          action={
            <span className="flex items-center gap-2 text-xs text-faint">
              <span className="inline-block size-2.5 rounded-sm" style={{ background: "var(--chart-off-cycle)", outline: "1px solid var(--border)" }} />
              Off-Cycle · {offCycleDays} Days
            </span>
          }
        >
          {character.series.length === 0 ? (
            <EmptyState title="No Signal Rows" />
          ) : (
            <AttentionChart series={character.series} />
          )}
        </Panel>
        <Panel
          title="Signal Audit"
          action={
            <Link href={`/characters/${character.id}/signals`} className="text-xs text-accent hover:text-accent-strong">
              Raw Rows
            </Link>
          }
        >
          <SignalAudit characterId={character.id} attribution={character.attribution} />
        </Panel>
      </div>
    </>
  );
}
