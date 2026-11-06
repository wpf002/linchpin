import { describe, expect, it } from "vitest";
import { KILL_CRITERIA } from "@linchpin/shared";
import { likePattern, toCreatorScore } from "../src/lib/directory.js";

describe("likePattern", () => {
  it("wraps a plain term for a contains match", () => {
    expect(likePattern("grey", "contains")).toBe("%grey%");
  });

  it("anchors a prefix match", () => {
    expect(likePattern("grey", "prefix")).toBe("grey%");
  });

  it("escapes LIKE wildcards so they match themselves", () => {
    expect(likePattern("100%_a\\b", "contains")).toBe("%100\\%\\_a\\\\b%");
  });
});

describe("toCreatorScore", () => {
  const minimum = KILL_CRITERIA.minCreatorProjects;

  it("returns the score at the project minimum", () => {
    expect(toCreatorScore({ residual: 0.4, projectCount: minimum, confidence: 0.5 })).toEqual({
      residual: 0.4,
      projectCount: minimum,
      confidence: 0.5,
    });
  });

  it("suppresses a score below the project minimum", () => {
    expect(toCreatorScore({ residual: 0.4, projectCount: minimum - 1, confidence: 0.5 })).toBeNull();
  });

  it("suppresses when no score row exists", () => {
    expect(toCreatorScore({ residual: null, projectCount: null, confidence: null })).toBeNull();
  });
});
