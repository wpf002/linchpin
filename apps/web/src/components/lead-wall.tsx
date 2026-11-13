import Link from "next/link";
import type { FranchiseRow } from "@linchpin/shared";
import { Face } from "./face";

/** Leads shown. Past this the faces are all near the minimum size and say nothing. */
const LEAD_COUNT = 28;

interface Lead {
  franchiseId: string;
  franchiseName: string;
  characterName: string;
  imageUrl: string | null;
  share: number;
}

function leadOf(row: FranchiseRow): Lead | null {
  const lead = row.topCast[0];
  if (!lead || lead.share === null) return null;
  return {
    franchiseId: row.id,
    franchiseName: row.canonicalName,
    characterName: lead.canonicalName,
    imageUrl: lead.imageUrl,
    share: lead.share,
  };
}

/**
 * The lead of each scored franchise, largest share first.
 * Diameter is the unit times share, so a lead with twice the share is twice as wide.
 */
export function LeadWall({ rows }: { rows: FranchiseRow[] }) {
  const leads = rows
    .map(leadOf)
    .filter((lead): lead is Lead => lead !== null)
    .sort((a, b) => b.share - a.share)
    .slice(0, LEAD_COUNT);
  if (leads.length === 0) return null;
  return (
    <ul className="flex flex-wrap items-center gap-3 [--lead-unit:128px] sm:gap-4 sm:[--lead-unit:256px]">
      {leads.map((lead) => (
        <li key={lead.franchiseId} className="flex">
          <Link
            href={`/franchises/${lead.franchiseId}`}
            className="rounded-full transition-transform duration-200 ease-out hover:scale-105"
          >
            <Face
              name={`${lead.characterName}, ${lead.franchiseName}`}
              imageUrl={lead.imageUrl}
              title={`${lead.characterName} · ${lead.franchiseName}`}
              className="min-w-10"
              style={{ width: `calc(var(--lead-unit) * ${lead.share.toFixed(3)})` }}
            />
          </Link>
        </li>
      ))}
    </ul>
  );
}
