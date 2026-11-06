import type { BlendResult, RankIc, Stratum, StratumComparison } from "@linchpin/shared";
import { z } from "zod";

/**
 * ValidationRun.strata and ValidationRun.blend are JSON columns written by the
 * scoring service in snake_case. They are parsed here, at the boundary, so a
 * shape change fails loudly instead of rendering as blanks.
 */

const storedRankIc = z.object({
  coefficient: z.number().nullable(),
  lower: z.number().nullable(),
  upper: z.number().nullable(),
  pairs: z.number().int(),
  reason: z.string().nullable(),
});

const storedStrata = z.object({
  strata: z.array(
    z.object({
      name: z.string(),
      events: z.number().int(),
      mean_did: z.number().nullable(),
      std_error: z.number().nullable(),
      rank_ic: storedRankIc,
    }),
  ),
  comparisons: z.array(
    z.object({
      stratum: z.string(),
      against: z.string(),
      difference: z.number().nullable(),
      z_score: z.number().nullable(),
      diverges: z.boolean().nullable(),
    }),
  ),
});

const storedBlend = z.object({
  verdict: z.enum(["BLEND", "WIKI_ONLY", "INCONCLUSIVE"]),
  wiki_weight: z.number().nullable(),
  train_pairs: z.number().int(),
  held_out_pairs: z.number().int(),
  blend_rank_ic: storedRankIc.nullable(),
  wiki_rank_ic: storedRankIc.nullable(),
  reason: z.string().nullable(),
});

export interface ParsedStrata {
  strata: Stratum[];
  comparisons: StratumComparison[];
}

function parseColumn<Output>(column: string, schema: z.ZodType<Output>, raw: unknown): Output {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`ValidationRun.${column} has an unexpected shape: ${parsed.error.message}`);
  }
  return parsed.data;
}

/** Runs recorded before v0.2.0 have no strata column. */
export function parseStrata(raw: unknown): ParsedStrata {
  if (raw === null || raw === undefined) return { strata: [], comparisons: [] };
  const stored = parseColumn("strata", storedStrata, raw);
  return {
    strata: stored.strata.map((row) => ({
      name: row.name,
      events: row.events,
      meanDid: row.mean_did,
      stdError: row.std_error,
      rankIC: row.rank_ic satisfies RankIc,
    })),
    comparisons: stored.comparisons.map((row) => ({
      stratum: row.stratum,
      against: row.against,
      difference: row.difference,
      zScore: row.z_score,
      diverges: row.diverges,
    })),
  };
}

export function parseBlend(raw: unknown): BlendResult | null {
  if (raw === null || raw === undefined) return null;
  const stored = parseColumn("blend", storedBlend, raw);
  return {
    verdict: stored.verdict,
    wikiWeight: stored.wiki_weight,
    trainPairs: stored.train_pairs,
    heldOutPairs: stored.held_out_pairs,
    blendRankIC: stored.blend_rank_ic,
    wikiRankIC: stored.wiki_rank_ic,
    reason: stored.reason,
  };
}
