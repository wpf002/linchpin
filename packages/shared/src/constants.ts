/**
 * Canonical model constants. Every score row records MODEL_VERSION.
 * Changing any weight requires a version bump and a full validation re-run.
 */
export const MODEL_VERSION = "v0.3.0";

/** Phase 2 runs wiki-only (wikiShare = 1.0). Phase 3 fits these on a training split. */
export const SIGNAL_WEIGHTS = {
  wikiShare: 0.35,
  fanworkShare: 0.25,
  searchShare: 0.2,
  discourseShare: 0.2,
} as const;

/** Phase 2 gate configuration: single signal, nothing to argue about. */
export const WIKI_ONLY_WEIGHTS = {
  wikiShare: 1,
  fanworkShare: 0,
  searchShare: 0,
  discourseShare: 0,
} as const;

export const FRAGILITY_WEIGHTS = {
  hhi: 0.6,
  top1Share: 0.25,
  substitutability: -0.15,
} as const;

/** Written before the test is run. Do not adjust after seeing results. */
export const KILL_CRITERIA = {
  minRankIC: 0.15,
  minRosterCompleteness: 0.7,
  minCreatorProjects: 3,
  minExitEvents: 200,
} as const;

export const EVENT_WINDOWS = {
  preStart: -90,
  preEnd: -1,
  postStart: 30,
  postEnd: 210,
  offCycleGapDays: 90,
} as const;

/**
 * Below this roster completeness a fragility score is suppressed entirely.
 * Suppressed means absent from the response, not greyed out in the UI.
 */
/** Which AttentionSignal source feeds each share. Mirrored in metrics/constants.py. */
export const SIGNAL_SOURCE_BY_SHARE = {
  wikiShare: "WIKI",
  fanworkShare: "AO3",
  searchShare: "TRENDS",
  discourseShare: "REDDIT",
} as const;

export const ROSTER_COMPLETE_DISPLAY_FLOOR = KILL_CRITERIA.minRosterCompleteness;

/** Fragility presentation bands. Fragility is a z-weighted composite, roughly -3..3. */
export const FRAGILITY_BANDS = [
  { id: "ensemble", label: "Ensemble", min: Number.NEGATIVE_INFINITY, max: -0.5 },
  { id: "balanced", label: "Balanced", min: -0.5, max: 0.4 },
  { id: "concentrated", label: "Star-Led", min: 0.4, max: 1.2 },
  { id: "load-bearing", label: "One-Person Show", min: 1.2, max: Number.POSITIVE_INFINITY },
] as const;

export type FragilityBandId = (typeof FRAGILITY_BANDS)[number]["id"];

export function fragilityBand(fragility: number): (typeof FRAGILITY_BANDS)[number] {
  for (const band of FRAGILITY_BANDS) {
    if (fragility >= band.min && fragility < band.max) return band;
  }
  const last = FRAGILITY_BANDS[FRAGILITY_BANDS.length - 1];
  if (!last) throw new Error("FRAGILITY_BANDS is empty");
  return last;
}
