import { z } from "zod";

export const mediumSchema = z.enum(["TV", "FILM", "COMIC", "ANIMATION", "SPORTS"]);
export const franchiseStatusSchema = z.enum([
  "ACTIVE",
  "ENDED",
  "CANCELLED",
  "HIATUS",
  "ANNOUNCED",
]);
export const characterStatusSchema = z.enum([
  "ACTIVE",
  "DEPARTED",
  "DECEASED",
  "RECAST",
  "UNKNOWN",
]);
export const signalSourceSchema = z.enum(["WIKI", "AO3", "TRENDS", "REDDIT", "FANDOM"]);
export const exitTypeSchema = z.enum([
  "CHARACTER_DEATH",
  "ACTOR_DEPARTURE",
  "RECAST",
  "SHOWRUNNER_EXIT",
  "CREATIVE_TEAM_CHANGE",
]);

const share = z.number().min(0).max(1);

export const signalBreakdownSchema = z.object({
  wikiShare: share,
  fanworkShare: share.nullable(),
  searchShare: share.nullable(),
  discourseShare: share.nullable(),
});

export const characterRowSchema = z.object({
  id: z.string(),
  canonicalName: z.string(),
  status: characterStatusSchema,
  portrayedBy: z.string().nullable(),
  billingOrder: z.number().int().nullable(),
  carryScore: share,
  offCycleCarry: share.nullable(),
  durabilityRatio: z.number().nullable(),
  /** Null when the character has no absence window. Never imputed. */
  substitutability: share.nullable(),
  /** Why substitutability is null, when it is. */
  substitutabilityFlag: z.string().nullable(),
  confidence: share,
  signals: signalBreakdownSchema,
});
export type CharacterRow = z.infer<typeof characterRowSchema>;

export const franchiseRowSchema = z.object({
  id: z.string(),
  canonicalName: z.string(),
  medium: mediumSchema,
  status: franchiseStatusSchema,
  firstRelease: z.string().nullable(),
  rosterSize: z.number().int(),
  rosterComplete: share,
  /** Null when rosterComplete is below the display floor. Suppressed, not greyed. */
  fragility: z.number().nullable(),
  hhi: share.nullable(),
  top1Share: share.nullable(),
  top3Share: share.nullable(),
  topCharacter: z.object({ id: z.string(), canonicalName: z.string() }).nullable(),
  exitEventCount: z.number().int(),
  scoredOn: z.string().nullable(),
  modelVersion: z.string(),
});
export type FranchiseRow = z.infer<typeof franchiseRowSchema>;

export const franchiseDetailSchema = franchiseRowSchema.extend({
  aliases: z.array(z.string()),
  wikiTitle: z.string().nullable(),
  primarySubs: z.array(z.string()),
  characters: z.array(characterRowSchema),
  releases: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      seasonNo: z.number().int().nullable(),
      releasedOn: z.string(),
    }),
  ),
  exitEvents: z.array(
    z.object({
      id: z.string(),
      exitType: exitTypeSchema,
      eventDate: z.string(),
      announcedDate: z.string().nullable(),
      characterName: z.string().nullable(),
      personName: z.string().nullable(),
      verified: z.boolean(),
      sourceUrl: z.string(),
      didEstimate: z.number().nullable(),
      preCarryScore: z.number().nullable(),
    }),
  ),
});
export type FranchiseDetail = z.infer<typeof franchiseDetailSchema>;

export const signalPointSchema = z.object({
  measuredOn: z.string(),
  rawValue: z.number(),
  isOffCycle: z.boolean(),
});

export const characterDetailSchema = characterRowSchema.extend({
  franchise: z.object({ id: z.string(), canonicalName: z.string() }),
  aliases: z.array(z.string()),
  wikiTitle: z.string().nullable(),
  firstSeenAt: z.string().nullable(),
  lastSeenAt: z.string().nullable(),
  rankInFranchise: z.number().int(),
  series: z.array(signalPointSchema),
  /** Per-signal contribution to the blended carry score, for the audit panel. */
  attribution: z.array(
    z.object({
      source: signalSourceSchema,
      share: share.nullable(),
      weight: z.number(),
      contribution: z.number(),
      observationCount: z.number().int(),
    }),
  ),
});
export type CharacterDetail = z.infer<typeof characterDetailSchema>;

export const rankIcSchema = z.object({
  coefficient: z.number().nullable(),
  lower: z.number().nullable(),
  upper: z.number().nullable(),
  pairs: z.number().int(),
  reason: z.string().nullable(),
});
export type RankIc = z.infer<typeof rankIcSchema>;

/** One slice of the exit corpus, reported next to the headline. */
export const stratumSchema = z.object({
  name: z.string(),
  events: z.number().int(),
  meanDid: z.number().nullable(),
  stdError: z.number().nullable(),
  rankIC: rankIcSchema,
});
export type Stratum = z.infer<typeof stratumSchema>;

export const stratumComparisonSchema = z.object({
  stratum: z.string(),
  against: z.string(),
  difference: z.number().nullable(),
  zScore: z.number().nullable(),
  /** Null when either side has too few events for a standard error. */
  diverges: z.boolean().nullable(),
});
export type StratumComparison = z.infer<typeof stratumComparisonSchema>;

