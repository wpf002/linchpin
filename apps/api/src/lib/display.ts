import { ROSTER_COMPLETE_DISPLAY_FLOOR } from "@linchpin/shared";
import type { CastFace } from "@linchpin/shared";

export interface ConcentrationFigures {
  fragility: number | null;
  hhi: number | null;
  top1Share: number | null;
  top3Share: number | null;
}

/**
 * Below the floor the roster is too incomplete to support a concentration
 * claim, so every concentration figure is withheld. Suppressed, not greyed.
 */
export function applyDisplayFloor(
  rosterComplete: number,
  figures: ConcentrationFigures,
): ConcentrationFigures {
  if (rosterComplete >= ROSTER_COMPLETE_DISPLAY_FLOOR) return figures;
  return { fragility: null, hhi: null, top1Share: null, top3Share: null };
}

/**
 * Faces are roster facts and always shown. Their shares are concentration
 * figures, so below the floor each share is withheld.
 */
export function withholdCastShares(rosterComplete: number, cast: CastFace[]): CastFace[] {
  if (rosterComplete >= ROSTER_COMPLETE_DISPLAY_FLOOR) return cast;
  return cast.map((member) => ({ ...member, share: null }));
}
