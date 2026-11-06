import { describe, expect, it } from "vitest";
import { csvCell, toCsv } from "./csv.js";

describe("csvCell", () => {
  it("leaves plain text alone", () => {
    expect(csvCell("Breaking Bad")).toBe("Breaking Bad");
  });

  it("quotes commas, quotes and line breaks", () => {
    expect(csvCell('Law & Order, "SVU"')).toBe('"Law & Order, ""SVU"""');
    expect(csvCell("a\nb")).toBe('"a\nb"');
  });

  it("neutralises text that would start a formula", () => {
    expect(csvCell("=SUM(A1)")).toBe("'=SUM(A1)");
    expect(csvCell("+1")).toBe("'+1");
    expect(csvCell("-1")).toBe("'-1");
    expect(csvCell("@cmd")).toBe("'@cmd");
  });

  it("keeps negative numbers numeric", () => {
    expect(csvCell(-0.45)).toBe("-0.45");
  });

  it("writes null as an empty cell", () => {
    expect(csvCell(null)).toBe("");
  });
});

describe("toCsv", () => {
  it("joins the header and rows with CRLF", () => {
    expect(toCsv(["Name", "Share"], [["A", 0.5], ["B", null]])).toBe("Name,Share\r\nA,0.5\r\nB,\r\n");
  });
});
