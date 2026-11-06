"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { exitSimulationSchema, type CharacterRow, type ExitSimulation } from "@linchpin/shared";
import { clsx } from "clsx";
import { Panel } from "./panel";
import { formatLogChange, formatNumber, formatPercent, formatSigned } from "@/lib/format";
import { NO_SCORE_HINT } from "@/lib/fragility";

/** Floor for the bar scale so an all-zero roster does not divide by zero. */
const MIN_BAR_SCALE = 0.0001;
/** Rows shown before the list is expanded. Shares past this point are usually under one percent. */
const COLLAPSED_ROW_COUNT = 8;

type SimulationState =
  | { kind: "idle" }
  | { kind: "loading"; characterId: string }
  | { kind: "ready"; simulation: ExitSimulation }
  | { kind: "error"; message: string };

export function FranchiseWorkbench({
  franchiseId,
  characters,
  scored,
}: {
  franchiseId: string;
  characters: CharacterRow[];
  scored: boolean;
}) {
  const [state, setState] = useState<SimulationState>({ kind: "idle" });
  const [expanded, setExpanded] = useState(false);
  // Confidence 0 means no usable signal: the character is named but never given a number.
  const measured = characters.filter((character) => character.confidence > 0);
  const unmeasured = characters.filter((character) => character.confidence === 0);
  const visible = expanded ? measured : measured.slice(0, COLLAPSED_ROW_COUNT);
  const maxCarry = Math.max(...measured.map((character) => character.carryScore), MIN_BAR_SCALE);
  const leadId = measured[0]?.id ?? null;
  const selectedId =
    state.kind === "loading" ? state.characterId : state.kind === "ready" ? state.simulation.characterId : null;

  // The simulator opens on the lead's exit so the panel is never blank on a scored franchise.
  useEffect(() => {
    if (scored && leadId) void simulate(leadId);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once per franchise
  }, [franchiseId, scored, leadId]);

  async function simulate(characterId: string) {
    setState({ kind: "loading", characterId });
    try {
      const query = new URLSearchParams({ franchiseId, characterId });
      const response = await fetch(`/api/simulate?${query.toString()}`);
      if (!response.ok) throw new Error(`Simulation failed (${response.status})`);
      setState({ kind: "ready", simulation: exitSimulationSchema.parse(await response.json()) });
    } catch (error) {
      setState({ kind: "error", message: error instanceof Error ? error.message : "Simulation failed" });
    }
  }

  return (
    <div className="grid gap-x-16 gap-y-16 lg:grid-cols-[minmax(0,3fr)_minmax(320px,2fr)]">
      <Panel title="Cast" action={<span className="num text-sm text-muted">{characters.length}</span>}>
        <ol>
          {visible.map((character, index) => (
            <CastRow
              key={character.id}
              character={character}
              rank={index + 1}
              barWidth={character.carryScore / maxCarry}
              selected={selectedId === character.id}
              disabled={!scored || state.kind === "loading"}
              disabledHint={scored ? undefined : NO_SCORE_HINT}
              onSelect={() => simulate(character.id)}
            />
          ))}
        </ol>
        {measured.length > COLLAPSED_ROW_COUNT ? (
          <button
            type="button"
            onClick={() => setExpanded((current) => !current)}
            aria-expanded={expanded}
            className="mt-4 text-sm text-accent transition-colors duration-150 hover:text-accent-strong"
          >
            {expanded ? "Show Fewer" : `Show All ${measured.length}`}
          </button>
        ) : null}
        {unmeasured.length > 0 ? (
          <div className="mt-8">
            <h3 className="mb-2 text-sm text-muted" title="No Wikipedia page views on record, so no share.">
              {unmeasured.length} With No Data
            </h3>
            <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
              {unmeasured.map((character) => (
                <li key={character.id}>
                  <Link href={`/characters/${character.id}`} className="text-faint hover:text-ink">
                    {character.canonicalName}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </Panel>
      <ExitSimulator state={state} characters={characters} />
    </div>
  );
}

function CastRow({
  character,
  rank,
  barWidth,
  selected,
  disabled,
  disabledHint,
  onSelect,
}: {
  character: CharacterRow;
  rank: number;
  barWidth: number;
  selected: boolean;
  disabled: boolean;
  disabledHint: string | undefined;
  onSelect: () => void;
}) {
  return (
    <li
      className={clsx(
        "relative grid grid-cols-[24px_minmax(0,1fr)_64px] items-center gap-x-4 border-b border-line px-3 py-3 transition-colors duration-150 sm:grid-cols-[24px_minmax(0,2fr)_minmax(0,3fr)_64px]",
        selected ? "bg-accent-soft shadow-[inset_2px_0_0_var(--accent)]" : "hover:bg-hover",
      )}
    >
      {/* The whole row picks the character for the simulator; the name link sits above it. */}
      <button
        type="button"
        disabled={disabled}
        onClick={onSelect}
        aria-pressed={selected}
        aria-label={`Remove ${character.canonicalName}`}
        title={disabledHint}
        className="absolute inset-0 cursor-pointer disabled:cursor-default"
      />
      <span className="num text-sm text-faint">{rank}</span>
      <div className="flex min-w-0 flex-col">
        <Link
          href={`/characters/${character.id}`}
          className="relative z-10 self-start truncate font-medium text-ink hover:text-accent-strong max-w-full"
        >
          {character.canonicalName}
        </Link>
        <span className="truncate text-xs text-faint">
          {character.portrayedBy ?? "Uncredited"}
          {` · Confidence ${formatPercent(character.confidence, 0)}`}
        </span>
      </div>
      <div className="relative hidden h-3 bg-raised sm:block" aria-hidden="true">
        <span
          className="absolute inset-y-0 left-0 bg-ink"
          style={{ width: `${barWidth * 100}%`, opacity: 0.4 + character.confidence * 0.6 }}
        />
      </div>
      <span className="num text-right text-ink">{formatPercent(character.carryScore)}</span>
    </li>
  );
}

function ExitSimulator({ state, characters }: { state: SimulationState; characters: CharacterRow[] }) {
  const removedName =
    state.kind === "ready"
      ? characters.find((character) => character.id === state.simulation.characterId)?.canonicalName
      : null;
  return (
    <Panel title={removedName ? `Without ${removedName}` : "Exit Simulator"} className="lg:sticky lg:top-24 lg:self-start">
      <div aria-live="polite">
        {state.kind === "idle" ? <p className="py-8 text-muted">Pick a Character</p> : null}
        {state.kind === "loading" ? (
          <div className="flex flex-col gap-3" aria-busy="true">
            {[0, 1, 2].map((row) => (
              <div key={row} className="h-8 animate-pulse bg-raised" />
            ))}
          </div>
        ) : null}
        {state.kind === "error" ? <p className="py-8 text-fail">{state.message}</p> : null}
        {state.kind === "ready" ? <SimulationResult simulation={state.simulation} /> : null}
      </div>
    </Panel>
  );
}

function SimulationResult({ simulation }: { simulation: ExitSimulation }) {
  const decline = simulation.projectedDecline;
  return (
    <div className="rise flex flex-col gap-8">
      <dl className="grid grid-cols-2 gap-8">
        <Delta label="HHI" before={formatNumber(simulation.hhiBefore, 3)} after={formatNumber(simulation.hhiAfter, 3)} />
        <Delta
          label="Lead Share"
          before={formatPercent(simulation.top1Before, 0)}
          after={formatPercent(simulation.top1After, 0)}
        />
      </dl>
      <div className="flex flex-col gap-2">
        <h3 className="text-sm text-muted" title="The leaving character's share, split among the rest in proportion.">
          Who Gains
        </h3>
        <ul>
          {simulation.absorbers.map((absorber) => (
            <li key={absorber.characterId} className="flex justify-between border-b border-line py-2">
              <Link href={`/characters/${absorber.characterId}`} className="text-ink hover:text-accent-strong">
                {absorber.canonicalName}
              </Link>
              <span className="num text-ink">{formatSigned(absorber.delta * 100, 1)} pts</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="flex flex-col gap-2">
        <h3
          className="text-sm text-muted"
          title="Average change after past unannounced exits by characters with a similar share, with the 95% range."
        >
          Change After Similar Exits
        </h3>
        {decline ? (
          <>
            <p className="num text-lg leading-tight text-ink">{formatLogChange(decline.pointEstimate)}</p>
            <DeclineInterval lower={decline.lower} point={decline.pointEstimate} upper={decline.upper} />
            <p className="num text-xs text-faint">{decline.comparableEvents} Past Exits</p>
          </>
        ) : (
          <p className="text-faint" title="Not enough past exits by characters with a similar share.">
            Too Few Past Exits
          </p>
        )}
      </div>
    </div>
  );
}

function Delta({ label, before, after }: { label: string; before: string; after: string }) {
  return (
    <div className="flex flex-col-reverse gap-1">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="num flex items-baseline gap-2">
        <span className="text-faint">{before}</span>
        <span className="text-faint" aria-hidden="true">
          →
        </span>
        <span className="text-lg leading-tight text-ink">{after}</span>
      </dd>
    </div>
  );
}

/** Interval on a symmetric log-change axis, zero in the middle. */
function DeclineInterval({ lower, point, upper }: { lower: number; point: number; upper: number }) {
  const extent = Math.max(Math.abs(lower), Math.abs(upper), 0.1);
  const position = (value: number) => ((value + extent) / (2 * extent)) * 100;
  return (
    <div className="relative h-6" aria-label={`Range ${formatLogChange(lower)} to ${formatLogChange(upper)}`}>
      <span className="absolute inset-x-0 top-1/2 h-px bg-line" />
      <span className="absolute top-1 bottom-1 w-px bg-line-strong" style={{ left: "50%" }} />
      <span
        className="absolute top-1/2 h-1 -translate-y-1/2 bg-ink opacity-40"
        style={{ left: `${position(lower)}%`, width: `${position(upper) - position(lower)}%` }}
      />
      <span
        className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink"
        style={{ left: `${position(point)}%` }}
      />
    </div>
  );
}
