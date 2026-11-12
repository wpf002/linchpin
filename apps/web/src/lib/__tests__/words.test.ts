import { describe, expect, it } from "vitest";
import {
  castSentence,
  castTracked,
  changeInWords,
  characterSentence,
  confidenceLevel,
  shareInWords,
  stayingPower,
  versusBilling,
} from "../words";

describe("changeInWords", () => {
  it("reads falls and small rises as percents", () => {
    expect(changeInWords(Math.log(0.88))).toBe("fell about 12%");
    expect(changeInWords(Math.log(1.04))).toBe("rose about 4%");
  });

  it("reads large rises as multiples", () => {
    expect(changeInWords(Math.log(66))).toBe("rose about 66x");
    expect(changeInWords(Math.log(3))).toBe("rose about 3x");
  });

  it("calls a change that rounds to zero flat", () => {
    expect(changeInWords(-0.001)).toBe("held flat");
    expect(changeInWords(0)).toBe("held flat");
  });
});

describe("shareInWords", () => {
  it("picks the phrase at each lower bound", () => {
    expect(shareInWords(0.9)).toBe("almost all");
    expect(shareInWords(0.5)).toBe("about half");
    expect(shareInWords(0.08)).toBe("about a tenth");
    expect(shareInWords(0.05)).toBe("under a tenth");
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

describe("castSentence", () => {
  it("names the lead for each band", () => {
    expect(castSentence("load-bearing", ["Walter White"])).toBe("Walter White is the show.");
    expect(castSentence("balanced", ["Ann", "Ben"])).toBe("Ann leads, with Ben close behind.");
    expect(castSentence("ensemble", ["Ann"])).toBe("Ann leads.");
  });

  it("is empty with no names", () => {
    expect(castSentence("concentrated", [])).toBe("");
  });
});

describe("castTracked", () => {
  it("rounds the tracked count", () => {
    expect(castTracked(0.5, 9)).toBe("Cast Tracked 5 of 9");
  });
});

describe("characterSentence", () => {
  it("states share and rank", () => {
    expect(characterSentence(0.5, "Firefly", 1)).toBe("Draws about half of the attention on Firefly. Leads the cast.");
    expect(characterSentence(0.1, "Firefly", 3)).toBe(
      "Draws about a tenth of the attention on Firefly. Number 3 in the cast.",
    );
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
