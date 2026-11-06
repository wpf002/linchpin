import Link from "next/link";
import type { CastFace, FranchiseRow } from "@linchpin/shared";
import { clsx } from "clsx";
import { Face, Poster } from "./face";
import { formatPercent } from "@/lib/format";
import { NOT_ENOUGH_CAST_HINT, castTracked } from "@/lib/words";

/** Faces on a tile. Five fit the tile width at any split of shares. */
const TILE_FACE_COUNT = 5;
/** Face diameter as a percentage of tile width: a fixed base plus a part that grows with sqrt(share), so area tracks share. */
const FACE_BASE = 12;
const FACE_SHARE_SPAN = 30;
/** Diameter when shares are withheld. Every face is the same size. */
const UNSIZED_FACE = 18;
const FACE_OVERLAP = 7;

function faceDiameter(share: number | null): number {
  return share === null ? UNSIZED_FACE : FACE_BASE + FACE_SHARE_SPAN * Math.sqrt(share);
}

function faceTitle(member: CastFace): string {
  return member.share === null ? member.canonicalName : `${member.canonicalName} · ${formatPercent(member.share, 0)}`;
}

/** A poster with the top cast along its bottom edge. Above the coverage floor, face size is share of attention. */
export function ShowTile({ row, compact = false }: { row: FranchiseRow; compact?: boolean }) {
  const faces = row.topCast.slice(0, TILE_FACE_COUNT);
  const scored = row.fragility !== null;
  return (
    <Link href={`/franchises/${row.id}`} className="group @container flex min-w-0 flex-col">
      <Poster
        name={row.canonicalName}
        imageUrl={row.imageUrl}
        className="transition-transform duration-200 ease-out group-hover:-translate-y-1"
      />
      {faces.length > 0 ? (
        <span className="relative -mt-[10cqw] flex items-end px-[4cqw]">
          {faces.map((member, index) => (
            <Face
              key={member.id}
              name={member.canonicalName}
              imageUrl={member.imageUrl}
              title={faceTitle(member)}
              className="ring-2 ring-bg"
              style={{
                width: `${faceDiameter(member.share)}cqw`,
                marginLeft: index === 0 ? 0 : `-${FACE_OVERLAP}cqw`,
                zIndex: faces.length - index,
              }}
            />
          ))}
        </span>
      ) : null}
      <span
        className={clsx(
          "mt-3 leading-tight text-ink transition-colors duration-150 group-hover:text-accent-strong [overflow-wrap:anywhere]",
          compact ? "text-sm font-medium" : "font-display text-lg",
        )}
      >
        {row.canonicalName}
      </span>
      {scored ? (
        <span className="mt-1 truncate text-sm text-muted">{row.topCharacter?.canonicalName}</span>
      ) : (
        <span className="mt-1 text-xs text-faint" title={NOT_ENOUGH_CAST_HINT}>
          {castTracked(row.rosterComplete, row.rosterSize)}
        </span>
      )}
    </Link>
  );
}
