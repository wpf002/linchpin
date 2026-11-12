import { ROSTER_COMPLETE_DISPLAY_FLOOR, type FragilityBandId } from "@linchpin/shared";
import { formatPercent } from "./format";

/** Shown wherever a franchise is below the cast coverage floor. Never a dimmed score. */
export const NOT_ENOUGH_CAST = "Not Enough Cast Data";

const COVERAGE_FLOOR = formatPercent(ROSTER_COMPLETE_DISPLAY_FLOOR, 0);

export const NOT_ENOUGH_CAST_HINT = `Needs ${COVERAGE_FLOOR} of the cast on Wikipedia before anyone is ranked.`;

/** Lower bound of each phrase, largest first. Exact figures stay in tooltips and the Numbers section. */
const SHARE_PHRASES = [
  { min: 0.85, phrase: "almost all" },
  { min: 0.68, phrase: "about three quarters" },
  { min: 0.58, phrase: "about two thirds" },
  { min: 0.42, phrase: "about half" },
  { min: 0.29, phrase: "about a third" },
  { min: 0.22, phrase: "about a quarter" },
  { min: 0.17, phrase: "about a fifth" },
  { min: 0.08, phrase: "about a tenth" },
] as const;
const SMALLEST_SHARE_PHRASE = "under a tenth";

export function shareInWords(share: number): string {
  return SHARE_PHRASES.find((step) => share >= step.min)?.phrase ?? SMALLEST_SHARE_PHRASE;
}

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
  "load-bearing": "One character draws nearly all the attention.",
  concentrated: "One character draws far more attention than anyone else.",
  balanced: "A clear lead with strong support.",
  ensemble: "Attention is spread across the cast.",
};

/** One sentence on who holds the audience. Names are the cast ordered by attention, largest first. */
export function castSentence(band: FragilityBandId, names: string[]): string {
  const [lead, second] = names;
  if (!lead) return "";
  if (band === "load-bearing") return `${lead} is the show.`;
  if (band === "concentrated") return `${lead} is well ahead of everyone else.`;
  if (band === "balanced") return second ? `${lead} leads, with ${second} close behind.` : `${lead} leads.`;
  return second ? `No one character carries it. ${lead} and ${second} are the biggest draws.` : `${lead} leads.`;
}

export function castTracked(rosterComplete: number, rosterSize: number): string {
  return `Cast Tracked ${Math.round(rosterComplete * rosterSize)} of ${rosterSize}`;
}

/** At or above this ratio a rise reads as a multiple. "Rose about 6471%" is unreadable; "rose about 66x" isn't. */
const MULTIPLE_FROM_RATIO = 3;

/** A log-point estimate as "fell about 12%", "rose about 4%" or "rose about 66x". */
export function changeInWords(logChange: number): string {
  const ratio = Math.exp(logChange);
  const percent = Math.round(Math.abs(ratio - 1) * 100);
  // Compared on the rounded percent so exp(log(3)) = 2.9999… still reads as a multiple.
  if (logChange > 0 && percent >= (MULTIPLE_FROM_RATIO - 1) * 100) return `rose about ${Math.round(ratio)}x`;
  if (percent === 0) return "held flat";
  return `${logChange < 0 ? "fell" : "rose"} about ${percent}%`;
}

/** One line on a character's place in the cast. Rank is 1-based by attention share. */
export function characterSentence(share: number, franchiseName: string, rank: number): string {
  const place = rank === 1 ? "Leads the cast." : `Number ${rank} in the cast.`;
  return `Draws ${shareInWords(share)} of the attention on ${franchiseName}. ${place}`;
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
