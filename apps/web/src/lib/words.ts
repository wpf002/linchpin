import { ROSTER_COMPLETE_DISPLAY_FLOOR, type FragilityBandId } from "@linchpin/shared";
import { formatPercent } from "./format";

/** Shown wherever a franchise is below the cast coverage floor. Never a dimmed score. */
export const NOT_ENOUGH_CAST = "Not Enough Cast Data";

const COVERAGE_FLOOR = formatPercent(ROSTER_COMPLETE_DISPLAY_FLOOR, 0);

export const NOT_ENOUGH_CAST_HINT = `Under ${COVERAGE_FLOOR} of cast on Wikipedia.`;

const HIGH_CONFIDENCE_FLOOR = 0.75;
const MEDIUM_CONFIDENCE_FLOOR = 0.4;

export type ConfidenceLevel = "high" | "medium" | "low";

export function confidenceLevel(confidence: number): ConfidenceLevel {
  if (confidence >= HIGH_CONFIDENCE_FLOOR) return "high";
  return confidence >= MEDIUM_CONFIDENCE_FLOOR ? "medium" : "low";
}

export const CONFIDENCE_LABEL: Record<ConfidenceLevel, string> = {
  high: "High Confidence",
  medium: "Medium Confidence",
  low: "Low Confidence",
};

export const BAND_HINT: Record<FragilityBandId, string> = {
  "load-bearing": "Lead far ahead of the cast.",
  concentrated: "Lead well ahead of the cast.",
  balanced: "Lead slightly ahead.",
  ensemble: "No clear lead.",
};

/** Changes smaller than this fraction of views read as no change. */
const FLAT_BELOW = 0.05;
/** Changes at least this large (a rise to 2x, or a fall to half) read as big. */
const BIG_FROM_RATIO = 2;

/** A log-point estimate in words, with no figure. */
export function changeInWords(logChange: number): string {
  const ratio = Math.exp(logChange);
  if (Math.abs(ratio - 1) < FLAT_BELOW) return "No Change";
  const big = Math.abs(logChange) >= Math.log(BIG_FROM_RATIO);
  if (logChange > 0) return big ? "Views Way Up" : "Views Up";
  return big ? "Views Way Down" : "Views Down";
}

/** Rank is 1-based by attention share. */
const MAIN_CAST_THROUGH = 3;

export function rankLabel(rank: number): string {
  if (rank === 1) return "Lead";
  return rank <= MAIN_CAST_THROUGH ? "Main Cast" : "Supporting";
}

/** Durability is share between releases over share around releases. This band counts as holding level. */
const HOLDS_ABOVE = 1.1;
const FADES_BELOW = 0.9;

export function stayingPower(durabilityRatio: number): string {
  if (durabilityRatio >= HOLDS_ABOVE) return "Grows Off-Season";
  return durabilityRatio < FADES_BELOW ? "Fades Off-Season" : "Holds Off-Season";
}
