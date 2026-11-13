import { describe, expect, it } from "vitest";
import { EM_DASH, formatDate, formatPercent, formatSigned, formatYear, label } from "../format";
import { FRAGILITY_DOMAIN, domainPosition } from "../fragility";

describe("number formatting", () => {
  it("returns a dash for missing values", () => {
    expect(formatPercent(null)).toBe(EM_DASH);
    expect(formatSigned(undefined)).toBe(EM_DASH);
    expect(formatDate(null)).toBe(EM_DASH);
    expect(formatYear("")).toBe(EM_DASH);
  });

  it("formats percents and signs", () => {
    expect(formatPercent(0.1234)).toBe("12.3%");
    expect(formatPercent(0.5, 0)).toBe("50%");
    expect(formatSigned(1.234)).toBe("+1.23");
    expect(formatSigned(-1.234)).toBe("−1.23");
    expect(formatSigned(0)).toBe("0.00");
  });

  it("reads a log change as a percent change", () => {
  });
});

describe("dates", () => {
  it("formats in UTC regardless of local zone", () => {
    expect(formatDate("2024-01-01")).toBe("Jan 1, 2024");
    expect(formatDate("2024-01-01T23:59:00Z")).toBe("Jan 1, 2024");
    expect(formatYear("2019-05-19")).toBe("2019");
  });
});

describe("label", () => {
  it("uses known labels and title-cases the rest", () => {
    expect(label("TV")).toBe("TV");
    expect(label("WIKI")).toBe("Wikipedia");
    expect(label("CHARACTER_DEATH")).toBe("Character Death");
  });
});

describe("domainPosition", () => {
  it("clamps to the display domain", () => {
    expect(domainPosition(FRAGILITY_DOMAIN.min - 5)).toBe(0);
    expect(domainPosition(FRAGILITY_DOMAIN.max + 5)).toBe(1);
  });
});
