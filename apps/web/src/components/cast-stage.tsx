"use client";

import Link from "next/link";
import { useState } from "react";
import { exitSimulationSchema, type CharacterRow, type ExitSimulation } from "@linchpin/shared";
import { clsx } from "clsx";
import { Face } from "./face";
import { formatLogChange, formatPercent } from "@/lib/format";
import { CONFIDENCE_LABEL, NOT_ENOUGH_CAST_HINT, changeInWords, confidenceLevel } from "@/lib/words";

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

type Projection =
  | { kind: "loading" }
  | { kind: "ready"; decline: ExitSimulation["projectedDecline"] }
  | { kind: "error"; message: string };

interface Removal {
  characterId: string;
  projection: Projection;
}

function faceDiameter(share: number): number {
  return Math.round(FACE_MIN_PX + FACE_SPAN_PX * Math.sqrt(share));
}

/** A removed character's share goes to the rest in proportion, the same rule the API applies. */
function shareWithout(share: number, removedShare: number): number {
  const remaining = 1 - removedShare;
  return remaining > 0 ? share / remaining : 0;
}

function byBilling(a: CharacterRow, b: CharacterRow): number {
  return (a.billingOrder ?? Number.MAX_SAFE_INTEGER) - (b.billingOrder ?? Number.MAX_SAFE_INTEGER);
}

function cappedWidth(pixels: number): string {
  return `min(${pixels}px, ${FACE_MAX_VW}vw)`;
}

async function fetchProjection(franchiseId: string, characterId: string): Promise<Projection> {
  try {
    const query = new URLSearchParams({ franchiseId, characterId });
    const response = await fetch(`/api/simulate?${query.toString()}`);
    if (!response.ok) return { kind: "error", message: `Lookup Failed (${response.status})` };
    return { kind: "ready", decline: exitSimulationSchema.parse(await response.json()).projectedDecline };
  } catch (error) {
    return { kind: "error", message: error instanceof Error ? error.message : "Lookup Failed" };
  }
}

/**
 * The cast as faces sized by share of attention. Picking a face writes that character out and resizes the rest.
 * Below the coverage floor every face is the same size and nothing can be picked.
 */
