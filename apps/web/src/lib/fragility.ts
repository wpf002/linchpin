import { ROSTER_COMPLETE_DISPLAY_FLOOR, fragilityBand, type FragilityBandId } from "@linchpin/shared";
import { formatPercent } from "./format";

const COVERAGE_FLOOR = formatPercent(ROSTER_COMPLETE_DISPLAY_FLOOR, 0);

/** Tooltip wherever a score is withheld for low cast coverage. */
export const NO_SCORE_HINT = `Under ${COVERAGE_FLOOR} of cast on Wikipedia.`;

/** Tooltip on the coverage figure itself. */
export const COVERAGE_HINT = `Cast with a Wikipedia page. ${COVERAGE_FLOOR} needed to score.`;

/** CSS custom property per band, defined in globals.css. */
export const BAND_TOKEN: Record<FragilityBandId, string> = {
  ensemble: "var(--frag-ensemble)",
  balanced: "var(--frag-balanced)",
  concentrated: "var(--frag-concentrated)",
  "load-bearing": "var(--frag-load-bearing)",
};

/** Display domain for fragility z-composites. Values beyond are clamped to the edge. */
export const FRAGILITY_DOMAIN = { min: -2, max: 2.5 } as const;

export function bandOf(value: number) {
  return fragilityBand(value);
}

export function domainPosition(value: number): number {
  const clamped = Math.min(FRAGILITY_DOMAIN.max, Math.max(FRAGILITY_DOMAIN.min, value));
  return (clamped - FRAGILITY_DOMAIN.min) / (FRAGILITY_DOMAIN.max - FRAGILITY_DOMAIN.min);
}
