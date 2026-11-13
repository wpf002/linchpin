import { describe, expect, it } from "vitest";
import {
  castTracked,
  changeInWords,
  confidenceLevel,
  rankLabel,
  stayingPower,
} from "../words";

describe("changeInWords", () => {
  it("reads falls and small rises as percents", () => {
    expect(changeInWords(Math.log(0.88))).toBe("−12%");
    expect(changeInWords(Math.log(1.04))).toBe("+4%");
  });

  it("reads large rises as multiples", () => {
    expect(changeInWords(Math.log(66))).toBe("+66x");
    expect(changeInWords(Math.log(3))).toBe("+3x");
  });

  it("calls a change that rounds to zero 0%", () => {
    expect(changeInWords(-0.001)).toBe("0%");
    expect(changeInWords(0)).toBe("0%");
  });
});

describe("confidenceLevel", () => {
  it("splits at the floors", () => {
    expect(confidenceLevel(0.75)).toBe("high");
    expect(confidenceLevel(0.74)).toBe("medium");
    expect(confidenceLevel(0.4)).toBe("medium");
    expect(confidenceLevel(0.39)).toBe("low");
  });
});

describe("castTracked", () => {
  it("rounds the tracked count", () => {
    expect(castTracked(0.5, 9)).toBe("Cast Tracked 5 of 9");
  });
});

describe("rankLabel", () => {
  it("calls rank 1 the lead", () => {
    expect(rankLabel(1)).toBe("Lead");
    expect(rankLabel(3)).toBe("No. 3");
  });
});

describe("stayingPower", () => {
  it("bands the ratio", () => {
    expect(stayingPower(1.2)).toBe("Up Off-Season");
    expect(stayingPower(1)).toBe("Steady Off-Season");
    expect(stayingPower(0.8)).toBe("Down Off-Season");
  });
});
