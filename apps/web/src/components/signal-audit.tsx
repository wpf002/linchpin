import Link from "next/link";
import type { CharacterDetail } from "@linchpin/shared";
import { formatCount, formatPercent, label } from "@/lib/format";

/** Every input to the carry score, with a link to the raw rows behind it. */
export function SignalAudit({ characterId, attribution }: { characterId: string; attribution: CharacterDetail["attribution"] }) {
  const totalContribution = attribution.reduce((sum, row) => sum + row.contribution, 0) || 1;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead className="border-b border-ink text-left text-sm text-muted">
          <tr>
            <th className="px-3 py-3 font-medium">Source</th>
            <th className="px-3 py-3 text-right font-medium" title="Share from this source.">
              Share
            </th>
            <th className="px-3 py-3 text-right font-medium" title="Source weight in the score.">
              Weight
            </th>
            <th className="px-3 py-3 font-medium">Contribution</th>
            <th className="px-3 py-3 text-right font-medium">Rows</th>
          </tr>
        </thead>
        <tbody>
          {attribution.map((row) => {
            const measured = row.share !== null;
            return (
              <tr key={row.source} className="border-b border-line last:border-b-0">
                <td className="px-3 py-3 text-ink">{label(row.source)}</td>
                <td className="num px-3 py-3 text-right text-ink">
                  {measured ? formatPercent(row.share) : <span className="text-faint">No Data</span>}
                </td>
                <td className="num px-3 py-3 text-right text-muted">{measured ? formatPercent(row.weight, 0) : ""}</td>
                <td className="px-3 py-3">
                  {measured ? (
                    <span className="flex items-center gap-3">
                      <span className="relative h-3 w-32 bg-raised" aria-hidden="true">
                        <span
                          className="absolute inset-y-0 left-0 bg-ink"
                          style={{ width: `${(row.contribution / totalContribution) * 100}%` }}
                        />
                      </span>
                      <span className="num text-muted">{formatPercent(row.contribution)}</span>
                    </span>
                  ) : null}
                </td>
                <td className="num px-3 py-3 text-right">
                  {row.observationCount > 0 ? (
                    <Link
                      href={`/characters/${characterId}/signals?source=${row.source}`}
                      className="text-accent hover:text-accent-strong"
                    >
                      {formatCount(row.observationCount)}
                    </Link>
                  ) : (
                    <span className="text-faint">0</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
