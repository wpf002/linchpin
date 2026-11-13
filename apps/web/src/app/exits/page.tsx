import type { Metadata } from "next";
import Link from "next/link";
import type { EventStudyRow } from "@linchpin/shared";
import { EventScatter } from "@/components/event-scatter";
import { Face } from "@/components/face";
import { PageTitle } from "@/components/page-title";
import { EmptyState, Panel } from "@/components/panel";
import { fetchEventStudies } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { changeInWords } from "@/lib/words";

export const metadata: Metadata = { title: "Exits" };

function StudyItem({ row }: { row: EventStudyRow }) {
  const franchiseLink = (
    <Link href={`/franchises/${row.franchiseId}`} className="hover:text-ink">
      {row.franchiseName}
    </Link>
  );
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line py-3 last:border-b-0">
      <Face name={row.characterName ?? row.franchiseName} imageUrl={row.imageUrl} className="w-10" />
      <div className="flex min-w-0 flex-1 basis-40 flex-col">
        <span className="flex flex-wrap items-baseline gap-x-2 font-medium text-ink">
          {row.characterId && row.characterName ? (
            <Link href={`/characters/${row.characterId}`} className="hover:text-accent-strong">
              {row.characterName}
            </Link>
          ) : (
            franchiseLink
          )}
          {row.announced ? <span className="text-xs font-normal text-faint">Announced</span> : null}
        </span>
        <span className="text-sm text-muted">
          {row.characterName ? <>{franchiseLink} · </> : null}
          {formatDate(row.eventDate)}
        </span>
      </div>
      <span className="text-sm text-ink">{changeInWords(row.didEstimate)}</span>
    </li>
  );
}

/** Measured attention change after each cast exit. Observed history only; nothing here is a forecast. */
export default async function ExitsPage() {
  const studies = await fetchEventStudies();
  return (
    <>
      <PageTitle title="Exits" />
      <div className="grid items-start gap-16 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Panel
          title="Before and After"
          hint="Views after each exit, vs. similar shows."
          action={
            <span className="flex items-center gap-4 text-sm text-muted">
              <span className="flex items-center gap-2">
                <span className="size-2.5 rounded-full bg-ink" /> Unannounced
              </span>
              <span className="flex items-center gap-2">
                <span className="size-2.5 rounded-full border border-ink" /> Announced
              </span>
            </span>
          }
        >
          {studies.length === 0 ? <EmptyState title="No Exits" /> : <EventScatter rows={studies} />}
        </Panel>
        {studies.length > 0 ? (
          <Panel title="All Exits">
            <ul className="max-h-[480px] overflow-y-auto lg:max-h-[640px]">
              {studies.map((row) => (
                <StudyItem key={row.exitEventId} row={row} />
              ))}
            </ul>
          </Panel>
        ) : null}
      </div>
    </>
  );
}
