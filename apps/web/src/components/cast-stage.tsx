"use client";

import Link from "next/link";
import { useState } from "react";
import type { CharacterRow } from "@linchpin/shared";
import { clsx } from "clsx";
import { Face } from "./face";
import { formatPercent } from "@/lib/format";
import { CONFIDENCE_LABEL, NOT_ENOUGH_CAST_HINT, confidenceLevel } from "@/lib/words";

/** Face diameter in pixels: a floor plus a part that grows with sqrt(share), so area tracks share. */
const FACE_MIN_PX = 48;
const FACE_SPAN_PX = 200;
/** Cap as a share of viewport width so the lead fits a 320px screen. */
const FACE_MAX_VW = 56;
/** Diameter when shares are withheld. Every face is the same size. */
const UNSIZED_FACE_PX = 80;
const NO_DATA_FACE_PX = 40;
/** Narrowest column a name is given under a small face. */
const NAME_MIN_WIDTH_PX = 104;
/** Faces shown before the cast is expanded. Shares past this point are usually under one percent. */
const COLLAPSED_FACE_COUNT = 12;

function faceDiameter(share: number): number {
  return Math.round(FACE_MIN_PX + FACE_SPAN_PX * Math.sqrt(share));
}

function byBilling(a: CharacterRow, b: CharacterRow): number {
  return (a.billingOrder ?? Number.MAX_SAFE_INTEGER) - (b.billingOrder ?? Number.MAX_SAFE_INTEGER);
}

function cappedWidth(pixels: number): string {
  return `min(${pixels}px, ${FACE_MAX_VW}vw)`;
}

/**
 * The cast as faces sized by measured share of attention.
 * Below the coverage floor every face is the same size.
 */
export function CastStage({ characters, scored }: { characters: CharacterRow[]; scored: boolean }) {
  const [expanded, setExpanded] = useState(false);

  if (!scored) return <UnsizedCast characters={[...characters].sort(byBilling)} />;

  // Confidence 0 means no usable signal: the character is shown but never sized.
  const measured = characters.filter((character) => character.confidence > 0);
  const unmeasured = characters.filter((character) => character.confidence === 0);
  const visible = expanded ? measured : measured.slice(0, COLLAPSED_FACE_COUNT);
  const hasLowerConfidence = visible.some((character) => confidenceLevel(character.confidence) !== "high");

  return (
    <div className="flex flex-col gap-8">
      <ul className="flex flex-wrap items-end justify-center gap-x-6 gap-y-8">
        {visible.map((character) => (
          <SizedFace key={character.id} character={character} />
        ))}
      </ul>
      <div className="flex flex-wrap items-center justify-between gap-4 text-sm">
        {measured.length > COLLAPSED_FACE_COUNT ? (
          <button
            type="button"
            onClick={() => setExpanded((current) => !current)}
            aria-expanded={expanded}
            className="text-accent transition-colors duration-150 hover:text-accent-strong"
          >
            {expanded ? "Show Fewer" : `Show All ${measured.length}`}
          </button>
        ) : (
          <span />
        )}
        {hasLowerConfidence ? (
          <span className="flex items-center gap-2 text-faint">
            <span aria-hidden="true" className="size-3 rounded-full border border-dashed border-muted" />
            Dashed Ring Means Lower Confidence
          </span>
        ) : null}
      </div>
      {unmeasured.length > 0 ? (
        <div className="flex flex-col gap-3">
          <h3 className="text-sm text-muted" title="No Wikipedia page views on record, so no size.">
            {unmeasured.length} With No Data
          </h3>
          <ul className="flex flex-wrap gap-x-4 gap-y-3">
            {unmeasured.map((character) => (
              <li key={character.id}>
                <Link
                  href={`/characters/${character.id}`}
                  className="flex items-center gap-2 text-sm text-faint transition-colors duration-150 hover:text-ink"
                >
                  <Face
                    name={character.canonicalName}
                    imageUrl={character.imageUrl}
                    style={{ width: NO_DATA_FACE_PX }}
                  />
                  {character.canonicalName}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

/** One cast member, sized by share. Links to the character page. */
function SizedFace({ character }: { character: CharacterRow }) {
  const diameter = faceDiameter(character.carryScore);
  const level = confidenceLevel(character.confidence);
  const hint = `${character.canonicalName} · ${formatPercent(character.carryScore, 0)} · ${CONFIDENCE_LABEL[level]}`;
  return (
    <li
      className="flex flex-col items-center gap-3"
      style={{ width: `max(${NAME_MIN_WIDTH_PX}px, ${cappedWidth(diameter)})` }}
    >
      <Link
        href={`/characters/${character.id}`}
        className="group flex w-full flex-col items-center gap-3 text-center"
      >
        <span
          className={clsx(
            "flex rounded-full transition-opacity duration-150 group-hover:opacity-80",
            level !== "high" && "outline-1 outline-offset-4 outline-muted outline-dashed",
          )}
          style={{ width: cappedWidth(diameter) }}
        >
          <Face name={character.canonicalName} imageUrl={character.imageUrl} title={hint} className="w-full" />
        </span>
        <span className="flex w-full flex-col items-center">
          <span className="max-w-full truncate text-sm font-medium text-ink transition-colors duration-150 group-hover:text-accent-strong">
            {character.canonicalName}
          </span>
          <span className="num max-w-full truncate text-xs text-muted">{formatPercent(character.carryScore, 0)}</span>
          <span className="max-w-full truncate text-xs text-faint">{character.portrayedBy ?? "Uncredited"}</span>
        </span>
      </Link>
    </li>
  );
}

function UnsizedCast({ characters }: { characters: CharacterRow[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-6" title={NOT_ENOUGH_CAST_HINT}>
      {characters.map((character) => (
        <li key={character.id} style={{ width: NAME_MIN_WIDTH_PX }}>
          <Link href={`/characters/${character.id}`} className="group flex flex-col items-center gap-2 text-center">
            <Face name={character.canonicalName} imageUrl={character.imageUrl} style={{ width: UNSIZED_FACE_PX }} />
            <span className="flex w-full flex-col">
              <span className="truncate text-sm font-medium text-ink transition-colors duration-150 group-hover:text-accent-strong">
                {character.canonicalName}
              </span>
              <span className="truncate text-xs text-faint">{character.portrayedBy ?? "Uncredited"}</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
