import { describe, expect, it } from "vitest";
import {
  castTracked,
  changeInWords,
  confidenceLevel,
  rankLabel,
  stayingPower,
  versusBilling,
} from "../words";

describe("changeInWords", () => {
  it("reads falls and small rises as percents", () => {
    expect(changeInWords(Math.log(0.88))).toBe("Down 12%");
    expect(changeInWords(Math.log(1.04))).toBe("Up 4%");
  });

  it("reads large rises as multiples", () => {
    expect(changeInWords(Math.log(66))).toBe("Up 66x");
    expect(changeInWords(Math.log(3))).toBe("Up 3x");
  });

  it("calls a change that rounds to zero flat", () => {
    expect(changeInWords(-0.001)).toBe("Flat");
    expect(changeInWords(0)).toBe("Flat");
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

describe("stayingPower and versusBilling", () => {
  it("bands the ratio and residual", () => {
    expect(stayingPower(1.2)).toBe("Grows Between Releases");
    expect(stayingPower(1)).toBe("Holds Between Releases");
    expect(stayingPower(0.8)).toBe("Fades Between Releases");
    expect(versusBilling(0.05)).toBe("Outdraws Billing");
    expect(versusBilling(0)).toBe("Matches Billing");
    expect(versusBilling(-0.05)).toBe("Trails Billing");
  });
});
