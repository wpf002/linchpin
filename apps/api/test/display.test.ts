import { describe, expect, it } from "vitest";
import { ROSTER_COMPLETE_DISPLAY_FLOOR } from "@linchpin/shared";
import { applyDisplayFloor } from "../src/lib/display.js";

const figures = { fragility: 1.4, hhi: 0.42, top1Share: 0.6, top3Share: 0.9 };

describe("applyDisplayFloor", () => {
  it("returns figures unchanged at the floor", () => {
    expect(applyDisplayFloor(ROSTER_COMPLETE_DISPLAY_FLOOR, figures)).toEqual(figures);
  });

  it("nulls every concentration figure below the floor", () => {
    expect(applyDisplayFloor(ROSTER_COMPLETE_DISPLAY_FLOOR - 0.01, figures)).toEqual({
      fragility: null,
      hhi: null,
      top1Share: null,
      top3Share: null,
    });
  });
});
