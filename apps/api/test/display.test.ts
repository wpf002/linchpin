import { describe, expect, it } from "vitest";
import { ROSTER_COMPLETE_DISPLAY_FLOOR } from "@linchpin/shared";
import { applyDisplayFloor, withholdCastShares } from "../src/lib/display.js";

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

describe("withholdCastShares", () => {
  const cast = [
    { id: "a", canonicalName: "Lead", imageUrl: "https://static.tvmaze.com/a.jpg", share: 0.6 },
    { id: "b", canonicalName: "Second", imageUrl: null, share: 0.2 },
  ];

  it("keeps shares at the floor", () => {
    expect(withholdCastShares(ROSTER_COMPLETE_DISPLAY_FLOOR, cast)).toEqual(cast);
  });

  it("keeps the faces and nulls every share below the floor", () => {
    expect(withholdCastShares(ROSTER_COMPLETE_DISPLAY_FLOOR - 0.01, cast)).toEqual([
      { ...cast[0], share: null },
      { ...cast[1], share: null },
    ]);
  });
});
