import { describe, expect, it } from "vitest";
import { screenerQuerySchema } from "@linchpin/shared";
import { BadRequestError } from "../src/lib/errors.js";
import { parseOrBadRequest } from "../src/lib/validate.js";

describe("parseOrBadRequest", () => {
  it("applies screener defaults", () => {
    const query = parseOrBadRequest(screenerQuerySchema, {});
    expect(query).toMatchObject({ sort: "fragility", order: "desc", limit: 50, cursor: 0 });
  });

  it("rejects an unknown sort with a BadRequestError naming the field", () => {
    expect(() => parseOrBadRequest(screenerQuerySchema, { sort: "popularity" })).toThrowError(
      BadRequestError,
    );
    expect(() => parseOrBadRequest(screenerQuerySchema, { sort: "popularity" })).toThrowError(/sort/);
  });
});