/** Held-out comparison of the wiki + search blend against wiki alone. */
export const blendResultSchema = z.object({
  verdict: z.enum(["BLEND", "WIKI_ONLY", "INCONCLUSIVE"]),
  wikiWeight: z.number().nullable(),
  trainPairs: z.number().int(),
  heldOutPairs: z.number().int(),
  blendRankIC: rankIcSchema.nullable(),
  wikiRankIC: rankIcSchema.nullable(),
  reason: z.string().nullable(),
});
export type BlendResult = z.infer<typeof blendResultSchema>;

export const validationReportSchema = z.object({
  modelVersion: z.string(),
  runAt: z.string().nullable(),
  eventCount: z.number().int(),
  verifiedEventCount: z.number().int(),
  rankIC: z.number().nullable(),
  rankICLower: z.number().nullable(),
  rankICUpper: z.number().nullable(),
  baselineRankIC: z.number().nullable(),
  baselineLower: z.number().nullable(),
  baselineUpper: z.number().nullable(),
  medianRosterComplete: z.number().nullable(),
  /** PASS, FAIL or BLOCKED. BLOCKED means the test was not run; preconditions unmet. */
  gate: z.enum(["PASS", "FAIL", "BLOCKED"]),
  failures: z.array(z.object({ criterion: z.string(), detail: z.string() })),
  strata: z.array(stratumSchema),
  comparisons: z.array(stratumComparisonSchema),
  blend: blendResultSchema.nullable(),
});
export type ValidationReport = z.infer<typeof validationReportSchema>;

export const exitSimulationSchema = z.object({
  franchiseId: z.string(),
  characterId: z.string(),
  removedCarryScore: z.number(),
  hhiBefore: z.number(),
  hhiAfter: z.number(),
  top1Before: z.number(),
  top1After: z.number(),
  absorbers: z.array(
    z.object({ characterId: z.string(), canonicalName: z.string(), delta: z.number() }),
  ),
  /** Null when the event corpus has too few comparable events to support a projection. */
  projectedDecline: z
    .object({
      pointEstimate: z.number(),
      lower: z.number(),
      upper: z.number(),
      comparableEvents: z.number().int(),
      basis: z.string(),
    })
    .nullable(),
});
export type ExitSimulation = z.infer<typeof exitSimulationSchema>;

export const screenerQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  medium: mediumSchema.optional(),
  status: franchiseStatusSchema.optional(),
  minRosterComplete: z.coerce.number().min(0).max(1).optional(),
  sort: z.enum(["fragility", "hhi", "top1Share", "rosterSize", "name"]).default("fragility"),
  order: z.enum(["asc", "desc"]).default("desc"),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.coerce.number().int().min(0).default(0),
});
export type ScreenerQuery = z.infer<typeof screenerQuerySchema>;

export const screenerResponseSchema = z.object({
  rows: z.array(franchiseRowSchema),
  nextCursor: z.number().int().nullable(),
  total: z.number().int(),
});
export type ScreenerResponse = z.infer<typeof screenerResponseSchema>;

export const validationResponseSchema = validationReportSchema.extend({
  killCriteria: z.record(z.number()),
});
export type ValidationResponse = z.infer<typeof validationResponseSchema>;

/** One stored AttentionSignal row, exactly as ingested. The audit trail behind every number. */
export const signalRowSchema = z.object({
  measuredOn: z.string(),
  source: signalSourceSchema,
  rawValue: z.number(),
  isOffCycle: z.boolean(),
  confidence: share,
});
export type SignalRow = z.infer<typeof signalRowSchema>;

export const signalRowsQuerySchema = z.object({
  source: signalSourceSchema.optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  cursor: z.coerce.number().int().min(0).default(0),
});
export type SignalRowsQuery = z.infer<typeof signalRowsQuerySchema>;

export const signalRowsResponseSchema = z.object({
  characterId: z.string(),
  rows: z.array(signalRowSchema),
  nextCursor: z.number().int().nullable(),
  total: z.number().int(),
});
export type SignalRowsResponse = z.infer<typeof signalRowsResponseSchema>;

/** One event study, for the validation scatter: pre-exit carry against realised decline. */
export const eventStudyRowSchema = z.object({
  exitEventId: z.string(),
  franchiseId: z.string(),
  franchiseName: z.string(),
  characterId: z.string().nullable(),
  characterName: z.string().nullable(),
  eventDate: z.string(),
  preCarryScore: z.number().nullable(),
  didEstimate: z.number(),
  stdError: z.number(),
  baselineRank: z.number().int().nullable(),
  announced: z.boolean(),
});
export type EventStudyRow = z.infer<typeof eventStudyRowSchema>;
export const eventStudiesResponseSchema = z.array(eventStudyRowSchema);

/**
 * Read-only dataset for Vantage. One row per franchise and per scored character.
 * Every score travels with its confidence fields; a suppressed score is null.
 */
