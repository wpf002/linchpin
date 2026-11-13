import { describe, expect, it } from "vitest";
import { changeInWords, confidenceLevel, rankLabel, stayingPower } from "../words";

describe("changeInWords", () => {
  it("reads small moves as up or down", () => {
    expect(changeInWords(Math.log(0.88))).toBe("Views Down");
    expect(changeInWords(Math.log(1.2))).toBe("Views Up");
  });

  it("reads a doubling or halving as way up or down", () => {
    expect(changeInWords(Math.log(66))).toBe("Views Way Up");
    expect(changeInWords(Math.log(2))).toBe("Views Way Up");
    expect(changeInWords(Math.log(0.5))).toBe("Views Way Down");
  });

  it("calls a move under 5% no change", () => {
    expect(changeInWords(Math.log(1.04))).toBe("No Change");
    expect(changeInWords(0)).toBe("No Change");
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

describe("rankLabel", () => {
  it("names the lead, main cast and supporting cast", () => {
    expect(rankLabel(1)).toBe("Lead");
    expect(rankLabel(3)).toBe("Main Cast");
    expect(rankLabel(4)).toBe("Supporting");
  });
});

describe("stayingPower", () => {
  it("bands the ratio", () => {
    expect(stayingPower(1.2)).toBe("Grows Off-Season");
    expect(stayingPower(1)).toBe("Holds Off-Season");
    expect(stayingPower(0.8)).toBe("Fades Off-Season");
  });
});