export function CastStage({
  franchiseId,
  characters,
  scored,
}: {
  franchiseId: string;
  characters: CharacterRow[];
  scored: boolean;
}) {
  const [removal, setRemoval] = useState<Removal | null>(null);
  const [expanded, setExpanded] = useState(false);

  if (!scored) return <UnsizedCast characters={[...characters].sort(byBilling)} />;

  // Confidence 0 means no usable signal: the character is shown but never sized.
  const measured = characters.filter((character) => character.confidence > 0);
  const unmeasured = characters.filter((character) => character.confidence === 0);
  const visible = expanded ? measured : measured.slice(0, COLLAPSED_FACE_COUNT);
  const removed = removal ? (measured.find((character) => character.id === removal.characterId) ?? null) : null;
  const hasLowerConfidence = visible.some((character) => confidenceLevel(character.confidence) !== "high");

  async function writeOut(characterId: string) {
    setRemoval({ characterId, projection: { kind: "loading" } });
    const projection = await fetchProjection(franchiseId, characterId);
    // A later pick wins: a slow response for an earlier face is dropped.
    setRemoval((current) => (current?.characterId === characterId ? { characterId, projection } : current));
  }

  function toggle(characterId: string) {
    if (removal?.characterId === characterId) setRemoval(null);
    else void writeOut(characterId);
  }

  return (
    <div className="flex flex-col gap-8">
      <div aria-live="polite" className="flex min-h-24 flex-col items-start gap-2">
        {removed && removal ? (
          <Outcome
            removed={removed}
            measured={measured}
            projection={removal.projection}
            onRestore={() => setRemoval(null)}
          />
        ) : (
          <p className="font-display text-lg leading-tight text-muted">Pick Someone to Write Out</p>
        )}
      </div>
      <ul className="flex flex-wrap items-end justify-center gap-x-6 gap-y-8">
        {visible.map((character) => {
          const isRemoved = removed?.id === character.id;
          const share = removed ? shareWithout(character.carryScore, removed.carryScore) : character.carryScore;
          return (
            <SizedFace
              key={character.id}
              character={character}
              share={isRemoved ? null : share}
              onToggle={() => toggle(character.id)}
            />
          );
        })}
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

/** One cast member on the stage. A null share means written out: smallest size, greyed. */
function SizedFace({
  character,
  share,
  onToggle,
}: {
  character: CharacterRow;
  share: number | null;
  onToggle: () => void;
}) {
  const isRemoved = share === null;
  const diameter = isRemoved ? FACE_MIN_PX : faceDiameter(share);
  const level = confidenceLevel(character.confidence);
  const hint = isRemoved
    ? `Bring Back ${character.canonicalName}`
    : `${character.canonicalName} · ${formatPercent(share, 0)} · ${CONFIDENCE_LABEL[level]}`;
  return (
    <li
      className="flex flex-col items-center gap-3 transition-[width] duration-300 ease-out motion-reduce:transition-none"
      style={{ width: `max(${NAME_MIN_WIDTH_PX}px, ${cappedWidth(diameter)})` }}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={isRemoved}
        aria-label={isRemoved ? `Bring Back ${character.canonicalName}` : `Write Out ${character.canonicalName}`}
        className={clsx(
          "flex cursor-pointer rounded-full transition-[width,opacity,filter] duration-300 ease-out motion-reduce:transition-none",
          isRemoved ? "opacity-40 grayscale" : "hover:opacity-80",
          level !== "high" && "outline-1 outline-offset-4 outline-muted outline-dashed",
        )}
        style={{ width: cappedWidth(diameter) }}
      >
        <Face name={character.canonicalName} imageUrl={character.imageUrl} title={hint} className="w-full" />
      </button>
      <span className="flex w-full flex-col items-center text-center">
        <Link
          href={`/characters/${character.id}`}
          className={clsx(
            "max-w-full truncate text-sm font-medium transition-colors duration-150 hover:text-accent-strong",
            isRemoved ? "text-faint line-through" : "text-ink",
          )}
        >
          {character.canonicalName}
        </Link>
        <span className="max-w-full truncate text-xs text-faint">{character.portrayedBy ?? "Uncredited"}</span>
      </span>
    </li>
  );
}

function Outcome({
  removed,
  measured,
  projection,
  onRestore,
}: {
  removed: CharacterRow;
  measured: CharacterRow[];
  projection: Projection;
  onRestore: () => void;
}) {
  const [lead, runnerUp] = measured;
  const leadLine =
    lead?.id === removed.id
      ? runnerUp
        ? `${runnerUp.canonicalName} takes the lead.`
        : "No one is left."
      : `${lead?.canonicalName ?? ""} stays in front.`;
  return (
    <>
      <p className="rise font-display text-lg leading-tight text-ink">
        Without {removed.canonicalName}, {leadLine}
      </p>
      <ProjectionLine projection={projection} />
      <button
        type="button"
        onClick={onRestore}
        className="mt-1 flex h-9 items-center rounded-[var(--radius-ui)] border border-line px-3 text-sm text-muted transition-colors duration-150 hover:border-line-strong hover:text-ink active:bg-hover"
      >
        Bring Back
      </button>
    </>
  );
}

function ProjectionLine({ projection }: { projection: Projection }) {
  if (projection.kind === "loading") return <p className="h-6 w-64 max-w-full animate-pulse bg-raised" aria-busy="true" />;
  if (projection.kind === "error") return <p className="text-fail">{projection.message}</p>;
  const decline = projection.decline;
  if (!decline) {
    return (
      <p className="text-faint" title="Not enough past exits by characters with a similar share.">
        Too Few Similar Past Exits
      </p>
    );
  }
  return (
    <p
      className="text-muted"
      title={`Range ${formatLogChange(decline.lower)} to ${formatLogChange(decline.upper)} · ${decline.comparableEvents} Past Exits`}
    >
      Shows that lost someone this big {changeInWords(decline.pointEstimate)}.
    </p>
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
