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

export function castTracked(rosterComplete: number, rosterSize: number): string {
  return `Cast Tracked ${Math.round(rosterComplete * rosterSize)} of ${rosterSize}`;
}

/** At or above this ratio a rise reads as a multiple. "Up 6471%" is unreadable; "Up 66x" isn't. */
const MULTIPLE_FROM_RATIO = 3;

/** A log-point estimate as "Down 12%", "Up 4%" or "Up 66x". */
export function changeInWords(logChange: number): string {
  const ratio = Math.exp(logChange);
  const percent = Math.round(Math.abs(ratio - 1) * 100);
  // Compared on the rounded percent so exp(log(3)) = 2.9999… still reads as a multiple.
  if (logChange > 0 && percent >= (MULTIPLE_FROM_RATIO - 1) * 100) return `Up ${Math.round(ratio)}x`;
  if (percent === 0) return "Flat";
  return `${logChange < 0 ? "Down" : "Up"} ${percent}%`;
}

/** Rank is 1-based by attention share. */
export function rankLabel(rank: number): string {
  return rank === 1 ? "Lead" : `No. ${rank}`;
}

/** Durability is share between releases over share around releases. This band counts as holding level. */
const HOLDS_ABOVE = 1.1;
const FADES_BELOW = 0.9;

export function stayingPower(durabilityRatio: number): string {
  if (durabilityRatio >= HOLDS_ABOVE) return "Grows Between Releases";
  return durabilityRatio < FADES_BELOW ? "Fades Between Releases" : "Holds Between Releases";
}

/** Residuals inside this band, in share points, read as matching billing. */
const BILLING_MATCH_BAND = 0.02;

export function versusBilling(residual: number): string {
  if (residual > BILLING_MATCH_BAND) return "Outdraws Billing";
  return residual < -BILLING_MATCH_BAND ? "Trails Billing" : "Matches Billing";
}
