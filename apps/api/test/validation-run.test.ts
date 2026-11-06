import { describe, expect, it } from "vitest";
import { parseBlend, parseStrata } from "../src/lib/validation-run.js";

const rankIc = { coefficient: 0.2, lower: -0.1, upper: 0.5, pairs: 14, reason: null };

describe("parseStrata", () => {
  it("returns empty lists for runs recorded before the column existed", () => {
    expect(parseStrata(null)).toEqual({ strata: [], comparisons: [] });
  });

  it("maps the stored snake_case rows to the contract", () => {
    const parsed = parseStrata({
      strata: [{ name: "UNANNOUNCED", events: 14, mean_did: -0.2, std_error: 0.05, rank_ic: rankIc }],
      comparisons: [
        { stratum: "ANNOUNCED", against: "UNANNOUNCED", difference: 0.1, z_score: 1.2, diverges: false },
      ],
    });
    expect(parsed.strata[0]).toEqual({
      name: "UNANNOUNCED",
      events: 14,
      meanDid: -0.2,
      stdError: 0.05,
      rankIC: rankIc,
    });
    expect(parsed.comparisons[0]?.zScore).toBe(1.2);
  });

  it("throws on an unexpected shape instead of rendering blanks", () => {
    expect(() => parseStrata({ strata: "nope" })).toThrow(/ValidationRun.strata/);
  });
});

describe("parseBlend", () => {
  it("is null when no blend was recorded", () => {
    expect(parseBlend(null)).toBeNull();
  });

  it("keeps an inconclusive verdict and its reason", () => {
    const parsed = parseBlend({
      verdict: "INCONCLUSIVE",
      wiki_weight: null,
      train_pairs: 3,
      held_out_pairs: 2,
      blend_rank_ic: null,
      wiki_rank_ic: null,
      reason: "too few events with both shares",
    });
    expect(parsed).toMatchObject({ verdict: "INCONCLUSIVE", trainPairs: 3, heldOutPairs: 2 });
  });
});
