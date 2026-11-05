import type { Metadata } from "next";
import Link from "next/link";
import { signalRowsQuerySchema, signalSourceSchema } from "@linchpin/shared";
import { clsx } from "clsx";
import { PageTitle } from "@/components/page-title";
import { EmptyState } from "@/components/panel";
import { fetchCharacter, fetchSignalRows } from "@/lib/api";
import { formatCount, formatDate, formatPercent, label } from "@/lib/format";
import { orNotFound } from "@/lib/load";
import { flattenSearchParams, type RawSearchParams } from "@/lib/search-params";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<RawSearchParams> };

export const metadata: Metadata = { title: "Signal Rows" };

export default async function SignalRowsPage({ params, searchParams }: Props) {
  const { id } = await params;
  const raw = flattenSearchParams(await searchParams);
  const parsed = signalRowsQuerySchema.safeParse(raw);
  const query = parsed.success ? parsed.data : signalRowsQuerySchema.parse({});
  const [character, page] = await Promise.all([orNotFound(fetchCharacter(id)), orNotFound(fetchSignalRows(id, query))]);
  const href = (values: Record<string, string | undefined>) => {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries(values)) if (value !== undefined) next.set(key, value);
    const text = next.toString();
    return text ? `?${text}` : "?";
  };
  const tabs = [undefined, ...signalSourceSchema.options];

  return (
    <>
      <PageTitle
        eyebrow={
          <span className="flex flex-wrap items-center gap-2">
            <Link href={`/franchises/${character.franchise.id}`} className="hover:text-ink">
              {character.franchise.canonicalName}
            </Link>
            <span className="text-faint">/</span>
            <Link href={`/characters/${character.id}`} className="hover:text-ink">
              {character.canonicalName}
            </Link>
          </span>
        }
        title="Signal Rows"
        aside={<span className="num text-sm text-faint">{formatCount(page.total)} Rows</span>}
      />
      <nav className="mb-4 flex flex-wrap gap-1 border-b border-line" aria-label="Source">
        {tabs.map((source) => {
          const active = query.source === source;
          return (
            <Link
              key={source ?? "all"}
              href={href({ source })}
              aria-current={active ? "page" : undefined}
              className={clsx(
                "-mb-px border-b-2 px-3 py-2 text-sm transition-colors duration-150",
                active ? "border-accent text-ink" : "border-transparent text-muted hover:text-ink",
              )}
            >
              {source ? label(source) : "All Sources"}
            </Link>
          );
        })}
      </nav>
      {page.rows.length === 0 ? (
        <EmptyState title="No Rows" detail="Nothing was ingested for this source." />
      ) : (
        <div className="overflow-x-auto rounded-[var(--radius-ui)] border border-line bg-surface">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">Source</th>
                <th className="px-4 py-3 text-right font-medium">Raw Value</th>
                <th className="px-4 py-3 font-medium">Window</th>
                <th className="px-4 py-3 text-right font-medium">Confidence</th>
              </tr>
            </thead>
            <tbody className="num">
              {page.rows.map((row) => (
                <tr key={`${row.source}-${row.measuredOn}`} className="border-b border-line last:border-b-0">
                  <td className="px-4 py-2 text-muted">{formatDate(row.measuredOn)}</td>
                  <td className="px-4 py-2 text-muted">{label(row.source)}</td>
                  <td className="px-4 py-2 text-right text-ink">{formatCount(row.rawValue)}</td>
                  <td className="px-4 py-2 text-muted">{row.isOffCycle ? "Off-Cycle" : "On-Cycle"}</td>
                  <td className="px-4 py-2 text-right text-muted">{formatPercent(row.confidence, 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <nav className="mt-4 flex justify-end gap-2" aria-label="Pagination">
        {query.cursor > 0 ? (
          <Link
            href={href({ source: query.source, cursor: String(Math.max(0, query.cursor - query.limit)) })}
            className="rounded-[var(--radius-ui)] border border-line px-3 py-2 text-sm text-muted hover:border-line-strong hover:text-ink"
          >
            Previous
          </Link>
        ) : null}
        {page.nextCursor !== null ? (
          <Link
            href={href({ source: query.source, cursor: String(page.nextCursor) })}
            className="rounded-[var(--radius-ui)] border border-line px-3 py-2 text-sm text-muted hover:border-line-strong hover:text-ink"
          >
            Next
          </Link>
        ) : null}
      </nav>
    </>
  );
}
