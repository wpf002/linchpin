"use client";

import Link from "next/link";
import { useState } from "react";
import { exitSimulationSchema, type CharacterRow, type ExitSimulation } from "@linchpin/shared";
import { clsx } from "clsx";
import { formatLogChange, formatNumber, formatPercent, formatSigned } from "@/lib/format";

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
  const maxCarry = Math.max(...characters.map((character) => character.carryScore), 0.0001);
  const selectedId =
    state.kind === "loading" ? state.characterId : state.kind === "ready" ? state.simulation.characterId : null;

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
    <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(320px,2fr)]">
      <section className="rounded-[var(--radius-ui)] border border-line bg-surface">
        <header className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="text-sm font-medium text-ink">Carry Distribution</h2>
          <span className="text-xs text-faint">{characters.length} Characters</span>
        </header>
        <ol className="divide-y divide-line">
          {characters.map((character, index) => (
            <li
              key={character.id}
              className={clsx(
                "grid grid-cols-[24px_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3",
                selectedId === character.id && "bg-accent-soft",
              )}
            >
              <span className="num text-xs text-faint">{index + 1}</span>
              <div className="flex min-w-0 flex-col gap-2">
                <div className="flex items-baseline justify-between gap-3">
                  <Link
                    href={`/characters/${character.id}`}
                    className="truncate text-sm font-medium text-ink hover:text-accent-strong"
                  >
                    {character.canonicalName}
                  </Link>
                  <span className="num text-sm text-ink">{formatPercent(character.carryScore)}</span>
                </div>
                <div className="relative h-1.5 rounded-sm bg-raised" aria-hidden="true">
                  <span
                    className="absolute inset-y-0 left-0 rounded-sm bg-accent"
                    style={{ width: `${(character.carryScore / maxCarry) * 100}%`, opacity: 0.4 + character.confidence * 0.6 }}
                  />
                </div>
                <span className="truncate text-xs text-faint">
                  {character.portrayedBy ?? "Uncredited"}
                  {character.billingOrder !== null ? ` · Billed ${character.billingOrder}` : ""}
                  {` · Confidence ${formatPercent(character.confidence, 0)}`}
                </span>
              </div>
              <button
                type="button"
                disabled={!scored || state.kind === "loading"}
                onClick={() => simulate(character.id)}
                className="rounded-[var(--radius-ui)] border border-line px-3 py-1.5 text-xs text-muted transition-colors duration-150 hover:border-accent hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
                title={scored ? undefined : "Simulation needs roster coverage above the floor."}
              >
                Remove
              </button>
            </li>
          ))}
        </ol>
      </section>
      <ExitSimulator state={state} characters={characters} />
    </div>
  );
}

function ExitSimulator({ state, characters }: { state: SimulationState; characters: CharacterRow[] }) {
  const removedName =
    state.kind === "ready"
      ? characters.find((character) => character.id === state.simulation.characterId)?.canonicalName
      : null;
  return (
    <section
      className="flex flex-col rounded-[var(--radius-ui)] border border-line bg-surface lg:sticky lg:top-24 lg:self-start"
      aria-live="polite"
    >
      <header className="flex items-center justify-between border-b border-line px-4 py-3">
        <h2 className="text-sm font-medium text-ink">Exit Simulator</h2>
        {removedName ? <span className="text-xs text-accent-strong">Without {removedName}</span> : null}
      </header>
      <div className="p-4">
        {state.kind === "idle" ? (
          <p className="py-8 text-center text-sm text-muted">Pick a character to remove.</p>
        ) : null}
        {state.kind === "loading" ? (
          <div className="flex flex-col gap-3 py-4" aria-busy="true">
            {[0, 1, 2].map((row) => (
              <div key={row} className="h-8 animate-pulse rounded-sm bg-raised" />
            ))}
          </div>
        ) : null}
        {state.kind === "error" ? <p className="py-8 text-center text-sm text-fail">{state.message}</p> : null}
        {state.kind === "ready" ? <SimulationResult simulation={state.simulation} /> : null}
      </div>
    </section>
  );
}

function SimulationResult({ simulation }: { simulation: ExitSimulation }) {
  const decline = simulation.projectedDecline;
  return (
    <div className="rise flex flex-col gap-6">
      <dl className="grid grid-cols-2 gap-4">
        <Delta label="HHI" before={formatNumber(simulation.hhiBefore, 3)} after={formatNumber(simulation.hhiAfter, 3)} />
        <Delta
          label="Top 1 Share"
          before={formatPercent(simulation.top1Before)}
          after={formatPercent(simulation.top1After)}
        />
      </dl>
      <div className="flex flex-col gap-2">
        <h3 className="text-xs uppercase tracking-wide text-faint" title="Attention share redistributed pro rata.">
          Absorbers
        </h3>
        <ul className="flex flex-col gap-1">
          {simulation.absorbers.map((absorber) => (
            <li key={absorber.characterId} className="flex justify-between text-sm">
              <Link href={`/characters/${absorber.characterId}`} className="text-muted hover:text-ink">
                {absorber.canonicalName}
              </Link>
              <span className="num text-ink">{formatSigned(absorber.delta * 100, 1)} pts</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="flex flex-col gap-2 border-t border-line pt-4">
        <h3
          className="text-xs uppercase tracking-wide text-faint"
          title="Mean and 95% range of realised attention change across unannounced exits with similar pre-exit carry."
        >
          Projected Attention Change
        </h3>
        {decline ? (
          <>
            <p className="num text-lg text-ink">{formatLogChange(decline.pointEstimate)}</p>
            <DeclineInterval lower={decline.lower} point={decline.pointEstimate} upper={decline.upper} />
            <p className="text-xs text-faint">
              {decline.comparableEvents} Comparable Exits · {decline.basis}
            </p>
          </>
        ) : (
          <p className="text-sm text-muted" title="Too few comparable unannounced exits in the event corpus.">
            Insufficient Comparables
          </p>
        )}
      </div>
    </div>
  );
}

function Delta({ label, before, after }: { label: string; before: string; after: string }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-xs uppercase tracking-wide text-faint">{label}</dt>
      <dd className="num flex items-baseline gap-2 text-sm">
        <span className="text-muted">{before}</span>
        <span className="text-faint" aria-hidden="true">
          →
        </span>
        <span className="text-lg text-ink">{after}</span>
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
        className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-accent opacity-50"
        style={{ left: `${position(lower)}%`, width: `${position(upper) - position(lower)}%` }}
      />
      <span
        className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent-strong"
        style={{ left: `${position(point)}%` }}
      />
    </div>
  );
}