export const vantageFranchiseSchema = z.object({
  id: z.string(),
  name: z.string(),
  medium: mediumSchema,
  status: franchiseStatusSchema,
  rosterSize: z.number().int(),
  rosterComplete: share,
  /** Null below the roster coverage floor. */
  fragility: z.number().nullable(),
  hhi: share.nullable(),
  top1Share: share.nullable(),
  top3Share: share.nullable(),
  scoredOn: z.string().nullable(),
});
export type VantageFranchise = z.infer<typeof vantageFranchiseSchema>;

export const vantageCharacterSchema = z.object({
  id: z.string(),
  franchiseId: z.string(),
  name: z.string(),
  status: characterStatusSchema,
  carryScore: share,
  confidence: share,
  offCycleCarry: share.nullable(),
  durabilityRatio: z.number().nullable(),
  substitutability: share.nullable(),
  substitutabilityFlag: z.string().nullable(),
});
export type VantageCharacter = z.infer<typeof vantageCharacterSchema>;

export const vantageCreatorSchema = z.object({
  personId: z.string(),
  name: z.string(),
  residual: z.number(),
  projectCount: z.number().int(),
  confidence: share,
});
export type VantageCreator = z.infer<typeof vantageCreatorSchema>;

export const vantageSectorSchema = z.object({
  sector: z.literal("entertainment_franchises"),
  modelVersion: z.string(),
  generatedAt: z.string(),
  /** The validation gate for this model version. Consumers decide what a FAIL means for them. */
  gate: z.enum(["PASS", "FAIL", "BLOCKED"]),
  rankIC: z.number().nullable(),
  signalBlend: z.enum(["BLEND", "WIKI_ONLY", "INCONCLUSIVE"]).nullable(),
  franchises: z.array(vantageFranchiseSchema),
  characters: z.array(vantageCharacterSchema),
  creators: z.array(vantageCreatorSchema),
});
export type VantageSector = z.infer<typeof vantageSectorSchema>;

export const roleTypeSchema = z.enum([
  "ACTOR",
  "WRITER",
  "DIRECTOR",
  "SHOWRUNNER",
  "ARTIST",
  "CREATOR",
  "ATHLETE",
]);

/** Header search. Short queries match too much to be useful. */
export const searchQuerySchema = z.object({
  q: z.string().trim().min(2).max(80),
});
export type SearchQuery = z.infer<typeof searchQuerySchema>;

export const searchResponseSchema = z.object({
  franchises: z.array(
    z.object({ id: z.string(), canonicalName: z.string(), medium: mediumSchema }),
  ),
  characters: z.array(
    z.object({
      id: z.string(),
      canonicalName: z.string(),
      franchiseId: z.string(),
      franchiseName: z.string(),
    }),
  ),
});
export type SearchResponse = z.infer<typeof searchResponseSchema>;

/**
 * One measured character in a franchise above the roster coverage floor.
 * Carry is a share of its own franchise, so the row always names the franchise
 * and carries both confidence fields.
 */
export const leaderRowSchema = z.object({
  id: z.string(),
  canonicalName: z.string(),
  status: characterStatusSchema,
  portrayedBy: z.string().nullable(),
  franchise: z.object({ id: z.string(), canonicalName: z.string() }),
  rosterComplete: share,
  carryScore: share,
  confidence: share,
  offCycleCarry: share.nullable(),
  durabilityRatio: z.number().nullable(),
});
export type LeaderRow = z.infer<typeof leaderRowSchema>;

export const leadersQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  sort: z.enum(["carryScore", "offCycleCarry", "durabilityRatio"]).default("carryScore"),
  order: z.enum(["asc", "desc"]).default("desc"),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.coerce.number().int().min(0).default(0),
});
export type LeadersQuery = z.infer<typeof leadersQuerySchema>;

export const leadersResponseSchema = z.object({
  rows: z.array(leaderRowSchema),
  nextCursor: z.number().int().nullable(),
  total: z.number().int(),
});
export type LeadersResponse = z.infer<typeof leadersResponseSchema>;

export const creatorRowSchema = z.object({
  personId: z.string(),
  name: z.string(),
  roles: z.array(roleTypeSchema),
  /** Distinct franchises this person is credited on. */
  franchiseCount: z.number().int(),
  /** Credits on a finished franchise or a departed character. An upper bound on scoreable projects. */
  completedCount: z.number().int(),
  franchises: z.array(z.object({ id: z.string(), canonicalName: z.string() })),
  /** Null below the minimum project count. Suppressed, never imputed. */
  score: z
    .object({ residual: z.number(), projectCount: z.number().int(), confidence: share })
    .nullable(),
});
export type CreatorRow = z.infer<typeof creatorRowSchema>;

export const creatorsQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.coerce.number().int().min(0).default(0),
});
export type CreatorsQuery = z.infer<typeof creatorsQuerySchema>;

export const creatorsResponseSchema = z.object({
  rows: z.array(creatorRowSchema),
  nextCursor: z.number().int().nullable(),
  total: z.number().int(),
  scoredTotal: z.number().int(),
});
export type CreatorsResponse = z.infer<typeof creatorsResponseSchema>;
