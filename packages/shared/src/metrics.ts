import { FRAGILITY_WEIGHTS, SIGNAL_WEIGHTS } from "./constants.js";

export type SignalKey = keyof typeof SIGNAL_WEIGHTS;

export interface CharacterShares {
  wikiShare: number;
  fanworkShare?: number | null;
  searchShare?: number | null;
  discourseShare?: number | null;
}

/**
 * Convert raw per-character signal totals into within-franchise shares.
 * Shares sum to 1.0 across the roster. An all-zero roster yields all zeros
 * rather than NaN, so downstream HHI stays defined.
 */
export function toShares(raw: readonly number[]): number[] {
  const total = raw.reduce((sum, value) => sum + Math.max(0, value), 0);
  if (total <= 0) return raw.map(() => 0);
  return raw.map((value) => Math.max(0, value) / total);
}

/**
 * Weighted blend of available signal shares. Missing signals are dropped and
 * the remaining weights renormalised, so a wiki-only roster scores on wiki
 * alone instead of being penalised to 0.35 of its true share.
 */
export function carryScore(
  shares: CharacterShares,
  weights: Record<SignalKey, number> = SIGNAL_WEIGHTS,
): number {
  const present: Array<[number, number]> = [];
  const push = (value: number | null | undefined, weight: number) => {
    if (value === null || value === undefined || Number.isNaN(value)) return;
    if (weight <= 0) return;
    present.push([value, weight]);
  };
  push(shares.wikiShare, weights.wikiShare);
  push(shares.fanworkShare, weights.fanworkShare);
  push(shares.searchShare, weights.searchShare);
  push(shares.discourseShare, weights.discourseShare);

  const weightSum = present.reduce((sum, [, weight]) => sum + weight, 0);
  if (weightSum <= 0) return 0;
  return present.reduce((sum, [value, weight]) => sum + value * weight, 0) / weightSum;
}

/** Herfindahl-Hirschman Index over carry scores. 1.0 = one character is the franchise. */
export function hhi(carryScores: readonly number[]): number {
  const normalised = toShares(carryScores);
  return normalised.reduce((sum, share) => sum + share * share, 0);
}

export function topNShare(carryScores: readonly number[], n: number): number {
  const normalised = toShares(carryScores)
    .slice()
    .sort((a, b) => b - a);
  return normalised.slice(0, n).reduce((sum, share) => sum + share, 0);
}

export interface ZStats {
  mean: number;
  stdDev: number;
}

export function zStats(values: readonly number[]): ZStats {
  if (values.length === 0) return { mean: 0, stdDev: 0 };
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance =
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / Math.max(1, values.length - 1);
  return { mean, stdDev: Math.sqrt(variance) };
}

/** Standardise against a reference population. A zero-variance population yields 0. */
export function z(value: number, stats: ZStats): number {
  if (stats.stdDev === 0) return 0;
  return (value - stats.mean) / stats.stdDev;
}

export interface FragilityInput {
  hhi: number;
  top1Share: number;
  /** Mean substitutability across the roster, 0..1. Higher = more replaceable. */
  substitutability: number | null;
}

export interface FragilityPopulation {
  hhi: ZStats;
  top1Share: ZStats;
  substitutability: ZStats;
}

/**
 * fragility = 0.6 z(HHI) + 0.25 z(top1) - 0.15 z(substitutability)
 * Substitutability is often unavailable (patchy episode credits). When it is
 * missing its weight is dropped and the remaining weights renormalised, so the
 * score stays on the same scale instead of silently shrinking.
 */
export function fragility(input: FragilityInput, population: FragilityPopulation): number {
  const terms: Array<[number, number]> = [
    [z(input.hhi, population.hhi), FRAGILITY_WEIGHTS.hhi],
    [z(input.top1Share, population.top1Share), FRAGILITY_WEIGHTS.top1Share],
  ];
  if (input.substitutability !== null) {
    terms.push([
      z(input.substitutability, population.substitutability),
      FRAGILITY_WEIGHTS.substitutability,
    ]);
  }
  const absWeight = terms.reduce((sum, [, weight]) => sum + Math.abs(weight), 0);
  if (absWeight <= 0) return 0;
  const fullAbsWeight =
    Math.abs(FRAGILITY_WEIGHTS.hhi) +
    Math.abs(FRAGILITY_WEIGHTS.top1Share) +
    Math.abs(FRAGILITY_WEIGHTS.substitutability);
  const scale = fullAbsWeight / absWeight;
  return terms.reduce((sum, [value, weight]) => sum + value * weight, 0) * scale;
}

export function durabilityRatio(offCycleCarry: number, onCycleCarry: number): number | null {
  if (onCycleCarry <= 0) return null;
  return offCycleCarry / onCycleCarry;
}

/**
 * Removing a character redistributes their share across the remaining roster in
 * proportion to current share, then recomputes concentration. This is the exit
 * simulator's structural half; the decline interval comes from event studies.
 */
export function simulateRemoval(
  carryScores: readonly number[],
  removeIndex: number,
): { hhi: number; top1Share: number; remaining: number[] } {
  const remaining = carryScores.filter((_, index) => index !== removeIndex);
  const normalised = toShares(remaining);
  return {
    hhi: normalised.reduce((sum, share) => sum + share * share, 0),
    top1Share: Math.max(0, ...normalised),
    remaining: normalised,
  };
}
