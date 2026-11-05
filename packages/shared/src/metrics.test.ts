import { describe, expect, it } from "vitest";
import golden from "../../../data/fixtures/metrics_golden.json" with { type: "json" };
import {
  carryScore,
  fragility,
  fragilityBand,
  hhi,
  simulateRemoval,
  toShares,
  topNShare,
} from "./index.js";

const close = (actual: number, expected: number) => expect(actual).toBeCloseTo(expected, 10);

describe("toShares", () => {
  for (const testCase of golden.toShares) {
    it(`normalises ${JSON.stringify(testCase.raw)}`, () => {
      const result = toShares(testCase.raw);
      expect(result).toHaveLength(testCase.shares.length);
      result.forEach((value, index) => close(value, testCase.shares[index] as number));
    });
  }

  it("clamps negative raw values to zero", () => {
    expect(toShares([-5, 5])).toEqual([0, 1]);
  });
});

describe("hhi and topNShare", () => {
  for (const testCase of golden.hhi) {
    it(`scores ${JSON.stringify(testCase.carryScores)}`, () => {
      close(hhi(testCase.carryScores), testCase.hhi);
      close(topNShare(testCase.carryScores, 1), testCase.top1Share);
      close(topNShare(testCase.carryScores, 3), testCase.top3Share);
    });
  }
});

describe("carryScore", () => {
  for (const testCase of golden.carryScore) {
    it(testCase.label, () => {
      close(carryScore(testCase.shares), testCase.carryScore);
    });
  }

  it("returns zero when every signal is missing", () => {
    expect(
      carryScore({
        wikiShare: Number.NaN,
        fanworkShare: null,
        searchShare: null,
        discourseShare: null,
      }),
    ).toBe(0);
  });
});

describe("fragility", () => {
  for (const testCase of golden.fragility) {
    it(testCase.label, () => {
      close(fragility(testCase.input, testCase.population), testCase.fragility);
    });
  }
});

describe("simulateRemoval", () => {
  for (const testCase of golden.simulateRemoval) {
    it(`removes index ${testCase.removeIndex}`, () => {
      const result = simulateRemoval(testCase.carryScores, testCase.removeIndex);
      close(result.hhi, testCase.hhi);
      close(result.top1Share, testCase.top1Share);
      result.remaining.forEach((value, index) => close(value, testCase.remaining[index] as number));
    });
  }
});

describe("fragilityBand", () => {
  it("maps the scale onto named bands", () => {
    expect(fragilityBand(-2).id).toBe("ensemble");
    expect(fragilityBand(0).id).toBe("balanced");
    expect(fragilityBand(0.8).id).toBe("concentrated");
    expect(fragilityBand(2.5).id).toBe("load-bearing");
  });
});
